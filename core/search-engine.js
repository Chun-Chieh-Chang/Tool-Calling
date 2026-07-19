/**
 * Tool-Calling 檢索引擎
 * 三層檢索架構：L1 精確匹配 → L2 關鍵字匹配 → L3 語義檢索
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REGISTRY_PATH = join(__dirname, '..', 'registry', 'tools.json');

/**
 * 載入工具註冊庫
 * @returns {object} tools.json 內容
 */
export function loadRegistry() {
  const raw = readFileSync(REGISTRY_PATH, 'utf-8');
  return JSON.parse(raw);
}

/**
 * 文字正規化：轉小寫 + 去除多餘空白
 * @param {string} text
 * @returns {string}
 */
function normalize(text) {
  return (text || '').toLowerCase().trim().replace(/\s+/g, ' ');
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

  const results = [];

  for (const tool of tools) {
    let score = 0;
    const matchedKeywords = [];

    // 觸發關鍵字匹配（權重最高：每個匹配 +3）
    for (const trigger of tool.triggers) {
      const triggerNorm = normalize(trigger);
      // 查詢包含觸發詞
      if (normalize(query).includes(triggerNorm)) {
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
    if (tool.subTools) {
      for (const subTool of tool.subTools) {
        const subName = normalize(subTool.name);
        const subDesc = normalize(subTool.description);
        let subMatch = false;
        
        for (const token of queryTokens) {
          if (subName.includes(token) && token.length >= 2) {
            score += 1.5;
            subMatch = true;
          }
          if (subDesc.includes(token) && token.length >= 3) {
            score += 1.0;
            subMatch = true;
          }
        }
        if (subMatch && !matchedKeywords.includes(`subtool:${subTool.name}`)) {
          matchedKeywords.push(`subtool:${subTool.name}`);
        }
      }
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

    if (score > 0) {
      // 正規化分數到 0~1 範圍
      const maxPossible = tool.triggers.length * 4.5 + 2 + 5 + (tool.capabilities?.length || 0) * 2;
      const normalizedScore = Math.min(score / maxPossible, 0.99);
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

/**
 * 內建同義詞詞典（中英文雙向映射）
 * 用於查詢擴展：當用戶說「做簡報」時，自動匹配 "ppt", "slides", "presentation" 等
 */
const SYNONYM_MAP = {
  // 簡報相關
  '簡報': ['ppt', 'powerpoint', 'slides', 'presentation', '投影片', '演示文稿', 'deck'],
  'ppt': ['簡報', 'powerpoint', 'slides', 'presentation', '投影片'],
  'presentation': ['簡報', 'ppt', 'slides', '投影片', 'deck'],
  // 安全相關
  '安全': ['security', 'vulnerability', '漏洞', 'pentest', '滲透'],
  'security': ['安全', 'vulnerability', '漏洞', 'pentest', '滲透測試'],
  '漏洞': ['vulnerability', 'security', '安全', 'pentest'],
  // 圖片/影片相關
  '圖片': ['image', 'photo', '影像', 'picture', 'img'],
  'image': ['圖片', 'photo', '影像', 'picture', 'img'],
  '影片': ['video', '動畫', 'animation', 'movie', 'clip'],
  'video': ['影片', '動畫', 'animation', 'movie'],
  '動畫': ['animation', 'video', '影片', 'animate', 'cartoon'],
  'animation': ['動畫', 'video', '影片', 'animate', 'cartoon'],
  // 生成相關
  '生成': ['generate', 'create', 'make', '產生', '建立'],
  'generate': ['生成', 'create', 'make', '產生'],
  // 測試相關
  '測試': ['test', 'testing', 'e2e', '自動化測試'],
  'test': ['測試', 'testing', 'e2e', '自動化'],
  '自動化': ['automation', 'automated', '測試'],
  // 檔案/儲存相關
  '檔案': ['file', 'document', 'storage', '儲存'],
  'file': ['檔案', 'document', 'storage', '儲存'],
  '儲存': ['storage', 'file', '檔案', 'cloud'],
  'storage': ['儲存', 'file', '檔案', 'cloud'],
  // 知識/分析相關
  '知識': ['knowledge', 'graph', '圖譜', '分析'],
  'knowledge': ['知識', 'graph', '圖譜'],
  '分析': ['analysis', 'analyze', '解析', 'understand'],
  'analysis': ['分析', 'analyze', '解析'],
  // 瀏覽器相關
  '瀏覽器': ['browser', 'chromium', 'firefox', 'webkit'],
  'browser': ['瀏覽器', 'chromium', 'firefox', 'webkit'],
  '爬蟲': ['scraping', 'crawler', 'spider', 'scrape'],
  'scraping': ['爬蟲', 'crawler', 'spider'],
  // 截圖相關
  '截圖': ['screenshot', 'capture', 'snapshot'],
  'screenshot': ['截圖', 'capture', 'snapshot'],
};

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
    // 子工具
    ...(tool.subTools || []).map(st => `${st.name} ${st.description}`)
  ];
  return parts.join(' ');
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
 * 計算 N-gram 重疊度
 * @param {string[]} ngrams1
 * @param {string[]} ngrams2
 * @returns {number} 0~1
 */
function ngramOverlap(ngrams1, ngrams2) {
  if (ngrams1.length === 0 || ngrams2.length === 0) return 0;
  const set1 = new Set(ngrams1);
  const set2 = new Set(ngrams2);
  const intersection = [...set1].filter(x => set2.has(x));
  return (2 * intersection.length) / (set1.size + set2.size); // Dice 係數
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
  const queryNgrams = charNgrams(query);

  // Step 2: 建立所有文檔的 token 集合
  const toolTexts = tools.map(t => buildToolText(t));
  const allDocTokens = toolTexts.map(t => tokenize(t));
  // 加入查詢自身以計算 IDF
  allDocTokens.push(expandedQueryTokens);

  // Step 3: 計算 IDF
  const idf = computeIDF(allDocTokens);

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
    const docTokens = allDocTokens[i];

    // TF-IDF 餘弦相似度（權重 0.6）
    const docTF = computeTF(docTokens);
    const docVec = new Map();
    for (const [token, tf] of docTF) {
      docVec.set(token, tf * (idf.get(token) || 1));
    }
    const tfidfScore = cosineSimilarity(queryVec, docVec);

    // N-gram 重疊度（權重 0.4）— 對中文子字串匹配特別有效
    const toolNgrams = charNgrams(toolTexts[i]);
    const ngramScore = ngramOverlap(queryNgrams, toolNgrams);

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
 * @param {string} query - 搜尋查詢
 * @param {object} options - 選項
 * @param {number} [options.topK=5] - 返回前 K 個結果
 * @param {string} [options.category] - 限定分類
 * @param {string} [options.language] - 限定語言
 * @returns {object[]} 搜尋結果
 */
export function search(query, options = {}) {
  const { topK = 5, category, language } = options;
  const registry = loadRegistry();
  let tools = registry.tools.filter(t => t.status === 'active' || t.status === 'experimental');

  // 前置過濾
  if (category) {
    tools = tools.filter(t => normalize(t.category) === normalize(category));
  }
  if (language) {
    tools = tools.filter(t => normalize(t.language) === normalize(language));
  }

  // L1 精確匹配
  const l1Results = exactMatch(tools, query);
  if (l1Results.length > 0) {
    return l1Results.slice(0, topK);
  }

  // L2 關鍵字匹配
  const l2Results = keywordMatch(tools, query);

  // L3 語義檢索（作為補充）
  const l3Results = semanticSearch(tools, query);

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

  merged.sort((a, b) => b.score - a.score);
  return merged.slice(0, topK);
}

/**
 * 按分類列出所有工具
 * @returns {Map<string, object[]>} 分類 → 工具列表
 */
export function listByCategory() {
  const registry = loadRegistry();
  const map = new Map();

  for (const tool of registry.tools) {
    if (!map.has(tool.category)) {
      map.set(tool.category, []);
    }
    map.get(tool.category).push(tool);
  }

  return map;
}

/**
 * 取得所有工具
 * @returns {object[]}
 */
export function listAll() {
  return loadRegistry().tools;
}

/**
 * 按 ID 取得工具
 * @param {string} id
 * @returns {object|null}
 */
export function getById(id) {
  const registry = loadRegistry();
  return registry.tools.find(t => t.id === id) || null;
}
