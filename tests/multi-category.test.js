/**
 * multi-category.test.js — 多值分類增量政策的守門測試（2026-10-14 Q1=B 裁決）
 *
 * 政策：categories[] 只對未來新工具增量落盤（scan-tool.js 推論＋落盤），
 * 回溯庫刻意不補。本檔鎖住三件事：
 *   ① buildMultiCategories 的純函式行為（第一欄=primary、dedup、白名單守門）
 *   ② inferSecondary 輸出 ⊆ categories.json 18 分類（SSOT 守門可失敗）
 *   ③ 已落盤的多值條目第一欄必等於 category（實資料不變式）
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildMultiCategories, inferSecondary } from '../core/classification-rules.js';
import { categoryNames } from '../core/categories.js';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const registry = JSON.parse(readFileSync(join(ROOT, 'registry', 'tools.json'), 'utf8'));
const VALID = new Set(categoryNames());

test('buildMultiCategories：第一欄必為 primary，其後接 secondary', () => {
  const out = buildMultiCategories('測試與自動化', [{ required: '瀏覽器自動化' }], VALID);
  assert.deepEqual(out, ['測試與自動化', '瀏覽器自動化']);
});

test('buildMultiCategories：dedup 且排除等於 primary 的重複值', () => {
  const out = buildMultiCategories('文件生產力', [
    { required: '知識管理' },
    { required: '文件生產力' },
    { required: '知識管理' },
  ], VALID);
  assert.deepEqual(out, ['文件生產力', '知識管理']);
});

test('buildMultiCategories：白名單外的分類必須被過濾（SSOT 守門）', () => {
  const out = buildMultiCategories('開發工具', [
    { required: '行銷' },
    { required: '數據分析' },
  ], VALID);
  assert.deepEqual(out, ['開發工具', '數據分析']);
});

test('buildMultiCategories：過濾後只剩 primary 時回傳 undefined（不落單值冗餘欄位）', () => {
  assert.equal(buildMultiCategories('開發工具', [{ required: '行銷' }], VALID), undefined);
  assert.equal(buildMultiCategories('開發工具', [], VALID), undefined);
  assert.equal(buildMultiCategories('開發工具', undefined, VALID), undefined);
  assert.equal(buildMultiCategories('開發工具', [{ required: '開發工具' }], VALID), undefined);
});

test('buildMultiCategories：接受純字串形式的 secondary（向下相容）', () => {
  const out = buildMultiCategories('金融與投資', ['數據分析'], VALID);
  assert.deepEqual(out, ['金融與投資', '數據分析']);
});

test('buildMultiCategories：不給白名單時不過濾（呼叫端自負）', () => {
  const out = buildMultiCategories('開發工具', [{ required: '行銷' }], null);
  assert.deepEqual(out, ['開發工具', '行銷']);
});

test('守門：inferSecondary 對全庫的輸出皆 ⊆ categories.json 18 分類', () => {
  const invalid = [];
  for (const t of registry.tools) {
    for (const s of inferSecondary(t)) {
      if (!VALID.has(s.required)) invalid.push(`${t.id} -> ${s.required}`);
    }
  }
  assert.deepEqual(invalid, [], `越權 secondary 分類：${invalid.slice(0, 5).join(', ')}`);
});

test('不變式：已落盤的 categories[] 第一欄必等於 category', () => {
  const bad = registry.tools
    .filter((t) => Array.isArray(t.categories) && t.categories.length > 0 && t.categories[0] !== t.category)
    .map((t) => t.id);
  assert.deepEqual(bad, [], `違反不變式：${bad.join(', ')}`);
});
