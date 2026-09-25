// check-traditional: skip-file —— fixture 必須是簡體原文，否則測不到轉換與偵測
import test from 'node:test';
import assert from 'node:assert/strict';
import { toTraditional, findSimplified, S2T } from '../scripts/fix-simplified.js';

// ── 簡→繁轉換 ────────────────────────────────────────────────────────────
// 背景：專案為繁體中文專案，但 LLM 產生 trigger 時輸出簡體
// （如「跑跨浏览器自动化测试」）。繁體查詢永遠匹配不到簡體 trigger，
// tokenize 後「瀏覽器」與「浏览器」的 bigram 完全不重疊。
// 實測修正後 fusion direct 類型 Hit@1 27.8% → 33.3%。

test('toTraditional - 轉換常見簡體字', () => {
  assert.equal(toTraditional('跑跨浏览器自动化测试'), '跑跨瀏覽器自動化測試');
  assert.equal(toTraditional('截取网页完整截图'), '截取網頁完整截圖');
  assert.equal(toTraditional('把网页转成 PDF'), '把網頁轉成 PDF');
  assert.equal(toTraditional('抓取动态加载的网页内容'), '抓取動態加載的網頁內容');
});

test('toTraditional - 繁體輸入保持不變（idempotent）', () => {
  const trad = '這是一段繁體中文，包含標點與 English words 123';
  assert.equal(toTraditional(trad), trad);
  assert.equal(toTraditional(toTraditional('测试网页')), '測試網頁');
});

test('toTraditional - 英文與數字不受影響', () => {
  assert.equal(toTraditional('playwright e2e-testing v1.2.3'), 'playwright e2e-testing v1.2.3');
});

test('toTraditional - 空值安全', () => {
  assert.equal(toTraditional(''), '');
  assert.equal(toTraditional(null), '');
  assert.equal(toTraditional(undefined), '');
});

// ── 偵測 ─────────────────────────────────────────────────────────────────
test('findSimplified - 找出簡體字元', () => {
  assert.deepEqual(findSimplified('测试网页'), ['测', '试', '网', '页']);
  assert.deepEqual(findSimplified('純繁體'), []);
});

test('findSimplified - 同形字不誤報', () => {
  // 「面」「高」「搜」「探」等簡繁同形，不該被判為簡體
  for (const s of ['面試', '高度', '搜尋', '探索', '提升', '接受', '控制', '推理']) {
    assert.deepEqual(findSimplified(s), [], `不應誤報：${s}`);
  }
});

// ── 對照表品質 ───────────────────────────────────────────────────────────
test('S2T - 不含簡繁同形的項（會造成誤報）', () => {
  for (const [k, v] of Object.entries(S2T)) {
    assert.notEqual(k, v, `對照表不應含同形項：${k} → ${v}`);
  }
});

test('S2T - 每個 key 都是單一字元', () => {
  for (const k of Object.keys(S2T)) {
    assert.equal([...k].length, 1, `key 應為單字元：${k}`);
  }
});

test('S2T - 每個 value 都是單一字元', () => {
  for (const [k, v] of Object.entries(S2T)) {
    assert.equal([...v].length, 1, `value 應為單字元：${k} → ${v}`);
  }
});

test('S2T - 不含一簡對多繁的高歧義字', () => {
  // 這些字簡體一對多繁體，強制轉換會改錯（如「恢复」→「恢複」）
  for (const ambiguous of ['复', '干', '于', '后', '划', '发']) {
    // '发' 允許存在（trigger 中多為「發」），但復/干/于/后 不該有
    if (ambiguous === '发') continue;
    assert.equal(S2T[ambiguous], undefined, `不應收高歧義字：${ambiguous}`);
  }
});

// ── 表外簡體字的循環盲區（2026-09-20 修復）─────────────────────────────────
// 舊行為：toTraditional 拿 S2T_KEYS 當閘門，表外簡體字（如「没」）既不會
// 被轉換，也因為 findSimplified 用同一張表而抓不到 → 轉換與偵測雙雙失明。

test('toTraditional - 表外簡體字仍應被轉換（「没」曾整批漏網）', () => {
  assert.equal(toTraditional('有没有'), '有沒有');
  assert.equal(toTraditional('没問題'), '沒問題');
  assert.equal(toTraditional('热门话题'), '熱門話題');
});

test('toTraditional - 表外簡體字不得觸發整串 opencc（避免誤改繁體）', () => {
  // 這是關鍵：若為了修「没」而把整串丟給 opencc，
  // 跨平台→跨平臺、群組→羣組、減少干擾→減少幹擾 全部會被改錯。
  assert.equal(toTraditional('热 跨平台'), '熱 跨平台');
  assert.equal(toTraditional('没 減少干擾'), '沒 減少干擾');
  assert.equal(toTraditional('笔記群組'), '筆記群組');
});

test('toTraditional - 純繁體與含歧義字者維持不變', () => {
  for (const s of ['跨平台', '台灣', '減少干擾', '群組', '漏斗', '緒論', '貢獻', '程式碼']) {
    assert.equal(toTraditional(s), s, `不應改動：${s}`);
  }
});

test('findSimplified - 表外簡體字也應被偵測出來（修掉循環盲區）', () => {
  assert.ok(findSimplified('有没有').length > 0, '「没」應被偵測為簡體');
  assert.equal(findSimplified('有沒有').length, 0, '繁體不應被誤報');
  assert.equal(findSimplified('跨平台').length, 0, '繁體「台」不應被誤報');
});
