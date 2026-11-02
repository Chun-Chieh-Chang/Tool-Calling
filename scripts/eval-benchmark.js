#!/usr/bin/env node
/**
 * eval-benchmark.js — 以 registry/eval-queries.json 評測集衡量工具選用能力
 *
 * 與既有的 eval-agent-retrieval.js 差別：
 *   - 後者硬編碼 8 筆查詢（太少，統計上不足）
 *   - 本腳本讀評測集（42+ 筆），並計算 MRR、按類型分組、列出失敗清單
 *
 * 指標
 * ─────
 *   Hit@1 / Hit@3  命中率（expected 任一答案在前 1 / 前 3）
 *   MRR            倒數排名：正確答案出現在第 k 名則得 1/k，衡量「排名品質」
 *   誠實率         empty-set 查詢中，引擎回報 no-match 的比例
 *
 * 分組（type）
 * ───────────
 *   direct      直白描述，詞彙部分重疊
 *   semantic    需語意跳躍，查詢用詞與 metadata 幾乎不重疊
 *   constrained 含明確技術約束
 *   empty-set   無對應工具，應誠實回報
 *
 * 用法：node scripts/eval-benchmark.js [--topK=5] [--verbose]
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { search } from '../core/search-engine.js';
import { agentRetrieve } from '../core/agent-retrieval.js';
import { retrieve } from '../core/retrieval-fusion.js';
import { extractIntent, weightsForIntent } from '../core/query-intent.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const bench = JSON.parse(readFileSync(path.join(ROOT, 'registry', 'eval-queries.json'), 'utf8'));
const registry = JSON.parse(readFileSync(path.join(ROOT, 'registry', 'tools.json'), 'utf8'));
const tools = registry.tools.filter((t) => t.status === 'active' || t.status === 'experimental');

const args = process.argv.slice(2);
const topK = Number(args.find((a) => a.startsWith('--topK='))?.split('=')[1]) || 5;
const verbose = args.includes('--verbose');

// 命中位置：expected 中任一 id 出現在 ids 的最小索引；沒中回傳 -1
function firstHitIndex(ids, expected) {
  let best = -1;
  for (const e of expected) {
    const i = ids.indexOf(e);
    if (i !== -1 && (best === -1 || i < best)) best = i;
  }
  return best;
}

const engines = {
  L2: (q) => search(tools, q, { topK }).map((r) => r.tool.id),
  agent: (q) => {
    const intent = extractIntent(q);
    return agentRetrieve(tools, q, { topK, intentWeights: weightsForIntent(intent) }).topK.map((x) => x.id);
  },
  fusion: (q) => retrieve(tools, q, { topK }).results.map((r) => r.id),
};

// 空集查詢的誠實判定
function emptySetHonest(q) {
  const intent = extractIntent(q);
  const agent = agentRetrieve(tools, q, { topK, intentWeights: weightsForIntent(intent) });
  const fusion = retrieve(tools, q, { topK });
  return {
    agent: agent.decision === 'low-confidence' || agent.decision === 'no-match',
    fusion: fusion.decision === 'no-match',
    agentDecision: agent.decision,
    fusionDecision: fusion.decision,
  };
}

const stats = {};
for (const name of Object.keys(engines)) {
  stats[name] = {
    hit1: 0, hit3: 0, mrr: 0, n: 0, byType: {}, byCollection: {}, byCollectionRole: {}, failures: [],
    // loose = 計入 alsoAcceptable（經查證確實滿足需求的近義工具）
    // 保留嚴格分數同時呈現，避免放寬標註掩蓋真實能力
    loose: { hit1: 0, hit3: 0, mrr: 0 },
  };
}

// 2026-11-02（v1.6.0）：monorepo 題型加上「目標集合是否已中文化」的分組。
//
// 為什麼需要這個分組：v1.6.0 的 60 題 monorepo 裡，m01～m20 的目標集合
// （awesome-copilot）**已有**中文描述，b01～b40 的目標集合**尚未**中文化。
// 兩者混在一起算總分會掩蓋「擴大翻譯」的邊際效益 → 分開呈現。
//
// 「是否已中文化」由 registry 現況推導，不寫死旗標（旗標會過期）。
const registryTools = JSON.parse(readFileSync(path.join(ROOT, 'registry', 'tools.json'), 'utf8')).tools;
const collectionTranslated = new Map(
  registryTools.map((t) => [t.id, (t.subTools || []).some((s) => s.description_zh)])
);

const empties = [];
const cases = bench.cases;

for (const c of cases) {
  if (c.type === 'empty-set') {
    const h = emptySetHonest(c.query);
    empties.push({ ...c, ...h });
    continue;
  }
  for (const [name, fn] of Object.entries(engines)) {
    const ids = fn(c.query);
    const idx = firstHitIndex(ids, c.expected);
    const s = stats[name];
    s.n++;
    s.byType[c.type] ??= { hit1: 0, hit3: 0, mrr: 0, n: 0 };
    const bt = s.byType[c.type];
    bt.n++;
    if (idx === 0) { s.hit1++; bt.hit1++; }
    if (idx !== -1 && idx < 3) { s.hit3++; bt.hit3++; }
    if (idx !== -1) {
      const rr = 1 / (idx + 1);
      s.mrr += rr;
      bt.mrr += rr;
    }

    // 依目標集合分組（僅 monorepo 題型有 collection 欄位）
    if (c.collection) {
      s.byCollection[c.collection] ??= { hit1: 0, hit3: 0, mrr: 0, n: 0, translated: collectionTranslated.get(c.collection) };
      const bc = s.byCollection[c.collection];
      bc.n++;
      if (idx === 0) bc.hit1++;
      if (idx !== -1 && idx < 3) bc.hit3++;
      if (idx !== -1) bc.mrr += 1 / (idx + 1);

      // 依「集合是否已中文化 × 期望答案是否就是該集合本身」再分一層。
      // 這是「擴大翻譯」最直接的讀數：期望=集合的題目，理論上只有
      // 該集合有中文描述時才可能被命中。
      const role = c.expected[0] === c.collection ? 'collection' : 'dedicated';
      const key = `${bc.translated ? 'translated' : 'untranslated'}|${role}`;
      s.byCollectionRole[key] ??= { hit1: 0, hit3: 0, n: 0 };
      const br = s.byCollectionRole[key];
      br.n++;
      if (idx === 0) br.hit1++;
      if (idx !== -1 && idx < 3) br.hit3++;
    }

    // 寬鬆判定：expected ∪ alsoAcceptable
    if (c.alsoAcceptable?.length) {
      const idxL = firstHitIndex(ids, [...c.expected, ...c.alsoAcceptable]);
      if (idxL === 0) s.loose.hit1++;
      if (idxL !== -1 && idxL < 3) s.loose.hit3++;
      if (idxL !== -1) s.loose.mrr += 1 / (idxL + 1);
    } else {
      if (idx === 0) s.loose.hit1++;
      if (idx !== -1 && idx < 3) s.loose.hit3++;
      if (idx !== -1) s.loose.mrr += 1 / (idx + 1);
    }
    if (idx !== 0 && name === 'fusion') {
      s.failures.push({ id: c.id, type: c.type, query: c.query, expected: c.expected, got: ids[0], idx });
    }
  }
}

const pct = (a, b) => (b === 0 ? '—' : `${((a / b) * 100).toFixed(1)}%`);

console.log(`\n═══ 工具選用基準評測 ═══`);
console.log(`評測集 v${bench.version}　共 ${cases.length} 筆（${cases.length - empties.length} 可命中 + ${empties.length} 空集）　topK=${topK}\n`);

console.log('【整體】');
console.log('  引擎        Hit@1      Hit@3      MRR');
console.log('  ─────────────────────────────────────────');
for (const [name, s] of Object.entries(stats)) {
  console.log(`  ${name.padEnd(10)} ${pct(s.hit1, s.n).padStart(7)}   ${pct(s.hit3, s.n).padStart(7)}   ${(s.mrr / (s.n || 1)).toFixed(3).padStart(6)}`);
}

// 含近義：計入 alsoAcceptable。與嚴格分數並列，不取代它——
// 放寬標註會讓分數上升，但那不等於能力提升，兩個數字都要看得到。
const looseCases = cases.filter((c) => c.alsoAcceptable?.length).length;
if (looseCases > 0) {
  console.log(`\n【含近義（計入 ${looseCases} 筆 alsoAcceptable）】`);
  console.log('  引擎        Hit@1      Hit@3      MRR');
  console.log('  ─────────────────────────────────────────');
  for (const [name, s] of Object.entries(stats)) {
    console.log(`  ${name.padEnd(10)} ${pct(s.loose.hit1, s.n).padStart(7)}   ${pct(s.loose.hit3, s.n).padStart(7)}   ${(s.loose.mrr / (s.n || 1)).toFixed(3).padStart(6)}`);
  }
}

console.log('\n【按類型分組 — 三引擎 Hit@1】');
// 2026-11-01：原本只印 fusion 的分組結果。子功能層的改動主要發生在
// L2（詞彙層），只看 fusion 會看不出底層到底變好還是變壞 → 三引擎都列出。
const f = stats.fusion;
const allTypes = [...new Set(cases.filter((c) => c.type !== 'empty-set').map((c) => c.type))];
for (const [name, s] of Object.entries(stats)) {
  console.log(`  ── ${name} ──`);
  console.log('  類型          筆數   Hit@1      Hit@3      MRR');
  for (const type of allTypes) {
    const bt = s.byType[type];
    if (!bt) continue;
    console.log(`  ${type.padEnd(12)} ${String(bt.n).padStart(4)}   ${pct(bt.hit1, bt.n).padStart(7)}   ${pct(bt.hit3, bt.n).padStart(7)}   ${(bt.mrr / (bt.n || 1)).toFixed(3).padStart(6)}`);
  }
}

// ── monorepo 依「目標集合是否已中文化」分組（2026-11-02 / v1.6.0）────────
//
// 這是「擴大翻譯其餘 3,235 筆 subTool」的配對 A/B 讀法：
//   已中文化組（目前只有 awesome-copilot）→ 機制有效性的證據
//   未中文化組（其餘 10 個集合）        → 擴大翻譯的**基準端**
// 擴大翻譯後重跑同一份評測集，未中文化組的數字就是「邊際效益」。
const monoCollections = Object.keys(stats.fusion.byCollection);
if (monoCollections.length) {
  console.log('\n【monorepo 依目標集合分組 — Hit@1】');
  console.log('  目標集合'.padEnd(34) + '中文描述'.padEnd(8) + '筆數' + 'L2'.padStart(9) + 'fusion'.padStart(9) + 'fusion Hit@3'.padStart(14));
  const rows = monoCollections
    .map((cid) => ({ cid, ...stats.fusion.byCollection[cid] }))
    .sort((a, b) => (a.translated === b.translated ? b.n - a.n : (a.translated ? -1 : 1)));
  for (const r of rows) {
    const l2s = stats.L2.byCollection[r.cid];
    console.log(
      `  ${r.cid.padEnd(32)} ${(r.translated ? '有' : '無').padEnd(6)}${String(r.n).padStart(4)}` +
      `${pct(l2s?.hit1 ?? 0, l2s?.n ?? 1).padStart(9)}${pct(r.hit1, r.n).padStart(9)}${pct(r.hit3, r.n).padStart(14)}`
    );
  }
  // 兩組的匯總（這才是 A/B 的讀數）
  console.log('  ── 分組匯總 ──');
  for (const [label, want] of [['已中文化的集合', true], ['未中文化的集合', false]]) {
    const ids = rows.filter((r) => r.translated === want).map((r) => r.cid);
    if (!ids.length) continue;
    const n = ids.reduce((a, c) => a + stats.fusion.byCollection[c].n, 0);
    const h1 = ids.reduce((a, c) => a + stats.fusion.byCollection[c].hit1, 0);
    const h3 = ids.reduce((a, c) => a + stats.fusion.byCollection[c].hit3, 0);
    const l2n = ids.reduce((a, c) => a + (stats.L2.byCollection[c]?.n ?? 0), 0);
    const l2h1 = ids.reduce((a, c) => a + (stats.L2.byCollection[c]?.hit1 ?? 0), 0);
    console.log(`  ${label.padEnd(18)} ${String(n).padStart(3)} 題　L2 ${pct(l2h1, l2n).padStart(7)}　fusion ${pct(h1, n).padStart(7)}　fusion Hit@3 ${pct(h3, n).padStart(7)}`);
  }

  // 再細分一層：期望答案「就是」該集合本身的題目（擴大翻譯直接作用於這一組）
  console.log('\n【monorepo 依「集合是否已中文化 × 期望是否為集合本身」分組】');
  console.log('  分組'.padEnd(32) + '筆數' + 'L2 Hit@1'.padStart(11) + 'fusion Hit@1'.padStart(15) + 'fusion Hit@3'.padStart(15));
  const ROLE_LABEL = {
    'translated|collection': '已中文化 × 期望＝集合本身',
    'translated|dedicated': '已中文化 × 期望＝專用工具',
    'untranslated|collection': '未中文化 × 期望＝集合本身',
    'untranslated|dedicated': '未中文化 × 期望＝專用工具',
  };
  for (const key of ['translated|collection', 'translated|dedicated', 'untranslated|collection', 'untranslated|dedicated']) {
    const fr = stats.fusion.byCollectionRole[key];
    const lr = stats.L2.byCollectionRole[key];
    if (!fr?.n) continue;
    console.log(
      `  ${ROLE_LABEL[key].padEnd(30)}${String(fr.n).padStart(4)}` +
      `${pct(lr?.hit1 ?? 0, lr?.n ?? 1).padStart(11)}${pct(fr.hit1, fr.n).padStart(15)}${pct(fr.hit3, fr.n).padStart(15)}`
    );
  }
}

const agentHonest = empties.filter((e) => e.agent).length;const fusionHonest = empties.filter((e) => e.fusion).length;
console.log('\n【空集誠實率（越高越好）】');
console.log(`  agent-retrieval : ${agentHonest}/${empties.length}  ${pct(agentHonest, empties.length)}`);
console.log(`  fusion          : ${fusionHonest}/${empties.length}  ${pct(fusionHonest, empties.length)}`);
for (const e of empties) {
  const mark = e.fusion ? '✓' : '✗';
  console.log(`   ${mark} ${e.id} ${e.query.slice(0, 40)}`);
  console.log(`      agent=${e.agentDecision}  fusion=${e.fusionDecision}`);
}

if (verbose && f.failures.length) {
  console.log('\n【fusion 未命中 top-1 的查詢】');
  for (const x of f.failures) {
    console.log(`  ${x.id} [${x.type}] ${x.query}`);
    console.log(`     期望 ${x.expected.join('/')}　實得 ${x.got}${x.idx === -1 ? '（前 5 皆未中）' : `（第 ${x.idx + 1} 名）`}`);
  }
}
console.log();
