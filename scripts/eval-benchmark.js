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
  stats[name] = { hit1: 0, hit3: 0, mrr: 0, n: 0, byType: {}, failures: [] };
}

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

console.log('\n【按類型分組 — fusion】');
const f = stats.fusion;
console.log('  類型          筆數   Hit@1      Hit@3      MRR');
console.log('  ──────────────────────────────────────────────────');
for (const [type, bt] of Object.entries(f.byType)) {
  console.log(`  ${type.padEnd(12)} ${String(bt.n).padStart(4)}   ${pct(bt.hit1, bt.n).padStart(7)}   ${pct(bt.hit3, bt.n).padStart(7)}   ${(bt.mrr / (bt.n || 1)).toFixed(3).padStart(6)}`);
}

const agentHonest = empties.filter((e) => e.agent).length;
const fusionHonest = empties.filter((e) => e.fusion).length;
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
