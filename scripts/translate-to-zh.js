#!/usr/bin/env node
/**
 * translate-to-zh.js — 把工具 metadata 翻成繁體中文（台灣）
 *
 * 為什麼用「並存欄位」而不是覆寫：
 *   description／useCase／advantages 同時是**檢索索引**與 **rerank 提示**的內容。
 *   直接覆寫等於讓既有準確度量測全部作廢。故新增 `*_zh` 欄位供顯示層使用，
 *   原文完整保留。日後若要讓檢索也吃中文，必須重新量測後再決定。
 *
 * 設計要點：
 *   1. 批次翻譯（每批 5 個工具一次呼叫），降低呼叫數與限流風險
 *   2. 進度寫入 registry/zh-translation-state.json，中斷可續跑
 *   3. 每 N 批做一次「重讀 → 合併 → 寫入」，避免覆蓋背景行程（趨勢掃描）的更新
 *   4. 譯文一律跑 toTraditional()，確保是繁體而非簡體
 *   5. 指數退避處理 429
 *
 * 用法：
 *   AGNES_API_KEY=sk-... node scripts/translate-to-zh.js
 *   AGNES_API_KEY=sk-... node scripts/translate-to-zh.js --limit=20 --dry
 *   node scripts/translate-to-zh.js --reset        # 清除進度重新開始
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { toTraditional } from './fix-simplified.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const REGISTRY = path.join(ROOT, 'registry', 'tools.json');
const STATE_PATH = path.join(ROOT, 'registry', 'zh-translation-state.json');

const args = process.argv.slice(2);
const LIMIT = Number(args.find((a) => a.startsWith('--limit='))?.split('=')[1]) || Infinity;
const DRY = args.includes('--dry');
const RESET = args.includes('--reset');
/** --redo-skipped：清掉「之前判定不需翻譯」的記錄，讓規則放寬後可重跑那批 */
const REDO_SKIPPED = args.includes('--redo-skipped');
const BATCH = Number(args.find((a) => a.startsWith('--batch='))?.split('=')[1]) || 5;
const SAVE_EVERY = 20;

const hasZH = (s) => /[一-鿿]/.test(String(s || ''));

const SYS = `你是繁體中文（台灣）技術文件翻譯者。
任務：把開源工具的英文 metadata 譯成繁體中文。

規則：
1. 一律使用**台灣**慣用語（對照表見下）。
2. 專有名詞、工具名、品牌名、技術術語（RAG、CLI、API、Playwright、Docker、LLM、WebGL、Python 等）**保留英文**，不要硬翻。
3. **只翻譯，不得新增原文沒有的資訊**，不得推測或加油添醋。原文沒提到的能力絕對不要補。
4. 譯文要簡潔通順，長度與原文相當。

台灣用語對照（務必遵守）：
  程式（非「代碼」「編程」）      程式設計（非「編程」）
  檔案（非「文件」）              資料夾（非「文件夾」）
  網路（非「網絡」）              專案（非「項目」）
  資料（非「數據」）              字元（非「字符」）
  軟體（非「軟件」）              影片（非「視頻」）
  預設（非「默認」）              支援（非「支持」）
  伺服器（非「服務器」）          效能（非「性能」）
  執行（非「運行」）              資訊（非「信息」）

輸入輸出格式：
輸入是 JSON 陣列，每項含 id 與待翻欄位。
輸出**只能**是 JSON 物件，key 為工具 id，value 為該工具譯完的欄位（key 名加 _zh 後綴）。
不要輸出任何說明文字、markdown 標記或程式碼區塊。`;

// ── 進度狀態 ────────────────────────────────────────────────────────────────
let state = { done: {}, failed: {} };
if (!RESET && existsSync(STATE_PATH)) {
  try { state = JSON.parse(readFileSync(STATE_PATH, 'utf8')); } catch { /* 損壞就重來 */ }
  if (!state.done) state.done = {};
  if (!state.failed) state.failed = {};
}
// 規則放寬後（例如改為「中英夾雜也要翻」），用 --redo-skipped 重跑那批
if (REDO_SKIPPED) {
  for (const [id, v] of Object.entries(state.done)) {
    if (v && v.skipped) delete state.done[id];
  }
}

