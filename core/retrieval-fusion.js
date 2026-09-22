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
import { neutralizeDelimiters } from './prompt-sanitize.js';

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
const AGENT_MEDIUM = 0.20;        // 中置信門檻（新增），用於 top-1 判定
const L2_LEAD_MARGIN = 0.4;       // top-1 比第 K 筆高 ≥0.4 視為「明確領先」
const AGENT_MIN_CONSISTENT = 3;   // topK=5 中至少 3 筆高置信才算「強一致」
const AGENT_MIN_MODERATE = 1;     // topK=5 中至少 1 筆高置信，視為「中等信心」（保險版）

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
  // 五個獨立信號：
  //  (1) l2Leads：L2 top-1 比第 K 筆分數高 ≥ L2_LEAD_MARGIN（明確領先）
  //  (2) l2HasAny：L2 至少回傳 1 筆（有候選）
  //  (3) agentConsistent：agent **自己** topK 中 ≥ AGENT_MIN_CONSISTENT 筆 conf ≥ 0.35（強一致）
  //  (4) agentUseful：agent topK 中 ≥ AGENT_MIN_USEFUL 筆 conf ≥ 0.20（有用訊號，即使 agent 報 low-confidence）
  //  (5) agentTop1Useful：agent top-1 單獨 conf ≥ 0.20（足以當首選候選）
  //
  // 決策邏輯（2026-09-22 修正）：
  //   之前門檻 0.35 + 3 筆一致性要求太嚴。實測：26 題 no-match 實際命中，
  //   但 agent top-1 只在 0.15~0.30 置信。新策略是降低門檻至 0.20，
  //   只要有中置信訊號就採用（相對於盲目拒絕 no-match）。
  //
  //   adopt               : agentConsistent && (l2Leads || l2HasAny)
  //   adopt-with-warning  : (l2Leads && !agentSelfHonest) || (agentTop1Useful && l2HasAny && !agentSelfHonest)
  //   no-match            : !l2HasAny && !agentUseful  (徹底無訊號)
  //
  const l2KthScore = l2Results.length >= topK
    ? (l2Results[topK - 1]?.score ?? 0)
    : (l2Results[l2Results.length - 1]?.score ?? 0);
  const l2Top1Score = l2Results[0]?.score ?? 0;
  const l2Leads = l2Results.length > 1 && (l2Top1Score - l2KthScore) >= L2_LEAD_MARGIN;
  const l2HasAny = l2Results.length > 0;
  const agentTop1 = agentResult.topK[0] ?? null;
  const agentConf = agentTop1?.confidence ?? 0;
  const agentDecision = agentResult.decision;
  // 強一致性（原有）：topK 中至少 3 筆 conf ≥ 0.35。
  const agentConsistentCount = agentResult.topK.filter((x) => x.confidence >= AGENT_HIGH).length;
  const agentSelfHonest = agentDecision === 'low-confidence' || agentDecision === 'no-match';
  const agentConsistent = !agentSelfHonest && agentConsistentCount >= AGENT_MIN_CONSISTENT;

  // 中等信心（新增）：topK 中至少 1 筆 conf ≥ 0.35（高置信），但少於 3 筆（不達強一致）。
  // 這提供了介於「強一致→高信心採用」與「無訊號→拒絕」之間的選項。
  const agentModerateCount = agentResult.topK.filter((x) => x.confidence >= AGENT_HIGH).length;
  const agentModerate = agentModerateCount >= AGENT_MIN_MODERATE && agentModerateCount < AGENT_MIN_CONSISTENT;

  let decision, source, fallbackHint = '', confidence = agentConf;

  if (agentConsistent && (l2Leads || l2HasAny)) {
    // agent 一致高置信（≥3 筆 conf≥0.35）+ L2 有候選 → 採用（最高信心）
    decision = 'adopt';
    source = l2Leads ? 'both' : 'agent-only';
  } else if (l2Leads && !agentSelfHonest) {
    // L2 有明確領先、agent 未自報無匹配 → 採用加誠實提示
    decision = 'adopt-with-warning';
    source = 'l2-only';
    fallbackHint = 'L2 有明確領先候選，但 agent 端置信度不一致（高置信 ' +
      agentConsistentCount + '/' + agentResult.topK.length + ' 筆），' +
      '建議用 list_tools 依分類覆核。';
  } else if (agentModerate && l2HasAny) {
    // agent 中等信心（1 筆以上高置信，但少於 3 筆）+ L2 有候選
    // → 採用加誠實提示。比強一致寬鬆，但維持 L2 依賴作為誠實性保障。
    decision = 'adopt-with-warning';
    source = 'agent-only';
    fallbackHint = 'Agent 端有高置信候選，但信心不足（高置信 ' +
      agentConsistentCount + '/' + agentResult.topK.length + ' 筆）。' +
      '建議以 list_tools 覆核。';
  } else if (agentDecision === 'high-confidence' && l2HasAny) {
    // agent 自報高置信 + L2 有候選 → 採 agent 結果
    decision = 'adopt-with-warning';
    source = 'agent-only';
    fallbackHint = 'Agent 端 top-1 高置信，但 L2 無明確領先。建議以 list_tools 覆核。';
  } else {
    // 兩者皆弱 → 誠實回傳「無工具」
    // 條件：agent 未達中等信心（<1 高置信筆，或自報 no-match） && L2 無候選
    decision = 'no-match';
    source = 'none';
    confidence = agentConf;
    fallbackHint = '工具庫暫無對應工具。建議：' +
      '(a) 用 list_tools 依分類翻找；(b) 重新描述需求加入具體技術詞；' +
      '(c) 若屬「無家可歸」需求，可能是工具庫缺該類工具。';
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

  // 3b. 讓 agent 的高置信結果有機會競爭首位
  //
  // 實測（2026-09-15，擴充 trigger 後）：agent 引擎 Hit@1 從 11.9% 升到
  // 19.0%，但 fusion 停在 7.1%——因為 merged 是先放滿 L2 的所有結果，
  // agent 只能「補 L2 沒有的」，等於 L2 永遠佔住首位。
  // 這裡讓 agent 明確高置信（≥ AGENT_HIGH）且通過誠實門檻的 top-1 提到最前。
  //
  // 排除條件：L2 若已明確領先（l2Leads）代表詞彙端有很強的訊號，
  // 此時不覆蓋，避免犧牲 L1/L2 精確匹配的優勢。
  if (agentTop1 && agentTop1.confidence >= AGENT_HIGH && !agentSelfHonest && !l2Leads) {
    const i = merged.findIndex((x) => x.id === agentTop1.id);
    if (i > 0) {
      const [hit] = merged.splice(i, 1);
      merged.unshift(hit);
    }
  }

  // 3c. 決策已是 no-match 時，把 agent 的 top-1 提到首位。
  //
  // 實測（2026-09-16）：agent 對、fusion 錯的 5 筆，agent 的 confidence 都只有
  // 21~29%，未達 0.35 門檻，所以 3b 不觸發，fusion 就回傳了 L2 的結果。
  //
  // 關鍵：decision 已是 no-match，代表**已經明示「不確定」**，
  // 此時把最有希望的候選放前面並不損害誠實性——呼叫端本來就知道不可盡信。
  // 這讓「誠實」與「有用」不再互斥：照樣說不知道，但給出最好的猜測。
  // 空集查詢不受影響（decision 仍為 no-match，語意不變）。
  if (decision === 'no-match' && agentTop1) {
    const i = merged.findIndex((x) => x.id === agentTop1.id);
    if (i > 0) {
      const [hit] = merged.splice(i, 1);
      merged.unshift(hit);
    }
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
 *
 * 實測（2026-09-16，trigger 擴充後）天花板隨 K 的變化：
 *   top-10 → 64.3%　top-20 → 78.6%　**top-50 → 90.5%**　top-100 → 92.9%
 * top-20 之後最大的躍升在 top-50（+5 筆），再往上邊際效益驟減。
 *
 * 對應的 rerank 實測 Hit@1：
 *   top-20 → 57.1%　**top-50 → 73.8%**（達天花板 82%）
 * 故 recallK 預設取 50——候選變多雖讓 prompt 變長，但換到 +16.7 個百分點。
 *
 * 注意：診斷顯示多數「失敗」其實是**排序問題而非召回問題**——
 * 期望工具常落在第 33~73 名。擴大候選範圍比改架構更直接有效。
 *
 * 離線安全：無 API key 時 rerank 直接略過，回傳原順序（與 retrieve() 相同）。
 * API 失敗時亦同，絕不因 rerank 故障而讓整個檢索失效。
 *
 * @param {object[]} tools
 * @param {string} query
 * @param {object} [options]
 * @param {number} [options.topK=5] - 最終回傳筆數
 * @param {number} [options.recallK=30] - rerank 前的召回筆數（天花板）
 * @param {boolean} [options.rerank] - 明確停用請傳 false；預設有 key 就啟用
 * @returns {Promise<object>} retrieve() 的結果，外加 rerank 欄位
 */
export async function retrieveWithRerank(tools, query, options = {}) {
  // recallK 由 50 降為 30。
  //
  // ✅ 2026-09-20 末以 v1.3.0（267 題）重新驗證，**結論更強**：
  //
  //   配對 A/B（209 題有效配對）：
  //     top-30：168/209 = 80.4%
  //     top-50：168/209 = 80.4%
  //     差異 **0.0pp**；McNemar 不一致對 22（11 vs 11，完全對稱），p = 1.000
  //   天花板：top-30 = 95.7%、top-50 = 98.1%（差 2.4pp）
  //
  //   → 天花板明明低 2.4pp，端到端卻**一模一樣**——
  //     因為候選越短，LLM 的挑選準確率越高，兩者正好抵銷。
  //   → 結論：用 top-30，省 40% token。
  //
  // 舊評測集 v1.2.0 的數據（**不可與上表直接比較**）：
  //
  //   recallK   天花板   Hit@1    挑選準率   prompt 成本
  //   30       95.0%    80.3%    84.5%       16.5k 字
  //   50       96.9%    80.9%    83.5%       27.5k 字
  //   差異     -1.9pp   -0.6pp                -40%
  //
  //   McNemar：都對 121／只 30 對 5／只 50 對 6／都錯 25，p = 1.000 → 無差異
  //
  // 🔴 注意：這個結論是 V5 上線**之後**才成立的。
  //    2026-09-19 曾用 top-30 而否決，理由是「天花板被鎖在 85.7%」——
  //    那是 V5 之前的數字。V5 讓 top-30 的天花板升到 95.0%，取捨因此翻轉。
  //    → 召回引擎改善後，**既有的成本／品質取捨要重新量**，不能直接沿用舊結論。
  //
  // 省下的 token 直接轉換成更少的 429（本端點限制是 TPM，見 HANDOFF 陷阱 21）。
  const { topK = 5, recallK = 30 } = options;

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
  const { rerankCandidates, promote, buildCandidateText, RICH_DESC_LIMIT_WITH_INTENTS } = await import('./llm-rerank.js');
  const { loadWikiCached } = await import('./wiki-matcher.js');
  // 2026-09-19：改餵完整 metadata（含適用情境/能力/優勢），實測 Hit@1 +8.0pp。
  // 只給 120 字 description 時 LLM 判斷依據不足——這是「挑不準」的主因之一。
  //
  // 2026-09-20：再加上知識編譯詞條的 intents（使用者情境句）。
  // 上限由 RICH_DESC_LIMIT(400) 提到 RICH_DESC_LIMIT_WITH_INTENTS(550)——
  // 實測加 intents 後中位 324 字、p90 459 字，若維持 400 會有 20.9% 被截斷。
  const wikiDoc = loadWikiCached();
  const candidates = base.results.map((x) => ({
    id: x.id,
    description: buildCandidateText(
      tools.find((t) => t.id === x.id) || { description: x.description },
      RICH_DESC_LIMIT_WITH_INTENTS,
      { intents: wikiDoc?.entries?.[x.id]?.intents || [] },
    ),
  }));

  const { picked, error } = await rerankCandidates(query, candidates, {
    maxRetries: 1,
    timeoutMs: 12000,
    descLimit: RICH_DESC_LIMIT_WITH_INTENTS,
  });

  if (!picked) return skip(error || 'no pick');

  // 3. 把選中項提到首位，其餘維持原順序，再截斷回 topK
  return {
    ...base,
    results: promote(base.results, picked).slice(0, topK),
    rerank: { applied: true, picked },
  };
}

// ── 自適應 HyDE 參數 ──────────────────────────────────────────────────────
//
// L2 score 分佈有一個清晰的雙峰間隙（2026-09-22 實測，v1.3.0，257 筆非空集）：
//   [0.00, 0.04]：真零詞彙命中（38 筆：9 direct / 25 semantic / 4 constrained）
//   [0.05, 0.17]：完全沒有任何查詢落在這個區間（gap）
//   [0.18, ∞  ]：有詞彙命中的查詢（219 筆）
//
// 故 0.10 是完全乾淨的切割線：低於它 = 語意查詢，高於它 = 有詞彙基礎的查詢。
const HYDE_L2_THRESHOLD = 0.10;
const HYDE_API_BASE = 'https://apihub.agnes-ai.com/v1';
const HYDE_MODEL = process.env.RERANK_MODEL || 'agnes-3.0-flash';
const _DECISION_RANK = { adopt: 3, 'adopt-with-warning': 2, ambiguous: 1, 'no-match': 0 };

/**
 * 自適應 HyDE（Hypothetical Document Expansion）
 *
 * 只對「詞彙真空」查詢套用假想文件擴充，避開 direct / constrained 查詢。
 *
 * 觸發條件（雙重閾值，缺一不可）：
 *   1. decision !== 'adopt'（融合層未給出確定答案）
 *   2. l2Top.score < 0.10（L2 近乎零詞彙命中 = 真正的語意跳躍查詢）
 *
 * 為什麼要第二個條件：
 *   前次實驗（2026-09-20，三回合）僅用條件 1 觸發，導致 direct 查詢也跑 HyDE，
 *   direct 天花板 -2.4pp。根因是 direct 查詢雖然 decision 可能是 no-match，
 *   但 L2 score 仍有詞彙命中（≥ 0.10）——HyDE 反而干擾正確方向。
 *   加條件 2 後，只有「真零詞彙」查詢觸發，覆蓋 38/257 = 15%（vs 原來 ~70%）。
 *
 * 保守替換策略：secondPass.decision 必須**嚴格優於** firstPass 才替換，
 * 避免 LLM 改寫的隨機抖動把已成功的查詢改壞。
 *
 * @param {object[]} tools
 * @param {string} query
 * @param {object} [options] — 同 retrieve()
 * @returns {Promise<object>} retrieve() 的結果，外加 hyde.* 欄位
 */
export async function retrieveWithAdaptiveHyDE(tools, query, options = {}) {
  const firstPass = retrieve(tools, query, options);

  if (firstPass.decision === 'adopt') {
    return { ...firstPass, hyde: { triggered: false, reason: 'adopt' } };
  }

  const l2Score = firstPass.l2Top?.score ?? 0;
  if (l2Score >= HYDE_L2_THRESHOLD) {
    return { ...firstPass, hyde: { triggered: false, reason: 'l2-match', l2Score } };
  }

  const { nextKey, reportSuccess, reportFailure } = await import('./llm-keys.js');
  const hypothetical = await _generateHypotheticalDoc(query, { nextKey, reportSuccess, reportFailure });
  if (!hypothetical) {
    return { ...firstPass, hyde: { triggered: false, reason: 'no-key-or-error' } };
  }

  const expandedQuery = `${query} ${hypothetical}`;
  const secondPass = retrieve(tools, expandedQuery, options);

  const firstRank  = _DECISION_RANK[firstPass.decision]  ?? 0;
  const secondRank = _DECISION_RANK[secondPass.decision] ?? 0;
  const best = secondRank > firstRank ? secondPass : firstPass;

  return {
    ...best,
    hyde: {
      triggered: true,
      improved: secondRank > firstRank,
      firstDecision: firstPass.decision,
      secondDecision: secondPass.decision,
      hypothetical,
    },
  };
}

async function _generateHypotheticalDoc(query, { nextKey, reportSuccess, reportFailure }) {
  const key = nextKey();
  if (!key) return null;

  const prompt =
    '你是一個 AI 工具資料庫的編目員。使用者用口語描述了一個需求，請把它改寫成一段' +
    '假想工具的技術描述（2～3 句），就像這個工具的 GitHub README 第一段：' +
    '用工具本身的技術術語，描述它的功能與用途。\n\n' +
    '注意：直接輸出技術描述，不要加「這個工具」「假想工具」「根據您的需求」等前綴；' +
    '使用可能出現在工具 metadata 的術語；不要超過 60 字。\n\n' +
    `使用者需求：${neutralizeDelimiters(query)}`;

  try {
    const res = await fetch(`${HYDE_API_BASE}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: HYDE_MODEL,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 120,
        temperature: 0.3,
      }),
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) { reportFailure(key); return null; }
    reportSuccess(key);
    const data = await res.json();
    return data.choices?.[0]?.message?.content?.trim() || null;
  } catch {
    reportFailure(key);
    return null;
  }
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
