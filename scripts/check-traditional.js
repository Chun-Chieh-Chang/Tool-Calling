#!/usr/bin/env node
/**
 * check-traditional.js — 繁體中文（TW）書寫門禁
 *
 * 為什麼需要這支腳本
 * ──────────────────
 * 本專案的中文欄位契約是「英文供檢索、*_zh 供繁體顯示」，開發者寫的
 * 註解／log／文件也應全用繁體。但簡體字一直是靠人工發現後逐批修正
 * （2026-09-19 補 triggers、2026-09-25 補註解與 log），沒有常態檢查就會復發。
 *
 * 偵測器直接沿用 fix-simplified.js 的 findSimplified()：那是專案內唯一的
 * 「什麼算簡體字」來源（主表 S2T ＋ 無歧義補充表 S2T_SAFE）。它刻意保守
 * （簡繁同形字不報、歧義字 台/干/后/復… 不報），所以不會把「跨平台」
 * 「減少干擾」這類正確繁體誤判成違規。
 *
 * 三種範圍 ＋ 一個範圍選項
 * ───────────────────────
 *   （預設）       檢查相對 HEAD 的新增行 ＋ 未追蹤檔全文 → 抓剛寫出來的瑕疵
 *   --range <rev>  改比對指定 git 範圍，例：--range HEAD~5..HEAD
 *   --full [路徑]  整檔掃描（不給路徑＝所有原始碼與文件）→ 最嚴格
 *   --commits <r>  掃 commit 範圍的訊息（git log 也是專案內長期留存的文字）
 *   --code         通用範圍選項：只留 core/ scripts/ web/ tests/
 *
 * npm test 跑的兩條：預設模式（文件的新增行也在內）＋ `--full --code`。
 * 文件不進 `--code` 的理由：DEV_LOG／HANDOFF／docs 裡殘留的簡體字**全部**是
 * 「引用簡體 bug 本身」的歷史文字（節錄的簡體分類名、簡體字形對照等），
 * 改了等於塗掉紀錄；但它們的新增行仍受預設模式管轄。
 *
 * 豁免機制（刻意引用簡體字的情況）
 * ──────────────────────────────
 * 有些簡體字是**資料**而非書寫瑕疵：檢索關鍵字（core/search-engine.js 收了
 * open-source 的簡體寫法）、分類正字串、測試 fixture。這些行用行內標記豁免：
 *     const KW = ['⋯⋯'];   // allow-simplified：L2 檢索關鍵字，轉了會查不到
 * 整個檔案都是對照表的（如 fix-simplified.js 本體）改用檔頭標記：
 *     // check-traditional: skip-file —— 本檔定義簡繁對照表
 * 標記寫在被豁免的檔案裡，會出現在 diff 中，因此豁免本身可稽核。
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findSimplified, usingOpenCC } from './fix-simplified.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const LINE_ESCAPE = 'allow-simplified';
const FILE_ESCAPE = 'check-traditional: skip-file';

// 繁體官方用語本身就會這樣寫的字，額外從報警名單排除。
// 「准」在簡體是「準」的簡化字，但 TW 公文寫「核准」「獲准」——沿用
// fix-simplified 的主表會把它報成簡體，屬於誤報。門禁的原則是一定不能誤報：
// 一旦誤報，開發者就會把門禁關掉。
const GATE_AMBIGUOUS = new Set(['准']);

// 整檔豁免的目錄／檔案：資料檔（工具庫本身含刻意收錄的簡體檢索詞）與
// 巨檔（打包產物、依賴），掃描它們只會產生噪音。
const SKIP_PATH_PATTERNS = [
  /^registry\//,
  /^dist\//,
  /^node_modules\//,
  /^package-lock\.json$/,
  /^\.temp\//,
];

// --full 的副檔名範圍
const SCAN_EXTENSIONS = ['.js', '.mjs', '.cjs', '.ts', '.md', '.html', '.json'];

// --code 只限縮到原始碼目錄：這裡的簡體字會**靜默破壞檢索與測試**，
// 因此必須常年維持零違規。文件（DEV_LOG／HANDOFF／docs／README）裡殘留的
// 簡體字全是「引用簡體 bug 本身」的歷史文字，屬於刻意內容，不列入門禁。
const CODE_PATH = /^(core|scripts|web|tests)\//;

/** true 表示該路徑屬於資料檔／產物，任何模式都不掃。 */
export function isSkippedPath(relPath) {
  return SKIP_PATH_PATTERNS.some((re) => re.test(relPath));
}

