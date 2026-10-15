import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeCases, summarizeFailures, formatTable, formatFailures } from '../core/ceiling.js';

/**
 * 2026-10-15 Q5=A：天花板分析的失敗分類邏輯。
 *
 * 只測「純邏輯」——用小樣本（2 題 × 真實 registry）秒級跑完；
 * 整庫量測（257 題 ~16 秒）留在 `npm run ceiling`，不進 npm test。
 */

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const reg = JSON.parse(readFileSync(path.join(ROOT, 'registry', 'tools.json'), 'utf8'));
const tools = reg.tools.filter((t) => t.status === 'active' || t.status === 'experimental');

test('analyzeCases：empty-set 題不計入、records 欄位齊全', () => {
  const cases = [
    { id: 'x1', type: 'direct', query: '把 Excel 轉成 HTML 表格', expected: ['xlsxtohtmlconverter'] },
    { id: 'x2', type: 'empty-set', query: '不存在的東西', expected: [] },
  ];
  const { stat, records } = analyzeCases(cases, tools, 5);
  assert.equal(records.length, 1);
  assert.equal(records[0].id, 'x1');
  assert.equal(stat['empty-set'], undefined);
  assert.equal(stat.direct.n, 1);
  assert.ok(Array.isArray(records[0].top5));
  assert.ok(records[0].top5.length <= 5);
  assert.ok(records[0].bestRank === null || records[0].bestRank >= 1);
});

test('summarizeFailures：召回缺口與排序問題互斥且可分類', () => {
  const records = [
    { id: 'a', bestRank: null },   // 未進榜
    { id: 'b', bestRank: 3 },      // 好
    { id: 'c', bestRank: 6 },      // 排序問題（>5）
    { id: 'd', bestRank: 5 },      // 邊界：不算失敗
  ];
  const { recallMiss, rankLoss } = summarizeFailures(records, { rankThreshold: 5 });
  assert.deepEqual(recallMiss.map((r) => r.id), ['a']);
  assert.deepEqual(rankLoss.map((r) => r.id), ['c']);
});

test('summarizeFailures：rankThreshold 可調', () => {
  const records = [{ id: 'c', bestRank: 6 }, { id: 'd', bestRank: 11 }];
  assert.deepEqual(summarizeFailures(records, { rankThreshold: 10 }).rankLoss.map((r) => r.id), ['d']);
});

test('formatTable：輸出含合計列與欄位說明', () => {
  const { stat } = analyzeCases(
    [{ id: 'x1', type: 'direct', query: '把 Excel 轉成 HTML 表格', expected: ['xlsxtohtmlconverter'] }],
    tools,
    5
  );
  const out = formatTable(stat);
  assert.match(out, /合計/);
  assert.match(out, /天花板 = 答案有無進 top-50/);
  assert.match(out, /direct/);
});

test('formatFailures：計數行與 only 過濾', () => {
  const records = [
    { id: 'a', type: 'semantic', query: 'q-a', expected: ['e'], bestRank: null, top5: ['p1', 'p2', 'p3', 'p4', 'p5'] },
    { id: 'b', type: 'semantic', query: 'q-b', expected: ['e'], bestRank: 9, top5: ['p1', 'p2', 'p3', 'p4', 'p5'] },
    { id: 'c', type: 'direct', query: 'q-c', expected: ['e'], bestRank: 1, top5: ['e'] },
  ];
  const all = formatFailures(records, { topK: 50, rankThreshold: 5, limit: 40 });
  assert.match(all, /召回缺口（未進 top-50）：1 題/);
  assert.match(all, /排序問題（進榜但排名 > 5）：1 題/);
  assert.match(all, /q-a/);
  assert.match(all, /q-b/);
  assert.doesNotMatch(all, /q-c/); // 排名 1 不算失敗

  const onlyRecall = formatFailures(records, { topK: 50, rankThreshold: 5, limit: 40, only: 'recall' });
  assert.match(onlyRecall, /q-a/);
  assert.doesNotMatch(onlyRecall, /q-b/);

  const onlyRank = formatFailures(records, { topK: 50, rankThreshold: 5, limit: 40, only: 'rank' });
  assert.match(onlyRank, /q-b/);
  assert.doesNotMatch(onlyRank, /q-a/);
});

test('formatFailures：limit 生效並提示省略數', () => {
  const records = Array.from({ length: 5 }, (_, i) => ({
    id: `r${i}`, type: 'semantic', query: `q${i}`, expected: ['e'], bestRank: 9, top5: ['p'],
  }));
  const out = formatFailures(records, { limit: 2 });
  assert.match(out, /其餘 3 題略/);
});
