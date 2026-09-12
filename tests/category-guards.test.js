/**
 * category-guards.test.js — 驗證「分類脫節」會被守衛攔下
 *
 * 為什麼需要這個測試：
 *   2026-09-12 一天內在 5 個檔案中發現 4 次分類定義脫節（簡繁不符、schema enum 過期、
 *   色表缺漏與重複、LLM prompt 停在舊版決策樹）。加了守衛但沒驗證守衛有效，
 *   等於沒加 —— 所以每個脫節情境都必須實際注入一次並確認被攔下。
 *
 * 安全機制：所有變更都在 try/finally 中，且 finally 會以位元組比對確認還原成功。
 *
 * 備份位置：一律寫到系統暫存區（os.tmpdir()），**不放在受版控的目錄旁**。
 *   原本寫成 `${f}.guardtest.bak` 會產生 registry/schemas/tool.schema.json.guardtest.bak
 *   之類的檔案；try/finally 雖能還原，但行程被硬殺（SIGKILL／OOM）時會留下殘骸，
 *   且該檔名不在 .gitignore 內，會污染 git status。
 */

import { test } from 'node:test';
import assert from 'node:assert';
import {
  readFileSync, writeFileSync, copyFileSync, existsSync,
  mkdtempSync, rmSync,
} from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, basename } from 'node:path';
import { tmpdir } from 'node:os';

const ROOT = join(import.meta.dirname, '..');
const CATS = join(ROOT, 'registry', 'categories.json');
const SCHEMA = join(ROOT, 'registry', 'schemas', 'tool.schema.json');
const MD = join(ROOT, 'docs', 'CLASSIFICATION.md');
const CAT_SYS = join(ROOT, 'docs', 'CATEGORY-SYSTEM.md');

/** 執行 check-mece.js，回傳 { code, out } */
function runMece() {
  try {
    const out = execFileSync(process.execPath, ['scripts/check-mece.js'], { cwd: ROOT, encoding: 'utf8' });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status ?? 1, out: (e.stdout || '') + (e.stderr || '') };
  }
}

/** 在受控的備份/還原下執行一組斷言。備份存放於系統暫存區，不污染工作區。 */
function withRestore(files, fn) {
  const dir = mkdtempSync(join(tmpdir(), 'tool-calling-guard-'));
  const backups = new Map();
  try {
    for (const f of files) {
      assert.ok(existsSync(f), `測試前置：${f} 必須存在`);
      const b = join(dir, basename(f));
      copyFileSync(f, b);
      backups.set(f, b);
    }
    fn();
  } finally {
    try {
      for (const [f, b] of backups) {
        if (!existsSync(b)) continue;
        copyFileSync(b, f);
        // 位元組比對，確保真的還原
        assert.ok(
          readFileSync(f).equals(readFileSync(b)),
          `還原失敗：${f} 與備份不一致`
        );
      }
    } finally {
      // 即使還原斷言失敗也要清掉暫存目錄，避免 tmpdir 殘留
      rmSync(dir, { recursive: true, force: true });
    }
  }
}

test('守衛：色碼重複必須被攔下（曾發生 AI 框架/知識管理 同色，105 筆無法區分）', () => {
  withRestore([CATS], () => {
    const cats = JSON.parse(readFileSync(CATS, 'utf8'));
    cats.categories[1].color = cats.categories[0].color;
    writeFileSync(CATS, JSON.stringify(cats, null, 2) + '\n');
    const { code, out } = runMece();
    assert.notStrictEqual(code, 0, '色碼重複時 check-mece 必須以非零退出碼結束');
    assert.match(out, /色碼重複/, '必須印出「色碼重複」訊息');
  });
});

test('守衛：色距過近必須被攔下（圖例上無法分辨）', () => {
  withRestore([CATS], () => {
    const cats = JSON.parse(readFileSync(CATS, 'utf8'));
    // #dc2626 vs #db2525 — 距離約 1.7，遠低於門檻 55
    cats.categories[1].color = '#db2525';
    writeFileSync(CATS, JSON.stringify(cats, null, 2) + '\n');
    const { code, out } = runMece();
    assert.notStrictEqual(code, 0, '色距過近時必須失敗');
    assert.match(out, /色距過近/);
  });
});

test('守衛：黑底對比不足必須被攔下（知識圖譜為 OLED 純黑）', () => {
  withRestore([CATS], () => {
    const cats = JSON.parse(readFileSync(CATS, 'utf8'));
    cats.categories[1].color = '#1a1a1a'; // 對純黑幾乎不可見
    writeFileSync(CATS, JSON.stringify(cats, null, 2) + '\n');
    const { code, out } = runMece();
    assert.notStrictEqual(code, 0, '對比不足時必須失敗');
    assert.match(out, /對比僅/);
  });
});

