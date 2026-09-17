import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePick, parsePickList, buildPrompt, rerankCandidates, rerankTwoStage, promote } from '../core/llm-rerank.js';
import { retrieveWithRerank } from '../core/retrieval-fusion.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const registry = JSON.parse(readFileSync(path.join(__dirname, '..', 'registry', 'tools.json'), 'utf8'));
const registryTools = registry.tools.filter((t) => t.status === 'active' || t.status === 'experimental');

const CANDS = ['alpha', 'beta', 'gamma', 'delta'];

// ── parsePick：三種常見回傳格式 ────────────────────────────────────────────
// 這是 2026-09-14 的關鍵 bug：只處理 id 字串、沒處理編號，
// 導致 42 筆全數解析失敗並跑出「rerank 反而更差」的錯誤結論。

test('parsePick - 純數字視為 1-based 編號', () => {
  assert.equal(parsePick('3', CANDS), 'gamma');
  assert.equal(parsePick('1', CANDS), 'alpha');
  assert.equal(parsePick('4', CANDS), 'delta');
});

test('parsePick - 數字帶標點仍可解析', () => {
  assert.equal(parsePick('2.', CANDS), 'beta');
  assert.equal(parsePick('2)', CANDS), 'beta');
});

test('parsePick - 回傳含 id 字串時直接採用', () => {
  assert.equal(parsePick('我選 beta', CANDS), 'beta');
  assert.equal(parsePick('gamma', CANDS), 'gamma');
});

test('parsePick - 文字中夾雜數字時寬鬆取第一個', () => {
  assert.equal(parsePick('答案是第 2 個', CANDS), 'beta');
});

test('parsePick - 優先採用 id 精確匹配而非數字', () => {
  // 文字同時含 id 與數字時，id 優先（避免 "tool 3" 被當成編號）
  assert.equal(parsePick('gamma', ['a', 'b', 'gamma']), 'gamma');
});

test('parsePick - 超出範圍的編號回傳 null', () => {
  assert.equal(parsePick('99', CANDS), null);
  assert.equal(parsePick('0', CANDS), null);
});

test('parsePick - 空值／無法解析回傳 null', () => {
  assert.equal(parsePick('', CANDS), null);
  assert.equal(parsePick(null, CANDS), null);
  assert.equal(parsePick('我不知道', CANDS), null);
});

test('parsePick - 候選為空回傳 null', () => {
  assert.equal(parsePick('1', []), null);
  assert.equal(parsePick('1', null), null);
});

// ── parsePick：NONE 棄權（2026-09-17）────────────────────────────────────
// 動機：原本只要模型回了 id 就無條件替換，導致「詞彙引擎 top-1 本來就正確」
// 的案例被換成錯的（實測 c02：正確答案就在第 1 名卻被換掉）。
// 加入棄權出口後，單階段 Hit@1 由 58.3% 提升至 75.0%（12 筆樣本）。

test('parsePick - NONE 各種大小寫皆視為不替換', () => {
  for (const t of ['NONE', 'none', 'None', ' NONE ', 'NONE.']) {
    assert.equal(parsePick(t, CANDS), null, `"${t}" 應回傳 null（不替換）`);
  }
});

// ── parsePickList：多選（分批淘汰的第一階段用）────────────────────────────

test('parsePickList - 解析逗號分隔的編號', () => {
  assert.deepEqual(parsePickList('3, 1', CANDS, 2), ['gamma', 'alpha']);
  assert.deepEqual(parsePickList('2,4', CANDS, 2), ['beta', 'delta']);
});

test('parsePickList - 解析中文頓號與換行', () => {
  assert.deepEqual(parsePickList('3、1', CANDS, 2), ['gamma', 'alpha']);
  assert.deepEqual(parsePickList('2\n4', CANDS, 2), ['beta', 'delta']);
});

test('parsePickList - 解析 id 字串', () => {
  assert.deepEqual(parsePickList('gamma, alpha', CANDS, 2), ['gamma', 'alpha']);
});

test('parsePickList - 遵守 limit 且不重複', () => {
  assert.deepEqual(parsePickList('1,2,3,4', CANDS, 2), ['alpha', 'beta']);
  assert.deepEqual(parsePickList('1,1,1', CANDS, 3), ['alpha'], '重複應只算一次');
});

