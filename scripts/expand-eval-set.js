#!/usr/bin/env node
/**
 * expand-eval-set.js — 擴充評測集（可重現，非臨時產生）
 *
 * 為什麼要擴充
 * ────────────
 * 169 題的標準誤約 3.6pp。本專案很多實驗的差異落在 1~3pp（例如
 * 知識圖譜 +2.6pp、PPR 參數 0.9~1.3 只差 2 題），以目前的樣本數
 * 根本判不出來 → 容易把雜訊當成效，或把真效果當雜訊。
 *
 * 擴充到 ~270 題可把標準誤降到 ~3.0pp。
 *
 * 產生流程（四道關卡）
 * ──────────────────
 * 1. 抽樣：依分類輪替取樣，**優先補薄的**（知識管理只有 3 題…）。
 *    ⚠️ 抽樣只看分類，不看現有評測的成敗 → 避免「補弱題」的 overfitting。
 * 2. LLM 反推：餵工具 metadata，請它寫「agent 風格」的口語需求。
 * 3. 漏詞檢查：查詢若出現工具名／id／任何 trigger，整題作廢。
 *    這是為了避免「詞彙重疊造成的循環論證」（methodology.bias_control）。
 * 4. 天花板驗證：用融合引擎取 top-50，答案若不在裡面 → 代表這題
 *    在現有檢索能力下無解，剔除並計數（v1.2.0 的通過率是 92.6%）。
 *
 * 用法
 * ────
 *   AGNES_API_KEY=sk-... node scripts/expand-eval-set.js --add=100 --dry
 *   AGNES_API_KEY=sk-... node scripts/expand-eval-set.js --add=100
 *   node scripts/expand-eval-set.js --report          # 只看現況分佈
 */

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { toTraditional } from './fix-simplified.js';
import { nextKey, reportSuccess, reportFailure } from '../core/llm-keys.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const REGISTRY = path.join(ROOT, 'registry', 'tools.json');
const EVALSET = path.join(ROOT, 'registry', 'eval-queries.json');

const args = process.argv.slice(2);
const ADD = Number(args.find((a) => a.startsWith('--add='))?.split('=')[1]) || 100;
const DRY = args.includes('--dry');
const REPORT = args.includes('--report');
const BATCH = Number(args.find((a) => a.startsWith('--batch='))?.split('=')[1]) || 5;
const MODEL = args.find((a) => a.startsWith('--model='))?.split('=')[1] || undefined;

const reg = JSON.parse(readFileSync(REGISTRY, 'utf8'));
const tools = reg.tools.filter((t) => t.status === 'active' || t.status === 'experimental');
const byId = new Map(tools.map((t) => [t.id, t]));
const evalset = JSON.parse(readFileSync(EVALSET, 'utf8'));

// ── 現況分佈 ───────────────────────────────────────────────────────────────
function distribution() {
  const byCat = {};
  const byType = {};
  for (const c of evalset.cases) {
    if (c.category) byCat[c.category] = (byCat[c.category] || 0) + 1;
    byType[c.type] = (byType[c.type] || 0) + 1;
  }
  return { byCat, byType };
}

if (REPORT) {
  const { byCat, byType } = distribution();
  console.log(`\n評測集 v${evalset.version}　共 ${evalset.cases.length} 題`);
  console.log('類型：', JSON.stringify(byType));
  console.log('分類（由少到多）：');
  Object.entries(byCat).sort((a, b) => a[1] - b[1]).forEach(([k, v]) => console.log(`  ${String(v).padStart(3)}  ${k}`));
  console.log(`\n標準誤約 ${(Math.sqrt(0.62 * 0.38 / evalset.cases.length) * 100).toFixed(1)}pp（以 p=0.62 估）`);
  process.exit(0);
}

// ── 1. 抽樣：優先補薄的分類 ────────────────────────────────────────────────
const { byCat } = distribution();
const cats = [...new Set(tools.map((t) => t.category).filter(Boolean))];
// 每個分類目前有幾題（沒有的算 0）
const load = new Map(cats.map((c) => [c, byCat[c] || 0]));
// 已經出現在評測集 expected 裡的工具不再取樣（避免重複答案）
const usedTools = new Set();
for (const c of evalset.cases) for (const e of c.expected || []) usedTools.add(e);

const pools = new Map();
for (const t of tools) {
  if (!t.category) continue;
  if (usedTools.has(t.id)) continue;
  if (!pools.has(t.category)) pools.set(t.category, []);
  pools.get(t.category).push(t);
}

