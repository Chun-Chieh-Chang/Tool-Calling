/**
 * translate-subtools-structure.test.js — 守住「批次處理只有一份實作」（2026-11-02）
 *
 * 🔴 這條守門存在的原因：
 * 2026-11-02 擴大翻譯跑完主批次後，**補救批次整段崩潰**
 * （`ReferenceError: noProse is not defined`），補救的 466 筆全部沒跑。
 * 根因不是邏輯錯，是**主批次與補救批次各有一份看起來一樣的程式碼**，
 * 改動（加上 noProse 標記）只改到其中一份，另一份就炸了。
 *
 * 修法不只是補上那一行，而是把兩份合併成一個 handleBatch()。
 * 這支測試守住合併成果：**寫入快取的點必須只有一處**。
 * 日後若有人把邏輯複製一份出去，這條會先響。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(path.join(ROOT, 'scripts', 'translate-subtools.js'), 'utf8');

test('寫入 subTool 譯文的點只有一個（主批次與補救批次共用同一份實作）', () => {
  const writes = [...src.matchAll(/ts\.entries\[[^\]]+\]\s*=(?!=)/g)];
  assert.equal(writes.length, 1,
    `找到 ${writes.length} 個寫入點 → 邏輯又被複製了一份，改動只改到其中一份時會整段崩潰`);
});

test('validate() 的解構點只有一個，且與寫入點相鄰（同一個函式內）', () => {
  const destructure = [...src.matchAll(/const \{ problems, name_zh, description_zh/g)];
  const writes = [...src.matchAll(/ts\.entries\[[^\]]+\]\s*=(?!=)/g)];
  assert.equal(destructure.length, 1, `找到 ${destructure.length} 個解構點`);
  const lineOf = (m) => src.slice(0, m.index).split('\n').length;
  assert.ok(Math.abs(lineOf(writes[0]) - lineOf(destructure[0])) < 15,
    '解構與寫入應該在同一個函式裡 —— 距離太遠代表又被拆成兩份');
});

test('noProse 旗標在寫入時被保留（覆蓋率口徑才不會被灌水）', () => {
  assert.ok(/noProse \? \{ noProse: true \}/.test(src),
    '寫入快取時沒有保留 noProse 標記 → 無正文的項目會被算成「已中文化」');
});
