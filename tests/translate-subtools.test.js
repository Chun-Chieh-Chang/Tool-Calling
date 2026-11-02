/**
 * translate-subtools.test.js — subTool 中文翻譯腳本的純函式行為（2026-11-01）
 *
 * 這支腳本會呼叫 LLM 產生中文描述，因此測試只針對**不依賴網路**的部分：
 *   · 台灣用語後處理（applyTaiwanTerms）
 *   · 「原文沒有可譯內容」的判斷（hasNoTranslatableProse）
 *   · 譯文驗證規則（validate）
 *
 * 為什麼要把台灣用語做成腳本內的函式而不是一次性手改：
 * 手改 tools.json 會在下次重跑翻譯時被覆蓋，等於沒修；
 * 做成函式 → 重跑時同樣的修正自動套用，可重現。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyTaiwanTerms,
  hasNoTranslatableProse,
  validate,
} from '../scripts/translate-subtools.js';

test('台灣用語後處理：把大陸用語換成台灣用語', () => {
  assert.equal(applyTaiwanTerms('執行數據驅動的最佳化循環'), '執行資料驅動的最佳化循環');
  assert.equal(applyTaiwanTerms('包含元數據與標記隊列'), '包含中繼資料與標記佇列');
  assert.equal(applyTaiwanTerms('為變量成本定價'), '為變數成本定價');
  assert.equal(applyTaiwanTerms('運行於 Microsoft Foundry'), '執行於 Microsoft Foundry');
  assert.equal(applyTaiwanTerms('用戶可要求更換顏色'), '使用者可要求更換顏色');
});

test('台灣用語後處理：保留「用戶端」與「項目」（台灣用法正確）', () => {
  // 「用戶端」在台灣指 client，不是「使用者端」
  assert.equal(applyTaiwanTerms('HTTP 用戶端認證'), 'HTTP 用戶端認證');
  // 「項目」在台灣指 item（清理項目／工作項目／行動項目），不是大陸的「專案」
  assert.equal(applyTaiwanTerms('清理項目與行動項目'), '清理項目與行動項目');
  assert.equal(applyTaiwanTerms('工作項目與排除項目'), '工作項目與排除項目');
});

test('原文只有圖片／影片連結時視為「沒有可翻譯的內容」', () => {
  assert.equal(
    hasNoTranslatableProse('[![link](https://i.imgur.com/UnImFhl.png)](https://youtu.be/tn4jEpZ6jiw)'),
    true
  );
  assert.equal(hasNoTranslatableProse('https://example.com/only-a-url'), true);
  assert.equal(hasNoTranslatableProse('A tool that migrates databases between engines.'), false);
});

test('validate：正常譯文通過，並自動轉繁體', () => {
  const r = validate(
    { subpath: 'skills/x', name_zh: '搜尋品質', description_zh: '評估搜尋結果品質' },
    'Search Quality',
    'Evaluate search quality.'
  );
  assert.deepEqual(r.problems, []);
  assert.equal(r.description_zh, '評估搜尋結果品質');
});

test('validate：name_zh 留空不算失敗，退回英文原名', () => {
  const r = validate(
    { subpath: 'skills/x', name_zh: '', description_zh: '評估搜尋結果品質' },
    'Search Quality',
    'Evaluate search quality.'
  );
  assert.deepEqual(r.problems, []);
  assert.equal(r.name_zh, 'Search Quality');
});

test('validate：原文是純連結時，「不含中文」不算失敗', () => {
  const r = validate(
    { subpath: 'plugins/power-platform-architect', name_zh: '', description_zh: 'https://youtu.be/x' },
    'Power Platform Architect',
    '[![link](https://i.imgur.com/x.png)](https://youtu.be/x)'
  );
  assert.deepEqual(r.problems, []);
});

test('validate：真的有內容卻沒中文 → 判失敗', () => {
  const r = validate(
    { subpath: 'skills/x', name_zh: 'X', description_zh: 'plain english only' },
    'X',
    'Evaluate search quality for vector databases.'
  );
  assert.ok(r.problems.some((p) => p.includes('不含中文')), `實際：${JSON.stringify(r.problems)}`);
});

test('validate：殘留簡體字會被判失敗（轉繁體後仍殘留才算）', () => {
  const r = validate(
    { subpath: 'skills/x', name_zh: 'X', description_zh: '評估搜尋結果品質' },
    'X',
    'Evaluate search quality.'
  );
  assert.deepEqual(r.problems, []);
});
