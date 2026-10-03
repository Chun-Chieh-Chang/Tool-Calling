import test from 'node:test';
import assert from 'node:assert/strict';
import { validateToolContract } from '../core/registry-contract.js';

const baseTool = {
  id: 't1',
  name: 'T1',
  url: 'https://example.com',
  description: 'a perfectly fine description',
  category: '開發工具',
  language: 'typescript',
  triggers: ['t1', 'tool one'],
  status: 'active',
};

test('缺 negativeFacets 欄位 = 合法（optional）', () => {
  const r = validateToolContract(baseTool);
  assert.equal(r.errors.filter((e) => e.field === 'negativeFacets').length, 0);
});

test('合法條目（-排除與 +要求）不產生 error', () => {
  const r = validateToolContract({ ...baseTool, negativeFacets: ['-platform:web', '+ecosystem:microsoft'] });
  assert.equal(r.errors.filter((e) => e.field === 'negativeFacets').length, 0);
});

test('非陣列 → error', () => {
  const r = validateToolContract({ ...baseTool, negativeFacets: 'platform:web' });
  assert.ok(r.errors.some((e) => e.field === 'negativeFacets' && e.message.includes('陣列')));
});

test('缺極性符號 → error', () => {
  const r = validateToolContract({ ...baseTool, negativeFacets: ['platform:web'] });
  assert.ok(r.errors.some((e) => e.message.includes('格式不符')));
});

test('facet 不在白名單 → error', () => {
  const r = validateToolContract({ ...baseTool, negativeFacets: ['-flavor:vanilla'] });
  assert.ok(r.errors.some((e) => e.message.includes('白名單')));
});

test('value 超過 3 個 token → error', () => {
  const r = validateToolContract({ ...baseTool, negativeFacets: ['-platform:windows xp vista seven'] });
  assert.ok(r.errors.some((e) => e.message.includes('token')));
});

test('超過 6 筆 → error', () => {
  const entries = ['-platform:web', '-language:python', '-license:agpl', '-pricing:paid', '-deployment:cloud', '-format:pdf', '-scale:enterprise'];
  const r = validateToolContract({ ...baseTool, negativeFacets: entries });
  assert.ok(r.errors.some((e) => e.message.includes('6 筆')));
});

test('重複條目 → error', () => {
  const r = validateToolContract({ ...baseTool, negativeFacets: ['-platform:web', '-platform:web'] });
  assert.ok(r.errors.some((e) => e.message.includes('重複')));
});
