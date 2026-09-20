#!/usr/bin/env node
/**
 * agent-retrieval.js — Agent 導向的多維度工具檢索引擎（唯讀，不修改任何資料）
 *
 * 設計原則
 * ─────────
 * 1. 分類的目的是「讓 agent 自動選工具」，固定 18 分類是設計殘留、不是資料最優。
 * 2. 詞彙空間（TF-IDF）聚類結構極弱（silhouette < 0.016），加更多詞彙維度無效。
 * 3. 真正有鑑別力的維度是**結構性的**：identity / capability / scenario / constraint
 *    四個資訊獨立維度（Pearson r < 0.5，MECE）。
 * 4. 每一維度獨立評分 → 跨維度加權融合 → confidence 決策 → 誠實回傳「無高置信度工具」。
 * 5. 不依賴語意 embedding（需要外部模型），完全用現行 696 筆資料 + 規則。
 *
 * 維度定義（與 core/multidimensional.js 的 D1/D2/D3 收斂，但改以「檢索」為目標）
 * ─────────────────────────────────────────────────────
 * V1  identity      triggers + name + id（身分欄位；命中一次即成立）
 * V2  capability    capabilities 陣列 + description（功能欄位；需 ≥2 個不同信號）
 * V3  scenario      useCase + category + negativeConstraints（情境欄位）
 * V4  constraint    install.method + language + negativeConstraints（部署欄位）
 * V5  wiki          知識編譯詞條（core/wiki-matcher.js）
 *                   由 scripts/compile-wiki.js 離線把工具 metadata 「編譯」成
 *                   使用者語言的應用場景句（intents）+ 物件／動作（facets），
 *                   查詢時比對詞條並做知識圖譜一階擴散。
 *                   詞檔不存在 → 停用，「零回歸」退化成原四維引擎。
 *
 * 每個維度對 (query, tool) 回傳 0~1 的評分；融合時採用「取最佳維度」策略
 * （類比 classify 端的投票取最佳，把邊界工具拖回正區），再加權平均作為
 * confidence。若 confidence 低于閾值，誠實回傳「無高置信度工具」，
 * 而非偽裝一個 top-1。
 *
 * 輸出
 * ───
 * {
 *   query,
 *   topK: [{ tool, score, perDimension, reasons, confidence }],
 *   decision: "high-confidence" | "low-confidence" | "no-match",
 *   fallbackHint: string  (低置信度時給 agent 的下一步建議)
 * }
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadVectors, cosine } from './embedding.js';
import { getWikiIndex, wikiScore, loadWikiCached } from './wiki-matcher.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

// ── Tokeniser ────────────────────────────────────────────────────────────
// 斷詞／詞袋／IDF／加權相似度改由 core/tokenize.js 共用供應。
// 原因：wiki-matcher.js（知識編譯器配對端，V5）必須與本引擎用**同一套**
// 斷詞與相似度定義，否則兩邊的分數不能放在同一個加權公式裡比較。
// 抽出的同時保留既有行為（停用詞、bigram、IDF 公式完全不變）。
import { tokenize, bagOf, buildIdentityIdf, weightedSim } from './tokenize.js';

// 身分欄位的「完整 trigger 命中」：query 內的某 trigger 整段出現 → 強信號
// 這是 V1 的核心：agent 寫 query 時常直接包含 trigger 字串。
function triggerHit(queryBag, tool) {
  const triggers = (tool.triggers || []).map((s) => String(s).toLowerCase());
  const qText = [...queryBag.keys()].join(' ');
  for (const trig of triggers) {
    if (trig.length >= 4 && qText.includes(trig)) return trig;
  }
  return null;
}

// ── 查詢前處理 ────────────────────────────────────────────────────────────
function extractQuery(query) {
  const norm = String(query || '').toLowerCase().trim();
  const tokens = tokenize(norm);
  const bag = bagOf(tokens);
  return { norm, tokens, bag };
}

// 四個獨立維度：identity / capability / scenario / constraint
// 對 (query, tool) 回傳 0~1 的評分。

// V1 身分：trigger 完整命中（IDF 加權）+ id/name/token 重疊。
// trigger 命中不再給固定 0.9 —— 改為依 IDF：罕見 trigger（如 kubernetes）
// 命中給 0.95，常見 trigger（如 markdown、node、data）命中只給 ~0.4。
// 這是因為 agent 寫 query 時包含「markdown」很可能只是語境詞，不是身分。
//
// **全 token 覆蓋門控（2026-09-13 修正）**：
// 僅「V1 單一 hit」不足以判定身分——若查詢有 5 個有意義 token，
// 而命中 trigger 只覆蓋其中 1 個（例如 `lean` 命中 `clean and dedupe
// jsonl dataset` 中的 `lean` 子串，但跟 clean/dedupe/jsonl/dataset 全無關），
// 該 hit 應被「覆蓋率」打折：0.84 × 0.2 = 0.17 → 落到 V2/V3 端接。
// 對真實命中（如 `scrape` 命中 `scrape a JS-rendered dashboard`），
// 即使 V1 被覆蓋率打折，V2 會接住 dashboard/scrape/tables 等 capability
// 詞，confidence 仍達 0.35+。
// 通用詞（generic domain terms）：即使 df 低也不該拿自指信用，
// 因為它們是語境詞而非身分信號（`dataset`、`data`、`model`…）。
const GENERIC_TERMS = new Set([
  'data', 'dataset', 'model', 'tool', 'agent', 'ai', 'api', 'cli',
  'web', 'app', 'service', 'plugin', 'engine', 'framework', 'library',
  'large', 'small', 'fast', 'quick', 'easy', 'simple', 'basic',
]);

function queryTokenCoverage(q, trigger, idf) {
  // 統計查詢中有幾個「有意義 token」被該 trigger 整串覆蓋（子串包含）
  const trigNorm = String(trigger || '').toLowerCase().trim();
  if (!trigNorm) return 1; // 無 trigger → 不打折
  const qTokens = (q.tokens || []).filter((t) => t.length >= 2);
  if (qTokens.length === 0) return 1;

  let covered = 0;
  let selfRefIsRare = false;
  for (const qt of qTokens) {
    const coveredByTrigger = trigNorm.includes(qt) || qt.includes(trigNorm);
    if (coveredByTrigger) covered++;
    if (qt === trigNorm && !GENERIC_TERMS.has(qt)) {
      const selfRefDf = idf?.dfIdentity?.get(qt) ?? Infinity;
      if (selfRefDf <= 3) selfRefIsRare = true;
    }
  }

  // 罕見且非通用詞的自指命中 → 保底 0.5；通用詞 → 不保底。
  // 這樣 `summarize` 可保留身分信用，`dataset` 不會只靠單一通用詞撐起 high-confidence。
  const selfRefCredit = selfRefIsRare ? 0.5 : 0;
  return Math.max(covered / qTokens.length, selfRefCredit);
}
function scoreV1Identity(q, tool, idf) {
  const trigHit = triggerHit(q.bag, tool);
  let hitScore = 0;
  if (trigHit) {
    // trigger 本身作為單詞的 IDF：出現在越多工具越少，命中越有意義
    const trigTokens = tokenize(trigHit);
    const trigIdf = trigTokens.length > 0
      ? trigTokens.reduce((s, t) => s + (idf.idfIdentity.get(t) || 1), 0) / trigTokens.length
      : 1;
    // 全庫平均 IDF ≈ log(N) ≈ 6.5；常見詞 ~2，罕見詞 ~8
    const normIdf = Math.max(0, Math.min(1, (trigIdf - 1.5) / 6.0)); // 1.5→0, 7.5→1
    let raw = 0.3 + 0.65 * normIdf; // 常見 ~0.3-0.5，罕見 0.95
    // 全 token 覆蓋門控：罕見自指命中保底 0.5；子串偽命中按覆蓋率打折
    const cov = queryTokenCoverage(q, trigHit, idf);
    hitScore = raw * cov;
  }
  const identityTokens = [tool.id, tool.name, ...(tool.triggers || [])].filter(Boolean);
  const toolBag = bagOf(identityTokens.flatMap((s) => tokenize(s)));
  const idfScore = weightedSim(q.bag, toolBag, idf.idfIdentity, { weightA: 1.5, weightB: 1 });
  let v1 = Math.max(hitScore, idfScore);
  // 通用 trigger 偽命中上限：當 hit trigger 只覆蓋查詢極小部分（cov < 0.5），
  // 身分維度（V1 的 hit 或 idf 來源）都應被壓低，避免單一字串把整筆查詢拉高。
  if (trigHit) {
    const cov = queryTokenCoverage(q, trigHit, idf);
    if (cov < 0.5) v1 = Math.min(v1, 0.25);
  }
  return { value: v1, trigHit };
}

// V2 功能：capabilities 陣列 + description；IDF 加權。
function scoreV2Capability(q, tool, idf) {
  // description_zh：查詢以繁中為主，而全庫 87% 描述為英文，
  // 只比對原文會讓中文查詢系統性找不到這些工具。譯文與原文並存。
  const capText = [
    ...(tool.capabilities || []),
    tool.description || '',
    tool.description_zh || '',
  ].join(' ');
  const toolBag = bagOf(tokenize(capText));
  return { value: weightedSim(q.bag, toolBag, idf.idfIdentity, { weightA: 1, weightB: 1 }) };
}

// V3 情境：useCase + category + negativeConstraints。
function scoreV3Scenario(q, tool, idf) {
  const scenarioText = [
    tool.useCase || '',
    tool.useCase_zh || '',
    tool.category || '',
    ...(tool.negativeConstraints || []),
  ].join(' ');
  const toolBag = bagOf(tokenize(scenarioText));
  return { value: weightedSim(q.bag, toolBag, idf.idfIdentity, { weightA: 1, weightB: 1 }) };
}

// V4 部署：install.method + language + negativeConstraints。
function scoreV4Constraint(q, tool, idf) {
  const constraintText = [
    tool.install?.method || '',
    tool.language || '',
    ...(tool.negativeConstraints || []),
  ].join(' ');
  const toolBag = bagOf(tokenize(constraintText));
  return { value: weightedSim(q.bag, toolBag, idf.idfIdentity, { weightA: 1, weightB: 1 }) };
}

// ── 融合策略 ─────────────────────────────────────────────────────────────
// 取最佳維度（max）作為 confidence，再加權平均作為排序分數。
// 若最佳維度 < 0.15 → 「no-match」（誠實回傳）
// 若 0.15 ~ 0.35     → 「low-confidence」（回傳 top-K 但標記 fallbackHint）
// 若 ≥ 0.35           → 「high-confidence」

const BEST_DIM_THRESHOLD = 0.35;
const NO_MATCH_THRESHOLD = 0.15;
// V5（知識編譯詞條 + 知識圖譜）由 core/wiki-matcher.js 供應。
//
// 權重切分方式：V1~V4 維持原始比例（0.30 : 0.35 : 0.20 : 0.15）整體縮放 0.85，
// V5 拿剩下的 0.15。這麼切是為了**零回歸**：沒有編譯詞檔時 V5 = 0，
// V1~V4 只是被等比縮小 0.85，彼此相對大小完全不變 → 排序結果不變。
// 由 `npm run ablate:v5`（確定性、不需 API）實測選出。
//
// ✅ 2026-09-20 末以 **v1.3.0（267 題，標準誤 ~3.0pp）** 重新驗證，結論不變：
//
//   V5 權重   天花板    平均排名   top1     （圖譜=PPR）
//   停用      94.9%    54.9     49.4%
//   0.10     98.1%    24.1     54.1%
//   0.15     98.1%    23.6     56.8%
//   0.20     98.1%    23.4     58.8%   ← 採用
//   0.25     97.7%    26.9     59.5%   ← top1 +0.7pp 但天花板 -0.4pp
//   0.30     98.1%    23.3     57.6%
//
//   → 0.25 的 top1 只多 2 題（落在標準誤內），卻少 1 題可召回，故維持 0.20。
//   → 整體貢獻（停用 → 0.20）：天花板 94.9% → 98.1%、top1 49.4% → 58.8%（+9.4pp）
//   → 圖譜（PPR）貢獻：57.2% → 58.8%（+1.6pp；舊評測集量到 +2.6pp，
//     新集樣本較大，1.6pp 是較可信的估計）
//
// 舊評測集 v1.2.0 的數據（**不可與上表直接比較**）：
//
// 【Tier 0 規則式詞檔】最適值曾是 0.10，且天花板會隨權重單調下降：
//   V5 權重   天花板    平均排名   top1
//   停用      95.0%     54.5      51.6%   ← 基線
//   0.10     95.6%     48.0      56.0%
//   0.15     95.0%     54.0      56.6%
//   0.20     94.3%     60.0      57.2%
//
// 【Tier 1 LLM 詞檔（現行）】天花板在 0.10~0.40 之間都維持 96.9%，
// 不再隨權重下降——因為 LLM 詞條本身就有召回力，不會擠壓 V1~V4：
//   V5 權重   天花板    平均排名   top1
//   停用      95.0%     54.5      51.6%   ← 基線
//   0.10     96.9%     35.6      55.3%
//   0.15     96.9%     35.4      57.9%
//   0.20     96.9%     35.4      59.7%   ← 天花板最大且 top1 近峰值
//   0.25     96.2%     41.2      60.4%   ← top1 略高但天花板掉 1 題
//   0.30     96.9%     35.4      58.5%
//   0.40     96.9%     35.8      55.3%
//
// → 選 0.20：天花板已達最大值，top1 距峰值僅 0.7pp（約 1 題，屬雜訊）。
// ⚠️ 每次重新編譯詞檔後都要重跑 `npm run ablate:v5`，最適值會跟著詞檔變。
const V5_WEIGHT = 0.20;
// V1~V4 = 原始比例（0.30 : 0.35 : 0.20 : 0.15）× 0.80
const DIM_WEIGHTS = { V1: 0.24, V2: 0.28, V3: 0.16, V4: 0.12, V5: V5_WEIGHT };

/**
 * 把外部傳入的意圖權重（Option C，只調整 V1~V4、加總 = 1）轉成五維權重。
 *
 * 為什麼不能在 query-intent.js 裡面直接加 V5：
 *   weightsForIntent() 的調整是「絕對量」（V2 += 0.10），若基準從 0.35 改成
 *   0.2975，同樣加 0.10 會讓 V2 的**相對**權重變大 → 即使 V5 = 0 也會改變
 *   排序 → 就不是零回歸了。
 * 正確做法是先在四維空間裡算完（維持原契約），再把 V1~V4 整體縮放到
 * (1 - V5_WEIGHT)，剩下的給 V5。這樣 V5 = 0 時，V1~V4 彼此的比例與
 * 原引擎**完全相同**，排序結果必然不變。
 *
 * @param {object|null} weights - 四維或五維權重表；null → 用 DIM_WEIGHTS
 * @returns {{V1:number,V2:number,V3:number,V4:number,V5:number}}
 */
