/**
 * skill-discovery 單元測試（完全無外部依賴）
 *
 * 為什麼需要這個檔案：
 *   tests/find-skill.test.js 與 tests/skill-discovery.test.js 全部都是整合測試
 *   （真的呼叫 `npx skills` 與 GitHub API），預設已被跳過。若只把它們跳過而不補，
 *   等於用「不穩定的覆蓋率」換「零覆蓋率」。本檔補上**可重複、無副作用**的覆蓋：
 *     1. parseSkillOutput —— 純函式解析，CLI 輸出格式的第一道防線
 *     2. searchSkills 的快取短路 —— 這條路徑是「不呼叫外部 CLI」的關鍵，
 *        也正是能避免 npx 快取被 churn 的原因
 *
 * 隔離方式：在 import skill-discovery 之前把 HOME/USERPROFILE 指向暫存目錄。
 *   該模組在載入時就把 CACHE_DIR 固定為 homedir()/.tool-calling/skills-cache，
 *   所以必須先改環境變數再 import，才能完全不碰使用者真實的快取。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// ─── 隔離：必須在動態 import 之前完成 ────────────────────────────────────────

const TMP_HOME = mkdtempSync(join(tmpdir(), 'tc-skill-home-'));
process.env.USERPROFILE = TMP_HOME;
process.env.HOME = TMP_HOME;

const TMP_CACHE_DIR = join(TMP_HOME, '.tool-calling', 'skills-cache');
const TMP_CACHE_FILE = join(TMP_CACHE_DIR, 'skills.json');

// ─── parseSkillOutput ────────────────────────────────────────────────────────

test('parseSkillOutput：解析 `owner/repo@skill  N installs  描述` 格式', async () => {
  const { parseSkillOutput } = await import('../core/skill-discovery.js');

  // 第 2 行是回歸鎖：舊 regex 用 `\w+/\w+`，會把 `vercel-labs/skills@react`
  // 靜默截斷成 `labs/skills@react`（錯誤的 id 與 URL）。GitHub 上大量 owner
  // 都含連字號，因此這不是邊緣案例。
  const output = [
    'anthropics/skills@pdf  12345 installs  Extract text from PDF files',
    'vercel-labs/skills@react  678 installs  React best practices',
  ].join('\n');

  const results = parseSkillOutput(output);

  assert.equal(results.length, 2, '應解析出 2 筆');
  assert.equal(results[0].id, 'anthropics/skills@pdf');
  assert.equal(results[0].name, 'pdf', 'name 應取 @ 之後的片段');
  assert.equal(results[0].source, 'skills.sh');
  assert.equal(results[0].url, 'https://skills.sh/anthropics/skills@pdf');
  assert.ok(results[0].description.includes('Extract text'), '描述應保留');

  assert.equal(
    results[1].id,
    'vercel-labs/skills@react',
    '含連字號的 owner 不得被截斷（回歸鎖）'
  );
  assert.equal(results[1].name, 'react');
  assert.equal(results[1].url, 'https://skills.sh/vercel-labs/skills@react');
});

test('parseSkillOutput：忽略不符合格式的雜訊行', async () => {
  const { parseSkillOutput } = await import('../core/skill-discovery.js');

  const output = [
    'Searching for "pdf"...',
    '',
    'anthropics/skills@pdf  12345 installs  Extract text',
    'Found 1 skill',
    'this line has no id and no install count',
  ].join('\n');

  const results = parseSkillOutput(output);

  assert.equal(results.length, 1, '只有 1 行符合格式，其餘必須被忽略');
  assert.equal(results[0].id, 'anthropics/skills@pdf');
});

test('parseSkillOutput：空輸入回傳空陣列而非拋錯', async () => {
  const { parseSkillOutput } = await import('../core/skill-discovery.js');
  assert.deepEqual(parseSkillOutput(''), []);
});

test('parseSkillOutput：尊重 SKILL_LIMIT 截斷結果', async () => {
  const { parseSkillOutput } = await import('../core/skill-discovery.js');

  const output = Array.from({ length: 5 }, (_, i) =>
    `owner/repo@skill${i}  ${100 + i} installs  desc ${i}`
  ).join('\n');

  const prev = process.env.SKILL_LIMIT;
  process.env.SKILL_LIMIT = '2';
  try {
    assert.equal(parseSkillOutput(output).length, 2, 'SKILL_LIMIT=2 時應只回 2 筆');
  } finally {
    if (prev === undefined) delete process.env.SKILL_LIMIT;
    else process.env.SKILL_LIMIT = prev;
  }
});

// ─── searchSkills 快取短路 ───────────────────────────────────────────────────

test('searchSkills：快取命中時直接回傳，不呼叫外部 CLI', async () => {
  const MARKER_ID = 'injected-owner/injected-repo@cache-marker';
  mkdirSync(TMP_CACHE_DIR, { recursive: true });
  writeFileSync(
    TMP_CACHE_FILE,
    JSON.stringify({
      'pdf_3': {
        results: [{
          id: MARKER_ID,
          name: 'cache-marker',
          url: 'https://skills.sh/injected-owner/injected-repo@cache-marker',
          source: 'skills.sh',
          description: 'injected by unit test',
        }],
        timestamp: Date.now(),
      },
    }),
    'utf8'
  );

  const { searchSkills } = await import('../core/skill-discovery.js');
  const results = searchSkills('pdf', 3);

  assert.equal(results.length, 1, '應命中快取並回傳 1 筆');
  assert.equal(
    results[0].id,
    MARKER_ID,
    '回傳的必須是注入的快取值 —— 外部 CLI 不可能產出這個 id，' +
    '因此可證明此路徑完全沒有 shell out（也就不會 churn npx 快取）'
  );
});

// 註：快取「過期」的路徑（timestamp > 1 小時）會落到 execSync 呼叫 npx，
// 無法在此保持無外部依賴，因此不在本檔測試 —— 該行為屬整合測試範疇。

// ─── 清理 ────────────────────────────────────────────────────────────────────

test.after(() => {
  rmSync(TMP_HOME, { recursive: true, force: true });
});
