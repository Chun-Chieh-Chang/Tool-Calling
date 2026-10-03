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
  assert.deepEqual(JSON.parse(lines[0]), { type: 'search', query: '我想把 YouTube 影片轉成逐字稿', timestamp: 1 });
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
