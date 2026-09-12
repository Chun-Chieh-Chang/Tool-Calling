/**
 * sync-categories.js — 從 registry/categories.json 產生所有衍生檔
 *
 * 背景：2026-09-12 審計發現 18 個分類散落在 5 個以上位置、靠人工同步，
 * 一天內出現 4 次脫節（簡繁不符、schema enum 過期、色表缺漏重複、LLM prompt 過期）。
 *
 * 本腳本負責「靜態衍生檔」的產生；執行期消費端（classifier、knowledge-graph、rescan）
 * 則直接經由 core/categories.js 讀取，不需要產生。
 *
 * 產生目標：
 *   1. registry/schemas/tool.schema.json  → category enum
 *   2. docs/CLASSIFICATION.md             → §2.1 領域關鍵詞表（標記區塊內）
 *   3. docs/CATEGORY-SYSTEM.md            → 分類清單與數量（標記區塊內）
 *
 * 為什麼第 3 項也要產生：該表的數字在專案歷史上至少人工修正過 5 次
 * （DEV_LOG 可見 483/21 類 → 474/21 類 → 538/21 類 → 585/22 類 → 680/18 類 → 695/19 類），
 * 每次都是同一種腐化。改為產生後，這類漂移在結構上不可能再發生。
 *
 * 用法：
 *   node scripts/sync-categories.js          # 寫入
 *   node scripts/sync-categories.js --check  # 只檢查是否同步（CI 用，不同步則 exit 1）
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { categoryList, CATEGORIES_PATH } from '../core/categories.js';

const ROOT = join(import.meta.dirname, '..');
const SCHEMA_PATH = join(ROOT, 'registry', 'schemas', 'tool.schema.json');
const TOOLS_PATH = join(ROOT, 'registry', 'tools.json');
const CLASSIFICATION_MD = join(ROOT, 'docs', 'CLASSIFICATION.md');
const CATEGORY_SYSTEM_MD = join(ROOT, 'docs', 'CATEGORY-SYSTEM.md');
const CHECK_ONLY = process.argv.includes('--check');

const KW_START = '<!-- CATEGORIES:KEYWORDS:START -->';
const KW_END = '<!-- CATEGORIES:KEYWORDS:END -->';
const INV_START = '<!-- CATEGORIES:INVENTORY:START -->';
const INV_END = '<!-- CATEGORIES:INVENTORY:END -->';

const cats = categoryList();
const names = cats.map(c => c.name);
let changes = 0;

/** 在標記區塊內寫入衍生內容。回傳 'ok' | 'changed' | 'error' */
function syncBlock({ label, filePath, start, end, build }) {
  const raw = readFileSync(filePath, 'utf8');
  const s = raw.indexOf(start);
  const e = raw.indexOf(end);
  if (s === -1 || e === -1) {
    console.error(`【${label}】找不到標記 ${start} / ${end}，無法產生。`);
    return 'error';
  }
  const block = build();
  if (raw.slice(s, e + end.length) === block) {
    console.log(`【${label}】已同步`);
    return 'ok';
  }
  console.log(`【${label}】不一致`);
  if (!CHECK_ONLY) {
    writeFileSync(filePath, raw.slice(0, s) + block + raw.slice(e + end.length), 'utf8');
    console.log(`  ✅ 已寫入 ${filePath.replace(ROOT, '.')}`);
  }
  return 'changed';
}

const escapeCell = s => String(s).replace(/\|/g, '\\|');

// ─── 1. schema enum ────────────────────────────────────────────────────────
const schemaRaw = readFileSync(SCHEMA_PATH, 'utf8');
const schema = JSON.parse(schemaRaw);
const before = schema.definitions.Tool.properties.category.enum;
const sameEnum = before.length === names.length && before.every((v, i) => v === names[i]);

