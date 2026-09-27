import test from 'node:test';
import assert from 'node:assert/strict';
import { isFullyEnriched, fetchReadmeText, normalizeEnrichment } from '../core/tool-enricher.js';

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

// ─── negativeConstraints（2026-09-27）───────────────────────────────────────
// 背景：掃描器曾寫死兩條佔位樣板，結果 39 支 active 工具帶著假邊界一路餵進
// 檢索的 V3／V4／D1 維度。掃描器已改為留空，改由本模組依 README 補真實內容。
// 繁中變體不在這裡產生——scripts/translate-to-zh.js 已負責 negativeConstraints_zh。

test('normalizeEnrichment: 抽出 negativeConstraints，去 Markdown 並上限 3 條', () => {
  const out = normalizeEnrichment(
    { negativeConstraints: [
      'Not for **offline** use',
      '`Avoid` for sub-millisecond latency',
      'Not suitable without a GPU',
      '第四條應被截掉',
    ] },
    { description: 'X' },
  );
  assert.equal(out.negativeConstraints.length, 3);
  assert.equal(out.negativeConstraints[0], 'Not for offline use');
});

test('normalizeEnrichment: 模型沒給 negativeConstraints 時不憑空產生', () => {
  const out = normalizeEnrichment({ useCase: 'A dev runs X nightly' }, { description: 'X' });
  assert.equal('negativeConstraints' in out, false);
});

test('normalizeEnrichment: 空陣列或全空白字條視為沒給（不回傳該欄位）', () => {
  const base = { useCase: 'A dev runs X nightly', description: 'X' };
  const emptyArr = normalizeEnrichment({ ...base, negativeConstraints: [] }, base);
  const blankStrs = normalizeEnrichment({ ...base, negativeConstraints: ['   ', ''] }, base);
  assert.equal('negativeConstraints' in emptyArr, false);
  assert.equal('negativeConstraints' in blankStrs, false);
});

test('normalizeEnrichment: 只有 negativeConstraints 時仍回傳物件（不被當成補齊失敗）', () => {
  const out = normalizeEnrichment({ negativeConstraints: ['Needs a self-hosted Postgres.'] }, { description: 'X' });
  assert.deepEqual(out, { negativeConstraints: ['Needs a self-hosted Postgres.'] });
});

test('normalizeEnrichment: 非陣列輸入不拋錯，且不寫入髒值（模型偶爾回傳字串）', () => {
  // 帶一個有效欄位，避免函式因「什麼都沒補到」回傳 null 而測不到本欄位
  const out = normalizeEnrichment(
    { useCase: 'A dev runs X nightly', negativeConstraints: 'Not for offline use' },
    { description: 'X' },
  );
  assert.equal('negativeConstraints' in out, false);
  assert.equal(out.useCase, 'A dev runs X nightly');
});
