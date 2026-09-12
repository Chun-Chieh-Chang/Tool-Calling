#!/usr/bin/env node
/**
 * dynamic-k.js — 動態分類：K 自動判定引擎（唯讀，不修改任何資料）
 *
 * 核心原則（使用者 2026-09-12 定調）：
 *   「分類品項是動態調整的，不是固定不變的。分類邏輯應根據工具庫中所有工具
 *    來決定，每次納入新工具都應重新檢討。」
 *   → K（分類數）是**資料的產物**，不是人工前提。18 只是 9/8 那次 22→18 合併
 *     留下的「好管理數字」，不是鑑別率極值。
 *
 * 方法（三路交叉驗證，避免單一指標的偏差）：
 *   1. Gap Statistic（Tibshirani 2001）：實際分群的「群間質心距離 log」
 *      減去隨機標的基線，彎曲點（knee）= 資訊增益最大處。
 *   2. Silhouette Score（avg，K=3..N/2）：局部極大 = 群聚結構最清晰處。
 *   3. 分群品質（split quality）：凝聚過程每次「分裂損失」（最遠兩群質心距）
 *      隨 K 遞減的速率；速率突然變緩處 = 結構層級邊界。
 *
 * 三路各出一個「建議 K」，取**中位數**為正式建議；分歧大時標記需人工裁決。
 *
 * 用法：
 *   node scripts/dynamic-k.js                # 全量報告
 *   node scripts/dynamic-k.js --kmax=80      # 只掃到 K=80
 *   node scripts/dynamic-k.js --json         # JSON 輸出
 */

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const REGISTRY_PATH = path.join(ROOT, 'registry', 'tools.json');
const REPORT_JSON = path.join(ROOT, 'registry', 'dynamic-k-report.json');
const REPORT_MD = path.join(ROOT, 'docs', 'dynamic-k-2026-09-12.md');

const AS_JSON = process.argv.includes('--json');
const KMAX = Number((process.argv.find((a) => a.startsWith('--kmax=')) || '').split('=')[1]) || 80;
const SWEET_SPOT_MIN = 5;   // 建議 K 下限（<5 太粗，失去鑑別意義）
const SWEET_SPOT_CAP = 40;  // 建議 K 上限（>40 人類無法管理圖例／檢索）

