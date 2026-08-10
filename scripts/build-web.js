import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mineSynonyms } from './mine-synonyms.js';

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
const synonymsSource = `/**
 * ⚠️ 此檔案由 scripts/mine-synonyms.js 自動產生，請勿手動編輯。
 * 產生時間：${new Date().toISOString()}
 */
export const SYNONYM_MAP = ${JSON.stringify(synonymMap, null, 2)};
`;
fs.writeFileSync(path.join(rootDir, 'core', 'synonyms.generated.js'), synonymsSource, 'utf-8');
console.log(`同義詞詞典已更新（${stats.totalTerms} 個詞彙，來自 ${stats.keptPairs} 組挖掘配對 + ${stats.seedTerms} 個種子詞）`);

// 複製 web 檔案
fs.copyFileSync(path.join(webDir, 'index.html'), path.join(distDir, 'index.html'));
fs.copyFileSync(path.join(webDir, 'style.css'), path.join(distDir, 'style.css'));
fs.copyFileSync(path.join(webDir, 'app.js'), path.join(distDir, 'app.js'));
if (fs.existsSync(path.join(webDir, 'search-worker.js'))) {
  fs.copyFileSync(path.join(webDir, 'search-worker.js'), path.join(distDir, 'search-worker.js'));
}
if (fs.existsSync(path.join(webDir, 'persist-cache.js'))) {
  fs.copyFileSync(path.join(webDir, 'persist-cache.js'), path.join(distDir, 'persist-cache.js'));
}
if (fs.existsSync(path.join(webDir, 'behavior-tracker.js'))) {
  fs.copyFileSync(path.join(webDir, 'behavior-tracker.js'), path.join(distDir, 'behavior-tracker.js'));
}
if (fs.existsSync(path.join(webDir, 'favicon.svg'))) {
  fs.copyFileSync(path.join(webDir, 'favicon.svg'), path.join(distDir, 'favicon.svg'));
}
if (fs.existsSync(path.join(webDir, 'favicon.ico'))) {
  fs.copyFileSync(path.join(webDir, 'favicon.ico'), path.join(distDir, 'favicon.ico'));
}
if (fs.existsSync(path.join(rootDir, 'docs', 'knowledge-graph.html'))) {
  fs.copyFileSync(path.join(rootDir, 'docs', 'knowledge-graph.html'), path.join(distDir, 'knowledge-graph.html'));
}

// 複製依賴檔案
fs.copyFileSync(path.join(rootDir, 'core', 'search-engine.js'), path.join(distDir, 'core', 'search-engine.js'));
fs.copyFileSync(path.join(rootDir, 'core', 'synonyms.generated.js'), path.join(distDir, 'core', 'synonyms.generated.js'));
fs.copyFileSync(path.join(rootDir, 'registry', 'tools.json'), path.join(distDir, 'registry', 'tools.json'));
const trendingPath = path.join(rootDir, 'registry', 'weekly-trending.json');
if (fs.existsSync(trendingPath)) {
  fs.copyFileSync(trendingPath, path.join(distDir, 'registry', 'weekly-trending.json'));
}

console.log('Web build completed successfully in ./dist');
