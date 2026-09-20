#!/usr/bin/env node
/**
 * v5-ablate.js — V5（知識詞條維度）的權重與圖譜消融（確定性，不需 API）
 *
 * 為什麼要有這支腳本
 * ──────────────────
 * V5 的權重不能憑感覺設。實測顯示它有一個**單調權衡**：
 * 權重給越多，top1 上升但天花板下降（V5 擠壓 V1~V4 的召回貢獻）。
 * 最適值只能量出來，而且**換詞檔就會變**——
 * Tier 0（規則式）的最佳值是 0.10，換成 Tier 1（LLM）後未必一樣。
 *
 * ⚠️ 因此每次重新編譯詞檔後都必須重跑一次本腳本，
 *    並把結果寫回 `core/agent-retrieval.js` 的 V5_WEIGHT。
 *
 * 為什麼結果可信（不需重複實驗）
 * ─────────────────────────────
 * 本腳本完全不呼叫 LLM，評分是確定性運算 → 沒有隨機性，跑一次就定案。
 * （對比：rerank 評測要跑三次取平均，因為那裡有 LLM 隨機性。）
 *
 * 怎麼讀結果
 * ──────────
 *   天花板  = 答案有沒有進 top-50（召回上限，越高越好）
 *   平均排名 = 在 top-50 裡排第幾（越低越好；999 = 沒進）
 *   top1    = 答案是否排第一
 * 理想設定是三者同時優於「V5 停用」的基線；若只有 top1 上升而天花板下降，
 * 那就是拿召回換排序，不一定是划算的交易。
 *
 * 用法
 * ────
 *   npm run ablate:v5
 *   node scripts/v5-ablate.js --weights=0.05,0.10,0.15,0.20
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const args = process.argv.slice(2);
const WEIGHTS = (args.find((a) => a.startsWith('--weights='))?.split('=')[1] || '0.05,0.10,0.15,0.20')
  .split(',').map((s) => Number(s.trim())).filter((n) => Number.isFinite(n));

const b = JSON.parse(readFileSync(path.join(ROOT, 'registry', 'eval-queries.json'), 'utf8'));
const reg = JSON.parse(readFileSync(path.join(ROOT, 'registry', 'tools.json'), 'utf8'));
const { agentRetrieve } = await import('../core/agent-retrieval.js');
const { extractIntent, weightsForIntent } = await import('../core/query-intent.js');
const { loadWikiCached } = await import('../core/wiki-matcher.js');
const tools = reg.tools.filter((t) => t.status === 'active' || t.status === 'experimental');
const wiki = loadWikiCached();

if (!wiki) {
  console.error('找不到知識詞檔（registry/compiled-entries.json）。');
  console.error('請先跑：npm run compile:wiki -- --offline  或  npm run compile:wiki');
  process.exit(1);
}
const tier1 = Object.values(wiki.entries).filter((e) => e.tier === 1).length;
console.log(`詞檔：${Object.keys(wiki.entries).length} 筆（Tier 1：${tier1}）  評測集 v${b.version}，${b.cases.length} 題`);
console.log();

const cases = b.cases.filter((x) => x.type !== 'empty-set');

function run(label, opts) {
  const stat = {};
  for (const c of cases) {
    const it = extractIntent(c.query);
    const top = agentRetrieve(tools, c.query, {
      topK: 50, intentWeights: weightsForIntent(it), ...opts,
    }).topK.map((y) => y.id);
    let idx = -1;
    for (const e of c.expected) {
      const i = top.indexOf(e);
      if (i >= 0 && (idx < 0 || i < idx)) idx = i;
    }
    stat[c.type] = stat[c.type] || { n: 0, in50: 0, sumRank: 0, hit1: 0 };
    const s = stat[c.type];
    s.n += 1;
    if (idx >= 0) { s.in50 += 1; s.sumRank += idx + 1; if (idx === 0) s.hit1 += 1; } else { s.sumRank += 999; }
  }
  let tn = 0, ti = 0, th = 0, tr = 0;
  const parts = [];
  for (const [k, v] of Object.entries(stat)) {
    parts.push(`${k} ${(v.in50 / v.n * 100).toFixed(1)}%/${(v.hit1 / v.n * 100).toFixed(1)}%`);
    tn += v.n; ti += v.in50; th += v.hit1; tr += v.sumRank;
  }
  console.log(
    label.padEnd(22),
    `${(ti / tn * 100).toFixed(1)}%`.padStart(7),
    (tr / tn).toFixed(1).padStart(9),
    `${(th / tn * 100).toFixed(1)}%`.padStart(7),
    '  ', parts.join('  ')
  );
  return { ceiling: ti / tn, rank: tr / tn, top1: th / tn };
}

console.log('設定'.padEnd(22) + '天花板'.padStart(8) + '平均排名'.padStart(10) + '  top1'.padStart(8) + '   各類型（天花板/top1）');
console.log('─'.repeat(110));
const baseline = run('V5 停用（基線）', { wiki: null });
const results = [];
for (const w of WEIGHTS) {
  results.push({ w, graph: true, ...run(`w=${w} + 圖譜`, { v5Weight: w, wikiGraph: true }) });
}
for (const w of WEIGHTS) {
  results.push({ w, graph: false, ...run(`w=${w} 無圖譜`, { v5Weight: w, wikiGraph: false }) });
}

console.log('─'.repeat(110));
// 優先把「天花板**嚴格**高於基線」的設定排在前面：
// 天花板是 rerank 路徑的硬性上限（recallK=50 的天花板），
// 拿天花板換 top1 通常是虧本交易——少召回一題，top1 再高也救不回來。
const strictlyBetter = results.filter((r) => r.ceiling > baseline.ceiling && r.top1 > baseline.top1);
const better = strictlyBetter.length > 0
  ? strictlyBetter
  : results.filter((r) => r.ceiling >= baseline.ceiling && r.top1 > baseline.top1);
if (better.length === 0) {
  console.log('⚠️ 沒有任何設定在「天花板不下降」的前提下讓 top1 上升。');
  console.log('   維持基線（V5 停用）或調低權重重跑：--weights=0.02,0.05,0.08');
} else {
  const best = better.sort((a, b) => (b.top1 - a.top1) || (b.ceiling - a.ceiling))[0];
  console.log(`✅ 建議：V5_WEIGHT = ${best.w}（圖譜 ${best.graph ? '開' : '關'}）` +
    ` — 天花板 ${(best.ceiling * 100).toFixed(1)}%（基線 ${(baseline.ceiling * 100).toFixed(1)}%）、` +
    `top1 ${(best.top1 * 100).toFixed(1)}%（基線 ${(baseline.top1 * 100).toFixed(1)}%）`);
  console.log('   記得把結果寫回 core/agent-retrieval.js 的 V5_WEIGHT 與 DIM_WEIGHTS。');
}
