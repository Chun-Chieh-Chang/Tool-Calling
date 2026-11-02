/**
 * eval-partition.test.js — 保護「集合中文化分組」的凍結快照（2026-11-02）
 *
 * 🔴 這條守門存在的原因（量測本身會騙人的又一次）：
 * scripts/eval-benchmark.js 的四象限分組原本由 registry 現況推導
 * 「某集合是否已中文化」。擴大翻譯一旦套用，**所有集合都會變成已中文化**，
 * 「未中文化」那一象限直接消失 → 配對 A/B 讀不出來，而且不會報錯，
 * 只會安靜地給出一張看起來正常、實際上沒有對照組的表。
 *
 * 因此分組必須是**凍結值**（評測集 methodology.collectionTranslationBaseline）。
 * 這支測試守住三件事：
 *   1. 凍結快照存在、帶版本與擷取時間（過期時看得出來）
 *   2. 每一個 monorepo 題目的目標集合都在快照裡（漏掉會被當成「未中文化」）
 *   3. 快照裡至少有一個 false —— 沒有基準端的話，A/B 這件事本身就不成立
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const bench = JSON.parse(readFileSync(path.join(ROOT, 'registry', 'eval-queries.json'), 'utf8'));

const baseline = bench.methodology?.collectionTranslationBaseline;
const monoCollections = [...new Set(bench.cases.filter((c) => c.collection).map((c) => c.collection))];

test('評測集有凍結的「集合中文化分組」快照', () => {
  assert.ok(baseline, '缺少 methodology.collectionTranslationBaseline → 四象限分組會退回現況推導，擴大翻譯後就失去可比性');
  assert.ok(baseline.version, '快照必須帶版本，否則過期時看不出來');
  assert.ok(baseline.capturedAt, '快照必須帶擷取時間');
  assert.ok(baseline.partition && typeof baseline.partition === 'object');
});

test('快照版本與評測集版本一致', () => {
  assert.equal(baseline.version, bench.version, '評測集升版時要同步重新凍結分組');
});

test('每個 monorepo 題目的目標集合都在快照裡', () => {
  const missing = monoCollections.filter((cid) => !(cid in baseline.partition));
  assert.deepEqual(missing, [], `快照漏掉集合：${missing.join(', ')} → 這些題目會被誤判成「未中文化」`);
});

test('快照涵蓋的集合數等於 monorepo 題目用到的集合數', () => {
  assert.equal(Object.keys(baseline.partition).length, monoCollections.length);
});

test('快照裡至少有一個 false（否則沒有基準端，A/B 不成立）', () => {
  const untranslated = Object.entries(baseline.partition).filter(([, v]) => v === false).map(([k]) => k);
  assert.ok(untranslated.length > 0,
    '快照全是 true → 表示是在擴大翻譯套用「之後」才擷取的，等於沒凍結，必須重新擷取');
});

test('快照的分組與「期望答案是否為集合本身」可交叉查詢', () => {
  // 兩組都需要有題目，四象限表才有四個格子可比
  const roles = { collection: 0, dedicated: 0 };
  for (const c of bench.cases.filter((c) => c.type === 'monorepo' && c.collection)) {
    roles[c.expected[0] === c.collection ? 'collection' : 'dedicated']++;
  }
  assert.ok(roles.collection > 0, '沒有「期望＝集合本身」的題目 → 讀不出翻譯的直接效益');
  assert.ok(roles.dedicated > 0, '沒有「期望＝專用工具」的題目 → 缺對照組');
});
