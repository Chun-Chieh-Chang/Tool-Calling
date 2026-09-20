#!/usr/bin/env node
/**
 * tokenize.js — 共用的中英混合斷詞／IDF／加權相似度
 *
 * 為什麼抽出來
 * ─────────────
 * `agent-retrieval.js`（四維引擎）與 `wiki-matcher.js`（知識編譯器配對端）
 * 必須使用**完全相同**的斷詞與相似度定義，否則同一個詞在兩個引擎裡會
 * 得到不同分數，兩者的輸出就無法放在同一個 weighted 公式裡比較。
 *
 * 這些函式原本是 agent-retrieval.js 的私有實作。與其在 wiki-matcher 裡
 * 複製一份（複製必然漂移），不如抽成共用模組，兩邊都 import。
 *
 * 斷詞規則（與 measure-multidimensional.js 一致）
 * ────────────────────────────────────────────
 *  英文／數字：正則取出 ≥2 字的詞，去除停用詞
 *  中文      ：連續中文段切成 **bigram**（瀏覽器 → 瀏覽/覽器）
 *
 * ⚠️ bigram 的後果：簡體與繁體**永遠不可能匹配**
 *    （「瀏覽器」切 瀏覽/覽器，「浏览器」切 浏览/览器，零重疊）。
 *    因此所有寫入索引的文字都必須先過 `toTraditional()`
 *    （見 scripts/fix-simplified.js）。
 */

// ── 停用詞 ─────────────────────────────────────────────────────────────────
const STOP = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'are', 'you', 'can',
  'use', 'using', 'your', 'not', 'all', 'any', 'has', 'have', 'was', 'were',
  'its', 'to', 'of', 'in', 'on', 'a', 'an', 'is', 'as', 'by', 'or', 'be',
  'at', 'we', 'no', 'do', 'if', 'so', 'up', 'out', 'new', 'one', 'two',
  'via', 'per', 'etc', 'based', 'into', 'over', 'more', 'than', 'other',
]);

/**
 * 中英混合斷詞
 * @param {string} text
 * @returns {string[]} token 陣列（可重複）
 */
function tokenize(text) {
  const t = String(text || '').toLowerCase();
  const out = [];
  for (const m of t.matchAll(/[a-z][a-z0-9+.#_-]{1,}/g)) if (!STOP.has(m[0])) out.push(m[0]);
  for (const run of t.match(/[一-鿿]+/g) || []) {
    if (run.length === 1) out.push(run);
    else for (let i = 0; i < run.length - 1; i++) out.push(run.slice(i, i + 2));
  }
  return out;
}

/**
 * token 陣列 → 詞袋 Map<token, count>
 * @param {string[]} tokens
 * @returns {Map<string, number>}
 */
function bagOf(tokens) {
  const b = new Map();
  for (const t of tokens) b.set(t, (b.get(t) || 0) + 1);
  return b;
}

/**
 * 文件頻率（df）：每個 token 出現在幾份文件中
 * @param {string[]} texts - 每份文件的原始文字
 * @returns {Map<string, number>}
 */
function documentFrequency(texts) {
  const df = new Map();
  for (const t of texts) {
    for (const tok of new Set(tokenize(t))) df.set(tok, (df.get(tok) || 0) + 1);
  }
  return df;
}

/**
 * df → IDF 權重表
 * 把「所有工具都有」的詞（ai、tool、agent、markdown）壓低，
 * 讓罕見詞（playwright、kubernetes、stock）有更高鑑別力。
 * @param {Map<string, number>} df
 * @param {number} N - 文件總數
 * @returns {Map<string, number>}
 */
function idfFromDf(df, N) {
  const m = new Map();
  for (const [tok, d] of df) m.set(tok, Math.log((N + 1) / (d + 1)) + 1);
  return m;
}

/**
 * 身分欄位（id + name + triggers）的 IDF —— 四維引擎 V1~V4 共用。
 *
 * 注意：四維全部都用**這份** IDF，而不是各自建一份。這是刻意的：
 * 讓「罕見詞」在任何維度命中都有一致的高權重，避免維度間因 IDF
 * 基準不同而無法比較。
 *
 * @param {object[]} tools
 * @returns {{ idfIdentity: Map<string, number>, dfIdentity: Map<string, number>, identityDocumentCount: number }}
 */
function buildIdentityIdf(tools) {
  const dfId = documentFrequency(tools.map((t) => [t.id, t.name, ...(t.triggers || [])].join(' ')));
  return {
    idfIdentity: idfFromDf(dfId, tools.length),
    dfIdentity: dfId,
    identityDocumentCount: tools.length,
  };
}

/**
 * IDF 加權的詞袋相似度（餘弦）
 *
 *   sum(idf[共詞]^2 * wA * wB) / (sqrt(sum(idf^2*wA)) * sqrt(sum(idf^2*wB)))
 *
 * 注意：只看 token **是否出現**，不看出現次數（詞袋的集合餘弦）。
 * 因此查詢端做「同義詞／圖譜擴張」時，加進來的詞會同時放大分子與
 * 分母——效果是「軟性 OR」，命中就加分、沒命中就稀釋。
 *
 * @param {Map<string, number>} a
 * @param {Map<string, number>} b
 * @param {Map<string, number>} idfMap
 * @param {{weightA?: number, weightB?: number}} [opts]
 * @returns {number} 0~1
 */
function weightedSim(a, b, idfMap, { weightA = 1, weightB = 1 } = {}) {
  if (!a || !b || a.size === 0 || b.size === 0) return 0;
  let dot = 0;
  const [small, big] = a.size <= b.size ? [a, b] : [b, a];
  for (const k of small.keys()) {
    if (big.has(k)) {
      const w = idfMap.get(k) || 1;
      dot += w * w * weightA * weightB;
    }
  }
  if (dot === 0) return 0;
  let na = 0;
  let nb = 0;
  for (const k of a.keys()) { const w = idfMap.get(k) || 1; na += w * w * weightA; }
  for (const k of b.keys()) { const w = idfMap.get(k) || 1; nb += w * w * weightB; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export {
  STOP,
  tokenize,
  bagOf,
  documentFrequency,
  idfFromDf,
  buildIdentityIdf,
  weightedSim,
};
