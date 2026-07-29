import readline from 'node:readline';
import { loadRegistry } from './registry.js';
import { search, extractQueryContext, rerankCandidates } from './search-engine.js';

const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  red: '\x1b[31m',
  dim: '\x1b[2m'
};

function askQuestion(rl, queryText) {
  return new Promise(resolve => {
    rl.question(queryText, answer => {
      resolve(answer.trim());
    });
  });
}

/**
 * 需求導向互動引導問答機制 (Dynamic Requirement Approximator)
 * 透過遞進式多輪提問，逐步收斂用戶真正需求並逼近最適工具
 */
export async function runInteractiveInterview(initialQuery = '') {
  console.log(`\n\x1b[44m\x1b[37m\x1b[1m 🎯 需求導向互動引導與精準適配問答系統 (Interactive Requirement Approximator) \x1b[0m\n`);
  
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const registry = loadRegistry();
  let baseQuery = initialQuery;

  if (!baseQuery) {
    baseQuery = await askQuestion(rl, `${c.cyan}${c.bold}Q1. 請簡單描述您想實現的功能或需求 (例如: 網頁爬蟲, 簡報, 股票分析): ${c.reset}`);
    if (!baseQuery) baseQuery = '工具';
  } else {
    console.log(`${c.cyan}${c.bold}初始需求焦點:${c.reset} "${baseQuery}"\n`);
  }

  // 提問 1: 程式語言與習慣環境
  console.log(`${c.yellow}${c.bold}Q1. 您平時習慣使用哪種程式語言或工具環境？${c.reset}`);
  console.log(`  1. Python (適合 AI 模型、數據分析與自動化腳本)`);
  console.log(`  2. Node.js / JavaScript / TypeScript (適合網頁與前端開發)`);
  console.log(`  3. Java / C# / 其他傳統語言`);
  console.log(`  4. 我沒有語言限制 (只要能在命令列或 Docker 一鍵執行即可)`);
  const ansLang = await askQuestion(rl, `${c.dim}請選擇 (1-4, 預設 4): ${c.reset}`);

  let selectedLang = '';
  if (ansLang === '1') selectedLang = 'python';
  else if (ansLang === '2') selectedLang = 'typescript';
  else if (ansLang === '3') selectedLang = 'java';

  // 提問 2: 想要達成的真實目標 (避免專業術語，使用場景化語言)
  console.log(`\n${c.yellow}${c.bold}Q2. 您希望這個工具幫您解決什麼核心問題？${c.reset}`);
  console.log(`  1. 把網頁資料抓下來給 AI 助手閱讀、做摘要或建立知識庫`);
  console.log(`  2. 自動點擊網頁按鈕、填寫表單或進行畫面操作測試`);
  console.log(`  3. 一次快速抓取大量網頁資料並儲存為檔案`);
  console.log(`  4. 簡單的網頁文字與 HTML 標籤內容提取`);
  console.log(`  5. 其他通用開發與工具需求`);
  const ansScenario = await askQuestion(rl, `${c.dim}請選擇 (1-5, 預設 5): ${c.reset}`);

  let scenarioKw = '';
  if (ansScenario === '1') scenarioKw = 'rag llm markdown 知識庫 摘要';
  else if (ansScenario === '2') scenarioKw = 'testing e2e test 自動化按鈕 測試';
  else if (ansScenario === '3') scenarioKw = 'pipeline async 併發 大量';
  else if (ansScenario === '4') scenarioKw = 'dom html 標籤';

  // 提問 3: 網頁複雜度與防護
  console.log(`\n${c.yellow}${c.bold}Q3. 您要處理的網站是否包含複雜的動態畫面或需要防止封鎖？${c.reset}`);
  console.log(`  1. 是 (網頁有動態載入、滾動更新或防爬蟲機制)`);
  console.log(`  2. 否 (一般的靜態網頁，開啟就能看到文字)`);
  console.log(`  3. 不確定 / 希望工具越彈性越好`);
  const ansFeature = await askQuestion(rl, `${c.dim}請選擇 (1-3, 預設 3): ${c.reset}`);

  let featureKw = '';
  if (ansFeature === '1') featureKw = '動態 渲染 javascript spa';

  rl.close();

  // 融合問答特徵建構合成查詢
  const combinedQuery = `${baseQuery} ${selectedLang} ${scenarioKw} ${featureKw}`.trim();
  console.log(`\n${c.dim}─────────────────────────────────────────${c.reset}`);
  console.log(`${c.magenta}${c.bold}🔍 需求收斂與精準比對中...${c.reset}`);

  const candidates = search(registry.tools, combinedQuery, { topK: 5 });

  if (candidates.length === 0) {
    console.log(`${c.red}未找到極致符合之工具，建議嘗試擴大搜尋範圍。${c.reset}`);
    return;
  }

  const best = candidates[0];
  console.log(`\n${c.green}${c.bold}🎯 【最佳精準對接工具】${c.reset}`);
  console.log(`  名稱: ${c.bold}${c.cyan}${best.tool.name}${c.reset} (${best.tool.id})`);
  console.log(`  分類: ${c.dim}${best.tool.category}${c.reset} | 匹配精準度: ${c.bold}${Math.round(best.score * 100)}%${c.reset}`);
  console.log(`  語言: ${best.tool.language || 'Unspecified'} | ⭐ Stars: ${best.tool.stars || 'N/A'}`);
  console.log(`  場景: ${best.tool.useCase || best.tool.description}`);
  if (best.tool.advantages && best.tool.advantages.length > 0) {
    console.log(`  優勢: ${best.tool.advantages.join('; ')}`);
  }
  if (best.tool.install && best.tool.install.command) {
    console.log(`  💻 調用: ${c.yellow}${best.tool.install.command}${c.reset}`);
  }

  if (candidates.length > 1) {
    console.log(`\n${c.dim}💡 其他相似候選: ${candidates.slice(1).map(c => `${c.tool.name} (${c.tool.id})`).join(', ')}${c.reset}\n`);
  }
}
