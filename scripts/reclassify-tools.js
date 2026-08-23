/**
 * 工具分類規則引擎 - 基於 MECE 原則
 *
 * ⚠️ 本腳本預設為 dry-run(僅輸出建議),需加上 --apply 才會寫入 registry,
 *    避免粗粒度 regex 覆蓋人工修正後的分類。
 *
 * 分類慣例(詳見 docs/category-conventions.md):
 * 1. 領域優先:金融/行銷/3D/研究等領域工具先歸領域分類
 * 2. AI 框架 = 建構積木(SDK/模型/推論引擎/訓練框架)
 *    AI 代理 = 成品(agent 本體/harness/skill 與 plugin 集合/平台)
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
  // 注意:嚴禁加入 "agents" 等泛用字眼(曾導致 15 個非 UI 工具誤入)
  {
    pattern: /\b(shadcn-ui|storybook|tldraw|chakra-ui|ant-design|material-ui|radix-ui|tailwind|next\.?js)\b/i,
    cat: 'UI/UX設計',
    priority: 100
  },
  {
    pattern: /\b(frontend-design|open-design|react-best-practices|huashu-design|ui-skills|web-design|figma|design-system|prototype)\b/i,
    cat: 'UI/UX設計',
    priority: 90
  },
  // 網頁動畫函式庫屬 UI/UX(非影片)
  {
    pattern: /\b(gsap|anime\.?js|web animation|css animation)\b/i,
    cat: 'UI/UX設計',
    priority: 90
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
  {
    pattern: /\b(icon set|icon library|icon family|icon system|svg icons?)\b/i,
    cat: '圖標與視覺資源',
    priority: 90,
    exclude: /\b(3d|model)\b/i
  },
  
  // 測試與自動化
  { 
    pattern: /\b(playwright|cypress|selenium|jest|mocha|test-runner)\b/i, 
    cat: '測試與自動化',
    priority: 100
  },
  
  // 瀏覽器自動化 - 含名詞形態(scraper/crawler 等)
  {
    pattern: /\b(crawl|scrape|scraper|crawler|spider|puppeteer|headless-browser|browser-automation|web scraping)\b/i,
    cat: '瀏覽器自動化',
    priority: 100
  },
  
  // API 整合(過寬已收斂:排除測試/爬蟲/單純 SDK 庫)
  {
    pattern: /\b(api gateway|api integration|rest api|graphql api|openapi|mcp connector|integrations?\b)\b/i,
    cat: 'API 整合',
    priority: 80,
    exclude: /\b(test|playwright|scrape|crawl)\b/i
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
    pattern: /\b(developer-tool|cli-tool|code-editor|ide|dev.?workspace)\b/i,
    cat: '開發工具',
    priority: 90
  },

  // 學習資源
  // 注意:嚴禁以程式語言名稱作為關鍵字(曾導致 scrapy 等誤入)
  {
    pattern: /\b(learn|tutorial|course|education|bootcamp|roadmap|awesome-list|curriculum|handbook|interview|面試)\b/i,
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
  
  // 知識管理 - agent 記憶/RAG/知識圖譜(優先級高於 agent 規則)
  {
    pattern: /\b(rag|retrieval|embedding|knowledge.?graph|second.?brain|persistent.?memory|memory layer|note-taking|obsidian|notebooklm)\b/i,
    cat: '知識管理',
    priority: 95
  },
  
  // 安全性
  { 
    pattern: /\b(security|vuln|pentest|hack|owasp|cryptography)\b/i, 
    cat: '安全性',
    priority: 90
  },
  
  // 行銷(領域優先)
  // 注意:嚴禁用 "analytics"(曾導致 Apache OSSIE 誤入)
  {
    pattern: /\b(marketing|seo|advertisement|social.?media|crm|copywriting)\b/i,
    cat: '行銷',
    priority: 85
  },

  // 3D工程繪圖(領域優先)
  // 注意:"3d" 單獨出現不足以判定(曾導致 scroll-world 誤入),需搭配工程/建模語境
  {
    pattern: /\b(cad|freecad|openscad|blender|bim|text-to-cad|cadquery|parametric 3d|3d model|3d modeling|3d asset|mesh|geometry|opengl)\b/i,
    cat: '3D工程繪圖',
    priority: 85,
    exclude: /\b(landing page|scroll)\b/i
  },

  // 金融與投資(領域優先)
  {
    pattern: /\b(trading|stock|quant|portfolio|backtest|hedge.?fund|financial market|finance)\b/i,
    cat: '金融與投資',
    priority: 85
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
 * 執行全量重新分類(預設 dry-run,僅輸出建議;--apply 才寫入)
 */
export async function reclassifyAllTools({ apply = false } = {}) {
  console.log('\n' + '='.repeat(60));
  console.log(`  工具分類規則引擎 - MECE 原則驗證 (${apply ? '★ APPLY 模式' : 'DRY-RUN 模式(僅建議,加 --apply 寫入)'})`);
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

  if (apply) {
    // 寫回檔案
    writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2), 'utf8');
    console.log(`\n📁 已更新:${REGISTRY_PATH}\n`);
  } else {
    console.log('\n📁 DRY-RUN:未寫入任何檔案(加上 --apply 參數才會寫入)\n');
  }
  
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
  const apply = process.argv.includes('--apply');
  reclassifyAllTools({ apply }).catch(console.error);
}
