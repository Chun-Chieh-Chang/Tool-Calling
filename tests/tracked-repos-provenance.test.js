/**
 * tracked-repos-provenance.test.js — 追蹤池重建的溯源保留迴歸測試
 *
 * 為什麼要有這組測試（2026-09-25）
 * ────────────────────────────────
 * 工作台啟動會自動跑 trending-weekly.js，它的 Step 1 重建整個追蹤池。
 * 實測踩到兩類損害，光讀程式碼不會發現：
 *   1. 已入庫的倉庫重建後拿到「現在」的時間戳 → 38 筆 addedAt 被改寫，重建永不冪等
 *   2. 倉庫從「僅追蹤」升格為「已入庫」時，Step 1 的條目沒有 initialStars →
 *      genoffice 的 delta 基線 2231 被抹掉，隔週報表會把它當成從零起算的新倉庫
 * 合併規則現在抽成 scripts/tracked-repos.js 的 mergeTrackedProvenance()（純函式），
 * 本檔直接測它，不需要碰 registry/tracked-repos.json。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeTrackedProvenance } from '../scripts/tracked-repos.js';

// Step 1（來自 tools.json）的條目形狀：沒有發現期欄位
const scanFromRegistry = (over = {}) => ({
  fullName: 'genspark-ai/genoffice',
  owner: 'genspark-ai',
  repo: 'genoffice',
  category: '文件生產力',
  addedAt: '2026-09-25T02:58:51.522Z',
  status: 'tracking',
  ...over,
});

// 舊 tracked-repos.json 裡那一筆（曾是「僅追蹤」，由快照發現）
const existingTrackedOnly = {
  fullName: 'genspark-ai/genoffice',
  owner: 'genspark-ai',
  repo: 'genoffice',
  initialStars: 2231,
  discoveredAt: '2026-09-21T00:07:46.201Z',
  sourceSnapshotWeek: '2026-39',
  category: null,
  addedAt: null,
  status: 'tracked_not_in_registry',
  note: '手動加入',
};

test('升格為已入庫時繼承 initialStars／sourceSnapshotWeek（delta 基線不能不見）', () => {
  const info = mergeTrackedProvenance(scanFromRegistry(), existingTrackedOnly);
  assert.equal(info.initialStars, 2231);
  assert.equal(info.sourceSnapshotWeek, '2026-39');
  assert.equal(info.status, 'tracking', '狀態由本次掃描決定，合併不接管');
});

test('note／notes 等人工註記一律保留', () => {
  const info = mergeTrackedProvenance(scanFromRegistry(), { ...existingTrackedOnly, notes: ['待觀察'] });
  assert.equal(info.note, '手動加入');
  assert.deepEqual(info.notes, ['待觀察']);
});

test('discoveredAt 取較早者：快照陣列變長不會把首次發現時間往後推', () => {
  // 本次掃描拿到較晚的時間戳（Step 2 先命中先贏造成的漂移）
  const later = scanFromRegistry({
    discoveredAt: '2026-09-25T00:07:46.201Z',
    initialStars: 2400,
    sourceSnapshotWeek: '2026-40',
  });
  assert.equal(mergeTrackedProvenance(later, existingTrackedOnly).discoveredAt,
    '2026-09-21T00:07:46.201Z', '必須回到最早那次發現');

  // 反向：新值較早就保留新值
  const earlier = scanFromRegistry({ discoveredAt: '2026-09-20T00:00:00.000Z' });
  assert.equal(mergeTrackedProvenance(earlier, existingTrackedOnly).discoveredAt,
    '2026-09-20T00:00:00.000Z');
});

test('addedAt 在來源不明時繼承舊值，否則重建會一直蓋出新的時間戳', () => {
  // tools.json 那筆沒有 addedAt（歷史遺留工具）→ 不能蓋上重建當下的時間戳
  const info = mergeTrackedProvenance(scanFromRegistry({ addedAt: null }), existingTrackedOnly);
  assert.equal(info.addedAt, null, '舊值也是 null 時維持 null，不要造假時間');

  const withPrev = mergeTrackedProvenance(
    scanFromRegistry({ addedAt: null }),
    { ...existingTrackedOnly, addedAt: '2025-01-01T00:00:00.000Z' },
  );
  assert.equal(withPrev.addedAt, '2025-01-01T00:00:00.000Z');

  const freshWins = mergeTrackedProvenance(scanFromRegistry(), existingTrackedOnly);
  assert.equal(freshWins.addedAt, '2026-09-25T02:58:51.522Z', '本次有來源時間時不被舊值蓋掉');
});

test('category 只在本次掃描拿不到時才用舊值備援', () => {
  const filled = mergeTrackedProvenance(scanFromRegistry(), { ...existingTrackedOnly, category: '開發工具' });
  assert.equal(filled.category, '文件生產力', 'tools.json 是單一真理來源，舊分類不能反蓋');

  const missing = mergeTrackedProvenance(scanFromRegistry({ category: null }), { ...existingTrackedOnly, category: '開發工具' });
  assert.equal(missing.category, '開發工具');
});

test('重建冪等：同一筆連續合併兩次結果不變', () => {
  const once = mergeTrackedProvenance(scanFromRegistry(), existingTrackedOnly);
  const twice = mergeTrackedProvenance({ ...once }, once);
  assert.deepEqual(twice, once);
});

test('下一週重建不漂移：以本週結果為舊檔再合併一次，條目完全一致', () => {
  const week1 = mergeTrackedProvenance(scanFromRegistry(), existingTrackedOnly);
  // 下週 trending 重建：Step 1 又產出沒有溯源欄位的形狀，舊檔是 week1
  const week2 = mergeTrackedProvenance(scanFromRegistry(), week1);
  assert.deepEqual(week2, week1);
  assert.equal(week2.initialStars, 2231);
  assert.equal(week2.discoveredAt, '2026-09-21T00:07:46.201Z');
  assert.equal(week2.addedAt, '2026-09-25T02:58:51.522Z');
});

test('舊檔不存在時原樣回傳，不憑空長出溯源欄位', () => {
  const info = scanFromRegistry();
  assert.deepEqual(mergeTrackedProvenance(info, undefined), info);
  assert.equal('initialStars' in info, false);
  assert.equal('discoveredAt' in info, false);
  assert.deepEqual(mergeTrackedProvenance(null, existingTrackedOnly), null);
});
