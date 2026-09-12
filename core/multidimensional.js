/**
 * core/multidimensional.js — 多維度（MECE）TF-IDF 邊際量測（唯讀，純函式）
 *
 * 從 scripts/measure-multidimensional-v2.js 抽出，讓 infer-multidimensional.js
 * 與既有量測腳本共用同一份維度定義與邊際計算，避免兩份漂移。
 *
 * MECE 維度（資訊獨立，Pearson r < 0.5，見 measure-multidimensional-v2.js 驗證）：
 *   D1 語意敘述 = description + useCase + negativeConstraints
 *   D2 詞彙標籤 = capabilities + triggers
 *   D3 名稱身分 = id + name
 *
 * 匯出（純函式，無模組層級副作用）：
 *   DIMS                維度定義 { D1, D2, D3 }
 *   DIM_NAMES           ['D1','D2','D3']
 *   tokenize(text)      中英混合 token 化（含中文 2-gram）
 *   computeMargins(tools, textOf) → 每筆工具 { margin, ownSim, bestOther, bestOtherCat }
 */

// ── tokeniser（與 measure-multidimensional-v2.js 完全一致）─────────────────
const STOP = new Set(['the','and','for','with','that','this','from','are','you','can','use','using','your','not','all','any','has','have','was','were','its','to','of','in','on','a','an','is','as','by','or','be','at','we','no','do','if','so','up','out','new','one','two','via','per','etc','based','into','over','more','than','other']);
export function tokenize(text) {
  const t = String(text || '').toLowerCase();
  const out = [];
  for (const m of t.matchAll(/[a-z][a-z0-9+.#_-]{1,}/g)) if (!STOP.has(m[0])) out.push(m[0]);
  for (const run of t.match(/[\u4e00-\u9fff]+/g) || []) {
    if (run.length === 1) out.push(run);
    else for (let i = 0; i < run.length - 1; i++) out.push(run.slice(i, i + 2));
  }
  return out;
}

function cosine(a, b) {
  let dot = 0;
  const [small, big] = a.size <= b.size ? [a, b] : [b, a];
  for (const [k, v] of small) { const w = big.get(k); if (w !== undefined) dot += v * w; }
  if (dot === 0) return 0;
  let na = 0, nb = 0;
  for (const v of a.values()) na += v * v;
  for (const v of b.values()) nb += v * v;
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function tfidfVecs(tools, textOf) {
  const docs = tools.map((t) => tokenize(textOf(t)));
  const df = new Map();
  for (const d of docs) for (const term of new Set(d)) df.set(term, (df.get(term) || 0) + 1);
  const N = docs.length;
  return docs.map((d) => {
    const tf = new Map();
    for (const term of d) tf.set(term, (tf.get(term) || 0) + 1);
    const v = new Map();
    for (const [term, c] of tf) v.set(term, (c / Math.max(d.length, 1)) * (Math.log(N / (1 + (df.get(term) || 0))) + 1));
    return v;
  });
}

/**
 * 對單一維度（textOf）計算每筆工具的 leave-one-out 邊際。
 * 回傳與 tools 同長度的陣列：{ margin, ownSim, bestOther, bestOtherCat }。
 *
 * leave-one-out：本類質心「去除自身」後再算相似度，避免工具被自己的
 * 向量推高 ownSim 而偽陽性。單筆分類（質心去自身後為空）時 ownSim = 0。
 */
export function computeMargins(tools, textOf) {
  const vecs = tfidfVecs(tools, textOf);
  const byCat = new Map();
  tools.forEach((t, i) => { if (!byCat.has(t.category)) byCat.set(t.category, []); byCat.get(t.category).push(i); });
  const centroid = new Map();
  for (const [cat, idxs] of byCat) {
    const c = new Map();
    for (const i of idxs) for (const [k, v] of vecs[i]) c.set(k, (c.get(k) || 0) + v);
    centroid.set(cat, c);
  }
  return tools.map((t, i) => {
    const own = centroid.get(t.category);
    const loo = new Map(own);
    for (const [k, v] of vecs[i]) { const nv = (loo.get(k) || 0) - v; if (nv <= 0) loo.delete(k); else loo.set(k, nv); }
    const ownSim = cosine(vecs[i], loo);
    let bestOther = 0, bestCat = null;
    for (const [cat, c] of centroid) { if (cat === t.category) continue; const s = cosine(vecs[i], c); if (s > bestOther) { bestOther = s; bestCat = cat; } }
    return { margin: ownSim - bestOther, ownSim, bestOther, bestOtherCat: bestCat };
  });
}

// ── 3 個獨立維度（與 measure-multidimensional-v2.js 一致）──────────────────
export const DIMS = {
  D1: (t) => [t.description, t.useCase, (t.negativeConstraints || []).join(' ')].filter(Boolean).join(' '),
  D2: (t) => [ (t.capabilities || []).join(' '), (t.triggers || []).join(' ') ].filter(Boolean).join(' '),
  D3: (t) => [t.id, t.name].filter(Boolean).join(' '),
};
export const DIM_NAMES = Object.keys(DIMS);
