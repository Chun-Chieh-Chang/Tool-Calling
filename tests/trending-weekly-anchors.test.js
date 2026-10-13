import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { pickWeekBoundaryAnchors, inferCategory, normalizeLanguage } from '../scripts/trending-weekly.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const VALID_CATEGORIES = new Set(
  (JSON.parse(readFileSync(join(ROOT, 'registry', 'categories.json'), 'utf8')).categories || []).map(c => c.name)
);

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

describe('SSOT 守門：分類與語言不得寫出 categories.json／schema enum 外的值', () => {
  test('inferCategory 的輸出必定在 categories.json 的 18 分類內', () => {
    // 2026-10-13 實測踩坑形狀：規則曾寫出行銷／資料庫／基礎設施這三個不存在的分類，
    // removemacai（帶 "analytics" 字樣）就是這樣帶著 category:"行銷" 入庫，check-mece exit 1。
    const cases = [
      // removemacai 真實資料形狀：描述含 "analytics"（舊規則誤判行銷），但本體是隱私清理工具
      { description: 'Debloat macOS: turn off Apple Intelligence, analytics, ads and pop-ups. A native app and CLI, and every change can be undone.',
        topics: ['removemacai', 'apple-intelligence', 'cli', 'debloat', 'macos'], name: 'RemoveMacAI' },
      { description: 'A postgres backup and restore tool with point-in-time recovery', topics: ['postgres', 'backup'], name: 'pgback' },
      { description: 'Docker and kubernetes cluster manager for homelabs', topics: ['docker', 'k8s'], name: 'harbormaster' },
      { description: 'SEO analytics dashboard for marketing teams', topics: ['seo', 'analytics'], name: 'rankboard' },
      { description: 'No description provided.', topics: [], name: 'math' }
    ];
    for (const c of cases) {
      const cat = inferCategory(c);
      assert.ok(VALID_CATEGORIES.has(cat),
        `inferCategory 傳回非法分類 "${cat}"（name=${c.name}）——規則不得發明 categories.json 外的分類`);
    }
  });

  test('資料庫／基礎設施類工具歸「開發工具」而非已廢除的「資料庫」「基礎設施」', () => {
    assert.equal(
      inferCategory({ description: 'A postgres backup and restore tool', topics: ['postgres'], name: 'pgback' }),
      '開發工具');
    assert.equal(
      inferCategory({ description: 'Docker cluster manager', topics: ['docker'], name: 'harbormaster' }),
      '開發工具');
  });

  test('隱私／debloat 工具歸「安全性」（舊規則曾因 analytics 字樣誤判行銷）', () => {
    assert.equal(
      inferCategory({ description: 'Debloat macOS: turn off Apple Intelligence, analytics, ads and pop-ups', topics: ['debloat'], name: 'RemoveMacAI' }),
      '安全性');
  });

  test('normalizeLanguage：enum 外語言（Lean）與未知值一律收斂到 other', () => {
    // 2026-10-13：openai/math 以 language:"lean" 入庫，check-mece exit 1（enum 只收 23 個主流值）
    assert.equal(normalizeLanguage('Lean'), 'other');
    assert.equal(normalizeLanguage('Haskell'), 'other');
    assert.equal(normalizeLanguage('unknown'), 'other');
    assert.equal(normalizeLanguage(null), 'other');
    assert.equal(normalizeLanguage(undefined), 'other');
    assert.equal(normalizeLanguage(''), 'other');
  });

  test('normalizeLanguage：enum 內語言僅正規化大小寫，不被誤改', () => {
    assert.equal(normalizeLanguage('Python'), 'python');
    assert.equal(normalizeLanguage('TypeScript'), 'typescript');
    assert.equal(normalizeLanguage('Jupyter Notebook'), 'jupyter notebook');
    assert.equal(normalizeLanguage('C++'), 'c++');
    assert.equal(normalizeLanguage('Rust'), 'rust');
  });
});
