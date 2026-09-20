#!/usr/bin/env node
/**
 * wiki-matcher.js — 知識編譯器的「查詢端」配對邏輯
 *
 * 啟發來源
 * ────────
 * LLM Wiki 的核心觀念是**把檢索器升級成知識編譯器**：
 * 不要每次查詢都去重新讀原始素材（那既慢又貴），而是**離線先把原始素材
 * 編譯成結構化的詞條**，查詢時直接查編譯好的詞條。
 * Graphify 這類知識圖譜工具則示範了：把資料中的「關係」也一併抽出建成圖，
 * 查詢時可以沿著圖做擴散，找到字面上沒出現、但概念上相連的東西。
 *
 * 本專案對應到的痛點
 * ──────────────────
 * 診斷（`npm run ceiling`）顯示 semantic 類型天花板只有 91.1%，
 * 根因是**詞彙鴻溝**：使用者用日常語言描述具體應用場景
 * （「齒輪的齒數跟模數一改整組尺寸自動跟著變」），
 * 工具 metadata 用技術分類描述通用能力（「參數化 3D CAD 腳本框架」）——
 * 兩者的 bigram **重疊為 0**，純詞彙檢索在原理上不可能找到。
 *
 * 編譯器怎麼解決
 * ──────────────
 * 離線把每支工具的 metadata 編譯成「使用者會怎麼開口」的詞條：
 *
 *   cadquery.intents = [
 *     "想用程式碼畫出可以改參數的 3D 零件",
 *     "齒輪的齒數改了，整組尺寸要自動跟著更新",
 *     "把參數化模型匯出成 STEP 檔給 CNC 加工",
 *   ]
 *
 * 查詢時比對的是**編譯過的詞條**，不是原始描述 → 鴻溝被橋接。
 * 而且這是一次性成本：編譯 705 支工具跑一次，之後每次查詢都不用再呼叫 LLM
 * （與 HyDE 不同——HyDE 是每次查詢都要改寫一次，實測不划算）。
 *
 * 三個訊號（取最大值，與四維引擎「取最佳維度」的哲學一致）
 * ────────────────────────────────────────────────────────
 *   V5a  intent  直接比對：查詢 bag vs 編譯詞條 bag（IDF 加權餘弦）
 *   V5b  graph   圖譜擴散：查詢詞 → 在知識圖譜上的鄰居詞 → 擴充後再比對
 *   V5c  facet   物件／動作：比對 objects + actions（短詞、鑑別力高）
 *
 * 知識圖譜怎麼來的
 * ────────────────
 * 「詞—詞共現圖」：兩個詞若同時出現在 ≥ MIN_COOC 支工具的 intents 中，
 * 就在圖上連一條邊。查詢時把查詢詞的鄰居詞以衰減權重加入詞袋再比一次。
 * 這是**編譯好的圖譜在查詢時做一次擴散**（不做二階以上，避免雜訊爆炸）。
 *
 * 離線安全
 * ────────
 * 詞檔不存在／損壞 → `loadWiki()` 回傳 null → V5 停用 →
 * agent-retrieval 完全退化成原四維引擎。絕不因詞檔問題讓檢索失效。
 */

import { readFileSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tokenize, bagOf, documentFrequency, idfFromDf, weightedSim } from './tokenize.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
export const WIKI_PATH = path.join(ROOT, 'registry', 'compiled-entries.json');

// ── 圖譜參數 ───────────────────────────────────────────────────────────────
// MIN_COOC：兩詞至少共同出現在幾支工具的 intents 才連邊。
//   太低（1）→ 圖太密，任何詞都跟任何詞相連 → 失去鑑別力
//     （本專案踩過的坑：trigger 擴充時「鑑別力被稀釋」導致退步）
//   太高 → 圖太稀疏，等於沒有圖
//
// 適當值取決於詞檔的**重複度**：
//   Tier 0（triggers/useCase 重組）句子重複性高 → 3 就夠（789 節點/1151 邊）
//   Tier 1（LLM 原創句）句子很多元 → 3 會讓圖崩到 355 節點/264 邊，形同虛設
// 實測（Tier 1 詞檔、w=0.20、確定性）：
//   MIN_COOC=3 → top1 59.7%（有圖譜）vs 59.7%（無圖譜）＝ 完全無貢獻
//   MIN_COOC=2 → top1 60.4%（有圖譜）vs 59.7%（無圖譜）＝ +1 題
// 天花板兩者皆 96.9%，不受影響。
// ⚠️ +1 題屬雜訊量級，故只由 3 降到 2，不再往下調（避免對評測集過擬合）。
const MIN_COOC = Number(process.env.WIKI_MIN_COOC || 2);
// 每個詞最多保留幾個鄰居（依共現次數排序）
const MAX_NEIGHBORS = 6;
// 擴散進來的詞的衰減係數（<1：間接證據不該跟直接命中等值）
const GRAPH_DECAY = 0.6;

