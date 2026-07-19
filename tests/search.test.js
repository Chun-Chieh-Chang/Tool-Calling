import test from 'node:test';
import assert from 'node:assert/strict';
import { search } from '../core/search-engine.js';

test('搜尋測試 - L1 精確匹配', () => {
  const results = search('ppt-master');
  assert.ok(results.length > 0, '應該找到 ppt-master');
  assert.equal(results[0].tool.id, 'ppt-master');
  assert.equal(results[0].matchLevel, 'L1-exact');
});

test('搜尋測試 - L2 關鍵字匹配 (英文)', () => {
  const results = search('security scan');
  assert.ok(results.length > 0, '應該找到 strix');
  assert.equal(results[0].tool.id, 'strix');
  // L2 關鍵字匹配通常得分在 0.1 ~ 0.9 之間
  assert.ok(results[0].score > 0.1);
});

test('搜尋測試 - 同義詞擴展 (中文)', () => {
  // '做簡報' 應該會被擴展並匹配到 ppt-master
  const results = search('做簡報');
  assert.ok(results.length > 0, '應該找到 ppt-master');
  assert.equal(results[0].tool.id, 'ppt-master');
});

test('搜尋測試 - TF-IDF 語義檢索', () => {
  // 故意拼錯或者用不完全匹配的描述：生成 AI 圖片
  const results = search('生成 AI 圖片');
  assert.ok(results.length > 0, '應該找到圖片生成工具');
  
  // 檢查是否返回 Open Generative AI 或 ImaginAIry
  const ids = results.map(r => r.tool.id);
  assert.ok(ids.includes('open-generative-ai') || ids.includes('imaginairy'));
});

test('搜尋測試 - 分類過濾', () => {
  const results = search('ai', { category: '多媒體生成' });
  for (const r of results) {
    assert.equal(r.tool.category, '多媒體生成');
  }
});

test('搜尋測試 - 無匹配結果', () => {
  const results = search('這是一個完全不存在的神奇工具工具名稱哈哈');
  // 若閾值設定得當，應該找不到
  assert.equal(results.length, 0);
});
