/**
 * 搜尋 Web Worker（獨立版本）
 * 
 * 用途：將耗時的 L3 語義檢索（TF-IDF + N-gram）移至背景執行，
 * 避免阻塞主線程 UI 更新。
 * 
 * 使用方式：
 *   const worker = new Worker('./search-worker.js');
 *   worker.postMessage({ type: 'warmup', payload: { tools: [...] } });
 *   worker.postMessage({ type: 'search', payload: { query: '...' } });
 */

// ─── 必要函數（自包含，不依賴外部模組）───────────────────────────────

function normalize(text) {
  if (Array.isArray(text)) {
    return text.map(t => normalize(t)).join(' ');
  }
  if (typeof text !== 'string') {
    return (text || '').toString().toLowerCase().trim().replace(/\s+/g, ' ');
  }
  return text.toLowerCase().trim().replace(/\s+/g, ' ');
}

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

function charNgrams(text, n = 2) {
  const normalized = normalize(text).replace(/\s+/g, '');
  if (normalized.length < n) return [normalized];
  const ngrams = [];
  for (let i = 0; i <= normalized.length - n; i++) {
    ngrams.push(normalized.slice(i, i + n));
  }
  return ngrams;
}

function computeTF(tokens) {
  const tf = new Map();
  for (const token of tokens) {
    tf.set(token, (tf.get(token) || 0) + 1);
  }
  const max = Math.max(...tf.values(), 1);
  for (const [key, val] of tf) {
    tf.set(key, val / max);
  }
  return tf;
}

function buildToolText(tool) {
  const MAX_TOOL_TEXT_LENGTH = 3000;
  const parts = [
    tool.name, tool.name, tool.name,
    ...(tool.triggers || []), ...(tool.triggers || []),
    tool.description,
    tool.category, tool.category,
    ...(tool.capabilities || []).map(c => c.replace(/-/g, ' ')),
    tool.useCase || '',
    ...(tool.advantages || []),
    ...(tool.subTools || []).map(st => `${st.name} ${st.description}`)
  ];
  const text = parts.join(' ');
  return text.length > MAX_TOOL_TEXT_LENGTH ? text.slice(0, MAX_TOOL_TEXT_LENGTH) : text;
}

// ─── 同義詞映射（從 synonyms.generated.js 移植的常用映射）────────────────
const SYNONYM_MAP = {
  "簡報": ["ppt", "powerpoint", "deck", "slide-deck", "presentation-generator"],
  "ppt": ["簡報", "powerpoint", "deck", "slide-deck"],
  "powerpoint": ["簡報", "ppt", "deck", "slide-deck"],
  "影像編輯": ["imagine", "image", "stable diffusion", "ai image"],
  "圖片": ["imagine", "image", "stable diffusion"],
  "翻譯": ["translate", "translation", "localization"],
  "translate": ["翻譯", "translation"],
  "資料分析": ["data analysis", "analytics", "dashboard"],
  "知識庫": ["knowledge base", "rag", "vector db"],
  "API 呼叫": ["api call", "rest", "graphql", "webhook"],
  "程式碼生成": ["code generation", "codegen", "scaffold"],
  "網頁爬蟲": ["web scraping", "crawler"],
  "資料庫": ["database", "sql", "db"],
  "命令列": ["cli", "command line", "terminal"]
};

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

// ─── 核心計算函數 ────────────────────────────────────────────────────────

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

function ngramSetOverlap(set1, set2) {
  if (set1.size === 0 || set2.size === 0) return 0;
  const [small, large] = set1.size <= set2.size ? [set1, set2] : [set2, set1];
  let intersectionSize = 0;
  for (const x of small) {
    if (large.has(x)) intersectionSize++;
  }
  return (2 * intersectionSize) / (set1.size + set2.size);
}

// ─── 內部狀態 ────────────────────────────────────────────────────────────
let toolIndexCache = new Map(); // id -> { tool, tokens, tf, ngramSet }
let idfCache = null;

/**
 * 建構工具索引（一次性，供後續搜尋複用）
 */
