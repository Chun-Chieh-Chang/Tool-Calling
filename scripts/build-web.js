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
fs.copyFileSync(path.join(webDir, 'app.js'), path.join(distDir, 'app.js'));
// search-worker.js 已移除：它是與 core/ 重複的第三套檢索實作，
// 前端現已改走 /api/search（與 MCP/CLI 共用 core/ 引擎）。
if (fs.existsSync(path.join(webDir, 'persist-cache.js'))) {
  fs.copyFileSync(path.join(webDir, 'persist-cache.js'), path.join(distDir, 'persist-cache.js'));
}
if (fs.existsSync(path.join(webDir, 'behavior-tracker.js'))) {
  fs.copyFileSync(path.join(webDir, 'behavior-tracker.js'), path.join(distDir, 'behavior-tracker.js'));
}
// 2026-10-15 Q1=B：Web 提名管線（GitHub Pages「加入工具庫」）。
// repo/pipeline/{add-pipeline.js,add-tool-dialog.js} → dist/pipeline/。
// 管線模組以 '../scripts/…'／'../core/…'／'../worker/…' 向上匯入——兩種樹深度
// 相同（pipeline/ 與 scripts/ 都在各自根的下一層），同一個 specifier 在原始碼樹
// 與部署樹都成立，因此這裡只需原樣複製、不改寫內容。
// ⚠️ 新增瀏覽器端模組時，記得回來加複製行（漏一次 = Pages 上 404）。
fs.mkdirSync(path.join(distDir, 'pipeline'), { recursive: true });
for (const f of ['add-pipeline.js', 'add-tool-dialog.js']) {
  if (fs.existsSync(path.join(rootDir, 'pipeline', f))) {
    fs.copyFileSync(path.join(rootDir, 'pipeline', f), path.join(distDir, 'pipeline', f));
  }
}
fs.mkdirSync(path.join(distDir, 'scripts'), { recursive: true });
fs.mkdirSync(path.join(distDir, 'worker'), { recursive: true });
for (const f of ['scan-tool.js', 'fix-simplified.js']) {
  fs.copyFileSync(path.join(rootDir, 'scripts', f), path.join(distDir, 'scripts', f));
}
for (const f of ['tool-id.js', 'classification-rules.js', 'categories.js', 'tool-enricher.js', 'llm-keys.js']) {
  fs.copyFileSync(path.join(rootDir, 'core', f), path.join(distDir, 'core', f));
}
fs.copyFileSync(path.join(rootDir, 'worker', 'index.js'), path.join(distDir, 'worker', 'index.js'));
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
if (fs.existsSync(path.join(rootDir, 'docs', 'knowledge-graph.html'))) {
  fs.copyFileSync(path.join(rootDir, 'docs', 'knowledge-graph.html'), path.join(distDir, 'knowledge-graph.html'));
  fs.copyFileSync(path.join(rootDir, 'docs', 'pipeline-workflow.html'), path.join(distDir, 'pipeline-workflow.html'));
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
