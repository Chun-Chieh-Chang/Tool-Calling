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

// ── 程度形容詞禁令（P1-b，2026-10-09）───────────────────────────────────
// 實測根據：217 條 `-` 值去重 171 個，其中只有 9 個以拉丁原形出現在評測集 267
// 題的查詢裡；高頻值反而是 production/simple/large/trivial 這類「分級判斷」——
// 使用者在任一種語言都不會這樣描述需求，結構化約束因此永遠點不燃
// （`-` 路徑在 257 題只產生 14 筆扣分事件）。分級詞沒有所指，留空比放
// 一個查不到的值誠實（同 advantages:[] 的取捨）。
test('值是純程度形容詞 → error（simple/large/trivial 型別點不燃）', () => {
  for (const entry of ['-scale:simple', '-scale:trivial', '-scale:large', '-interface:manual',
    '-format:realistic', '-scale:performance', '+deployment:complex']) {
    const r = validateToolContract({ ...baseTool, negativeFacets: [entry] });
    assert.ok(r.errors.some((e) => e.message.includes('程度詞')), `${entry} 應被攔下`);
  }
});

// 反向釘住（收緊誤報規則時必須同版列正例）：有具體所指的值不得被誤殺。
// real-time／offline／managed-cloud 是使用者真的會說出來的狀態（即時／離線／
// 託管），hipaa-compliance 與 4gb-ram 是可比對的名詞，production 指「生產環境」。
test('有具體所指的值不受程度詞規則影響（正例對照）', () => {
  const r = validateToolContract({
    ...baseTool,
    // 上限 6 筆（FACET_MAX_ENTRIES），放第 7 筆會讓本對照紅在錯誤的理由上
    negativeFacets: ['-platform:real-time', '-deployment:offline', '-ecosystem:managed-cloud',
      '-integration:hipaa-compliance', '-scale:4gb-ram', '-deployment:production'],
  });
  assert.equal(r.errors.filter((e) => e.field === 'negativeFacets').length, 0);
});

// 同標準的第二組正例：這五個複合詞一度被誤塞進禁令，但它們和 real-time 是同類
// （指一個可比對的狀態，使用者會說「底層／高吞吐／資源受限／安全關鍵／合規」）。
// 判定只看有沒有所指，不看詞長。
test('有所指的複合狀態詞不得被誤殺（正例對照二）', () => {
  const r = validateToolContract({
    ...baseTool,
    negativeFacets: ['-language:low-level', '-scale:high-throughput', '-scale:low-resource',
      '-scale:security-critical', '-deployment:compliance-sensitive', '+interface:headless'],
  });
  assert.equal(r.errors.filter((e) => e.field === 'negativeFacets').length, 0);
});

