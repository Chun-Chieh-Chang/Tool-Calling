import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { search } from '../core/search-engine.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const registry = JSON.parse(readFileSync(path.join(__dirname, '..', 'registry', 'tools.json'), 'utf8'));
const tools = registry.tools.filter((t) => t.status === 'active' || t.status === 'experimental');

test('L1.5 分數必須落在 0~1（修復信心度 213%）', () => {
  const r = search(tools, '我想把 YouTube 影片轉成逐字稿', { topK: 10 });
  assert.ok(r.length > 0, '此查詢在現行工具庫應有 L1.5 命中');
  for (const x of r) {
    assert.ok(x.score <= 1.0, `分數 ${x.score} 超過 1.0（matchLevel=${x.matchLevel}）`);
    assert.ok(x.score > 0, `分數 ${x.score} 不應為 0`);
  }
});
