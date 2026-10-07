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

test('value 含 non- → error（極性歸符號，雙重否定不得復活）', () => {
  const r = validateToolContract({ ...baseTool, negativeFacets: ['-ecosystem:non-microsoft-cloud'] });
  assert.ok(r.errors.some((e) => e.message.includes('non-')));
});

// 實測漏網（2026-10-07 infer-facets 19 支全跑）：舊規則只抓 `(^|\s)non-`，
// 於是 `-ecosystem:not bootstrap`（獨立字）與 `-language:backend-non-frontend`
// （連字號後的 non-）也一併進門。兩者都把雙重否定從散文搬進結構化資料。
test('value 含獨立否定詞 not → error（not bootstrap 型別漏網）', () => {
  const r = validateToolContract({ ...baseTool, negativeFacets: ['-ecosystem:not bootstrap'] });
  assert.ok(r.errors.some((e) => e.message.includes('否定詞')));
});

test('value 含連字號後的 non- → error（backend-non-frontend 型別漏網）', () => {
  const r = validateToolContract({ ...baseTool, negativeFacets: ['-language:backend-non-frontend'] });
  assert.ok(r.errors.some((e) => e.message.includes('否定詞')));
});

// 收緊規則的對照組：含 not 字元序列但非獨立否定詞的合法值，不得被一刀誤殺。
test('值中「note/cannot/without-」以外的字串不受影響（誤殺對照）', () => {
  const r = validateToolContract({
    ...baseTool,
    negativeFacets: ['-format:note-taking', '-scale:cannot-fit', '+platform:bootstrap'],
  });
  assert.equal(r.errors.filter((e) => e.field === 'negativeFacets').length, 0);
});

