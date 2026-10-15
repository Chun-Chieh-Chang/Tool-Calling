/**
 * tool-id.js — 工具 ID 產生器（純函式，瀏覽器／Node 共用）
 *
 * 為什麼從 core/registry.js 抽出來：
 *   registry.js 頂端 import node:fs（版控 I/O），scan-tool.js 卻只需要
 *   generateId 這個純字串函式。瀏覽器端「加入工具庫」管線（web/add-pipeline.js）
 *   要 import scan-tool.js，整條鏈就不能碰到 node: 內建模組。
 *
 * 2026-10-15 Q1=B（Worker 開 PR）重構：邏輯原樣搬移，行為完全不變。
 * core/registry.js 以 re-export 維持既有 import 路徑相容。
 */

/**
 * 從工具名稱產生 URL-safe 的 ID。
 *
 * 規則：轉小寫 → 移除非 [a-z0-9\s-] 字元 → 空白轉連字號 →
 *       收斂重複連字號 → 去除首尾連字號。
 */
export function generateId(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}
