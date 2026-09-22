#!/usr/bin/env node
/**
 * diagnose-decision.mjs — 診斷 decision 閾值問題
 *
 * 背景：HyDE 評測的 38 題觸發子集中，基線 Hit@1 已有 57.9%。
 * 說明 agent-retrieval 已找到答案，但被判定為 no-match / ambiguous。
 * 根本原因：agentConsistent 門檻（3 筆以上 conf≥0.35）太嚴格。
 *
 * 本腳本統計：
 *   - 那些 decision=no-match 的查詢，agent topK 中有幾筆高置信
 *   - 那些命中的 no-match 查詢，最高置信答案的 rank 與 confidence
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const bench = JSON.parse(readFileSync(path.join(ROOT, 'registry', 'eval-queries.json'), 'utf8'));
const registry = JSON.parse(readFileSync(path.join(ROOT, 'registry', 'tools.json'), 'utf8'));
const tools = registry.tools.filter((t) => t.status === 'active' || t.status === 'experimental');

const { retrieve } = await import(pathToFileURL(path.join(ROOT, 'core/retrieval-fusion.js')).href);
const { agentRetrieve } = await import(pathToFileURL(path.join(ROOT, 'core/agent-retrieval.js')).href);
const { extractIntent, weightsForIntent } = await import(pathToFileURL(path.join(ROOT, 'core/query-intent.js')).href);

// HyDE 觸發子集（l2Score < 0.10）
const hydeTriggered = [
  'c02', 'c14', 'c17', 'c19', 'c30', 'c68', 'c79', 'c94', 'c100', 'c101',
  'c102', 'c106', 'c109', 'c111', 'c114', 'c116', 'c118', 'c120', 'c133', 'c134',
  'c138', 'c143', 'c145', 'c146', 'c147', 'c148', 'c151', 'c159', 'c170', 'c176',
  'c177', 'c179', 'c185', 'c195', 'c214', 'c229', 'c230', 'c244',
];

const cases = bench.cases.filter((c) => c.type !== 'empty-set' && hydeTriggered.includes(c.id));

const stats = {
  noMatch_hit: [],           // decision=no-match 但命中
  noMatch_miss: [],          // decision=no-match 且未命中
  adoptWarning_hit: [],      // decision=adopt-with-warning 但命中
  adoptWarning_miss: [],
  adopt_hit: [],             // decision=adopt 且命中
  adopt_miss: [],
};

for (const c of cases) {
  const r = retrieve(tools, c.query, { topK: 5 });
  const ids = r.results.map((x) => x.id);
  const hit = c.expected && c.expected.length > 0
    ? ids.some((id) => c.expected.includes(id))
    : false;

  // 取 agent 的原始結果（不融合）
  const intent = extractIntent(c.query);
  const agentR = agentRetrieve(tools, c.query, { topK: 5, intentWeights: weightsForIntent(intent) });
  const agentHit = agentR.topK.length > 0 && c.expected.some((eid) => agentR.topK[0].id === eid);
  const topConfInExpected = Math.max(
    0,
    ...agentR.topK.filter((x) => c.expected.includes(x.id)).map((x) => x.confidence)
  );
  const highConfCount = agentR.topK.filter((x) => x.confidence >= 0.35).length;
  const mediumConfCount = agentR.topK.filter((x) => x.confidence >= 0.20).length;
  const l2HasAny = r.l2Top !== null;

  const key = `${r.decision}_${hit ? 'hit' : 'miss'}`;
  if (!stats[key]) stats[key] = [];
  stats[key].push({
    id: c.id,
    query: c.query.slice(0, 50),
    expected: c.expected[0],
    agentHit,
    topConfInExpected: topConfInExpected.toFixed(3),
    highConfCount,
    mediumConfCount,
    l2HasAny,
    agentDecision: agentR.decision,
  });
}

console.log(`\n📊 HyDE 觸發子集（${cases.length} 題）的 decision / 命中 分佈\n`);

const keys = Object.keys(stats).sort();
for (const key of keys) {
  const rows = stats[key];
  console.log(`【${key}】${rows.length} 筆`);
  if (rows.length === 0) continue;

  // 列出前幾個典型例子
  const sample = rows.slice(0, 3);
  for (const row of sample) {
    const mark = row.agentHit ? '✓' : '✗';
    console.log(
      `  ${mark} ${row.id.padEnd(5)} agent-hit=${row.agentHit ? 'yes' : 'no'} ` +
      `highConf=${row.highConfCount} mediumConf=${row.mediumConfCount} ` +
      `l2Has=${row.l2HasAny ? 'yes' : 'no'} topConfExp=${row.topConfInExpected} agentDec=${row.agentDecision}`
    );
    console.log(`     q: "${row.query}"`);
  }
  if (rows.length > 3) {
    console.log(`  ... + ${rows.length - 3} 筆\n`);
  } else {
    console.log('');
  }
}

// 統計摘要
console.log(`\n【摘要】`);
console.log(`  no-match 總計：${stats.noMatch_hit.length + stats.noMatch_miss.length}`);
console.log(`    ├─ 其中命中：${stats.noMatch_hit.length}`);
console.log(`    └─ 平均答案最高置信：${stats.noMatch_hit.length > 0 ? (stats.noMatch_hit.reduce((a,b)=>a+parseFloat(b.topConfInExpected),0)/stats.noMatch_hit.length).toFixed(3) : 'N/A'}`);
console.log(`  adopt-with-warning 總計：${stats.adoptWarning_hit.length + stats.adoptWarning_miss.length}`);
console.log(`    └─ 其中命中：${stats.adoptWarning_hit.length}`);
console.log(`  adopt 總計：${stats.adopt_hit.length + stats.adopt_miss.length}`);
console.log(`    └─ 其中命中：${stats.adopt_hit.length}`);

// 關鍵訊號
console.log(`\n【關鍵訊號】`);
if (stats.noMatch_hit.length > 0) {
  const avgHighConf = (stats.noMatch_hit.reduce((a,b)=>a+b.highConfCount,0) / stats.noMatch_hit.length).toFixed(1);
  console.log(`  ⚠️  ${stats.noMatch_hit.length} 個 no-match 實際命中`);
  console.log(`      這些題的 agent topK 平均高置信筆數：${avgHighConf} / 5`);
  console.log(`      說明：決策「不敢說知道」，但 agent 找到了答案`);
  console.log(`      根本原因：AGENT_MIN_CONSISTENT=3 門檻太嚴格`);
  console.log(`\n  💡 修正方向：`);
  console.log(`      選項 A：降低 AGENT_MIN_CONSISTENT（例如 2 或 1.5）`);
  console.log(`      選項 B：改用「top-1 高置信」而非「3 筆以上高置信」`);
  console.log(`      選項 C：對 agent 的 high-confidence decision 更信任`);
}