test('parsePickList - 只回一個時仍可解析（相容單一格式）', () => {
  assert.deepEqual(parsePickList('beta', CANDS, 2), ['beta']);
});

test('parsePickList - 無法解析或空候選時回傳空陣列', () => {
  assert.deepEqual(parsePickList('完全無法解析', CANDS, 2), []);
  assert.deepEqual(parsePickList('', CANDS, 2), []);
  assert.deepEqual(parsePickList('1', [], 2), []);
  assert.deepEqual(parsePickList('1', null, 2), []);
});

// ── buildPrompt ───────────────────────────────────────────────────────────
test('buildPrompt - 含需求、編號、id 與簡介', () => {
  const p = buildPrompt('需要畫圖表', [{ id: 'chart-x', description: 'chart tool' }]);
  assert.ok(p.includes('需要畫圖表'));
  assert.ok(p.includes('1. chart-x'));
  assert.ok(p.includes('chart tool'));
});

test('buildPrompt - 容許 id 字串陣列（向後相容）', () => {
  const p = buildPrompt('q', ['tool-a', 'tool-b']);
  assert.ok(p.includes('1. tool-a'));
  assert.ok(p.includes('2. tool-b'));
});

test('buildPrompt - 含 NONE 棄權規則', () => {
  // 沒有這個出口，模型會勉強挑一個，把本來正確的 top-1 換掉
  const p = buildPrompt('q', ['tool-a']);
  assert.ok(p.includes('NONE'), '應告知模型可回傳 NONE');
  assert.ok(p.includes('寧可回 NONE'), '應鼓勵模型在不確定時棄權');
});

// ── rerankTwoStage：分批淘汰 ──────────────────────────────────────────────
// 註：實測顯示兩階段在此資料集上並未優於單階段（58.3% vs 58.3%），
// 且成本較高，故未接入正式路徑。保留實作與測試以記錄這個結論。

test('rerankTwoStage - 無候選時回傳 error 且不拋出', async () => {
  const r = await rerankTwoStage('q', [], { apiKey: 'x' });
  assert.equal(r.picked, null);
  assert.equal(r.error, 'no candidates');
});

test('rerankTwoStage - 無 api key 時離線安全（不呼叫網路）', async () => {
  const prev = process.env.AGNES_API_KEY;
  delete process.env.AGNES_API_KEY;
  try {
    const cands = Array.from({ length: 25 }, (_, i) => ({ id: `t${i}`, description: 'd' }));
    const r = await rerankTwoStage('q', cands);
    assert.equal(r.picked, null);
    assert.ok(r.error, '應回傳 error');
  } finally {
    if (prev !== undefined) process.env.AGNES_API_KEY = prev;
  }
});

test('rerankTwoStage - 候選少於一批時退回單階段', async () => {
  const prev = process.env.AGNES_API_KEY;
  delete process.env.AGNES_API_KEY;
  try {
    const r = await rerankTwoStage('q', ['a', 'b'], { batchSize: 10 });
    assert.equal(r.stages.mode, 'single', '不應為 2 個候選跑兩階段');
  } finally {
    if (prev !== undefined) process.env.AGNES_API_KEY = prev;
  }
});

// ── rerankCandidates：離線安全與優雅降級 ────────────────────────────────────
test('rerankCandidates - 無候選時回傳 error 且不拋出', async () => {
  const r = await rerankCandidates('q', [], { apiKey: 'x' });
  assert.equal(r.picked, null);
  assert.equal(r.error, 'no candidates');
});

test('rerankCandidates - 無 api key 時回傳 error（離線安全，不呼叫網路）', async () => {
  const prev = process.env.AGNES_API_KEY;
  delete process.env.AGNES_API_KEY;
  try {
    const r = await rerankCandidates('q', ['a', 'b']);
    assert.equal(r.picked, null);
    assert.equal(r.error, 'no api key (offline)');
  } finally {
    if (prev !== undefined) process.env.AGNES_API_KEY = prev;
  }
});

