/**
 * 同步分類系統 - 確保所有數據來源一致
 * 
 * 此腳本會：
 * 1. 從 tools.json 讀取真實的分類列表
 * 2. 更新 generate-knowledge-graph.js 中的 baseCategoryColors
 * 3. 檢查並修復其他潛在的不一致
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = import.meta.dirname;
const ROOT = join(__dirname, '..');

// ─── 從 tools.json 讀取真實分類 ────────────────────────────────────────

function getActualCategories() {
  const registryPath = join(ROOT, 'registry', 'tools.json');
  const registry = JSON.parse(readFileSync(registryPath, 'utf8'));
  
  const categories = {};
  registry.tools.forEach(tool => {
    if (tool.category) {
      categories[tool.category] = (categories[tool.category] || 0) + 1;
    }
  });
  
  return categories;
}

// ─── 預設配色方案（用於未定義的分類）────────────────────────────────────

const DEFAULT_COLORS = [
  '#2563EB', // 藍
  '#059669', // 綠
  '#7C3AED', // 紫
  '#EF4444', // 紅
  '#EC4899', // 粉
  '#D97706', // 橙
  '#4F46E5', // 靛
  '#0D9488', // 青
  '#475569', //  slate
  '#0891B2', // 天藍
  '#9333EA', // 紫紅
  '#EA580C', // 深橙
  '#0284C7', // 藍
  '#65A30D', // 綠
  '#C026D3', // 洋紅
  '#DC2626', // 紅
  '#7C3AED', // 紫
  '#0284C7', // 藍
  '#059669', // 綠
  '#D97706', // 橙
];

// ─── 更新 generate-knowledge-graph.js ──────────────────────────────────

function updateKnowledgeGraphScript(actualCategories) {
  const scriptPath = join(ROOT, 'scripts', 'generate-knowledge-graph.js');
  let content = readFileSync(scriptPath, 'utf8');
  
  // 生成新的 baseCategoryColors
  const colorEntries = Object.entries(actualCategories).map(([cat, count], idx) => {
    const color = DEFAULT_COLORS[idx % DEFAULT_COLORS.length];
    return `  "${cat}": "${color}"`;
  });
  
  const newColorsBlock = `const baseCategoryColors = {\n${colorEntries.join(',\n')}\n};`;
  
  // 替換舊的 baseCategoryColors
  const oldPattern = /const baseCategoryColors\s*=\s*\{[^}]+\}/s;
  const updatedContent = content.replace(oldPattern, newColorsBlock);
  
  if (updatedContent !== content) {
    writeFileSync(scriptPath, updatedContent, 'utf8');
    console.log('✓ 已更新 generate-knowledge-graph.js 的分類配色');
    return true;
  }
  
  return false;
}

// ─── 主函式 ──────────────────────────────────────────────────────────────

async function main() {
  console.log('\n=== 同步分類系統 ===\n');
  
  // 1. 讀取真實分類
  const actualCategories = getActualCategories();
  
  console.log('📊 tools.json 中的真實分類:');
  Object.entries(actualCategories)
    .sort((a, b) => b[1] - a[1])
    .forEach(([cat, count]) => {
      console.log(`  ${count.toString().padStart(3)} | ${cat}`);
    });
  
  console.log(`\n總計: ${Object.keys(actualCategories).length} 個分類\n`);
  
  // 2. 更新知識圖譜腳本
  const updated = updateKnowledgeGraphScript(actualCategories);
  
  if (updated) {
    console.log('\n✅ 同步完成！');
    console.log('   - 已更新 baseCategoryColors 以匹配 tools.json');
  } else {
    console.log('\n⚠️ 無需更新，分類的配色已經是最新的。');
  }
  
  // 3. 驗證
  console.log('\n=== 驗證 ===');
  const registryPath = join(ROOT, 'registry', 'tools.json');
  const registry = JSON.parse(readFileSync(registryPath, 'utf8'));
  
  const missingInGraph = Object.keys(actualCategories).filter(cat => {
    const graphContent = readFileSync(join(ROOT, 'scripts', 'generate-knowledge-graph.js'), 'utf8');
    return !graphContent.includes(`"${cat}"`);
  });
  
  if (missingInGraph.length > 0) {
    console.log('⚠️ 以下分類在知識圖譜中尚未定義:', missingInGraph.join(', '));
  } else {
    console.log('✓ 所有分類已在知識圖譜中定義');
  }
  
  console.log('\n');
}

main().catch(console.error);
