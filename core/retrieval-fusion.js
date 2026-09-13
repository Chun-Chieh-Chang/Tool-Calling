#!/usr/bin/env node
/**
 * retrieval-fusion.js — 融合 L2 關鍵字引擎與 agent-retrieval 引擎（純函式，唯讀）
 *
 * 設計原則（docs/agent-retrieval-design.md §4.3）
 * ─────────────────────────────────────────────
 * agent-retrieval 是 L2 的**補充層**，不是替代品：
 * - L2 強在「trigger / description 詞彙命中」
 * - agent-retrieval 強在「四維獨立評分 + confidence 決策 + 誠實訊號」
 * 融合策略：
 * - 若 L2 top-1 分數高 + agent high-confidence → 採用（兩邊一致）
 * - 若 L2 有結果但 agent low-confidence / no-match → 提示 agent「可能無對應工具」
 * - 兩者皆弱 → 誠實回傳「工具庫缺此類工具」
 *
 * 本模組不修改任何資料，只回傳融合結果。
 */

import { search } from './search-engine.js';
import { agentRetrieve } from './agent-retrieval.js';

// ── 融合參數 ─────────────────────────────────────────────────────────────
//
// 實測發現（696 筆、L1.5 層）：
//   L1.5 回傳的是「所有 trigger 整串命中的工具」，因此：
//   - 真實命中（scrape JS-rendered）→ 4 筆全 2.17 tie（flat）
//   - 偽命中（k8s 部署、node）       → 2 筆全 2.36 tie（flat）
//   - 真命中（summarize video）      → 5 筆 2.72/2.13/2.13/2.13/1.83（leads）
//   光看 L2 的「flat vs leads」無法區分「真 vs 偽」，因為 L1.5 對
//   「通用 trigger 被多筆工具同時命中」一律回 flat 列表。
//
// 關鍵訊號改看 **agent 端的一致性**：
//   agent 的四維獨立評分對「通用 trigger 偽命中」會把多数工具壓低
//   （confidence < 0.15），對「真正相關群」會讓 3+ 筆達 high-confidence。
//   實測：
//   - 空集「k8s 部署」→ agent topK=5 中只有 2 筆 conf≥0.35
//   - 空集「clean jsonl」→ 5 筆 conf≥0.35（但其實都是通用 trigger 命中，
//     agent 端仍無法區分；這是詞彙空間天花板，需 embedding 才能突破）
//   - HIT「summarize video」→ 5 筆 conf≥0.35
//
// 決策矩陣（最終）：
//   agentConsistent : agent topK 中 ≥ AGENT_MIN_CONSISTENT 筆 conf ≥ 0.35
//   adopt           : agentConsistent && (l2Leads || l2HasAny)
//   adopt-with-warning : l2Leads && !agentConsistent
//   no-match        : !l2Leads && !agentConsistent
//
// 注意：「clean jsonl」這類空集查詢 agent 端仍會誤判 high-confidence，
// 這是 agent-retrieval 引擎本身的詞彙天花板，融合層只能誠實回傳
// agent 的自報決策，無法比 agent 更聰明。
const AGENT_HIGH = 0.35;          // 與 agent-retrieval 的 BEST_DIM_THRESHOLD 一致
const L2_LEAD_MARGIN = 0.4;       // top-1 比第 K 筆高 ≥0.4 視為「明確領先」
const AGENT_MIN_CONSISTENT = 3;   // topK=5 中至少 3 筆高置信才算「一致」

/**
 * 融合檢索：對同一查詢同時跑 L2 與 agent-retrieval，回傳融合結果。
 * @param {object[]} tools - 工具註冊表（registry.tools）
 * @param {string} query - 自然語言查詢
 * @param {object} [options]
 * @param {number} [options.topK=5] - 回傳前 K 筆
 * @param {string} [options.category] - 限定分類（只傳給 L2）
 * @param {string} [options.language] - 限定語言（只傳給 L2）
 * @param {object} [options.telemetryStats] - telemetry 軌跡（只傳給 L2）
 * @returns {object} {
 *   query,
 *   decision: "adopt" | "adopt-with-warning" | "no-match" | "ambiguous",
 *   confidence: 0~1,  // 融合後的誠實置信度（取 agent 的 confidence）
 *   fallbackHint: string, // 低置信度 / no-match 時給 agent 的下一步
 *   source: "both" | "agent-only" | "l2-only" | "none",
 *   results: [{ id, name, category, description, score, matchLevel, source, confidence, reasons }],
 *   l2Top: object | null,    // L2 的 top-1（供調試）
 *   agentTop: object | null,  // agent 的 top-1（供調試）
 * }
 */
