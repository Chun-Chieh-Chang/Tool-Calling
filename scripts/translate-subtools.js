#!/usr/bin/env node
/**
 * translate-subtools.js — 為集合工具的 subTools 產生繁體中文描述
 *
 * 為什麼需要這支腳本（2026-11-01）
 * ─────────────────────────────────
 * 決策一「深層索引」把 awesome-copilot 的 636 個 subTools 索引進來了，但實測顯示
 * 使用者用中文查「向量資料庫的搜尋結果品質要怎麼評估跟調校」時，**一個都命中不了**。
 *
 * 根因是資料層缺中文，不是引擎調參（三條引擎側修法皆已被實測否決，見 HANDOFF）：
 *   · subTools 只有英文 name／description，中文查詢在子功能層必然得 0 分
 *   · 中文查詢在 search-engine 的 tokenize 會變成單一 token（該檔自己的 tokenize
 *     對中文是「依空白切分」，不切 bigram）
 *   · 即使加了中文描述，共現門檻要求「命中全部查詢詞」仍會擋掉（門檻需改比例式）
 *
 * 本腳本只負責第一件事：**產生中文描述**。引擎側的改動在 core/search-engine.js，
 * 兩者分開才能各自用 eval-queries.json 的 287 題獨立驗證。
 *
 * 用法
 * ────
 *   node scripts/translate-subtools.js --tool=awesome-copilot --dry
 *   node scripts/translate-subtools.js --tool=awesome-copilot --apply
 *   node scripts/translate-subtools.js --tool=awesome-copilot --apply --limit=50
 *
 * 快取：registry/subtool-zh-state.json（獨立於 zh-translation-state.json，
 * 不污染既有的翻譯機制，也不會被 translate-to-zh.js 的 flush() 蓋掉）
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { toTraditional, findSimplified } from './fix-simplified.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const REGISTRY = path.join(ROOT, 'registry', 'tools.json');
const STATE_PATH = path.join(ROOT, 'registry', 'subtool-zh-state.json');

const SYS = `你是繁體中文（台灣）技術文件翻譯者。
任務：把開源專案的子工具（skill／plugin／extension）英文說明譯成繁體中文。

規則：
1. 一律使用**台灣**慣用語（對照表見下）。
2. 專有名詞、工具名、品牌名、技術術語（Qdrant、Postgres、Playwright、AWS、RAG、CLI、API、GPU、OCR 等）**保留英文**，不要硬翻。
3. **只翻譯，不得新增原文沒有的資訊**，不得推測或加油添醋。原文沒提到的能力絕對不要補。
4. 譯文要簡潔通順，長度與原文相當。描述控制在 30～60 字。
5. 產出的中文必須是**使用者的需求語言**：用「使用者會怎麼說這件事」的角度，而不是逐字翻譯。

台灣用語對照（務必遵守）：
  程式（非「代碼」「編程」）　　檔案（非「文件」）　　　資料夾（非「文件夾」）
  網路（非「網絡」）　　　　　　專案（非「項目」）　　　資料（非「數據」）
  軟體（非「軟件」）　　　　　　影片（非「視頻」）　　　預設（非「默認」）
  支援（非「支持」）　　　　　　伺服器（非「服務器」）　效能（非「性能」）
  執行（非「運行」）　　　　　　資訊（非「信息」）　　　搜尋（非「搜索」）

輸入輸出格式：
輸入是 JSON 陣列，每項含 subpath、name、description。
輸出**只能**是 JSON 陣列，每項形如 { "subpath": "...", "name_zh": "...", "description_zh": "..." }，
順序與輸入一致。**每一項都必須同時給出 name_zh 與 description_zh，兩者皆不得留空。**
name_zh 是給人看的中文名稱（例如 "Qdrant 搜尋品質"），不是 slug。
不要輸出任何說明文字、markdown 標記或程式碼區塊。`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 取得 LLM 金鑰（優先用金鑰池，其次單一環境變數） */
async function getKey() {
  try {
    const { nextKey } = await import('../core/llm-keys.js');
    const k = nextKey();
    if (k) return k;
  } catch { /* 金鑰池不可用就退回環境變數 */ }
  return process.env.AGNES_API_KEY || null;
}

