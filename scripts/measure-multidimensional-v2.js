#!/usr/bin/env node
/**
 * measure-multidimensional-v2.js — 多維度投票量測（唯讀，不修改資料）
 *
 * 維度定義與邊際計算已抽至 core/multidimensional.js（純函式），
 * 本腳本僅負責「MECE 驗證 + 投票收斂效果」的量測與報告產出。
 *
 * 維度 MECE 約束：
 *   維度必須在資訊上「互斥」（彼此獨立）且「聯合窮盡」關鍵分類訊號。
 *   互斥不是「字段不重疊」，而是「提供的分類決策資訊不重疊」。
 *   若兩維度高度相關（>0.7），它們提供的是同一種資訊，不應並列投票。
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DIMS, DIM_NAMES, computeMargins } from '../core/multidimensional.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const tools = JSON.parse(readFileSync(path.join(ROOT, 'registry', 'tools.json'), 'utf8')).tools;

const dimMargins = {};
for (const dk of DIM_NAMES) dimMargins[dk] = computeMargins(tools, DIMS[dk]);

// ── MECE 驗證：覆蓋度 + 相關性矩陣 ────────────────────────────────────────
const dimNames = DIM_NAMES;
console.log('\n=== 維度 MECE 驗證 ===\n');
console.log('【覆蓋度：各維度非空工具數】');
for (const name of dimNames) {
  const covered = tools.filter((t) => (DIMS[name](t) || '').trim().length > 0).length;
  console.log(`  ${name.padEnd(12)}  覆蓋 ${covered}/${tools.length}  空值率 ${((tools.length - covered) / tools.length * 100).toFixed(0)}%`);
}

console.log('\n【資訊獨立性：margin 互相關（Pearson）】');
console.log('  （< 0.5 視為獨立，可並列投票；> 0.7 視為重疊，不應並列）\n');
const corr = (a, b) => {
  const n = a.length;
  const ma = a.reduce((s, v) => s + v, 0) / n, mb = b.reduce((s, v) => s + v, 0) / n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) { const x = a[i] - ma, y = b[i] - mb; num += x * y; da += x * x; db += y * y; }
  return (da === 0 || db === 0) ? 0 : num / Math.sqrt(da * db);
};
const marginArr = Object.fromEntries(dimNames.map((n) => [n, dimMargins[n].map((r) => r.margin)]));
for (let i = 0; i < dimNames.length; i++) {
  for (let j = i + 1; j < dimNames.length; j++) {
    const r = corr(marginArr[dimNames[i]], marginArr[dimNames[j]]);
    const verdict = r > 0.7 ? '⚠️  重疊，不宜並列' : r > 0.5 ? '⚠️  中度相關，謹慎' : '✅ 獨立';
    console.log(`  ${dimNames[i]}  ↔  ${dimNames[j]}  :  r = ${r.toFixed(3)}  ${verdict}`);
  }
}

// 各維度的全庫邊際
console.log('\n【各維度全庫平均邊際】');
for (const name of dimNames) {
  const arr = dimMargins[name];
  const mean = arr.reduce((s, r) => s + r.margin, 0) / arr.length;
  const neg = arr.filter((r) => r.margin < 0).length;
  console.log(`  ${name.padEnd(12)}  平均邊際 ${(mean * 100).toFixed(1).padStart(5)}%   負邊際 ${neg} 筆`);
}

// ── 多維度投票（僅用 MECE 驗證通過的維度）─────────────────────────────────
const votes = tools.map((t, i) => {
  const dims = dimNames.map((n) => dimMargins[n][i].margin);
  return {
    id: t.id,
    category: t.category,
    margins: Object.fromEntries(dimNames.map((n, j) => [n, dims[j]])),
    best: Math.max(...dims),
    worst: Math.min(...dims),
  };
});

// 收斂：最弱維度 vs 最佳維度
const singleWorst = votes.reduce((s, v) => s + v.worst, 0) / votes.length;
const votedBest = votes.reduce((s, v) => s + v.best, 0) / votes.length;
const singleWorstNeg = votes.filter((v) => v.worst < 0).length;
const votedBestNeg = votes.filter((v) => v.best < 0).length;
const flipped = votes.filter((v) => v.worst < 0 && v.best >= 0).length;

console.log(`\n=== 多維度投票收斂效果 ===`);
console.log(`  最弱維度平均邊際：${(singleWorst * 100).toFixed(1)}%  （負 ${singleWorstNeg} 筆）`);
console.log(`  投票最佳平均邊際：${(votedBest * 100).toFixed(1)}%  （負 ${votedBestNeg} 筆）`);
console.log(`  由負翻正：${flipped} 筆`);

// 核心候選：3 維度皆負邊際
const core = votes.filter((v) => dimNames.every((n) => v.margins[n] < 0));
console.log(`\n=== 核心候選：3 維度皆負邊際，共 ${core.length} 筆 ===`);
console.log('  （這些工具在「語意」「標籤」「身分」三個獨立維度上都格格不入，');
console.log('   最可能需要拆分現有類別或新增類別）\n');
console.log('  最差margin  分類             工具');
core.sort((a, b) => a.best - b.best);
for (const v of core.slice(0, 40)) {
  const dimLabel = dimNames.map((n) => `${n.slice(0, 2)}=${(v.margins[n] * 100).toFixed(0)}`).join(' ');
  console.log(`  ${(v.best * 100).toFixed(1).padStart(6)}%  ${v.category.padEnd(12)}  ${v.id.padEnd(40)}  ${dimLabel}`);
}

// 按分類統計
console.log('\n【核心候選按分類統計】');
const byCat = {};
for (const v of core) byCat[v.category] = (byCat[v.category] || 0) + 1;
Object.entries(byCat).sort((a, b) => b[1] - a[1]).forEach(([c, n]) => {
  const total = tools.filter((t) => t.category === c).length;
  console.log(`  ${c.padEnd(14)}  ${n}/${total}  (${(n / total * 100).toFixed(0)}%)`);
});
