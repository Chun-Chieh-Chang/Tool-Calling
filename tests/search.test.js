import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { search } from '../core/search-engine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REGISTRY_PATH = join(__dirname, '..', 'registry', 'tools.json');
const registry = JSON.parse(readFileSync(REGISTRY_PATH, 'utf-8'));
const registryTools = registry.tools;

test('搜尋測試 - L1 精確匹配', () => {
  const results = search(registryTools, 'ppt-master');
  assert.ok(results.length > 0, '應該找到 ppt-master');
  assert.equal(results[0].tool.id, 'ppt-master');
  assert.equal(results[0].matchLevel, 'L1-exact');
});

test('搜尋測試 - L2 關鍵字匹配 (英文)', () => {
  const results = search(registryTools, 'security scan vulnerability');
  assert.ok(results.length > 0, '應該找到 strix');
  // strix 應在前 5 名（topK 預設值）內
  const ids = results.map(r => r.tool.id);
  assert.ok(ids.includes('strix'), 'strix 應在搜尋結果中');
});

test('搜尋測試 - 同義詞擴展 (中文)', () => {
  // '做簡報' 應該會被擴展並匹配到 ppt-master
  const results = search(registryTools, '做簡報');
  assert.ok(results.length > 0, '應該找到 ppt-master');
  assert.equal(results[0].tool.id, 'ppt-master');
});

test('搜尋測試 - TF-IDF 語義檢索', () => {
  // 故意拼錯或者用不完全匹配的描述
  const results = search(registryTools, 'image generation');
  assert.ok(results.length > 0, '應該找到圖片生成工具');
  
  // 檢查是否返回 Open Generative AI 或 ImaginAIry
  const ids = results.map(r => r.tool.id);
  assert.ok(ids.includes('open-generative-ai') || ids.includes('imaginairy'));
});

test('搜尋測試 - 分類過濾', () => {
  const results = search(registryTools, 'ai', { category: '多媒體生成' });
  for (const r of results) {
    assert.equal(r.tool.category, '多媒體生成');
  }
});

test('搜尋測試 - 無匹配結果', () => {
  const results = search(registryTools, '這是一個完全不存在的神奇工具工具名稱哈哈');
  // 若閾值設定得當，應該找不到
  assert.equal(results.length, 0);
});
