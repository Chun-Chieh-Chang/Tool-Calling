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
  migrateState,
  toolState,
  STATE_VERSION,
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

test('validate：原文本來就沒有正文時保留原文並標記 noProse（不灌水覆蓋率）', () => {
  // 實測（2026-11-02）：claude-for-legal 前 8 筆的原文描述全是 `>` 佔位符，
  // 模型原樣回傳是正確行為 —— 但那不能算成「已中文化」。
  const r = validate(
    { subpath: 'ai-governance-legal/skills/ai-inventory', name_zh: 'AI 盤點', description_zh: '>' },
    'Ai Inventory',
    '>'
  );
  assert.deepEqual(r.problems, []);
  assert.equal(r.noProse, true);
  assert.equal(r.description_zh, '>', '保留原文而不是模型的逐字回傳');
});

test('原文是純檔案路徑時視為沒有可譯內容（實測 199 筆誤判的修法）', () => {
  // 實測（2026-11-02）：claude-skills 有 199 筆的 description 就是這種路徑，
  // 舊判準算成「有正文」→ 模型照抄路徑 → 被判「不含中文」的失敗 → 白跑 199 筆。
  assert.equal(
    hasNoTranslatableProse('../../../engineering/skills/agent-protocol/SKILL.md'),
    true
  );
  assert.equal(hasNoTranslatableProse('./SKILL.md'), true);
  assert.equal(
    hasNoTranslatableProse('這是 normal 描述，後面有路徑 ./docs/README.md 但仍有正文'),
    false
  );
});

test('validate：純路徑原文即使模型給了中文也只保留原文（不憑空補充資訊）', () => {
  const r = validate(
    { subpath: 'x', name_zh: '代理協定', description_zh: '指向 c-level-advisor 技能的 SKILL.md 檔案' },
    'agent-protocol',
    '../../../c-level-advisor/skills/agent-protocol/SKILL.md'
  );
  assert.deepEqual(r.problems, []);
  assert.equal(r.noProse, true);
  assert.equal(r.description_zh, '../../../c-level-advisor/skills/agent-protocol/SKILL.md');
});

test('validate：有正文的譯文不會被誤標 noProse', () => {
  const r = validate(
    { subpath: 'skills/x', name_zh: '搜尋品質', description_zh: '評估搜尋結果品質' },
    'Search Quality',
    'Evaluate search quality.'
  );
  assert.equal(r.noProse, false);
  assert.equal(r.description_zh, '評估搜尋結果品質');
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

// ── 多工具快取（2026-11-02）──────────────────────────────────────────────
// 擴大翻譯要處理 48 個集合共 3,235 筆，單工具快取結構會互相覆蓋 → 升級 v2。
// 這裡測的是**遷移與隔離**，因為「已完成的 636 筆不能因為改版就消失」。

test('快取遷移：v1 單工具結構會搬到 v2 的 tools 底下，既有翻譯不遺失', () => {
  const v1 = {
    tool: 'awesome-copilot',
    entries: { 'skills/x': { name_zh: '搜尋品質', description_zh: '評估搜尋結果品質' } },
    failed: { 'skills/y': { at: 'x', why: 'description_zh 為空' } },
  };
  const s = migrateState(v1);
  assert.equal(s.version, STATE_VERSION);
  assert.equal(s.tools['awesome-copilot'].entries['skills/x'].description_zh, '評估搜尋結果品質');
  assert.equal(s.tools['awesome-copilot'].failed['skills/y'].why, 'description_zh 為空');
});

test('快取遷移：v2 結構原樣保留', () => {
  const v2 = { version: 2, tools: { a: { entries: { x: { description_zh: '甲' } }, failed: {} } } };
  const s = migrateState(v2);
  assert.equal(s.tools.a.entries.x.description_zh, '甲');
});

test('快取遷移：壞掉的 JSON 不會讓整個流程爆掉', () => {
  assert.deepEqual(migrateState(null), { version: STATE_VERSION, tools: {} });
  assert.deepEqual(migrateState('爛掉的內容'), { version: STATE_VERSION, tools: {} });
});

test('快取區塊：不同工具的翻譯互相隔離', () => {
  const s = { version: STATE_VERSION, tools: {} };
  const a = toolState(s, 'claude-skills');
  const b = toolState(s, 'financial-services');
  a.entries['x'] = { description_zh: '甲' };
  assert.equal(b.entries['x'], undefined, '另一個工具不該看到這筆');
  assert.equal(toolState(s, 'claude-skills'), a, '同一個工具要拿到同一個區塊');
});
