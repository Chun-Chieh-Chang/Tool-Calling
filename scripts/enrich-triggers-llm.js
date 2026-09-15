#!/usr/bin/env node
/**
 * enrich-triggers-llm.js — 用 LLM 為工具擴充「使用者視角」trigger（含偽陽性防護）
 *
 * 與既有 scripts/enrich-triggers.js 的差別
 * ───────────────────────────────────────
 * 後者是**人工查證版**（硬編碼 6 筆、逐筆附 evidence），適合少量精修。
 * 本腳本是**自動化版**，可全量處理 693 筆。兩者並存，不互相取代。
 *
 * 為什麼需要這個（2026-09-15 診斷）
 * ────────────────────────────────
 * 評測集中「正確答案進不了 top-20」的 19 筆，只有 5 筆（26%）是 metadata
 * 缺失；兩組平均描述長度幾乎相同（176.7 vs 176.0）。→ 主因是**語意鴻溝**：
 * 描述完整但用詞與使用者的說法對不上。故擴充「使用者會怎麼說」的詞彙。
 *
 * 試驗：19 個痛點工具（成功 13 個）→ top-20 召回 54.8% → 71.4%（+7 筆）
 *
 * ⚠️ 偽陽性防護（關鍵）
 * ────────────────────
 * LLM 會產生「幫我搞定」「有什麼推薦的嗎」「有沒有工具能做這個」這類
 * **任何工具都適用**的萬能詞。若寫入 triggers，任何查詢都會命中，
 * 造成大量偽陽性——直接違反專案「精度優先，寧可低覆蓋也不要偽陽性」原則。
 * 因此本腳本做兩道防護：
 *   1. prompt 明確禁止泛用語、要求「具體動作 + 對象」
 *   2. 後處理以 GENERIC_PHRASES 黑名單剔除
 *
 * 用法
 * ─────
 *   AGNES_API_KEY=sk-... node scripts/enrich-triggers-llm.js --limit=20 --dry
 *   AGNES_API_KEY=sk-... node scripts/enrich-triggers-llm.js --limit=50
 *   AGNES_API_KEY=sk-... node scripts/enrich-triggers-llm.js
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const REGISTRY = path.join(ROOT, 'registry', 'tools.json');
const BACKUP_DIR = path.join(ROOT, 'registry', 'backups');
const STATE_FILE = path.join(ROOT, 'registry', 'trigger-enrich-state.json');

const args = process.argv.slice(2);
const LIMIT = Number(args.find((a) => a.startsWith('--limit='))?.split('=')[1]) || Infinity;
const DRY = args.includes('--dry');
const FORCE = args.includes('--force');
// --show：印出每個工具實際產生的詞，用於驗證品質與黑名單效果
const SHOW = args.includes('--show');

const API_KEY = process.env.AGNES_API_KEY;
const API_URL = 'https://apihub.agnes-ai.com/v1/chat/completions';
const MODEL = process.env.ENRICH_MODEL || 'agnes-2.5-flash';
const CONCURRENCY = Number(process.env.ENRICH_CONCURRENCY || 4);
const DELAY_MS = Number(process.env.ENRICH_DELAY_MS || 800);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── 萬能詞黑名單：含這些片段的詞一律剔除 ─────────────────────────────────
// 實測 LLM 會產生的無鑑別力詞組；這些詞任何工具都適用，寫入會造成偽陽性。
const GENERIC_PHRASES = [
  '幫我搞定', '帮我搞定', '幫我看看', '帮我看看', '幫我想想', '帮我想想',
  '幫我想辦法', '帮我想办法', '求介紹', '求介绍',
  '太麻煩', '太麻烦', '太耗時', '太耗时',
  '有什麼推薦', '有什么推荐', '推薦個', '推荐个',
  '有沒有工具', '有没有工具', '有什麼工具', '有什么工具',
  '有工具嗎', '有工具吗', '有沒有APP', '有没有APP',
  '這個怎麼搞', '这个怎么搞', '怎麼實現', '怎么实现',
  '有沒有替代', '有没有替代', '有沒有類似', '有没有类似',
  '有沒有方法', '有没有方法', '有捷徑', '有捷径',
];

export function isGeneric(term) {
  const t = String(term || '');
  return GENERIC_PHRASES.some((p) => t.includes(p));
}

export { GENERIC_PHRASES };

function buildPrompt(tool) {
  const ctx = [
    `name: ${tool.name}`,
    `description: ${String(tool.description || '').slice(0, 300)}`,
    `capabilities: ${(tool.capabilities || []).join(', ')}`,
    `existing triggers: ${(tool.triggers || []).join(', ')}`,
  ].join('\n');

  return `${ctx}

請列出 8-10 個「使用者會怎麼描述這個需求」的關鍵詞／短語，用來幫助搜尋時命中這個工具。

嚴格要求：
1. 每個詞必須包含**具體的動作 + 對象**（例如「畫圖」「轉成文字」「抓網頁表格」
   「訓練模型」「審查程式碼」），要能明確對應到這個工具的用途
2. 中英文皆可，貼近一般口語說法
3. **禁止**產生沒有具體對象、任何工具都適用的泛用語，例如：
   「幫我搞定」「有沒有工具能做這個」「推薦個好用的」「這個怎麼搞」
   「幫我想想辦法」——這類詞會被自動剔除
4. 不要列出工具名稱本身

只回傳詞彙，用逗號分隔，不要任何解釋。`;
}

// 實測：並行 4 時大量請求被 429 限流（150 筆中 98 筆失敗）。
// 429 需要**較長**的退避才會恢復，故對它用獨立且更長的等待時間。
const MAX_RETRIES = 3;
const RATE_LIMIT_BACKOFF_MS = Number(process.env.ENRICH_429_BACKOFF_MS || 4000);

async function genTriggers(tool) {
  const body = JSON.stringify({
    model: MODEL,
    messages: [{ role: 'user', content: buildPrompt(tool) }],
    temperature: 0.3,
  });

  let lastErr = 'unknown';
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      // 指數退避；429 額外加長
      await sleep(RATE_LIMIT_BACKOFF_MS * 2 ** (attempt - 1));
    }
    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${API_KEY}` },
        body,
      });

      if (!res.ok) {
        const errText = await res.text();
        lastErr = `API ${res.status}: ${errText.slice(0, 80)}`;
        // 429（限流）與 5xx 值得重試；其他（如 401）直接放棄
        const retryable = res.status === 429 || res.status >= 500;
        if (retryable && attempt < MAX_RETRIES) continue;
        throw new Error(lastErr);
      }

      const d = await res.json();
      const text = String(d.choices?.[0]?.message?.content || '');
      return text
        .split(/[,，\n]/)
        .map((s) => s.trim().replace(/^[-•\d.\s]+/, ''))
        .filter((s) => s.length >= 2 && s.length <= 24)
        .filter((s) => !isGeneric(s))   // ← 偽陽性防護
        .slice(0, 10);
    } catch (e) {
      lastErr = e.message.slice(0, 80);
      if (attempt === MAX_RETRIES) throw new Error(lastErr);
    }
  }
  throw new Error(lastErr);
}

async function main() {
  if (!API_KEY) {
    console.error('Error: AGNES_API_KEY is not set.');
    console.error('Usage: AGNES_API_KEY=sk-... node scripts/enrich-triggers-llm.js [--limit=N] [--dry]');
    process.exit(1);
  }

  const j = JSON.parse(readFileSync(REGISTRY, 'utf8'));
  const state = existsSync(STATE_FILE) && !FORCE
    ? JSON.parse(readFileSync(STATE_FILE, 'utf8'))
    : { done: {}, model: MODEL };

  const all = j.tools.filter((t) => t.status === 'active' || t.status === 'experimental');
  const pending = all.filter((t) => !state.done[t.id]).slice(0, LIMIT);

  console.log(`\n工具總數 ${all.length}；已處理 ${Object.keys(state.done).length}；本次待處理 ${pending.length}`);
  if (DRY) console.log('（--dry：不會寫入 tools.json）\n');
  if (pending.length === 0) { console.log('沒有待處理的工具。'); return; }

  let ok = 0, fail = 0, filtered = 0;
  for (let i = 0; i < pending.length; i += CONCURRENCY) {
    const chunk = pending.slice(i, i + CONCURRENCY);
    const results = await Promise.all(chunk.map(async (tool) => {
      try {
        return { tool, news: await genTriggers(tool), err: null };
      } catch (e) {
        return { tool, news: [], err: e.message.slice(0, 60) };
      }
    }));

    for (const { tool, news, err } of results) {
      if (err) { fail++; console.error(`  ✗ ${tool.id}: ${err}`); continue; }
      if (news.length === 0) { fail++; filtered++; continue; }
      if (SHOW) console.log(`  ${tool.id}\n    → ${news.join(' / ')}`);
      tool.triggers = [...new Set([...(tool.triggers || []), ...news])];
      state.done[tool.id] = { at: new Date().toISOString(), added: news.length };
      ok++;
    }

    const done = Math.min(i + CONCURRENCY, pending.length);
    process.stdout.write(`  進度 ${done}/${pending.length}（成功 ${ok}／失敗 ${fail}）\r`);
    if (i + CONCURRENCY < pending.length) await sleep(DELAY_MS);
  }

  console.log(`\n\n完成：成功 ${ok}、失敗或全被過濾 ${fail}`);

  if (!DRY && ok > 0) {
    mkdirSync(BACKUP_DIR, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backup = path.join(BACKUP_DIR, `tools.${stamp}.json`);
    copyFileSync(REGISTRY, backup);
    console.log(`已備份 → ${path.relative(ROOT, backup)}`);

    writeFileSync(REGISTRY, `${JSON.stringify(j, null, 2)}\n`, 'utf8');
    writeFileSync(STATE_FILE, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
    console.log('已寫入 tools.json 與 trigger-enrich-state.json');
  }
}

// 僅在直接執行時啟動；被 import（例如單元測試）時不應自動跑，
// 否則 import 一個常數就會觸發整批 API 呼叫。
const isDirect = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirect) {
  main().catch((e) => { console.error('\n[Fatal]', e); process.exit(1); });
}