// ── PPR（Personalized PageRank）參數 ───────────────────────────────────────
// 靈感來自 The LLM Wiki Blueprint 第 7 頁「零向量檢索」：
//   拋棄傳統 RAG 的切塊，利用雙向連結做**蒙地卡羅隨機漫步**（PPR）
//   找出語意關聯；純本地、速度極快、成本與語料總量無關。
//
// 我們原本做的是「一階共現擴散」：查詢詞 → 直接鄰居，只走一步。
// 實測只貢獻 +0.7pp，原因很可能就是走不遠（圖很稀疏）。
// PPR 等於多階、加權、帶重啟機率的擴散，正好補上這個弱點。
const PPR_DAMPING = Number(process.env.WIKI_PPR_DAMPING || 0.85);
const PPR_ITERATIONS = Number(process.env.WIKI_PPR_ITER || 20);
const PPR_MAX_NODES = Number(process.env.WIKI_PPR_NODES || 40);
// 擴散出來的詞相對於查詢原詞的權重（1 = 同等重要）。
//
// 原理上取 1.0：PPR 分數本身已隨圖上距離衰減，不需要再額外打折一層
// （原本的 GRAPH_DECAY 就是這種多餘的二次折扣）。
//
// 實測敏感度（w=0.20，天花板恆為 96.9%）：
//   0.3 → 61.0%　0.6 → 61.6%　0.9 → 62.3%　1.0 → 62.3%　1.3 → 62.3%
//   0.9 以後是**高原**而非單一峰值 → 不是雜訊，取 1.0（高原中段且有原理依據）。
// ⚠️ 0.9~1.3 只差 0~2 題，不要為了這點差異繼續調（避免對評測集過擬合）。
const PPR_WEIGHT = Number(process.env.WIKI_PPR_WEIGHT || 1.0);
// 只有 df 落在這個區間的詞才做擴散：太罕見（df<2）沒有共現統計可言，
// 太常見（df > MAX_EXPAND_DF_RATIO × N）則是萬用詞，擴散它只會加雜訊。
const MAX_EXPAND_DF_RATIO = 0.06;
// 建圖時每支工具最多取幾個 token（依 IDF 高到低），控制 pairs 數量
const MAX_TOKENS_PER_TOOL = 40;

/**
 * 載入知識詞檔
 * @param {string} [wikiPath]
 * @returns {object|null} 詞檔內容；不存在或損壞 → null（V5 停用）
 */
export function loadWiki(wikiPath = WIKI_PATH) {
  try {
    if (!existsSync(wikiPath)) return null;
    const j = JSON.parse(readFileSync(wikiPath, 'utf8'));
    if (!j || typeof j !== 'object' || !j.entries) return null;
    if (Object.keys(j.entries).length === 0) return null;
    return j;
  } catch {
    return null; // 損壞時靜默停用：詞檔是增強，不是必要條件
  }
}

/**
 * 建立索引（IDF、詞袋、知識圖譜）
 *
 * @param {object} wiki - loadWiki() 的回傳值
 * @returns {object|null}
 */
