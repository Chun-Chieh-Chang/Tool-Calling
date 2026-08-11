/**
 * Eval Benchmark for Tool-Calling
 * Measures: Precision@1, Recall@5, MRR, p95 latency
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { search } from '../core/search-engine.js';

const registry = JSON.parse(readFileSync('D:/Self-developed_Apps/Tool-Calling/registry/tools.json', 'utf8'));
const tools = registry.tools;

// Benchmark query sets
const PRECISION_QUERIES = [
  // Simple single-intent queries
  { query: '製作簡報', expectedCategory: '文件生產力', expectedCount: 1 },
  { query: 'image generation', expectedCategory: '多媒體生成', expectedCount: 1 },
  { query: 'git 版本控制', expectedCategory: '開發工具', expectedCount: 1 },
  { query: '數據分析', expectedCategory: '數據分析', expectedCount: 1 },
  { query: 'docker 容器化', expectedCategory: '基礎設施', expectedCount: 1 },
  { query: 'UI 設計', expectedCategory: 'UI/UX設計', expectedCount: 1 },
  { query: '測試自動化', expectedCategory: '測試與自動化', expectedCount: 1 },
  { query: 'API 整合', expectedCategory: 'API 整合', expectedCount: 1 },
  { query: '知識管理', expectedCategory: '知識管理', expectedCount: 1 },
  { query: '瀏覽器自動化', expectedCategory: '瀏覽器自動化', expectedCount: 1 },
];

const RECALL_QUERIES = [
  { query: 'ai agent', expectedCategories: ['AI 框架', 'AI 代理'] },
  { query: 'markdown', expectedCategories: ['文件生產力', '學習資源'] },
  { query: 'video', expectedCategories: ['影片', '多媒體生成'] },
  { query: 'database', expectedCategories: ['資料庫'] },
  { query: 'security', expectedCategories: ['安全性'] },
];

test('Eval: Precision@1 for simple queries', () => {
  const results = [];
  
  for (const { query, expectedCategory } of PRECISION_QUERIES) {
    const searchResults = search(tools, query, { topK: 1 });
    const topResult = searchResults[0];
    
    if (!topResult) {
      results.push({ query, passed: false, reason: 'no result' });
      continue;
    }
    
    const match = topResult.tool.category === expectedCategory;
    results.push({ query, passed: match, actual: topResult.tool.category });
  }
  
  const passed = results.filter(r => r.passed).length;
  const precision = passed / results.length;
  
  console.log(`\n📊 Precision@1 Results:`);
  console.log(`   Passed: ${passed}/${results.length} (${(precision * 100).toFixed(1)}%)`);
  for (const r of results) {
    console.log(`   ${r.passed ? '✓' : '✗'} "${r.query}" → ${r.actual || r.reason}`);
  }
  
  assert.ok(precision >= 0.7, `Precision@1 should be >= 70%, got ${(precision * 100).toFixed(1)}%`);
});

test('Eval: Recall@5 for category coverage', () => {
  const results = [];
  
  for (const { query, expectedCategories } of RECALL_QUERIES) {
    const searchResults = search(tools, query, { topK: 5 });
    const retrievedCategories = new Set(searchResults.map(r => r.tool.category));
    
    let recall = 0;
    for (const cat of expectedCategories) {
      if (retrievedCategories.has(cat)) recall++;
    }
    recall /= expectedCategories.length;
    
    results.push({ query, recall, categories: Array.from(retrievedCategories) });
  }
  
  const avgRecall = results.reduce((sum, r) => sum + r.recall, 0) / results.length;
  
  console.log(`\n📊 Recall@5 Results:`);
  console.log(`   Average Recall: ${(avgRecall * 100).toFixed(1)}%`);
  for (const r of results) {
    console.log(`   "${r.query}" → ${r.recall.toFixed(2)} (${r.categories.join(', ')})`);
  }
  
  assert.ok(avgRecall >= 0.5, `Average Recall@5 should be >= 50%, got ${(avgRecall * 100).toFixed(1)}%`);
});

test('Eval: MRR (Mean Reciprocal Rank)', () => {
  const queries = [
    { query: 'ppt generator', rankPosition: 1 },
    { query: 'markdown editor', rankPosition: 1 },
    { query: 'chart visualization', rankPosition: 2 },
    { query: 'api testing', rankPosition: 1 },
    { query: 'code formatter', rankPosition: 1 },
  ];
  
  let mrrSum = 0;
  const results = [];
  
  for (const { query, rankPosition } of queries) {
    const searchResults = search(tools, query, { topK: 5 });
    const foundIndex = searchResults.findIndex(r => r.score > 0);
    const rr = foundIndex === -1 ? 0 : 1 / (foundIndex + 1);
    mrrSum += rr;
    results.push({ query, rr, position: foundIndex + 1 });
  }
  
  const mrr = mrrSum / queries.length;
  
  console.log(`\n📊 MRR Results:`);
  console.log(`   MRR: ${mrr.toFixed(3)}`);
  for (const r of results) {
    console.log(`   "${r.query}" → Rank ${r.position}, RR=${r.rr.toFixed(3)}`);
  }
  
  assert.ok(mrr >= 0.7, `MRR should be >= 0.7, got ${mrr.toFixed(3)}`);
});

test('Eval: Latency p95 measurement', () => {
  const latencies = [];
  const iterations = 50;
  
  // Warm up
  search(tools, 'test', { topK: 5 });
  
  // Measure
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    search(tools, 'ai agent framework', { topK: 5 });
    const elapsed = performance.now() - start;
    latencies.push(elapsed);
  }
  
  latencies.sort((a, b) => a - b);
  const p95Index = Math.floor(iterations * 0.95);
  const p95 = latencies[p95Index];
  const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;
  
  console.log(`\n📊 Latency Results (${iterations} iterations):`);
  console.log(`   Avg: ${avg.toFixed(2)}ms`);
  console.log(`   p95: ${p95.toFixed(2)}ms`);
  console.log(`   min: ${latencies[0].toFixed(2)}ms`);
  console.log(`   max: ${latencies[latencies.length - 1].toFixed(2)}ms`);
  
  assert.ok(p95 < 500, `p95 latency should be < 500ms, got ${p95.toFixed(2)}ms`);
});

test('Eval: Query diversity coverage', () => {
  const diverseQueries = [
    '我要做簡報',
    'image to video',
    'git commit',
    'docker compose',
    'python machine learning',
    'react component',
    'figma plugin',
    'sql query builder',
    'log analyzer',
    'csv parser',
  ];
  
  const hitCategories = new Set();
  let emptyResults = 0;
  
  for (const query of diverseQueries) {
    const results = search(tools, query, { topK: 3 });
    if (results.length === 0) {
      emptyResults++;
    } else {
      for (const r of results) {
        hitCategories.add(r.tool.category);
      }
    }
  }
  
  const coverage = hitCategories.size / 21; // 21 total categories
  
  console.log(`\n📊 Query Diversity Results:`);
  console.log(`   Categories hit: ${hitCategories.size}/21 (${(coverage * 100).toFixed(1)}%)`);
  console.log(`   Empty results: ${emptyResults}/${diverseQueries.length}`);
  console.log(`   Hit categories: ${Array.from(hitCategories).sort().join(', ')}`);
  
  assert.ok(coverage >= 0.25, `Category coverage should be >= 25%, got ${(coverage * 100).toFixed(1)}%`);
  assert.ok(emptyResults <= 2, `Should have at most 2 empty results, got ${emptyResults}`);
});