function buildToolIndex(tools) {
  toolIndexCache.clear();
  
  for (const tool of tools) {
    if (!tool || !tool.id) continue;
    
    const text = buildToolText(tool);
    const tokens = tokenize(text);
    const tf = computeTF(tokens);
    const ngramSet = new Set(charNgrams(text));
    
    toolIndexCache.set(tool.id, {
      tool,
      text,
      tokens,
      tf,
      ngramSet
    });
  }
  
  // 預計算 IDF
  const N = toolIndexCache.size;
  const df = new Map();
  for (const entry of toolIndexCache.values()) {
    const unique = new Set(entry.tokens);
    for (const token of unique) {
      df.set(token, (df.get(token) || 0) + 1);
    }
  }
  
  idfCache = new Map();
  for (const [token, count] of df) {
    idfCache.set(token, Math.log((N + 1) / (count + 1)) + 1);
  }
  
  return { toolCount: N, idfTerms: idfCache.size };
}

/**
 * 執行 L3 語義搜尋
 */
function semanticSearchWorker(query, threshold = 0.03) {
  if (!idfCache || toolIndexCache.size === 0) {
    return { error: 'Index not built. Call warmup first.' };
  }
  
  // 查詢處理
  const rawQueryTokens = tokenize(query);
  const expandedQueryTokens = expandSynonyms(rawQueryTokens);
  const queryNgramSet = new Set(charNgrams(query));
  
  // 查詢向量
  const queryTF = computeTF(expandedQueryTokens);
  const queryVec = new Map();
  for (const [token, tf] of queryTF) {
    queryVec.set(token, tf * (idfCache.get(token) || 1));
  }
  
  // 對每個工具計算相似度
  const results = [];
  
  for (const entry of toolIndexCache.values()) {
    const docVec = new Map();
    for (const [token, tf] of entry.tf) {
      docVec.set(token, tf * (idfCache.get(token) || 1));
    }
    
    const tfidfScore = cosineSimilarity(queryVec, docVec);
    const ngramScore = ngramSetOverlap(queryNgramSet, entry.ngramSet);
    const combinedScore = tfidfScore * 0.6 + ngramScore * 0.4;
    
    if (combinedScore >= threshold) {
      results.push({
        id: entry.tool.id,
        name: entry.tool.name,
        score: Math.round(combinedScore * 100) / 100,
        _detail: {
          tfidf: Math.round(tfidfScore * 100) / 100,
          ngram: Math.round(ngramScore * 100) / 100,
        }
      });
    }
  }
  
  return results.sort((a, b) => b.score - a.score);
}

// ─── 事件監聽 ────────────────────────────────────────────────────────────

self.addEventListener('message', (e) => {
  const { type, payload } = e.data;
  
  switch (type) {
    case 'warmup':
      try {
        if (!payload || !Array.isArray(payload.tools)) {
          throw new Error('Invalid payload: missing tools array');
        }
        const stats = buildToolIndex(payload.tools);
        self.postMessage({ 
          type: 'warmup-complete', 
          stats,
          timestamp: Date.now() 
        });
      } catch (err) {
        console.error('[Worker] Warmup failed:', err.message);
        self.postMessage({ type: 'error', message: err.message });
      }
      break;
      
    case 'search':
      try {
        if (!payload || typeof payload.query !== 'string') {
          throw new Error('Invalid payload: missing query string');
        }
        const results = semanticSearchWorker(
          payload.query, 
          payload.threshold || 0.03
        );
        self.postMessage({ 
          type: 'search-result', 
          results,
          timestamp: Date.now()
        });
      } catch (err) {
        console.error('[Worker] Search failed:', err.message);
        self.postMessage({ type: 'error', message: err.message });
      }
      break;
      
    case 'clear':
      toolIndexCache.clear();
      idfCache = null;
      self.postMessage({ type: 'cleared' });
      break;
      
    default:
      self.postMessage({ type: 'error', message: `Unknown command: ${type}` });
  }
});

// 報告 Worker 已就緒
self.postMessage({ type: 'ready', version: '1.0' });
