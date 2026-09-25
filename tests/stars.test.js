/**
 * stars.test.js — 加入工具時的星數取得／寫入迴歸測試
 *
 * 為什麼要有這組測試（2026-09-25）
 * ────────────────────────────────
 * CLI 與 Web 兩條加入管線都把「查星數」的程式碼複製了一份，而且都放在
 * `registry.tools.push(newTool); saveRegistry(registry)` **之後**。
 * 後果：star-snapshots.json 有星數、tools.json 那筆卻沒有（push 後只存檔一次，
 * 而語意補齊階段會重新 loadRegistry 覆寫回去，事後修改的記憶體物件永遠不落盤）。
 * 現在星數取得收斂到 core/stars.js，本檔鎖住三件事：
 *   1. 星數寫進「呼叫端拿去 push 的那個物件引用」
 *   2. 任何 GitHub／磁碟錯誤都只讓星數缺席，不阻斷加入
 *   3. 非 GitHub URL 不去打 API
 * 全部用注入的 fake 執行，不連網、也不會動到 registry/star-snapshots.json。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchRepoStars, applyRepoStars, attachStarsToTool } from '../core/stars.js';

/** 造一個假 fetch：回傳指定狀態與 JSON，並記錄被呼叫的 URL */
function fakeFetch({ ok = true, body, throws = false } = {}) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url, init });
    if (throws) throw new Error('network down');
    return {
      ok,
      json: async () => {
        if (body === undefined) throw new Error('bad json');
        return body;
      },
    };
  };
  return { impl, calls };
}

// ── fetchRepoStars：只問 GitHub ────────────────────────────────

test('fetchRepoStars: 回傳 stargazers_count，並打對 repo 層端點', async () => {
  const { impl, calls } = fakeFetch({ body: { stargazers_count: 19514 } });
  const stars = await fetchRepoStars('https://github.com/tj/n', { fetchImpl: impl });
  assert.equal(stars, 19514);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.github.com/repos/tj/n');
  assert.equal(calls[0].init.headers['User-Agent'], 'Tool-Calling-Add-Agent');
});

test('fetchRepoStars: /tree/ 子路徑仍解析到倉庫層端點（子筆共用母倉 star）', async () => {
  const { impl, calls } = fakeFetch({ body: { stargazers_count: 7675 } });
  const stars = await fetchRepoStars(
    'https://github.com/genspark-ai/genoffice/tree/main/skills/genoffice',
    { fetchImpl: impl },
  );
  assert.equal(stars, 7675);
  assert.equal(calls[0].url, 'https://api.github.com/repos/genspark-ai/genoffice');
});

test('fetchRepoStars: 非 GitHub URL 回傳 null 且不呼叫 API', async () => {
  const { impl, calls } = fakeFetch({ body: { stargazers_count: 1 } });
  assert.equal(await fetchRepoStars('https://example.com/foo/bar', { fetchImpl: impl }), null);
  assert.equal(await fetchRepoStars(undefined, { fetchImpl: impl }), null);
  assert.equal(calls.length, 0, '不該對非 GitHub 來源打 API');
});

test('fetchRepoStars: HTTP 非 2xx 回傳 null（rate limit 不是錯誤）', async () => {
  const { impl } = fakeFetch({ ok: false, body: { message: "API rate limit exceeded" } });
  assert.equal(await fetchRepoStars('https://github.com/tj/n', { fetchImpl: impl }), null);
});

test('fetchRepoStars: stargazers_count 缺漏或型別不對時回傳 null', async () => {
  for (const body of [{}, { stargazers_count: '19514' }, { stargazers_count: null }, undefined]) {
    const { impl } = fakeFetch({ body });
    assert.equal(await fetchRepoStars('https://github.com/tj/n', { fetchImpl: impl }), null,
      `body=${JSON.stringify(body)} 不應產生星數`);
  }
});

test('fetchRepoStars: fetch 拋錯時吸收為 null', async () => {
  const { impl } = fakeFetch({ throws: true });
  assert.equal(await fetchRepoStars('https://github.com/tj/n', { fetchImpl: impl }), null);
});

// ── applyRepoStars：純函式，同時掛 tool 與 snapshot ─────────────

test('applyRepoStars: 星數同時寫進工具物件與快照扁平鍵', () => {
  const tool = { id: 'n' };
  const snap = { snapshots: [], lastUpdated: '2026-09-25T00:00:00.000Z' };
  assert.equal(applyRepoStars(tool, snap, 'tj/n', 19514), true);
  assert.equal(tool.stars, 19514);
  assert.equal(snap['tj/n'], 19514);
  // 混合形狀的其餘欄位不能被動到
  assert.deepEqual(snap.snapshots, []);
  assert.equal(snap.lastUpdated, '2026-09-25T00:00:00.000Z');
});

