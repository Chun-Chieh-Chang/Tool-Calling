import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CLARIFY_DIMENSIONS,
  ANY_VALUE,
  analyzeAmbiguity,
  nextQuestion,
  applyAnswer,
  planClarification,
} from '../core/clarifier.js';

const TOOLS = [
  { id: 'a', name: 'A', language: 'Python', category: '資料處理', install: { method: 'pip' } },
  { id: 'b', name: 'B', language: 'TypeScript', category: '資料處理', install: { method: 'npm' } },
  { id: 'c', name: 'C', language: 'Python', category: '文件處理', install: { method: 'pip' } },
  { id: 'd', name: 'D', language: 'Java', category: '文件處理', install: { method: 'maven' } },
];
const cands = (...ids) => ids.map((id) => ({ id }));

// ── 分歧分析 ───────────────────────────────────────────────────────────────

test('clarifier: 候選在語言上分歧時，語言維度的 gain 最高', () => {
  const ranked = analyzeAmbiguity(cands('a', 'b', 'c', 'd'), TOOLS);
  assert.ok(ranked.length > 0);
  assert.equal(ranked[0].key, 'language');
  assert.ok(ranked[0].entropy > 0, 'entropy 應 > 0');
  assert.equal(ranked[0].options.length, 3); // Python×2 / TypeScript / Java（取前 4）
});

test('clarifier: 候選在某維度完全一致時，該維度 entropy = 0（不值得問）', () => {
  // b 與 c：category 都是「資料處理」/「文件處理」不同，language 也不同
  // 用 a 與 c：language 都是 Python
  const ranked = analyzeAmbiguity(cands('a', 'c'), TOOLS);
  const lang = ranked.find((r) => r.key === 'language');
  assert.equal(lang.entropy, 0, '兩者語言相同 → entropy 應為 0');
  assert.equal(lang.gain, 0);
});

test('clarifier: 沒有資料的維度不會出現在結果裡', () => {
  const noMeta = [{ id: 'x', name: 'X' }, { id: 'y', name: 'Y' }];
  const ranked = analyzeAmbiguity(cands('x', 'y'), noMeta);
  assert.equal(ranked.length, 0);
});

test('clarifier: exclude 可排除問過的維度', () => {
  const ranked = analyzeAmbiguity(cands('a', 'b', 'c', 'd'), TOOLS, { exclude: ['language'] });
  assert.ok(ranked.every((r) => r.key !== 'language'));
  assert.ok(ranked.length > 0);
});

// ── 選題 ───────────────────────────────────────────────────────────────────

test('clarifier: nextQuestion 回傳的問題永遠附上「不限」選項', () => {
  const q = nextQuestion(cands('a', 'b', 'c', 'd'), TOOLS, { minGain: 0 });
  assert.ok(q);
  assert.ok(q.options.some((o) => o.value === ANY_VALUE), '應提供跳過選項');
});

test('clarifier: 分歧太低時不問（minGain 門檻）', () => {
  // 四個候選語言都一樣 → language gain = 0
  const same = [
    { id: 'a', name: 'A', language: 'Python', category: 'X', install: { method: 'pip' } },
    { id: 'b', name: 'B', language: 'Python', category: 'X', install: { method: 'pip' } },
  ];
  assert.equal(nextQuestion(cands('a', 'b'), same), null);
});

test('clarifier: 候選不足 2 筆時不問', () => {
  assert.equal(nextQuestion(cands('a'), TOOLS, { minGain: 0 }), null);
});

// ── 套用回答 ───────────────────────────────────────────────────────────────

test('clarifier: applyAnswer 依語言篩選候選', () => {
  const r = applyAnswer(cands('a', 'b', 'c', 'd'), TOOLS, 'language', 'Python');
  assert.deepEqual(r.candidates.map((x) => x.id), ['a', 'c']);
  assert.equal(r.matched, 2);
  assert.equal(r.dropped, 2);
});

test('clarifier: applyAnswer 大小寫不敏感', () => {
  const r = applyAnswer(cands('a', 'b', 'c', 'd'), TOOLS, 'language', 'python');
  assert.deepEqual(r.candidates.map((x) => x.id), ['a', 'c']);
});

test('clarifier: 選「不限」時不篩掉任何候選', () => {
  const r = applyAnswer(cands('a', 'b', 'c', 'd'), TOOLS, 'language', ANY_VALUE);
  assert.equal(r.candidates.length, 4);
  assert.equal(r.dropped, 0);
});

test('clarifier: 答案過度收斂（剩不到 2 筆）時改為重排而非篩除', () => {
  // 只有 d 是 Java → 篩完只剩 1 筆
  const r = applyAnswer(cands('a', 'b', 'c', 'd'), TOOLS, 'language', 'Java');
  assert.equal(r.candidates.length, 4, '不應把候選砍到只剩 1 筆');
  assert.equal(r.candidates[0].id, 'd', '命中的應排到最前');
  assert.equal(r.dropped, 0);
});

test('clarifier: 未知維度不改變候選', () => {
  const r = applyAnswer(cands('a', 'b'), TOOLS, 'nonexistent', 'x');
  assert.equal(r.candidates.length, 2);
});

// ── 對外腳本 ───────────────────────────────────────────────────────────────

test('clarifier: planClarification 在該問時給題、不該問時說明理由', () => {
  const ask = planClarification(cands('a', 'b', 'c', 'd'), TOOLS, { minGain: 0 });
  assert.equal(ask.shouldAsk, true);
  assert.ok(ask.question);
  assert.ok(ask.reason.includes('分歧'));

  const noAsk = planClarification(cands('a'), TOOLS, { minGain: 0 });
  assert.equal(noAsk.shouldAsk, false);
  assert.ok(noAsk.reason.length > 0);
});

test('clarifier: 維度定義皆可被取值（get 不會拋錯）', () => {
  for (const dim of CLARIFY_DIMENSIONS) {
    assert.equal(typeof dim.get, 'function');
    for (const t of [...TOOLS, { id: 'empty' }]) {
      assert.ok(Array.isArray(dim.get(t)), `${dim.key} 應回傳陣列`);
    }
  }
});