function withV5(weights, v5Weight = V5_WEIGHT) {
  if (!weights) return DIM_WEIGHTS;
  if (typeof weights.V5 === 'number') return weights; // 已是五維
  const rest = 1 - v5Weight;
  return {
    V1: weights.V1 * rest,
    V2: weights.V2 * rest,
    V3: weights.V3 * rest,
    V4: weights.V4 * rest,
    V5: v5Weight,
  };
}
// V2 capability 權重最高：對 agent 選工具而言「能做什麼」比「怎麼裝」重要。
// V0 semantic（語意 embedding）：預設權重 0。只有當提供 vectors 與查詢向量
// 時才啟用，啟用後 V0 取代部分 V2 權重（語意已涵蓋功能端接）。
const V0_WEIGHT = 0.25;

function fuse(q, tool, idf, weights = DIM_WEIGHTS, v0 = null, v5 = null) {
  const s1 = scoreV1Identity(q, tool, idf);
  const s2 = scoreV2Capability(q, tool, idf);
  const s3 = scoreV3Scenario(q, tool, idf);
  const s4 = scoreV4Constraint(q, tool, idf);
  const per = { V1: s1.value, V2: s2.value, V3: s3.value, V4: s4.value };
  if (v0 !== null) per.V0 = v0;       // 僅當提供查詢向量時才有 V0
  if (v5 !== null) per.V5 = v5;       // 僅當有知識編譯詞檔時才有 V5

  const dims = Object.keys(per);
  const bestDim = Math.max(...dims.map((k) => per[k]));
  // V5 權重若權重表沒給（例如外部傳入的舊版 intentWeights）就用預設值
  const w5 = weights.V5 ?? V5_WEIGHT;
  const base = per.V1 * weights.V1 + per.V2 * weights.V2 + per.V3 * weights.V3 + per.V4 * weights.V4
    + (v5 !== null ? per.V5 * w5 : 0);
  // 加權：V0 啟用時把它當獨立維度計入（權重 V0_WEIGHT，剩餘按原比例縮放）
  let weighted;
  if (v0 !== null) {
    const restSum = 1 - V0_WEIGHT;
    const baseSum = weights.V1 + weights.V2 + weights.V3 + weights.V4 + (v5 !== null ? w5 : 0);
    weighted = per.V0 * V0_WEIGHT + base * (restSum / (baseSum || 1));
  } else {
    weighted = base;
  }
  const topDimKey = dims.reduce((a, b) => (per[a] >= per[b] ? a : b));
  return { per, bestDim, weighted, topDimKey, trigHit: s1.trigHit };
}