test('applyRepoStars: 星數不是數字時回傳 false 且不留 0 或 undefined', () => {
  for (const bad of [undefined, null, NaN, '19514', {}]) {
    const tool = { id: 'n' };
    const snap = {};
    assert.equal(applyRepoStars(tool, snap, 'tj/n', bad), false, `${String(bad)} 必須被拒`);
    assert.equal('stars' in tool, false, '不能寫出 stars: 0 這種假資料');
    assert.deepEqual(snap, {});
  }
});

test('applyRepoStars: 快照可以是 null（只要工具拿到星數）', () => {
  const tool = { id: 'n' };
  assert.equal(applyRepoStars(tool, null, 'tj/n', 19514), true);
  assert.equal(tool.stars, 19514);
});

// ── attachStarsToTool：加入管線用的組合 ────────────────────────

test('attachStarsToTool: 原地修改呼叫端拿去 push 的那個物件（關鍵順序契約）', async () => {
  // 舊缺陷的本體：星數掛在「存檔之後的記憶體物件」上，永遠不落盤。
  // 管線的寫法是 tool → attach → push(tool) → saveRegistry()，
  // 所以這裡斷言 attach 改的就是同一個引用，而不是回傳副本。
  const tool = { id: 'n', name: 'n' };
  const saved = [];
  const { impl } = fakeFetch({ body: { stargazers_count: 19514 } });
  const stars = await attachStarsToTool(tool, 'https://github.com/tj/n', {
    fetchImpl: impl,
    loadSnapshotImpl: () => ({ 'existing/repo': 1 }),
    saveSnapshotImpl: (snap) => saved.push(snap),
  });
  assert.equal(stars, 19514);
  assert.equal(tool.stars, 19514, '星數必須掛在同一物件上，push 進 registry 才會有值');
  assert.equal(saved.length, 1);
  assert.equal(saved[0]['tj/n'], 19514);
  assert.equal(saved[0]['existing/repo'], 1, '既有快照鍵不能被覆蓋');
});

test('attachStarsToTool: 取得失敗時不碰工具、不寫快照', async () => {
  let saveCalls = 0;
  const tool = { id: 'n' };
  const { impl } = fakeFetch({ ok: false, body: {} });
  const stars = await attachStarsToTool(tool, 'https://github.com/tj/n', {
    fetchImpl: impl,
    loadSnapshotImpl: () => ({}),
    saveSnapshotImpl: () => { saveCalls++; },
  });
  assert.equal(stars, null);
  assert.equal('stars' in tool, false);
  assert.equal(saveCalls, 0);
});

test('attachStarsToTool: 快照寫入失敗仍保留星數且不拋錯（磁碟問題不該擋住加入）', async () => {
  const tool = { id: 'n' };
  const { impl } = fakeFetch({ body: { stargazers_count: 42 } });
  const stars = await attachStarsToTool(tool, 'https://github.com/tj/n', {
    fetchImpl: impl,
    loadSnapshotImpl: () => ({}),
    saveSnapshotImpl: () => { throw new Error('EBUSY'); },
  });
  assert.equal(stars, 42);
  assert.equal(tool.stars, 42);
});

test('attachStarsToTool: 快照載入失敗時仍把星數掛進工具，且跳過寫入以免清空快照', async () => {
  const tool = { id: 'n' };
  let saveCalls = 0;
  const { impl } = fakeFetch({ body: { stargazers_count: 42 } });
  const stars = await attachStarsToTool(tool, 'https://github.com/tj/n', {
    fetchImpl: impl,
    loadSnapshotImpl: () => { throw new Error('壞掉的 JSON'); },
    saveSnapshotImpl: () => { saveCalls++; },
  });
  assert.equal(stars, 42);
  assert.equal(tool.stars, 42);
  assert.equal(saveCalls, 0, '讀到空快照還硬寫回去會把歷史抹掉');
});

test('attachStarsToTool: 非 GitHub URL 回傳 null 且完全不碰快照', async () => {
  const tool = { id: 'x' };
  let loadCalls = 0;
  const stars = await attachStarsToTool(tool, 'https://gitlab.com/a/b', {
    fetchImpl: async () => { throw new Error('不該被呼叫'); },
    loadSnapshotImpl: () => { loadCalls++; return {}; },
    saveSnapshotImpl: () => { throw new Error('不該被呼叫'); },
  });
  assert.equal(stars, null);
  assert.equal(loadCalls, 0);
  assert.equal('stars' in tool, false);
});
