/**
 * 語法守門：對所有手寫的 .js 檔跑 `node --check`。
 *
 * 🔴 為什麼需要（2026-09-21 新增）：
 *   這個專案已經**兩次**讓「語法錯誤」溜進版控，而且都不是靠測試發現的：
 *     1. 編輯註解時誤刪 `const DEFAULT_MODEL = ...`，造成 rerank 整個壞掉，
 *        卻因為 `npm test | tail -4` 把 `# fail` 那行截掉而沒看到。
 *     2. `core/tool-enricher.js` 的 prompt 是 template literal，
 *        我在裡面寫了 `` `npm run translate:zh` ``（反引號）→ 字串提前結束，
 *        整個模組載入失敗。
 *   問題的根源是：**沒被任何測試 import 的模組，語法錯了也沒人知道**。
 *   這裡用 `node --check` 做一次全掃，成本約 1 秒，換掉整類風險。
 *
 * 範圍：手寫的 .js（core/、scripts/、web/、tests/、根目錄），
 *       排除 node_modules、dist、.git 等產物目錄。
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const SCAN_DIRS = ['core', 'scripts', 'web', 'tests'];
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', 'coverage', '.workbuddy-ai']);

/** 遞迴收集 .js 檔（.mjs/.cjs 一併納入，寫法相同） */
function collect(dir, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      collect(path.join(dir, e.name), out);
    } else if (/\.(mjs|cjs|js)$/.test(e.name)) {
      out.push(path.join(dir, e.name));
    }
  }
  return out;
}

const files = [];
for (const d of SCAN_DIRS) files.push(...collect(path.join(ROOT, d)));
// 根目錄的進入點（cli.js、mcp-server.js、eslint.config.mjs 等）
for (const e of fs.readdirSync(ROOT, { withFileTypes: true })) {
  if (e.isFile() && /\.(mjs|cjs|js)$/.test(e.name)) files.push(path.join(ROOT, e.name));
}

const failures = [];
for (const f of files) {
  try {
    // --check 只做語法解析，不執行模組（所以不會觸發副作用）
    execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' });
  } catch (err) {
    const msg = String(err.stderr || err.stdout || err.message)
      .split('\n')
      .filter((l) => l.trim())
      .slice(0, 4)
      .join('\n    ');
    failures.push({ file: path.relative(ROOT, f), msg });
  }
}

if (failures.length > 0) {
  console.error(`❌ [Syntax Guard] ${failures.length} 個檔案語法檢查失敗：`);
  for (const f of failures) console.error(`  · ${f.file}\n    ${f.msg}`);
  process.exit(1);
}
console.log(`✅ [Syntax Guard] ${files.length} 個 .js 檔語法檢查通過`);