const saveState = () => {
  if (!DRY) writeFileSync(STATE_PATH, JSON.stringify(state, null, 2) + '\n');
};

/**
 * 把模型回應正規化成 { [id]: {...} }。
 * 模型常見跑版：回傳陣列（而非物件）、用編號當 key、key 大小寫不一致。
 * 全部容許，避免整批被判失敗。
 */
function normalizeResponse(out) {
  if (!out || typeof out !== 'object') return {};
  if (Array.isArray(out)) {
    const m = {};
    for (const it of out) {
      if (it && typeof it === 'object' && it.id) m[it.id] = it;
    }
    return m;
  }
  return out;
}

/** 重讀 registry → 套用目前所有譯文 → 寫回。避免覆蓋背景行程的更新。 */
function flush() {
  if (DRY) return;
  const j = JSON.parse(readFileSync(REGISTRY, 'utf8'));
  let n = 0;
  for (const t of j.tools) {
    const d = state.done[t.id];
    if (!d) continue;
    if (d.description_zh) t.description_zh = d.description_zh;
    if (d.useCase_zh) t.useCase_zh = d.useCase_zh;
    if (d.advantages_zh) t.advantages_zh = d.advantages_zh;
    n++;
  }
  writeFileSync(REGISTRY, JSON.stringify(j, null, 2) + '\n');
  saveState();
  return n;
}

// ── 收集待翻譯 ──────────────────────────────────────────────────────────────
const reg = JSON.parse(readFileSync(REGISTRY, 'utf8'));
const tools = reg.tools.filter((t) => t.status === 'active' || t.status === 'experimental');

const pending = [];
for (const t of tools) {
  const job = { id: t.id };
  let need = 0;
  // 已是中文的欄位不重翻。
  // ⚠️ 必須先 trim：有些工具的欄位是空白或只剩標點，看起來「非中文」會被送進去，
  // 模型只能回空譯文，造成每次重跑都留一條永遠失敗的尾巴。
  for (const f of ['description', 'useCase', 'advantages']) {
    const v = String(t[f] || '').trim();
    if (!v) continue;
    // 已有譯文的欄位不再重翻（避免重複花費），但**其他欄位仍要補**——
    // 早期版本只翻了部分欄位，若整筆跳過會留下永遠補不完的洞。
    if (t[`${f}_zh`]) continue;
    // 翻譯條件：
    //   - 純英文（hasZH=false）→ 一律翻
    //   - 中英夾雜（含 ≥2 個拉丁詞）→ 翻（原本設 4 太嚴，2026-09-19 實測漏掉 13 個混雜工具）
    //   - 純中文（hasZH=true 且幾無英文）→ 不翻（避免無意義空翻）
    const latinWords = (v.match(/[A-Za-z]{2,}/g) || []).length;
    if (!hasZH(v) || latinWords >= 2) { job[f] = v.slice(0, 400); need++; }
  }
  if (need > 0) { pending.push(job); continue; }
  // 三個欄位都已是中文或為空 → 沒有可翻內容，直接標記完成，
  // 否則每次重跑都會被當成「待處理」而永遠留一條失敗尾巴。
  state.done[t.id] = state.done[t.id] || { at: new Date().toISOString(), skipped: 'already zh or empty' };
  // 清掉舊的失敗記錄，否則每次重跑都顯示「失敗 N 筆」的假象
  delete state.failed[t.id];
}

const targets = pending.slice(0, LIMIT);
console.log(`\n═══ 繁體中文（台灣）翻譯 ═══`);
console.log(`工具總數 ${tools.length}；已處理 ${Object.keys(state.done).length}；本次待處理 ${targets.length}`);
if (DRY) console.log('（--dry：不會寫入）');
if (targets.length === 0) {
  // ⚠️ 這裡也要存檔：收集階段可能清掉過時的失敗記錄，直接結束會讓清理白做
  saveState();
  flush();
  console.log('沒有待處理的工具。');
  process.exit(0);
}