/** 回傳該行是否已被豁免（行內標記，或檔頭 skip-file 標記）。 */
export function isLineExempt(lineText, fileHeader = '') {
  if (fileHeader.includes(FILE_ESCAPE)) return true;
  return lineText.includes(LINE_ESCAPE);
}

/**
 * 對單行找簡體字違規。
 * @returns {{line: number, chars: string[], text: string} | null}
 */
export function checkLine(lineText, lineNumber, fileHeader = '') {
  if (isLineExempt(lineText, fileHeader)) return null;
  const chars = findSimplified(lineText).filter((ch) => !GATE_AMBIGUOUS.has(ch));
  return chars.length ? { line: lineNumber, chars, text: lineText } : null;
}

function fileHeaderOf(text) {
  return text.split('\n').slice(0, 10).join('\n');
}

/** 整檔掃描：回傳所有違規行。 */
export function scanFile(relPath) {
  const fullPath = path.join(ROOT, relPath);
  if (!existsSync(fullPath)) return [];
  const text = readFileSync(fullPath, 'utf8');
  const header = fileHeaderOf(text);
  const hits = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const hit = checkLine(lines[i], i + 1, header);
    if (hit) hits.push(hit);
  }
  return hits;
}

/** 解析 unified diff，取出新增行的「檔名／新檔行號／內容」。 */
export function parseAddedLines(diffText) {
  const added = [];
  let file = null;
  let newLine = 0;
  for (const raw of diffText.split('\n')) {
    if (raw.startsWith('+++ b/')) {
      file = raw.slice(6);
      continue;
    }
    if (raw.startsWith('@@')) {
      const m = /@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(raw);
      newLine = m ? Number(m[1]) : 0;
      continue;
    }
    if (raw.startsWith('\\')) continue; // "\ No newline at end of file"
    if (raw.startsWith('-')) continue; // 刪除行不影響新檔行號
    if (raw.startsWith('+')) {
      if (file && !file.endsWith('/dev/null')) added.push({ path: file, text: raw.slice(1), line: newLine });
      newLine++;
      continue;
    }
    newLine++; // 上下文行
  }
  return added;
}

