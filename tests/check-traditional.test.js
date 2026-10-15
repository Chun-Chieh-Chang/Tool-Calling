/**
 * check-traditional.js 的迴歸測試
 *
 * 這支門禁本身有兩類風險，各由一組測試鎖住：
 *   1. **誤報**：把正確繁體判成簡體 → 工程師會直接關掉門禁，防線消失。
 *      故「歧義字必須不報」是核心契約（與 fix-simplified.js 的 S2T_SAFE 收字規則同源）。
 *   2. **漏報**：豁免機制太寬鬆，任何行加個標記就免檢 → 故標記必須是
 *      明確字串、且檔頭標記只認前 10 行。
 *   3. **假綠**：輸入被靜默丟掉（路徑不存在、副檔名不在清單、位置參數被忽略）
 *      卻照樣回報「未發現簡體字」→ 2026-10-15 第七輪 Q6=A 起「掃描 0 個檔案
 *      即失敗」，見檔尾〈假綠防線〉。**門禁最危險的失效是這一類**：前兩類至少
 *      還會吵，假綠連訊號都沒有。
 * 另有一條 **綠色鎖**：原始碼目錄整檔掃描必須 0 違規，這是 npm test 能長期
 * 掛著它的前提；哪天有人新增未標記的簡體資料行，這條會先紅。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  checkLine,
  isLineExempt,
  isSkippedPath,
  parseAddedLines,
  expandTargets,
  printFindings,
  resolveCommits,
  scanFile,
} from '../scripts/check-traditional.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = path.join(ROOT, 'scripts', 'check-traditional.js');

/** 攔下 console.log／console.error，用來直接驗 printFindings 的輸出與 exit code。 */
function captureConsole(fn) {
  const logs = [];
  const errs = [];
  const origLog = console.log;
  const origErr = console.error;
  console.log = (...a) => logs.push(a.join(' '));
  console.error = (...a) => errs.push(a.join(' '));
  let code;
  try {
    code = fn();
  } finally {
    console.log = origLog;
    console.error = origErr;
  }
  return { code, out: logs.join('\n'), err: errs.join('\n'), all: [...logs, ...errs].join('\n') };
}

/** 跑 CLI 並「要求它失敗」——門禁測試的重點是證明它真的會紅，不是證明它會跑。 */
function runCliExpectFail(args) {
  try {
    execFileSync(process.execPath, [SCRIPT, ...args], { cwd: ROOT, encoding: 'utf8' });
  } catch (e) {
    return { code: e.status, stdout: e.stdout ?? '', stderr: e.stderr ?? '' };
  }
  throw new Error(`預期門禁失敗，但它回 0 了：node scripts/check-traditional.js ${args.join(' ')}`);
}

// --range / --commits 這兩條鎖要比對 HEAD~1..HEAD，需要至少 2 筆提交的歷史。
// 淺 clone（actions/checkout 預設 fetch-depth: 1）與全新 repo 的首筆提交都沒有 HEAD~1，
// git 會報 unknown revision；這是環境限制而非門禁失效，因此無歷史時 skip（本機與
// fetch-depth >= 2 的 CI 仍照常執行）。
const NO_PARENT_SKIP = (() => {
  try {
    execFileSync('git', ['rev-parse', '--verify', '--quiet', 'HEAD~1'], { cwd: ROOT, stdio: 'ignore' });
    return false;
  } catch {
    return '無 HEAD~1（淺 clone 或首筆提交），略過需要提交歷史的測試';
  }
})();

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