test('守衛：registry 使用了 categories.json 未定義的分類必須被攔下', () => {
  withRestore([CATS], () => {
    const cats = JSON.parse(readFileSync(CATS, 'utf8'));
    // 移除一個 registry 實際有在用的分類
    cats.categories = cats.categories.filter(c => c.name !== '金融與投資');
    writeFileSync(CATS, JSON.stringify(cats, null, 2) + '\n');
    const { code, out } = runMece();
    assert.notStrictEqual(code, 0, '分類未定義時必須失敗');
    assert.match(out, /未定義的分類/);
  });
});

test('守衛：schema enum 與 categories.json 不一致必須被攔下', () => {
  withRestore([SCHEMA], () => {
    const schema = JSON.parse(readFileSync(SCHEMA, 'utf8'));
    schema.definitions.Tool.properties.category.enum = ['AI 代理', '開發工具'];
    writeFileSync(SCHEMA, JSON.stringify(schema, null, 2) + '\n');
    const { code, out } = runMece();
    assert.notStrictEqual(code, 0, 'schema enum 脫節時必須失敗');
    assert.match(out, /category enum 與 categories\.json 不一致/);
  });
});

test('守衛：CLASSIFICATION.md 漏掉分類必須被攔下', () => {
  withRestore([MD], () => {
    const md = readFileSync(MD, 'utf8').replace(/金融與投資/g, '（已刪除）');
    writeFileSync(MD, md);
    const { code, out } = runMece();
    assert.notStrictEqual(code, 0, '文件漏掉分類時必須失敗');
    assert.match(out, /未提及以下分類/);
  });
});

test('守衛：衍生檔同步檢查必須在脫節時失敗', () => {
  withRestore([SCHEMA], () => {
    const schema = JSON.parse(readFileSync(SCHEMA, 'utf8'));
    schema.definitions.Tool.properties.category.enum = ['AI 代理'];
    writeFileSync(SCHEMA, JSON.stringify(schema, null, 2) + '\n');
    let code = 0, out = '';
    try {
      out = execFileSync(process.execPath, ['scripts/sync-categories.js', '--check'], { cwd: ROOT, encoding: 'utf8' });
    } catch (e) {
      code = e.status ?? 1;
      out = (e.stdout || '') + (e.stderr || '');
    }
    assert.notStrictEqual(code, 0, 'categories:check 必須在脫節時失敗');
    assert.match(out, /不同步/);
  });
});

test('守衛：CATEGORY-SYSTEM.md 出現幽靈分類必須被攔下（曾殘留簡體 `UI/UX设计`）', () => {
  withRestore([CAT_SYS], () => {
    const md = readFileSync(CAT_SYS, 'utf8').replace(
      '<!-- CATEGORIES:INVENTORY:END -->',
      '| `UI/UX设计` | 1 | 幽靈分類 |\n<!-- CATEGORIES:INVENTORY:END -->'
    );
    writeFileSync(CAT_SYS, md);
    const { code, out } = runMece();
    assert.notStrictEqual(code, 0, '幽靈分類必須讓 check-mece 以非零退出碼結束');
    assert.match(out, /出現 categories\.json 沒有的分類/);
  });
});

test('守衛：CATEGORY-SYSTEM.md 缺少分類必須被攔下', () => {
  withRestore([CAT_SYS], () => {
    const md = readFileSync(CAT_SYS, 'utf8')
      .split('\n')
      .filter(l => !l.startsWith('| `金融與投資` |'))
      .join('\n');
    writeFileSync(CAT_SYS, md);
    const { code, out } = runMece();
    assert.notStrictEqual(code, 0, '缺少分類必須讓 check-mece 以非零退出碼結束');
    assert.match(out, /缺少分類/);
  });
});

test('守衛：CATEGORY-SYSTEM.md 缺少 INVENTORY 標記區塊必須被攔下', () => {
  withRestore([CAT_SYS], () => {
    const md = readFileSync(CAT_SYS, 'utf8')
      .replace(/CATEGORIES:INVENTORY:(START|END)/g, 'CATEGORIES:INVENTORY:REMOVED');
    writeFileSync(CAT_SYS, md);
    const { code, out } = runMece();
    assert.notStrictEqual(code, 0, '缺少標記必須讓 check-mece 以非零退出碼結束');
    assert.match(out, /缺少 CATEGORIES:INVENTORY 標記區塊/);
  });
});

test('現況：未注入任何變更時，所有守衛應全數通過', () => {
  const { code, out } = runMece();
  assert.strictEqual(code, 0, `check-mece 應通過，實際輸出：\n${out}`);
  assert.match(out, /所有 MECE 檢查通過/);
});
