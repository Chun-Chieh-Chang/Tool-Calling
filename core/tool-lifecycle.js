/**
 * tool-lifecycle.js — 工具生命週期狀態轉換（單一真理來源）
 *
 * 入庫管線有四個站點會考慮把工具從 experimental 升上 active：
 *   1. cli.js cmdAdd() 的語意補齊階段
 *   2. web/server.js enrichToolInBackground()
 *   3. scripts/enrich-new-tools.js 的工作迴圈
 *   4. scripts/translate-to-zh.js flush()
 *
 * 升級條件過去在四處各寫一份，真正踩到的坑卻是「誰都不接手升級」：
 * enrich 階段跑在 translate 之前，當時 isFullyEnriched() 必定為 false，
 * 而唯一補上 description_zh 的 translate 站點原本沒有升級判斷，
 * 欄位齊全的工具因此永久卡在 experimental。
 * 把轉換收斂成一個純函式後，四站只負責「何時呼叫」與「印什麼 log」。
 */

import { isFullyEnriched } from './tool-enricher.js';

/**
 * 語意欄位齊全時把 experimental 升級為 active（原地修改）。
 *
 * 只在狀態真的是 experimental 時改動；active／deprecated／archived 一律不動，
 * 所以這個函式可以安全地重複呼叫（冪等）。
 *
 * @param {object} tool registry 中的工具物件（會被原地修改）
 * @returns {boolean} 本次是否發生升級（呼叫端用它決定要不要印 log）
 */
export function activateIfComplete(tool) {
  if (!tool || tool.status !== 'experimental') return false;
  if (!isFullyEnriched(tool)) return false;
  tool.status = 'active';
  return true;
}