function reasons(q, tool, fuseResult, matchedIntent = '') {
  const r = [];
  if (fuseResult.trigHit) r.push(`✓ Trigger 命中：「${fuseResult.trigHit}」`);
  else if (fuseResult.per.V1 >= 0.4) r.push(`✓ 身分相似：${(tool.triggers || []).slice(0, 3).join(' / ')}`);
  if (fuseResult.per.V2 >= 0.4) r.push(`✓ 功能吻合：${(tool.capabilities || []).slice(0, 4).join(' / ')}`);
  if (fuseResult.per.V3 >= 0.4) r.push(`✓ 情境吻合：${tool.useCase?.slice(0, 80)}`);
  if (fuseResult.per.V4 >= 0.4) r.push(`✓ 部署吻合：${tool.install?.method} / ${tool.language}`);
  if (fuseResult.per.V5 >= 0.4) r.push(`✓ 知識詞條吻合：${(matchedIntent || '').slice(0, 60)}`);
  if (fuseResult.bestDim < NO_MATCH_THRESHOLD) r.push('⚠ 所有維度皆無有效信號');
  return r;
}

// ── 對外 API ─────────────────────────────────────────────────────────────
// intentWeights：由 retrieval-fusion 透過 query-intent.js 傳入的意圖驅動維度權重。
// vectors / queryVector：Option B 的語意 embedding。
//   - vectors：loadVectors() 回傳的預計算工具向量（registry/embeddings/vectors.json）。
//   - queryVector：查詢文字的 embedding（number[]）。由呼叫端算好傳入；
//     為 null / undefined 時 V0 停用，完全退化成原四維引擎（離線安全）。
// 兩者皆提供時，V0 = cosine(queryVector, vectors[tool.id])，權重 V0_WEIGHT。
export function agentRetrieve(tools, query, { topK = 5, intentWeights, vectors = null, queryVector = null, wiki, v5Weight, wikiGraph = true } = {}) {
  const q = extractQuery(query);
  const idf = buildIdentityIdf(tools);
  const w = withV5(intentWeights, v5Weight);
  const v0Enabled = vectors !== null && queryVector !== null && Array.isArray(queryVector) && queryVector.length > 0;
  // V5：知識編譯詞條（wiki-matcher）。
  //   wiki 未指定 → 自動載入詞檔（mtime 快取，不會每次查詢重讀）
  //   詞檔不存在 → null → 整條維度停用，完全退化成原四維引擎
  //   明確傳 null / false → 強制停用（評測對照組用）
  const wikiDoc = wiki === undefined ? loadWikiCached() : (wiki || null);
  const wikiMap = wikiDoc ? wikiScore(query, getWikiIndex(wikiDoc), { enableGraph: wikiGraph }) : null;
  const scored = tools.map((tool) => {
    const v0 = v0Enabled
      ? (vectors?.tools?.[tool.id] ? cosine(queryVector, vectors.tools[tool.id]) : 0)
      : null;
    const wv = wikiMap ? wikiMap.get(tool.id) : null;
    const v5 = wikiMap ? (wv?.V5 ?? 0) : null;
    return { tool, ...fuse(q, tool, idf, w, v0, v5), matchedIntent: wv?.intent || '' };
  }).filter((x) => x.bestDim > 0);

  // 按 weighted 分數排序（意圖權重已反映在 w 中；V0 啟用時已納入 weighted）
  scored.sort((a, b) => b.weighted - a.weighted);
  const top = scored.slice(0, topK).map((x) => ({
    id: x.tool.id,
    name: x.tool.name,
    category: x.tool.category,
    perDimension: x.per,
    topDim: x.topDimKey,
    score: Number(x.weighted.toFixed(4)),
    confidence: Number(x.bestDim.toFixed(4)),
    triggerHit: x.trigHit,
    reasons: reasons(q, x.tool, x),
  }));

  // 決策
  const top1 = top[0];
  let decision = 'no-match';
  let fallbackHint = '';
  if (top1 && top1.confidence >= BEST_DIM_THRESHOLD) {
    decision = 'high-confidence';
  } else if (top1 && top1.confidence >= NO_MATCH_THRESHOLD) {
    decision = 'low-confidence';
    fallbackHint = `最佳匹配置信度 ${(top1.confidence * 100).toFixed(0)}% 未達 ${BEST_DIM_THRESHOLD * 100}% 閾值。` +
      `建議：(a) 重新描述需求，加入更具體的技術詞；(b) 用 list_tools 依分類翻找；(c) 若屬「無家可歸」需求，` +
      `可能是工具庫缺該類工具（參考 dynamic-k 報告）。`;
  } else if (top1) {
    decision = 'no-match';
    fallbackHint = '所有候選在四維度上皆無有效信號。建議改用 list_tools 依分類翻找，或重新描述需求。';
  }

  return {
    query,
    totalCandidates: tools.length,
    matched: scored.length,
    decision,
    fallbackHint,
    topK: top,
  };
}

