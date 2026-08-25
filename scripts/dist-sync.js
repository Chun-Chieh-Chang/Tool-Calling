/**
 * dist-sync.js — 將生成的最新 registry 檔案同步至 dist 目錄
 *
 * 抽離自 web/server.js 的 syncRegistryToDist，讓掃描腳本（npm run trending）
 * 也能在重新生成資料後同步到工作台實際服務的 dist/registry/，
 * 避免「registry 已更新但瀏覽器仍讀到舊 dist 資料」的脫節問題。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');
const distDir = path.join(rootDir, 'dist');

/**
 * 將生成的最新 registry 檔案同步至 dist 目錄
 */
export function syncRegistryToDist() {
  const filesToSync = [
    { src: path.join(rootDir, 'registry', 'weekly-trending.json'), dest: path.join(distDir, 'registry', 'weekly-trending.json') },
    { src: path.join(rootDir, 'registry', 'tools.json'), dest: path.join(distDir, 'registry', 'tools.json') }
  ];

  for (const { src, dest } of filesToSync) {
    if (fs.existsSync(src)) {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(src, dest);
    }
  }
}
