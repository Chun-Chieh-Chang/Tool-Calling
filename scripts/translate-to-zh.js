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
import { activateIfComplete } from '../core/tool-lifecycle.js';
import { negativeConstraintsZhGap } from '../core/registry-contract.js';

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
const IDS = args.find((a) => a.startsWith('--ids='))?.split('=')[1]?.split(',').map((s) => s.trim()).filter(Boolean);
// 2026-10-03 補：此前無 --ids，只能全量跑；A 批回補需要單支重譯
// （enrich 回補 negativeConstraints 後只翻該支的 negativeConstraints_zh）。
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
  // 不只清掉 `skipped` 標記——也要清掉「缺少新欄位」的紀錄，
  // 否則修了 pending 邏輯後仍會被 done 紀錄跳過。
  const reg2 = JSON.parse(readFileSync(REGISTRY, 'utf-8'));
  const toolsById = new Map(reg2.tools.map((t) => [t.id, t]));
  for (const [id, v] of Object.entries(state.done)) {
    if (v && v.skipped) { delete state.done[id]; continue; }
    if (v && v.negativeConstraints_zh) continue;
    const t = toolsById.get(id);
    if (!t) continue;
    if (Array.isArray(t.negativeConstraints) && t.negativeConstraints.length > 0
        && (!Array.isArray(t.negativeConstraints_zh) || t.negativeConstraints_zh.length < t.negativeConstraints.length)) {
      delete state.done[id];
    }
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

/** 重讀 registry → 套用目前所有譯文 → 寫回。避免覆蓋背景行程的更新。
 * 2026-10-03 補 --ids 語意：指定 id 時只套用這些工具的譯文，不重放全庫。
 * 背景：全量重放會把 state.done 裡的舊譯文蓋回 tools.json——A 批回補時曾把
 * 手動清空的欄位用舊快取復活（HANDOFF 新增陷阱 6 的同類事件），故 --ids 限定範圍。 */
function flush(idsOnly) {
  if (DRY) return;
  const j = JSON.parse(readFileSync(REGISTRY, 'utf8'));
  let n = 0;
  const activated = [];
  const only = idsOnly ? new Set(idsOnly) : null;
  for (const t of j.tools) {
    if (only && !only.has(t.id)) continue;
    const d = state.done[t.id];
    if (!d) continue;
    if (d.description_zh) t.description_zh = d.description_zh;
    if (d.useCase_zh) t.useCase_zh = d.useCase_zh;
    if (d.advantages_zh) t.advantages_zh = d.advantages_zh;
    // negativeConstraints 是陣列，獨立處理（2026-09-20 漏寫導致 0 個有 negativeConstraints_zh）
    if (Array.isArray(d.negativeConstraints_zh)) {
      t.negativeConstraints_zh = d.negativeConstraints_zh;
    }
    // 生命週期：description_zh 是升級判準的最後一塊拼圖，而它由本腳本產生——
    // enrich 階段跑在翻譯之前，當時判定必定為 false，所以升級只能在這裡補，
    // 否則工具會永久卡在 experimental（2026-09-25 清掉 35 筆這類死區）。
    if (activateIfComplete(t)) activated.push(t.id);
    n++;
  }
  writeFileSync(REGISTRY, JSON.stringify(j, null, 2) + '\n');
  saveState();
  if (activated.length > 0) {
    console.log(`\n狀態升級 experimental → active：${activated.length} 筆（${activated.slice(0, 6).join(', ')}${activated.length > 6 ? ' …' : ''}）`);
  }
  return n;
}

// ── 收集待翻譯 ──────────────────────────────────────────────────────────────
const reg = JSON.parse(readFileSync(REGISTRY, 'utf8'));
let tools = reg.tools.filter((t) => t.status === 'active' || t.status === 'experimental');
// --ids：只處理指定工具（A 批回補用）。flush(IDS) 同步限定範圍，
// 只套用這些工具的譯文，不重放全庫（state 只新增該支條目）。
if (IDS) {
  const set = new Set(IDS);
  tools = tools.filter((t) => set.has(t.id));
}

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
  // negativeConstraints 是字串陣列（「Not suitable for X / Y / Z」這種列舉）。
  // 翻譯整個陣列——少一個就破壞「禁用情境」的語意。
  if (Array.isArray(t.negativeConstraints) && t.negativeConstraints.length > 0) {
    // 判準抽到 core/registry-contract.js 的 negativeConstraintsZhGap：同一支函式也是
    // 「NCZ 欠債」常態閘門的實作處。兩邊各寫一次的話，遲早會出現閘門說有缺口、
    // 而翻譯器說不用翻（或反之）的洞——這次的 6 支誤報就是兩把尺不同源造成的。
    if (negativeConstraintsZhGap(t)) {
      job.negativeConstraints = t.negativeConstraints.filter((s) => String(s || '').trim()).slice(0, 8);
      need++;
    }
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
  flush(IDS);
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
      // 模型不一定聽話，實測有四種跑版：
      //   1. 巢狀（正確）：{ "id": { "description_zh": "..." } }
      //   2. 扁平加後綴：{ "id_zh": "譯文" }   ← 只有一個欄位要翻時最常見
      //   3. 直接給字串：{ "id": "譯文" }
      //   4. 扁平且 key 帶欄位名：{ "id_description_zh": "譯文" }
      //      ← 當同一批次裡每個工具各自只缺「不同」欄位時幾乎必然出現
      //        （實例：一支缺 description、另一支缺 negativeConstraints）
      const fields = ['description', 'useCase', 'advantages'].filter((f) => b[f]);
      let r = out[b.id] || out[b.id.toLowerCase()] || out[b.id.toUpperCase()];
      if (r === undefined && typeof out[`${b.id}_zh`] === 'string') r = out[`${b.id}_zh`];
      // 跑版 #2/#3 的**陣列**版：整批只翻 negativeConstraints 時，模型會把譯文陣列
      // 直接掛在 `<id>` 或 `<id>_zh` 底下（實測 2026-09-27：字串版上面接得住，
      // 陣列版兩條路都落空 → 整批被誤判為 missing id，10 支白燒一次呼叫）。
      const ncArr = Array.isArray(r) ? r
        : (r === undefined && Array.isArray(out[`${b.id}_zh`]) ? out[`${b.id}_zh`] : null);
      if (ncArr && b.negativeConstraints) r = { negativeConstraints_zh: ncArr };
      if (typeof r === 'string') {
        // 扁平形式：只有一個待翻欄位時可直接對應。
        // fields 為空（本批只請求 negativeConstraints）→ 給約束，不給 description
        // （2026-10-03 khoj 教訓：歸錯欄位會覆寫既有譯文）。
        if (fields.length === 1) r = { [`${fields[0]}_zh`]: r };
        else if (fields.length === 0 && b.negativeConstraints) r = { negativeConstraints_zh: r };
        else r = { description_zh: r };
      }
      // 第 4 種跑版：整個回應被壓平，key 變成 `<id>_<欄位>_zh`
      if (!r || typeof r !== 'object') {
        const flat = {};
        for (const f of fields) {
          const v = out[`${b.id}_${f}_zh`];
          if (typeof v === 'string' && v.trim()) flat[`${f}_zh`] = v;
        }
        const nc = out[`${b.id}_negativeConstraints_zh`] ?? out[`${b.id}_negativeConstraints`];
        // 2026-10-03 khoj 實測：只收陣列會漏掉字串版——扁平鍵回來的是字串，
        // 整批被誤判 missing id。字串交給下方的筆數比對防呆處理。
        if (Array.isArray(nc) && nc.length) flat.negativeConstraints_zh = nc;
        else if (typeof nc === 'string' && nc.trim()) flat.negativeConstraints_zh = nc;
        if (Object.keys(flat).length > 0) r = flat;
      }
      if (!r) {
        // 記錄實際收到的 key，否則只看到「missing id」無從診斷模型跑版成什麼樣子
        const gotKeys = Object.keys(out || {}).slice(0, 6).join(', ') || '(no keys)';
        state.failed[b.id] = { at: new Date().toISOString(), why: `missing id in response; got: ${gotKeys}` };
        failN++;
        continue;
      }
      const rec = {};
      // 同理：模型可能回 `description` 而非指定的 `description_zh`，兩種都收。
      // 🔴 但只收「本次真的請求的欄位」——2026-10-03 khoj 實例：本批次只請求
      // negativeConstraints，模型卻把譯文回成 description_zh，未加閘門會把
      // 既有的描述譯文覆寫成約束句（污染後需從 git 手動復原）。
      for (const k of ['description', 'useCase', 'advantages']) {
        if (!fields.includes(k)) continue;
        const v = String(r[`${k}_zh`] || r[k] || r[k.toLowerCase()] || '').trim();
        if (v) rec[`${k}_zh`] = toTraditional(v);
      }
      // negativeConstraints 是陣列：模型應回 negativeConstraints_zh (陣列)
      if (b.negativeConstraints) {
        const want = Array.isArray(b.negativeConstraints) ? b.negativeConstraints.length : 0;
        const ncRaw = r['negativeConstraints_zh'] ?? r['negativeConstraints'];
        // 🔴 筆數比對（原本只有字串分支有，陣列分支漏了）——2026-10-03 freecodecamp
        // 實例：英文 2 條、模型回 1 個「以 \n 黏接」的陣列元素，陣列分支無條件收下，
        // 導致 NCZ[i] 不再對應 NC[i]（顯示層取首項會吐出兩句、compile-wiki 少算 1 條）。
        if (Array.isArray(ncRaw) && ncRaw.length) {
          let nc = ncRaw.map((s) => String(s ?? '').trim()).filter(Boolean);
          if (want && nc.length !== want) {
            // 先試按換行拆分（黏接的常見分隔符）；拆完數目仍不符 → 整批拒收留空，
            // 寧可退回英文也不收錯位陣列。
            nc = nc.flatMap((s) => s.split(/\n+/)).map((s) => toTraditional(s.trim())).filter(Boolean);
          } else {
            nc = nc.map((s) => toTraditional(s));
          }
          if (nc.length && (!want || nc.length === want)) rec['negativeConstraints_zh'] = nc;
        } else if (typeof ncRaw === 'string' && ncRaw.trim()) {
          // 模型偶爾把整個陣列壓成一條字串。只有切分後**筆數正好等於**原文才收下，
          // 否則寧可留空（web/app.js:1285 會退回英文）——憑猜測切分會切錯句子。
          const parts = ncRaw.split(/[；;\n]+/).map((s) => toTraditional(s.trim())).filter(Boolean);
          if (want && parts.length === want) rec['negativeConstraints_zh'] = parts;
        }
      }
      if (Object.keys(rec).length === 0) {
        // 只寫「empty fields」無從診斷：模型常把唯一待翻欄位壓成陣列或換 key，
        // 這裡記下實際收到的 shape，下次重跑就知道要補哪一種跑版。
        const shape = Array.isArray(r) ? `array(${r.length})`
          : typeof r === 'object' ? Object.keys(r).join(',') || '(no keys)' : typeof r;
        state.failed[b.id] = { at: new Date().toISOString(), why: `empty fields; got: ${shape}` };
        failN++;
        continue;
      }
      rec.at = new Date().toISOString();
      // 合併而非覆蓋：同一工具可能分批翻不同欄位
      state.done[b.id] = { ...(state.done[b.id] || {}), ...rec };
      delete state.failed[b.id];
      okN++;
    }
    process.stdout.write('·');
  }

  if (batchNo % SAVE_EVERY === 0) { flush(IDS); process.stdout.write('S'); }
  if (batchNo % 20 === 0) process.stdout.write(` ${Math.round((i / targets.length) * 100)}% `);
  // 批次間小歇，降低連續呼叫觸發限流的機率
  await new Promise((r) => setTimeout(r, 400));
}

const written = flush(IDS);
console.log(`\n\n完成：成功 ${okN} 筆、失敗 ${failN} 筆`);
if (!DRY) console.log(`已寫入 tools.json（本次套用 ${written} 筆譯文）`);
if (failN > 0) console.log(`失敗的工具已記錄，重新執行本腳本即可續跑。`);