function git(args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

function matchExt(p) {
  return SCAN_EXTENSIONS.includes(path.extname(p).toLowerCase());
}

// 掃描範圍一律含未追蹤檔：新檔在入庫前就該合格，否則要等到 --full 才被抓到。
function listSources() {
  const files = [...git(['ls-files']).split('\n'), ...listUntracked()];
  return [...new Set(files)].filter((p) => p && !isSkippedPath(p) && matchExt(p));
}

function listUntracked() {
  return git(['ls-files', '--others', '--exclude-standard']).split('\n').filter((p) => p && !isSkippedPath(p) && matchExt(p));
}

/** diff 模式：只檢查新增行。檔頭標記可能在本次未改動的前 10 行，需另從工作樹補讀。 */
function runDiffMode(ref) {
  const diffText = git(['diff', ref, '--unified=0', '--no-color']);
  const findings = [];
  const seenHeader = new Map();

  for (const { path: p, text, line } of parseAddedLines(diffText)) {
    if (isSkippedPath(p)) continue;
    let header = seenHeader.get(p);
    if (header === undefined) {
      // 檔頭標記可能位於本次未新增的前 10 行，需從工作樹補讀
      const full = existsSync(path.join(ROOT, p)) ? readFileSync(path.join(ROOT, p), 'utf8') : '';
      header = fileHeaderOf(full);
      seenHeader.set(p, header);
    }
    const hit = checkLine(text, line, header);
    if (hit) findings.push({ path: p, ...hit });
  }

  // 未追蹤檔整份都是新增內容，diff 看不到，必須另外掃
  for (const p of listUntracked()) {
    for (const hit of scanFile(p)) findings.push({ path: p, ...hit });
  }
  return findings;
}

/**
 * commit 訊息模式：掃 range 內每筆 commit 的 subject ＋ body。
 *
 * 為什麼也要管：commit message 同屬「本專案用的中文字」，而且 git log 是長期
 * 紀錄。本輪實測踩到——程式碼與 DEV_LOG 全綠之後，commit 訊息裡仍有兩個瑕疵：
 * 一個動詞的簡體寫法（掛）與「檢索」二字的簡體寫法，都是書寫層面的手誤。
 *
 * commit 訊息**沒有**豁免機制（歷史不應塗改），所以引用簡體字形時改用描述
 * 寫法（例如把簡體的「明確」寫成繁體再加註說明），不要把簡體字本身打進去。
 */
function runCommitsMode(range) {
  const hashes = git(['rev-list', range]).trim().split('\n').filter(Boolean);
  const findings = [];
  for (const h of hashes) {
    const short = h.slice(0, 7);
    const body = git(['log', '-1', '--format=%B', h]);
    body.split('\n').forEach((line, i) => {
      const hit = checkLine(line, i + 1, '');
      if (hit) findings.push({ path: `commit ${short}`, ...hit });
    });
  }
  return { findings, label: `commit 訊息（${range}，${hashes.length} 筆）` };
}

function parseArgv(argv) {
  const opts = { mode: 'diff', ref: 'HEAD', paths: [], codeOnly: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--full') opts.mode = 'full';
    else if (a === '--commits') { opts.mode = 'commits'; opts.ref = argv[++i] ?? 'HEAD~1..HEAD'; }
    else if (a === '--code') opts.codeOnly = true;
    else if (a === '--range') { opts.ref = argv[++i] ?? 'HEAD'; }
    else if (a === '--help' || a === '-h') opts.help = true;
    else opts.paths.push(a);
  }
  return opts;
}

function usage() {
  console.log(`用法：node scripts/check-traditional.js [選項] [路徑...]

  （無選項）        檢查相對 HEAD 的新增行 ＋ 未追蹤檔（預設）
  --range <ref>     檢查指定 git 範圍的新增行，例：--range HEAD~5..HEAD
  --full [路徑...]  整檔掃描（不給路徑＝所有原始碼與文件）
  --commits <range> 掃 range 內每筆 commit 的訊息（歷史無豁免）
  --code            只限 core/ scripts/ web/ tests/（不含文件與資料檔）

豁免：行內 \`// ${LINE_ESCAPE}：原因\`；檔頭 \`// ${FILE_ESCAPE}\``);
}

function printFindings(findings, modeLabel) {
  console.log(`🔍 [Traditional Guard] 偵測器：內建對照表（opencc ${usingOpenCC() ? '已啟用' : '未安裝，走備援'}）｜範圍：${modeLabel}`);

  if (findings.length === 0) {
    console.log('✅ [Traditional Guard] 未發現簡體字，中文書寫皆為繁體');
    return 0;
  }

  const charCount = findings.reduce((n, f) => n + f.chars.length, 0);
  console.error(`❌ [Traditional Guard] ${findings.length} 行含 ${charCount} 個簡體字，請改用繁體中文（TW）：`);
  let lastPath = null;
  for (const f of findings) {
    if (f.path !== lastPath) {
      console.error(`\n  ── ${f.path}`);
      lastPath = f.path;
    }
    const preview = f.text.trim().slice(0, 72);
    console.error(`     L${f.line}  [${[...new Set(f.chars)].join(' ')}]  ${preview}`);
  }
  console.error(`\n   若該行的簡體字是刻意保留的資料（檢索關鍵字／測試 fixture），加行內標記：// ${LINE_ESCAPE}：原因`);
  return 1;
}

function main() {
  const opts = parseArgv(process.argv.slice(2));
  if (opts.help) {
    usage();
    return 0;
  }

  let findings = [];
  let modeLabel = '';
  if (opts.mode === 'full') {
    let targets = opts.paths.length ? opts.paths.filter((p) => !isSkippedPath(p)) : listSources();
    if (opts.codeOnly) targets = targets.filter((p) => CODE_PATH.test(p));
    for (const p of targets) findings.push(...scanFile(p).map((h) => ({ path: p, ...h })));
    modeLabel = `整檔掃描 ${targets.length} 個檔案${opts.codeOnly ? '（僅原始碼）' : ''}`;
  } else if (opts.mode === 'commits') {
    const r = runCommitsMode(opts.ref);
    findings = r.findings;
    modeLabel = r.label;
  } else {
    findings = runDiffMode(opts.ref);
    if (opts.codeOnly) findings = findings.filter((f) => CODE_PATH.test(f.path));
    modeLabel = `新增行（vs ${opts.ref}，含未追蹤檔全文）`;
  }
  return printFindings(findings, modeLabel);
}

// isDirect 守衛：讓 tests/ 能匯入 scanFile / checkLine / parseAddedLines 而不觸發掃描
const isDirect = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirect) process.exit(main());
