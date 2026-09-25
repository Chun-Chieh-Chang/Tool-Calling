/**
 * tool-lifecycle.test.js — experimental → active 轉換的迴歸測試
 *
 * 為什麼要有這組測試（2026-09-25）
 * ────────────────────────────────
 * 升級判斷原本在 CLI、Web、批次 enrich、批次 translate 四處各寫一份，
 * translate-to-zh.js 那站漏掉後，欄位齊全的工具會**永久卡在 experimental**
 * （誰も不再撿它）。四份複製邏輯只要有一份漂移就會再出現死區，
 * 所以轉換收斂成 core/tool-lifecycle.js 的 activateIfComplete()，並由本檔鎖住行為。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { activateIfComplete } from '../core/tool-lifecycle.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// 已補齊的基準物件（isFullyEnriched() 的四個條件齊全）
const COMPLETE = {
  id: 'x',
  description: 'A tool that does X',
  useCase: 'A developer needs to do X on a large dataset',
  advantages: ['Handles datasets larger than memory'],
  description_zh: '一個做 X 的工具',
  useCase_zh: '開發者需要在大型資料集上做 X',
  status: 'experimental',
};

test('activateIfComplete: 欄位齊全的 experimental 升級為 active 並回傳 true', () => {
  const tool = { ...COMPLETE };
  assert.equal(activateIfComplete(tool), true);
  assert.equal(tool.status, 'active');
});

test('activateIfComplete: 欄位不齊時維持 experimental 並回傳 false', () => {
  // 缺繁中譯文（translate 階段還沒跑）——正是當初卡住的真實情境
  const noZh = { ...COMPLETE, description_zh: '' };
  assert.equal(activateIfComplete(noZh), false);
  assert.equal(noZh.status, 'experimental');

  // useCase 只是 description 的複製品（掃描階段的形狀）
  const copied = { ...COMPLETE, useCase: COMPLETE.description };
  assert.equal(activateIfComplete(copied), false);
  assert.equal(copied.status, 'experimental');

  // advantages 空陣列
  const noAdv = { ...COMPLETE, advantages: [] };
  assert.equal(activateIfComplete(noAdv), false);
  assert.equal(noAdv.status, 'experimental');
});

test('activateIfComplete: 重複呼叫冪等，不會把 active 降回或再升級', () => {
  const tool = { ...COMPLETE };
  assert.equal(activateIfComplete(tool), true);
  // 第二次（例如另一個管線站點又跑一次）不應回報升級，也不應動到狀態
  assert.equal(activateIfComplete(tool), false);
  assert.equal(tool.status, 'active');
});

test('activateIfComplete: 已存在的 active／deprecated／archived 一律不改狀態', () => {
  for (const status of ['active', 'deprecated', 'archived']) {
    const tool = { ...COMPLETE, status };
    assert.equal(activateIfComplete(tool), false, `status=${status} 不應回報升級`);
    assert.equal(tool.status, status, `status=${status} 必須維持原值`);
  }
});

test('activateIfComplete: 不要求 capabilities（195 支既有工具沒有也不該被擋）', () => {
  const tool = { ...COMPLETE, capabilities: undefined };
  assert.equal(activateIfComplete(tool), true);
});

test('activateIfComplete: null／undefined 不拋錯', () => {
  assert.equal(activateIfComplete(null), false);
  assert.equal(activateIfComplete(undefined), false);
  assert.equal(activateIfComplete({}), false);
});

// ── 架構鎖：四站必須共用同一份轉換實作 ──────────────────────────
// 踩過的坑是「某站自己內聯 isFullyEnriched() && status === 'experimental'」，
// 只要該站的條件漂移，就會出現沒人接手升級的死區。
// 這組斷言禁止「內聯重寫」悄悄回到程式碼裡。
const SITES = [
  ['cli.js', 'cmdAdd() 語意補齊階段'],
  ['web/server.js', 'enrichToolInBackground()'],
  ['scripts/enrich-new-tools.js', '批次 enrich 工作迴圈'],
  ['scripts/translate-to-zh.js', '批次翻譯 flush()'],
];

for (const [rel, label] of SITES) {
  test(`生命週期單一來源：${rel}（${label}）走 activateIfComplete`, () => {
    const src = readFileSync(join(ROOT, rel), 'utf8');
    assert.match(src, /activateIfComplete/, '必須匯入並呼叫 core/tool-lifecycle.js');
    // 站點不得自行重推完整度判準（那正是死區的成因）
    assert.doesNotMatch(src, /isFullyEnriched\s*\(/, '升級判準只能留在 core/tool-lifecycle.js');
  });
}
