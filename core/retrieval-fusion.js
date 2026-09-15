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
import { extractIntent, weightsForIntent } from './query-intent.js';
import { loadVectors, cosine } from './embedding.js';

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
// 注意：「clean jsonl」這類空集查詢 agent 端仍會因 V2 bag-similarity 通道
// 誤判 high-confidence，這是純詞彙引擎的天花板。Option C 的「意圖三元組
// 權重調整」（query-intent.js）改善的是「物件/約束詞被 V2 誇大」的邊界
// 情形；對 V2 通道本身接住通用詞的偽命中（如 airllm 對 jsonl），純規則
// 無法壓制，需 Option B（語意 embedding）才能根治。
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
  // 意圖三元組（Option C）：抽出查詢中的物件/約束/動作訊號，
  // 調整 agent 端四維權重（物件→V2 加權、約束→V4 加權）。
  // 純規則，詞表可維護；對語意跳躍查詢（如 scrape dashboard → 瀏覽器引擎）
  // 幫助有限，屬詞彙天花板以內的最佳改良。
  const intent = extractIntent(query);
  const intentWeights = weightsForIntent(intent);
  const l2Results = search(tools, query, { topK, category, language, telemetryStats });

  // 語意 embedding（Option B）：
  //   vectors：預計算的工具向量（registry/embeddings/vectors.json），不存在 → null。
  //   queryVector：查詢文字的 embedding。
  //     - 離線（無 API key）：無法即時算查詢向量 → V0 停用，完全退化四維引擎。
  //     - 線上：若呼叫端提供 `options.queryVector`（數組）則直接使用；
  //       未提供時本模組也不自己去打 API（保持純函式、無副作用），V0 停用。
  // 因此 V0 只在「vectors 存在 且 呼叫端明確傳入 queryVector」時啟用。
  const vectors = loadVectors();
  const queryVector = (Array.isArray(options.queryVector) && options.queryVector.length > 0)
    ? options.queryVector
    : null;
  const agentResult = agentRetrieve(tools, query, { topK, intentWeights, vectors, queryVector });

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
  // 一致性門檻：看 agent **自己** 的 topK（非融合後），至少 N 筆 conf ≥ 0.35。
  // 若 agent 自身 decision 已是 low-confidence / no-match（誠實訊號），
  // 即使 topK 中有個別高置信筆也不視為一致——避免通用 trigger 偽命中
  // 透過 bag-similarity 通道把 confidence 撐到 0.35 以上。
  const agentConsistentCount = agentResult.topK.filter((x) => x.confidence >= AGENT_HIGH).length;
  const agentSelfHonest = agentDecision === 'low-confidence' || agentDecision === 'no-match';
  const agentConsistent = !agentSelfHonest && agentConsistentCount >= AGENT_MIN_CONSISTENT;

  let decision, source, fallbackHint = '', confidence = agentConf;

  if (agentConsistent && (l2Leads || l2HasAny)) {
    // agent 一致高置信 + L2 有候選 → 採用
    decision = 'adopt';
    source = l2Leads ? 'both' : 'agent-only';
  } else if (agentConsistent && l2HasAny) {
    // agent 未達「一致」但 top-1 高置信，且 L2 有候選 → 採但加誠實提示
    decision = 'adopt-with-warning';
    source = 'agent-only';
    fallbackHint = 'Agent 端 top-1 高置信，但 topK 未達一致門檻（高置信 ' +
      agentConsistentCount + '/' + agentResult.topK.length + ' 筆），' +
      '建議以 list_tools 覆核或重新描述需求。';
  } else if (l2Leads && !agentSelfHonest && !agentConsistent) {
    // L2 有明確領先、agent 未自報無匹配、但未達一致性 → 採用但加誠實提示
    decision = 'adopt-with-warning';
    source = 'l2-only';
    fallbackHint = 'L2 有明確領先候選，但 agent 端置信度不一致（topK 高置信僅 ' +
      agentConsistentCount + '/' + agentResult.topK.length + ' 筆），' +
      '建議用 list_tools 依分類覆核。';
  } else if (agentDecision === 'high-confidence' && l2HasAny) {
    // agent 自報高置信但 L2 無明確領先 → 採 agent 結果（保守版）
    decision = 'adopt-with-warning';
    source = 'agent-only';
    fallbackHint = 'Agent 端 top-1 高置信，但 L2 無明確領先，建議以 list_tools 覆核。';
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

/**
 * 融合檢索 + LLM rerank（async 版本）
 *
 * 為什麼需要較大的召回數：rerank 只能從候選中選，因此召回率就是它的天花板。
 * 實測 agent 引擎 top-5 召回率僅 33.3%，top-20 才有 54.8%。
 * 所以這裡先用 recallK（預設 20）召回，rerank 後再截斷回 topK。
 *
 * 離線安全：無 API key 時 rerank 直接略過，回傳原順序（與 retrieve() 相同）。
 * API 失敗時亦同，絕不因 rerank 故障而讓整個檢索失效。
 *
 * @param {object[]} tools
 * @param {string} query
 * @param {object} [options]
 * @param {number} [options.topK=5] - 最終回傳筆數
 * @param {number} [options.recallK=20] - rerank 前的召回筆數（天花板）
 * @param {boolean} [options.rerank] - 明確停用請傳 false；預設有 key 就啟用
 * @returns {Promise<object>} retrieve() 的結果，外加 rerank 欄位
 */
export async function retrieveWithRerank(tools, query, options = {}) {
  const { topK = 5, recallK = 20 } = options;

  // 1. 先用較大 K 召回，確保正確答案有機會進入候選
  const base = retrieve(tools, query, { ...options, topK: Math.max(topK, recallK) });

  const skip = (reason) => ({
    ...base,
    results: base.results.slice(0, topK),
    rerank: { applied: false, reason },
  });

  if (options.rerank === false) return skip('disabled');
  if (base.results.length === 0) return skip('no candidates');

  // 2. LLM rerank（動態 import：離線時也不增加啟動成本）
  const { rerankCandidates, promote } = await import('./llm-rerank.js');
  const descOf = (id) => tools.find((t) => t.id === id)?.description || '';
  const candidates = base.results.map((x) => ({
    id: x.id,
    description: x.description || descOf(x.id),
  }));

  const { picked, error } = await rerankCandidates(query, candidates, {
    maxRetries: 1,
    timeoutMs: 12000,
  });

  if (!picked) return skip(error || 'no pick');

  // 3. 把選中項提到首位，其餘維持原順序，再截斷回 topK
  return {
    ...base,
    results: promote(base.results, picked).slice(0, topK),
    rerank: { applied: true, picked },
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
