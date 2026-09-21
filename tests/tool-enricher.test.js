import test from 'node:test';
import assert from 'node:assert/strict';
import { isFullyEnriched, fetchReadmeText } from '../core/tool-enricher.js';

// 補齊完成的基準物件（experimental → active 的升級條件）
const FULL = {
  id: 'x',
  description: 'A tool that does X',
  useCase: 'A developer needs to do X on a large dataset',
  advantages: ['Handles datasets larger than memory'],
  description_zh: '一個做 X 的工具',
  useCase_zh: '開發者需要在大型資料集上做 X',
  status: 'experimental',
};

test('isFullyEnriched: 語意欄位齊全時為 true', () => {
  assert.equal(isFullyEnriched(FULL), true);
});

test('isFullyEnriched: useCase 等於 description（複製品）時為 false', () => {
  assert.equal(isFullyEnriched({ ...FULL, useCase: FULL.description }), false);
});

test('isFullyEnriched: 缺 useCase 時為 false', () => {
  assert.equal(isFullyEnriched({ ...FULL, useCase: '' }), false);
  assert.equal(isFullyEnriched({ ...FULL, useCase: undefined }), false);
});

test('isFullyEnriched: advantages 為空時為 false', () => {
  assert.equal(isFullyEnriched({ ...FULL, advantages: [] }), false);
  assert.equal(isFullyEnriched({ ...FULL, advantages: undefined }), false);
});

test('isFullyEnriched: advantages 不是陣列時為 false（contract 要求陣列）', () => {
  assert.equal(isFullyEnriched({ ...FULL, advantages: 'Handles large datasets' }), false);
});

test('isFullyEnriched: 缺繁中欄位時為 false', () => {
  assert.equal(isFullyEnriched({ ...FULL, description_zh: '' }), false);
  assert.equal(isFullyEnriched({ ...FULL, useCase_zh: undefined }), false);
});

test('isFullyEnriched: 不要求 capabilities（195 支既有工具沒有也不該被誤判）', () => {
  assert.equal(isFullyEnriched({ ...FULL, capabilities: [] }), true);
  assert.equal(isFullyEnriched({ ...FULL, capabilities: undefined }), true);
});

test('isFullyEnriched: null / undefined 不拋錯', () => {
  assert.equal(isFullyEnriched(null), false);
  assert.equal(isFullyEnriched(undefined), false);
  assert.equal(isFullyEnriched({}), false);
});

test('fetchReadmeText: 非 GitHub URL 回傳 null（不猜測）', async () => {
  assert.equal(await fetchReadmeText('https://example.com/foo/bar'), null);
  assert.equal(await fetchReadmeText(''), null);
  assert.equal(await fetchReadmeText(undefined), null);
});
