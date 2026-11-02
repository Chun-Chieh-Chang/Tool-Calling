#!/usr/bin/env node
/**
 * translate-subtools.js — 為集合工具的 subTools 產生繁體中文描述
 *
 * 為什麼需要這支腳本（2026-11-01 建立，2026-11-02 改為多工具版）
 * ─────────────────────────────────────────────────────────────────────
 * 決策一「深層索引」把集合工具的 subTools 索引進來了，但實測顯示
 * 使用者用中文查「向量資料庫的搜尋結果品質要怎麼評估跟調校」時，**一個都命中不了**。
 *
 * 根因是資料層缺中文，不是引擎調參（三條引擎側修法皆已被實測否決，見 HANDOFF）：
 *   · subTools 只有英文 name／description，中文查詢在子功能層必然得 0 分
 *   · 中文查詢在 search-engine 的 tokenize 會變成單一 token（該檔自己的 tokenize
 *     對中文是「依空白切分」，不切 bigram）
 *   · 即使加了中文描述，共現門檻要求「命中全部查詢詞」仍會擋掉（門檻需改比例式）
 *
 * 本腳本只負責第一件事：**產生中文描述**。引擎側的改動在 core/search-engine.js，
 * 兩者分開才能各自用 eval-queries.json 的題目獨立驗證。
 *
 * 2026-11-02 擴充為多工具版的原因
 * ──────────────────────────────
 * 試點只翻了 awesome-copilot 的 636 筆，驗證有效後要擴大到其餘 48 個集合
 * 共 3,235 筆。單工具版的兩個限制擋住了：
 *   1. `--tool=<id>` 一次只能翻一個工具 → 48 次手動啟動
 *   2. 快取結構是單一物件 `{ tool, entries, failed }` → 多工具會互相覆蓋
 *
 * 改動摘要：
 *   · 快取升級為 v2：`{ version, tools: { <toolId>: { entries, failed } } }`
 *     並保留 v1 自動遷移（讀到舊結構就搬到 tools 底下，不丟既有 636 筆）
 *   · `--tool=all` 一次處理所有有 subTools 的集合，依 subTool 數由多到少排
 *     （大的先做 → 尺子量測到的那 10 個集合優先完成）
 *   · 批次輸出截斷會「自動切半重試」（2026-11-01 實測 batch=10 有截斷，
 *     手動改 batch=4 才解掉；改成自適應後不需要人為盯著調參）
 *   · 主批次結束後自動跑「補救批次」（失敗項目以 batch=1 重試一次）
 *
 * 用法
 * ────
 *   node scripts/translate-subtools.js --tool=all --batch=8             # 全量翻譯
 *   node scripts/translate-subtools.js --tool=all --apply               # 套用到 tools.json
 *   node scripts/translate-subtools.js --tool=awesome-copilot --dry     # 單工具（舊用法仍可用）
 *   node scripts/translate-subtools.js --status                         # 只看進度
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
const STATE_VERSION = 2;

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

/**
 * 送出一次請求並解析回應
 * @returns {{ok: true, items: any[]}|{ok: false, reason: string, kind: string}}
 */
async function requestOnce(payload, model) {
  const body = {
    model,
    messages: [
      { role: 'system', content: SYS },
      { role: 'user', content: JSON.stringify(payload) },
    ],
    temperature: 0.2,
  };
  let key;
  try { key = await getKey(); } catch { key = null; }
  if (!key) return { ok: false, reason: '沒有可用的 API key', kind: 'nokey' };
  try {
    const res = await fetch('https://apihub.agnes-ai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      try {
        const { reportFailure } = await import('../core/llm-keys.js');
        reportFailure(key, res.status);
      } catch { /* 統計失敗不影響主流程 */ }
      return { ok: false, reason: `http ${res.status}`, kind: 'http' };
    }
    const j = await res.json();
    try {
      const { reportSuccess } = await import('../core/llm-keys.js');
      reportSuccess(key);
    } catch { /* 統計失敗不影響主流程 */ }
    const raw = String(j?.choices?.[0]?.message?.content || '').trim();
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
    try {
      const parsed = JSON.parse(cleaned);
      if (!Array.isArray(parsed)) return { ok: false, reason: `shape: ${cleaned.slice(0, 60)}`, kind: 'shape' };
      return { ok: true, items: parsed };
    } catch {
      return { ok: false, reason: `parse: ${cleaned.slice(0, 60)}`, kind: 'parse' };
    }
  } catch (e) {
    return { ok: false, reason: `net: ${String(e?.message || e).slice(0, 60)}`, kind: 'net' };
  }
}

