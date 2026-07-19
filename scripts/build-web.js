import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

// 複製 web 檔案
fs.copyFileSync(path.join(webDir, 'index.html'), path.join(distDir, 'index.html'));
fs.copyFileSync(path.join(webDir, 'style.css'), path.join(distDir, 'style.css'));
fs.copyFileSync(path.join(webDir, 'app.js'), path.join(distDir, 'app.js'));

// 複製依賴檔案
fs.copyFileSync(path.join(rootDir, 'core', 'search-engine.js'), path.join(distDir, 'core', 'search-engine.js'));
fs.copyFileSync(path.join(rootDir, 'registry', 'tools.json'), path.join(distDir, 'registry', 'tools.json'));

console.log('Web build completed successfully in ./dist');