test('rerankCandidates - API 失敗時回傳 error 不拋出', async () => {
  // 指向無法連線的埠號，驗證錯誤被捕捉。maxRetries=0 避免測試等待重試退避。
  const r = await rerankCandidates('q', ['a', 'b'], {
    apiKey: 'test-key',
    apiBase: 'http://127.0.0.1:59999/v1',
    timeoutMs: 2000,
    maxRetries: 0,
  });
  assert.equal(r.picked, null);
  assert.ok(r.error, '應回傳 error 說明失敗原因');
});

test('rerankCandidates - maxRetries=0 時不重試（快速失敗）', async () => {
  const t0 = Date.now();
  const r = await rerankCandidates('q', ['a', 'b'], {
    apiKey: 'test-key',
    apiBase: 'http://127.0.0.1:59999/v1',
    timeoutMs: 500,
    maxRetries: 0,
  });
  assert.equal(r.picked, null);
  assert.ok(Date.now() - t0 < 3000, 'maxRetries=0 不應等待退避');
});

// ── promote ───────────────────────────────────────────────────────────────
test('promote - 把選中項移到最前', () => {
  const out = promote([{ id: 'a' }, { id: 'b' }, { id: 'c' }], 'c');
  assert.deepEqual(out.map((x) => x.id), ['c', 'a', 'b']);
});

test('promote - 選中項已在首位則原樣回傳', () => {
  const items = [{ id: 'a' }, { id: 'b' }];
  assert.deepEqual(promote(items, 'a'), items);
});

test('promote - picked 為 null 或找不到時原樣回傳', () => {
  const items = [{ id: 'a' }, { id: 'b' }];
  assert.deepEqual(promote(items, null), items);
  assert.deepEqual(promote(items, 'zzz'), items);
});

test('promote - 不修改原陣列', () => {
  const items = [{ id: 'a' }, { id: 'b' }];
  promote(items, 'b');
  assert.deepEqual(items.map((x) => x.id), ['a', 'b']);
});

// ── retrieveWithRerank：離線時必須與 retrieve() 行為一致 ───────────────────
// 這裡全部在無 API key 的前提下執行，確保 rerank 故障/停用不會改變檢索結果。

test('retrieveWithRerank - 無 api key 時略過 rerank 且維持原順序', async () => {
  const prev = process.env.AGNES_API_KEY;
  delete process.env.AGNES_API_KEY;
  try {
    const r = await retrieveWithRerank(registryTools, '我要做簡報', { topK: 5 });
    assert.equal(r.rerank.applied, false);
    assert.equal(r.rerank.reason, 'no api key (offline)');
    assert.ok(r.results.length <= 5, '結果應截斷到 topK');
    assert.ok(r.results.length > 0 && r.results[0].id, '應有檢索結果');
  } finally {
    if (prev !== undefined) process.env.AGNES_API_KEY = prev;
  }
});

test('retrieveWithRerank - rerank=false 時明確停用', async () => {
  const r = await retrieveWithRerank(registryTools, '我要做簡報', { topK: 5, rerank: false });
  assert.equal(r.rerank.applied, false);
  assert.equal(r.rerank.reason, 'disabled');
});

test('retrieveWithRerank - 回傳筆數不超過 topK（即便召回數較大）', async () => {
  const prev = process.env.AGNES_API_KEY;
  delete process.env.AGNES_API_KEY;
  try {
    const r = await retrieveWithRerank(registryTools, '圖表視覺化工具', { topK: 3, recallK: 20 });
    assert.ok(r.results.length <= 3, `應 ≤3 筆，實際 ${r.results.length}`);
  } finally {
    if (prev !== undefined) process.env.AGNES_API_KEY = prev;
  }
});

test('retrieveWithRerank - 無候選時安全略過', async () => {
  const prev = process.env.AGNES_API_KEY;
  delete process.env.AGNES_API_KEY;
  try {
    const r = await retrieveWithRerank(registryTools, '這是一個完全不存在的神奇工具哈哈', { topK: 5 });
    assert.equal(r.rerank.applied, false);
    assert.ok(['no candidates', 'no api key (offline)'].includes(r.rerank.reason));
  } finally {
    if (prev !== undefined) process.env.AGNES_API_KEY = prev;
  }
});
