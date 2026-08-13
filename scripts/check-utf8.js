import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FILES_TO_CHECK = [
  'DEV_LOG.md',
  'README.md',
  'AGENTS.md',
  'package.json'
];

let hasError = false;

FILES_TO_CHECK.forEach(relPath => {
  const fullPath = path.join(__dirname, '..', relPath);
  if (!fs.existsSync(fullPath)) return;

  const content = fs.readFileSync(fullPath, 'utf8');
  const ufffMatches = content.match(/\uFFFD/g);
  if (ufffMatches && ufffMatches.length > 0) {
    console.error(`❌ [UTF-8 Guard] 檔案 ${relPath} 包含 ${ufffMatches.length} 個 U+FFFD () 亂碼字元！`);
    hasError = true;
  }
});

if (hasError) {
  console.error('❌ [UTF-8 Guard] 編碼檢查失敗，請修復檔案編碼後再繼續！');
  process.exit(1);
} else {
  console.log('✅ [UTF-8 Guard] 所有核心檔案 UTF-8 編碼檢查通過 (0 個 U+FFFD 亂碼字元)');
}
