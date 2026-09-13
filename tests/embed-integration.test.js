/**
 * embed-build 整合測試（需 API key）
 *
 * 預設跳過。要執行需設定 EMBED_API_KEY（以及可選的 EMBED_API_BASE /
 * EMBED_MODEL），並加開關 EMBED_API_TEST=1。
 *
 * 執行方式：
 *   EMBED_API_TEST=1 EMBED_API_KEY=sk-... npm run test:integration
 *
 * 此測試會：
 *   1. 以 1 筆小文字實際呼叫 embedding API（最小成本）。
 *   2. 驗證回傳向量維度正確、非全零。
 *   3. **不**寫入 registry/embeddings/vectors.json（避免污染預計算檔），
 *      只驗證 API 端點可用。
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { toolEmbedText } from '../core/embedding.js';

const SKIP_INTEGRATION = !(
  process.env.EMBED_API_TEST === '1' ||
  process.env.npm_lifecycle_event === 'test:integration'
);
const INTEGRATION_SKIP_REASON =
  '整合測試：需外部 embedding API 與網路，請用 EMBED_API_TEST=1 npm run test:integration';

const API_KEY = process.env.EMBED_API_KEY;
const API_BASE = (process.env.EMBED_API_BASE || 'https://api.openai.com/v1').replace(/\/$/, '');
const MODEL = process.env.EMBED_MODEL || 'text-embedding-3-small';

async function callEmbeddingAPI(texts, apiBase, model, dimensions, key) {
  const res = await fetch(`${apiBase}/embeddings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      input: texts,
      ...(dimensions ? { dimensions } : {}),
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Embedding API Error ${res.status}: ${errText}`);
  }
  const data = await res.json();
  const byIndex = new Map(data.data.map((d) => [d.index, d.embedding]));
  return texts.map((_, i) => byIndex.get(i));
}

describe('Embedding API 整合', { skip: SKIP_INTEGRATION ? INTEGRATION_SKIP_REASON : false }, () => {
  it('能實際取得 1 筆工具的 embedding 向量', async () => {
    assert.ok(API_KEY, 'EMBED_API_TEST=1 時需設定 EMBED_API_KEY');
    const tool = {
      name: 'TestTool',
      description: 'A tool that does X',
      useCase: 'Use case for X',
      triggers: ['x', 'test'],
    };
    const text = toolEmbedText(tool);
    const vectors = await callEmbeddingAPI([text], API_BASE, MODEL, 1024, API_KEY);
    assert.equal(vectors.length, 1);
    const v = vectors[0];
    assert.ok(Array.isArray(v), '向量應為陣列');
    assert.ok(v.length > 0, '向量非空');
    assert.ok(v.some((n) => n !== 0), '向量非全零');
  });
});
