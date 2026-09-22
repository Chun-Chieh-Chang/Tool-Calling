#!/usr/bin/env node
/**
 * eval-hyde.js — 評測 retrieveWithAdaptiveHyDE vs 基線 retrieve
 *
 * 重點：HyDE 僅對 l2Score < 0.10 的查詢觸發，約佔全部的 15%。
 * 腳本分三組報告：
 *   全部   — 整體指標（大多數查詢 HyDE 不觸發，故差異預期偏小）
 *   hyde觸發 — 實際觸發 HyDE 的查詢（這是核心指標）
 *   no-hyde — HyDE 未觸發的查詢（應與基線完全相同，用來驗正確性）
 *
 * 用法：
 *   node scripts/eval-hyde.js               # 執行一輪（有 LLM 呼叫）
 *   node scripts/eval-hyde.js --dry-run      # 只做基線掃描，印出哪些查詢會觸發 HyDE
 *   node scripts/eval-hyde.js --topK=3       # 變更 topK（預設 5）
 *   node scripts/eval-hyde.js --delay=800    # LLM 呼叫之間的延遲 ms（預設 500）
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const bench = JSON.parse(readFileSync(path.join(ROOT, 'registry', 'eval-queries.json'), 'utf8'));
const registry = JSON.parse(readFileSync(path.join(ROOT, 'registry', 'tools.json'), 'utf8'));
const tools = registry.tools.filter((t) => t.status === 'active' || t.status === 'experimental');

const { retrieve, retrieveWithAdaptiveHyDE } = await import('../core/retrieval-fusion.js');

// ── CLI 參數 ─────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const topK   = Number(argv.find((a) => a.startsWith('--topK='))?.split('=')[1])   || 5;
const delay  = Number(argv.find((a) => a.startsWith('--delay='))?.split('=')[1])  || 500;
const dryRun = argv.includes('--dry-run');

// ── 工具函式 ─────────────────────────────────────────────────────────────────
function firstHitIndex(ids, expected) {
  let best = -1;
  for (const e of expected) {
    const i = ids.indexOf(e);
    if (i !== -1 && (best === -1 || i < best)) best = i;
  }
  return best;
}

function mkStat() {
  return { n: 0, hit1: 0, hit3: 0, mrr: 0, hydeTriggered: 0, hydeImproved: 0 };
}

function addHit(s, idx, triggered, improved) {
  s.n++;
  if (triggered) s.hydeTriggered++;
  if (improved)  s.hydeImproved++;
  if (idx === 0)             s.hit1++;
  if (idx !== -1 && idx < 3) s.hit3++;
  if (idx !== -1)            s.mrr += 1 / (idx + 1);
}

function pct(a, b)   { return b === 0 ? '—' : `${((a / b) * 100).toFixed(1)}%`; }
function mrrStr(s)   { return (s.mrr / (s.n || 1)).toFixed(3); }

function printTable(label, base, hyde) {
  console.log(`\n【${label}】`);
  console.log('  引擎              筆數   Hit@1      Hit@3      MRR');
  console.log('  ───────────────────────────────────────────────────────');
  const row = (name, s) =>
    `  ${name.padEnd(16)} ${String(s.n).padStart(4)}   ${pct(s.hit1, s.n).padStart(7)}   ${pct(s.hit3, s.n).padStart(7)}   ${mrrStr(s)}`;
  console.log(row('fusion (基線)', base));
  console.log(row('fusion+HyDE', hyde));
  if (hyde.n > 0) {
    const d1  = ((hyde.hit1  - base.hit1)  / (base.n || 1) * 100).toFixed(1);
    const d3  = ((hyde.hit3  - base.hit3)  / (base.n || 1) * 100).toFixed(1);
    const dmr = (hyde.mrr / (hyde.n||1) - base.mrr / (base.n||1)).toFixed(3);
    console.log(`  ${'Δ (HyDE - 基線)'.padEnd(16)}       ${(d1 >= 0 ? '+' : '') + d1}pp       ${(d3 >= 0 ? '+' : '') + d3}pp   ${(dmr >= 0 ? '+' : '') + dmr}`);
    if (label.includes('觸發')) {
      console.log(`  HyDE 觸發 ${hyde.hydeTriggered} 筆，其中改善 ${hyde.hydeImproved} 筆`);
    }
  }
}

// ── 主流程 ──────────────────────────────────────────────────────────────────
const cases = bench.cases.filter((c) => c.type !== 'empty-set');

// 第一步：掃基線，標記哪些查詢會觸發 HyDE
const baselineResults = [];
for (const c of cases) {
  const r = retrieve(tools, c.query, { topK });
  const ids = r.results.map((x) => x.id);
  const willTrigger = r.decision !== 'adopt' && (r.l2Top?.score ?? 0) < 0.10;
  baselineResults.push({ c, r, ids, willTrigger });
}

const hydeEligible = baselineResults.filter((x) => x.willTrigger);
console.log(`\n評測集 v${bench.version}　共 ${cases.length} 筆（非空集）　topK=${topK}`);
console.log(`HyDE 預計觸發：${hydeEligible.length} 筆 / ${cases.length} 筆 (${pct(hydeEligible.length, cases.length)})`);
console.log(`  其中：direct=${hydeEligible.filter(x=>x.c.type==='direct').length}  semantic=${hydeEligible.filter(x=>x.c.type==='semantic').length}  constrained=${hydeEligible.filter(x=>x.c.type==='constrained').length}`);

if (dryRun) {
  console.log('\n── dry-run 模式：列出會觸發 HyDE 的查詢 ──');
  for (const { c, r } of hydeEligible) {
    console.log(`  ${c.id.padEnd(6)} [${c.type.padEnd(11)}] l2=${(r.l2Top?.score??0).toFixed(4)}  dec=${r.decision.padEnd(18)}  "${c.query.slice(0,60)}"`);
  }
  process.exit(0);
}

// 第二步：對觸發 HyDE 的查詢跑 retrieveWithAdaptiveHyDE
console.log(`\n開始 HyDE 評測（${hydeEligible.length} 次 LLM 呼叫，間隔 ${delay}ms）…`);

const hydeCache = new Map(); // id → hydeResult
let done = 0;
for (const { c } of hydeEligible) {
  process.stdout.write(`  [${++done}/${hydeEligible.length}] ${c.id} … `);
  const hr = await retrieveWithAdaptiveHyDE(tools, c.query, { topK });
  hydeCache.set(c.id, hr);
  const triggered = hr.hyde?.triggered ?? false;
  process.stdout.write(triggered ? `觸發 → ${hr.hyde.firstDecision} → ${hr.hyde.secondDecision}\n` : `未觸發 (${hr.hyde?.reason})\n`);
  if (done < hydeEligible.length) await new Promise((r) => setTimeout(r, delay));
}

// 第三步：計算指標
const allBase   = mkStat(), allHyde   = mkStat();
const trigBase  = mkStat(), trigHyde  = mkStat();
const noBase    = mkStat(), noHyde    = mkStat();
const byTypeBase = {}, byTypeHyde = {};

for (const { c, ids: baseIds, willTrigger } of baselineResults) {
  const baseIdx = firstHitIndex(baseIds, c.expected);
  const hydeR   = hydeCache.get(c.id);
  const hydeIds = hydeR ? hydeR.results.map((x) => x.id) : baseIds;
  const hydeIdx = firstHitIndex(hydeIds, c.expected);
  const triggered = hydeR?.hyde?.triggered ?? false;
  const improved  = triggered && hydeIdx > -1 && (baseIdx === -1 || hydeIdx < baseIdx);

  byTypeBase[c.type] ??= mkStat();
  byTypeHyde[c.type] ??= mkStat();

  addHit(allBase, baseIdx, false, false);
  addHit(allHyde, hydeIdx, triggered, improved);
  addHit(byTypeBase[c.type], baseIdx, false, false);
  addHit(byTypeHyde[c.type], hydeIdx, triggered, improved);

  if (willTrigger) {
    addHit(trigBase, baseIdx, false, false);
    addHit(trigHyde, hydeIdx, triggered, improved);
  } else {
    addHit(noBase, baseIdx, false, false);
    addHit(noHyde, hydeIdx, triggered, improved);
  }
}

// ── 報告 ──────────────────────────────────────────────────────────────────
console.log(`\n${'═'.repeat(65)}`);
console.log(' Adaptive HyDE 評測結果');
console.log(`${'═'.repeat(65)}`);

printTable('全部查詢', allBase, allHyde);
printTable(`HyDE 觸發子集（${trigHyde.n} 筆）`, trigBase, trigHyde);
printTable(`HyDE 未觸發子集（${noBase.n} 筆）— 應與基線完全相同`, noBase, noHyde);

console.log('\n【按類型分組 — fusion+HyDE 相對基線】');
console.log('  類型          基線 Hit@1   HyDE Hit@1   Δ       基線 MRR   HyDE MRR   Δ');
console.log('  ──────────────────────────────────────────────────────────────────────────');
for (const type of Object.keys(byTypeBase)) {
  const b = byTypeBase[type], h = byTypeHyde[type];
  const d1  = (h.hit1 / h.n * 100 - b.hit1 / b.n * 100).toFixed(1);
  const dmr = (h.mrr / h.n - b.mrr / b.n).toFixed(3);
  console.log(
    `  ${type.padEnd(12)} ${pct(b.hit1, b.n).padStart(10)}   ${pct(h.hit1, h.n).padStart(10)}   ${((d1>=0?'+':'')+d1+'pp').padStart(7)}` +
    `   ${mrrStr(b).padStart(8)}   ${mrrStr(h).padStart(8)}   ${((dmr>=0?'+':'')+dmr).padStart(7)}`
  );
}

// 詳細逐筆（只印有觸發的）
const trigDetails = baselineResults
  .filter((x) => x.willTrigger && hydeCache.has(x.c.id) && hydeCache.get(x.c.id)?.hyde?.triggered)
  .map(({ c, ids: baseIds }) => {
    const hr       = hydeCache.get(c.id);
    const hydeIds  = hr.results.map((x) => x.id);
    const baseIdx  = firstHitIndex(baseIds, c.expected);
    const hydeIdx  = firstHitIndex(hydeIds, c.expected);
    const delta    = baseIdx === -1 ? (hydeIdx === -1 ? '同樣未中' : `+命中（第${hydeIdx+1}名）`)
                   : hydeIdx === -1 ? '退步（掉出top${topK}）'
                   : hydeIdx < baseIdx ? `+提升（${baseIdx+1}→${hydeIdx+1}名）`
                   : hydeIdx === baseIdx ? '不變'
                   : `-退步（${baseIdx+1}→${hydeIdx+1}名）`;
    return { c, baseIdx, hydeIdx, delta, hr };
  });

if (trigDetails.length > 0) {
  console.log(`\n【HyDE 實際觸發的 ${trigDetails.length} 筆逐筆詳情】`);
  console.log('  id    type         基線命中   HyDE命中   Δ');
  console.log('  ────────────────────────────────────────────────────────────────────');
  for (const { c, baseIdx, hydeIdx, delta } of trigDetails) {
    const bHit = baseIdx === -1 ? '未中' : `第${baseIdx+1}名`;
    const hHit = hydeIdx === -1 ? '未中' : `第${hydeIdx+1}名`;
    console.log(`  ${c.id.padEnd(5)} ${c.type.padEnd(12)}  ${bHit.padStart(6)}     ${hHit.padStart(6)}    ${delta}`);
    console.log(`    q: "${c.query.slice(0,70)}"`);
  }
}

console.log();
