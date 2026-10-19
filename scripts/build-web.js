import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mineSynonyms, toGeneratedSource } from './mine-synonyms.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootDir = path.join(__dirname, '..');
const webDir = path.join(rootDir, 'web');
const distDir = path.join(rootDir, 'dist');

// 清理並建立 dist 目錄
if (fs.existsSync(distDir)) {
  fs.rmSync(distDir, { recursive: true, force: true });
}
fs.mkdirSync(distDir, { recursive: true });
fs.mkdirSync(path.join(distDir, 'core'), { recursive: true });
fs.mkdirSync(path.join(distDir, 'registry'), { recursive: true });

import { generateKnowledgeGraph } from './generate-knowledge-graph.js';

const registryPath = path.join(rootDir, 'registry', 'tools.json');
const registry = JSON.parse(fs.readFileSync(registryPath, 'utf-8'));

// 每次部署前重新產生全景知識圖譜與同義詞詞典
generateKnowledgeGraph(registry);
const { map: synonymMap, stats } = mineSynonyms(registry.tools);
// 🔴 檔頭模板必須與 mine-synonyms.js 共用同一份（toGeneratedSource），
//    不可在此重複維護：歷史上這裡有一份漏掉 check-traditional: skip-file
//    標記的複製版，每次 npm run build 都把標記覆蓋掉，check-traditional
//    門禁與其守門測試（產生器模板也要有標記）直接失敗。
fs.writeFileSync(path.join(rootDir, 'core', 'synonyms.generated.js'), toGeneratedSource(synonymMap), 'utf-8');
console.log(`同義詞詞典已更新（${stats.totalTerms} 個詞彙，來自 ${stats.keptPairs} 組挖掘配對 + ${stats.seedTerms} 個種子詞）`);

// 複製 web 檔案
fs.copyFileSync(path.join(webDir, 'index.html'), path.join(distDir, 'index.html'));
fs.copyFileSync(path.join(webDir, 'style.css'), path.join(distDir, 'style.css'));
// search-worker.js 已移除：它是與 core/ 重複的第三套檢索實作，
// 前端現已改走 /api/search（與 MCP/CLI 共用 core/ 引擎）。
//
// 🔴 2026-10-19 RCA：瀏覽器端模組**不可用手寫清單**。
//    2026-10-15 讓 core/search-engine.js import './query-normalize.js'，清單沒跟上，
//    Pages 上該檔 404 → app.js 的 import 鏈整條失敗 → 頁面顯示 0 筆工具（KPI "--"）。
//    本機 npm start 由 web/server.js 直接供應 repo 檔案，不經 dist/，所以完全看不出來。
//    現在改由 scripts/browser-module-graph.js 從入口遞迴展開相對 import，
//    缺任何一支就讓 build 直接失敗（CI 紅燈優於部署白畫面）。
const { copyBrowserModules } = await import('./browser-module-graph.js');
const { copied } = copyBrowserModules({ rootDir, distDir });
console.log(`瀏覽器模組：${copied} 支（含相對依賴，已遞迴展開）`);
// 提名端點設定：**本機覆寫用，可不存在**。
// 🔴 2026-10-15 CI 實測教訓：`web/data/` 在 .gitignore 內，CI 從乾淨 clone 建置時
//    這個檔案不存在；原本無條件 copyFileSync 會 ENOENT 讓整個 build 掛掉，而
//    本機因為檔案真的存在，怎麼跑都看不出來。正式路徑是 web/index.html 的
//    meta[name="tools-add-endpoint"]（版控可見），這裡只做後備複製。
if (fs.existsSync(path.join(webDir, 'data', 'tools-add-endpoint.json'))) {
  fs.mkdirSync(path.join(distDir, 'data'), { recursive: true });
  fs.copyFileSync(path.join(webDir, 'data', 'tools-add-endpoint.json'), path.join(distDir, 'data', 'tools-add-endpoint.json'));
}
if (fs.existsSync(path.join(webDir, 'favicon.svg'))) {
  fs.copyFileSync(path.join(webDir, 'favicon.svg'), path.join(distDir, 'favicon.svg'));
}
if (fs.existsSync(path.join(webDir, 'favicon.ico'))) {
  fs.copyFileSync(path.join(webDir, 'favicon.ico'), path.join(distDir, 'favicon.ico'));
}
// 複製 docs/ 下的所有 HTML 檔案（含裁決頁、知識圖譜、流程圖等），未來新增不需再改清單
const docsDir = path.join(rootDir, 'docs');
if (fs.existsSync(docsDir)) {
  for (const entry of fs.readdirSync(docsDir)) {
    if (entry.endsWith('.html')) {
      fs.copyFileSync(path.join(docsDir, entry), path.join(distDir, entry));
    }
  }
}

// 複製依賴檔案
fs.copyFileSync(path.join(rootDir, 'core', 'search-engine.js'), path.join(distDir, 'core', 'search-engine.js'));
fs.copyFileSync(path.join(rootDir, 'core', 'synonyms.generated.js'), path.join(distDir, 'core', 'synonyms.generated.js'));
fs.copyFileSync(path.join(rootDir, 'registry', 'tools.json'), path.join(distDir, 'registry', 'tools.json'));
// 2026-10-15 Q1=B：分類白名單（瀏覽器管線用；與 Node 端同一份 categories.json）
fs.copyFileSync(path.join(rootDir, 'registry', 'categories.json'), path.join(distDir, 'registry', 'categories.json'));
const trendingPath = path.join(rootDir, 'registry', 'weekly-trending.json');
if (fs.existsSync(trendingPath)) {
  fs.copyFileSync(trendingPath, path.join(distDir, 'registry', 'weekly-trending.json'));
}

console.log('Web build completed successfully in ./dist');
