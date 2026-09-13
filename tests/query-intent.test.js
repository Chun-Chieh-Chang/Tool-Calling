import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractIntent,
  weightsForIntent,
  BASE_WEIGHTS,
} from '../core/query-intent.js';

// ── extractIntent 基本契約 ───────────────────────────────────────────────

test('query-intent: 命中物件詞時 objectSignal=true', () => {
  const intent = extractIntent('scrape a JS-rendered dashboard and extract tables');
  assert.equal(intent.object, true);
  assert.ok(intent.objectTerms.includes('dashboard'));
});

test('query-intent: 命中約束詞時 constraintSignal=true', () => {
  const intent = extractIntent('deploy a node.js service to a kubernetes cluster');
  assert.equal(intent.constraint, true);
  assert.ok(intent.constraintTerms.includes('kubernetes'));
});

test('query-intent: 命中動作詞時 actionSignal=true', () => {
  const intent = extractIntent('summarize a 2-hour video into markdown notes');
  assert.equal(intent.action, true);
  assert.ok(intent.actionTerms.includes('summarize'));
});

test('query-intent: 通用詞不計入任何意圖訊號', () => {
  const intent = extractIntent('clean and dedupe a large jsonl dataset');
  // 'large' 是通用詞，不應出現在任何意圖詞表
  assert.ok(!intent.objectTerms.includes('large'));
  assert.ok(!intent.constraintTerms.includes('large'));
  assert.ok(!intent.actionTerms.includes('large'));
});

test('query-intent: 空查詢回傳 hasIntent=false', () => {
  const intent = extractIntent('');
  assert.equal(intent.hasIntent, false);
  assert.equal(intent.tokens.length, 0);
});

test('query-intent: 純通用詞查詢 hasIntent=false', () => {
  const intent = extractIntent('data model tool agent');
  assert.equal(intent.hasIntent, false);
});

// ── weightsForIntent 契約 ─────────────────────────────────────────────────

test('weightsForIntent: 無意圖時回傳基準權重', () => {
  const intent = extractIntent('');
  const w = weightsForIntent(intent);
  assert.equal(w.V1, BASE_WEIGHTS.V1);
  assert.equal(w.V2, BASE_WEIGHTS.V2);
  assert.equal(w.V3, BASE_WEIGHTS.V3);
  assert.equal(w.V4, BASE_WEIGHTS.V4);
});

test('weightsForIntent: 物件意圖時 V2 權重 > 基準', () => {
  const intent = extractIntent('scrape a JS-rendered dashboard and extract tables');
  const w = weightsForIntent(intent);
  assert.ok(w.V2 > BASE_WEIGHTS.V2, `V2=${w.V2} 應 > 基準 ${BASE_WEIGHTS.V2}`);
});

test('weightsForIntent: 約束意圖時 V4 權重 > 基準', () => {
  const intent = extractIntent('deploy a node.js service to a kubernetes cluster');
  const w = weightsForIntent(intent);
  assert.ok(w.V4 > BASE_WEIGHTS.V4, `V4=${w.V4} 應 > 基準 ${BASE_WEIGHTS.V4}`);
});

test('weightsForIntent: 權重加總恒等於 1', () => {
  for (const q of [
    'scrape a JS-rendered dashboard and extract tables',
    'deploy a node.js service to a kubernetes cluster',
    'summarize a 2-hour video into markdown notes',
    'data model tool',
    '',
  ]) {
    const w = weightsForIntent(extractIntent(q));
    const sum = w.V1 + w.V2 + w.V3 + w.V4;
    assert.ok(Math.abs(sum - 1.0) < 1e-9, `權重加總應=1（查詢：${q}），實際=${sum}`);
  }
});

test('weightsForIntent: 權重值皆 >= 0', () => {
  for (const q of [
    'deploy a node.js service to a kubernetes cluster',
    'scrape a JS-rendered dashboard and extract tables',
    'generate a weekly PPT from a doc',
  ]) {
    const w = weightsForIntent(extractIntent(q));
    for (const k of Object.keys(w)) {
      assert.ok(w[k] >= 0, `權重 ${k} 不應 < 0（查詢：${q}）`);
    }
  }
});