/**
 * 翻譯一批（失敗時自動切半重試）
 *
 * 為什麼要自動切半（2026-11-02）：
 * 2026-11-01 實測 batch=10 時有批次輸出被截斷 → JSON 解析失敗 → 該批全數失敗，
 * 最後是靠手動改跑 `--batch=4` 才補回來。手動調參在 3,235 筆的規模上不現實，
 * 所以改成：解析失敗（輸出截斷的典型症狀）重試一次仍失敗 → 批次對半重試，
 * 最多切到 1 筆為止。HTTP／網路錯誤則照原樣用退避重試（那是暫時性問題，
 * 切半沒有用）。
 *
 * @param {Array} batch - [{subpath, name, description}]
 * @param {string} model
 * @param {number} depth - 目前遞迴深度（防止無限切分）
 * @returns {{ok: true, items: any[]}|{ok: false, reason: string, kind: string}}
 */
async function translateBatch(batch, model, depth = 0) {
  const payload = batch.map((s) => ({
    subpath: s.subpath,
    name: s.name,
    description: String(s.description || '').slice(0, 400),
  }));

  let last = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    if (attempt > 0) await sleep(1500 * 2 ** (attempt - 1));
    const r = await requestOnce(payload, model);
    if (r.ok) return r;
    last = r;
    // 解析／形狀失敗＝輸出多半是被截斷，用同一個 payload 再試一次沒有意義
    if ((r.kind === 'parse' || r.kind === 'shape') && attempt >= 1) break;
  }

  if (batch.length > 1 && depth < 6) {
    const mid = Math.ceil(batch.length / 2);
    const a = await translateBatch(batch.slice(0, mid), model, depth + 1);
    if (!a.ok) return a;
    const b = await translateBatch(batch.slice(mid), model, depth + 1);
    if (!b.ok) return b;
    return { ok: true, items: [...a.items, ...b.items] };
  }
  return last || { ok: false, reason: 'unknown', kind: 'unknown' };
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
  // ── 2026-11-02：擴大翻譯 3,237 筆後實測抓到的 40 筆違規 ────────────────
  // 做法：用一份大陸用語清單掃全部譯文，逐筆人工看過情境才加規則。
  [
    /(?<!大)數據(?!長)/g, '資料',
    '數據 → 資料（但保留「大數據」（台灣通用）與「數據長」（CDO 職稱，兩岸通用））',
  ],
  [/編程/g, '程式設計', '編程 → 程式設計'],
  [/代碼/g, '程式碼', '代碼 → 程式碼'],
  [/支持/g, '支援', '支持 → 支援'],
  [/默認/g, '預設', '默認 → 預設'],
  [/網絡/g, '網路', '網絡 → 網路'],
  [/視頻/g, '影片', '視頻 → 影片'],
  [/信息/g, '資訊', '信息 → 資訊'],
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
 *
 * 🔴 2026-11-02 補上「純檔案路徑」這一類：
 * 實測 claude-skills 有 199 筆的 description 就是
 * `../../../engineering/skills/agent-protocol/SKILL.md` 這種路徑。
 * 舊判準會把它算成「有正文」（去掉空白後長度遠大於 5），
 * 模型照抄路徑 → 被判成「description_zh 不含中文」的失敗 → 199 筆白跑，
 * 還會在補救批次裡被再試一次。這是**誤判**，不是翻譯失敗。
 */
