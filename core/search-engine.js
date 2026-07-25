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
  // 按空白、逗號、句號、頓號切分
  return normalized
    .split(/[\s,，。、；;：:!！?？\-_/\\]+/)
    .filter(t => t.length > 0);
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
      const triggerNorm = normalize(trigger);
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
    // （詞語共現），才視為真正相關；單詞查詢則維持原本行為。
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
  return merged.slice(0, topK);
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
