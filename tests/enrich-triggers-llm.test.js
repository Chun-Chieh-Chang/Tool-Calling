import test from 'node:test';
import assert from 'node:assert/strict';
import { isGeneric, GENERIC_PHRASES, guardDiscriminability } from '../scripts/enrich-triggers-llm.js';

// ── 萬能詞防護 ───────────────────────────────────────────────────────────
// LLM 擴充 trigger 時會產生「幫我搞定」「有沒有工具能做這個」這類
// 任何工具都適用的詞。若寫入 triggers，任何查詢都會命中，造成大量偽陽性，
// 直接違反專案「精度優先，寧可低覆蓋也不要偽陽性」原則。
// 這組測試把防護機制鎖住——改 prompt 或黑名單時若失效會立刻被抓到。

test('isGeneric - 攔下沒有具體對象的萬能詞', () => {
  for (const bad of [
    '幫我搞定', '帮我搞定', // allow-simplified：刻意引用的簡體關鍵字／範例，轉繁會破壞比對
    '幫我看看', '帮我看看', // allow-simplified：刻意引用的簡體關鍵字／範例，轉繁會破壞比對
    '幫我想想辦法', '帮我想办法', // allow-simplified：刻意引用的簡體關鍵字／範例，轉繁會破壞比對
    '有沒有工具能做這個', '有没有工具能做这个', // allow-simplified：刻意引用的簡體關鍵字／範例，轉繁會破壞比對
    '推薦個好用的', '推荐个好用的', // allow-simplified：刻意引用的簡體關鍵字／範例，轉繁會破壞比對
    '這個怎麼搞', '这个怎么搞', // allow-simplified：刻意引用的簡體關鍵字／範例，轉繁會破壞比對
    '有沒有替代方案', '有没有替代方案', // allow-simplified：刻意引用的簡體關鍵字／範例，轉繁會破壞比對
    '幫我想想辦法看', '求介紹一下',
    '太麻煩了不想弄', '有什麼推薦的嗎',
  ]) {
    assert.equal(isGeneric(bad), true, `應被攔下：${bad}`);
  }
});

test('isGeneric - 放行含具體動作的詞（即使以「幫我」開頭）', () => {
  // 「幫我畫圖」有具體對象（畫圖），是有效的檢索詞，不能誤殺
  for (const good of [
    '幫我畫圖', '帮我画图', // allow-simplified：刻意引用的簡體關鍵字／範例，轉繁會破壞比對
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

// ── 鑑別力守門 ───────────────────────────────────────────────────────────
// 背景（2026-09-15）：擴充到 361 筆時 fusion Hit@1 從 11.9% 退步到 7.1%。
// 根因是稀釋：新 trigger 讓競爭對手一起變強，原本的優勢被抵銷。
// 守門機制確保只加入「出現在少量工具」的詞——也就是有區分力的詞。

test('guardDiscriminability - 剔除已在太多工具出現的詞', () => {
  const candidates = new Map([['toolA', ['罕見詞語', '到處都有']]]);
  const existingDf = new Map([['到處都有', 50]]);   // 已出現在 50 個工具
  const out = guardDiscriminability(candidates, existingDf, 100, 3, 5);
  assert.ok(!out.get('toolA').includes('到處都有'), '高 df 的詞應被剔除');
  assert.ok(out.get('toolA').includes('罕見詞語'), '低 df 的詞應保留');
});

test('guardDiscriminability - 剔除本批次內多個工具都想加的詞', () => {
  // 「生成圖片」同時被 3 個工具想要 → 加進去只會互相稀釋
  const candidates = new Map([
    ['toolA', ['生成圖片', '專屬特徵A']],
    ['toolB', ['生成圖片', '專屬特徵B']],
    ['toolC', ['生成圖片', '專屬特徵C']],
  ]);
  const existingDf = new Map();
  const out = guardDiscriminability(candidates, existingDf, 100, 2, 5);
  for (const id of ['toolA', 'toolB', 'toolC']) {
    assert.ok(!out.get(id).includes('生成圖片'), `${id} 的「生成圖片」應被剔除（批內競爭 3 > maxDf 2）`);
    assert.ok(out.get(id).length > 0, `${id} 應保留自己的專屬詞`);
  }
});

test('guardDiscriminability - 既有 df 與批次內競爭會相加計算', () => {
  // 既有 2 個工具已有此詞，批次內又有 2 個想加 → 總 df = 4 > 3，應剔除
  const candidates = new Map([
    ['toolA', ['邊界詞']],
    ['toolB', ['邊界詞']],
  ]);
  const existingDf = new Map([['邊界詞', 2]]);
  const out = guardDiscriminability(candidates, existingDf, 100, 3, 5);
  assert.equal(out.get('toolA').includes('邊界詞'), false, 'df 2+2=4 > 3 應剔除');
});

test('guardDiscriminability - 每工具保留數量不超過上限', () => {
  const candidates = new Map([['toolA', ['w1', 'w2', 'w3', 'w4', 'w5', 'w6', 'w7']]]);
  const out = guardDiscriminability(candidates, new Map(), 100, 3, 3);
  assert.ok(out.get('toolA').length <= 3, `應 ≤3 詞，實際 ${out.get('toolA').length}`);
});

test('guardDiscriminability - 保留的是 IDF 最高者（最罕見的詞）', () => {
  // common 已在 2 個工具、rare 在 0 個 → rare 的 IDF 較高，應優先保留
  const candidates = new Map([['toolA', ['common', 'rare']]]);
  const existingDf = new Map([['common', 2]]);
  const out = guardDiscriminability(candidates, existingDf, 100, 3, 1);
  assert.deepEqual(out.get('toolA'), ['rare'], '應保留 IDF 最高的 rare');
});

test('guardDiscriminability - 空輸入與邊界安全', () => {
  assert.equal(guardDiscriminability(new Map(), new Map(), 100, 3, 5).size, 0);
  const out = guardDiscriminability(new Map([['a', []]]), new Map(), 100, 3, 5);
  assert.deepEqual(out.get('a'), []);
});

test('guardDiscriminability - 大小寫與空白視為同一詞', () => {
  const candidates = new Map([
    ['toolA', ['Chart Tool']],
    ['toolB', ['chart tool']],
  ]);
  const out = guardDiscriminability(candidates, new Map(), 100, 1, 5);
  // 正規化後兩者相同，批內競爭 2 > maxDf 1 → 都剔除
  assert.equal(out.get('toolA').length, 0);
  assert.equal(out.get('toolB').length, 0);
});
