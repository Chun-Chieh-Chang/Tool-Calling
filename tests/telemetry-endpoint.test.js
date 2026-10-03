import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

function newDir() {
  return mkdtempSync(path.join(tmpdir(), 'telemetry-'));
}

test('合法 search 事件附加寫入 JSONL', async () => {
  const dir = newDir();
  process.env.TELEMETRY_DIR = dir;
  const { handleTelemetry } = await import('../web/telemetry-endpoint.js');
  const out = handleTelemetry({ type: 'search', query: '我想把 YouTube 影片轉成逐字稿', timestamp: 1 });
  assert.equal(out.status, 200);
  const lines = readFileSync(path.join(dir, 'telemetry-events.jsonl'), 'utf8').trim().split('\n');
  assert.equal(lines.length, 1);
  assert.deepEqual(JSON.parse(lines[0]), {
    type: 'search',
    query: '我想把 YouTube 影片轉成逐字稿',
    timestamp: 1,
    resultCount: null,
    topResultId: null,
    duration: null,
  });
  rmSync(dir, { recursive: true, force: true });
});

test('非法 type 回 400 且不寫檔', async () => {
  const dir = newDir();
  process.env.TELEMETRY_DIR = dir;
  const { handleTelemetry } = await import('../web/telemetry-endpoint.js');
  const out = handleTelemetry({ type: 'hack', query: 'x' });
  assert.equal(out.status, 400);
  assert.ok(!existsSync(path.join(dir, 'telemetry-events.jsonl')), '非法事件不得寫入任何檔案');
  rmSync(dir, { recursive: true, force: true });
});

test('click 事件缺 toolId 回 400', async () => {
  const dir = newDir();
  process.env.TELEMETRY_DIR = dir;
  const { handleTelemetry } = await import('../web/telemetry-endpoint.js');
  const out = handleTelemetry({ type: 'click', query: 'x' });
  assert.equal(out.status, 400);
  rmSync(dir, { recursive: true, force: true });
});

test('query 超過 500 字被截斷而非拒絕', async () => {
  const dir = newDir();
  process.env.TELEMETRY_DIR = dir;
  const { handleTelemetry } = await import('../web/telemetry-endpoint.js');
  const out = handleTelemetry({ type: 'search', query: 'a'.repeat(600), timestamp: 2 });
  assert.equal(out.status, 200);
  const lines = readFileSync(path.join(dir, 'telemetry-events.jsonl'), 'utf8').trim().split('\n');
  assert.equal(JSON.parse(lines[0]).query.length, 500);
  rmSync(dir, { recursive: true, force: true });
});

test('search 事件保留 resultCount / topResultId / duration（缺省落 null）', async () => {
  const dir = newDir();
  process.env.TELEMETRY_DIR = dir;
  const { handleTelemetry } = await import('../web/telemetry-endpoint.js');
  handleTelemetry({ type: 'search', query: 'q', timestamp: 3, resultCount: 5, topResultId: 'ppt-master', duration: 120 });
  handleTelemetry({ type: 'search', query: 'q2', timestamp: 4, resultCount: 'x', duration: NaN });
  const lines = readFileSync(path.join(dir, 'telemetry-events.jsonl'), 'utf8').trim().split('\n');
  const first = JSON.parse(lines[0]);
  const second = JSON.parse(lines[1]);
  assert.equal(first.resultCount, 5);
  assert.equal(first.topResultId, 'ppt-master');
  assert.equal(first.duration, 120);
  assert.equal(second.resultCount, null);
  assert.equal(second.duration, null);
  rmSync(dir, { recursive: true, force: true });
  delete process.env.TELEMETRY_DIR;
});
