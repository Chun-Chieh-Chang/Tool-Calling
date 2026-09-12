#!/usr/bin/env node
/**
 * measure-discriminability.js — 量測分類的「鑑別率」（唯讀，不修改任何資料）
 *
 * 依據專案第一原則：
 *   分類的邏輯是讓每個工具都有明確的類別依據，原則是鑑別率愈高愈好。
 *   分類清單應是「語料的產物」，而非「前提」—— 定死分類會導致新工具
 *   不屬於任一分類，或被強行納入而在該分類中格格不入。
 *
 * 本腳本把上述描述化為可量測的指標：
 *
 *   cohesion   類別內聚度 —— 成員與「自己類別（排除自己）」質心的平均餘弦相似度
 *   ownSim     該工具與自己類別質心的相似度（leave-one-out，避免自我膨脹）
 *   bestOther  與最接近的「其他類別」質心的相似度
 *   margin     ownSim - bestOther —— 邊際。接近 0 或為負 = 格格不入
 *   orphan     對「所有」類別的最高相似度都很低 = 無家可歸（建議新增類別）
 *
 * 用法：
 *   node scripts/measure-discriminability.js             # 人可讀報告
 *   node scripts/measure-discriminability.js --json      # JSON 輸出
 *   node scripts/measure-discriminability.js --top=40    # 調整明細長度
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const REGISTRY_PATH = path.join(ROOT, 'registry', 'tools.json');

const AS_JSON = process.argv.includes('--json');
const TOP = Number((process.argv.find((a) => a.startsWith('--top=')) || '').split('=')[1]) || 25;

// ─── 分詞：英文詞（含 + . # _ -）+ 中文 bigram ────────────────────────────
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

/** 工具的多層文字表示 —— 與 search-engine 的 buildToolText 精神一致 */
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

