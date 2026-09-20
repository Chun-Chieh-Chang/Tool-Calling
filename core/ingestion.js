#!/usr/bin/env node
/**
 * ingestion.js — 擷取層（Capture）管線規劃
 *
 * 為什麼要有這一層
 * ────────────────
 * The LLM Wiki Blueprint 第 3 頁用黃字警告指出一個盲點：
 *   「絕大多數人只專注在創作與檢索，卻忽略了最底層的**輸入瓶頸**。」
 * 第 4 頁進一步說：**你的知識庫上限，取決於高品質資料流入的速度。**
 *
 * 本專案原本只做「檢索層」（幫你從 705 支工具裡選出適合的），
 * 擷取層只是零散的工具，沒有「素材 → 可用筆記」的管線概念。
 * 這個模組補上那一層。
 *
 * 設計取捨
 * ────────
 * 每個階段只寫「這個階段要做什麼」的自然語言 query，
 * 實際工具交給**融合引擎**去選（與 `planToolSet` 同一條路徑，吃得到 V5 紅利）。
 * → 不寫死工具 id：registry 新增工具、或檢索引擎升級，管線會自動變好。
 * → 找不到合適工具時明確標註 `warning`，不硬湊（承襲本專案的誠實原則）。
 */

import { retrieve } from './retrieval-fusion.js';

// 階段配對的最低置信度（見 planIngestion 內的校正說明）
const MIN_STAGE_CONFIDENCE = 0.20;

/**
 * 各種素材來源的擷取管線
 *
 * 階段劃分參考藍圖第 4 頁（Shadow 錄音 → MinerU 解析 → Web Clipper 抓網頁，
 * 統一輸出 Markdown + YAML），再切細成可由工具接手的步驟。
 */
export const INGESTION_PIPELINES = {
  pdf: {
    label: 'PDF／研究文獻',
    hint: '論文、報告、技術文件',
    stages: [
      { key: 'parse', label: '解析轉檔', query: '把 PDF 轉成 Markdown，保留表格與公式' },
      { key: 'clean', label: '清理正規化', query: '清理轉檔後的文字雜訊並統一格式' },
      { key: 'metadata', label: '加上中繼資料', query: '為 Markdown 檔案加上 YAML frontmatter 與標籤' },
    ],
  },
  web: {
    label: '網頁／線上文章',
    hint: '部落格、文件網站、新聞',
    stages: [
      { key: 'fetch', label: '擷取內文', query: '抓取網頁內容並轉成乾淨的 Markdown' },
      { key: 'clean', label: '去雜訊', query: '移除網頁的選單廣告與多餘標籤，只留正文' },
      { key: 'metadata', label: '加上中繼資料', query: '為 Markdown 檔案加上 YAML frontmatter 與標籤' },
    ],
  },
  audio: {
    label: '語音／會議錄音',
    hint: '會議、訪談、語音備忘',
    stages: [
      { key: 'transcribe', label: '語音轉文字', query: '把語音或會議錄音轉成文字逐字稿' },
      { key: 'summarize', label: '摘要與行動項', query: '把逐字稿整理成重點摘要與行動清單' },
      { key: 'metadata', label: '加上中繼資料', query: '為 Markdown 檔案加上 YAML frontmatter 與標籤' },
    ],
  },
  video: {
    label: '影片／課程錄影',
    hint: '演講、教學影片',
    stages: [
      { key: 'subtitle', label: '產生字幕', query: '從影片或音訊產生字幕檔' },
      { key: 'notes', label: '轉成筆記', query: '把字幕內容整理成結構化筆記' },
      { key: 'metadata', label: '加上中繼資料', query: '為 Markdown 檔案加上 YAML frontmatter 與標籤' },
    ],
  },
  book: {
    label: '書籍／閱讀清單',
    hint: '電子書、書摘、閱讀紀錄',
    stages: [
      { key: 'collect', label: '蒐集書目', query: '整理閱讀清單與書摘' },
      { key: 'notes', label: '摘錄重點', query: '把書摘整理成結構化重點筆記' },
      { key: 'metadata', label: '加上中繼資料', query: '為 Markdown 檔案加上 YAML frontmatter 與標籤' },
    ],
  },
};

/** 列出所有支援的素材來源 */
export function listIngestionSources() {
  return Object.entries(INGESTION_PIPELINES).map(([key, v]) => ({
    key,
    label: v.label,
    hint: v.hint,
    stageCount: v.stages.length,
  }));
}

/**
 * 規劃一條擷取管線
 *
 * @param {object[]} tools - 完整工具註冊表
 * @param {string} source - pdf / web / audio / video / book（大小寫不拘）
 * @param {{topK?: number}} [options]
 * @returns {object|null} 不支援的來源回傳 null
 */
export function planIngestion(tools, source, options = {}) {
  const key = String(source || '').trim().toLowerCase();
  const def = INGESTION_PIPELINES[key];
  if (!def) return null;

  const topK = Math.min(Math.max(Number(options.topK) || 2, 1), 10);
  const byId = new Map(tools.map((t) => [t.id, t]));

  const stages = def.stages.map((s, i) => {
    const r = retrieve(tools, s.query, { topK });
    const picked = r.results.map((x) => byId.get(x.id)).filter(Boolean);
    // 🔴 誠實機制：置信度不足就承認找不到，不要硬湊一個不相關的工具。
    //    實測踩過：PDF 管線的「清理正規化」步驟被配上 watermarks-remover
    //    （那是移除浮水印的工具，跟文字清理無關）——只因為它是分數最高的。
    //    沿用融合引擎既有的 decision / confidence（與 rerank 的 NONE 棄權同源）。
    // 門檻只用 confidence，不看 decision：
    //   實測這些「描述工作內容」的查詢幾乎都被融合引擎判為 no-match
    //   （它是為「有沒有明確單一答案」設計的），但 top-1 常常其實是對的。
    //   校正依據（真實 registry）：pdf2md 0.26 ✓／whisper 0.22 ✓／crawlee 0.38 ✓
    //                            watermarks-remover 0.15 ✗（浮水印≠文字清理）
    //   → 0.20 能把明顯的錯配濾掉，又不會把正確的配對誤殺。
    const confident = (r.confidence ?? 0) >= MIN_STAGE_CONFIDENCE;
    const primary = confident ? (picked[0] || null) : null;
    return {
      stepIndex: i + 1,
      key: s.key,
      label: s.label,
      query: s.query,
      recommendedTool: primary ? {
        id: primary.id,
        name: primary.name,
        category: primary.category,
        useCase: primary.useCase || primary.description || '',
        install: primary.install || null,
      } : null,
      alternatives: picked.slice(1).map((t) => ({ id: t.id, name: t.name })),
      warning: primary ? null : '工具庫中找不到高置信度的對應工具，此步驟建議人工處理',
    };
  });

  const flow = stages.map((s) =>
    `[${s.stepIndex}. ${s.recommendedTool ? s.recommendedTool.name : s.label + '（待補）'}]`);
  const missing = stages.filter((s) => !s.recommendedTool).length;

  return {
    sourceType: key,
    label: def.label,
    hint: def.hint,
    totalSteps: stages.length,
    stages,
    asciiPipeline: `${def.label} ──> ${flow.join(' ──(Data Flow)──> ')}`,
    summary: missing > 0
      ? `已為「${def.label}」規劃 ${stages.length} 個步驟，其中 ${missing} 步找不到合適工具`
      : `已為「${def.label}」規劃 ${stages.length} 個擷取步驟`,
  };
}
