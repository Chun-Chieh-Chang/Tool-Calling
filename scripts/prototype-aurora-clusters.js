#!/usr/bin/env node
/**
 * prototype-aurora-clusters.js — 驗證「工具會自然聚成有意義群集」這個假設(唯讀)
 *
 * 背景:
 *   Aurora 架構(TRIZ 分析 §8)的前提是「工具間的相似度關係會湧現出類別」。
 *   若此假設不成立,整個架構無效。本腳本用最小成本先驗證它。
 *
 * 驗證方法:
 *   1. 對全庫 696 筆工具做 TF-IDF 向量化(與 measure-discriminability 同精神)
 *   2. 凝聚式分群(agglomerative, average-linkage)切成 K 個群集
 *   3. 比對「湧現群集」與「現行 18 分類」的關係:
 *      - 若群集 ≈ 現行分類 → Aurora 只是重新發現已知分類,無獨立價值
 *      - 若群集 ≠ 現行分類 → 證明語料中存在現行分類未捕捉的結構
 *
 * 指標:
 *   - purity    每個群集內「最多數類別」的佔比加權平均(群集對分類的忠誠度)
 *   - NMI       正規化互資訊(0=無關, 1=完全相同)
 *   - 混淆矩陣  每個群集的類別組成
 *
 * 用法:
 *   node scripts/prototype-aurora-clusters.js            # K=18(與現行分類數相同)
 *   node scripts/prototype-aurora-clusters.js --k=8      # 自訂群集數
 *   node scripts/prototype-aurora-clusters.js --json     # JSON 輸出
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const REGISTRY_PATH = path.join(ROOT, 'registry', 'tools.json');

const AS_JSON = process.argv.includes('--json');
const K = Number((process.argv.find((a) => a.startsWith('--k=')) || '').split('=')[1]) || 18;
const MIN_SIZE = Number((process.argv.find((a) => a.startsWith('--min-size=')) || '').split('=')[1]) || 3;

const STOP = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'are', 'you', 'can', 'use', 'using',
  'your', 'not', 'all', 'any', 'has', 'have', 'was', 'were', 'its', 'to', 'of', 'in', 'on',
  'a', 'an', 'is', 'as', 'by', 'or', 'be', 'at', 'we', 'no', 'do', 'if', 'so', 'up', 'out',
  'new', 'one', 'two', 'via', 'per', 'etc', 'based', 'into', 'over', 'more', 'than', 'other'
]);

function tokenize(text) {
  const t = String(text || '').toLowerCase();
  const out = [];
  for (const m of t.matchAll(/[a-z][a-z0-9+.#_-]{1,}/g)) {
    if (!STOP.has(m[0])) out.push(m[0]);
  }
  for (const run of t.match(/[\u4e00-\u9fff]+/g) || []) {
    if (run.length === 1) { out.push(run); continue; }
    for (let i = 0; i < run.length - 1; i++) out.push(run.slice(i, i + 2));
  }
  return out;
}

function toolText(t) {
  return [
    t.name || '',
    t.description || '',
    (t.capabilities || []).join(' '),
    (t.triggers || []).join(' '),
    (t.topics || []).join(' '),
    t.useCase || ''
  ].join(' ');
}

// ─── 建立 TF-IDF 向量(稀疏 Map) ───────────────────────────────────────────
const registry = JSON.parse(readFileSync(REGISTRY_PATH, 'utf8'));
const tools = registry.tools || registry;
const N = tools.length;

const docTokens = tools.map((t) => tokenize(toolText(t)));
const df = new Map();
for (const toks of docTokens) {
  for (const w of new Set(toks)) df.set(w, (df.get(w) || 0) + 1);
}
const idf = (w) => Math.log((N + 1) / ((df.get(w) || 0) + 1)) + 1;

const vectors = docTokens.map((toks) => {
  const tf = new Map();
  for (const w of toks) tf.set(w, (tf.get(w) || 0) + 1);
  const v = new Map();
  let norm = 0;
  for (const [w, c] of tf) {
    const val = (1 + Math.log(c)) * idf(w);
    v.set(w, val);
    norm += val * val;
  }
  norm = Math.sqrt(norm) || 1;
  for (const [w, val] of v) v.set(w, val / norm);
  return v;
});

function cosine(a, b) {
  let dot = 0;
  const [small, big] = a.size <= b.size ? [a, b] : [b, a];
  for (const [k, v] of small) {
    const w = big.get(k);
    if (w !== undefined) dot += v * w;
  }
  return dot;
}

// ─── 凝聚式分群(average-linkage)────────────────────────────────────────────
// 以 union-find 維護群集;每次合併距離最近的兩群(平均連結)
// 為控制複雜度,先做 O(n^2) 相似度矩陣(696^2 = 484k,可接受)

const simMatrix = new Float32Array(N * N);
for (let i = 0; i < N; i++) {
  simMatrix[i * N + i] = 1;
  for (let j = i + 1; j < N; j++) {
    const s = cosine(vectors[i], vectors[j]);
    simMatrix[i * N + j] = s;
    simMatrix[j * N + i] = s;
  }
}

// 群集結構:{members:number[], simSum:number} 用於平均連結
class Cluster {
  constructor(members) {
    this.members = members;
    this.alive = true;
  }
  // 平均連結:與另一群集的平均相似度
  avgSim(other) {
    let sum = 0, cnt = 0;
    for (const i of this.members) {
      for (const j of other.members) {
        sum += simMatrix[i * N + j];
        cnt++;
      }
    }
    return cnt ? sum / cnt : 0;
  }
}

let clusters = tools.map((_, i) => new Cluster([i]));
const clustersById = new Map(clusters.map((c, i) => [i, c]));
let nextId = clusters.length;

// 快取「群集對」的平均相似度,每次合併只重算受影響者
const pairSim = new Map(); // key: `${a}|${b}` (a<b)
const key = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);

// 初始 pair 相似度
for (let i = 0; i < clusters.length; i++) {
  for (let j = i + 1; j < clusters.length; j++) {
    pairSim.set(key(i, j), simMatrix[i * N + j]);
  }
}

let alive = clusters.length;
const target = Math.max(1, Math.min(K, N));

if (!AS_JSON) {
  process.stderr.write(`凝聚式分群:${N} 筆 → 目標 ${target} 群(平均連結)\n`);
}

while (alive > target) {
  // 找相似度最高的群集對
  let bestKey = null, bestSim = -Infinity;
  for (const [k, s] of pairSim) {
    if (s > bestSim) { bestSim = s; bestKey = k; }
  }
  if (!bestKey) break;
  const [aid, bid] = bestKey.split('|').map(Number);
  const a = clustersById.get(aid), b = clustersById.get(bid);
  if (!a || !b || !a.alive || !b.alive) { pairSim.delete(bestKey); continue; }

  // 合併 b → a
  const merged = new Cluster([...a.members, ...b.members]);
  a.alive = false;
  b.alive = false;
  clustersById.set(nextId, merged);
  merged.alive = true;

  // 移除與 a、b 相關的 pair
  for (const k of [...pairSim.keys()]) {
    const [x, y] = k.split('|').map(Number);
    if (x === aid || y === aid || x === bid || y === bid) pairSim.delete(k);
  }
  // 計算新群集與其他存活群集的相似度
  for (const [cid, c] of clustersById) {
    if (!c.alive || cid === nextId) continue;
    pairSim.set(key(nextId, cid), merged.avgSim(c));
  }
  nextId++;
  alive--;
}

const finalClusters = [...clustersById.values()].filter((c) => c.alive);

// ─── 評估:群集 vs 現行分類 ─────────────────────────────────────────────────
const catOf = (i) => tools[i].category || '(none)';
const categories = [...new Set(tools.map((_, i) => catOf(i)))];

// purity:每個群集取最多數類別
let correct = 0, total = 0;
const crosstab = finalClusters.map((c) => {
  const counts = {};
  for (const i of c.members) counts[catOf(i)] = (counts[catOf(i)] || 0) + 1;
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  correct += top[0] ? top[0][1] : 0;
  total += c.members.length;
  return { size: c.members.length, counts, top };
});
const purity = total ? correct / total : 0;

// NMI(正規化互資訊)
function entropy(counts, n) {
  let h = 0;
  for (const v of Object.values(counts)) {
    if (!v) continue;
    const p = v / n;
    h -= p * Math.log(p);
  }
  return h;
}
const clusterCounts = crosstab.map((c) => c.counts);
const H_cluster = crosstab.reduce((acc, c) => acc + (c.size / total) * entropy(c.counts, c.size), 0);
const allCatCounts = {};
for (let i = 0; i < N; i++) allCatCounts[catOf(i)] = (allCatCounts[catOf(i)] || 0) + 1;
const H_cat = entropy(allCatCounts, N);

let MI = 0;
for (let ci = 0; ci < finalClusters.length; ci++) {
  const csize = finalClusters[ci].members.length;
  for (const [cat, cnt] of Object.entries(clusterCounts[ci])) {
    const joint = cnt / total;
    const p_c = csize / total;
    const p_k = allCatCounts[cat] / total;
    MI += joint * Math.log(joint / (p_c * p_k));
  }
}
const NMI = H_cluster + H_cat > 0 ? (2 * MI) / (H_cluster + H_cat) : 0;

// ─── 輸出 ───────────────────────────────────────────────────────────────────
if (AS_JSON) {
  console.log(JSON.stringify({
    k: target,
    n: N,
    purity: Number(purity.toFixed(4)),
    nmi: Number(NMI.toFixed(4)),
    clusters: crosstab.map((c, i) => ({
      id: i,
      size: c.size,
      topCategory: c.top[0] ? c.top[0][0] : null,
      topCount: c.top[0] ? c.top[0][1] : 0,
      composition: c.counts
    }))
  }, null, 2));
} else {
  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  湧現群集 vs 現行分類  (K=${target})`);
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');
  console.log(`  群集數        : ${finalClusters.length}`);
  console.log(`  Purity        : ${(purity * 100).toFixed(1)}%  (群集對現行分類的忠誠度)`);
  console.log(`  NMI           : ${NMI.toFixed(3)}  (0=無關, 1=完全相同)`);
  console.log('');
  console.log('  判讀:');
  if (NMI > 0.7) {
    console.log('    ⚠️  NMI 高 → 湧現群集 ≈ 現行分類。Aurora 只是重新發現已知結構。');
  } else if (NMI > 0.4) {
    console.log('    ◐  NMI 中等 → 兩者部分重疊,存在現行分類未捕捉的結構。');
  } else {
    console.log('    ✅ NMI 低 → 語料中存在現行 18 分類「完全沒捕捉到」的結構。');
  }
  console.log('');
  console.log('  各群集組成(size ≥ ' + MIN_SIZE + '):');
  console.log('  ─────────────────────────────────────────────────────────');
  const sorted = crosstab.map((c, i) => ({ ...c, id: i })).sort((a, b) => b.size - a.size);
  for (const c of sorted) {
    if (c.size < MIN_SIZE) continue;
    const comp = Object.entries(c.counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([k, v]) => `${k}:${v}`)
      .join(', ');
    const purityOfCluster = c.top[0] ? ((c.top[0][1] / c.size) * 100).toFixed(0) : '0';
    console.log(`  #${String(c.id).padStart(2)} n=${String(c.size).padStart(3)} [${purityOfCluster.padStart(3)}%] ${comp}`);
  }
  // 太小的群集統計
  const tiny = sorted.filter((c) => c.size < MIN_SIZE);
  if (tiny.length) {
    console.log('');
    console.log(`  (另有 ${tiny.length} 個群集 < ${MIN_SIZE} 筆,共 ${tiny.reduce((a, c) => a + c.size, 0)} 筆)`);
  }
}
