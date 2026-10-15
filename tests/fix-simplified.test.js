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

// 2026-10-09：U+79BB（「離」的簡體形）是 10-07 二十字探針裡唯一未被豁免的真缺口，
// 當時它同時不在 S2T_KEYS 也不在 S2T_SAFE → 偵測與轉換兩邊都漏（陷阱 19 的循環盲區）。
// 樣本刻意只用「离線」：串裡唯一的簡體字就是它，才能證明走的是單字對照那條路，
// 而不是整串丟給 opencc。
test('S2T_SAFE - 收錄 U+79BB 後偵測與轉換兩邊都要生效（兩個方向都釘住）', () => {
  assert.ok(findSimplified('离線').length > 0, '簡體「离」應被偵測出來');
  assert.equal(toTraditional('离線'), '離線', '單字對照應把它轉成繁體「離」');
  assert.equal(findSimplified('離線').length, 0, '繁體「離」不應被誤報');
  assert.equal(toTraditional('離線'), '離線', '純繁體應完全不變');
});

// ── 2026-10-15 第八輪 Q1=A：循環盲區規模化復發後補齊的一批字 ──────────────
// 這批字（机/审/谱/将/绘/获/监/词/逻/环/纯/纸/较/装/树/气/温/联/灯/旧/脑/盖/
// 满/断/栏/账/职/涨/积/虫/尽/迁/营/拦/访/许/竞/盘…）原本不在任何表內，
// 導致 registry 100 筆字串（87 筆在 triggers）同時躲過門禁與 fix-simplified。
test('S2T_SAFE - 新增的一批無歧義簡體字，偵測與轉換兩邊都要生效', () => {
  const cases = [
    ['公開访客', '公開訪客'],
    ['搭建對話机器人', '搭建對話機器人'],
    ['構建程式碼知識圖谱', '構建程式碼知識圖譜'],
    ['将書籍轉成可執行工具', '將書籍轉成可執行工具'],
    ['PDF轉纯文本', 'PDF轉純文本'],
    ['畫树状圖', '畫樹狀圖'],
    ['預報天气', '預報天氣'],
  ];
  for (const [src, want] of cases) {
    assert.ok(findSimplified(src).length > 0, `應被偵測為簡體：${src}`);
    assert.equal(toTraditional(src), want, `${src} 應轉成 ${want}`);
  }
});

test('S2T_SAFE - 這批字必須走單字對照，不得開啟 opencc 閘門（否則會改壞同串已正確的繁體）', () => {
  // 這是關鍵：若把它們誤加進主表 S2T，閘門就會為整串打開，opencc 會把
  // 「跨平台」改成「跨平臺」、「社群」改成「社羣」——正是本檔 197-206 行在防的事。
  assert.equal(toTraditional('公開访客 跨平台與社群儀表板'), '公開訪客 跨平台與社群儀表板');
  assert.equal(findSimplified('跨平台與社群儀表板').length, 0, '已正確的繁體不得被誤報');
});