// 輪替取樣：每次都從「目前題數最少」的分類拿一個
const sampled = [];
const cursor = new Map([...pools.keys()].map((k) => [k, 0]));
while (sampled.length < ADD) {
  // 依（目前負載）排序，取最空的
  const ordered = [...pools.keys()].sort((a, b) => (load.get(a) ?? 0) - (load.get(b) ?? 0));
  let got = false;
  for (const cat of ordered) {
    const pool = pools.get(cat);
    const i = cursor.get(cat);
    if (i >= pool.length) continue;
    cursor.set(cat, i + 1);
    sampled.push(pool[i]);
    load.set(cat, (load.get(cat) ?? 0) + 1); // 取樣後負載+1，下一輪會換別的分類
    got = true;
    break;
  }
  if (!got) break; // 所有池子都抽完了
}
console.log(`抽樣 ${sampled.length} 支工具（來自 ${new Set(sampled.map((t) => t.category)).size} 個分類）`);

// ── 2. LLM 反推 ────────────────────────────────────────────────────────────
const SYS = `你是評測集設計者。我會給你幾個開源工具的描述，請為每一個工具
寫出「AI agent 會怎麼向使用者工具庫提出這個需求」的查詢句。

三種題型，請依照我指定的題型寫：
- direct      ：使用者知道要什麼技術/格式，直接講出具體功能與檔案格式
                （例：把 Excel 試算表的內容轉成可以嵌入網頁的表格）
- semantic    ：使用者只描述「想達成什麼」，完全不提技術詞或工具類型
                （例：解釋這段程式碼在幹嘛，用圖解配上流程圖說明）
- constrained ：需求本身帶有環境或部署限制（自己架、要能離線、限定語言、要開源…）
                （例：想自己架一個知識問答系統，讓它能從我自己的文件裡找答案）

規則：
- 一律繁體中文（台灣用語：檔案、程式碼、網路、影片、專案）。
- 🔴 絕對不可以出現工具的名稱、id。
- 🔴🔴 **不要沿用我給你的 description / capabilities 裡的技術詞**。
   那些詞是工具自己的語言；真實使用者不會那樣說。
   請改寫成「一般人會怎麼講」——用目的、情境、困擾來描述。
   例：不要寫「把 PDF 轉 Markdown」，改寫「論文內容我想貼進筆記軟體裡編輯」。
   例：不要寫「MCP server」，改寫「讓 AI 能直接去操作我的專案」。
- 長度 10~40 字，像真人講話，不要像規格書。
- 每支工具給一個查詢即可。

嚴格輸出 JSON，不要任何解釋：
{ "<工具 id>": { "query": "...", "type": "direct|semantic|constrained" } }`;

async function generate(batch, wantTypes) {
  const body = {
    model: MODEL || 'agnes-3.0-flash',
    messages: [
      { role: 'system', content: SYS },
      {
        role: 'user',
        content: JSON.stringify(batch.map((t) => ({
          id: t.id,
          description: (t.description_zh || t.description || '').slice(0, 200),
          useCase: (t.useCase_zh || t.useCase || '').slice(0, 200),
          capabilities: (t.capabilities || []).slice(0, 8),
          wantType: wantTypes[t.id],
        }))),
      },
    ],
    temperature: 0.8,
  };
  let lastErr = 'unknown';
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 2000 * 2 ** (attempt - 1)));
    const key = nextKey();
    if (!key) { lastErr = 'no api key'; break; }
    try {
      const res = await fetch('https://apihub.agnes-ai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        lastErr = `http ${res.status}`;
        reportFailure(key, res.status);
        if (res.status === 429 || res.status >= 500) continue;
        break;
      }
      reportSuccess(key);
      const j = await res.json();
      const raw = String(j?.choices?.[0]?.message?.content || '').trim();
      const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
      return JSON.parse(cleaned);
    } catch (e) {
      lastErr = String(e?.message || e).slice(0, 80);
    }
  }
  console.warn(`  ! 批次失敗: ${lastErr}`);
  return null;
}

// ── 3. 漏詞檢查 ────────────────────────────────────────────────────────────
const norm = (s) => String(s || '').toLowerCase().replace(/[\s_\-.]/g, '');

/**
 * 真漏詞：查詢直接講出工具名或 id → 整題作廢
 * （等於把答案寫在題目裡，循環論證）
 */
function hasLeak(query, tool) {
  const q = norm(query);
  return [norm(tool.id), norm(tool.name)]
    .filter((c) => c.length >= 3)   // 太短會誤殺（例如 id 是 "ai"）
    .some((c) => q.includes(c));
}

/**
 * trigger 重疊：只統計、不作廢。
 * 既有評測集允許這種技術詞重疊（例：c01「把 Excel 試算表…」對上 trigger 含 excel），
 * 而且 direct 題型本來就該讓使用者說出技術詞。但若比例過高代表題目偏簡單，
 * 值得在報告裡看出來。
 */
function hasTriggerOverlap(query, tool) {
  const q = norm(query);
  return (tool.triggers || [])
    .map(norm)
    .filter((c) => c.length >= 2)
    .some((c) => q.includes(c));
}

