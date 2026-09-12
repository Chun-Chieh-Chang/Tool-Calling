#!/usr/bin/env node
/**
 * measure-multidimensional.js — 對照「純 description」vs「純 capabilities」
 * 兩個維度的鑑別率（唯讀，不修改任何資料）。
 *
 * 假說：如果 capabilities 維度的類別鑑別率（平均邊際）顯著高於
 *       description 維度，就能證明「換維度 / 多維度分類」能解開
 *       現行单一 category 造成的 333 筆大叢。
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const tools = JSON.parse(readFileSync(path.join(ROOT, 'registry', 'tools.json'), 'utf8')).tools;

// ── tokeniser (same as measure-discriminability) ─────────────────────────
const STOP = new Set(['the','and','for','with','that','this','from','are','you','can','use','using','your','not','all','any','has','have','was','were','its','to','of','in','on','a','an','is','as','by','or','be','at','we','no','do','if','so','up','out','new','one','two','via','per','etc','based','into','over','more','than','other']);
function tokenize(text) {
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

function computeForDim(textOf) {
  const docs = tools.map((t) => tokenize(textOf(t)));
  const df = new Map();
  for (const d of docs) for (const term of new Set(d)) df.set(term, (df.get(term) || 0) + 1);
  const N = docs.length;
  const vecs = docs.map((d) => {
    const tf = new Map();
    for (const term of d) tf.set(term, (tf.get(term) || 0) + 1);
    const v = new Map();
    for (const [term, c] of tf) v.set(term, (c / Math.max(d.length, 1)) * (Math.log(N / (1 + (df.get(term) || 0))) + 1));
    return v;
  });
  const byCat = new Map();
  tools.forEach((t, i) => { (byCat.get(t.category) || byCat.set(t.category, []).get(t.category)).push(i); });
  const centroid = new Map();
  for (const [cat, idxs] of byCat) {
    const c = new Map();
    for (const i of idxs) for (const [k, v] of vecs[i]) c.set(k, (c.get(k) || 0) + v);
    centroid.set(cat, c);
  }
  const rows = tools.map((t, i) => {
    const own = centroid.get(t.category);
    const loo = new Map(own);
    for (const [k, v] of vecs[i]) { const nv = (loo.get(k) || 0) - v; if (nv <= 0) loo.delete(k); else loo.set(k, nv); }
    const ownSim = cosine(vecs[i], loo);
    let bestOther = 0, bestCat = null;
    for (const [cat, c] of centroid) { if (cat === t.category) continue; const s = cosine(vecs[i], c); if (s > bestOther) { bestOther = s; bestCat = cat; } }
    return { id: t.id, category: t.category, margin: ownSim - bestOther, ownSim, bestOther, bestOtherCat: bestCat };
  });
  const byCatRows = new Map();
  for (const r of rows) { (byCatRows.get(r.category) || byCatRows.set(r.category, []).get(r.category)).push(r); }
  const cats = [...byCatRows.entries()].map(([cat, arr]) => ({
    cat, n: arr.length, meanMargin: arr.reduce((s, r) => s + r.margin, 0) / arr.length,
    negativeCount: arr.filter((r) => r.margin < 0).length,
  })).sort((a, b) => a.meanMargin - b.meanMargin);
  const globalMean = rows.reduce((s, r) => s + r.margin, 0) / rows.length;
  return { rows, cats, globalMean };
}

// ── Run each dimension ─────────────────────────────────────────────────────
const dims = {
  '純 description': computeForDim((t) => t.description || ''),
  '純 capabilities': computeForDim((t) => (t.capabilities || []).join(' ')),
  '現行混合（desc+caps+trig+useCase）': computeForDim((t) => [t.description, (t.capabilities||[]).join(' '), (t.triggers||[]).join(' '), t.useCase].join(' ')),
};

function print(dimName, { cats, globalMean }) {
  console.log(`\n══ ${dimName}  全庫平均邊際: ${(globalMean*100).toFixed(1)}% ══`);
  console.log('  分類(依邊際)      筆數  平均邊際  負邊際數');
  for (const c of cats) {
    if (c.n < 5) continue; // skip tiny categories for readability
    const bar = '█'.repeat(Math.max(0, Math.round(c.meanMargin * 20)));
    console.log(`  ${c.cat.padEnd(14)}  ${String(c.n).padStart(4)}  ${(c.meanMargin*100).toFixed(1).padStart(6)}%  ${String(c.negativeCount).padStart(3)}  ${bar}`);
  }
}

print('純 description', dims['純 description']);
print('純 capabilities', dims['純 capabilities']);
print('現行混合', dims['現行混合（desc+caps+trig+useCase）']);

// ── Key insight: for tools that have BOTH description AND capabilities,
//    compare their margin on each dimension ──────────────────────────────
const both = tools.filter((t) => t.description && (t.capabilities || []).length > 0);
const descMargins = dims['純 description'].rows.filter((r) => both.some((t) => t.id === r.id)).map((r) => r.margin);
const capMargins  = dims['純 capabilities'].rows.filter((r) => both.some((t) => t.id === r.id)).map((r) => r.margin);
console.log(`\n【有 capabilities 的 ${both.length} 筆工具】`);
console.log(`  description 維度平均邊際: ${(descMargins.reduce((a,b)=>a+b,0)/descMargins.length*100).toFixed(1)}%`);
console.log(`  capabilities 維度平均邊際: ${(capMargins.reduce((a,b)=>a+b,0)/capMargins.length*100).toFixed(1)}%`);

// Find tools where capabilities dimension is MORE discriminative
const capWins = both.map((t, i) => ({ id: t.id, cat: t.category, d: descMargins[i], c: capMargins[i] }))
  .filter((x) => x.c > x.d + 0.05) // capabilities margin at least 5% better
  .sort((a, b) => (b.c - b.d) - (a.c - a.d));
console.log(`\n【capabilities 維度比 description 好 ≥5% 的工具（前 10）】`);
capWins.slice(0, 10).forEach((x) => console.log(`  ${x.id.padEnd(40)} ${x.cat.padEnd(12)} desc=${(x.d*100).toFixed(1)}% caps=${(x.c*100).toFixed(1)}%`));
