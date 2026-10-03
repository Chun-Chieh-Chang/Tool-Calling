/**
 * archetype.js — 意圖原型層（Batch 3a）
 *
 * 設計（docs/superpowers/plans/2026-10-03-batch3a-intent-archetypes.md）：
 * - 原型表 registry/intent-archetypes.json 是人工策展的任務家族 → 工具映射，
 *   衍生源頭是**工具側元資料**（非評測題反推），對評測集而言是乾淨考卷。
 * - 引擎用法：查詢命中原型 → 該原型映射的工具在 fuse() 的 weighted 獲得
 *   ARCHETYPE_BOOST 小幅提升——只裁決「本來就並列」的同分群，
 *   不擴召回、不加候選（候選必須先通過維度門檻才存在）。
 * - 零回歸：檔案不存在或格式壞 → 回傳 null → 整層停用，行為與未上線前完全一致。
 *
 * 測試：環境變數 ARCHETYPE_FILE 可改寫載入路徑（每次呼叫時讀取，便於測試隔離）。
 */
import { readFileSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_FILE = path.join(__dirname, '..', 'registry', 'intent-archetypes.json');

let cache = { mtimeMs: null, archetypes: null };

function archetypeFilePath() {
  return process.env.ARCHETYPE_FILE || DEFAULT_FILE;
}

/**
 * 載入原型表（mtime 快取）。不存在或解析失敗 → null（上層停用整層）。
 * @returns {Array|null} [{ id, name, patterns, tools }]
 */
export function loadArchetypes() {
  const file = archetypeFilePath();
  if (!existsSync(file)) return null;
  try {
    const mtimeMs = statSync(file).mtimeMs;
    if (cache.mtimeMs === mtimeMs && cache.archetypes) return cache.archetypes;
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    if (!Array.isArray(parsed)) throw new Error('原型表必須是陣列');
    const archetypes = parsed.filter(
      (a) => a && typeof a.id === 'string' && Array.isArray(a.patterns) && Array.isArray(a.tools)
    );
    cache = { mtimeMs, archetypes };
    return archetypes;
  } catch {
    return null;
  }
}

/**
 * 查詢命中原型 → 回傳應獲得提升的工具 id 集合（多原型取聯集）。
 * 畸形原型（缺 patterns / patterns 非陣列）跳過不拋錯。
 * @param {string} query
 * @param {Array} archetypes - loadArchetypes() 的結果
 * @returns {Set<string>}
 */
export function matchArchetypes(query, archetypes) {
  const matched = new Set();
  if (!archetypes || archetypes.length === 0) return matched;
  const norm = String(query || '').toLowerCase();
  if (!norm) return matched;
  for (const a of archetypes) {
    if (!Array.isArray(a.patterns)) continue;
    for (const p of a.patterns) {
      if (typeof p === 'string' && p && norm.includes(p.toLowerCase())) {
        if (Array.isArray(a.tools)) for (const tid of a.tools) matched.add(tid);
        break; // 一個原型命中一個 pattern 即成立
      }
    }
  }
  return matched;
}