export { DIM_WEIGHTS, V5_WEIGHT, withV5 };

// ── CLI 入口（僅在直接執行時）────────────────────────────────────────────
const isDirect = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirect) {
  const j = JSON.parse(readFileSync(path.join(ROOT, 'registry', 'tools.json'), 'utf8'));
  const tools = j.tools.filter((t) => t.status === 'active' || t.status === 'experimental');
  const args = process.argv.slice(2);
  const wikiArg = loadWikiCached();
  if (args.length === 0) {
    // 預設 smoke test
    const samples = [
      'I need to convert a PDF report to markdown for RAG',
      'scrape a JS-rendered dashboard and extract tables',
      'generate a weekly PPT from a doc',
      'pull stock prices for AAPL and save to csv',
      'clean and dedupe a large jsonl dataset',
      'run e2e browser tests in headless mode',
      'deploy a node.js service to a kubernetes cluster',
      'summarize a 2-hour video into markdown notes',
    ];
    for (const q of samples) {
      const r = agentRetrieve(tools, q, { topK: 3 });
      console.log('QUERY:', q);
      console.log(`  decision=${r.decision} matched=${r.matched}/${r.totalCandidates}`);
      r.topK.forEach((x, i) => {
        console.log(`  ${i + 1}. ${x.id.padEnd(36)} conf=${(x.confidence * 100).toFixed(0)}% ` +
          `[V1=${(x.perDimension.V1 * 100).toFixed(0)} V2=${(x.perDimension.V2 * 100).toFixed(0)} ` +
          `V3=${(x.perDimension.V3 * 100).toFixed(0)} V4=${(x.perDimension.V4 * 100).toFixed(0)}]`);
        if (x.reasons[0]) console.log(`     ${x.reasons[0]}`);
      });
      if (r.fallbackHint) console.log(`  HINT: ${r.fallbackHint.slice(0, 120)}`);
      console.log();
    }
  } else {
    const r = agentRetrieve(tools, args.join(' '), { topK: 10, wiki: wikiArg });
    console.log(JSON.stringify(r, null, 2));
  }
}
