/**
 * check-category-consistency.js — 檢查工具分類與關鍵字的合理性
 * 
 * 設計理念：
 * - 僅檢查最近新增的工具（避免掃描全部 563 個工具的誤報）
 * - 使用「高置信度」規則（需要關鍵字出現在 name/description，而非 triggers）
 * - 區分 HIGH（明確錯誤）和 LOW（可能問題）優先級
 * - 僅在同時匹配多個互斥分類時才報錯
 * 
 * 用法：
 *   node scripts/check-category-consistency.js           # 檢查全部工具
 *   node scripts/check-category-consistency.js --recent  # 僅檢查最近 24h 新增
 *   node scripts/check-category-consistency.js --hours 48 # 檢查最近 48h
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const REGISTRY_PATH = join(ROOT, 'registry', 'tools.json');

// ──────────────────────────────────────────────
// 高置信度分類規則
// 每個規則包含：category, regex (匹配 name/desc), 排除詞
// ──────────────────────────────────────────────
const CATEGORY_RULES = {
  '影片': [
    { pattern: /manim|animation.*video|math.*animation|render.*video/, exclude: [] },
    { pattern: /text.?to.?video|video.*generat|motion.*capture|vfx|cinema/, exclude: ['image'] }
  ],
  '多媒體生成': [
    { pattern: /stable.?diffusion|midjourney|dalle|image.*generat|text.?to.?image/, exclude: ['video'] },
    { pattern: /audio.*generat|music.*generat|tts|speech.?synthesis|voice.?cloning/, exclude: [] }
  ],
  '金融與投資': [
    { pattern: /quant.?trading|backtest|portfolio|algorithmic.?trading|trading.?agent/, exclude: [] },
    { pattern: /hedge.?fund|financial.?data|market.?analytics|stock.?analysis/, exclude: [] }
  ],
  '圖標與視覺資源': [
    { pattern: /icon.?pack|svg.?icons|font.?library|design.?system/, exclude: [] },
    { pattern: /figma.?plugin|ui.?kit|illustration|material.?icon/, exclude: [] }
  ]
};

// ──────────────────────────────────────────────
// 載入工具庫
// ──────────────────────────────────────────────
function loadRegistry() {
  const data = JSON.parse(readFileSync(REGISTRY_PATH, 'utf8'));
  return Array.isArray(data.tools) ? data.tools : [];
}

// ──────────────────────────────────────────────
// 檢查單一工具的分類一致性
// ──────────────────────────────────────────────
function checkTool(tool) {
  if (!tool.category || !tool.id) return [];
  
  // 只檢查 name 和 description，不檢查 triggers（因為 triggers 常被濫用）
  const text = `${tool.name} ${(tool.description || '')}`.toLowerCase();
  const issues = [];
  
  // 收集所有匹配的分類
  const matchedCategories = new Set();
  
  for (const [category, rules] of Object.entries(CATEGORY_RULES)) {
    for (const rule of rules) {
      if (rule.pattern.test(text)) {
        // 檢查是否包含排除詞
        const hasExclude = rule.exclude.some(word => text.includes(word));
        if (!hasExclude) {
          matchedCategories.add(category);
        }
      }
    }
  }
  
  // 如果匹配了多個互斥分類，且與當前分類不同，則報告
  if (matchedCategories.size > 1) {
    matchedCategories.forEach(cat => {
      if (cat !== tool.category) {
        issues.push({
          id: tool.id,
          name: tool.name,
          currentCategory: tool.category,
          suggestedCategory: cat,
          matchedText: text.substring(0, 80) + '...',
          severity: 'HIGH'
        });
      }
    });
  }
  
  return issues;
}

// ──────────────────────────────────────────────
// 主流程
// ──────────────────────────────────────────────
function main() {
  const args = process.argv.slice(2);
  const onlyRecent = args.includes('--recent');
  const hoursArg = args.find(a => a.startsWith('--hours'));
  const hours = hoursArg ? parseInt(hoursArg.split('=')[1] || args[args.indexOf(hoursArg) + 1]) : 24;
  
  console.log(`🔍 檢查工具分類一致性...`);
  console.log(`   模式: ${onlyRecent ? `最近 ${hours} 小時新增` : '全部工具'}\n`);
  
  const tools = loadRegistry();
  const cutoffTime = new Date(Date.now() - hours * 3600000);
  
  const toolsToCheck = onlyRecent 
    ? tools.filter(t => t.addedAt && new Date(t.addedAt) > cutoffTime)
    : tools;
  
  console.log(`   檢查範圍: ${toolsToCheck.length} 個工具\n`);
  
  const allIssues = [];
  
  for (const tool of toolsToCheck) {
    const issues = checkTool(tool);
    allIssues.push(...issues);
  }
  
  // 篩選 HIGH 優先級的問題
  const problems = allIssues.filter(i => i.severity === 'HIGH');
  
  if (problems.length === 0) {
    console.log('✅ 所有工具分類一致，沒有發現明顯問題\n');
    process.exit(0);
  }
  
  console.log(`📊 發現 ${problems.length} 個潛在分類問題:\n`);
  
  // 按建議分類分組顯示
  const grouped = {};
  problems.forEach(p => {
    const key = `${p.currentCategory} → ${p.suggestedCategory}`;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(p);
  });
  
  Object.entries(grouped).forEach(([move, items]) => {
    console.log(`🔴 ${move} (${items.length}):`);
    items.forEach(item => {
      console.log(`   - ${item.id}: "${item.matchedText}"`);
    });
    console.log();
  });
  
  // 總結
  console.log('═══════════════════════════════════════');
  console.log(`總工具數: ${tools.length}`);
  console.log(`檢查範圍: ${toolsToCheck.length}`);
  console.log(`問題數: ${problems.length}`);
  console.log('═══════════════════════════════════════\n');
  
  // 如果有任何 HIGH 優先級問題，以非零狀態碼退出
  process.exit(problems.length > 0 ? 1 : 0);
}

main();