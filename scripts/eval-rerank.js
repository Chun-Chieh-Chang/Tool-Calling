#!/usr/bin/env node
/**
 * eval-rerank.js — 量測 LLM rerank 對工具選用的增益
 *
 * 流程：詞彙引擎（agent-retrieval）召回 top-K → LLM 從候選中選最佳 → 比較 Hit@1
 *
 * 用法
 * ────
 *   AGNES_API_KEY=sk-... npm run eval:rerank
 *   AGNES_API_KEY=sk-... node scripts/eval-rerank.js --topK=20 --model=agnes-2.5-flash
 *   node scripts/eval-rerank.js --verbose          # 列出未命中明細
 *   node scripts/eval-rerank.js                    # 無 key：只跑 baseline（離線安全）
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { agentRetrieve } from '../core/agent-retrieval.js';
import { extractIntent, weightsForIntent } from '../core/query-intent.js';
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

// 與正式路徑（retrieval-fusion.js）共用同一份候選描述產生邏輯，
// 否則評測數字會與實際上線行為脫節。
const descOf = (id) => buildCandidateText(tools.find((x) => x.id === id));

const hasKey = Boolean(process.env.AGNES_API_KEY);

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

  const { picked, error } = await rerankCandidates(
    c.query,
    cands.map((id) => ({ id, description: descOf(id) })),
    { ...(MODEL ? { model: MODEL } : {}), descLimit: RICH_DESC_LIMIT },
  );
  if (error) { misses.push({ ...c, why: `rerank error: ${error}` }); continue; }
  apiOk++;

  const accept = [...c.expected, ...(c.alsoAcceptable || [])];
  if (c.alsoAcceptable?.length) looseCases++;
  if (picked && accept.includes(picked)) rerankLoose++;

  if (picked && c.expected.includes(picked)) rerankHit++;
  else misses.push({ ...c, picked, inCands: c.expected.some((e) => cands.includes(e)) });
}

const n = cases.length;
const pct = (a) => `${((a / n) * 100).toFixed(1)}%`;

console.log(`\n═══ LLM rerank 評測 ═══`);
console.log(`評測集 v${bench.version}　可命中 ${n} 筆　top-${K}　模型=${MODEL || '(預設)'}`);
console.log(`API key：${hasKey ? '已設定' : '未設定（僅跑 baseline）'}\n`);

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
