#!/usr/bin/env node
/**
 * eval-rerank.js — 量測 LLM rerank 對工具選用的增益
 *
 * 流程：詞彙引擎（agent-retrieval）召回 top-K → LLM 從候選中選最佳 → 比較 Hit@1
 *
 * 兩種模式
 * ────────
 * 1. 一般模式（預設）：單一路徑量測。
 * 2. **配對模式（--paired）**：同一筆查詢跑兩次（V5 開／關），
 *    並依題號**交替先後順序**。這是唯一能消除「配額遞減順序效應」的設計。
 *
 * 🔴 為什麼需要配對模式
 * ─────────────────────
 * 2026-09-20 實測踩到：先跑三輪 A 再跑一輪 B，B 的數字會被嚴重低估。
 * 原因是 API 配額隨時間遞減，後跑的失敗數變多（成功呼叫 153 vs 156~158），
 * 而失敗時 rerank 會被略過、退回融合排序，分數自然偏低。
 * 這是本專案第三次栽在「順序效應」上（前兩次見 HANDOFF 與 DEV_LOG）。
 *
 * 配對模式用 McNemar 檢定：只看「兩邊結果不一致」的題目
 * （onOnly / offOnly），在虛無假設下它們應各佔一半。
 *
 * 用法
 * ────
 *   AGNES_API_KEY=sk-... npm run eval:rerank
 *   AGNES_API_KEY=sk-... node scripts/eval-rerank.js --paired        # 配對 A/B
 *   AGNES_API_KEY=sk-... node scripts/eval-rerank.js --topK=50       # 對齊上線
 *   node scripts/eval-rerank.js --verbose          # 列出未命中明細
 *   node scripts/eval-rerank.js                    # 無 key：只跑 baseline（離線安全）
 *
 * ⚠️ topK 預設 20，但上線的 retrieval-fusion.js 用 recallK=50。
 *    要量「實際上線表現」請明確加 --topK=50（成本約 2.5 倍）。
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { agentRetrieve } from '../core/agent-retrieval.js';
import { extractIntent, weightsForIntent } from '../core/query-intent.js';
import { loadWikiCached } from '../core/wiki-matcher.js';
import { rerankCandidates, buildCandidateText } from '../core/llm-rerank.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const bench = JSON.parse(readFileSync(path.join(ROOT, 'registry', 'eval-queries.json'), 'utf8'));
const reg = JSON.parse(readFileSync(path.join(ROOT, 'registry', 'tools.json'), 'utf8'));
const tools = reg.tools.filter((t) => t.status === 'active' || t.status === 'experimental');
const cases = bench.cases.filter((c) => c.type !== 'empty-set');

const args = process.argv.slice(2);
const K = Number(args.find((a) => a.startsWith('--topK='))?.split('=')[1]) || 20;
const MODEL = args.find((a) => a.startsWith('--model='))?.split('=')[1] || undefined;
const verbose = args.includes('--verbose');
// 併發數。🔴 預設 1（序列），不要輕易調高——實測踩過一次：
//
//   --concurrency=3（真實 prompt：50 候選 × 550 字 ≈ 2 萬字）
//     → 成功呼叫 67/159（58% 失敗），rerank Hit@1 掉到 36.5%
//     → 失敗時 rerank 被略過、退回融合排序，所以數字會「看起來像真的」但全廢
//
//   scripts/llm-throughput.js 併發 4 卻是 0 次 429 —— 因為它打的是極短請求。
//   → 限制是 **TPM（每分鐘 token 數）**，不是併發數、也不是請求數。
//     小 prompt 測不出來，真實 payload 才會爆。
//
// 想加速的正確做法是**加金鑰**（把 TPM 額度乘以金鑰數），
// 而不是在單一帳號上開併發。用 AGNES_API_KEYS=k1,k2,... 設定，
// 並用 scripts/llm-throughput.js 驗證是否等比例上升。
const CONCURRENCY = Number(args.find((a) => a.startsWith('--concurrency='))?.split('=')[1]) || 1;
const PAIRED = args.includes('--paired');
// --variant=wiki（預設）：比較知識詞檔開／關
// --variant=intents：候選名單相同，只比較提示詞有沒有「使用者情境」詞條
const VARIANT = args.find((a) => a.startsWith('--variant='))?.split('=')[1] || 'wiki';
const MODEL_A = args.find((a) => a.startsWith('--modelA='))?.split('=')[1] || 'agnes-3.0-flash';
const MODEL_B = args.find((a) => a.startsWith('--modelB='))?.split('=')[1] || 'agnes-2.5-flash';
const K_A = Number(args.find((a) => a.startsWith('--ka='))?.split('=')[1]) || 30;
const K_B = Number(args.find((a) => a.startsWith('--kb='))?.split('=')[1]) || 50;
const LIMIT = Number(args.find((a) => a.startsWith('--limit='))?.split('=')[1]) || Infinity;

// 與正式路徑（retrieval-fusion.js）共用同一份候選描述產生邏輯，
// 否則評測數字會與實際上線行為脫節。（真正的定義在下方，因為它需要用到
// WIKI 才能支援 --variant=intents。）

const hasKey = Boolean(process.env.AGNES_API_KEY);
const WIKI = loadWikiCached();

// 候選描述＝「基本 metadata」＋（可選）知識編譯詞條的 intents。
// intents 是「使用者會怎麼開口」的具體情境句，理論上最能幫 LLM 判斷
// 這支工具是不是使用者要的——這是針對「rerank 挑選力」瓶頸的直接介入。
//
// 截斷上限統一拉到 550：intents 臂若不拉高，新增內容會被截掉，
// 變成同時改了兩個變因。實測基本描述多數在 200 字內，
// 所以拉高上限對「沒有 intents」那一臂幾乎無影響。
const DESC_LIMIT = Number(args.find((a) => a.startsWith('--descLimit='))?.split('=')[1]) || 550;

function descOf(id, { withIntents = false } = {}) {
  const tool = tools.find((x) => x.id === id);
  const base = buildCandidateText(tool, DESC_LIMIT);
  if (!withIntents) return base;
  const intents = WIKI?.entries?.[id]?.intents || [];
  if (intents.length === 0) return base;
  return `${base} ｜ 使用者情境：${intents.slice(0, 3).join('；')}`.slice(0, DESC_LIMIT);
}

async function rerankOnce(query, cands, opts = {}) {
  const model = opts.model || MODEL;
  const { picked, error } = await rerankCandidates(
    query,
    cands.map((id) => ({ id, description: descOf(id, opts) })),
    { ...(model ? { model } : {}), descLimit: DESC_LIMIT },
  );
  return { picked, error };
}

const n = cases.length;
const pct = (a, d = n) => `${((a / d) * 100).toFixed(1)}%`;

console.log(`\n═══ LLM rerank 評測 ═══`);
console.log(`評測集 v${bench.version}　可命中 ${n} 筆　top-${K}　模型=${MODEL || '(預設)'}　模式=${PAIRED ? `配對 A/B（${VARIANT}）` : '單一路徑'}　描述上限=${DESC_LIMIT}`);
console.log(`知識詞檔：${WIKI ? `${Object.keys(WIKI.entries).length} 筆（Tier 1：${Object.values(WIKI.entries).filter((e) => e.tier === 1).length}）` : '無（V5 停用）'}`);
console.log(`API key：${hasKey ? '已設定' : '未設定（僅跑 baseline）'}\n`);

// ── 配對模式 ───────────────────────────────────────────────────────────────
if (PAIRED) {
  const st = { onHit: 0, offHit: 0, both: 0, onOnly: 0, offOnly: 0, neither: 0, okOn: 0, okOff: 0 };
  const ceilOn = { v: 0 }, ceilOff = { v: 0 }, baseOn = { v: 0 }, baseOff = { v: 0 };
  const pool = cases.slice(0, LIMIT);

  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, pool.length) }, async () => {
  while (true) {
    const i = cursor++;
    if (i >= pool.length) break;
    const c = pool[i];
    const intent = extractIntent(c.query);
    // 交替先後順序：偶數題先跑「開」、奇數題先跑「關」，
    // 讓配額遞減對兩邊的影響對稱。
    const order = i % 2 === 0 ? [true, false] : [false, true];
    const res = { on: null, off: null };

    for (const on of order) {
      // 兩臂的差異由 --variant 決定：
      //   wiki    ：開／關知識詞檔（影響候選名單）
      //   intents ：候選名單完全相同，只差提示詞有沒有「使用者情境」
      let arm;
      if (VARIANT === 'intents') {
        // 候選名單相同，只差提示詞有沒有「使用者情境」
        arm = { wiki: WIKI, withIntents: on };
      } else if (VARIANT === 'model') {
        // 候選名單與提示詞都相同，只差模型
        arm = { wiki: WIKI, withIntents: true, model: on ? MODEL_A : MODEL_B };
      } else if (VARIANT === 'topk') {
        // 提示詞格式相同，只差候選數：A 臂 K_A、B 臂 K_B
        arm = { wiki: WIKI, withIntents: true, topK: on ? K_A : K_B };
      } else {
        arm = { wiki: on ? WIKI : null, withIntents: false };
      }

      const cands = agentRetrieve(tools, c.query, {
        topK: arm.topK || K, intentWeights: weightsForIntent(intent), wiki: arm.wiki,
      }).topK.map((x) => x.id);
      if (cands.length === 0) continue;

      if (on) { if (c.expected.includes(cands[0])) baseOn.v++; if (c.expected.some((e) => cands.includes(e))) ceilOn.v++; }
      else { if (c.expected.includes(cands[0])) baseOff.v++; if (c.expected.some((e) => cands.includes(e))) ceilOff.v++; }

      if (!hasKey) continue;
      const { picked, error } = await rerankOnce(c.query, cands, { withIntents: arm.withIntents });
      if (error) continue;
      if (on) st.okOn++; else st.okOff++;
      res[on ? 'on' : 'off'] = Boolean(picked && c.expected.includes(picked));
    }

    if (res.on === null || res.off === null) continue; // 有一邊失敗 → 這題不算配對
    if (res.on) st.onHit++;
    if (res.off) st.offHit++;
    if (res.on && res.off) st.both++;
    else if (res.on) st.onOnly++;
    else if (res.off) st.offOnly++;
    else st.neither++;
    if ((st.both + st.onOnly + st.offOnly + st.neither) % 20 === 0) {
      process.stdout.write(`  ${st.both + st.onOnly + st.offOnly + st.neither}/${pool.length}\n`);
    }
  }
  }));

  const valid = st.both + st.onOnly + st.offOnly + st.neither;
  console.log(`\n  有效配對：${valid} 題（成功呼叫：A 臂 ${st.okOn}／B 臂 ${st.okOff}）\n`);
  console.log(`  A 臂 Hit@1 : ${st.onHit}/${valid}  ${pct(st.onHit, valid)}`);
  console.log(`  B 臂 Hit@1 : ${st.offHit}/${valid}  ${pct(st.offHit, valid)}`);
  console.log(`  差異        : ${((st.onHit - st.offHit) / valid * 100).toFixed(1)}pp`);
  console.log(`\n  【McNemar 配對分析】`);
  console.log(`    兩邊都對   : ${st.both}`);
  console.log(`    只有開對   : ${st.onOnly}`);
  console.log(`    只有關對   : ${st.offOnly}`);
  console.log(`    兩邊都錯   : ${st.neither}`);
  console.log(`    不一致合計 : ${st.onOnly + st.offOnly}`);

  // 精確二項檢定：不一致對中，一邊的數量是否偏離一半
  const disc = st.onOnly + st.offOnly;
  if (disc > 0) {
    const k = Math.min(st.onOnly, st.offOnly);
    let p = 0;
    const binom = (nn, kk) => { let r = 1; for (let i = 0; i < kk; i++) r = (r * (nn - i)) / (i + 1); return r; };
    for (let i = 0; i <= k; i++) p += binom(disc, i);
    p = Math.min(1, 2 * p / 2 ** disc);
    console.log(`    雙尾 p 值  : ${p.toFixed(3)}${p < 0.05 ? '  ← 顯著' : '  ← 不顯著（差異可能是隨機）'}`);
  }
  // 天花板／詞彙 top1 是確定性指標，分母用題數（不需要 API 成功）
  console.log(`\n  召回天花板：V5 開 ${pct(ceilOn.v, pool.length)}　V5 關 ${pct(ceilOff.v, pool.length)}`);
  console.log(`  詞彙 top-1 ：V5 開 ${pct(baseOn.v, pool.length)}　V5 關 ${pct(baseOff.v, pool.length)}`);
  console.log();
  process.exit(0);
}

// ── 一般模式（原行為）─────────────────────────────────────────────────────
let baseHit = 0, inTopK = 0, rerankHit = 0, apiOk = 0;
// 寬鬆計分：計入 alsoAcceptable（經查證確實滿足需求的近義工具）。
// 與 eval-benchmark.js 一致——評測集已有 10 筆 alsoAcceptable，
// 若這裡只看 expected，生產路徑的數字會與評測集定義脫節。
let rerankLoose = 0, looseCases = 0;
const misses = [];

let cur2 = 0;
await Promise.all(Array.from({ length: Math.min(CONCURRENCY, cases.length) }, async () => {
while (true) {
  const ci = cur2++;
  if (ci >= cases.length) break;
  const c = cases[ci];
  const intent = extractIntent(c.query);
  const cands = agentRetrieve(tools, c.query, {
    topK: K,
    intentWeights: weightsForIntent(intent),
  }).topK.map((x) => x.id);

  if (cands.length === 0) { misses.push({ ...c, why: 'no candidates' }); continue; }
  if (c.expected.includes(cands[0])) baseHit++;
  if (c.expected.some((e) => cands.includes(e))) inTopK++;

  if (!hasKey) continue;

  const { picked, error } = await rerankOnce(c.query, cands);
  if (error) { misses.push({ ...c, why: `rerank error: ${error}` }); continue; }
  apiOk++;

  const accept = [...c.expected, ...(c.alsoAcceptable || [])];
  if (c.alsoAcceptable?.length) looseCases++;
  if (picked && accept.includes(picked)) rerankLoose++;

  if (picked && c.expected.includes(picked)) rerankHit++;
  else misses.push({ ...c, picked, inCands: c.expected.some((e) => cands.includes(e)) });
}
}));

console.log(`  詞彙 agent top-1      : ${String(baseHit).padStart(2)}/${n}  ${pct(baseHit)}`);
console.log(`  正確答案在 top-${K} 內   : ${String(inTopK).padStart(2)}/${n}  ${pct(inTopK)}   ← rerank 天花板`);
if (hasKey) {
  console.log(`  LLM rerank 後         : ${String(rerankHit).padStart(2)}/${n}  ${pct(rerankHit)}   （成功呼叫 ${apiOk}）`);
  // 🔴 失敗時 rerank 會被略過、退回融合排序，數字看起來正常但其實是廢的。
  // 2026-09-20 就是這樣被 --concurrency=3 騙出一個 36.5% 的假結果。
  if (apiOk < n * 0.9) {
    console.log(`\n  ⚠️⚠️ 成功呼叫僅 ${apiOk}/${n}（${pct(apiOk)}）—— 這個數字不可採信！`);
    console.log(`     失敗時不會重排，直接退回融合排序，分數會被嚴重低估。`);
    console.log(`     常見原因：TPM 額度用盡（併發太高或 prompt 太長）。`);
    console.log(`     請降低 --concurrency（預設 1）或改用多把金鑰。`);
  }
  console.log(`\n  增益：${pct(baseHit)} → ${pct(rerankHit)}`);
  if (looseCases > 0) {
    console.log(`\n  【含近義】計入 ${looseCases} 筆 alsoAcceptable`);
    console.log(`  LLM rerank 後         : ${String(rerankLoose).padStart(2)}/${n}  ${pct(rerankLoose)}`);
  }
} else {
  console.log('\n  未設定 AGNES_API_KEY，略過 rerank。');
}

if (verbose && misses.length) {
  console.log('\n未命中明細：');
  for (const m of misses.slice(0, 20)) {
    const why = m.inCands === false ? '（正確答案不在候選內，rerank 救不到）' : '';
    console.log(`  ${m.id} [${m.type}] 期望=${(m.expected || []).join('/') || '?'} 選到=${m.picked ?? m.why ?? '—'} ${why}`);
  }
}
console.log();