export function buildWikiIndex(wiki) {
  if (!wiki?.entries) return null;
  const entries = wiki.entries;
  const ids = Object.keys(entries);
  if (ids.length === 0) return null;

  const intentTexts = ids.map((id) => (entries[id]?.intents || []).join(' '));
  const facetTexts = ids.map((id) => [
    ...(entries[id]?.objects || []),
    ...(entries[id]?.actions || []),
  ].join(' '));

  const N = ids.length;
  const dfIntent = documentFrequency(intentTexts);
  const dfFacet = documentFrequency(facetTexts);
  const idfIntent = idfFromDf(dfIntent, N);
  const idfFacet = idfFromDf(dfFacet, N);

  const intentBags = new Map();
  const facetBags = new Map();
  const intentsById = new Map();
  // 認識論標記（Epistemic Markers，見 docs/LLM-WIKI-BLUEPRINT.md 第 10 頁）：
  // V = 直接取自工具 metadata；S = LLM 綜合推論；? = 需人類覆核。
  // 讓呼叫端知道這條比對依據的可信度。
  const epistemicById = new Map();
  ids.forEach((id, i) => {
    intentBags.set(id, bagOf(tokenize(intentTexts[i])));
    facetBags.set(id, bagOf(tokenize(facetTexts[i])));
    intentsById.set(id, entries[id]?.intents || []);
    epistemicById.set(id, entries[id]?.epistemic || '');
  });

  const COOC = buildCooccurrence(intentBags, idfIntent, dfIntent, N);
  return {
    ids,
    N,
    intentBags,
    facetBags,
    intentsById,
    epistemicById,
    idfIntent,
    idfFacet,
    dfIntent,
    cooc: COOC,
    adj: buildTokenGraph(COOC),
  };
}

/**
 * 詞—詞共現圖（知識圖譜）
 *
 * 做法：對每支工具，取它 intents 中 IDF 最高的 MAX_TOKENS_PER_TOOL 個詞，
 * 兩兩加一條共現邊。最後只保留共現次數 ≥ MIN_COOC 的邊，
 * 且每個詞最多留 MAX_NEIGHBORS 個鄰居。
 *
 * 為什麼要依 IDF 截斷 token 數：不做截斷時，
 * 一支工具若有 100 個 token 就是 4,950 個 pair，705 支 → 350 萬次插入，
 * 建索引會慢到每次查詢都得重算。截斷後約 55 萬次，可接受。
 *
 * @param {Map<string, Map<string, number>>} intentBags
 * @param {Map<string, number>} idf
 * @param {Map<string, number>} df
 * @param {number} N
 * @returns {Map<string, Array<[string, number]>>} token → [[neighbor, count], ...]
 */
function buildCooccurrence(intentBags, idf, df, N) {
  const pairCount = new Map(); // "a\u0000b" → count
  for (const bag of intentBags.values()) {
    const toks = [...bag.keys()]
      .sort((a, b) => (idf.get(b) || 0) - (idf.get(a) || 0))
      .slice(0, MAX_TOKENS_PER_TOOL);
    for (let i = 0; i < toks.length; i++) {
      for (let j = i + 1; j < toks.length; j++) {
        const key = toks[i] < toks[j] ? `${toks[i]}\u0000${toks[j]}` : `${toks[j]}\u0000${toks[i]}`;
        pairCount.set(key, (pairCount.get(key) || 0) + 1);
      }
    }
  }

  const maxDf = Math.max(2, Math.floor(N * MAX_EXPAND_DF_RATIO));
  const graph = new Map();
  for (const [key, count] of pairCount) {
    if (count < MIN_COOC) continue;
    const [a, b] = key.split('\u0000');
    // 太常見的詞不做擴散（萬用詞，擴散它只會製造偽陽性）
    if ((df.get(a) || 0) > maxDf || (df.get(b) || 0) > maxDf) continue;
    if (!graph.has(a)) graph.set(a, []);
    if (!graph.has(b)) graph.set(b, []);
    graph.get(a).push([b, count]);
    graph.get(b).push([a, count]);
  }
  for (const [tok, list] of graph) {
    list.sort((x, y) => y[1] - x[1]);
    graph.set(tok, list.slice(0, MAX_NEIGHBORS));
  }
  return graph;
}

// ── 快取 ───────────────────────────────────────────────────────────────────
// 詞檔讀取與索引建立都不能每次查詢重來：
//   - 讀檔：705 筆 JSON，每次查詢讀一次會明顯拖慢
//   - 建索引：705 次斷詞 + 約 55 萬次共現插入
// 兩者都依「路徑 + mtime + 大小」快取，檔案換了就自動失效重建。
let _wikiDocCache = { key: null, wiki: null };
let _cache = { key: null, index: null };

/**
 * 載入知識詞檔（快取版）
 * @param {string} [wikiPath]
 * @returns {object|null}
 */
