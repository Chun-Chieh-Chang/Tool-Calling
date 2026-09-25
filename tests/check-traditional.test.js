/**
 * check-traditional.js 的迴歸測試
 *
 * 這支門禁本身有兩類風險，各由一組測試鎖住：
 *   1. **誤報**：把正確繁體判成簡體 → 工程師會直接關掉門禁，防線消失。
 *      故「歧義字必須不報」是核心契約（與 fix-simplified.js 的 S2T_SAFE 收字規則同源）。
 *   2. **漏報**：豁免機制太寬鬆，任何行加個標記就免檢 → 故標記必須是
 *      明確字串、且檔頭標記只認前 10 行。
 * 另有一條 **綠色鎖**：原始碼目錄整檔掃描必須 0 違規，這是 npm test 能長期
 * 掛著它的前提；哪天有人新增未標記的簡體資料行，這條會先紅。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  checkLine,
  isLineExempt,
  isSkippedPath,
  parseAddedLines,
  scanFile,
} from '../scripts/check-traditional.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = path.join(ROOT, 'scripts', 'check-traditional.js');

// 本檔是門禁自己的測試，因此刻意**不使用**豁免標記：需要簡體輸入時一律用
// \uXXXX 重組，讓本檔在 `--full --code` 下維持零違規。
const SIMP_SENTENCE = '\u8fd9\u6761\u6ce8\u91ca\u5199\u9519\u4e86\uff0c\u5e94\u8be5\u89e6\u53d1\u68c0\u67e5\u3002'; // = 這條註解寫錯了（簡體寫法）
const SIMP_WORD_A = '\u65b0\u7684\u7e41\u4f53\u884c'; // 含「體」的簡體寫法
const SIMP_WORD_B = '\u7b2c\u4e8c\u5904\u65b0\u589e'; // 含「處」的簡體寫法
const SIMP_ONLY = '\u7e41\u4f53';
const SIMP_KW = '\u5f00\u6e90'; // 「開源」的簡體寫法
const SIMP_TABLE_ROW = '\u8868\u683c\u5167\u5bb9\uff1a\u8d25: \u6557'; // 表格內容：敗（左簡右繁）

// ── 偵測：誤報防線 ────────────────────────────────────────────────────────
test('純繁體與英數字不受回報', () => {
  assert.equal(checkLine('這支腳本把 725 個工具的 description 轉為繁體。', 1), null);
});

test('簡體字被回報，且行號與字元都正確', () => {
  const hit = checkLine(SIMP_SENTENCE, 42);
  assert.ok(hit, '應偵測到違規');
  assert.equal(hit.line, 42);
  assert.ok(hit.chars.includes('\u9519'), '應回報「錯」的簡體寫法');
  assert.ok(hit.chars.includes('\u53d1'), '應回報「發」的簡體寫法');
  assert.ok(hit.chars.includes('\u89e6'), '應回報「觸」的簡體寫法（來自 S2T_SAFE）');
});

test('歧義字（簡繁同形或一對多）絕不誤報 —— 否則門禁會被關掉', () => {
  for (const s of [
    '跨平台支援',
    '群組管理',
    '減少干擾',
    '資料漏斗',
    '只有一個後面',
    '開發工具與面試',
  ]) {
    assert.equal(checkLine(s, 1), null, `不應回報：${s}`);
  }
});

// ── 豁免機制 ──────────────────────────────────────────────────────────────
test('行內 allow-simplified 標記豁免該行，但不影響別行', () => {
  const line = `const KW = ['${SIMP_KW}']; // allow-simplified：L2 檢索關鍵字`;
  assert.equal(checkLine(line, 5), null);
  assert.notEqual(checkLine(`const OTHER = ['${SIMP_KW}'];`, 6), null);
});

test('檔頭 skip-file 標記豁免整檔所有行', () => {
  const header = '#!/usr/bin/env node\n// check-traditional: skip-file —— 本檔定義對照表';
  assert.equal(isLineExempt(SIMP_TABLE_ROW, header), true);
  assert.equal(checkLine(SIMP_TABLE_ROW, 50, header), null);
  assert.equal(isLineExempt(SIMP_TABLE_ROW, ''), false);
});

test('標記必須是明確字串，相近寫法不生效', () => {
  assert.equal(isLineExempt('allowSimplified 開關', ''), false);
  assert.equal(isLineExempt('簡繁容忍', ''), false);
});

// ── 掃描範圍 ──────────────────────────────────────────────────────────────
test('資料檔與產物目錄永不掃描', () => {
  assert.equal(isSkippedPath('registry/tools.json'), true);
  assert.equal(isSkippedPath('dist/registry/tools.json'), true);
  assert.equal(isSkippedPath('package-lock.json'), true);
  assert.equal(isSkippedPath('.temp/x.md'), true);
  assert.equal(isSkippedPath('core/search-engine.js'), false);
});

test('刻意含簡體資料的原始碼檔，靠標記保持零違規', () => {
  // 這幾支檔是「簡體字是資料」的最大案例；若有人刪掉標記，這裡會紅
  for (const f of [
    'core/classification-rules.js',
    'core/search-engine.js',
    'scripts/enrich-triggers-llm.js',
    'scripts/compile-wiki.js',
    'tests/category-guards.test.js',
    'scripts/fix-simplified.js',
  ]) {
    assert.deepEqual(scanFile(f), [], `${f} 應為 0 違規（標記或 skip-file 失效？）`);
  }
});

// ── diff 解析 ─────────────────────────────────────────────────────────────
test('parseAddedLines 只取新增行，並跟對新檔行號', () => {
  const diff = [
    'diff --git a/core/a.js b/core/a.js',
    'index 111..222 100644',
    '--- a/core/a.js',
    '+++ b/core/a.js',
    '@@ -10,2 +10 @@',
    '-舊的行',
    `+${SIMP_WORD_A}`,
    '@@ -20 +21,2 @@',
    ' 上下文行',
    `+${SIMP_WORD_B}`,
    '\\ No newline at end of file',
    'diff --git a/core/b.js b/core/b.js',
    '--- /dev/null',
    '+++ b/core/b.js',
    '@@ -0,0 +1,2 @@',
    '+第一行',
  ].join('\n');

  const added = parseAddedLines(diff);
  assert.deepEqual(
    added.map((a) => [a.path, a.line, a.text]),
    [
      ['core/a.js', 10, SIMP_WORD_A],
      ['core/a.js', 22, SIMP_WORD_B],
      ['core/b.js', 1, '第一行'],
    ],
  );
});

test('刪除行不會讓後續行號偏移', () => {
  const added = parseAddedLines(['--- a/x.js', '+++ b/x.js', '@@ -1,3 +1 @@', '-a', '-b', `+${SIMP_ONLY}`].join('\n'));
  assert.equal(added[0].line, 1);
  assert.equal(added[0].text, SIMP_ONLY);
});

// ── 綠色鎖：npm test 掛的兩條命令 ────────────────────────────────────────
test('CLI：--full --code 對原始碼目錄必須零違規', () => {
  const out = execFileSync(process.execPath, [SCRIPT, '--full', '--code'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  assert.match(out, /未發現簡體字/);
});

test('CLI：--range 對最近一次提交可正常執行（不只 exit 0，也要真的掃描到東西）', () => {
  const out = execFileSync(process.execPath, [SCRIPT, '--range', 'HEAD~1..HEAD'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  assert.match(out, /新增行/);
});

test('文件未被納入 --code，但 --full 仍抓得到（記錄 --code 排除文件的理由）', () => {
  // DEV_LOG.md 的歷史條目引用簡體字樣（記錄簡繁 bug 本身），刻意不改寫；
  // 這裡鎖住兩件事：檔案確實仍有違規（否則 --code 的理由消失），
  // 且這些違規行全部落在 docs 檔，不會因 --code 而漏掉原始碼。
  const hits = scanFile('DEV_LOG.md');
  assert.ok(hits.length > 0, 'DEV_LOG 的歷史引用應仍可被 --full 列出');
  assert.ok(hits.every((h) => typeof h.line === 'number' && h.chars.length > 0));
});
