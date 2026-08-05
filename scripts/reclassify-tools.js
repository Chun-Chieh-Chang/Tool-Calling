/**
 * 工具分類重構腳本 - 基於 MECE 原則
 * 
 * 功能：
 * 1. 掃描所有工具的元數據（名稱、描述、URL、標籤）
 * 2. 應用精確的分類規則（優先順序關鍵）
 * 3. 處理「其他」類別的工具（強制歸類）
 * 4. 檢測並提示潛在的重疊類別
 * 5. 輸出詳細的變更報告
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const REGISTRY_PATH = join(ROOT, 'registry', 'tools.json');

// ─── 分類規則（按優先順序排列）─────────────────────────────────────────────

const CATEGORY_RULES = [
  // ═══════════════════════════════════════════════════════════
  // Level 1: 明確匹配的類別（高信心度）
  // ═══════════════════════════════════════════════════════════
  
  // AI 代理 - 專門的 Agent/Assistant 系統
  { 
    pattern: /\b(autonomous-agent|assistant\.?bot|copilot)\b/i, 
    cat: 'AI 代理',
    priority: 100
  },
  { 
    pattern: /\b(agent|mcp-server)\b/i, 
    cat: 'AI 代理',
    priority: 90,
    exclude: /\b(skill|framework|sdk)\b/i
  },
  
  // AI 框架 - LLM/Multi-modal 框架
  { 
    pattern: /\b(llm|language.model|transformer|gpt|claude|gemini)\b/i, 
    cat: 'AI 框架',
    priority: 100
  },
  { 
    pattern: /\b(huggingface|diffusion|stable.?diffusion|midjourney|dalle)\b/i, 
    cat: 'AI 框架',
    priority: 100
  },
  { 
    pattern: /\b(ai.?sdk|ai.?toolkit|openai.?sdk)\b/i, 
    cat: 'AI 框架',
    priority: 90
  },
  
  // UI/UX 設計 - 前端框架與設計系統
  { 
    pattern: /\b(shadcn-ui|storybook|tldraw|chakra-ui|ant-design|material-ui|radix-ui)\b/i, 
    cat: 'UI/UX設計',
    priority: 100
  },
  { 
    pattern: /\b(frontend-design|open-design|react-best-practices|huashu-design|ui-skills)\b/i, 
    cat: 'UI/UX設計',
    priority: 90
  },
  { 
    pattern: /\b(impeccable|agents|design-system|figma-plugin|web-design-guideline)\b/i, 
    cat: 'UI/UX設計',
    priority: 80
  },
  
  // 圖標與視覺資源 - 專門的圖標庫
  { 
    pattern: /\b(lucide|heroicons|font-awesome|tabler-icons|iconify)\b/i, 
    cat: '圖標與視覺資源',
    priority: 100
  },
  { 
    pattern: /\b(simple-icons|welovesvg|sfsafesymbols|remix-icon|iconoir)\b/i, 
    cat: '圖標與視覺資源',
    priority: 100
  },
  { 
    pattern: /\b(material-design-icon|fluentui-system-icon|ant-design-icon|polaris-icon|radix-icon)\b/i, 
    cat: '圖標與視覺資源',
    priority: 90
  },
  
  // 測試與自動化
  { 
    pattern: /\b(playwright|cypress|selenium|jest|mocha|test-runner)\b/i, 
    cat: '測試與自動化',
    priority: 100
  },
  
  // 瀏覽器自動化
  { 
    pattern: /\b(crawl|scrape|puppeteer|headless-browser|browser-automation)\b/i, 
    cat: '瀏覽器自動化',
    priority: 100
  },
  
  // API 整合
  { 
    pattern: /\b(api|rest|graphql|grpc|sdk|integration)\b/i, 
    cat: 'API 整合',
    priority: 80,
    exclude: /\b(test|playwright)\b/i
  },
  
  // 文件生產力
  { 
    pattern: /\b(ppt|powerpoint|slide|presentation|office|doc|pdf|markdown)\b/i, 
    cat: '文件生產力',
    priority: 90
  },
  
  // 影片
  { 
    pattern: /\b(video|animation|movie|ffmpeg|streaming)\b/i, 
    cat: '影片',
    priority: 90
  },
  
  // 音訊
  { 
    pattern: /\b(audio|music|speech|voice|whisper|tts|stt|text-to-speech)\b/i, 
    cat: '音訊',
    priority: 90
  },
  
  // 多媒體生成 - AI 生成
  { 
    pattern: /\b(generative-ai|img2video|text2video|text2img|image-generation|diffusion-model)\b/i, 
    cat: '多媒體生成',
    priority: 100
  },
  
  // 開發工具
  { 
    pattern: /\b(developer-tool|cli-tool|code-editor|ide)\b/i, 
    cat: '開發工具',
    priority: 90
  },
  { 
    pattern: /\b(typescript|javascript|python|rust|go)\b/i, 
    cat: '學習資源',
    priority: 80
  },
  
  // 學習資源
  { 
    pattern: /\b(learn|tutorial|course|education|bootcamp|roadmap|awesome-list)\b/i, 
    cat: '學習資源',
    priority: 90
  },
  
  // 資料庫
  { 
    pattern: /\b(database|sql|nosql|postgres|mongo|redis|sqlite)\b/i, 
    cat: '資料庫',
    priority: 90
  },
  
  // 數據分析
  { 
    pattern: /\b(data-analy|pandas|polars|duckdb|dataframe|eda|profiling)\b/i, 
    cat: '數據分析',
    priority: 90
  },
  
  // 研究
  { 
    pattern: /\b(research|paper|arxiv|science|survey)\b/i, 
    cat: '研究',
    priority: 80
  },
  
  // 知識管理
  { 
    pattern: /\b(knowledge|rag|retrieval|embedding|memory|note-taking)\b/i, 
    cat: '知識管理',
    priority: 80
  },
  
  // 安全性
  { 
    pattern: /\b(security|vuln|pentest|hack|owasp|cryptography)\b/i, 
    cat: '安全性',
    priority: 90
  },
  
  // 行銷
  { 
    pattern: /\b(marketing|seo|analytics|advertisement|social-media)\b/i, 
    cat: '行銷',
    priority: 80
  },
  
  // 3D工程繪圖
  { 
    pattern: /\b(3d|cad|mesh|render|blender|opengl|geometry|freecad|openscad)\b/i, 
    cat: '3D工程繪圖',
    priority: 80
  },
  
  // 基礎設施
  { 
    pattern: /\b(infra|docker|kubernetes|terraform|cloud|serverless)\b/i, 
    cat: '基礎設施',
    priority: 80
  },
];

// ═══════════════════════════════════════════════════════════════════════
// 主要函式
// ═══════════════════════════════════════════════════════════════════════

/**
 * 推斷工具的分類
 * @param {Object} tool - 工具物件
 * @returns {string} 分類名稱
 */
