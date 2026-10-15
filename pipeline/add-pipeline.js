/**
 * add-pipeline.js — 瀏覽器端「加入工具庫」管線（2026-10-15 裁決 Q1=B）
 *
 * 職責：在 GitHub Pages（純靜態、無後端）上重現本機工作台
 *       /api/tools/add 的「掃描＋補齊」兩階段，產出候選工具條目供人工預覽，
 *       確認後才交給 Cloudflare Worker 開 PR（見 worker/index.js）。
 *
 * 🔴 與本機路徑共用同一份程式碼，不另寫一份：
 *    掃描邏輯 = scripts/scan-tool.js（GitHub API＋封裝證據判讀）
 *    補齊邏輯 = core/tool-enricher.js（LLM，README 為據、誠實留白）
 *    分類白名單 = core/categories.js（setCategoryData 注入 categories.json）
 *    這正是 SSOT：改掃描/enrich 規則，兩邊同時生效。
 *
 * 🔴 使用者自備 LLM API key：只在呼叫 enrich 時作為參數傳入，
 *    不寫 localStorage、不經過 Worker、不落地。
 *
 * 🔴 刻意不產生 *_zh 欄位（skipZh: true）：純瀏覽器無法解析 opencc-js
 *    （bare specifier），與其降級成不完整的內建對照表，不如留白——
 *    中文欄位由合併後的 npm run translate:zh 統一補齊（與
 *    negativeConstraints_zh 既有的分工一致）。
 *
 * 版面（2026-10-15 Q1=B 關鍵設計）：
 *   原始碼樹：repo/pipeline/add-pipeline.js ← '../scripts/…' → repo/scripts/…
 *   部署樹：  dist/pipeline/add-pipeline.js ← '../scripts/…' → dist/scripts/…
 * 兩種樹的深度相同（pipeline/ 都在根的下一層、scripts/ 都在根），因此**同一組
 * 相對路徑在兩邊都成立**——這是不靠 build 時期改寫、也不靠 shim 轉發的前提。
 * build-web.js 負責把 repo/pipeline/* 複製到 dist/pipeline/，並把鏈上依賴
 * （scripts/scan-tool.js、core/*、worker/index.js）複製到 dist/ 的對應路徑。
 * fetch 用的是文件相對路徑（./registry/categories.json），與本檔位置無關。
 */

import { scan } from '../scripts/scan-tool.js';
import { enrichToolFromReadme } from '../core/tool-enricher.js';
import { setCategoryData } from '../core/categories.js';

let pipelineReady = false;

/**
 * 載入分類白名門（dist/registry/categories.json，由 build-web.js 自
 * registry/categories.json 複製——同一份 SSOT）。
 */
export async function ensurePipelineReady() {
  if (pipelineReady) return;
  const res = await fetch('./registry/categories.json', { cache: 'no-cache' });
  if (!res.ok) {
    throw new Error(`無法載入分類白名單（HTTP ${res.status}）——網站可能尚未重新 build`);
  }
  const data = await res.json();
  setCategoryData(data);
  pipelineReady = true;
}

/** 供測試重設注入狀態 */
export function resetPipelineReady() {
  pipelineReady = false;
}

/**
 * 掃描＋（可選）LLM 補齊，產出候選工具條目。
 *
 * @param {string} url - https://github.com/owner/repo（支援 /tree/<branch>/<subpath>）
 * @param {string} [apiKey] - 使用者自備 LLM key；空白則只做掃描階段
 * @param {object} [options]
 * @param {string} [options.apiBase]
 * @param {string} [options.model]
 * @returns {Promise<{tool: object, enriched: boolean, descriptionSource: string}>}
 */
export async function buildCandidate(url, apiKey, options = {}) {
  await ensurePipelineReady();

  const tool = await scan(String(url || '').trim(), { silent: true });
  // 描述來源供 PR 內文與人工核對：GitHub 描述優先、README 首段後備
  // （判據與 scan-tool.js 的 ghUsable 一致：>=40 字且非「待補充」）
  const ghDesc = String(tool.description || '').trim();
  const descriptionSource = ghDesc.length >= 40 && !/待補充/.test(ghDesc)
    ? 'github-description-or-readme' // scan 已依優先序擇一，兩者皆可能
    : 'readme-fallback';

  let enriched = false;
  if (apiKey) {
    const patch = await enrichToolFromReadme(tool, {
      apiKey,
      apiBase: options.apiBase,
      model: options.model,
      skipZh: true,
    });
    if (patch) {
      Object.assign(tool, patch);
      enriched = true;
    }
  }
  return { tool, enriched, descriptionSource };
}
