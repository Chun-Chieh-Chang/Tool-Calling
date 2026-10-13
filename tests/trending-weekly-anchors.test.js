import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { pickWeekBoundaryAnchors } from '../scripts/trending-weekly.js';

// W41 = 2026-10-05 (一) ~ 2026-10-11 (日)；W42 = 2026-10-12 ~ 10-18
const W41 = { weekStr: '2026-W41', mondayStr: '2026-10-05', sundayStr: '2026-10-11' };
const W42 = { weekStr: '2026-W42', mondayStr: '2026-10-12', sundayStr: '2026-10-18' };

const snap = (week, timestamp) => ({ week, timestamp, repos: { 'a/a': 1 } });

describe('pickWeekBoundaryAnchors：週界錨點依 timestamp 語意挑選', () => {
  test('理想週一 02:00 節刊：起點=上週自身快照，終點=本週快照', () => {
    const data = { snapshots: [
      snap('2026-W40', '2026-09-28T02:00:00.000Z'),
      snap('2026-W41', '2026-10-05T02:00:00.000Z'),
      snap('2026-W42', '2026-10-12T02:00:00.000Z')
    ] };
    const r = pickWeekBoundaryAnchors(data, W41);
    assert.equal(r.startSnap.week, '2026-W41');
    assert.equal(r.endSnap.week, '2026-W42');
    assert.equal(r.startFromFallback, false);
    assert.equal(r.endFromStale, false);
  });

  test('臨時執行汙染（2026-10-13 實測數據形狀）：起點不可用 W40、終點不可用 W41', () => {
    // 三次臨時跑戳：10-03(六, W40)、10-05(一, W41)、10-13(二, W42)
    const data = { snapshots: [
      snap('2026-W40', '2026-10-03T07:26:31.998Z'),
      snap('2026-W41', '2026-10-05T08:25:38.635Z'),
      snap('2026-W42', '2026-10-13T11:53:26.734Z')
    ] };
    const r = pickWeekBoundaryAnchors(data, W41);
    assert.equal(r.startSnap.week, '2026-W41', '起點必須是 W41 自身快照（週初基準）');
    assert.equal(r.endSnap.week, '2026-W42', '終點必須是 W41 結束後最早量測');
    assert.equal(r.endFromStale, false);
  });

  test('上週結束後尚未量測：終點退到最新一筆並標記 endFromStale', () => {
    const data = { snapshots: [
      snap('2026-W40', '2026-09-28T02:00:00.000Z'),
      snap('2026-W41', '2026-10-05T02:00:00.000Z')
    ] };
    const r = pickWeekBoundaryAnchors(data, W41);
    assert.equal(r.endSnap.week, '2026-W41');
    assert.equal(r.endFromStale, true);
    assert.equal(r.startFromFallback, false);
  });

  test('上週自身沒快照（該週從未執行）：起點退到上週開始前最後一次量測', () => {
    const data = { snapshots: [
      snap('2026-W39', '2026-09-21T02:00:00.000Z'),
      snap('2026-W40', '2026-09-28T02:00:00.000Z'),
      snap('2026-W42', '2026-10-12T02:00:00.000Z')
    ] };
    const r = pickWeekBoundaryAnchors(data, W41);
    assert.equal(r.startSnap.week, '2026-W40');
    assert.equal(r.startFromFallback, true, '基準退化必須被標記（漲幅可能跨週）');
    assert.equal(r.endSnap.week, '2026-W42');
  });

  test('快照不是依時間排序提供也要正確（內部會排序）', () => {
    const data = { snapshots: [
      snap('2026-W42', '2026-10-12T02:00:00.000Z'),
      snap('2026-W41', '2026-10-05T02:00:00.000Z'),
      snap('2026-W40', '2026-09-28T02:00:00.000Z')
    ] };
    const r = pickWeekBoundaryAnchors(data, W41);
    assert.equal(r.startSnap.week, '2026-W41');
    assert.equal(r.endSnap.week, '2026-W42');
  });

  test('沒有任何快照：兩個錨點皆 null，不拋出', () => {
    for (const data of [{}, { snapshots: [] }, null, undefined]) {
      const r = pickWeekBoundaryAnchors(data, W41);
      assert.equal(r.startSnap, null);
      assert.equal(r.endSnap, null);
      assert.equal(r.startFromFallback, false);
      assert.equal(r.endFromStale, false);
    }
  });

  test('WIP 週（本週）也能取錨：起點=本週自身、終點=本週結束後（尚未發生→null/最新）', () => {
    const data = { snapshots: [
      snap('2026-W41', '2026-10-05T02:00:00.000Z'),
      snap('2026-W42', '2026-10-13T02:00:00.000Z')
    ] };
    const r = pickWeekBoundaryAnchors(data, W42);
    assert.equal(r.startSnap.week, '2026-W42');
    assert.equal(r.endSnap.week, '2026-W42', '本週尚未結束 → 終點只能是現有最新一筆');
    assert.equal(r.endFromStale, true);
  });
});
