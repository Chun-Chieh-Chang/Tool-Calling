import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePick, buildPrompt, rerankCandidates, promote } from '../core/llm-rerank.js';

const CANDS = ['alpha', 'beta', 'gamma', 'delta'];

// ── parsePick：三種常見回傳格式 ────────────────────────────────────────────
// 這是 2026-09-14 的關鍵 bug：只處理 id 字串、沒處理編號，
// 導致 42 筆全數解析失敗並跑出「rerank 反而更差」的錯誤結論。

test('parsePick - 純數字視為 1-based 編號', () => {
  assert.equal(parsePick('3', CANDS), 'gamma');
  assert.equal(parsePick('1', CANDS), 'alpha');
  assert.equal(parsePick('4', CANDS), 'delta');
});

test('parsePick - 數字帶標點仍可解析', () => {
  assert.equal(parsePick('2.', CANDS), 'beta');
  assert.equal(parsePick('2)', CANDS), 'beta');
});

test('parsePick - 回傳含 id 字串時直接採用', () => {
  assert.equal(parsePick('我選 beta', CANDS), 'beta');
  assert.equal(parsePick('gamma', CANDS), 'gamma');
});

test('parsePick - 文字中夾雜數字時寬鬆取第一個', () => {
  assert.equal(parsePick('答案是第 2 個', CANDS), 'beta');
});

test('parsePick - 優先採用 id 精確匹配而非數字', () => {
  // 文字同時含 id 與數字時，id 優先（避免 "tool 3" 被當成編號）
  assert.equal(parsePick('gamma', ['a', 'b', 'gamma']), 'gamma');
});

test('parsePick - 超出範圍的編號回傳 null', () => {
  assert.equal(parsePick('99', CANDS), null);
  assert.equal(parsePick('0', CANDS), null);
});

test('parsePick - 空值／無法解析回傳 null', () => {
  assert.equal(parsePick('', CANDS), null);
  assert.equal(parsePick(null, CANDS), null);
  assert.equal(parsePick('我不知道', CANDS), null);
});

test('parsePick - 候選為空回傳 null', () => {
  assert.equal(parsePick('1', []), null);
  assert.equal(parsePick('1', null), null);
});

// ── buildPrompt ───────────────────────────────────────────────────────────
test('buildPrompt - 含需求、編號、id 與簡介', () => {
  const p = buildPrompt('需要畫圖表', [{ id: 'chart-x', description: 'chart tool' }]);
  assert.ok(p.includes('需要畫圖表'));
  assert.ok(p.includes('1. chart-x'));
  assert.ok(p.includes('chart tool'));
});

test('buildPrompt - 容許 id 字串陣列（向後相容）', () => {
  const p = buildPrompt('q', ['tool-a', 'tool-b']);
  assert.ok(p.includes('1. tool-a'));
  assert.ok(p.includes('2. tool-b'));
});

// ── rerankCandidates：離線安全與優雅降級 ────────────────────────────────────
test('rerankCandidates - 無候選時回傳 error 且不拋出', async () => {
  const r = await rerankCandidates('q', [], { apiKey: 'x' });
  assert.equal(r.picked, null);
  assert.equal(r.error, 'no candidates');
});

test('rerankCandidates - 無 api key 時回傳 error（離線安全，不呼叫網路）', async () => {
  const prev = process.env.AGNES_API_KEY;
  delete process.env.AGNES_API_KEY;
  try {
    const r = await rerankCandidates('q', ['a', 'b']);
    assert.equal(r.picked, null);
    assert.equal(r.error, 'no api key (offline)');
  } finally {
    if (prev !== undefined) process.env.AGNES_API_KEY = prev;
  }
});

test('rerankCandidates - API 失敗時回傳 error 不拋出', async () => {
  // 指向無法連線的埠號，驗證錯誤被捕捉。maxRetries=0 避免測試等待重試退避。
  const r = await rerankCandidates('q', ['a', 'b'], {
    apiKey: 'test-key',
    apiBase: 'http://127.0.0.1:59999/v1',
    timeoutMs: 2000,
    maxRetries: 0,
  });
  assert.equal(r.picked, null);
  assert.ok(r.error, '應回傳 error 說明失敗原因');
});

test('rerankCandidates - maxRetries=0 時不重試（快速失敗）', async () => {
  const t0 = Date.now();
  const r = await rerankCandidates('q', ['a', 'b'], {
    apiKey: 'test-key',
    apiBase: 'http://127.0.0.1:59999/v1',
    timeoutMs: 500,
    maxRetries: 0,
  });
  assert.equal(r.picked, null);
  assert.ok(Date.now() - t0 < 3000, 'maxRetries=0 不應等待退避');
});

// ── promote ───────────────────────────────────────────────────────────────
test('promote - 把選中項移到最前', () => {
  const out = promote([{ id: 'a' }, { id: 'b' }, { id: 'c' }], 'c');
  assert.deepEqual(out.map((x) => x.id), ['c', 'a', 'b']);
});

test('promote - 選中項已在首位則原樣回傳', () => {
  const items = [{ id: 'a' }, { id: 'b' }];
  assert.deepEqual(promote(items, 'a'), items);
});

test('promote - picked 為 null 或找不到時原樣回傳', () => {
  const items = [{ id: 'a' }, { id: 'b' }];
  assert.deepEqual(promote(items, null), items);
  assert.deepEqual(promote(items, 'zzz'), items);
});

test('promote - 不修改原陣列', () => {
  const items = [{ id: 'a' }, { id: 'b' }];
  promote(items, 'b');
  assert.deepEqual(items.map((x) => x.id), ['a', 'b']);
});
