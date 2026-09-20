#!/usr/bin/env node
/**
 * compile-wiki.js — 工具知識編譯器（離線）
 *
 * 這是「工具解析邏輯」的新的實作。
 *
 * 為什麼需要它
 * ────────────
 * 本專案既有的解析（`scripts/scan-tool.js` / `enrich-registry.js`）是
 * **摘錄型**的：從 GitHub README 抽出 description / capabilities / triggers。
 * 摘錄出來的文字是「工具自己的語言」——技術分類、通用能力。
 *
 * 但使用者搜尋時用的是「自己的語言」——具體情境、具體物件。
 * 診斷（`npm run ceiling`）顯示 semantic 類型天花板只有 91.1%，
 * 根因就是這個**詞彙鴻溝**：
 *   使用者說：「齒輪的齒數跟模數一改整組尺寸自動跟著變」
 *   工具寫：「參數化 3D CAD 腳本框架」
 *   兩者 bigram 重疊 = 0 → 純詞彙檢索在原理上不可能找到。
 *
 * 編譯器做什麼
 * ────────────
 * 借 LLM Wiki「從檢索器升級成知識編譯器」的觀念：**離線把原始 metadata
 * 編譯成「使用者會怎麼開口」的詞條**，查詢時查編譯好的詞條，而不是原始描述。
 *
 *   Tier 0（--offline，不需 API）  規則式：把既有結構化欄位重組為詞條
 *   Tier 1（LLM，需 AGNES_API_KEY）語意式：產生使用者語言的應用場景句
 *
 * 兩層寫進同一份 `registry/compiled-entries.json`，Tier 1 覆寫 intents。
 *
 * 一次性成本 vs 每次查詢成本
 * ──────────────────────────
 * 與 HyDE 的關鍵差別：HyDE 是**每次查詢**都要呼叫 LLM 改寫
 * （實測 +6s、且效果落在雜訊內，故不採用）；編譯器是**705 支工具跑一次**，
 * 之後每次查詢都不用再呼叫 LLM。
 *
 * 兩個防護（都是本專案踩過的坑）
 * ────────────────────────────
 * 1. **萬能詞黑名單**：LLM 會產生「幫我處理資料」這種任何工具都適用的句子，
 *    寫進去會讓任何查詢都命中 → 直接剔除（沿用 enrich-triggers-llm.js 的教訓）。
 * 2. **鑑別力守門**：若一句 intent 裡**沒有任何一個詞具有鑑別力**
 *    （所有詞都出現在超過 6% 的工具裡），代表它是空話 → 剔除。
 *    這是 trigger 擴充「擴到 361 筆反而退步」的教訓。
 *
 * 用法
 * ────
 *   node scripts/compile-wiki.js --offline            # Tier 0（不需 key）
 *   AGNES_API_KEY=sk-... node scripts/compile-wiki.js --limit=10 --dry
 *   AGNES_API_KEY=sk-... node scripts/compile-wiki.js --limit=30
 *   AGNES_API_KEY=sk-... node scripts/compile-wiki.js            # 全量
 *   node scripts/compile-wiki.js --stats              # 覆蓋率與圖譜統計
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { toTraditional } from './fix-simplified.js';
import { tokenize, documentFrequency } from '../core/tokenize.js';
import { buildWikiIndex, wikiGraphStats } from '../core/wiki-matcher.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const REGISTRY = path.join(ROOT, 'registry', 'tools.json');
const OUT_PATH = path.join(ROOT, 'registry', 'compiled-entries.json');

const args = process.argv.slice(2);
const OFFLINE = args.includes('--offline');
const DRY = args.includes('--dry');
const RESET = args.includes('--reset');
const STATS = args.includes('--stats');
const LIMIT = Number(args.find((a) => a.startsWith('--limit='))?.split('=')[1]) || Infinity;
const IDS_ARG = args.find((a) => a.startsWith('--ids='))?.split('=')[1];
const BATCH = Number(args.find((a) => a.startsWith('--batch='))?.split('=')[1]) || 3;
const CONCURRENCY = Number(process.env.COMPILE_CONCURRENCY || 2);
const MODEL = args.find((a) => a.startsWith('--model='))?.split('=')[1] || 'agnes-2.5-flash';

const VERSION = '1.0.0';

// ── 萬能詞黑名單 ───────────────────────────────────────────────────────────
// 判準（與 enrich-triggers-llm.js 一致）：**有沒有具體對象**。
// 「幫我畫圖」有具體對象 → 放行；「幫我搞定」沒有 → 擋。
const GENERIC_PATTERNS = [
  /^幫我(搞定|看看|想想|處理|弄|做|弄一|想辦法)/,
  /^帮我(搞定|看看|想想|处理|弄|做|想辦法)/,
  /有(沒有|没有)?(什麼|什么)?(工具|app|APP|套件|軟體)/,
  /(求|給我)?推薦/,
  /怎麼(實現|实现|搞|做)$/,
  /^(這個|这个)/,
  /(資料|数据|檔案|文件|東西|东西)$/,   // 結尾只有泛稱 → 沒有具體對象
];

function isGenericIntent(s) {
  const t = String(s || '').trim();
  if (t.length < 8) return true;              // 太短，不可能有具體情境
  for (const re of GENERIC_PATTERNS) if (re.test(t)) return true;
  return false;
}

// ── Tier 0：規則式編譯 ─────────────────────────────────────────────────────
// 把既有結構化欄位機械式重組為詞條。沒有語意增益，
// 但讓整條 V5 管線在沒有 API key 時也能跑、能測、能驗證零回歸。
function compileOffline(tool) {
  const intents = [];
  const uc = String(tool.useCase_zh || tool.useCase || '').trim();
  if (uc) intents.push(uc);
  for (const t of (tool.triggers || []).slice(0, 4)) {
    const s = String(t || '').trim();
    if (s && s.length >= 4) intents.push(s);
  }
  return {
    intents,
    objects: [...(tool.capabilities || []), tool.category].filter(Boolean).map(String),
    actions: [],
    constraints: [tool.install?.method, tool.language].filter(Boolean).map(String),
    negative: (tool.negativeConstraints_zh || tool.negativeConstraints || []).filter(Boolean).map(String),
  };
}

// ── Tier 1：LLM 語意編譯 ───────────────────────────────────────────────────
const SYS = `你是「工具知識編譯器」。輸入是開源工具的技術性 metadata，
輸出是**用繁體中文（台灣）模擬真實使用者開口描述需求**的結構化詞條。

目的：使用者搜尋時說的是「我想達成什麼」（具體情境、具體物件），
而工具 metadata 寫的是「這是什麼」（技術分類、通用能力）。
你的任務就是把後者**編譯**成前者，讓搜尋時能用使用者的語言命中工具。

對每一支工具輸出：
- intents（3~5 句）：使用者描述**具體應用情境**時會說的話
  · 用口語，像在跟同事講需求（例：「齒輪的齒數改了，整組尺寸要自動跟著變」）
  · 每句都要有**具體的物件或情境**
  · 禁止任何工具都適用的空話（「幫我處理資料」「有沒有工具能做這個」）
  · 不要用工具自己的名稱或技術分類詞開頭，要寫使用者的困境或目標
- objects（3~6 個）：作用的具體對象（檔案格式、標的物、平台、資料型態）
- actions（2~4 個）：這支工具執行的具體動作（動詞）
- constraints（0~3 個）：使用前提（程式語言、執行環境、要不要 API key、安裝方式）
- negative（0~3 個）：明確不適用的情境

嚴格輸出 JSON，不要任何解釋：
{ "<工具 id>": { "intents": [], "objects": [], "actions": [], "constraints": [], "negative": [] } }

台灣用語：檔案（非文件）、程式碼（非代碼）、網路（非網絡）、影片（非視頻）、專案（非項目）、軟體（非軟件）。`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function compileBatch(batch, apiKey) {
  const body = {
    model: MODEL,
    messages: [
      { role: 'system', content: SYS },
      {
        role: 'user',
        content: JSON.stringify(batch.map((b) => ({
          id: b.id,
          name: b.name,
          description: (b.description_zh || b.description || '').slice(0, 300),
          useCase: (b.useCase_zh || b.useCase || '').slice(0, 300),
          capabilities: (b.capabilities || []).slice(0, 10),
          advantages: (b.advantages || []).slice(0, 5),
          negativeConstraints: (b.negativeConstraints_zh || b.negativeConstraints || []).slice(0, 3),
          triggers: (b.triggers || []).slice(0, 6),
        }))),
      },
    ],
    temperature: 0.4,
  };
  // 429 限流在本專案很嚴重（trigger 擴充時實測第一輪 25% 失敗），
  // 故退避拉長到 2/4/8/16/32 秒，重試 6 次。
  let lastErr = 'unknown';
  for (let attempt = 0; attempt < 6; attempt++) {
    if (attempt > 0) await sleep(2000 * 2 ** (attempt - 1));
    try {
      const res = await fetch('https://apihub.agnes-ai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) { lastErr = `http ${res.status}`; continue; }
      const j = await res.json();
      const raw = String(j?.choices?.[0]?.message?.content || '').trim();
      const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
      try {
        return { ok: JSON.parse(cleaned) };
      } catch {
        lastErr = `parse: ${cleaned.slice(0, 60)}`;
        continue;
      }
    } catch (e) {
      lastErr = `net: ${String(e?.message || e).slice(0, 60)}`;
    }
  }
  return { ok: null, reason: lastErr };
}

function normalizeEntry(raw, tool) {
  if (!raw || typeof raw !== 'object') return null;
  const str = (v) => {
    if (Array.isArray(v)) return v.map((x) => toTraditional(String(x ?? '').trim())).filter(Boolean);
    if (typeof v === 'string') { const s = toTraditional(v.trim()); return s ? [s] : []; }
    return [];
  };
  // 萬能詞過濾 + 去重 + 最多 5 句
  const intents = [...new Set(str(raw.intents))].filter((s) => !isGenericIntent(s)).slice(0, 5);
  return {
    intents,
    objects: [...new Set(str(raw.objects))].slice(0, 6),
    actions: [...new Set(str(raw.actions))].slice(0, 4),
    constraints: [...new Set(str(raw.constraints))].slice(0, 3),
    negative: [...new Set(str(raw.negative))].slice(0, 3),
    tier: 1,
    base: tool?.id,
  };
}

// ── 鑑別力守門 ─────────────────────────────────────────────────────────────
// 一句 intent 若「沒有任何一個詞具有鑑別力」，它就是空話。
// 判準：該句所有 token 的 df 都 > 6% × N → 剔除。
// （trigger 擴充時學到的教訓：加越多低鑑別力的詞，檢索越退步。）
const MAX_DF_RATIO = 0.06;

function discriminabilityGuard(entries, tools) {
  const ids = Object.keys(entries);
  const texts = ids.map((id) => (entries[id]?.intents || []).join(' '));
  const df = documentFrequency(texts);
  const N = ids.length || 1;
  const maxDf = Math.max(2, Math.floor(N * MAX_DF_RATIO));

  let dropped = 0;
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    const intents = entries[id]?.intents || [];
    if (intents.length <= 1) continue; // 至少留一句
    const kept = intents.filter((s) => {
      const toks = tokenize(s);
      if (toks.length === 0) return false;
      return toks.some((t) => (df.get(t) || 0) <= maxDf);
    });
    dropped += intents.length - kept.length;
    entries[id].intents = kept.length ? kept : intents.slice(0, 1);
  }
  return { dropped, maxDf, N };
}

// ── 主流程 ─────────────────────────────────────────────────────────────────
const reg = JSON.parse(readFileSync(REGISTRY, 'utf8'));
const tools = reg.tools.filter((t) => t.status === 'active' || t.status === 'experimental');

if (STATS) {
  if (!existsSync(OUT_PATH)) { console.log('尚無 compiled-entries.json，請先執行 --offline 或 LLM 編譯'); process.exit(0); }
  const wiki = JSON.parse(readFileSync(OUT_PATH, 'utf8'));
  const entries = wiki.entries || {};
  const withIntents = Object.values(entries).filter((e) => (e.intents || []).length > 0).length;
  const tier1 = Object.values(entries).filter((e) => e.tier === 1).length;
  const g = wikiGraphStats(buildWikiIndex(wiki));
  console.log(`版本          : ${wiki.version}（產生於 ${wiki.generatedAt}）`);
  console.log(`詞條數        : ${Object.keys(entries).length} / 工具數 ${tools.length}`);
  console.log(`有 intents    : ${withIntents}`);
  console.log(`Tier 1（LLM） : ${tier1}`);
  console.log(`知識圖譜      : ${g.nodes} 節點 / ${g.edges} 條邊`);
  process.exit(0);
}

let out = { version: VERSION, generatedAt: new Date().toISOString(), entries: {} };
if (!RESET && existsSync(OUT_PATH)) {
  try { out = JSON.parse(readFileSync(OUT_PATH, 'utf8')); } catch { /* 損壞就重來 */ }
}
out.version = VERSION;