export function loadWikiCached(wikiPath = WIKI_PATH) {
  const key = cacheKey(wikiPath);
  if (_wikiDocCache.key === key) return _wikiDocCache.wiki;
  const wiki = loadWiki(wikiPath);
  _wikiDocCache = { key, wiki };
  return wiki;
}

function cacheKey(wikiPath) {
  try {
    const st = statSync(wikiPath);
    return `${wikiPath}|${st.mtimeMs}|${st.size}`;
  } catch {
    return `missing|${wikiPath}`;
  }
}

/**
 * 取得（必要時重建）索引
 * @param {object} wiki - loadWiki() 的回傳值
 * @param {string} [wikiPath]
 * @returns {object|null}
 */
export function getWikiIndex(wiki, wikiPath = WIKI_PATH) {
  if (!wiki) return null;
  let key = 'inmemory';
  try {
    const st = statSync(wikiPath);
    key = `${wikiPath}|${st.mtimeMs}|${st.size}`;
  } catch {
    key = `inmemory|${Object.keys(wiki.entries || {}).length}|${wiki.generatedAt || ''}`;
  }
  if (_cache.key === key && _cache.index) return _cache.index;
  const index = buildWikiIndex(wiki);
  _cache = { key, index };
  return index;
}

/** 測試用：清除索引快取 */
export function __resetWikiCache() {
  _cache = { key: null, index: null };
}

/**
 * 選出與查詢最相關的那句 intent（供 UI 顯示「為什麼命中」）
 * 用最便宜的重疊數（不看 IDF），只在 V5 達到門檻時才會被呼叫。
 */
function pickBestIntent(qBag, intents) {
  let best = '';
  let bestScore = 0;
  for (const s of intents || []) {
    let overlap = 0;
    for (const tok of bagOf(tokenize(s)).keys()) if (qBag.has(tok)) overlap++;
    if (overlap > bestScore) { bestScore = overlap; best = s; }
  }
  return bestScore > 0 ? best : '';
}

/**
 * 把共現邊轉成「轉移機率」鄰接表（每個節點的出邊權重加總 = 1）
 *
 * @param {Map<string, Array<[string, number]>>} cooc - buildCooccurrence 的結果
 * @returns {Map<string, Map<string, number>>}
 */
export function buildTokenGraph(cooc) {
  const adj = new Map();
  for (const [tok, list] of cooc) {
    let total = 0;
    for (const [, c] of list) total += c;
    if (total <= 0) continue;
    const probs = new Map();
    for (const [nb, c] of list) probs.set(nb, c / total);
    adj.set(tok, probs);
  }
  return adj;
}

/**
 * Personalized PageRank：以查詢詞為「重啟分布」在詞圖上隨機漫步
 *
 * 為什麼要用它：一階共現擴散只看得見直接鄰居，在稀疏圖上幾乎擴不出去。
 * PPR 每一輪都把機率沿著邊往外推（damping 控制推多遠），
 * 同時保留 (1-damping) 的機率回到查詢詞，避免飄到無關區域。
 *
 * @param {string[]} seeds - 查詢詞（只保留圖上有的）
 * @param {Map<string, Map<string, number>>} adj
 * @param {{damping?: number, iterations?: number}} [options]
 * @returns {Map<string, number>|null} 每個詞的 PPR 分數；圖上沒有種子詞時回傳 null
 */
export function personalizedPageRank(seeds, adj, options = {}) {
  const { damping = PPR_DAMPING, iterations = PPR_ITERATIONS } = options;
  if (!adj || adj.size === 0) return null;
  const seedSet = [...new Set(seeds)].filter((t) => adj.has(t));
  if (seedSet.length === 0) return null;

  const seedMass = (1 - damping) / seedSet.length;
  let r = new Map(seedSet.map((t) => [t, 1 / seedSet.length]));

  for (let i = 0; i < iterations; i++) {
    const next = new Map();
    for (const t of seedSet) next.set(t, seedMass);
    for (const [u, ru] of r) {
      const nbrs = adj.get(u);
      if (!nbrs || ru <= 0) continue;
      for (const [v, p] of nbrs) next.set(v, (next.get(v) || 0) + damping * ru * p);
    }
    r = next;
  }
  return r;
}

/**
 * 加權餘弦相似度（查詢端帶權重版）
 *
 * 為什麼要另一個版本：`weightedSim` 只看 token **有沒有出現**，
 * 不看權重——這讓原本的 GRAPH_DECAY 形同虛設（衰減根本沒作用）。
 * PPR 的價值在於「擴散出來的詞重要程度不同」，必須用帶權重的版本才吃得到。
 */
