/**
 * core/query-normalize.js — 查詢端「簡轉繁」正規化
 *
 * 為什麼需要（2026-10-15 第七輪 Q4=A）
 * ──────────────────────────────────
 * 本專案的檢索語料（`registry/tools.json` 的 description／useCase／`*_zh`）以繁體為主，
 * 但真人可能用簡體輸入法打字。繁體查詢與簡體詞之間 **bigram 幾乎零重疊**，
 * 檢索會靜默失敗——不是回錯，是根本回不到（沒有任何錯誤訊息）。
 *
 * 離線量測（評測集 v1.4.0，257 題可命中，topK=5；把每題 t→cn 造出「簡體使用者」語料）
 * ─────────────────────────────────────────────────────────────────────────────
 *   | 引擎   | 簡體・正規化前 | 簡體・正規化後 | 繁體原樣（對照） |
 *   | agent  | 35.0%         | 58.4%         | 58.4%          |
 *   | fusion | 34.2%         | 56.8%         | 57.6%          |
 *   | L2     |  5.8%         |  9.7%         |  9.7%          |
 *   （Hit@1；MRR：agent 0.434→0.674、fusion 0.389→0.600）
 *
 *   · 回歸：257 題繁體查詢的命中位置 **0 題改變**（對已繁體輸入是 no-op）。
 *   · 誤報：評測集 257 題 0 筆誤判；`registry/` 繁體欄位 2593 筆有 17 筆被判定含簡體，
 *     逐筆檢視**全部是真陽性**（例「生產就绪」→「生產就緒」、「无需」→「無需」；allow-simplified：逐字引用實際資料缺陷，這些簡體字就是本節的證據本身），
 *     故在真實繁體語料上觀察到的誤報率為 0。
 *   · 簡體・正規化後仍略低於繁體原樣（fusion 56.8% vs 57.6%）是**量測方法的限制**，
 *     不是機制缺陷：合成語料走 t→cn 會把台灣詞彙也換掉（資訊→信息），而 cn→t
 *     只還原字形、不還原詞彙，所以合成語料比真人的簡體輸入更難。真人的簡體輸入
 *     只換字形，回復率會更高。
 *
 * 🔴 為何不無條件套用 opencc
 * ──────────────────────────
 * `toTraditional()` 內部已經守門：只有 `findSimplified()` 命中才交給 opencc 做詞組級
 * 轉換，否則原樣回傳。所以對純繁體字串它是**恆等函式**——這正是「0 回歸」的原因。
 * 反過來說，若有人改成無條件 opencc，就會把已繁體的字改壞（見 HANDOFF 陷阱 19）。
 *
 * 與 `scripts/translate-to-zh.js` 的分工：那邊處理**語料**（離線、一次性），
 * 這邊處理**查詢**（線上、每次）。兩者共用同一份對照表（`scripts/fix-simplified.js`），
 * 不得各自維護第二套。
 */
import { findSimplified, toTraditional } from '../scripts/fix-simplified.js';

/** 查詢是否含簡體字（保守偵測，與書寫門禁同一份表）。非字串／空字串一律 false。 */
export function hasSimplifiedQuery(query) {
  return typeof query === 'string' && query.length > 0 && findSimplified(query).length > 0;
}

/**
 * 把查詢正規化為繁體。**冪等**：對已繁體（或非字串）輸入原樣回傳，
 * 因此可以在多層入口重複套用而不會累積副作用。
 */
export function normalizeQuery(query) {
  if (!hasSimplifiedQuery(query)) return query;
  return toTraditional(query);
}