if (!sameEnum) {
  console.log(`【schema enum】不一致`);
  console.log(`  舊 (${before.length}): ${before.join(', ')}`);
  console.log(`  新 (${names.length}): ${names.join(', ')}`);
  if (!CHECK_ONLY) {
    schema.definitions.Tool.properties.category.enum = names;
    writeFileSync(SCHEMA_PATH, JSON.stringify(schema, null, 2) + '\n', 'utf8');
    console.log(`  ✅ 已寫入 ${SCHEMA_PATH.replace(ROOT, '.')}`);
  }
  changes++;
} else {
  console.log(`【schema enum】已同步（${names.length} 個分類）`);
}

// ─── 2. CLASSIFICATION.md §2.1 領域關鍵詞表 ─────────────────────────────────
const r1 = syncBlock({
  label: 'CLASSIFICATION.md',
  filePath: CLASSIFICATION_MD,
  start: KW_START,
  end: KW_END,
  build: () => {
    const rows = cats.map(c => {
      const kw = (c.keywords && c.keywords.length)
        ? c.keywords.map(k => '`' + escapeCell(k) + '`').join(' ')
        : '—（無關鍵詞：靠結構性規則或語意判斷，見 §2 步驟 1–6）';
      return `| \`${c.name}\` | \`${c.color}\` | ${kw} |`;
    });
    return [
      KW_START,
      '> 本表由 `registry/categories.json` 自動產生，**請勿手改**。修改請執行 `npm run categories:sync`。',
      '',
      '| 分類 | 色碼 | 信號關鍵詞（正規表達式片段） |',
      '|---|---|---|',
      ...rows,
      KW_END,
    ].join('\n');
  },
});
if (r1 === 'changed') changes++;
if (r1 === 'error') process.exitCode = 1;

// ─── 3. CATEGORY-SYSTEM.md 分類清單與數量 ──────────────────────────────────
const toolsFile = JSON.parse(readFileSync(TOOLS_PATH, 'utf8'));
const tools = toolsFile.tools || toolsFile;
const counts = {};
for (const t of tools) counts[t.category] = (counts[t.category] || 0) + 1;

const r2 = syncBlock({
  label: 'CATEGORY-SYSTEM.md',
  filePath: CATEGORY_SYSTEM_MD,
  start: INV_START,
  end: INV_END,
  build: () => {
    const sorted = [...cats].sort(
      (a, b) => (counts[b.name] || 0) - (counts[a.name] || 0) || a.name.localeCompare(b.name, 'zh-Hant')
    );
    const rows = sorted.map(c => `| \`${c.name}\` | ${counts[c.name] || 0} | ${escapeCell(c.definition)} |`);
    return [
      INV_START,
      '> 本表由 `registry/tools.json` ＋ `registry/categories.json` 自動產生，**請勿手改**。',
      '> 修改分類請改 `categories.json`，再執行 `npm run categories:sync`。',
      '',
      '| 分類 | 數量 | 定義 |',
      '|---|---:|---|',
      ...rows,
      '',
      `**合計**: ${tools.length} 個工具, ${cats.length} 個分類, 無「其他」殘留（MECE 強制 100% 覆蓋）。`,
      INV_END,
    ].join('\n');
  },
});
if (r2 === 'changed') changes++;
if (r2 === 'error') process.exitCode = 1;

// ─── 結果 ──────────────────────────────────────────────────────────────────
if (CHECK_ONLY) {
  if (changes > 0) {
    console.error(`\n✗ 有 ${changes} 個衍生檔與 categories.json 不同步。請執行：npm run categories:sync`);
    process.exitCode = 1;
  } else {
    console.log('\n✓ 所有衍生檔都與 categories.json 同步。');
  }
} else {
  console.log(changes > 0
    ? `\n✅ 已同步 ${changes} 個衍生檔（來源：${CATEGORIES_PATH.replace(ROOT, '.')}）`
    : `\n✅ 無需變更，所有衍生檔都是最新的。`);
}