function weightedCosine(queryWeights, toolBag, idf) {
  let dot = 0;
  let nq = 0;
  for (const [t, w] of queryWeights) {
    const iw = idf.get(t) || 1;
    if (toolBag.has(t)) dot += w * iw * iw;
    nq += w * w * iw * iw;
  }
  if (dot === 0 || nq === 0) return 0;
  let nt = 0;
  for (const t of toolBag.keys()) { const iw = idf.get(t) || 1; nt += iw * iw; }
  if (nt === 0) return 0;
  return dot / (Math.sqrt(nq) * Math.sqrt(nt));
}

/**
 * 計算所有工具的 V5 分數
 *
 * @param {string} query
 * @param {object|null} index - getWikiIndex() 的回傳值；null → 回傳 null
 * @param {{ graphDecay?: number, enableGraph?: boolean }} [options]
 * @returns {Map<string, {V5: number, intent: string}>|null}
 */
export function wikiScore(query, index, options = {}) {
  if (!index) return null;
  const { graphDecay = GRAPH_DECAY, enableGraph = true } = options;
  const qBag = bagOf(tokenize(query));
  if (qBag.size === 0) return null;

  // 圖譜擴散：以查詢詞為重啟分布做 PPR 隨機漫步（多階）
  //
  // 舊做法是「一階共現」：只把直接鄰居加進詞袋，衰減係數還因為
  // weightedSim 不看權重而形同虛設。PPR 讓機率沿邊多輪傳遞，
  // 且用帶權重的 weightedCosine 讓「擴散越遠的詞權重越低」真正生效。
  let pprWeights = null;
  if (enableGraph && index.adj && index.adj.size > 0) {
    const seeds = [...qBag.keys()].filter((t) => index.adj.has(t));
    if (seeds.length > 0) {
      const r = personalizedPageRank(seeds, index.adj);
      if (r) {
        const ranked = [...r.entries()].sort((a, b) => b[1] - a[1]).slice(0, PPR_MAX_NODES);
        const nonSeedMax = ranked.reduce((m, [t, v]) => (!qBag.has(t) && v > m ? v : m), 0);
        pprWeights = new Map();
        for (const t of qBag.keys()) pprWeights.set(t, 1);
        if (nonSeedMax > 0) {
          for (const [t, v] of ranked) {
            if (qBag.has(t)) continue;
            pprWeights.set(t, Math.min(1, (v / nonSeedMax) * PPR_WEIGHT));
          }
        }
      }
    }
  }

  const out = new Map();
  for (const id of index.ids) {
    const intentBag = index.intentBags.get(id);
    const direct = weightedSim(qBag, intentBag, index.idfIntent);
    let best = direct;
    if (pprWeights && pprWeights.size > qBag.size) {
      const viaGraph = weightedCosine(pprWeights, intentBag, index.idfIntent);
      if (viaGraph > best) best = viaGraph;
    }
    const facet = weightedSim(qBag, index.facetBags.get(id), index.idfFacet);
    if (facet > best) best = facet;
    out.set(id, {
      V5: best,
      // 只在真的有訊號時才算最佳 intent（省下 705 × N 次斷詞）
      intent: best > 0 ? pickBestIntent(qBag, index.intentsById.get(id)) : '',
      // 認識論標記：讓呼叫端知道這個比對依據的可信度
      // （V=取自 metadata／S=LLM 推論／?=需人工覆核）
      epistemic: index.epistemicById?.get(id) || '',
    });
  }
  return out;
}

/**
 * 知識圖譜的統計資訊（供文件／診斷用）
 * @param {object} index
 * @returns {{nodes: number, edges: number, entries: number}}
 */
export function wikiGraphStats(index) {
  if (!index) return { nodes: 0, edges: 0, entries: 0 };
  let edges = 0;
  for (const list of index.cooc.values()) edges += list.length;
  return { nodes: index.cooc.size, edges: Math.floor(edges / 2), entries: index.ids.length };
}

export {
  MIN_COOC, MAX_NEIGHBORS, GRAPH_DECAY, MAX_EXPAND_DF_RATIO, MAX_TOKENS_PER_TOOL,
  buildCooccurrence,
};
