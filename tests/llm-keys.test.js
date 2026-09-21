import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getKeyPool, nextKey, availableCount, nextAvailableDelayMs,
  reportSuccess, reportFailure, keyStats, resetKeyPool,
  setRuntimeKeys, getKeyStatus,
} from '../core/llm-keys.js';

// 測試之間必須重置，因為金鑰池是模組層級的單例
test.afterEach(() => {
  delete process.env.AGNES_API_KEYS;
  delete process.env.AGNES_API_KEY;
  resetKeyPool();
});

test('llm-keys: 沒有任何金鑰時 nextKey() 回傳 null（離線安全）', () => {
  assert.equal(nextKey(), null);
  assert.equal(keyStats().total, 0);
});

test('llm-keys: 單把金鑰時行為與舊版一致', () => {
  process.env.AGNES_API_KEY = 'only-one';
  resetKeyPool();
  assert.equal(keyStats().total, 1);
  assert.equal(nextKey(), 'only-one');
  assert.equal(nextKey(), 'only-one');
});

test('llm-keys: 多把金鑰時輪替', () => {
  process.env.AGNES_API_KEYS = 'k1,k2,k3';
  resetKeyPool();
  assert.equal(keyStats().total, 3);
  const seen = [nextKey(), nextKey(), nextKey(), nextKey()];
  assert.deepEqual(seen, ['k1', 'k2', 'k3', 'k1'], '應依序輪替並回到第一把');
});

test('llm-keys: 逗號分隔會去空白並去掉重複', () => {
  process.env.AGNES_API_KEYS = ' k1 , k2 , k1 , ';
  resetKeyPool();
  assert.equal(keyStats().total, 2);
});

test('llm-keys: 拿到 429 的金鑰會被隔離，輪替時跳過', () => {
  process.env.AGNES_API_KEYS = 'k1,k2';
  resetKeyPool();
  assert.equal(availableCount(), 2);

  const first = nextKey();
  reportFailure(first, 429);
  assert.equal(availableCount(), 1, '被限流的金鑰應暫時停用');
  // 還有別把可用 → 等待時間應為 0（呼叫端可立刻重試，不必退避）
  assert.equal(nextAvailableDelayMs(), 0, '尚有可用金鑰時不該要求等待');

  assert.notEqual(nextKey(), first, '不該再拿到被隔離的金鑰');
});

test('llm-keys: 全部被隔離時 nextAvailableDelayMs() 才回報等待時間', () => {
  process.env.AGNES_API_KEYS = 'k1,k2';
  resetKeyPool();
  reportFailure('k1', 429);
  reportFailure('k2', 429);
  assert.ok(nextAvailableDelayMs() > 0, '全部隔離時應回報需要等待');
});

test('llm-keys: 非 429 的失敗不隔離（金鑰本身沒問題）', () => {
  process.env.AGNES_API_KEYS = 'k1';
  resetKeyPool();
  reportFailure('k1', 500);
  assert.equal(availableCount(), 1, '5xx 不代表這把金鑰被限流');
  assert.equal(nextAvailableDelayMs(), 0);
});

test('llm-keys: 全部被隔離時仍會回傳最快解禁的那把（不會無金鑰可用）', () => {
  process.env.AGNES_API_KEYS = 'k1,k2';
  resetKeyPool();
  reportFailure('k1', 429);
  reportFailure('k2', 429);
  assert.equal(availableCount(), 0);
  assert.ok(nextKey(), '即使全部隔離也要回傳一把，由呼叫端退避');
});

test('llm-keys: 統計會累計成功與 429 次數', () => {
  process.env.AGNES_API_KEYS = 'k1,k2';
  resetKeyPool();
  reportSuccess('k1');
  reportSuccess('k1');
  reportFailure('k2', 429);
  const s = keyStats();
  const k1 = s.keys.find((x) => x.label.startsWith('key_'));
  assert.ok(s.keys.some((x) => x.ok === 2), 'k1 應有 2 次成功');
  assert.ok(s.keys.some((x) => x.status429 === 1), 'k2 應有 1 次 429');
  assert.ok(k1);
});

test('llm-keys: 金鑰標籤不洩漏完整金鑰', () => {
  process.env.AGNES_API_KEY = 'sk-secret-value-1234';
  resetKeyPool();
  const s = keyStats();
  for (const k of s.keys) {
    assert.ok(!k.label.includes('secret'), `標籤不該含金鑰中段：${k.label}`);
  }
});

// ── 執行期注入（UI 輸入金鑰）──────────────────────────────────────────────
// 使用者不一定會在啟動伺服器時設好環境變數，所以 UI 可以注入金鑰。
// 這些金鑰只存在記憶體，重啟即失效。

test('llm-keys: setRuntimeKeys 可注入金鑰並反映在狀態中', () => {
  resetKeyPool();
  assert.equal(getKeyStatus().configured, false);
  assert.equal(getKeyStatus().source, 'runtime'); // 沒 env 時預設標成 runtime

  const r = setRuntimeKeys('k1,k2');
  assert.equal(r.added, 2);
  assert.equal(r.total, 2);

  const s = getKeyStatus();
  assert.equal(s.configured, true);
  assert.equal(s.count, 2);
  assert.equal(s.available, 2);
  assert.equal(s.labels.length, 2);
});

test('llm-keys: 狀態查詢不回傳完整金鑰（只回遮罩標籤）', () => {
  resetKeyPool();
  setRuntimeKeys('sk-super-secret-value-1234');
  const s = getKeyStatus();
  const dump = JSON.stringify(s);
  assert.ok(!dump.includes('super-secret'), '狀態不得洩漏金鑰中段');
  assert.ok(!dump.includes('value-1234'), '狀態不得洩漏金鑰尾段');
});

test('llm-keys: 重複注入同一把金鑰不會重複計算', () => {
  resetKeyPool();
  setRuntimeKeys('k1');
  const r = setRuntimeKeys('k1');
  assert.equal(r.added, 0);
  assert.equal(r.total, 1);
});

test('llm-keys: resetKeyPool 會清掉執行期注入的金鑰', () => {
  resetKeyPool();
  setRuntimeKeys('k1');
  assert.equal(getKeyStatus().count, 1);
  resetKeyPool();
  assert.equal(getKeyStatus().count, 0, '重設後應回到乾淨狀態');
});

test('llm-keys: 環境變數與執行期注入可並存（env 優先）', () => {
  process.env.AGNES_API_KEY = 'from-env';
  resetKeyPool();
  const r = setRuntimeKeys('from-ui');
  assert.equal(r.total, 2);
  assert.equal(getKeyStatus().source, 'env+runtime');
});