function cosine(a, b) {
  let dot = 0;
  const [small, big] = a.size <= b.size ? [a, b] : [b, a];
  for (const [k, v] of small) {
    const w = big.get(k);
    if (w !== undefined) dot += v * w;
  }
  if (dot === 0) return 0;
  let na = 0, nb = 0;
  for (const v of a.values()) na += v * v;
  for (const v of b.values()) nb += v * v;
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function main() {
  const tools = JSON.parse(readFileSync(REGISTRY_PATH, 'utf8')).tools;

  // 1) 詞頻 + 文件頻率
  const docs = tools.map((t) => tokenize(toolText(t)));
  const df = new Map();
  for (const d of docs) {
    for (const term of new Set(d)) df.set(term, (df.get(term) || 0) + 1);
  }
  const N = docs.length;

  // 2) TF-IDF 向量
  const vecs = docs.map((d) => {
    const tf = new Map();
    for (const term of d) tf.set(term, (tf.get(term) || 0) + 1);
    const v = new Map();
    for (const [term, c] of tf) {
      const idf = Math.log(N / (1 + (df.get(term) || 0))) + 1;
      v.set(term, (c / d.length) * idf);
    }
    return v;
  });

  // 3) 類別質心（成員向量之和；餘弦本身會正規化，故不需除以個數）
  const byCat = new Map();
  tools.forEach((t, i) => {
    if (!byCat.has(t.category)) byCat.set(t.category, []);
    byCat.get(t.category).push(i);
  });

  const centroid = new Map();
  for (const [cat, idxs] of byCat) {
    const c = new Map();
    for (const i of idxs) {
      for (const [k, v] of vecs[i]) c.set(k, (c.get(k) || 0) + v);
    }
    centroid.set(cat, c);
  }

  // 4) 逐筆計算 ownSim（leave-one-out）／bestOther／margin／orphan 分數
  const rows = tools.map((t, i) => {
    const own = centroid.get(t.category);
    // leave-one-out：從自己類別質心扣掉自己，避免自我相似度膨脹
    const loo = new Map(own);
    for (const [k, v] of vecs[i]) {
      const nv = (loo.get(k) || 0) - v;
      if (nv <= 0) loo.delete(k); else loo.set(k, nv);
    }
    const ownSim = cosine(vecs[i], loo);

    let bestOther = 0, bestCat = null;
    for (const [cat, c] of centroid) {
      if (cat === t.category) continue;
      const s = cosine(vecs[i], c);
      if (s > bestOther) { bestOther = s; bestCat = cat; }
    }
    return {
      id: t.id,
      name: t.name,
      category: t.category,
      ownSim,
      bestOther,
      bestOtherCat: bestCat,
      margin: ownSim - bestOther,
      // 對所有類別的最高相似度：低 = 無家可歸
      maxSim: Math.max(ownSim, bestOther)
    };
  });

  // 5) 類別彙總
  const cats = [...byCat.keys()].map((cat) => {
    const members = rows.filter((r) => r.category === cat);
    const meanMargin = members.reduce((s, r) => s + r.margin, 0) / members.length;
    const cohesion = members.reduce((s, r) => s + r.ownSim, 0) / members.length;
    // 最近鄰類別：以「該類成員平均 bestOther 最高的那個類別」近似
    const tally = new Map();
    for (const r of members) tally.set(r.bestOtherCat, (tally.get(r.bestOtherCat) || 0) + 1);
    const nearest = [...tally.entries()].sort((a, b) => b[1] - a[1])[0];
    return {
      category: cat,
      count: members.length,
      cohesion,
      meanMargin,
      nearestCat: nearest ? nearest[0] : null,
      nearestCount: nearest ? nearest[1] : 0,
      weakest: members.slice().sort((a, b) => a.margin - b.margin).slice(0, 5)
    };
  }).sort((a, b) => a.meanMargin - b.meanMargin);

  const globalMeanMargin = rows.reduce((s, r) => s + r.margin, 0) / rows.length;

  // 6) 明細
  const misfits = rows.slice().sort((a, b) => a.margin - b.margin).slice(0, TOP);
  const orphans = rows.slice().sort((a, b) => a.maxSim - b.maxSim).slice(0, TOP);

  if (AS_JSON) {
    console.log(JSON.stringify({ summary: { totalTools: N, categories: byCat.size, globalMeanMargin }, cats, misfits, orphans }, null, 2));
    return;
  }

  const pct = (x) => (x * 100).toFixed(1).padStart(5);
  const bar = (x, width = 20) => {
    const n = Math.max(0, Math.min(width, Math.round(x * width * 4)));
    return '█'.repeat(n) + '·'.repeat(width - n);
  };

  console.log('\n=== 分類鑑別率量測（唯讀） ===\n');
  console.log(`工具總數：${N}　類別數：${byCat.size}　全庫平均邊際：${globalMeanMargin.toFixed(4)}`);
  console.log('');
  console.log('【各分類鑑別率】依平均邊際由低到高（低 = 成員格格不入）\n');
  console.log('  平均邊際  內聚度  筆數  最近鄰類別（成員數）        分類');
  console.log('  ' + '─'.repeat(74));
  for (const c of cats) {
    console.log(
      `  ${pct(c.meanMargin)}   ${pct(c.cohesion)}  ${String(c.count).padStart(4)}  ` +
      `${(c.nearestCat || '-').padEnd(14)}(${String(c.nearestCount).padStart(3)})  ${c.category}`
    );
  }

  console.log('\n【最格格不入的工具】margin 最低（自己類別不比鄰類像）\n');
  console.log('    margin   ownSim  bestOther  現行分類        最像的類別        工具');
  console.log('  ' + '─'.repeat(92));
  for (const r of misfits) {
    console.log(
      `  ${r.margin.toFixed(4).padStart(8)}  ${r.ownSim.toFixed(4)}  ${r.bestOther.toFixed(4)}  ` +
      `${r.category.padEnd(14)} ${(r.bestOtherCat || '-').padEnd(16)} ${r.id}`
    );
  }

  console.log('\n【最無家可歸的工具】對所有類別的最高相似度都低\n');
  console.log('     maxSim   ownSim  現行分類        工具');
  console.log('  ' + '─'.repeat(70));
  for (const r of orphans) {
    console.log(`  ${r.maxSim.toFixed(4).padStart(8)}  ${r.ownSim.toFixed(4)}  ${r.category.padEnd(14)} ${r.id}`);
  }
  console.log('');
}

main();
