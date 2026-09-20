#!/usr/bin/env node
/**
 * tool-chain.js — 多工具組合規劃（走融合引擎版）
 *
 * 為什麼獨立一支檔案
 * ──────────────────
 * `planToolChain()` 位於 `core/search-engine.js`，預設用 L2 詞彙引擎找每一步的工具。
 * 但 L2 落後主檢索很多——知識編譯器 V5 上線後，融合路徑的 agent Hit@1 比 L2 高了
 * 40pp 以上（60.4% vs 12.6%）。工具鏈規劃若繼續用 L2，等於用最弱的那條引擎。
 *
 * 由於 `search-engine.js` 不能反過來 import `retrieval-fusion.js`（會形成循環，
 * 因為 fusion 本身就 import search），所以在這裡做一層薄包裝：
 * 把「融合引擎找工具」注入給 `planToolChain`。
 *
 * 使用
 * ────
 *   const plan = planToolSet(tools, '抓網頁資料然後做成簡報');
 *   plan.steps[i].recommendedTool  // 該步驟的主力工具
 *   plan.steps[i].alternatives     // 備選
 *   plan.asciiPipeline             // ASCII 流程圖
 */

import { retrieve } from './retrieval-fusion.js';
import { planToolChain } from './search-engine.js';

/**
 * 產生一個「單步驟描述 → 工具陣列」的對應函式，內部走融合引擎。
 *
 * @param {object[]} tools - 完整工具註冊表
 * @param {{topK?: number}} [options]
 * @returns {(seg: string) => object[]}
 */
export function fusionToolFinder(tools, options = {}) {
  const { topK = 3 } = options;
  const byId = new Map(tools.map((t) => [t.id, t]));
  return (seg) => {
    const r = retrieve(tools, seg, { topK });
    return r.results.map((x) => byId.get(x.id)).filter(Boolean);
  };
}

/**
 * 走融合引擎的工具鏈規劃（對外主要入口）
 *
 * @param {object[]} tools
 * @param {string} taskDescription - 多步驟任務描述（用「然後／接著」分隔）
 * @param {{topK?: number}} [options]
 * @returns {object} 與 planToolChain 同結構，外加 engine 欄位
 */
export function planToolSet(tools, taskDescription, options = {}) {
  const plan = planToolChain(tools, taskDescription, {
    ...options,
    findTools: options.findTools || fusionToolFinder(tools, options),
  });
  return { ...plan, engine: 'retrieval-fusion (V5)' };
}