function hasNoTranslatableProse(original) {
  const raw = String(original || '');
  // 整段就是一個檔案路徑 → 沒有自然語言可譯
  const trimmed = raw.trim();
  if (/^\S*[\\/]\S*\.[A-Za-z0-9]{1,6}$/.test(trimmed)) return true;
  const stripped = raw
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
 * 🔴 檢查順序（2026-11-02 實測踩到的坑）：
 * 原文本來就沒有可譯內容時，**模型回傳的東西不一定是譯文**——
 * 對著 `../../../skills/foo/SKILL.md` 這種路徑，模型會去「讀檔」，
 * 然後回傳 `{"error": "找不到說明檔案內容"}` 或 `{"openapi": "3.1.0"}`。
 * 舊順序先檢查 `item.subpath` → 判「缺 subpath」→ 誤判失敗（193 筆白跑）。
 * 所以**先判斷原文本來有沒有正文**：沒有正文就保留原文、不採信模型輸出，
 * 模型的回傳是什麼都不影響結果。
 *
 * @param {object} item - LLM 回傳的單筆
 * @param {string} originalName - 原 subTool 名稱（name_zh 留空時的退路）
 * @param {string} originalDesc - 原 subTool 描述（判定是否無可譯內容）
 * @returns {{problems: string[], name_zh: string, description_zh: string, noProse: boolean}}
 */
function validate(item, originalName, originalDesc) {
  const problems = [];
  const noProse = hasNoTranslatableProse(originalDesc);

  // 名稱：模型有給就用，沒有就退回英文原名（英文名對 subTool 反而是有效檢索字）
  let nameZh = '';
  if (item && typeof item === 'object') {
    nameZh = applyTaiwanTerms(toTraditional(String(item.name_zh || '').trim()));
  }
  if (!nameZh) nameZh = String(originalName || '').trim();
  if (!nameZh) problems.push('name_zh 與原名皆為空');

  // 原文本來就沒有可譯的內容（純連結／純路徑／佔位符）→ 保留原文。
  // 模型對這類原文的回傳不可信（可能是錯誤物件），一律不採信。
  if (noProse) {
    return { problems, name_zh: nameZh, description_zh: String(originalDesc || '').trim(), noProse: true };
  }

  if (!item || typeof item !== 'object') {
    return { problems: [...problems, '不是物件'], name_zh: nameZh, description_zh: '', noProse: false };
  }
  if (!item.subpath) problems.push('缺 subpath');

  const descZh = applyTaiwanTerms(toTraditional(String(item.description_zh || '').trim()));
  if (!descZh) {
    problems.push('description_zh 為空');
  } else if (!/[\u4e00-\u9fff]/.test(descZh)) {
    problems.push('description_zh 不含中文');
  } else {
    const simp = findSimplified(descZh);
    if (simp.length) problems.push(`含殘留簡體字 ${[...new Set(simp)].join('')}`);
  }

  return { problems, name_zh: nameZh, description_zh: descZh, noProse: false };
}

// ── 快取（v2：分工具存放；相容 v1 單工具結構）───────────────────────────────

/**
 * 把快取結構正規化為 v2（純函式，方便單元測試）
 *
 * v1 結構：`{ tool: 'awesome-copilot', entries: {...}, failed: {...} }`
 * v2 結構：`{ version: 2, tools: { <toolId>: { entries, failed } } }`
 *
 * 相容是必要的：2026-11-01 已完成的 636 筆在版控裡，不能因為改版就重翻。
 *
 * @param {any} raw - 讀到的原始 JSON
 * @returns {{version:number, tools:Record<string,{entries:object,failed:object}>}}
 */
function migrateState(raw) {
  if (!raw || typeof raw !== 'object') return { version: STATE_VERSION, tools: {} };
  if (!raw.tools && (raw.entries || raw.tool)) {
    const tools = {};
    if (raw.tool) tools[raw.tool] = { entries: raw.entries || {}, failed: raw.failed || {} };
    return { version: STATE_VERSION, tools };
  }
  raw.version ??= STATE_VERSION;
  raw.tools ??= {};
  return raw;
}

/**
 * 讀取快取，並把 v1 的單工具結構自動遷移成 v2
 * @returns {{version:number, tools:Record<string,{entries:object,failed:object}>}}
 */
function loadState() {
  if (!existsSync(STATE_PATH)) return { version: STATE_VERSION, tools: {} };
  let raw;
  try { raw = JSON.parse(readFileSync(STATE_PATH, 'utf8')); } catch { return { version: STATE_VERSION, tools: {} }; }
  return migrateState(raw);
}

/** 取得（並建立）某個工具的快取區塊 */
function toolState(state, id) {
  state.tools[id] ??= { entries: {}, failed: {} };
  state.tools[id].entries ??= {};
  state.tools[id].failed ??= {};
  return state.tools[id];
}

// ── 主流程 ────────────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  const argOf = (name, dflt) => args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? dflt;
  const TOOL_ARG = argOf('tool', 'awesome-copilot');
  const IS_ALL = TOOL_ARG === 'all';
  const LIMIT = Number(argOf('limit', 0)) || Infinity;
  const BATCH = Number(argOf('batch', 8));
  const CONCURRENCY = Number(argOf('concurrency', process.env.TRANSLATE_CONCURRENCY || 3));
  const MODEL = argOf('model', 'agnes-2.5-flash');
  const APPLY = args.includes('--apply');
  const STATUS_ONLY = args.includes('--status');

  const reg = JSON.parse(readFileSync(REGISTRY, 'utf8'));
  const collections = reg.tools.filter((t) => (t.subTools || []).length > 0);

  let targets = IS_ALL
    ? [...collections].sort((a, b) => (b.subTools || []).length - (a.subTools || []).length)
    : collections.filter((t) => t.id === TOOL_ARG);
  if (!targets.length) { console.error(`找不到工具 ${TOOL_ARG}`); process.exit(1); }

  const state = loadState();

  // ── 進度模式：只印統計，不翻譯 ────────────────────────────────────────
  if (STATUS_ONLY) {
    let tTotal = 0, tDone = 0, tNoProse = 0;
    for (const t of targets) {
      const ts = toolState(state, t.id);
      const total = t.subTools.length;
      const done = t.subTools.filter((s) => ts.entries[s.subpath]?.description_zh).length;
      const noProse = t.subTools.filter((s) => ts.entries[s.subpath]?.noProse).length;
      const failed = Object.keys(ts.failed).length;
      tTotal += total; tDone += done; tNoProse += noProse;
      console.log(`${t.id.padEnd(34)} ${String(done).padStart(5)}/${String(total).padEnd(5)}`
        + `${noProse ? `（無正文 ${noProse}）` : ''}${failed ? ` 失敗 ${failed}` : ''}`);
    }
    console.log(`\n合計 已翻 ${tDone}/${tTotal}（${((tDone / tTotal) * 100).toFixed(1)}%）　其中原文本來就沒有可譯內容 ${tNoProse} 筆`);
    return;
  }

  // ── 收集待翻譯項目 ────────────────────────────────────────────────────
  const pendingByTool = new Map();
  for (const t of targets) {
    const ts = toolState(state, t.id);
    // 已有譯文、或原文本來就沒有可譯內容（noProse）→ 不需要再翻
    const pending = t.subTools.filter((s) => {
      const e = ts.entries[s.subpath];
      return !(e?.description_zh || e?.noProse);
    }).slice(0, LIMIT);
    pendingByTool.set(t.id, pending);
  }
  const pendingTotal = [...pendingByTool.values()].reduce((n, a) => n + a.length, 0);
  const scopeTotal = targets.reduce((n, t) => n + t.subTools.length, 0);
  console.log(`工具：${IS_ALL ? `全部集合（${targets.length} 個）` : TOOL_ARG}　`
    + `subTools 總數 ${scopeTotal}　待翻譯 ${pendingTotal}　`
    + `批次 ${BATCH}　並行 ${CONCURRENCY}　模型 ${MODEL}`);

  // ── 翻譯 ──────────────────────────────────────────────────────────────
  if (pendingTotal) {
    // 全域批次佇列：把所有工具的待翻譯項目混在同一條隊列裡，由多個 worker 平行取用。
    // 順序刻意是「工具依 subTool 數由多到少、工具內依 registry 順序」——
    // 尺子量測到的那 10 個大集合會最先完成。
    const batches = [];
    for (const t of targets) {
      const pending = pendingByTool.get(t.id) || [];
      for (let i = 0; i < pending.length; i += BATCH) {
        batches.push({ toolId: t.id, items: pending.slice(i, i + BATCH) });
      }
    }

    let okN = 0, failN = 0, badN = 0;
    let cursor = 0;
    let lastWrite = 0;
    const startedAt = Date.now();

    const saveState = (force = false) => {
      const now = Date.now();
      if (!force && now - lastWrite < 4000) return;
      lastWrite = now;
      writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), 'utf8');
    };

    /**
     * 處理一個批次的回應，寫入快取。
     *
     * 主批次與補救批次**共用同一份實作** —— 2026-11-02 實測踩到的坑：
     * 兩邊原本各有一份看起來一樣的程式碼，改動只改到其中一份，
     * 補救批次就因為未定義變數而整段崩潰（main pass 全白跑）。
     * 重複的邏輯就是分歧的來源 → 合併成一個函式，各自只負責累加統計。
     *
     * @returns {{ok:number, fail:number, bad:number}}
     */
    const handleBatch = (batch, res) => {
      const ts = toolState(state, batch.toolId);
      const stat = { ok: 0, fail: 0, bad: 0 };
      if (!res?.ok) {
        for (const b of batch.items) ts.failed[b.subpath] = { at: new Date().toISOString(), why: res?.reason };
        stat.fail = batch.items.length;
        process.stdout.write('!');
        return stat;
      }
      const byPath = new Map(res.items.map((x) => [String(x?.subpath || '').trim(), x]));
      for (const b of batch.items) {
        const item = byPath.get(String(b.subpath).trim());
        const { problems, name_zh, description_zh, noProse } = validate(item, b.name, b.description);
        if (problems.length) {
          ts.failed[b.subpath] = { at: new Date().toISOString(), why: problems.join('；') };
          stat.bad++;
          process.stdout.write('x');
          continue;
        }
        ts.entries[b.subpath] = { name_zh, description_zh, at: new Date().toISOString(), ...(noProse ? { noProse: true } : {}) };
        delete ts.failed[b.subpath];
        stat.ok++;
        process.stdout.write('.');
      }
      return stat;
    };

    async function worker() {
      while (cursor < batches.length) {
        const batch = batches[cursor++];
        const res = await translateBatch(batch.items, MODEL);
        const s = handleBatch(batch, res);
        okN += s.ok; failN += s.fail; badN += s.bad;
        saveState();
      }
    }

    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, batches.length) }, worker));
    saveState(true);

    // ── 補救批次：主批次失敗的項目以 batch=1 再試一次 ───────────────────
    // 2026-11-01 實測：636 筆裡曾有 31 筆因模型漏欄位而失敗，改用單筆重試全部補回。
    //
    // 🔴 只挑「真的還沒有譯文」的項目（2026-11-02 實測踩到的坑）：
    // `failed` 裡會殘留「早已翻好、只是失敗紀錄沒清掉」的項目 ——
    // 實測 220 筆失敗紀錄中有 193 筆其實已經有譯文了。
    // 把它们一起重翻 → 每筆都白打一次 API、而且對純路徑原文模型會回錯誤物件， // allow-simplified：逐字引用要防治的簡體字，該字即本行的說明對象
    // 補救批次等於在原地打轉（實測 5 分鐘只修好 56 筆）。
    // 那些陳舊紀錄交給最後的「清除過期失敗紀錄」處理就好。
    const repair = [];
    for (const t of targets) {
      const ts = toolState(state, t.id);
      for (const [subpath] of Object.entries(ts.failed)) {
        if (ts.entries[subpath]) continue;   // 已經有譯文 → 只是紀錄沒清
        const sub = t.subTools.find((s) => s.subpath === subpath);
        if (sub) repair.push({ toolId: t.id, items: [sub] });
      }
    }
    if (repair.length) {
      console.log(`\n補救批次：${repair.length} 筆（單筆重試）…`);
      let rOk = 0, rFail = 0;
      let rCursor = 0;
      async function repairWorker() {
        while (rCursor < repair.length) {
          const batch = repair[rCursor++];
          const res = await translateBatch(batch.items, MODEL);
          const s = handleBatch(batch, res);
          rOk += s.ok; rFail += s.fail + s.bad;
          saveState();
        }
      }
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, repair.length) }, repairWorker));
      saveState(true);
      console.log(`\n補救批次完成：成功 ${rOk}　仍失敗 ${rFail}`);
    }

    // 清掉「已成功但仍留著舊失敗紀錄」的項目（重跑時會補回來，不該一直掛著失敗）
    let cleaned = 0;
    for (const t of targets) {
      const ts = toolState(state, t.id);
      for (const k of Object.keys(ts.failed)) {
        if (ts.entries[k]) { delete ts.failed[k]; cleaned++; }
      }
    }
    if (cleaned) {
      saveState(true);
      console.log(`清除 ${cleaned} 筆過期的失敗紀錄（已重跑成功）`);
    }

    const mins = ((Date.now() - startedAt) / 60000).toFixed(1);
    console.log(`\n完成：成功 ${okN}　批次失敗 ${failN}　內容不合格 ${badN}　耗時 ${mins} 分`);
  } else {
    console.log('沒有待翻譯項目（沿用既有快取）。');
  }

  for (const t of targets) {
    const ts = toolState(state, t.id);
    const stillFailed = Object.keys(ts.failed);
    if (stillFailed.length) {
      console.log(`${t.id}：仍有 ${stillFailed.length} 筆未完成，前 3 筆：`
        + stillFailed.slice(0, 3).map((k) => `${k}(${ts.failed[k].why})`).join(', '));
    }
  }

  if (!APPLY) {
    console.log('\n（未指定 --apply，只寫入快取 registry/subtool-zh-state.json）');
    return;
  }

  // ── 套用到 tools.json ──────────────────────────────────────────────────
  // --tool=all → 套用快取裡的**所有**工具；--tool=<id> → 只套用該工具。
  const applyIds = IS_ALL
    ? Object.keys(state.tools).filter((id) => collections.some((t) => t.id === id))
    : [TOOL_ARG];

  const fresh = JSON.parse(readFileSync(REGISTRY, 'utf8'));
  let applied = 0;
  const appliedPerTool = [];
  for (const id of applyIds) {
    const ft = fresh.tools.find((t) => t.id === id);
    if (!ft) continue;
    const ts = state.tools[id];
    let n = 0;
    for (const st of ft.subTools || []) {
      const e = ts?.entries?.[st.subpath];
      if (!e?.description_zh) continue;
      // 原文本來就沒有可譯內容的項目（只有圖片／連結／佔位符）→ 不寫 description_zh
      // （寫了只是灌水）。但**名稱仍可譯**，照樣寫入並正規化 ——
      // 名稱是有效的檢索字，略過它等於白翻一次。
      if (e.noProse) {
        const nzh = applyTaiwanTerms(toTraditional(e.name_zh || ''));
        if (nzh) st.name_zh = nzh;
        if (ts.entries[st.subpath]) {
          ts.entries[st.subpath].name_zh = nzh;
          ts.entries[st.subpath].description_zh = applyTaiwanTerms(toTraditional(e.description_zh));
        }
        n++;
        continue;
      }
      // 同一套後處理：台灣用語 + 轉繁體。
      // 轉繁體不能省 —— 快取裡的譯文是在**當時**的 S2T_SAFE 表下轉換的，
      // 之後新增的漏字（例如 2026-11-02 挖出的 栈／缝／诗）不會自動補回。 // allow-simplified：逐字引用要防治的簡體字，該字即本行的說明對象
      // 套用時再過一次 → 新規則與新表都能套用到既有譯文（不用重跑翻譯）。
      st.name_zh = applyTaiwanTerms(toTraditional(e.name_zh));
      st.description_zh = applyTaiwanTerms(toTraditional(e.description_zh));
      // 同步回寫快取：快取要保存**最終值**。否則 tools.json 修好了、
      // 快取裡還留著修正前的舊值 → 繁簡守門會在 registry/subtool-zh-state.json
      // 抓到簡體字（2026-11-02 實測：19 行違規裡有 11 行來自快取）。
      if (ts?.entries?.[st.subpath]) {
        ts.entries[st.subpath].name_zh = st.name_zh;
        ts.entries[st.subpath].description_zh = st.description_zh;
      }
      n++; applied++;
    }
    if (n) appliedPerTool.push(`  ${id}：${n}/${ft.subTools.length}`);
  }
  fresh.lastUpdated = new Date().toISOString();
  writeFileSync(REGISTRY, JSON.stringify(fresh, null, 2), 'utf8');
  // 快取也要落盤：上面把修正後的值回寫進 state.entries 了，
  // 不寫回磁碟的話這次回寫等於沒發生 → 下次讀到的還是舊值。
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), 'utf8');
  console.log(`\n已套用 ${applied} 筆中文描述到 registry/tools.json`);
  if (appliedPerTool.length) console.log(appliedPerTool.join('\n'));
}

// 只有直接執行本檔時才跑主流程；被 import 時只提供函式（供單元測試使用）。
const isDirect = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirect) await main();

export {
  applyTaiwanTerms,
  hasNoTranslatableProse,
  validate,
  TAIWAN_TERM_FIXES,
  loadState,
  migrateState,
  toolState,
  STATE_VERSION,
};
