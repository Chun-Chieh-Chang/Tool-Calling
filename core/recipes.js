/**
 * recipes.js — 人工驗證配方庫（Batch 3b）
 *
 * 設計（docs/superpowers/plans/2026-10-03-batch3a-intent-archetypes.md 的後續）：
 * - registry/recipes.json 是**手工驗證**的多工具配方（steps + 資料流契約 +
 *   validated 旗標）—— advisory board 紀律：「寧可 3 條真的，不要 300 條假的」；
 *   禁止自動生成配方，新增一律走人工驗證。
 * - matchRecipe()：patterns 為**正規表示式**（case-insensitive），命中即回傳配方。
 * - 零回歸：檔案不存在或格式壞 → 回傳 null → cli.js plan 走原 planToolSet 路徑。
 *
 * 測試：環境變數 RECIPES_FILE 可改寫載入路徑（每次呼叫時讀取，便於測試隔離）。
 */
import { readFileSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_FILE = path.join(__dirname, '..', 'registry', 'recipes.json');

let cache = { mtimeMs: null, recipes: null };

function recipesFilePath() {
  return process.env.RECIPES_FILE || DEFAULT_FILE;
}

/**
 * 載入配方庫（mtime 快取）。不存在或解析失敗 → null（上層走原規劃路徑）。
 * 形狀驗證：每筆配方需 id/patterns/steps；patterns 中的非法 regex 該條丟棄。
 * @returns {Array|null}
 */
export function loadRecipes() {
  const file = recipesFilePath();
  if (!existsSync(file)) return null;
  try {
    const mtimeMs = statSync(file).mtimeMs;
    if (cache.mtimeMs === mtimeMs && cache.recipes) return cache.recipes;
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    const raw = Array.isArray(parsed) ? parsed : parsed.recipes;
    if (!Array.isArray(raw)) throw new Error('配方庫必須是陣列或含 recipes 陣列');
    const recipes = [];
    for (const r of raw) {
      if (!r || typeof r.id !== 'string' || r.validated !== true) continue; // 未驗證配方不上線
      if (!Array.isArray(r.patterns) || !Array.isArray(r.steps) || r.steps.length === 0) continue;
      const patterns = r.patterns.filter((p) => {
        try {
          new RegExp(p, 'i');
          return true;
        } catch {
          return false;
        }
      });
      if (patterns.length === 0) continue;
      recipes.push({ ...r, patterns });
    }
    cache = { mtimeMs, recipes };
    return recipes;
  } catch {
    return null;
  }
}

/**
 * 查詢命中配方 → 回傳第一個命中的配方；無命中回 null。
 * @param {string} taskDescription
 * @param {Array} recipes - loadRecipes() 的結果
 * @returns {object|null}
 */
export function matchRecipe(taskDescription, recipes) {
  if (!recipes || recipes.length === 0) return null;
  const text = String(taskDescription || '');
  if (!text.trim()) return null;
  for (const r of recipes) {
    for (const p of r.patterns) {
      try {
        if (new RegExp(p, 'i').test(text)) return r;
      } catch {
        /* 載入時已過濾；此處防禦 */
      }
    }
  }
  return null;
}