const apiKey = process.env.AGNES_API_KEY;
if (!apiKey) { console.error('\n需要 AGNES_API_KEY（離線不翻譯）'); process.exit(1); }

// ── 翻譯（含指數退避）────────────────────────────────────────────────────────
async function translateBatch(batch) {
  const body = {
    model: 'agnes-2.5-flash',
    messages: [
      { role: 'system', content: SYS },
      { role: 'user', content: JSON.stringify(batch) },
    ],
    temperature: 0.2,
  };
  // 實測第一輪 25% 失敗（429 限流），故退避拉長到 2/4/8/16/32 秒並加開重試次數
  let lastErr = 'unknown';
  for (let attempt = 0; attempt < 6; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 2000 * 2 ** (attempt - 1)));
    try {
      const res = await fetch('https://apihub.agnes-ai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) { lastErr = `http ${res.status}`; continue; }
      const j = await res.json();
      const raw = String(j?.choices?.[0]?.message?.content || '').trim();
      // 容忍模型包了程式碼區塊
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

let okN = 0, failN = 0, batchNo = 0;
for (let i = 0; i < targets.length; i += BATCH) {
  const batch = targets.slice(i, i + BATCH);
  const res = await translateBatch(batch);
  batchNo++;

  if (!res?.ok) {
    for (const b of batch) state.failed[b.id] = { at: new Date().toISOString(), why: res?.reason };
    failN += batch.length;
    process.stdout.write('!');
  } else {
    const out = normalizeResponse(res.ok);
    for (const b of batch) {
      // 模型不一定聽話，實測有三種跑版：
      //   1. 巢狀（正確）：{ "id": { "description_zh": "..." } }
      //   2. 扁平加後綴：{ "id_zh": "譯文" }   ← 只有一個欄位要翻時最常見
      //   3. 直接給字串：{ "id": "譯文" }
      const fields = ['description', 'useCase', 'advantages'].filter((f) => b[f]);
      let r = out[b.id] || out[b.id.toLowerCase()] || out[b.id.toUpperCase()];
      if (r === undefined && typeof out[`${b.id}_zh`] === 'string') r = out[`${b.id}_zh`];
      if (typeof r === 'string') {
        // 扁平形式：只有一個待翻欄位時可直接對應，否則歸給 description
        r = fields.length === 1 ? { [`${fields[0]}_zh`]: r } : { description_zh: r };
      }
      if (!r) { state.failed[b.id] = { at: new Date().toISOString(), why: 'missing id in response' }; failN++; continue; }
      const rec = {};
      // 同理：模型可能回 `description` 而非指定的 `description_zh`，兩種都收
      for (const k of ['description', 'useCase', 'advantages']) {
        const v = String(r[`${k}_zh`] || r[k] || r[k.toLowerCase()] || '').trim();
        if (v) rec[`${k}_zh`] = toTraditional(v);
      }
      if (Object.keys(rec).length === 0) { state.failed[b.id] = { at: new Date().toISOString(), why: 'empty fields' }; failN++; continue; }
      rec.at = new Date().toISOString();
      // 合併而非覆蓋：同一工具可能分批翻不同欄位
      state.done[b.id] = { ...(state.done[b.id] || {}), ...rec };
      delete state.failed[b.id];
      okN++;
    }
    process.stdout.write('·');
  }

  if (batchNo % SAVE_EVERY === 0) { flush(); process.stdout.write('S'); }
  if (batchNo % 20 === 0) process.stdout.write(` ${Math.round((i / targets.length) * 100)}% `);
  // 批次間小歇，降低連續呼叫觸發限流的機率
  await new Promise((r) => setTimeout(r, 400));
}

const written = flush();
console.log(`\n\n完成：成功 ${okN} 筆、失敗 ${failN} 筆`);
if (!DRY) console.log(`已寫入 tools.json（本次套用 ${written} 筆譯文）`);
if (failN > 0) console.log(`失敗的工具已記錄，重新執行本腳本即可續跑。`);
