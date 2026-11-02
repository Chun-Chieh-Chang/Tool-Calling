/**
 * search-cache-fingerprint.test.js — 守門：快取指紋必須反映 subTools 的變更（2026-11-02）
 *
 * 🔴 為什麼需要這條守門：
 * 搜尋結果快取以「工具庫指紋」為鍵，但指紋原本只雜湊工具層欄位，
 * **完全不含 subTools**。subTools 是檢索的重要素材（3,871 筆，
 * 擴大翻譯後還多了 name_zh／description_zh），卻不在指紋裡 →
 * 改了 subTools 之後指紋不變 → 快取回傳過期結果。
 *
 * 實測危害：做「擴大翻譯」的配對 A/B 時，before／after 兩份 registry
 * 指紋相同 → 先跑的那份把結果寫進快取，後跑的那份直接命中快取 →
 * 量到的是同一份結果，卻看起來像「擴大前後完全沒差異」。
 *
 * 正式服務的影響同樣真實：registry 更新後 5 分鐘內的回應是舊的。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { getRegistryCacheFingerprint } from '../core/search-engine.js';

const base = () => [{
  id: 'demo-collection',
  name: 'Demo',
  status: 'active',
  category: 'dev',
  description: 'demo',
  triggers: ['x'],
  useCase: 'demo',
  subTools: [{ subpath: 'skills/a', name: 'A', description: 'English A' }],
}];

test('改 subTools 的 description_zh → 指紋必須改變', () => {
  const a = base();
  const b = base();
  b[0].subTools[0].description_zh = '中文描述';
  assert.notEqual(
    getRegistryCacheFingerprint(a),
    getRegistryCacheFingerprint(b),
    'subTool 的中文描述改了，指紋卻沒變 → 快取會回傳過期結果'
  );
});

test('改 subTools 的 name_zh → 指紋必須改變', () => {
  const a = base();
  const b = base();
  b[0].subTools[0].name_zh = '名稱';
  assert.notEqual(getRegistryCacheFingerprint(a), getRegistryCacheFingerprint(b));
});

test('新增一個 subTool → 指紋必須改變', () => {
  const a = base();
  const b = base();
  b[0].subTools.push({ subpath: 'skills/b', name: 'B', description: 'English B' });
  assert.notEqual(getRegistryCacheFingerprint(a), getRegistryCacheFingerprint(b));
});

test('改 subTool 的英文描述 → 指紋必須改變', () => {
  const a = base();
  const b = base();
  b[0].subTools[0].description = 'English A revised';
  assert.notEqual(getRegistryCacheFingerprint(a), getRegistryCacheFingerprint(b));
});

test('同一份工具庫 → 指紋穩定（可快取）', () => {
  const a = base();
  assert.equal(getRegistryCacheFingerprint(a), getRegistryCacheFingerprint(a));
  // 內容相同但不同陣列 → 指紋相同（內容才是鍵，不是身分）
  assert.equal(getRegistryCacheFingerprint(a), getRegistryCacheFingerprint(base()));
});
