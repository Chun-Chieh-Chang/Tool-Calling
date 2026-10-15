import test from 'node:test';
import assert from 'node:assert/strict';
import {
  collectTelemetryHits,
  collectEvalProxyHits,
  needsCapabilities,
  selectCandidates,
} from '../scripts/enrich-capabilities.js';

// 2026-10-15 Q4=B：精實補 capabilities 的候選選擇邏輯（純函式、不觸網）。

test('collectTelemetryHits：search 取 topResultId、click 取 toolId', () => {
  const hits = collectTelemetryHits([
    { type: 'search', topResultId: 'a' },
    { type: 'search', topResultId: 'a' },
    { type: 'click', toolId: 'b' },
    { type: 'search', topResultId: null },
    { type: 'abandon', query: 'x' },
    { type: 'search' },
  ]);
  assert.equal(hits.get('a'), 2);
  assert.equal(hits.get('b'), 1);
  assert.equal(hits.size, 2);
});

test('collectTelemetryHits：空／畸形輸入不炸', () => {
  assert.equal(collectTelemetryHits().size, 0);
  assert.equal(collectTelemetryHits([null, undefined, {}]).size, 0);
});

test('collectEvalProxyHits：expected 與 alsoAcceptable 都計', () => {
  const hits = collectEvalProxyHits([
    { expected: ['x'], alsoAcceptable: ['y'] },
    { expected: ['x'] },
  ]);
  assert.equal(hits.get('x'), 2);
  assert.equal(hits.get('y'), 1);
});

test('needsCapabilities：空陣列與缺欄位皆算缺', () => {
  assert.equal(needsCapabilities({}), true);
  assert.equal(needsCapabilities({ capabilities: [] }), true);
  assert.equal(needsCapabilities({ capabilities: ['x'] }), false);
});

test('selectCandidates：只取缺 capabilities、active、有命中者，依命中降冪', () => {
  const tools = [
    { id: 'a', status: 'active' },
    { id: 'b', status: 'active' },
    { id: 'c', status: 'active', capabilities: ['already'] },
    { id: 'd', status: 'experimental' },
    { id: 'e', status: 'active' },
  ];
  const hits = new Map([['a', 1], ['b', 3], ['c', 9], ['d', 5]]);
  const got = selectCandidates(tools, hits, {});
  assert.deepEqual(got.map((x) => x.tool.id), ['b', 'a']);
  assert.deepEqual(got.map((x) => x.hits), [3, 1]);
});

test('selectCandidates：includeExperimental 與 limit', () => {
  const tools = [{ id: 'a', status: 'experimental' }, { id: 'b', status: 'active' }];
  const hits = new Map([['a', 5], ['b', 4]]);
  assert.deepEqual(selectCandidates(tools, hits, {}).map((x) => x.tool.id), ['b']);
  assert.deepEqual(
    selectCandidates(tools, hits, { includeExperimental: true, limit: 1 }).map((x) => x.tool.id),
    ['a']
  );
});

test('selectCandidates：無命中＝空清單（不亂補）', () => {
  const tools = [{ id: 'a', status: 'active' }];
  assert.deepEqual(selectCandidates(tools, new Map(), {}), []);
});
