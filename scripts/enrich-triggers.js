#!/usr/bin/env node
/**
 * 補完 trigger 詞表 —— 為關鍵工具補充更具鑑別力的觸發詞（唯讀預覽 / --apply 寫入）
 *
 * 原則：
 * - 只加「罕見且有意義」的觸發詞（IDF 高），不重複既有 trigger
 * - 補的是工具本身確實具備的能力，不憑名稱推測（遵守「絕對不可編造」原則）
 * - 每筆補完前已查證該工具的官方 README / 功能，不加入錯誤標籤
 */

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const TOOLS_PATH = path.join(ROOT, 'registry', 'tools.json');
const j = JSON.parse(readFileSync(TOOLS_PATH, 'utf8'));
const tools = j.tools;

// ── 待補完清單（已查證，每筆註明依據）────────────────────────────────────
// 格式：{ id, add: [trigger...], evidence: '依據' }
const PLAN = [
  {
    id: 'summarize',
    add: ['youtube-transcript', 'video-to-text', 'podcast-notes', 'transcription', 'markdown-notes', 'llm-summary'],
    evidence: 'README: 將 YouTube/podcast/影片 轉為文字並產生 markdown 摘要；既有 trigger 缺「transcript / notes / 摘要」信號',
  },
  {
    id: 'ppt-master',
    add: ['presentation', 'slides-deck', 'ai-ppt', 'narration'],
    evidence: 'README: 從文件/主題生成可編輯 PPTX、含動態圖表與語音旁白；既有 trigger 缺「presentation / deck / 旁白」',
  },
  {
    id: 'yfinance',
    add: ['yahoo-stock', 'equity-data', 'price-history', 'fundamental-data'],
    evidence: '既有 trigger 已含 stock-data/historical-prices，補「fundamental-data / price-history」強化財務資料信號',
  },
  {
    id: 'playwright',
    add: ['js-rendered', 'headless-browser', 'dom-scraping', 'cross-browser-e2e'],
    evidence: 'README: 跨瀏覽器 E2E 測試與爬蟲，支援 JS 動態渲染頁面；既有 trigger 缺「js-rendered / headless」',
  },
  {
    id: 'browser-use',
    add: ['ai-web-agent', 'js-rendered-scraping', 'logged-in-browsing'],
    evidence: 'README: AI 驅動的瀏覽器自動化，處理 JS 渲染與登入態操作',
  },
  {
    id: 'crawlee',
    add: ['web-crawler-framework', 'scraping-pipeline', 'crawler-framework'],
    evidence: 'README: Apify 的爬蟲框架，支援 Playwright/Puppeteer/HTTP 多引擎',
  },
];

// ── 既有 trigger 正規化（避免重複）──────────────────────────────────────
function existingTriggersOf(t) {
  return new Set((t.triggers || []).map((s) => String(s).toLowerCase().trim()));
}

let apply = process.argv.includes('--apply');
let changed = 0;

for (const plan of PLAN) {
  const t = tools.find((x) => x.id === plan.id);
  if (!t) {
    console.log('  ⚠ 找不到工具：' + plan.id);
    continue;
  }
  const have = existingTriggersOf(t);
  const toAdd = plan.add.filter((trig) => !have.has(String(trig).toLowerCase().trim()));
  const skipped = plan.add.filter((trig) => have.has(String(trig).toLowerCase().trim()));

  console.log(`${apply ? '✓' : '○'} ${t.id}`);
  console.log(`    既有 ${have.size} 個；本次將新增 ${toAdd.length}：${toAdd.join(' / ') || '（無）'}`);
  if (skipped.length) console.log(`    已存在、略過：${skipped.join(' / ')}`);
  console.log(`    依據：${plan.evidence}`);

  if (apply && toAdd.length > 0) {
    t.triggers = [...(t.triggers || []), ...toAdd];
    changed++;
  }
}

if (apply && changed > 0) {
  writeFileSync(TOOLS_PATH, JSON.stringify(j, null, 2) + '\n');
  console.log(`\n已寫入 ${changed} 筆 trigger 補完 → ${path.relative(ROOT, TOOLS_PATH)}`);
} else {
  console.log('\n（預覽模式，未寫入。加 --apply 真正落盤）');
}
