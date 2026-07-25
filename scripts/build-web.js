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

// 每次部署前重新挖掘同義詞詞典，確保跟 registry 目前內容同步
// （同時也更新 repo 內的 core/synonyms.generated.js，讓本地開發環境一致）
const registryPath = path.join(rootDir, 'registry', 'tools.json');
const registry = JSON.parse(fs.readFileSync(registryPath, 'utf-8'));
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

// 複製依賴檔案
fs.copyFileSync(path.join(rootDir, 'core', 'search-engine.js'), path.join(distDir, 'core', 'search-engine.js'));
fs.copyFileSync(path.join(rootDir, 'core', 'synonyms.generated.js'), path.join(distDir, 'core', 'synonyms.generated.js'));
fs.copyFileSync(path.join(rootDir, 'registry', 'tools.json'), path.join(distDir, 'registry', 'tools.json'));

console.log('Web build completed successfully in ./dist');