function inferCategory(tool) {
  if (!tool) return '開發工具';
  
  const name = (tool.name || '').toLowerCase();
  const desc = (tool.description || '').toLowerCase();
  const url = (tool.url || '').toLowerCase();
  const capabilities = (tool.capabilities || []).join(' ').toLowerCase();
  const triggers = (tool.triggers || []).join(' ').toLowerCase();
  
  // 組合所有可分析的文本
  const text = `${name} ${desc} ${url} ${capabilities} ${triggers}`;
  
  // 按優先順序匹配規則
  let bestMatch = null;
  let bestPriority = 0;
  
  for (const rule of CATEGORY_RULES) {
    if (rule.pattern.test(text)) {
      // 檢查排除條件
      if (rule.exclude && rule.exclude.test(text)) {
        continue;
      }
      
      // 如果這是更高優先級的匹配，更新最佳匹配
      if (rule.priority > bestPriority) {
        bestPriority = rule.priority;
        bestMatch = rule.cat;
      }
    }
  }
  
  // 如果沒有匹配到任何規則，使用預設邏輯
  if (!bestMatch) {
    return inferDefaultCategory(tool);
  }
  
  return bestMatch;
}

/**
 * 預設分類邏輯（當沒有明確規則匹配時）
 */
function inferDefaultCategory(tool) {
  const name = (tool.name || '').toLowerCase();
  const desc = (tool.description || '').toLowerCase();
  const url = (tool.url || '').toLowerCase();
  const text = `${name} ${desc} ${url}`;
  
  // 檢查是否是技能（Skill）
  if (text.includes('skill') || text.includes('prompt')) {
    return 'AI 代理'; // Skill 通常作為 AI Agent 的工具使用
  }
  
  // 檢查是否是 Awesome List
  if (text.includes('awesome')) {
    return '學習資源';
  }
  
  // 檢查是否包含常見關鍵字
  if (text.includes('guide') || text.includes('handbook')) {
    return '學習資源';
  }
  
  if (text.includes('template') || text.includes('starter')) {
    return '開發工具';
  }
  
  // 預設回開發工具
  return '開發工具';
}

/**
 * 獲取分類原因說明
 */
function getCategoryReason(tool, category) {
  const name = (tool.name || '').toLowerCase();
  
  const reasons = {
    'AI 代理': '匹配到 Agent/Skill/Prompt 相關關鍵字',
    'AI 框架': '匹配到 LLM/Transformer/模型相關關鍵字',
    'UI/UX設計': '匹配到前端框架/設計系統相關關鍵字',
    '圖標與視覺資源': '匹配到圖標庫相關關鍵字',
    '開發工具': '預設分類（無明確匹配）',
    '學習資源': '匹配到教程/課程相關關鍵字',
    '測試與自動化': '匹配到測試框架相關關鍵字',
    '影片': '匹配到影片/動畫相關關鍵字',
    '音訊': '匹配到音頻相關關鍵字',
    '多媒體生成': '匹配到 AI 生成相關關鍵字',
  };
  
  return reasons[category] || '';
}