test('TW 官方用法「核准」「獲准」不得被誤報（簡體把准當準的簡化字，但繁體自己會寫准）', () => {
  for (const s of ['該案已獲上級核准。', '申請已獲准，可以續辦。']) {
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

// 2026-10-15 第八輪 Q2=A：產生的知識圖譜 HTML 走路徑排除。
// 排除必須**精準**——排太寬等於把整類檔案變成盲區（那比不排除更糟）。
test('產生的知識圖譜 HTML 走路徑排除，且排除範圍不得外溢', () => {
  assert.equal(isSkippedPath('docs/knowledge-graph.html'), true, '產生檔應被排除');
  // 負向控制：只排這一個檔，同目錄其他檔與近似檔名都要照掃
  assert.equal(isSkippedPath('docs/knowledge-graph.html.bak'), false, '不可誤排同前綴的檔');
  assert.equal(isSkippedPath('docs/other.html'), false, '不可誤排同目錄其他 HTML');
  assert.equal(isSkippedPath('docs/knowledge-graph.md'), false, '不可誤排同名的 .md');
  assert.equal(isSkippedPath('other/knowledge-graph.html'), false, '不可誤排其他目錄的同名檔');
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

test('CLI：--range 對最近一次提交可正常執行（不只 exit 0，也要真的掃描到東西）', { skip: NO_PARENT_SKIP }, () => {
  const out = execFileSync(process.execPath, [SCRIPT, '--range', 'HEAD~1..HEAD'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  assert.match(out, /新增行/);
});

test('CLI：--commits 掃最近一筆 commit 的訊息 —— commit message 也必須全繁', { skip: NO_PARENT_SKIP }, () => {
  // 這是一條會「自己往前走」的鎖：每次提交後，HEAD~1..HEAD 就是剛寫的那條訊息，
  // 只要有人在 commit message 裡打簡體字（本輪就真的打進過 2 個），這裡會紅。
  const out = execFileSync(process.execPath, [SCRIPT, '--commits', 'HEAD~1..HEAD'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  assert.match(out, /commit 訊息/);
  assert.match(out, /未發現簡體字/);
});

test('CLI：--commits 不給 range 時掃「最近多筆」而不是只掃最新一筆', { skip: NO_PARENT_SKIP }, () => {
  // 這一條鎖的就是第八輪那個取捨的破口：當時預設範圍是 HEAD~1..HEAD，一次推好幾筆時
  // 較舊的 commit 訊息根本沒被看。現在預設改為名額制（最近 5 筆可達提交）。
  const out = execFileSync(process.execPath, [SCRIPT, '--commits'], { cwd: ROOT, encoding: 'utf8' });
  const m = out.match(/，(\d+) 筆/);
  assert.ok(m, `label 應帶「，N 筆」實際掃描筆數，實際輸出：${out.split('\n')[0]}`);
  const scanned = Number(m[1]);
  assert.ok(scanned >= 2, `不給 range 應該掃到多筆（實測 ${scanned} 筆）——只掃 1 筆就是那個破口還在`);
  assert.ok(scanned <= 5, `不應超過名額 5 筆（實測 ${scanned}）`);
  assert.match(out, /未發現簡體字/);
});

test('CLI：range 在淺歷史解析不了時降級，而不是擲出 unknown revision 堆疊', () => {
  // CI 是 fetch-depth: 2。若有人在鏈裡寫 HEAD~5..HEAD 這類超出可達深度的 range，
  // execFileSync 原本會直接 throw（門禁從「會擋」退化成「會炸」）——這裡鎖住降級路徑。
  const out = execFileSync(process.execPath, [SCRIPT, '--commits', 'HEAD~100000..HEAD'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  assert.match(out, /降級/);
  assert.match(out, /commit 訊息/);
});

test('resolveCommits：auto 的最後一筆必須就是 HEAD（證明名額制沒有漏掉剛提交的訊息）', { skip: NO_PARENT_SKIP }, () => {
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
  const { hashes } = resolveCommits('auto');
  assert.equal(hashes[0], head);
});

test('文件未被納入 --code，但 --full 仍抓得到（記錄 --code 排除文件的理由）', () => {
  // DEV_LOG.md 的歷史條目引用簡體字樣（記錄簡繁 bug 本身），刻意不改寫；
  // 這裡鎖住兩件事：檔案確實仍有違規（否則 --code 的理由消失），
  // 且這些違規行全部落在 docs 檔，不會因 --code 而漏掉原始碼。
  const hits = scanFile('DEV_LOG.md');
  assert.ok(hits.length > 0, 'DEV_LOG 的歷史引用應仍可被 --full 列出');
  assert.ok(hits.every((h) => typeof h.line === 'number' && h.chars.length > 0));
});

test('產生式資料檔的 skip-file 標記：檔頭要有、產生器模板也要有（否則重產就消失）', () => {
  // core/synonyms.generated.js 的同義詞鍵刻意收簡體寫法（簡體查詢要靠它命中）。
  // 兩件事必須一起鎖：現檔有標記（前 10 行內，門禁只認那裡）、產生器模板也有標記。
  // 只鎖現檔的話，下次 `node scripts/mine-synonyms.js` 一重產就把標記洗掉，
  // 而那時候門禁會因為表外字形照樣全綠——連「哪天開始擋」都不會有訊號。
  const data = readFileSync(path.join(ROOT, 'core/synonyms.generated.js'), 'utf8').split('\n').slice(0, 10).join('\n');
  const gen = readFileSync(path.join(ROOT, 'scripts/mine-synonyms.js'), 'utf8');
  assert.ok(data.includes('check-traditional: skip-file'), '資料檔檔頭需有 skip-file');
  assert.ok(gen.includes('check-traditional: skip-file'), '產生器模板需內嵌同一個標記字串');
  assert.equal(scanFile('core/synonyms.generated.js').length, 0, '標記生效：該檔整檔掃描為 0');
});

// ── 路徑展開：目錄也是合法輸入 ───────────────────────────────────────────
// 這組鎖的是一個真實崩潰：`--full docs/` 過去把目錄字串直接交給 readFileSync，
// 結果不是退出碼 1 而是 uncaught EISDIR。目錄寫法太直覺，必須能遞迴。
test('expandTargets：目錄遞迴展開成檔案清單，不外溢、不含跳過路徑', () => {
  const files = expandTargets(['scripts/']);
  assert.ok(files.length > 10, `scripts/ 應展開出數十支檔，實得 ${files.length}`);
  assert.ok(files.includes('scripts/check-traditional.js'));
  assert.ok(files.every((f) => f.startsWith('scripts/')), '不應溢出到其他目錄');
  assert.ok(files.every((f) => !isSkippedPath(f)), '跳過路徑不可出現');
});

test('expandTargets：目錄與檔案混給；跳過目錄與鎖檔仍被擋', () => {
  const files = expandTargets(['.agents/', 'registry/tools.json', 'package-lock.json']);
  assert.ok(files.includes('.agents/AGENTS.md'), '.agents/ 應遞迴到根那支 AGENTS.md');
  assert.ok(!files.some((f) => f.startsWith('registry/')), 'registry/ 應被 isSkippedPath 擋掉');
  assert.ok(!files.includes('package-lock.json'), '鎖檔永不掃描');
});

test('expandTargets：不存在的路段只跳過，不拖累同批其他路徑', () => {
  assert.deepEqual(
    expandTargets(['no-such-dir/', 'scripts/check-traditional.js']),
    ['scripts/check-traditional.js'],
  );
});

test('CLI：--full 給目錄能跑完（防 EISDIR 復發）', () => {
  const out = execFileSync(process.execPath, [SCRIPT, '--full', 'scripts/'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  assert.match(out, /整檔掃描 \d+ 個檔案/);
  assert.match(out, /未發現簡體字/);
});

// ── 假綠防線：掃描 0 個檔案必須失敗（2026-10-15 第七輪 Q6=A／HANDOFF 陷阱 27）──
// 這組鎖的是門禁最危險的失效：輸入被靜默丟掉，卻照樣印「未發現簡體字」。
// 真實案例是把 commit 訊息匯出成 .txt 再餵進 --full，得到「掃描 0 個檔案 ＋ exit 0」。
test('printFindings：不允許空掃時，掃描 0 個檔案必須回 1，且不得印出通過字樣', () => {
  const r = captureConsole(() => printFindings([], '整檔掃描 0 個檔案', 0, { allowEmptyScan: false }));
  assert.equal(r.code, 1, '掃描 0 個檔案不能算通過');
  assert.ok(!r.all.includes('未發現簡體字'), '空掃描不可印出「未發現簡體字」——那正是假綠的來源');
  assert.ok(r.err.includes('掃描 0 個檔案'), '要明講掃到 0 個檔案，並走 stderr');
});

test('printFindings：diff 模式的合法空掃描回 0，但訊息是「無事可檢」而非「通過」', () => {
  // 乾淨工作區沒有新增行可檢，判失敗會讓 npm test 在乾淨樹上直接紅；
  // 但也不能假裝通過——所以兩者用不同句子區分。
  const r = captureConsole(() => printFindings([], '新增行（vs HEAD，含未追蹤檔全文）', 0, { allowEmptyScan: true }));
  assert.equal(r.code, 0);
  assert.ok(r.all.includes('無事可檢'));
  assert.ok(!r.all.includes('未發現簡體字'), '「無事可檢」不可寫成「未發現簡體字」');
});

test('printFindings：真的掃了 N 個檔案且乾淨 → 回 0 並印出實際掃描量', () => {
  const r = captureConsole(() => printFindings([], '整檔掃描 51 個檔案', 51));
  assert.equal(r.code, 0);
  assert.ok(r.all.includes('未發現簡體字'));
  assert.ok(r.all.includes('掃描 51 個檔案'), '印出實際掃描量，才分得出「掃很多」與「掃 0 個」');
});

test('CLI：--full 指定沒有可掃副檔名的檔案必須失敗（陷阱 27 的原始情境）', () => {
  // .gitignore 確實存在、但 .gitignore 不在 SCAN_EXTENSIONS 內 → 舊行為是靜默通過。
  const r = runCliExpectFail(['--full', '.gitignore']);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /掃描 0 個檔案/);
});

test('CLI：--full 指定不存在的路徑必須失敗，而不是靜默通過', () => {
  const r = runCliExpectFail(['--full', 'no-such-file.md']);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /掃描 0 個檔案/);
});

test('CLI：--full 指向整條被 isSkippedPath 排除的目錄必須失敗', () => {
  const r = runCliExpectFail(['--full', 'registry/']);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /掃描 0 個檔案/);
});

test('CLI：位置參數在預設模式會被當成整檔掃描目標（不再默默忽略）', () => {
  // 舊行為：`check-traditional.js foo.js` 只跑 diff 模式，位置參數被丟掉——
  // 使用者以為檢查了 foo.js，其實沒有。現在升級為整檔掃描。
  const out = execFileSync(process.execPath, [SCRIPT, 'scripts/check-traditional.js'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  assert.match(out, /整檔掃描 1 個檔案/);
  assert.match(out, /未發現簡體字/);
});