export function retrieve(tools, query, options = {}) {
  const { topK = 5, category, language, telemetryStats } = options;

  // 1. 跑兩套引擎
  const l2Results = search(tools, query, { topK, category, language, telemetryStats });
  const agentResult = agentRetrieve(tools, query, { topK });

  // 2. 取訊號做決策矩陣
  //
  // 三個獨立信號：
  //  (1) l2Leads：L2 top-1 比第 K 筆分數高 ≥ L2_LEAD_MARGIN（明確領先）
  //  (2) l2HasAny：L2 至少回傳 1 筆（有候選）
  //  (3) agentConsistent：agent **自己** topK 中 ≥ AGENT_MIN_CONSISTENT 筆 conf ≥ 0.35
  //
  // 決策矩陣：
  //   adopt               : agentConsistent && (l2Leads || l2HasAny)
  //   adopt-with-warning  : l2Leads && !agentConsistent
  //   no-match            : !l2Leads && !agentConsistent
  //
  // 設計意圖：以 agent 一致性為「敢不敢說知道」的主要訊號，
  // L2 只作為「有沒有候選」的輔助。兩者皆弱 → 誠實回傳「無工具」。
  const l2KthScore = l2Results.length >= topK
    ? (l2Results[topK - 1]?.score ?? 0)
    : (l2Results[l2Results.length - 1]?.score ?? 0);
  const l2Top1Score = l2Results[0]?.score ?? 0;
  const l2Leads = l2Results.length > 1 && (l2Top1Score - l2KthScore) >= L2_LEAD_MARGIN;
  const l2HasAny = l2Results.length > 0;
  const agentTop1 = agentResult.topK[0] ?? null;
  const agentConf = agentTop1?.confidence ?? 0;
  const agentDecision = agentResult.decision;
  // 一致性門檻：看 agent **自己** 的 topK（非融合後），至少 N 筆 conf ≥ 0.35
  const agentConsistentCount = agentResult.topK.filter((x) => x.confidence >= AGENT_HIGH).length;
  const agentConsistent = agentConsistentCount >= AGENT_MIN_CONSISTENT;

  let decision, source, fallbackHint = '', confidence = agentConf;

  if (agentConsistent && (l2Leads || l2HasAny)) {
    // agent 一致高置信 + L2 有候選 → 採用
    decision = 'adopt';
    source = l2Leads ? 'both' : 'agent-only';
  } else if (l2Leads && !agentConsistent) {
    // L2 有明確領先但 agent 不一致 → 採用但加誠實提示
    decision = 'adopt-with-warning';
    source = 'l2-only';
    fallbackHint = 'L2 有明確領先候選，但 agent 端置信度不一致（topK 高置信僅 ' +
      agentConsistentCount + '/' + agentResult.topK.length + ' 筆），' +
      '建議用 list_tools 依分類覆核。';
  } else {
    // 兩者皆弱 → 誠實回傳「無工具」
    decision = 'no-match';
    source = 'none';
    confidence = agentConf;
    fallbackHint = '工具庫暫無高置信度對應工具。建議：' +
      '(a) 用 list_tools 依分類翻找；(b) 重新描述需求加入具體技術詞；' +
      '(c) 若屬「無家可歸」需求，可能是工具庫缺該類工具（參考 dynamic-k 報告）。';
  }

  // 3. 融合結果：以 L2 為主（詞彙命中強），agent 的 topK 補上 L2 沒有的 id
  const merged = [];
  const seen = new Set();
  for (const r of l2Results.slice(0, topK)) {
    if (seen.has(r.tool.id)) continue;
    seen.add(r.tool.id);
    merged.push({
      id: r.tool.id,
      name: r.tool.name,
      category: r.tool.category,
      description: (r.tool.description || '').slice(0, 300),
      score: r.score,
      matchLevel: r.matchLevel,
      source: 'L2',
      confidence: undefined,
      reasons: r.matchedKeywords?.slice(0, 4) || [],
    });
  }
  for (const a of agentResult.topK) {
    if (seen.has(a.id)) continue;
    seen.add(a.id);
    merged.push({
      id: a.id,
      name: a.name,
      category: a.category,
      description: '',
      score: a.score,
      matchLevel: 'agent-retrieval',
      source: 'agent',
      confidence: a.confidence,
      reasons: a.reasons?.slice(0, 4) || [],
    });
  }

  // 重新排序：L2 結果保持原分數；agent 補充結果的 score 維持 0~1 量級
  // 用 source 標記讓调用端知道哪邊來的
  return {
    query,
    decision,
    confidence: Number(confidence.toFixed(4)),
    fallbackHint,
    source,
    results: merged.slice(0, topK),
    l2Top: l2Results[0] ? {
      id: l2Results[0].tool.id,
      score: l2Results[0].score,
      matchLevel: l2Results[0].matchLevel,
    } : null,
    agentTop: agentTop1,
    totalCandidates: agentResult.totalCandidates,
    matched: agentResult.matched,
    // 調試用：agent 端的決策細節
    agentDecision: agentDecision,
    agentConsistentCount,
    l2Leads,
    agentConsistent,
  };
}

// ── CLI 入口（僅在直接執行時）────────────────────────────────────────────
// 用法：node core/retrieval-fusion.js "query" [topK]
if (process.argv[1] && process.argv[1].endsWith('retrieval-fusion.js')) {
  import('node:fs').then(({ readFileSync }) => {
    import('node:path').then((path) => {
      import('node:url').then(({ fileURLToPath }) => {
        const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
        const j = JSON.parse(readFileSync(path.join(ROOT, 'registry', 'tools.json'), 'utf8'));
        const tools = j.tools.filter((t) => t.status === 'active' || t.status === 'experimental');
        const args = process.argv.slice(2);
        const q = args[0] || 'scrape a JS-rendered dashboard and extract tables';
        const topK = parseInt(args[1], 10) || 5;
        const r = retrieve(tools, q, { topK });
        console.log(JSON.stringify(r, null, 2));
      });
    });
  });
}