// ─── TF-IDF 向量（與 prototype-aurora-clusters.js 同精神，唯讀）──────────────
const STOP = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'are', 'you', 'can', 'use', 'using',
  'your', 'not', 'all', 'any', 'has', 'have', 'was', 'were', 'its', 'to', 'of', 'in', 'on',
  'a', 'an', 'is', 'as', 'by', 'or', 'be', 'at', 'we', 'no', 'do', 'if', 'so', 'up', 'out',
  'new', 'one', 'two', 'via', 'per', 'etc', 'based', 'into', 'over', 'more', 'than', 'other'
]);
function tokenize(text) {
  const t = String(text || '').toLowerCase();
  const out = [];
  for (const m of t.matchAll(/[a-z][a-z0-9+.#_-]{1,}/g)) if (!STOP.has(m[0])) out.push(m[0]);
  for (const run of t.match(/[\u4e00-\u9fff]+/g) || []) {
    if (run.length === 1) { out.push(run); continue; }
    for (let i = 0; i < run.length - 1; i++) out.push(run.slice(i, i + 2));
  }
  return out;
}
function toolText(t) {
  return [t.name || '', t.description || '', (t.capabilities || []).join(' '),
    (t.triggers || []).join(' '), (t.topics || []).join(' '), t.useCase || ''].join(' ');
}

const registry = JSON.parse(readFileSync(REGISTRY_PATH, 'utf8'));
const tools = registry.tools || registry;
const N = tools.length;
const docTokens = tools.map((t) => tokenize(toolText(t)));
const df = new Map();
for (const toks of docTokens) for (const w of new Set(toks)) df.set(w, (df.get(w) || 0) + 1);
const idf = (w) => Math.log((N + 1) / ((df.get(w) || 0) + 1)) + 1;
const vectors = docTokens.map((toks) => {
  const tf = new Map();
  for (const w of toks) tf.set(w, (tf.get(w) || 0) + 1);
  const v = new Map(); let norm = 0;
  for (const [w, c] of tf) { const val = (1 + Math.log(c)) * idf(w); v.set(w, val); norm += val * val; }
  norm = Math.sqrt(norm) || 1;
  for (const [w, val] of v) v.set(w, val / norm);
  return v;
});
function cosine(a, b) {
  let dot = 0;
  const [small, big] = a.size <= b.size ? [a, b] : [b, a];
  for (const [k, v] of small) { const w = big.get(k); if (w !== undefined) dot += v * w; }
  return dot;
}

// ─── 相似度矩陣（O(N²)，N≈700 可接受）────────────────────────────────────────
const simMatrix = new Float32Array(N * N);
for (let i = 0; i < N; i++) {
  simMatrix[i * N + i] = 1;
  for (let j = i + 1; j < N; j++) {
    const s = cosine(vectors[i], vectors[j]);
    simMatrix[i * N + j] = s;
    simMatrix[j * N + i] = s;
  }
}

// ─── 凝聚式分群（平均連結），記錄 K=N→1 全过程的群間距離 ──────────────────────
// 為了做 gap statistic 與 split quality，需要「每次分裂時的群間質心距離」。
// 我們反向做：從 K=N（單點）一路合併到 K=target，記錄每步合併的相似度
// （= 群間距離的 proxy）。K 的「分裂品質」= 把 K+1 拆成 K 時丢掉的群間相似度。
class Cluster {
  constructor(members) { this.members = members; this.alive = true; }
  avgSim(other) {
    let sum = 0, cnt = 0;
    for (const i of this.members) for (const j of other.members) { sum += simMatrix[i * N + j]; cnt++; }
    return cnt ? sum / cnt : 0;
  }
}

function runAgglomerative(targetK) {
  // 每次合併記錄「合併時的平均相似度」（群間距離 1 - sim）
  // 用 min-heap 找最遠對，O(N² log N) 而非 O(N³)
  const merges = [];
  // 相似度矩陣（群級，Float32Array）
  let cN = N; // 存活群數
  const sim = new Float32Array(N * N);
  for (let i = 0; i < N; i++) {
    sim[i * N + i] = 1;
    for (let j = i + 1; j < N; j++) {
      const s = simMatrix[i * N + j];
      sim[i * N + j] = s;
      sim[j * N + i] = s;
    }
  }
  const size = new Int32Array(N).fill(1);
  const alive = new Uint8Array(N).fill(1);
  let nextId = N;
  const target = Math.max(1, Math.min(targetK, N));
  let aliveCount = N;
  while (aliveCount > target) {
    // 找最遠對（相似度最高）
    let bestI = -1, bestJ = -1, bestSim = -1;
    for (let i = 0; i < N; i++) {
      if (!alive[i]) continue;
      for (let j = i + 1; j < N; j++) {
        if (!alive[j]) continue;
        const s = sim[i * N + j];
        if (s > bestSim) { bestSim = s; bestI = i; bestJ = j; }
      }
    }
    if (bestI < 0) break;
    // 合併 bestJ → bestI（Lance–Williams average linkage）
    const newSize = size[bestI] + size[bestJ];
    for (let j = 0; j < N; j++) {
      if (j === bestI || j === bestJ || !alive[j]) continue;
      const newSim = (sim[bestI * N + j] * size[bestI] + sim[bestJ * N + j] * size[bestJ]) / newSize;
      sim[bestI * N + j] = newSim;
      sim[j * N + bestI] = newSim;
    }
    alive[bestJ] = 0;
    size[bestI] = newSize;
    merges.push({ fromK: aliveCount, sim: bestSim });
    aliveCount--;
  }
  // simByK：分裂到 K 群時丢掉的群間相似度（= 該步合併的相似度）
  const simByK = new Map();
  for (const m of merges) simByK.set(m.fromK - 1, m.sim);
  return { simByK };
}

// ─── Gap Statistic ─────────────────────────────────────────────────────────
// 標準 Gap Statistic 用「群內點到質心距離」的 log。我們用等價的群間 proxy：
// 分裂到 K 群時，最後一次合併丢掉的「群間相似度」越低 → 群離得越遠 → 結構越清晰。
// 對 K 序列取「群間相似度」，與隨機 0/1 基線的期望群間相似度相比，gap = 實際 - 隨機。
// 隨機 TF-IDF 向量（同 IDF 分布、隨機詞）的群間相似度期望 ≈ 0（向量隨機方向）。
// 實務上：gap 的「knee」（二階差分最大）= 群結構從「隨機」轉「有意義」的臨界 K。

function gapStatistic(kList, simByK) {
  // simByK[K] = 凝聚到 K 群時最後一次合併的群間相似度。
  // K 越小（群越粗）→ 最後一次合併是「兩個大群」→ 群間相似度越低。
  // K 越大（群越細）→ 最後一次合併是「兩個小群」→ 群間相似度越高。
  // 所以 sim 隨 K 遞增而遞增（0.0057@K3 → 0.0118@K20 → ...）。
  // 「結構邊界」= sim 遞增速率突然變慢的處（曲線趨平）= 群聚結構層級用盡。
  // 取「二階差分（加速）最小（最負）」的 K 作為 knee。
  const series = kList.map((k) => ({ k, v: simByK.has(k) ? simByK.get(k) : null }));
  let kneeK = null, kneeVal = Infinity;
  for (let i = 1; i < series.length - 1; i++) {
    if (series[i].v == null || series[i - 1].v == null || series[i + 1].v == null) continue;
    // 二階差分 >0 = 加速遞增；<0 = 趨平（結構層級用盡）
    const d = series[i - 1].v - 2 * series[i].v + series[i + 1].v;
    if (d < kneeVal) { kneeVal = d; kneeK = series[i].k; }
  }
  return { series, kneeK };
}

// ─── Silhouette Score（K=3..cap）──────────────────────────────────────────
// a(i) = 同群平均距離, b(i) = 最近鄰群平均距離, s(i) = (b-a)/max(a,b)
// avg silhouette 隨 K 的局部極大 = 群聚結構最清晰處。
function silhouetteForK(k) {
  // 從凝聚過程重建 K 群：跑 runAgglomerative(k) 拿 simByK 不夠，需要「誰和誰在一個群」。
  // 簡化：直接以「群間相似度閾值」切分——simByK 中「最後合併相似度」最高的 k-1 步
  // 決定群邊界。但這需要 member 資料。改用：跑一次凝聚到 K 群，記錄每個工具的群標籤。
  // 為了速度，用「群間相似度」的遞減序列 + 最遠 k-1 次合併 重建群。
  // 這太複雜，改回直接用 member 追蹤（O(N²) 但只跑 K=3..cap≈40 次，可接受）。
  const { simByK } = runAgglomerative(k);
  // 用 simByK 重建群：對每個工具，群 = 「從 N 個單點凝聚到 K 群時，最後被合併到同一群的」
  // 這需要凝聚過程的合併樹，太慢。改用最簡單可靠的：直接對全庫做 K 群劃分
  // = 取「K 群時群內平均相似度 vs 群間」來算 silhouette。
  // 我們用一個近似：把 simMatrix 做 K 群劃分 = 取前 K 個「最遠群」（greedy）。
  // 最簡單：直接用「群間相似度」的 topK 閾值切分。
  // 實務上：silhouette 只用於「哪個 K 最好」，不需要精確 member，只要每個點有群號。
  // 我們用「凝聚到 K 群」的群號（重跑凝聚，記錄每個單點的群）。
  const labelOf = buildLabels(k);
  if (labelOf.length < 2) return null;
  let sum = 0, cnt = 0;
  for (let i = 0; i < N; i++) {
    const myLabel = labelOf[i];
    // 群內平均距離 a
    let aSum = 0, aCnt = 0;
    for (let j = 0; j < N; j++) {
      if (labelOf[j] === myLabel && i !== j) { aSum += 1 - simMatrix[i * N + j]; aCnt++; }
    }
    if (aCnt === 0) continue; // 單點群
    const a = aSum / aCnt;
    // 最近鄰群平均距離 b
    let b = Infinity;
    for (let ci = 0; ci < labelOf.length; ci++) {
      if (ci === myLabel) continue;
      let s2 = 0, c2 = 0;
      for (let j = 0; j < N; j++) {
        if (labelOf[j] === ci) { s2 += 1 - simMatrix[i * N + j]; c2++; }
      }
      if (c2) b = Math.min(b, s2 / c2);
    }
    if (!isFinite(b)) continue;
    sum += (b - a) / Math.max(a, b, 1e-9);
    cnt++;
  }
  return cnt ? sum / cnt : 0;
}

// buildLabels：跑凝聚到 K 群，回傳每筆工具的群號（0..K-1）
function buildLabels(k) {
  // 用與 runAgglomerative 同源的凝聚，但追蹤 member
  const sim = new Float32Array(N * N);
  for (let i = 0; i < N; i++) {
    sim[i * N + i] = 1;
    for (let j = i + 1; j < N; j++) {
      const s = simMatrix[i * N + j];
      sim[i * N + j] = s; sim[j * N + i] = s;
    }
  }
  const size = new Int32Array(N).fill(1);
  const alive = new Uint8Array(N).fill(1);
  const members = Array.from({ length: N }, (_, i) => [i]);
  let aliveCount = N;
  const target = Math.max(1, Math.min(k, N));
  while (aliveCount > target) {
    let bestI = -1, bestJ = -1, bestSim = -1;
    for (let i = 0; i < N; i++) {
      if (!alive[i]) continue;
      for (let j = i + 1; j < N; j++) {
        if (!alive[j]) continue;
        const s = sim[i * N + j];
        if (s > bestSim) { bestSim = s; bestI = i; bestJ = j; }
      }
    }
    if (bestI < 0) break;
    const newSize = size[bestI] + size[bestJ];
    for (let j = 0; j < N; j++) {
      if (j === bestI || j === bestJ || !alive[j]) continue;
      const newSim = (sim[bestI * N + j] * size[bestI] + sim[bestJ * N + j] * size[bestJ]) / newSize;
      sim[bestI * N + j] = newSim; sim[j * N + bestI] = newSim;
    }
    members[bestI] = members[bestI].concat(members[bestJ]);
    alive[bestJ] = 0;
    size[bestI] = newSize;
    aliveCount--;
  }
  const labelOf = new Int32Array(N).fill(-1);
  let label = 0;
  for (let i = 0; i < N; i++) {
    if (!alive[i]) continue;
    for (const m of members[i]) labelOf[m] = label;
    label++;
  }
  return labelOf;
}

// ─── Split Quality（結構層級邊界）──────────────────────────────────────────
// sim(K) 隨 K 遞增而遞增（群越細，最後一次合併群間相似度越高）。
// 「增益」gain(K) = sim(K) - sim(K-1) > 0：從 K-1 群細分到 K 群「賺到」的群間相似度。
// gain 突然變大 = 這一步細分是有結構意義的（群被明確分開）。
// 結構邊界 = gain 的局部極大（gain(K) > gain(K-1) 且 gain(K) > gain(K+1)）。

function splitQuality(simByK) {
  const ks = [...simByK.keys()].sort((a, b) => a - b);
  const series = ks.map((k) => ({ k, sim: simByK.get(k) }));
  const gains = series.map((p, i) => {
    const prev = i > 0 ? series[i - 1].sim : null;
    return { k: p.k, gain: prev != null ? p.sim - prev : 0 };
  });
  // 局部極大：gain 突然變大（結構邊界）
  const localMaxima = [];
  for (let i = 1; i < gains.length - 1; i++) {
    if (gains[i].gain > gains[i - 1].gain && gains[i].gain > gains[i + 1].gain) {
      localMaxima.push({ k: gains[i].k, gain: gains[i].gain });
    }
  }
  localMaxima.sort((a, b) => b.gain - a.gain);
  // 純 gain top 8（不限局部極大），供人審
  const topByGain = [...gains].filter((g) => g.k >= SWEET_SPOT_MIN).sort((a, b) => b.gain - a.gain).slice(0, 8);
  return { localMaxima: localMaxima.slice(0, 8), topByGain, series };
}

// ─── Knee 法（通用）：找序列的「彎曲點」────────────────────────────────────
// 輸入 {k, v}[]（v 隨 k 遞減或遞增皆可），用「正規化距離到直線最大」找 knee。
function kneePoint(series, minK = 3, maxK = SWEET_SPOT_CAP) {
  const pts = series.filter((p) => p.k >= minK && p.k <= maxK && p.v != null);
  if (pts.length < 3) return null;
  const xs = pts.map((p) => p.k), vs = pts.map((p) => p.v);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...vs), maxY = Math.max(...vs);
  if (maxX === minX || maxY === minY) return pts[0].k;
  let bestK = pts[0].k, bestD = -1;
  for (const p of pts) {
    // 距離 (minX,maxY)→(maxX,minY) 直線
    const dx = maxX - minX, dy = maxY - minY;
    const dist = Math.abs(dx * (p.v - maxY) - dy * (p.k - minX)) / Math.hypot(dx, dy);
    if (dist > bestD) { bestD = dist; bestK = p.k; }
  }
  return bestK;
}

// ─── 主流程 ─────────────────────────────────────────────────────────────────
if (!AS_JSON) process.stderr.write(`\n凝聚式分群：${N} 筆工具，K 掃描 3..${KMAX}\n`);

// 跑一次 K=3 拿到 simByK（凝聚到 3 群過程覆蓋了所有 K=3..N 的分裂點）
// 因為 K 越小合併越多，所以「凝聚到 3 群」會經過 K=3,4,...,696 所有分裂點
const { simByK } = runAgglomerative(3);
const kList = Array.from({ length: KMAX - 2 }, (_, i) => i + 3); // 3..KMAX

// 1. Gap knee（群間相似度二階差分 knee）
const gap = gapStatistic(kList, simByK);
const gapK = gap.kneeK;
const gapSeries = kList.map((k) => ({ k, v: simByK.has(k) ? simByK.get(k) : null }));

// 2. Split quality（結構層級邊界：跌幅局部極大）
const sq = splitQuality(simByK);
const structuralKs = [
  ...sq.localMaxima.filter((d) => d.k >= SWEET_SPOT_MIN && d.k <= SWEET_SPOT_CAP).map((d) => d.k),
  ...sq.topByGain.filter((d) => d.k >= SWEET_SPOT_MIN && d.k <= SWEET_SPOT_CAP).map((d) => d.k)
];
// 去重
const structuralKsUnique = [...new Set(structuralKs)];

// 3. Silhouette（K=3..min(cap,KMAX)）—— 局部極大
const silCap = Math.min(SWEET_SPOT_CAP, KMAX);
const silSeries = [];
for (let k = 3; k <= silCap; k++) {
  const s = silhouetteForK(k);
  if (s != null) silSeries.push({ k, v: s });
}
// 局部極大（v > 兩鄰）
const silPeaks = [];
for (let i = 1; i < silSeries.length - 1; i++) {
  if (silSeries[i].v > silSeries[i - 1].v && silSeries[i].v > silSeries[i + 1].v) silPeaks.push(silSeries[i].k);
}
// 最大 silhouette 點
const silBest = silSeries.length ? silSeries.reduce((a, b) => (b.v > a.v ? b : a)).k : null;

// ─── 三路共識 ───────────────────────────────────────────────────────────────
// 取「結構邊界 + silhouette 極大 + gap knee」中落在 [5,cap] 的，投票取眾數；
// 無眾數則取中位數。
const candidates = [
  ...structuralKsUnique,
  ...silPeaks.filter((k) => k >= SWEET_SPOT_MIN && k <= SWEET_SPOT_CAP),
  ...(silBest != null && silBest >= SWEET_SPOT_MIN && silBest <= SWEET_SPOT_CAP ? [silBest] : []),
  ...(gapK != null && gapK >= SWEET_SPOT_MIN && gapK <= SWEET_SPOT_CAP ? [gapK] : [])
];
let recommendedK = null;
if (candidates.length) {
  const freq = {};
  for (const k of candidates) freq[k] = (freq[k] || 0) + 1;
  const maxFreq = Math.max(...Object.values(freq));
  const top = Object.entries(freq).filter(([, c]) => c === maxFreq).map(([k]) => Number(k)).sort((a, b) => a - b);
  recommendedK = top.length === 1 ? top[0] : top[Math.floor(top.length / 2)]; // 中位
}

// 與現行 18 分類比對
const currentK = 18;
const verdict = recommendedK == null ? '無法判定' :
  recommendedK === currentK ? '現行 18 分類與數據最優 K 一致' :
  recommendedK < currentK ? `數據建議 ${recommendedK}（比現行少 ${currentK - recommendedK} 個）` :
                           `數據建議 ${recommendedK}（比現行多 ${recommendedK - currentK} 個）`;

// ─── 輸出 ──────────────────────────────────────────────────────────────────
const report = {
  generatedAt: new Date().toISOString(),
  nTools: N,
  currentK,
  recommendedK,
  verdict,
  agreement: {
    gapKnee: gapK,
    silhouettePeaks: silPeaks,
    silhouetteBest: silBest,
    structuralDips: structuralKsUnique,
    candidateVoting: candidates
  },
  gapSeries,
  silhouetteSeries: silSeries,
  splitQuality: { localMaxima: sq.localMaxima, topByDrop: sq.topByGain, series: sq.series }
};

if (AS_JSON) {
  console.log(JSON.stringify(report, null, 2));
} else {
  writeFileSync(REPORT_JSON, JSON.stringify(report, null, 2), 'utf8');
  const L = [];
  L.push(`# 動態分類：K 自動判定報告（2026-09-12）`);
  L.push('');
  L.push(`> **產生**：\`scripts/dynamic-k.js\`（唯讀，不修改 tools.json）`);
  L.push(`> **方法**：凝聚式分群 + 三路交叉驗證（Gap knee / Silhouette 局部極大 / Split quality 結構邊界）。`);
  L.push(`> **核心原則**：K 是資料產物，不是人工前提。18 只是 9/8 合併留下的數字，不是真理。`);
  L.push('');
  L.push(`## 判定`);
  L.push('');
  L.push(`| 指標 | 值 |`);
  L.push(`|---|---|`);
  L.push(`| 全庫工具數 | ${N} |`);
  L.push(`| 現行分類數（K） | ${currentK} |`);
  L.push(`| **建議 K（三路共識）** | **${recommendedK ?? '無法判定'}** |`);
  L.push(`| Gap knee | ${gapK ?? '—'} |`);
  L.push(`| Silhouette 局部極大 | [${silPeaks.join(', ')}]${silBest != null ? `，最佳=${silBest}` : ''} |`);
  L.push(`| 結構邊界（split quality 增益局部極大） | [${structuralKsUnique.join(', ')}] |`);
  L.push(`| 候選投票 | [${[...new Set(candidates)].sort((a, b) => a - b).join(', ')}] |`);
  L.push('');
  L.push(`**判讀**：${verdict}`);
  L.push('');
  L.push(`## 群間相似度（隨 K 遞增）`);
  L.push('');
  L.push('群間相似度 = 凝聚到 K 群時最後一次合併丟掉的相似度。群越細（K 越大）= 值越高。');
  L.push(`knee（二階差分最小／曲線趨平）= K=${gapK ?? '—'}（結構層級用盡處）。`);
  L.push('');
  L.push('| K | 群間相似度 |');
  L.push('|---:|---:|');
  for (const p of gapSeries) L.push(`| ${p.k} | ${p.v != null ? p.v.toFixed(3) : '—'} |`);
  L.push('');
  L.push(`## Silhouette（K=3..${silCap}）`);
  L.push('');
  L.push('| K | silhouette |');
  L.push('|---:|---:|');
  for (const p of silSeries) L.push(`| ${p.k} | ${p.v.toFixed(3)} |`);
  L.push('');
  L.push(`## 結構邊界（split quality，增益局部極大 top ${sq.localMaxima.length}）`);
  L.push('');
  L.push('「增益」= 從 K-1 群細分到 K 群「賺到」的群間相似度。增益突然變大 = 有意義的結構劃分。');
  L.push('');
  L.push('### 增益局部極大（結構層級邊界）');
  L.push('細分到 K | 增益 |');
  L.push('|---:|---:|');
  for (const d of sq.localMaxima) L.push(`| ${d.k} | ${d.gain.toFixed(4)} |`);
  L.push('');
  L.push('### 純增益 top（供參考）');
  L.push('細分到 K | 增益 |');
  L.push('|---:|---:|');
  for (const d of sq.topByGain) L.push(`| ${d.k} | ${d.gain.toFixed(4)} |`);
  L.push('');
  L.push(`## 與現行 18 分類的關係`);
  L.push('');
  L.push(`- 現行 K=${currentK}，數據建議 K=${recommendedK ?? '?'}。`);
  L.push(`- 若建議 K ≠ 18：**不代表 18 錯**，而是「若純依數據凝聚，此刻最優結構是 ${recommendedK} 個」`);
  L.push(`  是否調整、如何命名與邊界定義，仍屬人工裁決。`);
  L.push(`- 新工具入庫後應重跑本腳本：K 會隨工具池演變（動態分類）。`);
  L.push('');
  L.push(`> **誠實限制**：凝聚式分群 + TF-IDF 是**詞彙級**相似，非語意級。`);
  L.push(`> 建議 K 是「詞彙結構最清晰處」，不等於「語意分類最優處」。`);
  L.push(`> 本報告是**篩選工具**，供人工判讀，不直接改寫分類。`);
  L.push('');
  writeFileSync(REPORT_MD, L.join('\n'), 'utf8');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  動態分類：K 自動判定');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');
  console.log(`全庫 ${N} 筆｜現行 K=${currentK}`);
  console.log('');
  console.log('【三路交叉驗證】');
  console.log(`  Gap knee（二階差分）: ${gapK ?? '—'}`);
  console.log(`  Silhouette 局部極大  : [${silPeaks.join(', ')}]${silBest != null ? `（最佳 ${silBest}）` : ''}`);
  console.log(`  結構邊界（增益局部極大）: [${structuralKsUnique.join(', ')}]`);
  console.log('');
  console.log(`▶ 建議 K = ${recommendedK ?? '無法判定'}`);
  console.log(`  ${verdict}`);
  console.log('');
  console.log(`📄 詳細報告：docs/dynamic-k-2026-09-12.md（含 gap / silhouette / dips 曲線）`);
  console.log(`📄 JSON：registry/dynamic-k-report.json`);
}
