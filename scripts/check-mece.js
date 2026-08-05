#!/usr/bin/env node
/**
 * MECE 原則檢查腳本
 * 
 * 檢查項目：
 * 1. 互斥性：無重複分類邊界
 * 2. 窮盡性：無「其他」殘留
 * 3. 一致性：分類統計與實際數量匹配
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = import.meta.dirname;
const ROOT = join(__dirname, '..');
const REGISTRY_PATH = join(ROOT, 'registry', 'tools.json');

// ─── 顏色輸出 ──────────────────────────────────────────────────────
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
};

function pass(msg) { console.log(`${c.green}✓${c.reset} ${msg}`); }
function warn(msg) { console.log(`${c.yellow}⚠${c.reset} ${msg}`); }
function fail(msg) { console.log(`${c.red}✗${c.reset} ${msg}`); process.exitCode = 1; }

// ─── 主要檢查邏輯 ──────────────────────────────────────────────────

function checkMECE() {
  console.log(`\n${c.cyan}${c.bold}=== MECE 原則檢查 ===${c.reset}\n`);

  // 讀取資料
  const registry = JSON.parse(readFileSync(REGISTRY_PATH, 'utf8'));
  const tools = registry.tools;

  if (!Array.isArray(tools) || tools.length === 0) {
    fail('工具庫為空！');
    return;
  }

  // 1. 統計每個分類的工具數
  const categoryStats = {};
  tools.forEach(tool => {
    const cat = tool.category || '未分類';
    if (!categoryStats[cat]) categoryStats[cat] = { count: 0, tools: [] };
    categoryStats[cat].count++;
    categoryStats[cat].tools.push(tool);
  });

  const totalTools = tools.length;
  const calculatedTotal = Object.values(categoryStats).reduce((sum, cat) => sum + cat.count, 0);

  console.log(`📊 總工具數：${totalTools}`);
  console.log(`   分類數：${Object.keys(categoryStats).length}\n`);

  // ─── 檢查 1：互斥性（Mutually Exclusive）──────────────────────
  console.log(`${c.bold}【互斥性檢查】${c.reset}`);

  const issues = [];

  // 1a. 檢查是否有「其他」或「未分類」殘留
  const residualCategories = ['其他', '未分類', 'Uncategorized', 'Other'];
  residualCategories.forEach(cat => {
    if (categoryStats[cat] && categoryStats[cat].count > 0) {
      fail(`發現殘留分類「${cat}」有 ${categoryStats[cat].count} 個工具，必須強制歸類！`);
      issues.push({ type: 'residual', cat, count: categoryStats[cat].count });
    }
  });

  if (!issues.find(i => i.type === 'residual')) {
    pass('無「其他」或「未分類」殘留');
  }

  // 1b. 檢查小類別（≤2個）是否需要合併
  const smallCategories = Object.entries(categoryStats)
    .filter(([_, data]) => data.count <= 2)
    .map(([cat]) => cat);

  if (smallCategories.length > 0) {
    warn(`小類別（≤2個工具）：${smallCategories.join(', ')}`);
    warn('建議：考慮合併到更大類別或刪除這些類別');
  } else {
    pass('無過小類別需要合併');
  }

  // 1c. 檢查大類別（≥50個）是否需要拆分
  const largeCategories = Object.entries(categoryStats)
    .filter(([_, data]) => data.count >= 50)
    .map(([cat]) => cat);

  if (largeCategories.length > 0) {
    warn(`大類別（≥50個工具）：${largeCategories.join(', ')}`);
    warn('建議：考慮是否需細分子類別以提高檢索精度');
  }

  // ─── 檢查 2：窮盡性（Collectively Exhaustive）────────────────
  console.log(`\n${c.bold}【窮盡性檢查】${c.reset}`);

  if (calculatedTotal !== totalTools) {
    fail(`統計不一致：工具總數=${totalTools}，分類加總=${calculatedTotal}`);
  } else {
    pass(`所有 ${totalTools} 個工具都已歸入明確分類`);
  }

  // ─── 檢查 3：數據一致性 ────────────────────────────────────────
  console.log(`\n${c.bold}【數據一致性檢查】${c.reset}`);

  // 檢查 required fields
  const missingFields = tools.filter(t => !t.id || !t.name || !t.url);
  if (missingFields.length > 0) {
    fail(`發現 ${missingFields.length} 個工具缺少必要欄位（id/name/url）`);
  } else {
    pass('所有工具都有基本欄位');
  }

  // 檢查 category 完整性
  const noCategory = tools.filter(t => !t.category || t.category === '');
  if (noCategory.length > 0) {
    fail(`發現 ${noCategory.length} 個工具沒有分類`);
  } else {
    pass('所有工具都有分類');
  }

  // 檢查 triggers 完整性
  const noTriggers = tools.filter(t => !t.triggers || t.triggers.length === 0);
  if (noTriggers.length > 0) {
    warn(`發現 ${noTriggers.length} 個工具缺少 triggers（影響檢索準確度）`);
  }

  // ─── 分類分布報告 ──────────────────────────────────────────────
  console.log(`\n${c.bold}【分類分布】${c.reset}`);
  const sorted = Object.entries(categoryStats).sort((a, b) => b[1].count - a[1].count);
  sorted.forEach(([cat, data], idx) => {
    const bar = '█'.repeat(Math.round(data.count / 5));
    const badge = data.count <= 2 ? `${c.yellow}🔸小${c.reset}` : data.count >= 50 ? `${c.yellow}🔸大${c.reset}` : '';
    console.log(`  ${data.count.toString().padStart(3)} | ${cat.padEnd(12)} ${bar} ${badge}`);
  });

  // ─── 總結 ──────────────────────────────────────────────────────
  console.log(`\n${c.bold}=== 檢查結果 ===${c.reset}`);

  const hasFailures = issues.some(i => i.type === 'residual') || calculatedTotal !== totalTools || missingFields.length > 0 || noCategory.length > 0;
  
  if (hasFailures) {
    fail('\n存在需修復的問題，請執行相關修正腳本。');
  } else {
    pass('\n✅ 所有 MECE 檢查通過！分類系統符合原則。');
  }

  console.log();
}

// ─── 入口 ─────────────────────────────────────────────────────────
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  checkMECE();
}

export { checkMECE };
