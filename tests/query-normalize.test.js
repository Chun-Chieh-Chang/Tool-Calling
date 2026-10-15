/**
 * core/query-normalize.js 的迴歸測試（2026-10-15 第七輪 Q4=A）
 *
 * 這支模組把「簡體查詢」轉成繁體再進檢索。它同時要滿足兩個相反的期待，
 * 兩邊都會壞，所以兩邊都要鎖：
 *   1. **有效**：簡體輸入必須被轉成繁體，否則檢索靜默失敗（bigram 零重疊）。
 *   2. **無害**：已繁體的輸入必須**原樣**通過。這一條更危險——一旦誤判，
 *      就會把正確的繁體問句改壞，而且是在線上、每次查詢都發生。
 *
 * 🔴 本檔刻意不使用豁免標記：需要簡體字時一律用 \uXXXX 重組，或由 opencc 反向生成，
 *    讓本檔在 `--full --code` 下維持零違規（同 tests/check-traditional.test.js 的做法）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hasSimplifiedQuery, normalizeQuery } from '../core/query-normalize.js';
import { findSimplified, usingOpenCC } from '../scripts/fix-simplified.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

// 「這條註解寫錯了」的簡體版——只有首字是簡體（\u8fd9），其餘已是繁體。
const MIXED_SIMPLIFIED = '\u8fd9\u689d\u6ce8\u89e3\u5beb\u932f\u4e86';
const MIXED_TRADITIONAL = '這條註解寫錯了';

// ── 有效：簡體必須被轉掉 ────────────────────────────────────────────────
test('單字級簡體（內建對照表可處理）被轉成繁體', () => {
  assert.ok(hasSimplifiedQuery(MIXED_SIMPLIFIED), '應偵測到簡體');
  assert.equal(normalizeQuery(MIXED_SIMPLIFIED), MIXED_TRADITIONAL);
});

test('純繁體字串不被改動（no-op）—— 這是「0 回歸」的根據', () => {
  for (const s of [
    MIXED_TRADITIONAL,
    '幫我檢視這份市場報告並確認符合監管要求',
    '把 Excel 試算表的內容轉成可以嵌入網頁的表格',
    '跨平台支援與群組管理', // 簡繁同形／歧義字，偵測器刻意不報
  ]) {
    assert.equal(hasSimplifiedQuery(s), false, `不應判定含簡體：${s}`);
    assert.equal(normalizeQuery(s), s, `不應改動：${s}`);
  }
});

// ── 無害：邊界輸入不得炸 ────────────────────────────────────────────────
test('非字串與空字串原樣回傳，不拋錯', () => {
  for (const v of [null, undefined, '', 123, {}, []]) {
    assert.equal(normalizeQuery(v), v);
    assert.equal(hasSimplifiedQuery(v), false);
  }
});

test('冪等：重複套用結果不變（多層入口會各套一次）', () => {
  const once = normalizeQuery(MIXED_SIMPLIFIED);
  assert.equal(normalizeQuery(once), once);
});

// ── 端到端：與「繁體原句」等價（用 opencc 反向生成簡體版） ──────────────
// 這一組是真正有牙齒的鎖：同一題的簡體版與繁體版在檢索上結果**不同**，
// 所以「正規化後兩者結果一致」不可能靠巧合成立。實測（2026-10-15，topK=50 天花板路徑）：
//   c144（語音助理題）簡體 top1=openclaw            vs 繁體 top1=open-llm-vtuber
//   c147（有聲書題）  簡體 top1=oh-my-hermes-rlaope vs 繁體 top1=easyvoice
//   （語料層級：agent Hit@1 35.0% vs 58.4%，fusion 34.2% vs 57.6%）
// 一旦有人把檢索入口的 normalizeQuery() 拿掉，c144／c147 會立刻讓這裡紅。
const TRADITIONAL_QUERIES = [
  '想讓 AI 助理能開口說話，也能聽懂我的語音指令？',
  '要用有聲書的方式把長篇小說念出來，還要區分不同角色的聲音？',
  '我想從零開始學怎麼預訓練一個語言模型，要附完整程式碼那種',
];

let t2s = null;
try {
  const OpenCC = await import('opencc-js');
  t2s = OpenCC.Converter({ from: 't', to: 'cn' });
} catch {
  t2s = null;
}
const NEED_OPENCC = t2s && usingOpenCC() ? false : '需要 opencc-js（反向生成簡體語料）';

test('簡體 → 繁體：往返還原等於原句，且偵測器確認原句含簡體', { skip: NEED_OPENCC }, () => {
  for (const trad of TRADITIONAL_QUERIES) {
    const simp = t2s(trad);
    assert.notEqual(simp, trad, '反向生成的簡體版必須真的不同，否則這條鎖沒有意義');
    assert.ok(findSimplified(simp).length > 0, `應偵測到簡體：${simp}`);
    assert.equal(normalizeQuery(simp), trad, `正規化後應等於繁體原句：${simp}`);
  }
});

test('檢索入口已接上正規化：簡體查詢與繁體查詢得到相同的候選清單', { skip: NEED_OPENCC }, async () => {
  const reg = JSON.parse(readFileSync(path.join(ROOT, 'registry', 'tools.json'), 'utf8'));
  const tools = reg.tools.filter((t) => t.status === 'active' || t.status === 'experimental');
  const { search } = await import('../core/search-engine.js');
  const { agentRetrieve } = await import('../core/agent-retrieval.js');
  const { retrieve } = await import('../core/retrieval-fusion.js');

  for (const trad of TRADITIONAL_QUERIES) {
    const simp = t2s(trad);
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    assert.ok(
      same(
        search(tools, simp, { topK: 5 }).map((r) => r.tool.id),
        search(tools, trad, { topK: 5 }).map((r) => r.tool.id),
      ),
      `L2：簡體與繁體查詢結果應一致（${trad}）`,
    );
    assert.ok(
      same(
        agentRetrieve(tools, simp, { topK: 5 }).topK.map((x) => x.id),
        agentRetrieve(tools, trad, { topK: 5 }).topK.map((x) => x.id),
      ),
      `agent：簡體與繁體查詢結果應一致（${trad}）`,
    );
    assert.ok(
      same(
        retrieve(tools, simp, { topK: 5 }).results.map((r) => r.id),
        retrieve(tools, trad, { topK: 5 }).results.map((r) => r.id),
      ),
      `fusion：簡體與繁體查詢結果應一致（${trad}）`,
    );
  }
});
