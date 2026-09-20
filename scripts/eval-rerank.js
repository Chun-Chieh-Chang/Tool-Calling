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
import { rerankCandidates, buildCandidateText, RICH_DESC_LIMIT } from '../core/llm-rerank.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const bench = JSON.parse(readFileSync(path.join(ROOT, 'registry', 'eval-queries.json'), 'utf8'));
const reg = JSON.parse(readFileSync(path.join(ROOT, 'registry', 'tools.json'), 'utf8'));
const tools = reg.tools.filter((t) => t.status === 'active' || t.status === 'experimental');
const cases = bench.cases.filter((c) => c.type !== 'empty-set');

const args = process.argv.slice(2);
const K = Number(args.find((a) => a.startsWith('--topK='))?.split('=')[1]) || 20;
const MODEL = args.find((a) => a.startsWith('--model='))?.split('=')[1] || undefined;
const verbose = args.includes('--verbose');
const PAIRED = args.includes('--paired');
const LIMIT = Number(args.find((a) => a.startsWith('--limit='))?.split('=')[1]) || Infinity;

// 與正式路徑（retrieval-fusion.js）共用同一份候選描述產生邏輯，
// 否則評測數字會與實際上線行為脫節。
const descOf = (id) => buildCandidateText(tools.find((x) => x.id === id));

const hasKey = Boolean(process.env.AGNES_API_KEY);
const WIKI = loadWikiCached();

async function rerankOnce(query, cands) {
  const { picked, error } = await rerankCandidates(
    query,
    cands.map((id) => ({ id, description: descOf(id) })),
    { ...(MODEL ? { model: MODEL } : {}), descLimit: RICH_DESC_LIMIT },
  );
  return { picked, error };
}

const n = cases.length;
const pct = (a, d = n) => `${((a / d) * 100).toFixed(1)}%`;

console.log(`\n═══ LLM rerank 評測 ═══`);
console.log(`評測集 v${bench.version}　可命中 ${n} 筆　top-${K}　模型=${MODEL || '(預設)'}　模式=${PAIRED ? '配對 A/B' : '單一路徑'}`);
console.log(`知識詞檔：${WIKI ? `${Object.keys(WIKI.entries).length} 筆（Tier 1：${Object.values(WIKI.entries).filter((e) => e.tier === 1).length}）` : '無（V5 停用）'}`);
console.log(`API key：${hasKey ? '已設定' : '未設定（僅跑 baseline）'}\n`);

// ── 配對模式 ───────────────────────────────────────────────────────────────
if (PAIRED) {
  const st = { onHit: 0, offHit: 0, both: 0, onOnly: 0, offOnly: 0, neither: 0, okOn: 0, okOff: 0 };
  const ceilOn = { v: 0 }, ceilOff = { v: 0 }, baseOn = { v: 0 }, baseOff = { v: 0 };
  const pool = cases.slice(0, LIMIT);

  for (let i = 0; i < pool.length; i++) {
    const c = pool[i];
    const intent = extractIntent(c.query);
    // 交替先後順序：偶數題先跑「開」、奇數題先跑「關」，
    // 讓配額遞減對兩邊的影響對稱。
    const order = i % 2 === 0 ? [true, false] : [false, true];
    const res = { on: null, off: null };

    for (const on of order) {
      const cands = agentRetrieve(tools, c.query, {
        topK: K, intentWeights: weightsForIntent(intent), wiki: on ? WIKI : null,
      }).topK.map((x) => x.id);
      if (cands.length === 0) continue;

      if (on) { if (c.expected.includes(cands[0])) baseOn.v++; if (c.expected.some((e) => cands.includes(e))) ceilOn.v++; }
      else { if (c.expected.includes(cands[0])) baseOff.v++; if (c.expected.some((e) => cands.includes(e))) ceilOff.v++; }

      if (!hasKey) continue;
      const { picked, error } = await rerankOnce(c.query, cands);
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

  const valid = st.both + st.onOnly + st.offOnly + st.neither;
  console.log(`\n  有效配對：${valid} 題（成功呼叫：V5 開 ${st.okOn}／關 ${st.okOff}）\n`);
  console.log(`  V5 開 Hit@1 : ${st.onHit}/${valid}  ${pct(st.onHit, valid)}`);
  console.log(`  V5 關 Hit@1 : ${st.offHit}/${valid}  ${pct(st.offHit, valid)}`);
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

for (const c of cases) {
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

console.log(`  詞彙 agent top-1      : ${String(baseHit).padStart(2)}/${n}  ${pct(baseHit)}`);
console.log(`  正確答案在 top-${K} 內   : ${String(inTopK).padStart(2)}/${n}  ${pct(inTopK)}   ← rerank 天花板`);
if (hasKey) {
  console.log(`  LLM rerank 後         : ${String(rerankHit).padStart(2)}/${n}  ${pct(rerankHit)}   （成功呼叫 ${apiOk}）`);
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
