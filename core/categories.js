/**
 * categories.js — 分類的唯一存取入口
 *
 * 為什麼需要這個模組：
 *   2026-09-12 的審計發現，18 個分類原本散落在 5 個以上位置（schema enum、
 *   classifier 常數與 LLM prompt、知識圖譜色表、rescan 領域規則、CLASSIFICATION.md），
 *   彼此靠人工同步，一天內就出現 4 次脫節。
 *
 *   現在所有消費端一律經過本模組讀取 registry/categories.json，
 *   不再各自維護一份拷貝。
 *
 * 單一來源：registry/categories.json
 * 強制驗證：scripts/check-mece.js
 * 同步衍生檔：npm run categories:sync
 *
 * 2026-10-15 Q1=B（Worker 開 PR）：為了讓瀏覽器端「加入工具庫」管線
 * （web/add-pipeline.js → scan-tool.js → 本模組）能共用同一份分類白名單，
 * 移除頂端靜態 node: import，改為：
 *   · Node：首次呼叫時才動態載入 node:fs（行為與過去完全相同）
 *   · 瀏覽器：由呼叫端 fetch('./registry/categories.json') 後 setCategoryData() 注入
 * 注入優先於讀檔——這正是 SSOT：兩邊讀的都是同一份 categories.json。
 */

// 動態載入 node 內建模組；瀏覽器環境 import 失敗時留空（走注入路徑）。
let _fs = null;
let _path = null;
try {
  _fs = await import('node:fs');
  _path = await import('node:path');
} catch {
  _fs = null;
  _path = null;
}

/** registry/categories.json 的絕對路徑（僅 Node 有效；瀏覽器為空字串） */
export const CATEGORIES_PATH = _path && _fs
  ? _path.join(_path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', 'registry', 'categories.json')
  : '';

// 瀏覽器注入的 categories.json 內容（null = 未注入，走 Node 讀檔路徑）
let _injected = null;

// 讀檔結果快取（注入路徑不使用——注入的物件本身就是唯一來源）
let _cache = null;

/**
 * 注入 categories.json 內容（瀏覽器端使用）。
 * 傳入的必須是 registry/categories.json 解析後的完整物件；
 * 注入後 loadCategories() 一律回傳它，直到 clearCategoryData()。
 */
export function setCategoryData(json) {
  _injected = json;
  _cache = null;
}

/** 清除注入內容，恢復 Node 讀檔路徑（測試用） */
export function clearCategoryData() {
  _injected = null;
  _cache = null;
}

/** 讀取完整 categories.json（含 meta 欄位），結果會快取 */
export function loadCategories() {
  if (_injected) return _injected;
  if (!_cache) {
    if (!_fs || !_path) {
      throw new Error('categories.js：非 Node 環境且未注入分類資料（呼叫端應先 setCategoryData）');
    }
    _cache = JSON.parse(_fs.readFileSync(CATEGORIES_PATH, 'utf8'));
  }
  return _cache;
}

/** 18 個分類的完整定義陣列 */
export function categoryList() {
  return loadCategories().categories;
}

/** 18 個分類名稱，順序與 categories.json 一致 */
export function categoryNames() {
  return categoryList().map(c => c.name);
}

/** { 分類名: 色碼 } — 供知識圖譜使用 */
export function categoryColors() {
  return Object.fromEntries(categoryList().map(c => [c.name, c.color]));
}

/** 只回傳「有定義領域關鍵詞」的分類（用於 rescan 的領域規則） */
export function categoriesWithKeywords() {
  return categoryList().filter(c => Array.isArray(c.keywords) && c.keywords.length > 0);
}

/** 依名稱取得單一分類定義 */
export function categoryByName(name) {
  return categoryList().find(c => c.name === name) || null;
}

/** 產生「分類清單」文字區塊，供 LLM prompt 使用 */
export function promptCategoryBlock() {
  return categoryList().map(c => `${c.name} - ${c.definition}`).join('\n');
}

/** 產生決策樹優先序文字區塊，供 LLM prompt 使用 */
export function promptDecisionTree() {
  return [
    '1. 學術研究/論文/文獻/學術資料集 → 研究',
    '2. 教程/課程/書籍/Awesome 清單/領域主題 curated 清單，且主要價值是「閱讀、學習、參考」→ 學習資源',
    '   （主題不改變清單的性質；但條目是可直接呼叫的 API 端點 → API 整合；是可掛載執行的 agent/skill 包 → AI 代理）',
    '3. 可直接調用的 API 端點目錄/API 網關/多供應商聚合器 → API 整合',
    '4. 成品 Agent 產品/agent harness/skill・plugin 集合 → AI 代理',
    '   （但領域專屬 skill 包 → 該領域，判定只看名稱欄位：如 anthropic-cybersecurity-skills → 安全性、minimax-ppt-skills → 文件生產力）',
    '5. LLM SDK/模型本體/推理訓練框架/本地模型運行時 → AI 框架',
    '6. 開發流程輔助（CLI/IDE/code review/proxy/token 壓縮）→ 開發工具',
    '7. 依領域關鍵詞落入其餘分類（安全性、金融與投資、3D工程繪圖、瀏覽器自動化、數據分析、',
    '   多媒體生成、影片、音訊、文件生產力、知識管理、UI/UX設計、測試與自動化）'
  ].join('\n');
}
