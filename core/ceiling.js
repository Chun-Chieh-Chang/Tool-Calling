/**
 * ceiling.js — 天花板分析的純邏輯（2026-10-15 Q5=A 抽出，供可測）
 *
 * 為什麼抽出來：`scripts/ceiling-analysis.js` 是頂層執行的 CLI，跑一次整庫
 * （771 支 × 257 題）要 ~16 秒——把它整支丟進 `npm test` 太貴。這裡只留
 * 「給定 cases 與 tools，算出每題排名與失敗分類」的純函式，測試用小樣本
 * 秒級跑完；CLI 仍然吃同一份邏輯，兩邊不會漂移。
 *
 * 失敗分類（MEMORY §2：「多數失敗是排序問題，不是召回問題」）：
 *   · recallMiss：正解完全沒進 top-K → 真正的召回缺口
 *   · rankLoss  ：正解進榜但排名 > rankThreshold（預設 5）→ 排序問題
 */
import { agentRetrieve } from './agent-retrieval.js';
import { extractIntent, weightsForIntent } from './query-intent.js';

/**
 * 逐題算排名。
 * @param {object[]} cases - eval-queries 的 cases
 * @param {object[]} tools - 已篩過 status 的工具
 * @param {number} topK
 * @returns {{stat: object, records: object[]}}
 */
export function analyzeCases(cases, tools, topK = 50) {
  const stat = {};
  const records = [];
  for (const c of cases.filter((x) => x.type !== 'empty-set')) {
    const it = extractIntent(c.query);
    const top = agentRetrieve(tools, c.query, { topK, intentWeights: weightsForIntent(it) }).topK.map((y) => y.id);
    let idx = -1;
    for (const e of c.expected) {
      const i = top.indexOf(e);
      if (i >= 0 && (idx < 0 || i < idx)) idx = i;
    }
    stat[c.type] = stat[c.type] || { n: 0, in50: 0, sumRank: 0, hit1: 0 };
    const s = stat[c.type];
    s.n += 1;
    if (idx >= 0) { s.in50 += 1; s.sumRank += idx + 1; if (idx === 0) s.hit1 += 1; } else { s.sumRank += 999; }
    records.push({
      id: c.id,
      type: c.type,
      query: c.query,
      expected: c.expected,
      bestRank: idx >= 0 ? idx + 1 : null,
      top1: top[0] || null,
      top5: top.slice(0, 5),
    });
  }
  return { stat, records };
}

/** 把 records 分成兩類失敗 */
export function summarizeFailures(records, { rankThreshold = 5 } = {}) {
  const recallMiss = records.filter((r) => r.bestRank === null);
  const rankLoss = records.filter((r) => r.bestRank !== null && r.bestRank > rankThreshold);
  return { recallMiss, rankLoss };
}

/** 聚合表格（與 CLI 原本的版面一字不差） */
export function formatTable(stat) {
  const lines = ['類型          筆數   天花板(top50)   平均排名   top1命中', '─'.repeat(60)];
  let tn = 0, ti = 0, th = 0;
  for (const [k, v] of Object.entries(stat)) {
    lines.push(
      '  ' + k.padEnd(13) + String(v.n).padStart(3) + '      ' + (v.in50 / v.n * 100).toFixed(1).padStart(5) + '%      ' +
      (v.sumRank / v.n).toFixed(1).padStart(6) + '      ' + (v.hit1 / v.n * 100).toFixed(1) + '%'
    );
    tn += v.n; ti += v.in50; th += v.hit1;
  }
  lines.push('─'.repeat(60));
  lines.push('  合計        ' + String(tn).padStart(3) + '      ' + (ti / tn * 100).toFixed(1) + '%            ' + (th / tn * 100).toFixed(1) + '%');
  lines.push('');
  lines.push('天花板 = 答案有無進 top-50（召回能力）');
  lines.push('平均排名 = 在 top-50 內排第幾（999 = 沒進）；top1 命中 = 答案是否排第一');
  return lines.join('\n');
}

/** 失敗清單（人眼可讀；--failures 用） */
export function formatFailures(records, { topK = 50, rankThreshold = 5, limit = 40, only = null } = {}) {
  const { recallMiss, rankLoss } = summarizeFailures(records, { rankThreshold });
  let list = records.filter((r) => r.bestRank === null || r.bestRank > rankThreshold);
  if (only === 'recall') list = recallMiss;
  if (only === 'rank') list = rankLoss;

  const out = [];
  out.push('');
  out.push(`── 失敗清單（topK=${topK}）────────────────────────────────────────`);
  out.push(`召回缺口（未進 top-${topK}）：${recallMiss.length} 題　｜　排序問題（進榜但排名 > ${rankThreshold}）：${rankLoss.length} 題`);
  out.push('');
  const byType = {};
  for (const r of list) (byType[r.type] = byType[r.type] || []).push(r);
  for (const [type, rs] of Object.entries(byType)) {
    out.push(`【${type}】${rs.length} 題`);
    for (const r of rs.slice(0, limit)) {
      const where = r.bestRank === null ? `未進 top-${topK}` : `排名 ${r.bestRank}`;
      out.push(`  ${r.id} [${where}] ${r.query}`);
      out.push(`      正解: ${r.expected.join(', ')}`);
      out.push(`      top5: ${r.top5.join(', ')}`);
    }
    if (rs.length > limit) out.push(`  … 其餘 ${rs.length - limit} 題略（--limit 調整）`);
    out.push('');
  }
  return out.join('\n');
}
