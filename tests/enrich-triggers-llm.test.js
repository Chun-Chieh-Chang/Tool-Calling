import test from 'node:test';
import assert from 'node:assert/strict';
import { isGeneric, GENERIC_PHRASES } from '../scripts/enrich-triggers-llm.js';

// ── 萬能詞防護 ───────────────────────────────────────────────────────────
// LLM 擴充 trigger 時會產生「幫我搞定」「有沒有工具能做這個」這類
// 任何工具都適用的詞。若寫入 triggers，任何查詢都會命中，造成大量偽陽性，
// 直接違反專案「精度優先，寧可低覆蓋也不要偽陽性」原則。
// 這組測試把防護機制鎖住——改 prompt 或黑名單時若失效會立刻被抓到。

test('isGeneric - 攔下沒有具體對象的萬能詞', () => {
  for (const bad of [
    '幫我搞定', '帮我搞定',
    '幫我看看', '帮我看看',
    '幫我想想辦法', '帮我想办法',
    '有沒有工具能做這個', '有没有工具能做这个',
    '推薦個好用的', '推荐个好用的',
    '這個怎麼搞', '这个怎么搞',
    '有沒有替代方案', '有没有替代方案',
    '幫我想想辦法看', '求介紹一下',
    '太麻煩了不想弄', '有什麼推薦的嗎',
  ]) {
    assert.equal(isGeneric(bad), true, `應被攔下：${bad}`);
  }
});

test('isGeneric - 放行含具體動作的詞（即使以「幫我」開頭）', () => {
  // 「幫我畫圖」有具體對象（畫圖），是有效的檢索詞，不能誤殺
  for (const good of [
    '幫我畫圖', '帮我画图',
    '幫我摘要這篇文章',
    '幫我錄製操作步驟',
    '幫我自動操作瀏覽器',
    '畫圖表', '數據可視化',
    '執行SQL查詢', '優化資料庫查詢',
    '訓練自己的AI模型',
    '抓取 JavaScript 渲染的動態內容',
  ]) {
    assert.equal(isGeneric(good), false, `不應被攔下：${good}`);
  }
});

test('isGeneric - 空值與非字串安全回傳 false', () => {
  assert.equal(isGeneric(''), false);
  assert.equal(isGeneric(null), false);
  assert.equal(isGeneric(undefined), false);
});

test('GENERIC_PHRASES - 黑名單非空且無重複', () => {
  assert.ok(GENERIC_PHRASES.length > 0, '黑名單不應為空');
  assert.equal(new Set(GENERIC_PHRASES).size, GENERIC_PHRASES.length, '黑名單不應有重複項');
});

test('GENERIC_PHRASES - 每個條目確實會被 isGeneric 攔下', () => {
  // 防止黑名單條目寫錯（例如含全形/半形不一致導致永遠匹配不到）
  for (const p of GENERIC_PHRASES) {
    assert.equal(isGeneric(`前綴${p}後綴`), true, `黑名單條目無效：${p}`);
  }
});
