/**
 * Tool-Calling 檢索引擎
 * 三層檢索架構：L1 精確匹配 → L2 關鍵字匹配 → L3 語義檢索
 * (此模組為 Pure JS，可用於 Node.js 與瀏覽器前端)
 */


/**
 * 文字正規化：轉小寫 + 去除多餘空白
 * @param {string} text
 * @returns {string}
 */
function normalize(text) {
  if (Array.isArray(text)) {
    return text.map(t => normalize(t)).join(' ');
  }
  if (typeof text !== 'string') {
    return (text || '').toString().toLowerCase().trim().replace(/\s+/g, ' ');
  }
  return text.toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * 中英文分詞（簡易版，按空白 + 常見標點切分）
 * @param {string} text
 * @returns {string[]}
 */
function tokenize(text) {
  const normalized = normalize(text);
  const rawTokens = normalized
    .split(/[\s,，。、；;：:!！?？\-_/\\]+/)
    .filter(t => t.length > 0);

  const finalTokens = new Set(rawTokens);
  const subKeywords = ['網頁', '爬蟲', '動態', '簡報', '股票', '語音', '影片', '圖片', '文件', '測試', '數據', '資料', '自動化', '量化', '視覺'];
  for (const token of rawTokens) {
    for (const kw of subKeywords) {
      if (token.includes(kw)) {
        finalTokens.add(kw);
      }
    }
  }
  return Array.from(finalTokens);
}

// ─── 觸發詞正規化快取（triggerNormCache）────────────────────────────
//
// 問題：每次 keywordMatch() 都會對所有工具的 triggers 重複執行 normalize()，
// 造成明顯的重複運算。以 trigger 字串為 key 記憶化，整個程序生命週期內只
// 計算一次。預期 L2 匹配速度提升 40-60%。
const triggerNormCache = new Map();

function getTriggerNorm(trigger) {
  if (!triggerNormCache.has(trigger)) {
    triggerNormCache.set(trigger, normalize(trigger));
  }
  return triggerNormCache.get(trigger);
}

// 子工具（subTool）正規化字串快取。部分「monorepo / skills 合集」工具帶有
// 數百個 subTools（實測最多達 817 個），若每次 keywordMatch() 呼叫（也就是
// 每次按鍵搜尋）都重新對每一個 subTool 的 name/description 做
// toLowerCase/trim/replace，會是明顯的重複運算。以 subTool 物件本身
// （而非外層 tools 陣列參照）為 key 做記憶化，可讓這些正規化字串在整個
// 程序生命週期內只計算一次。
const subToolNormCache = new WeakMap();

function getSubToolNorm(subTool) {
  let entry = subToolNormCache.get(subTool);
  if (!entry) {
    entry = { name: normalize(subTool.name), desc: normalize(subTool.description) };
    subToolNormCache.set(subTool, entry);
  }
  return entry;
}

// ─── 查詢結果快取（searchResultCache）─────────────────────────────────
//
// 問題：相同查詢每次都重新計算。
// 解決方案：以查詢字串 + 過濾條件為 key，TTL 5 分鐘，重複查詢 <1ms。
const searchResultCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 分鐘

export function getRegistryCacheFingerprint(tools = []) {
  if (!Array.isArray(tools)) return 'invalid-registry';

  let hash = 2166136261;
  for (const tool of tools) {
    const text = [
      tool?.id,
      tool?.name,
      tool?.status,
      tool?.category,
      tool?.language,
      tool?.description,
      Array.isArray(tool?.triggers) ? tool.triggers.join(',') : tool?.triggers,
      tool?.useCase
    ].join('|');

    for (let i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
  }

  return `${tools.length}:${(hash >>> 0).toString(36)}`;
}

/**
 * 產生查詢快取鍵
 */
function buildCacheKey(query, category, language, registryVersion = 'default-registry') {
  return `${registryVersion}|${query}|${category || ''}|${language || ''}`;
}

/**
 * 取得快取結果（若存在且未過期）
 */
export function getCachedSearch(query, category, language, registryVersion) {
  const key = buildCacheKey(query, category, language, registryVersion);
  const cached = searchResultCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.results;
  }
  return null;
}

/**
 * 儲存搜尋結果到快取
 */
export function cacheSearchResults(query, category, language, results, registryVersion) {
  const key = buildCacheKey(query, category, language, registryVersion);
  searchResultCache.set(key, {
    results,
    timestamp: Date.now()
  });
  
  // 限制快取大小，避免記憶體洩漏
  if (searchResultCache.size > 1000) {
    const firstKey = searchResultCache.keys().next().value;
    searchResultCache.delete(firstKey);
  }
}

// ─── L1：精確匹配 ────────────────────────────────────────────────────────

/**
 * L1 精確匹配：按工具 ID 或名稱完全匹配
 * @param {object[]} tools - 工具列表
 * @param {string} query - 查詢字串
 * @returns {object[]} 匹配結果（含分數）
 */
export function exactMatch(tools, query) {
  const q = normalize(query);
  return tools
    .filter(tool => {
      const id = normalize(tool.id);
      const name = normalize(tool.name);
      return id === q || name === q;
    })
    .map(tool => ({
      tool,
      score: 1.0,
      matchLevel: 'L1-exact',
      matchedOn: 'id/name',
    }));
}

// ─── L2：關鍵字匹配 ──────────────────────────────────────────────────────

/**
 * L2 關鍵字匹配：查詢字串與工具觸發關鍵字 + 分類 + 描述 交叉匹配
 * @param {object[]} tools - 工具列表
 * @param {string} query - 查詢字串
 * @returns {object[]} 匹配結果（含分數，按分數降序）
 */
export function keywordMatch(tools, query) {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return [];
  const normQuery = normalize(query); // 提到迴圈外，避免對每個 tool 的每個 trigger 重複正規化同一個查詢字串

  const results = [];

  for (const tool of tools) {
    let score = 0;
    const matchedKeywords = [];

    // 觸發關鍵字匹配（權重最高：每個匹配 +3）
    for (const trigger of tool.triggers) {
      const triggerNorm = getTriggerNorm(trigger);
      // 查詢包含觸發詞
      if (normQuery.includes(triggerNorm)) {
        score += 3;
        matchedKeywords.push(trigger);
      }
      // 觸發詞包含查詢的某個 token
      for (const token of queryTokens) {
        if (triggerNorm.includes(token) && token.length >= 2) {
          score += 1.5;
          if (!matchedKeywords.includes(trigger)) {
            matchedKeywords.push(trigger);
          }
        }
        // Fuzzy 匹配：允許拼字錯誤或 variant
        else if (fuzzyMatch(triggerNorm, token)) {
          score += 1.0; // 模糊匹配權重較低
          if (!matchedKeywords.includes(`[fuzzy:${trigger}]`)) {
            matchedKeywords.push(`[fuzzy:${trigger}]`);
          }
        }
      }
    }

    // 分類匹配（權重中：+2）
    const categoryNorm = normalize(tool.category);
    for (const token of queryTokens) {
      if (categoryNorm.includes(token) && token.length >= 2) {
        score += 2;
        matchedKeywords.push(`[category:${tool.category}]`);
      }
    }

    // 描述匹配（權重低：+1）
    const descNorm = normalize(tool.description);
    for (const token of queryTokens) {
      if (descNorm.includes(token) && token.length >= 2) {
        score += 1;
      }
    }

    // 能力標籤匹配 (權重中：每個匹配 +1.5)
    if (tool.capabilities) {
      for (const cap of tool.capabilities) {
        const capNorm = normalize(cap);
        for (const token of queryTokens) {
          if (capNorm.includes(token) && token.length >= 2) {
            score += 1.5;
            if (!matchedKeywords.includes(cap)) {
              matchedKeywords.push(cap);
            }
          }
        }
      }
    }

    // 子工具匹配 (權重中：每個匹配 +1.5)
    //
    // 精確度修正：對於帶有數百個 subTools 的「monorepo / skills 合集」工具
    // （實測 anthropic-cybersecurity-skills 有 817 個 subTools），若各自
    // 獨立比對查詢的每個詞、任一子工具命中任一詞就加分，會導致查詢中的
    // 不同詞語「分別」巧合命中完全不相關的子工具而拉高分數。例如查詢
    // 「database migration」在該工具的 817 個子工具中，"database" 命中了
    // 4 個跟資料庫遷移無關的憑證竊取/機密管理子工具，"migration" 又命中了
    // 1 個後量子加密遷移的子工具——湊在一起讓整個工具被誤判為高相關。
    // 修正做法：多詞查詢時，要求同一個子工具「同時」命中所有查詢詞
    // （詞語共現），才視為真正相关；單詞查詢則維持原本行為。
    if (tool.subTools) {
      let subToolScore = 0;
      for (const subTool of tool.subTools) {
        const { name: subName, desc: subDesc } = getSubToolNorm(subTool);

        const nameMatchedTokens = queryTokens.filter(t => t.length >= 2 && subName.includes(t));
        const descMatchedTokens = queryTokens.filter(t => t.length >= 3 && subDesc.includes(t));
        const matchedTokenCount = new Set([...nameMatchedTokens, ...descMatchedTokens]).size;

        // 多詞查詢要求同一子工具內詞語共現；單詞查詢只需命中該詞
        const requiredCount = queryTokens.length > 1 ? queryTokens.length : 1;
        if (matchedTokenCount < requiredCount) continue;

        subToolScore += nameMatchedTokens.length * 1.5 + descMatchedTokens.length * 1.0;
        if (!matchedKeywords.includes(`subtool:${subTool.name}`)) {
          matchedKeywords.push(`subtool:${subTool.name}`);
        }
      }
      // 限制子工具的加分上限，避免包含上百個工具的 Monorepo 霸榜
      score += Math.min(subToolScore, 6);
    }

    // 場景與優勢匹配 (權重高：每個匹配 +2)
    if (tool.useCase) {
      const useCaseNorm = normalize(tool.useCase);
      for (const token of queryTokens) {
        if (useCaseNorm.includes(token) && token.length >= 2) {
          score += 2;
          if (!matchedKeywords.includes(`場景匹配`)) matchedKeywords.push(`場景匹配`);
        }
      }
    }
    
    if (tool.advantages) {
      for (const adv of tool.advantages) {
        const advNorm = normalize(adv);
        for (const token of queryTokens) {
          if (advNorm.includes(token) && token.length >= 2) {
            score += 2;
            if (!matchedKeywords.includes(`優勢匹配`)) matchedKeywords.push(`優勢匹配`);
          }
        }
      }
    }

    // 負樣本約束匹配 (Hard Negative)
    let isNegativeMatch = false;
    if (tool.negativeConstraints) {
      for (const neg of tool.negativeConstraints) {
        const negNorm = normalize(neg);
        if (negNorm.length >= 2 && normalize(query).includes(negNorm)) {
          isNegativeMatch = true;
          break;
        }
      }
    }

    if (score > 0 || isNegativeMatch) {
      if (isNegativeMatch) {
        if (!matchedKeywords.includes(`🚫 禁用場景`)) matchedKeywords.push(`🚫 禁用場景`);
      }
      
      // 正規化分數到 0~1 範圍
      const maxPossible = tool.triggers.length * 4.5 + 2 + 5 + (tool.capabilities?.length || 0) * 2 + (tool.subTools ? 6 : 0);
      // 如果命中負樣本，強制給予極低分數 (0.01)
      const normalizedScore = isNegativeMatch ? 0.01 : Math.min(score / maxPossible, 0.99);
      results.push({
        tool,
        score: Math.round(normalizedScore * 100) / 100,
        matchLevel: 'L2-keyword',
        matchedKeywords,
      });
    }
  }

  return results.sort((a, b) => b.score - a.score);
}

// ─── Fuzzy Matching（模糊匹配）───────────────────────────────────────
//
// 問題：拼字錯誤或 variant 無法匹配（例如 "pyton" vs "python"）
// 解決方案：引入 Levenshtein distance 進行模糊匹配，僅對短 token (<4 chars) 啟用
const LEVENSHTEIN_THRESHOLD = 0.85; // 相似度閾值（越高越嚴格）

/**
 * 計算 Levenshtein distance
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function levenshteinDistance(a, b) {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix = [];
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * 計算字串相似度
 * @param {string} a
 * @param {string} b
 * @returns {number} 0~1，越高越相似
 */
function stringSimilarity(a, b) {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshteinDistance(a, b) / maxLen;
}

/**
 * 模糊匹配：檢查 queryToken 是否與 triggerNorm 相似
 * @param {string} triggerNorm
 * @param {string} queryToken
 * @returns {boolean}
 */
function fuzzyMatch(triggerNorm, queryToken) {
  if (triggerNorm === queryToken) return true;
  
  // 僅對短 token 啟用模糊匹配（避免誤判長詞）
  if (queryToken.length < 4 || triggerNorm.length < 4) {
    const sim = stringSimilarity(triggerNorm, queryToken);
    return sim >= LEVENSHTEIN_THRESHOLD;
  }
  
  return false;
}

// ─── L3：語義檢索（TF-IDF + N-gram + 同義詞擴展）──────────────────────

// 同義詞詞典改為 build 時從 registry 既有的中英雙語 triggers 自動挖掘產生
// （見 scripts/mine-synonyms.js），並在此直接 import 產出的靜態檔案。
// 只要 registry/tools.json 更新，重新執行 `node scripts/mine-synonyms.js`
// （或跑 `npm run build:web`，會自動先重新挖掘一次）即可讓詞典跟著變新，
// 不需要再手動維護一份固定字典。
import { SYNONYM_MAP } from './synonyms.generated.js';

/**
 * 同義詞擴展：將查詢字串中的詞擴展為同義詞集合
 * @param {string[]} tokens - 原始查詢 tokens
 * @returns {string[]} 擴展後的 tokens（去重）
 */
function expandSynonyms(tokens) {
  const expanded = new Set(tokens);
  for (const token of tokens) {
    const synonyms = SYNONYM_MAP[token];
    if (synonyms) {
      for (const syn of synonyms) {
        expanded.add(normalize(syn));
      }
    }
  }
  return [...expanded];
}

/**
 * 字元級 N-gram 生成（對中文特別有效，無需分詞）
 * @param {string} text - 輸入文字
 * @param {number} n - N-gram 大小（預設 2，即 bigram）
 * @returns {string[]} N-gram 陣列
 */
function charNgrams(text, n = 2) {
  const normalized = normalize(text).replace(/\s+/g, '');
  if (normalized.length < n) return [normalized];
  const ngrams = [];
  for (let i = 0; i <= normalized.length - n; i++) {
    ngrams.push(normalized.slice(i, i + n));
  }
  return ngrams;
}

// 單一工具文字表示的長度上限。少數「monorepo / skills 合集」工具帶有
// 數百個 subTools（實測 claude-skills 798 個、anthropic-cybersecurity-skills
// 817 個，未截斷前文字長度分別達 195,689 與 96,521 字元，相較其餘工具
// 平均 ~2,500 字元高出 2 個數量級）。若不設上限，這些工具會因為詞彙
// 覆蓋面極廣，在 TF-IDF／N-gram 計算中對「任何」查詢都容易產生偶然重疊，
// 導致霸榜（精確度下降），同時也是每次查詢中 charNgrams 耗時的主要來源
// （效能下降）。優先保留名稱/觸發詞/描述/分類/場景等高權重欄位，
// 子工具內容只在預算內納入。
const MAX_TOOL_TEXT_LENGTH = 3000;

/**
 * 建立工具的多層文字表示（用於 TF-IDF 計算）
 * 觸發詞和名稱重複加入以提升權重
 * @param {object} tool
 * @returns {string}
 */
function buildToolText(tool) {
  const parts = [
    // 名稱 ×3 （最高權重）
    tool.name, tool.name, tool.name,
    // 觸發詞 ×2
    ...(tool.triggers || []), ...(tool.triggers || []),
    // 描述 ×1
    tool.description,
    // 分類 ×2
    tool.category, tool.category,
    // 能力標籤 ×1
    ...(tool.capabilities || []).map(c => c.replace(/-/g, ' ')),
    // 場景與優勢
    tool.useCase || '',
    ...(tool.advantages || []),
    // 子工具（有長度預算保護，避免 monorepo 霸榜，見 MAX_TOOL_TEXT_LENGTH）
    ...(tool.subTools || []).map(st => `${st.name} ${st.description}`)
  ];
  const text = parts.join(' ');
  return text.length > MAX_TOOL_TEXT_LENGTH ? text.slice(0, MAX_TOOL_TEXT_LENGTH) : text;
}

/**
 * TF (詞頻) 計算
 * @param {string[]} tokens
 * @returns {Map<string, number>} token → 詞頻
 */
function computeTF(tokens) {
  const tf = new Map();
  for (const token of tokens) {
    tf.set(token, (tf.get(token) || 0) + 1);
  }
  // 正規化
  const max = Math.max(...tf.values(), 1);
  for (const [key, val] of tf) {
    tf.set(key, val / max);
  }
  return tf;
}

/**
 * IDF (逆文檔頻率) 計算
 * @param {string[][]} allDocTokens - 所有文檔的 token 陣列
 * @returns {Map<string, number>} token → IDF 值
 */
function computeIDF(allDocTokens) {
  const N = allDocTokens.length;
  const df = new Map(); // 文檔頻率
  for (const docTokens of allDocTokens) {
    const unique = new Set(docTokens);
    for (const token of unique) {
      df.set(token, (df.get(token) || 0) + 1);
    }
  }
  const idf = new Map();
  for (const [token, count] of df) {
    idf.set(token, Math.log((N + 1) / (count + 1)) + 1); // 平滑 IDF
  }
  return idf;
}

/**
 * 計算 TF-IDF 向量的餘弦相似度
 * @param {Map<string, number>} vecA
 * @param {Map<string, number>} vecB
 * @returns {number} 0~1
 */
function cosineSimilarity(vecA, vecB) {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (const [key, valA] of vecA) {
    const valB = vecB.get(key) || 0;
    dotProduct += valA * valB;
    normA += valA * valA;
  }
  for (const [, valB] of vecB) {
    normB += valB * valB;
  }

  normA = Math.sqrt(normA);
  normB = Math.sqrt(normB);

  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (normA * normB);
}

/**
 * 計算 N-gram 重疊度（Dice 係數）
 * @param {Set<string>} set1
 * @param {Set<string>} set2
 * @returns {number} 0~1
 */
function ngramSetOverlap(set1, set2) {
  if (set1.size === 0 || set2.size === 0) return 0;
  // 用較小的集合去查較大的集合，交集運算次數最少
  const [small, large] = set1.size <= set2.size ? [set1, set2] : [set2, set1];
  let intersectionSize = 0;
  for (const x of small) {
    if (large.has(x)) intersectionSize++;
  }
  return (2 * intersectionSize) / (set1.size + set2.size);
}

// ─── 每個工具的檢索用資料快取 ────────────────────────────────────────────
//
// 效能問題根因：舊版 semanticSearch 每次呼叫（也就是每次 debounce 後的
// 按鍵輸入）都會對「全部工具」重新執行 buildToolText → tokenize →
// charNgrams → computeTF，即使 registry 內容完全沒變。實測 279 個工具下，
// 光是 charNgrams 一項就要 ~130ms，整體 search() 平均要價 230~500ms —
// 對「即時搜尋」的體驗來說太慢。
//
// 這裡改用 WeakMap 以「工具物件本身」為 key 做記憶化（而非以陣列參照
// 為 key）。這樣不管 search() 內部怎麼 filter 出不同的子陣列（依
// status／category／language），只要是同一個工具物件，文字/分詞/
// TF/N-gram 集合都只會計算一次、之後永久複用，直到程序重啟。
const toolIndexCache = new WeakMap();

function getToolIndex(tool) {
  let entry = toolIndexCache.get(tool);
  if (!entry) {
    const text = buildToolText(tool);
    const tokens = tokenize(text);
    entry = {
      tokens,
      tf: computeTF(tokens),
      ngramSet: new Set(charNgrams(text)),
    };
    toolIndexCache.set(tool, entry);
  }
  return entry;
}

/**
 * 預先建立（warm up）搜尋索引快取。建議在載入 registry 後立即呼叫一次
 * （例如網頁端 fetch 完 tools.json 後），把 buildToolText/tokenize/
 * charNgrams 的成本挪到「使用者打字之前」，避免第一次搜尋卡頓。
 * 之後才輸入的查詢就只需要做查詢端的輕量運算。
 * @param {object[]} tools - 工具列表（通常是完整 registry）
 */
export function warmSearchIndex(tools) {
  for (const tool of tools) {
    getToolIndex(tool);
  }
}

/**
 * L3 語義檢索：TF-IDF 餘弦相似度 + N-gram 重疊度 + 同義詞擴展
 * @param {object[]} tools - 工具列表
 * @param {string} query - 查詢字串
 * @param {number} threshold - 最低相似度閾值（預設 0.03）
 * @returns {object[]} 匹配結果
 */
export function semanticSearch(tools, query, threshold = 0.03) {
  // Step 1: 查詢同義詞擴展
  const rawQueryTokens = tokenize(query);
  const expandedQueryTokens = expandSynonyms(rawQueryTokens);
  const queryNgramSet = new Set(charNgrams(query));

  // Step 2: 取得（或建立並快取）每個工具的分詞結果
  const toolIndexes = tools.map(getToolIndex);

  // Step 3: 計算 IDF（僅對已快取好的 tokens 做文檔頻率統計，不含查詢本身，
  // 也不重新做任何字串前處理，成本遠低於原本版本）
  const idf = computeIDF(toolIndexes.map(idx => idx.tokens));

  // Step 4: 計算查詢的 TF-IDF 向量
  const queryTF = computeTF(expandedQueryTokens);
  const queryVec = new Map();
  for (const [token, tf] of queryTF) {
    queryVec.set(token, tf * (idf.get(token) || 1));
  }

  // Step 5: 對每個工具計算相似度
  const results = [];

  for (let i = 0; i < tools.length; i++) {
    const tool = tools[i];
    const { tf: docTF, ngramSet: toolNgramSet } = toolIndexes[i];

    // TF-IDF 餘弦相似度（權重 0.6）
    const docVec = new Map();
    for (const [token, tf] of docTF) {
      docVec.set(token, tf * (idf.get(token) || 1));
    }
    const tfidfScore = cosineSimilarity(queryVec, docVec);

    // N-gram 重疊度（權重 0.4）— 對中文子字串匹配特別有效
    const ngramScore = ngramSetOverlap(queryNgramSet, toolNgramSet);

    // 加權融合
    const combinedScore = tfidfScore * 0.6 + ngramScore * 0.4;

    if (combinedScore >= threshold) {
      results.push({
        tool,
        score: Math.round(combinedScore * 100) / 100,
        matchLevel: 'L3-semantic',
        matchedKeywords: [],
        _detail: {
          tfidf: Math.round(tfidfScore * 100) / 100,
          ngram: Math.round(ngramScore * 100) / 100,
          expanded: expandedQueryTokens.length > rawQueryTokens.length,
        },
      });
    }
  }

  return results.sort((a, b) => b.score - a.score);
}

// ─── 統一搜尋入口 ────────────────────────────────────────────────────────

/**
 * 統一搜尋：按 L1 → L2 → L3 順序檢索，自動融合結果
 * @param {object[]} registryTools - 完整的工具註冊表 (registry.tools)
 * @param {string} query - 搜尋查詢
 * @param {object} options - 選項
 * @param {number} [options.topK=5] - 返回前 K 個結果
 * @param {string} [options.category] - 限定分類
 * @param {string} [options.language] - 限定語言
 * @returns {object[]} 搜尋結果
 */
export function search(registryTools, query, options = {}) {
  const { topK = 5, category, language } = options;
  const registryVersion = options.registryVersion || getRegistryCacheFingerprint(registryTools);
  
  // 檢查快取
  const cached = getCachedSearch(query, category, language, registryVersion);
  if (cached) {
    return cached;
  }
  
  let tools = registryTools.filter(t => t.status === 'active' || t.status === 'experimental');

  // 處理自然語言口語字眼前綴 (例如: "我想做簡報" -> "做簡報", "請幫我 scan" -> "scan")
  let targetQuery = (query || '').trim();
  const intentPrefixRegex = /^(我想|請幫我|幫我|我要|我想要|如何|要如何|可以用|我需要|要怎麼|怎麼)\s*/i;
  if (intentPrefixRegex.test(targetQuery)) {
    const stripped = targetQuery.replace(intentPrefixRegex, '').trim();
    if (stripped.length > 0) {
      targetQuery = stripped;
    }
  }

  // 前置過濾
  if (category) {
    const normCategory = normalize(category);
    tools = tools.filter(t => {
      if (!t || !t.category) return false;
      const cats = Array.isArray(t.category) ? t.category : [t.category];
      return cats.some(c => normalize(c) === normCategory);
    });
  }
  if (language) {
    tools = tools.filter(t => normalize(t.language) === normalize(language));
  }

  // L1 精確匹配
  const l1Results = exactMatch(tools, targetQuery);
  if (l1Results.length > 0) {
    let finalL1 = l1Results.slice(0, topK);
    const { telemetryStats } = options;
    if (telemetryStats) {
      for (const result of finalL1) {
        const stats = telemetryStats[result.tool.id];
        if (stats && stats.total >= 2) {
          if (stats.successRate <= 0.3) {
            result.score = result.score * 0.1;
            if (!result.matchedKeywords) result.matchedKeywords = [];
            result.matchedKeywords.push('⚠️ 軌跡警告: 成功率極低');
          } else if (stats.successRate >= 0.8) {
            result.score = Math.min(result.score * 1.2, 0.99);
            if (!result.matchedKeywords) result.matchedKeywords = [];
            result.matchedKeywords.push('🌟 軌跡推薦: 高成功率');
          }
        }
      }
      finalL1.sort((a, b) => b.score - a.score);
    }
    
    cacheSearchResults(query, category, language, finalL1, registryVersion);
    return finalL1;
  }

  // L2 關鍵字匹配
  const l2Results = keywordMatch(tools, targetQuery);

  // L3 語義檢索（作為補充）
  const l3Results = semanticSearch(tools, targetQuery);

  // 融合：L2 優先，L3 補充未出現的工具
  const seen = new Set();
  const merged = [];

  for (const r of l2Results) {
    seen.add(r.tool.id);
    merged.push(r);
  }

  for (const r of l3Results) {
    if (!seen.has(r.tool.id)) {
      seen.add(r.tool.id);
      // L3 分數降權（乘 0.5）以確保 L2 優先
      merged.push({ ...r, score: Math.round(r.score * 0.5 * 100) / 100 });
    }
  }

  // 套用 Telemetry 動態權重
  const { telemetryStats } = options;
  if (telemetryStats) {
    for (const result of merged) {
      const stats = telemetryStats[result.tool.id];
      if (stats && stats.total >= 2) { // 至少累積 2 次才具有統計意義
        if (stats.successRate <= 0.3) {
          result.score = result.score * 0.1; // 重罰
          if (!result.matchedKeywords) result.matchedKeywords = [];
          result.matchedKeywords.push('⚠️ 軌跡警告: 成功率極低');
        } else if (stats.successRate >= 0.8) {
          result.score = Math.min(result.score * 1.2, 0.99); // 獎勵
          if (!result.matchedKeywords) result.matchedKeywords = [];
          result.matchedKeywords.push('🌟 軌跡推薦: 高成功率');
        }
      }
    }
  }

  merged.sort((a, b) => b.score - a.score);
  
  // 套用五維度競品重排矩陣 (5D Disambiguation Reranker)
  const context = extractQueryContext(targetQuery);
  const reranked = rerankCandidates(merged, context, options);
  
  const finalResults = reranked.slice(0, topK);
  
  // 儲存到快取
  cacheSearchResults(query, category, language, finalResults, registryVersion);
  
  return finalResults;
}

/**
 * 提取查詢意圖與上下文特徵 (Language, Scenario, Feature Requirements)
 * @param {string} query 
 * @returns {object}
 */
export function extractQueryContext(query) {
  const norm = normalize(query);
  
  // 1. 程式語言偏好
  let targetLang = null;
  if (/\b(python|py)\b/i.test(norm)) targetLang = 'python';
  else if (/\b(typescript|ts)\b/i.test(norm)) targetLang = 'typescript';
  else if (/\b(javascript|js|node|nodejs)\b/i.test(norm)) targetLang = 'javascript';
  else if (/\b(java)\b/i.test(norm)) targetLang = 'java';
  else if (/\b(golang|go)\b/i.test(norm)) targetLang = 'go';
  else if (/\b(rust)\b/i.test(norm)) targetLang = 'rust';

  // 2. 下游場景意圖
  const scenarios = [];
  if (/rag|llm|markdown|知識庫|向量/i.test(norm)) scenarios.push('rag');
  if (/testing|test|e2e|單元測試|端對端/i.test(norm)) scenarios.push('testing');
  if (/pipeline|大數據|併發|批量|高併發/i.test(norm)) scenarios.push('pipeline');
  if (/dom|xml|標籤/i.test(norm)) scenarios.push('dom');
  if (/ppt|簡報|powerpoint|slide/i.test(norm)) scenarios.push('presentation');

  // 3. 特性/約束需求
  const features = [];
  if (/動態|spa|js|javascript|渲染/i.test(norm)) features.push('dynamic_rendering');
  if (/防封鎖|代理|proxy|header|輪換/i.test(norm)) features.push('anti_blocking');

  return {
    originalQuery: query,
    targetLang,
    scenarios,
    features
  };
}

/**
 * 五維度競品重排矩陣 (5D Disambiguation Reranker)
 * 對初篩候選工具進行語言匹配、下游意圖適配、禁用場景強硬扣分與健康度重排
 * @param {object[]} candidates - [{ tool, score, ... }]
 * @param {object} context - extractQueryContext() 的回傳值
 * @param {object} [options] - 其他選項 (如 telemetryStats)
 * @returns {object[]} 重排後帶有 disambiguationReasons 的候選工具清單
 */
export function rerankCandidates(candidates, context, options = {}) {
  if (!candidates || candidates.length === 0) return [];

  const { targetLang, scenarios, features } = context;

  const reranked = candidates.map(item => {
    const tool = item.tool;
    let newScore = item.score;
    const reasons = [];

    // 維度 A: 語言偏好對齊
    if (targetLang && tool.language) {
      const toolLang = normalize(tool.language);
      if (toolLang.includes(targetLang) || (targetLang === 'javascript' && toolLang.includes('typescript'))) {
        newScore += 0.25;
        reasons.push(`💡 程式語言強吻合 (${tool.language})`);
      } else {
        newScore -= 0.35;
        reasons.push(`⚠️ 程式語言不匹配 (${tool.language} vs 需要 ${targetLang})`);
      }
    }

    // 維度 B: 下游場景意圖匹配
    if (scenarios.length > 0) {
      const toolUseCase = (tool.useCase || '').toLowerCase();
      const toolDesc = (tool.description || '').toLowerCase();
      const toolCategory = (tool.category || '').toLowerCase();

      for (const sc of scenarios) {
        if (sc === 'rag' && (toolUseCase.includes('rag') || toolUseCase.includes('markdown') || toolDesc.includes('llm'))) {
          newScore += 0.30;
          reasons.push('🌟 原生支援 LLM / RAG 資料清洗與 Markdown 轉譯');
        } else if (sc === 'testing' && (toolCategory.includes('測試') || toolUseCase.includes('測試') || toolUseCase.includes('e2e'))) {
          newScore += 0.30;
          reasons.push('🌟 原生專注端對端 (E2E) UI 自動化測試');
        } else if (sc === 'pipeline' && (toolUseCase.includes('併發') || toolUseCase.includes('管道') || toolDesc.includes('async'))) {
          newScore += 0.25;
          reasons.push('🌟 支援大數據非同步 Pipeline 與高併發處理');
        }
      }
    }

    // 維度 C: 禁用場景強硬扣分 (Negative Constraints Filter)
    if (features.includes('dynamic_rendering') && tool.negativeConstraints) {
      const hasNegative = tool.negativeConstraints.some(c => 
        /不支援動態|不支援 javascript|需搭配|不內建/i.test(c)
      );
      if (hasNegative) {
        newScore -= 0.60; // 重罰
        reasons.push('🚫 觸發禁用場景門禁: 缺少動態 JavaScript 渲染能力');
      }
    }

    // 維度 D: GitHub Stars 加權
    if (tool.stars && tool.stars > 1000) {
      const starBonus = Math.min(Math.log10(tool.stars) * 0.05, 0.20);
      newScore += starBonus;
    }

    return {
      ...item,
      score: Math.max(0.01, Math.round(newScore * 100) / 100),
      disambiguationReasons: reasons
    };
  });

  return reranked.sort((a, b) => b.score - a.score);
}

/**
 * 按分類列出所有工具
 * @param {object[]} registryTools 
 * @returns {Map<string, object[]>} 分類 → 工具列表
 */
export function listByCategory(registryTools) {
  const map = new Map();

  for (const tool of registryTools) {
    if (!map.has(tool.category)) {
      map.set(tool.category, []);
    }
    map.get(tool.category).push(tool);
  }

  return map;
}

/**
 * 取得所有工具
 * @param {object[]} registryTools 
 * @returns {object[]}
 */
export function listAll(registryTools) {
  return registryTools;
}

/**
 * 按 ID 取得工具
 * @param {object[]} registryTools 
 * @param {string} id
 * @returns {object|null}
 */
export function getById(registryTools, id) {
  return registryTools.find(t => t.id === id) || null;
}

/**
 * 複雜任務多工具鏈自動規劃器 (Tool Chain Planner)
 * 剖析長任務 Prompt，拆解步驟並為每個步驟配對最適工具與資料傳遞介面
 * @param {object[]} registryTools 
 * @param {string} taskDescription 
 * @returns {object} 包含 steps, asciiPipeline, summary
 */
export function planToolChain(registryTools, taskDescription) {
  if (!taskDescription || typeof taskDescription !== 'string') {
    return { steps: [], asciiPipeline: '', summary: '無效的任務描述' };
  }

  // 按常見連接詞/標點切分多步驟子任務
  const rawSegments = taskDescription
    .split(/(?:然後|接著|轉成|發送|生成|產出|步驟\d+[:：]?|->|=>|；|;|\n|與此同時|，|,)+/i)
    .map(s => s.trim().replace(/^[\s,，。、；;：:!！?？\-_/\\]+/g, '').replace(/[\s,，。、；;：:!！?？\-_/\\]+$/g, '').replace(/^(並|並且|且|與|或|接著|然後)+/g, '').replace(/(並|並且|且|與|或)+$/g, '').trim())
    .filter(s => s.length > 0);

  const segments = rawSegments.length > 0 ? rawSegments : [taskDescription];
  const steps = [];

  segments.forEach((seg, idx) => {
    // 扣除常見動詞前綴以提升關鍵字命中率
    const cleanedSeg = seg.replace(/^(抓取|爬取|下載|解析|提取|生成|製作|發送|處理|分析|建立)\s*/i, '').trim();
    let matches = search(registryTools, cleanedSeg.length > 0 ? cleanedSeg : seg, { topK: 3 });
    if (matches.length === 0) {
      matches = search(registryTools, seg, { topK: 3 });
    }
    const primary = matches[0] ? matches[0].tool : null;
    const alternatives = matches.slice(1).map(m => m.tool);

    let inputFormat = '原始數據 / 指令 Prompt';
    let outputFormat = '結構化資料 / 檔案';

    if (primary) {
      const cat = (primary.category || '').toLowerCase();
      if (cat.includes('瀏覽器') || cat.includes('爬蟲')) {
        inputFormat = 'URL / 網址清單';
        outputFormat = 'HTML / Markdown / Cleaned Text';
      } else if (cat.includes('ai 代理') || cat.includes('框架')) {
        inputFormat = 'Markdown / Context Prompt';
        outputFormat = 'LLM 回應 / 結構化 JSON';
      } else if (cat.includes('文件') || cat.includes('簡報') || cat.includes('多媒體')) {
        inputFormat = 'Markdown / JSON Data';
        outputFormat = 'PPTX / PDF / 多媒體檔案';
      } else if (cat.includes('測試') || cat.includes('自動化')) {
        inputFormat = '測試腳本 / 自動化指令';
        outputFormat = '測試報告 / Console Log';
      }
    }

    steps.push({
      stepIndex: idx + 1,
      action: seg,
      recommendedTool: primary ? {
        id: primary.id,
        name: primary.name,
        category: primary.category,
        install: primary.install,
        useCase: primary.useCase || primary.description
      } : null,
      inputFormat,
      outputFormat,
      alternatives: alternatives.map(a => ({ id: a.id, name: a.name }))
    });
  });

  // 建構 ASCII 流程圖
  const flowNodes = steps.map(s => `[Step ${s.stepIndex}: ${s.recommendedTool ? s.recommendedTool.name : '未知工具'}]`);
  const asciiPipeline = flowNodes.join(' ──(Data Flow)──> ');

  return {
    task: taskDescription,
    totalSteps: steps.length,
    steps,
    asciiPipeline,
    summary: `成功為任務「${taskDescription}」規劃 ${steps.length} 步驟工具鏈`
  };
}
