import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, symlinkSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { cosine, toolEmbedText, loadVectors } from '../core/embedding.js';
import { agentRetrieve } from '../core/agent-retrieval.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REGISTRY_PATH = path.join(__dirname, '..', 'registry', 'tools.json');
const registry = JSON.parse(readFileSync(REGISTRY_PATH, 'utf-8'));
const registryTools = registry.tools.filter((t) => t.status === 'active' || t.status === 'experimental');

// embedding.js 固定讀 registry/embeddings/vectors.json。
// 離線安全測試：該檔案不存在時 loadVectors()=null。
// 若使用者已跑過 embed-build，檔案可能存在——此測試不依賴檔案狀態，
// 只驗證 loadVectors 回傳值結構（null 或帶 tools 物件皆可接受）。

// ── cosine 純函式 ─────────────────────────────────────────────────────────
test('embedding - cosine 同向回傳 1', () => {
  const v = [1, 0, 0];
  assert.equal(cosine(v, [1, 0, 0]), 1);
});

test('embedding - cosine 正交回傳 0', () => {
  assert.equal(cosine([1, 0], [0, 1]), 0);
});

test('embedding - cosine 反向回傳 0（max(0, cos) 閘值）', () => {
  // 反向 cosine = -1，經 max(0,·) 後為 0
  assert.equal(cosine([1, 0], [-1, 0]), 0);
});

test('embedding - cosine 長度不符回傳 0', () => {
  assert.equal(cosine([1, 0, 0], [1, 0]), 0);
});

test('embedding - cosine null/非陣列回傳 0', () => {
  assert.equal(cosine(null, [1]), 0);
  assert.equal(cosine([1], undefined), 0);
  assert.equal(cosine([1], 'x'), 0);
});

test('embedding - cosine 空向量回傳 0', () => {
  assert.equal(cosine([], [1]), 0);
});

test('embedding - toolEmbedText 拼接欄位且截斷 8000 字', () => {
  const tool = {
    name: 'Test',
    description: 'desc',
    useCase: 'use',
    triggers: ['a', 'b'],
  };
  const text = toolEmbedText(tool);
  assert.ok(text.includes('Test') && text.includes('desc') && text.includes('use') && text.includes('a b'));
  const long = toolEmbedText({ name: 'x'.repeat(9000) });
  assert.equal(long.length, 8000);
});

// ── agentRetrieve 的 V0 行為（離線安全 + 啟用）────────────────────────────
// 造兩筆工具：A 語意接近查詢、B 遠；給 V0 向量後 A 應排前
const fakeTools = [
  {
    id: 'toolA', name: 'alpha', status: 'active',
    triggers: ['alpha'], description: 'Alpha does thing A', useCase: 'scenario A',
    capabilities: ['capA'],
  },
  {
    id: 'toolB', name: 'beta', status: 'active',
    triggers: ['beta'], description: 'Beta does thing B', useCase: 'scenario B',
    capabilities: ['capB'],
  },
];

test('agentRetrieve - 無 vectors 時 V0 停用（perDimension 無 V0 鍵）', () => {
  const r = agentRetrieve(fakeTools, 'alpha', { topK: 5 });
  for (const x of r.topK) {
    assert.ok(!('V0' in x.perDimension), '離線時不應有 V0');
  }
});

test('agentRetrieve - 提供 vectors 時 V0 啟用且同向工具排前', () => {
  // toolA 與查詢向量同向（cos≈1），toolB 正交（cos=0）。
  // toolA 的 V0 應被計算且 > toolB 的 V0。
  const vectors = {
    model: 'test', dimensions: 3,
    tools: {
      toolA: [1, 0, 0],
      toolB: [0, 1, 0],
    },
  };
  const r = agentRetrieve(fakeTools, 'alpha', { topK: 5, vectors, queryVector: [1, 0, 0] });
  const aV0 = r.topK.find((x) => x.id === 'toolA')?.perDimension.V0;
  assert.equal(aV0, 1, 'toolA 同向 V0=1');
  // toolB 因 V0=0、四維也低 → bestDim=0，被 filter 排除（合理：無有效信號）
  // 只驗證 toolA 在 topK 且 V0 被啟用
  assert.equal(r.topK[0].id, 'toolA');
  assert.ok('V0' in r.topK[0].perDimension, 'V0 鍵應存在');
});

test('agentRetrieve - queryVector 為 null 時 V0 停用（即使提供 vectors）', () => {
  const vectors = { model: 'test', dimensions: 3, tools: { toolA: [1, 0, 0] } };
  const r = agentRetrieve(fakeTools, 'alpha', { topK: 5, vectors, queryVector: null });
  for (const x of r.topK) {
    assert.ok(!('V0' in x.perDimension), 'queryVector=null 時 V0 停用');
  }
});

test('agentRetrieve - vectors 缺某工具 id 時該筆 V0=0（不崩、不算分）', () => {
  // toolA 有向量且與查詢同向（V0=1）；toolB 在 vectors 中缺席。
  // toolB 若四維有信號仍可進 topK，但 V0=0。
  const tools = [
    {
      id: 'toolA', name: 'alpha', status: 'active',
      triggers: ['alpha'], description: 'Alpha', useCase: 'scenario A',
      capabilities: ['capA'],
    },
    {
      id: 'toolB', name: 'beta', status: 'active',
      // toolB 的 triggers 也含 "alpha"，讓它四維有信號、必進 topK，
      // 但它的向量缺席 → V0 應為 0（不崩）。
      triggers: ['alpha', 'beta'], description: 'Beta mentions alpha',
      useCase: 'scenario B', capabilities: ['capB'],
    },
  ];
  const vectors = { model: 'test', dimensions: 3, tools: { toolA: [1, 0, 0] } };
  const r = agentRetrieve(tools, 'alpha', { topK: 5, vectors, queryVector: [1, 0, 0] });
  const aV0 = r.topK.find((x) => x.id === 'toolA')?.perDimension.V0;
  const bV0 = r.topK.find((x) => x.id === 'toolB')?.perDimension.V0;
  assert.equal(aV0, 1, 'toolA 同向 V0=1');
  assert.equal(bV0, 0, 'toolB 缺向量 V0=0（不崩、不算分）');
  // toolA 的 V0 高，應排在 toolB 前
  assert.equal(r.topK[0].id, 'toolA');
});

// ── loadVectors 離線安全 ──────────────────────────────────────────────────
test('embedding - loadVectors 回傳 null 或帶 tools 物件（離線安全）', () => {
  const v = loadVectors();
  // 未跑 embed-build 時應為 null；已跑過則是帶 tools 的物件。
  // 兩者皆屬合法離線狀態，不崩即可。
  assert.ok(v === null || typeof v === 'object', 'loadVectors 回傳 null 或物件');
  if (v !== null) {
    assert.ok(typeof v.tools === 'object' && v.tools !== null, 'loadVectors 應含 tools');
  }
});