// 決定要處理哪些工具
let targets = tools;
if (IDS_ARG) {
  const set = new Set(IDS_ARG.split(',').map((s) => s.trim()).filter(Boolean));
  targets = tools.filter((t) => set.has(t.id));
} else if (!OFFLINE) {
  // LLM 模式：只處理還沒有 Tier 1 詞條的工具（可續跑）
  targets = tools.filter((t) => out.entries[t.id]?.tier !== 1);
}
targets = targets.slice(0, LIMIT);

if (OFFLINE) {
  for (const t of targets) {
    out.entries[t.id] = { ...compileOffline(t), tier: 0 };
  }
  console.log(`Tier 0 規則式編譯：${targets.length} 筆`);
} else {
  const apiKey = process.env.AGNES_API_KEY;
  if (!apiKey) { console.error('需要 AGNES_API_KEY（或用 --offline 做規則式編譯）'); process.exit(1); }
  if (DRY) {
    console.log('[dry] 將處理：', targets.length, '筆');
    console.log('[dry] 前 3 筆：', targets.slice(0, 3).map((t) => t.id).join(', '));
    process.exit(0);
  }

  const batches = [];
  for (let i = 0; i < targets.length; i += BATCH) batches.push(targets.slice(i, i + BATCH));

  let done = 0, okN = 0, failN = 0;
  const failed = [];
  // 小型並行池：429 限流嚴重，併發數預設 2
  let cursor = 0;
  async function worker() {
    while (cursor < batches.length) {
      const idx = cursor++;
      const batch = batches[idx];
      const res = await compileBatch(batch, apiKey);
      if (!res?.ok) {
        failN += batch.length;
        for (const b of batch) failed.push({ id: b.id, why: res?.reason });
        process.stdout.write('!');
      } else {
        for (const b of batch) {
          const rawEntry = res.ok[b.id] || res.ok[b.id.toLowerCase()] || Object.values(res.ok)[0];
          const entry = normalizeEntry(rawEntry, b);
          if (!entry || entry.intents.length === 0) {
            failN++;
            failed.push({ id: b.id, why: 'empty intents after filtering' });
            continue;
          }
          // Tier 0 的 facets 若已存在且 LLM 沒給，就保留
          const prev = out.entries[b.id] || {};
          out.entries[b.id] = {
            intents: entry.intents,
            objects: entry.objects.length ? entry.objects : (prev.objects || []),
            actions: entry.actions.length ? entry.actions : (prev.actions || []),
            constraints: entry.constraints.length ? entry.constraints : (prev.constraints || []),
            negative: entry.negative.length ? entry.negative : (prev.negative || []),
            tier: 1,
          };
          okN++;
        }
      }
      done += batch.length;
      if (done % 30 === 0) {
        writeFileSync(OUT_PATH, JSON.stringify(out, null, 2));
        process.stdout.write(` ${done}/${targets.length} `);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, batches.length) }, worker));
  console.log(`\nTier 1 完成：成功 ${okN}／失敗 ${failN}（共 ${targets.length} 筆）`);
  if (failed.length) console.log('失敗前 10 筆：', failed.slice(0, 10).map((f) => `${f.id}(${f.why})`).join(', '));
}

// 鑑別力守門（兩層都跑）
const guard = discriminabilityGuard(out.entries, tools);
console.log(`鑑別力守門：剔除 ${guard.dropped} 句低鑑別力 intent（df 門檻 ${guard.maxDf}/${guard.N}）`);

out.generatedAt = new Date().toISOString();
out.generatedBy = OFFLINE ? 'compile-wiki --offline (Tier 0)' : `compile-wiki LLM (Tier 1, ${MODEL})`;

if (DRY) {
  const sample = Object.entries(out.entries).slice(0, 2);
  console.log('\n[dry] 範例詞條：');
  for (const [id, e] of sample) console.log(`  ${id}: ${JSON.stringify(e.intents.slice(0, 3))}`);
} else {
  writeFileSync(OUT_PATH, JSON.stringify(out, null, 2));
  console.log(`已寫入 ${OUT_PATH}`);
}
