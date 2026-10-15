import test from 'node:test';
import assert from 'node:assert/strict';
import { BehaviorTracker } from '../web/behavior-tracker.js';

// 2026-10-15 第七輪：遙測回流的「目標選擇」守門測試。
//
// 背景（真實事故，不是假想）：live 工作台的公開網址每次重新發佈都會換一組。
// 舊寫法是「index.html 有 relay meta 就改打 relay」，而 live 自己的
// index.html 也帶著同一條 meta——於是 live 把自己的遙測事件送去一組過期的
// 死連結，真人語料全數靜默丟失，症狀與「還沒有人來用」一模一樣。
// 新順序是「先打同源，失敗才 relay」，本檔把那個順序鎖住。

const ENTRY = { type: 'search', query: 'q' };
const PAGE_ORIGIN = 'https://chun-chieh-chang.github.io';
const RELAY = 'https://abcdef0123456789abcdef0123456789.sg.agentos-app.run';

/** 在受控的 document/location/fetch 環境下執行 fn，回傳它記錄到的請求網址。 */
async function withEnv({ relay = null, origin = PAGE_ORIGIN, respond }, fn) {
  const calls = [];
  const prev = {
    document: globalThis.document,
    location: globalThis.location,
    fetch: globalThis.fetch,
  };
  globalThis.document = {
    querySelector: () => (relay == null ? null : { content: relay }),
  };
  globalThis.location = { href: origin + '/', origin };
  globalThis.fetch = (url) => {
    calls.push(url);
    return Promise.resolve(respond ? respond(url) : { ok: true });
  };
  try {
    await fn();
    // _postToServer 是 fire-and-forget，讓 then 鏈跑完
    await new Promise((r) => setTimeout(r, 0));
    return calls;
  } finally {
    if (prev.document === undefined) delete globalThis.document;
    else globalThis.document = prev.document;
    if (prev.location === undefined) delete globalThis.location;
    else globalThis.location = prev.location;
    globalThis.fetch = prev.fetch;
  }
}

test('有同源後端時：只打同源，relay 不得搶走請求（網址輪替的核心防線）', async () => {
  const calls = await withEnv({ relay: RELAY, respond: () => ({ ok: true }) }, async () => {
    new BehaviorTracker()._postToServer(ENTRY);
  });
  assert.deepEqual(calls, ['/api/telemetry']);
});

test('靜態託管（同源 404）時：先試同源，再中繼到 live 工作台', async () => {
  const calls = await withEnv({
    relay: RELAY,
    respond: (url) => ({ ok: url !== '/api/telemetry' }),
  }, async () => {
    new BehaviorTracker()._postToServer(ENTRY);
  });
  assert.deepEqual(calls, ['/api/telemetry', RELAY]);
});

test('同源請求網路失敗時：仍會中繼到 live 工作台', async () => {
  const calls = [];
  const prevFetch = globalThis.fetch;
  globalThis.fetch = (url) => {
    calls.push(url);
    return url === '/api/telemetry'
      ? Promise.reject(new Error('offline'))
      : Promise.resolve({ ok: true });
  };
  const prevDoc = globalThis.document;
  const prevLoc = globalThis.location;
  globalThis.document = { querySelector: () => ({ content: RELAY }) };
  globalThis.location = { href: PAGE_ORIGIN + '/', origin: PAGE_ORIGIN };
  try {
    new BehaviorTracker()._postToServer(ENTRY);
    await new Promise((r) => setTimeout(r, 0));
    assert.deepEqual(calls, ['/api/telemetry', RELAY]);
  } finally {
    globalThis.fetch = prevFetch;
    globalThis.document = prevDoc;
    globalThis.location = prevLoc;
  }
});

test('沒有 relay meta 時：只打同源', async () => {
  const calls = await withEnv({ relay: null, respond: () => ({ ok: false }) }, async () => {
    new BehaviorTracker()._postToServer(ENTRY);
  });
  assert.deepEqual(calls, ['/api/telemetry']);
});

test('relay 與本站同源時：視同未設定，不重複打一次', async () => {
  const calls = await withEnv({
    relay: PAGE_ORIGIN + '/',
    respond: () => ({ ok: false }),
  }, async () => {
    new BehaviorTracker()._postToServer(ENTRY);
  });
  assert.deepEqual(calls, ['/api/telemetry']);
});