async function translateBatch(batch, model) {
  const body = {
    model,
    messages: [
      { role: 'system', content: SYS },
      { role: 'user', content: JSON.stringify(batch) },
    ],
    temperature: 0.2,
  };
  let lastErr = 'unknown';
  for (let attempt = 0; attempt < 6; attempt++) {
    if (attempt > 0) await sleep(2000 * 2 ** (attempt - 1));
    const key = await getKey();
    if (!key) return { ok: null, reason: '沒有可用的 API key' };
    try {
      const res = await fetch('https://apihub.agnes-ai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) { lastErr = `http ${res.status}`; continue; }
      const j = await res.json();
      const raw = String(j?.choices?.[0]?.message?.content || '').trim();
      const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
      try {
        const parsed = JSON.parse(cleaned);
        if (!Array.isArray(parsed)) { lastErr = `shape: ${cleaned.slice(0, 60)}`; continue; }
        return { ok: parsed };
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

/**
 * 台灣用語後處理（2026-11-01）
 *
 * 為什麼需要這一層：LLM 對台灣用語的遵循不是 100%，實測 636 筆裡有 14 筆
 * 混入大陸用語（用戶 4、運行 2、數據 2、隊列 1、變量 1，另有 4 筆「項目」
 * 經查證是指 item 而非 project，台灣用法正確 → 不動）。
 *
 * 放在腳本裡（而不是一次性的手改）才可重現：之後重跑翻譯時同樣的修正會自動套用。
 *
 * 註：「項目」不改——抽查 10 筆全部是 item（清理項目／工作項目／行動項目），
 * 不是大陸式的「專案」，台灣用語正確。誤改會把正確的翻譯改壞。
 */
const TAIWAN_TERM_FIXES = [
  [/數據驅動/g, '資料驅動', '數據驅動 → 資料驅動'],
  [/元數據/g, '中繼資料', '元數據 → 中繼資料'],
  [/隊列/g, '佇列', '隊列 → 佇列'],
  [/變量/g, '變數', '變量 → 變數'],
  [/運行/g, '執行', '運行 → 執行'],
  [/用戶(?!端)/g, '使用者', '用戶 → 使用者（保留「用戶端」）'],
];

/**
 * 把文本中的大陸用語換成台灣用語
 * @param {string} text
 * @returns {string}
 */
function applyTaiwanTerms(text) {
  let out = String(text || '');
  for (const [re, rep] of TAIWAN_TERM_FIXES) out = out.replace(re, rep);
  return out;
}

/**
 * 原文是否「沒有可翻譯的內容」
 *
 * 有些 subTool 的 description 只有圖片／影片連結（例如
 * `[![link](https://i.imgur.com/xxx.png)](https://youtu.be/xxx)`），
 * 裡面根本沒有自然語言 → 模型原樣回傳是**正確**行為，不該判失敗。
 * 判準：去掉 markdown 連結與裸 URL 後，剩下的文字少於 5 個字元即視為無內容。
 */
function hasNoTranslatableProse(original) {
  const stripped = String(original || '')
    .replace(/!?\[[^\]]*\]\([^)]*\)/g, '')   // markdown 圖片／連結
    .replace(/https?:\/\/\S+/g, '')           // 裸 URL
    .replace(/[#*_>`~\-\s]/g, '')             // markdown 裝飾符號
    .trim();
  return stripped.length < 5;
}

/**
 * 驗證單筆譯文：非空、含中文、無殘留簡體
 *
 * 兩道防線的分工（2026-11-01 實測修正）：
 *   · 先轉繁體**再**檢查殘留簡體 —— 順序相反時，模型偶爾吐一個簡體字
 *     （實測「遥」）就直接被判失敗，但 toTraditional 本來就能修好。 // allow-simplified：註解中刻意引用的簡體字範例，說明「先轉後檢」的順序
 *   · name_zh 留空**不算失敗** —— 實測 31 筆失敗裡有 29 筆是模型漏給 name_zh，
 *     而 description_zh 才是檢索真正依賴的欄位。名稱退回英文原名即可；
 *     英文名對 subTool 反而是有效檢索字（與 name 欄位重疊）。
 *
 * @param {object} item - LLM 回傳的單筆
 * @param {string} originalName - 原 subTool 名稱（name_zh 留空時的退路）
 * @param {string} originalDesc - 原 subTool 描述（判定是否無可譯內容）
 * @returns {{problems: string[], name_zh: string, description_zh: string}}
 */
function validate(item, originalName, originalDesc) {
  const problems = [];
  if (!item || typeof item !== 'object') return { problems: ['不是物件'], name_zh: '', description_zh: '' };
  if (!item.subpath) problems.push('缺 subpath');

  const descZh = applyTaiwanTerms(toTraditional(String(item.description_zh || '').trim()));
  const noProse = hasNoTranslatableProse(originalDesc);
  if (!descZh) {
    if (!noProse) problems.push('description_zh 為空');
  } else if (!/[\u4e00-\u9fff]/.test(descZh)) {
    // 原文本來就沒有自然語言（純連結）→ 模型原樣回傳是正確的，不判失敗
    if (!noProse) problems.push('description_zh 不含中文');
  } else {
    const simp = findSimplified(descZh);
    if (simp.length) problems.push(`含殘留簡體字 ${[...new Set(simp)].join('')}`);
  }

  let nameZh = applyTaiwanTerms(toTraditional(String(item.name_zh || '').trim()));
  if (!nameZh) nameZh = String(originalName || '').trim();   // 留空 → 退回英文原名
  if (!nameZh) problems.push('name_zh 與原名皆為空');

  return { problems, name_zh: nameZh, description_zh: descZh };
}

// ── 主流程 ────────────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  const argOf = (name, dflt) => args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? dflt;
  const TOOL_ID = argOf('tool', 'awesome-copilot');
  const LIMIT = Number(argOf('limit', 0)) || Infinity;
  const BATCH = Number(argOf('batch', 10));
  const CONCURRENCY = Number(process.env.TRANSLATE_CONCURRENCY || 3);
  const MODEL = argOf('model', 'agnes-2.5-flash');
  const APPLY = args.includes('--apply');

  const reg = JSON.parse(readFileSync(REGISTRY, 'utf8'));
  const tool = reg.tools.find((t) => t.id === TOOL_ID);
  if (!tool) { console.error(`找不到工具 ${TOOL_ID}`); process.exit(1); }
  const subTools = tool.subTools || [];
  if (!subTools.length) { console.error(`${TOOL_ID} 沒有 subTools`); process.exit(1); }

  let state = { tool: TOOL_ID, entries: {}, failed: {} };
  if (existsSync(STATE_PATH)) {
    try { state = JSON.parse(readFileSync(STATE_PATH, 'utf8')); } catch { /* 損壞就重來 */ }
  }
  state.entries ??= {};
  state.failed ??= {};

  const pending = subTools
    .filter((s) => !state.entries[s.subpath]?.description_zh)
    .slice(0, LIMIT);

  console.log(`工具：${TOOL_ID}　subTools 總數 ${subTools.length}　待翻譯 ${pending.length}　已翻 ${subTools.length - pending.length}`);

  // 沒有待翻譯項目時**不能直接結束** —— --apply 仍需把快取套用到 tools.json
  // （2026-11-01 實測踩到的 bug：快取已滿時提前 process.exit(0)，
  //  導致 --apply 靜默不動作，tools.json 裡仍是 0 筆中文描述）。
  if (pending.length) {
    const batches = [];
    for (let i = 0; i < pending.length; i += BATCH) batches.push(pending.slice(i, i + BATCH));

    let okN = 0, failN = 0, badN = 0;
    let cursor = 0;

    async function worker() {
      while (cursor < batches.length) {
        const batch = batches[cursor++];
        const payload = batch.map((s) => ({ subpath: s.subpath, name: s.name, description: String(s.description || '').slice(0, 400) }));
        const res = await translateBatch(payload, MODEL);
        if (!res?.ok) {
          for (const b of batch) state.failed[b.subpath] = { at: new Date().toISOString(), why: res?.reason };
          failN += batch.length;
          process.stdout.write('!');
        } else {
          const byPath = new Map(res.ok.map((x) => [String(x?.subpath || '').trim(), x]));
          for (const b of batch) {
            const item = byPath.get(String(b.subpath).trim());
            const { problems, name_zh, description_zh } = validate(item, b.name, b.description);
            if (problems.length) {
              state.failed[b.subpath] = { at: new Date().toISOString(), why: problems.join('；') };
              badN++;
              process.stdout.write('x');
              continue;
            }
            state.entries[b.subpath] = {
              name_zh,
              description_zh,
              at: new Date().toISOString(),
            };
            okN++;
            process.stdout.write('.');
          }
        }
        if ((okN + failN + badN) % 50 < BATCH) {
          writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), 'utf8');
        }
      }
    }

    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, batches.length) }, worker));
    writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), 'utf8');

    // 清掉「已成功但仍留著舊失敗紀錄」的項目（重跑時會補回來，不該一直掛著失敗）
    let cleaned = 0;
    for (const k of Object.keys(state.failed)) {
      if (state.entries[k]) { delete state.failed[k]; cleaned++; }
    }
    if (cleaned) {
      writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), 'utf8');
      console.log(`清除 ${cleaned} 筆過期的失敗紀錄（已重跑成功）`);
    }

    console.log(`\n完成：成功 ${okN}　批次失敗 ${failN}　內容不合格 ${badN}`);
  } else {
    console.log('沒有待翻譯項目（沿用既有快取）。');
  }
  const stillFailed = Object.keys(state.failed);
  if (stillFailed.length) {
    console.log(`仍未完成 ${stillFailed.length} 筆，前 5 筆：${stillFailed.slice(0, 5).map((k) => `${k}(${state.failed[k].why})`).join(', ')}`);
  }

  if (!APPLY) {
    console.log('\n（未指定 --apply，只寫入快取 registry/subtool-zh-state.json）');
    return;
  }

  // ── 套用到 tools.json ──────────────────────────────────────────────────
  const fresh = JSON.parse(readFileSync(REGISTRY, 'utf8'));
  const ft = fresh.tools.find((t) => t.id === TOOL_ID);
  let applied = 0;
  for (const st of ft.subTools || []) {
    const e = state.entries[st.subpath];
    if (!e?.description_zh) continue;
    // 同一套台灣用語後處理：快取裡的譯文可能在修正規則加入前就產生了，
    // 套用時再過一次 → 舊快取也能被修正到（實測：636 筆有 14 筆需要修正）。
    st.name_zh = applyTaiwanTerms(e.name_zh);
    st.description_zh = applyTaiwanTerms(e.description_zh);
    applied++;
  }
  fresh.lastUpdated = new Date().toISOString();
  writeFileSync(REGISTRY, JSON.stringify(fresh, null, 2), 'utf8');
  console.log(`\n已套用 ${applied} 筆中文描述到 registry/tools.json 的 ${TOOL_ID}`);
}

// 只有直接執行本檔時才跑主流程；被 import 時只提供函式（供單元測試使用）。
const isDirect = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirect) await main();

export {
  applyTaiwanTerms,
  hasNoTranslatableProse,
  validate,
  TAIWAN_TERM_FIXES,
};