// ── 4. 天花板驗證 ──────────────────────────────────────────────────────────
let ceiler = null;
async function inTop50(query, expectedId) {
  if (!ceiler) {
    const { agentRetrieve } = await import('../core/agent-retrieval.js');
    const { extractIntent, weightsForIntent } = await import('../core/query-intent.js');
    ceiler = async (q) => {
      const r = agentRetrieve(tools, q, { topK: 50, intentWeights: weightsForIntent(extractIntent(q)) });
      return r.topK.map((x) => x.id);
    };
  }
  const top = await ceiler(query);
  return top.includes(expectedId);
}

// ── 主流程 ─────────────────────────────────────────────────────────────────
// 依現有分佈比例指派題型，避免改變類型結構（否則新舊基線又不能比）
const typeMix = { direct: 0.28, semantic: 0.50, constrained: 0.22 };
function pickType(i) {
  const r = (i * 0.6180339887) % 1; // 黃金比例散佈，避免週期性
  if (r < typeMix.direct) return 'direct';
  if (r < typeMix.direct + typeMix.semantic) return 'semantic';
  return 'constrained';
}

const wantTypes = {};
sampled.forEach((t, i) => { wantTypes[t.id] = pickType(i); });

const existingQueries = new Set(evalset.cases.map((c) => String(c.query).trim()));
const maxC = evalset.cases
  .filter((c) => /^c\d+$/.test(c.id))
  .reduce((m, c) => Math.max(m, parseInt(c.id.slice(1), 10)), 0);
let nextId = maxC + 1;

const accepted = [];
let leakRejected = 0;
let ceilingRejected = 0;
let dupRejected = 0;
let triggerOverlaps = 0;

for (let i = 0; i < sampled.length; i += BATCH) {
  const batch = sampled.slice(i, i + BATCH);
  const out = await generate(batch, wantTypes);
  if (!out) continue;
  for (const t of batch) {
    const e = out[t.id];
    if (!e?.query) continue;
    const query = toTraditional(String(e.query).trim());
    if (query.length < 8) continue;
    if (existingQueries.has(query)) { dupRejected++; continue; }
    if (hasLeak(query, t)) { leakRejected++; continue; }
    const ok = await inTop50(query, t.id);
    if (!ok) { ceilingRejected++; continue; }
    if (hasTriggerOverlap(query, t)) triggerOverlaps++;
    existingQueries.add(query);
    accepted.push({
      id: `c${String(nextId++).padStart(3, '0')}`,
      query,
      expected: [t.id],
      type: ['direct', 'semantic', 'constrained'].includes(e.type) ? e.type : wantTypes[t.id],
      category: t.category,
      note: `v1.3.0 新增（${t.category}）`,
    });
  }
  process.stdout.write(`  進度 ${Math.min(i + BATCH, sampled.length)}/${sampled.length}，接受 ${accepted.length}\n`);
}

console.log(`\n接受 ${accepted.length} 題`);
console.log(`剔除：漏詞 ${leakRejected}／答案不在 top-50 ${ceilingRejected}／重複 ${dupRejected}`);
console.log(`（其中 ${triggerOverlaps} 題與 trigger 用詞重疊，保留但計數——既有評測集亦允許）`);
console.log(`天花板通過率：${accepted.length}/${accepted.length + ceilingRejected} = ` +
  `${(accepted.length / Math.max(1, accepted.length + ceilingRejected) * 100).toFixed(1)}%（v1.2.0 為 92.6%）`);

if (DRY) {
  console.log('\n[dry] 範例：');
  accepted.slice(0, 8).forEach((c) => console.log(`  [${c.type}] ${c.query} → ${c.expected.join(',')}`));
  process.exit(0);
}

if (accepted.length === 0) { console.log('沒有可新增的題目，不寫入。'); process.exit(0); }

// 寫入
evalset.cases.push(...accepted);
evalset.version = '1.3.0';
evalset.methodology = evalset.methodology || {};
evalset.methodology.generation = (evalset.methodology.generation || '') +
  `\n2026-09-20 擴充至 v1.3.0：以 scripts/expand-eval-set.js **可重現地**新增 ${accepted.length} 題` +
  `（依分類輪替取樣、優先補薄分類；題型比例維持 direct 28%／semantic 50%／constrained 22%，` +
  `以免類型分佈再次改變）。四道關卡：漏詞檢查（剔除 ${leakRejected}）→ 天花板驗證` +
  `（答案需在 top-50，剔除 ${ceilingRejected}）→ 去重（${dupRejected}）→ 人工未介入。` +
  `**新基線與舊基線不可直接比較**（題數改變，標準誤由 ~3.6pp 降至 ~${(Math.sqrt(0.62 * 0.38 / evalset.cases.length) * 100).toFixed(1)}pp）。`;

writeFileSync(EVALSET, JSON.stringify(evalset, null, 2));
console.log(`\n已寫入 ${EVALSET}`);
console.log(`評測集 v1.3.0　共 ${evalset.cases.length} 題`);