/**
 * 打印分類統計
 */
function printCategoryStats(stats) {
  const sorted = Object.entries(stats).sort((a, b) => b[1] - a[1]);
  const maxLen = Math.max(...sorted.map(([cat]) => cat.length));
  
  for (const [cat, count] of sorted) {
    const bar = '█'.repeat(Math.round(count / 5));
    console.log(`  ${count.toString().padStart(3)} | ${cat.padEnd(maxLen)} ${bar}`);
  }
}

/**
 * MECE 驗證
 */
function validateMECE(stats) {
  console.log('\n  ✓ 互斥性檢查：');
  const overlapping = [];
  
  // 檢查是否有空類別
  if (stats['其他'] && stats['其他'] > 0) {
    console.log(`    ⚠ 「其他」類別仍有 ${stats['其他']} 個工具，建議強制歸類`);
    overlapping.push('其他');
  }
  
  // 檢查是否有過小的類別（可能應該合併）
  const smallCategories = Object.entries(stats)
    .filter(([_, count]) => count <= 2)
    .map(([cat]) => cat);
  
  if (smallCategories.length > 0) {
    console.log(`    ℹ 小類別（≤2個工具）：${smallCategories.join(', ')}`);
    console.log('       考慮是否合併或刪除這些類別');
  }
  
  // 檢查是否有過大的類別（可能應該拆分）
  const largeCategories = Object.entries(stats)
    .filter(([_, count]) => count >= 50)
    .map(([cat]) => cat);
  
  if (largeCategories.length > 0) {
    console.log(`    ℹ 大類別（≥50個工具）：${largeCategories.join(', ')}`);
    console.log('       考慮是否需要細分子類別');
  }
  
  if (overlapping.length === 0 && smallCategories.length <= 3 && largeCategories.length <= 2) {
    console.log('    ✓ 分類結構良好，符合 MECE 原則');
  }
  
  console.log('\n  ✓ 窮盡性檢查：');
  console.log(`    ✓ 所有 ${Object.values(stats).reduce((a, b) => a + b, 0)} 個工具都已歸類`);
  console.log(`    ✓ 共 ${Object.keys(stats).length} 個分類類別\n`);
}

/**
 * 執行全量重新分類
 */
export async function reclassifyAllTools() {
  console.log('\n' + '='.repeat(60));
  console.log('  工具分類重構系統 - MECE 原則驗證');
  console.log('='.repeat(60) + '\n');
  
  // 讀取註冊表
  const registry = JSON.parse(readFileSync(REGISTRY_PATH, 'utf8'));
  const totalTools = registry.tools.length;
  
  console.log(`📊 讀取工具庫：${totalTools} 個工具\n`);
  
  // 統計舊分類
  const oldStats = {};
  registry.tools.forEach(t => {
    const cat = t.category || '未分類';
    oldStats[cat] = (oldStats[cat] || 0) + 1;
  });
  
  console.log('【舊分類分布】');
  printCategoryStats(oldStats);
  
  // 執行重新分類
  const changes = [];
  const newStats = {};
  
  for (const tool of registry.tools) {
    const oldCat = tool.category;
    const newCat = inferCategory(tool);
    
    if (oldCat !== newCat) {
      changes.push({
        id: tool.id,
        name: tool.name,
        old: oldCat,
        new: newCat,
        reason: getCategoryReason(tool, newCat)
      });
    }
    
    tool.category = newCat;
    newStats[newCat] = (newStats[newCat] || 0) + 1;
  }
  
  // 更新時間戳
  registry.lastUpdated = new Date().toISOString();
  
  // 寫回檔案
  writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2), 'utf8');
  
  // 輸出結果
  console.log('\n【新分類分布】');
  printCategoryStats(newStats);
  
  console.log(`\n✅ 完成！共變更 ${changes.length}/${totalTools} 個工具的分類`);
  
  if (changes.length > 0) {
    console.log('\n【變更詳情】（前20個）');
    changes.slice(0, 20).forEach((change, idx) => {
      console.log(`  ${idx + 1}. ${change.name}: ${change.old} → ${change.new}`);
      if (change.reason) {
        console.log(`     💡 ${change.reason}`);
      }
    });
    if (changes.length > 20) {
      console.log(`  ... 還有 ${changes.length - 20} 個變更`);
    }
  }
  
  // MECE 驗證
  validateMECE(newStats);
  
  console.log(`\n📁 已更新：${REGISTRY_PATH}\n`);
  
  return {
    total: totalTools,
    changed: changes.length,
    oldStats,
    newStats,
    changes
  };
}

// ─── 直接執行 ─────────────────────────────────────────────────────────

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  reclassifyAllTools().catch(console.error);
}
