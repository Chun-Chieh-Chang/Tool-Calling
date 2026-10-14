/**
 * query-intent-zh.test.js — 中文意圖抽取守門測試（2026-10-14 Q4=A 實驗產物）
 *
 * 背景：評測集 267 筆全為中文查詢，extractIntent 原本只有英文詞表
 * （hasIntent 僅 16/267 觸發）。本檔鎖住中文詞表的抽取行為；
 * 加權停用的實測依據見 core/query-intent.js 權重區塊頭註解與 DEV_LOG。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractIntent, weightsForIntent, BASE_WEIGHTS } from '../core/query-intent.js';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');

test('英文抽取行為不變（迴歸鎖）', () => {
  const it = extractIntent('clean up a large csv dataset headless');
  assert.ok(it.action, 'clean 應命中 action');
  assert.ok(it.object, 'csv/dataset 中 csv 應命中 object');
  assert.ok(it.constraint, 'headless 應命中 constraint');
});

test('中文查詢命中物件與約束訊號', () => {
  const it = extractIntent('幫我把網頁上的表格轉成 csv，要開源的');
  assert.ok(it.object, '網頁／表格／csv 應命中 object');
  assert.ok(it.constraint, '開源 應命中 constraint');
  assert.ok(it.action, '轉成 應命中 action');
  assert.ok(it.objectTerms.includes('表格'));
  assert.ok(it.objectTerms.includes('網頁'));
  assert.ok(it.constraintTerms.includes('開源'));
});

test('簡體查詢同樣命中（繁簡並列）', () => {
  const it = extractIntent('把视频转换成 gif，要离线的');  // allow-simplified：簡體 fixture，測的就是簡體匹配
  assert.ok(it.objectTerms.includes('视频'));  // allow-simplified：簡體 fixture 斷言
  assert.ok(it.constraintTerms.includes('离线'));  // allow-simplified：簡體 fixture 斷言
});

test('中文通用詞不觸發意圖（幫我／工具／系統單獨出現）', () => {
  assert.equal(extractIntent('幫我想一個好用的工具').hasIntent, false);
  assert.equal(extractIntent('我需要一個系統').hasIntent, false);
});

test('評測集覆蓋率：中文詞表應讓多數查詢觸發意圖（2026-10-14 實測 82.4%）', () => {
  const eq = JSON.parse(readFileSync(join(ROOT, 'registry', 'eval-queries.json'), 'utf8'));
  let fired = 0;
  for (const c of eq.cases) if (extractIntent(c.query).hasIntent) fired++;
  const rate = fired / eq.cases.length;
  assert.ok(rate >= 0.7, `觸發率 ${(rate * 100).toFixed(1)}% 低於 70% 防線`);
});

test('預設回傳基準權重（加權已於 2026-10-14 實測後停用）', () => {
  // 顯式移除開關再測，避免外圍 env 影響此契約（開關為呼叫時讀取）
  const prev = process.env.QI_ENABLE_WEIGHTS;
  delete process.env.QI_ENABLE_WEIGHTS;
  try {
    const it = extractIntent('幫我把網頁上的表格轉成 csv，要開源的');
    assert.deepEqual(weightsForIntent(it), { ...BASE_WEIGHTS });
  } finally {
    if (prev !== undefined) process.env.QI_ENABLE_WEIGHTS = prev;
  }
});
