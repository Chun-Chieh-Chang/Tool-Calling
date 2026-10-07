#!/usr/bin/env node
/**
 * lint-wiki.js — 知識編譯詞檔的定期體檢（唯讀、確定性、不呼叫 LLM）
 *
 * 動機
 * ────
 * compile-wiki.js 是「一次性編譯」：詞檔編好之後，來源 metadata 一樣在變
 * （enrich 補欄位、cron 改 star、新工具進庫），但沒有一支腳本回頭問：
 * 「這 733 筆詞條還對不對得上現在的 registry？」
 * 本腳補的就是 LLM Wiki 三操作裡缺的那個 **Lint**（Ingest／Query 已有）。
 *
 * 五項檢查（嚴重度由上而下）
 * ─────────────────────────
 *   E1 來源漂移      詞條編譯之後，來源欄位又被改過 → 詞條描述的是舊版工具
 *   E2 幽靈詞條      詞檔有、registry 的 active/experimental 沒有
 *   E3 缺詞條        工具在庫上、卻沒有 intents → 該工具的 V5 維度恆為 0
 *   E4 鑑別力腐化    以「當前全庫」重算 df，原本合格的 intent 變成萬能詞
 *                    （compile 時的守門只對「當時的語料」有效）
 *   E5 雙重否定殘留  negativeConstraints 散文含「不適合非…」——評測 c61 的
 *                    實證失敗模式（見 core/agent-retrieval.js:285-289）
 *
 * E4／E5 只-report 不修檔：修正分屬既有兩支寫入腳本，本腳不重複實作
 *   E3     → `npm run compile:wiki`（只跑尚未編譯過的工具）
 *   E1     → `compile-wiki.js --ids=<清單>`（裸跑會跳過已是 Tier 1 的漂移工具）
 *   E5     → `node scripts/infer-facets.js --top=100`（萃取後過同一道格式門）
 *
 * 關於 E1 的誠實限制
 * ─────────────────
 * compiled-entries.json 只存 `compiled_at` 時間戳，**沒有記錄編譯時看到的
 * 來源長什麼樣**，而 tools.json 的 `lastUpdated` 是全庫一個時間戳、無法定位
 * 是哪支工具變的。所以漂移只能「從建立基線那一刻起」往後偵測，
 * 無法追溯既有 733 筆在編譯後被改過幾筆。首次執行請用 --update-baseline。
 *
 * 用法
 * ────
 *   node scripts/lint-wiki.js                    # 人可讀報告
 *   node scripts/lint-wiki.js --json             # 機器可讀（全部清單，不截斷）
 *   node scripts/lint-wiki.js --update-baseline  # 檢查後重建來源指紋基線
 *   node scripts/lint-wiki.js --show=30          # 每項列印前 30 筆 id（預設 12）
 *
 * 路徑覆蓋（供固定夾具測試使用，見 tests/wiki-lint.test.js）
 *   --registry=<path> --wiki=<path> --baseline=<path>
 *   不給就指向真實檔案；三個參數可只給一部分（例如只換詞檔）。
 *
 * 出口碼：E1／E2 > 0 → 1；其餘（含僅警告）→ 0。
 * ⚠️ 對真實檔案的掃描**不掛進 npm test**：讀的是活資料，registry 一變計數就變，
 *    掛進去就是隨時會紅的斷言。進 npm test 的是用固定夾具的那支測試。
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { REGISTRY_PATH } from '../core/registry.js';
import { WIKI_PATH as WIKI_PATH_DEFAULT } from '../core/wiki-matcher.js';
import { tokenize, documentFrequency } from '../core/tokenize.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const args = process.argv.slice(2);
const JSON_OUT = args.includes('--json');
const UPDATE_BASELINE = args.includes('--update-baseline');
const SHOW = Number(args.find((a) => a.startsWith('--show='))?.split('=')[1]) || 12;

// 路徑覆蓋：只改變「讀哪三份檔」，不碰任何判定邏輯。
// 夾具測試靠它把三份檔都指到暫存目錄——同一支腳本、同一套判定，
// 測到的才是真的會跑的那條路，而不是另一份「專供測試的簡化版」。
function argPath(name) {
  const raw = args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
  return raw ? path.resolve(raw) : null;
}
const REG_PATH = argPath('registry') || REGISTRY_PATH;
const WIKI_PATH = argPath('wiki') || WIKI_PATH_DEFAULT;
const BASELINE_PATH = argPath('baseline') || path.join(ROOT, 'registry', 'wiki-lint-baseline.json');

// 鑑別力門檻：與 compile-wiki.js 的 discriminabilityGuard 同值。
// ⚠️ 刻意在本地重述而沒有 import——compile-wiki.js 是「一載入就執行」的腳本，
//    import 它會觸發整趟編譯副作用。兩邊值不一致時 E4 的判定會失去意義，
//    改動其中一個請同時改另一個。
const MAX_DF_RATIO = 0.06;

// ── 來源指紋 ─────────────────────────────────────────────────────────────
// 取「編譯時真的進進 prompt 的那個視圖」，而不是整筆工具。
// 截斷方式對齊 compile-wiki.js:154-163（Tier 1）與 :104-119（Tier 0）。
// 為什麼要複刻截斷：若把整筆工具都雜湊，改到第 12 項 capabilities（根本沒進
// prompt）也會被判漂移 → 誤報淹沒訊號。反面代價是這個視圖與 compile-wiki
// 產生「隱性耦合」：兩邊截斷長度不一致時，指紋會覆蓋到沒看過的欄位。
// ⚠️ 這層耦合由 tests/wiki-lint.test.js 的「改第 12 項不該報漂移」守住。
function fingerprintSource(tool, tier) {
  const view = tier === 1
    ? {
        name: tool.name,
        description: String(tool.description_zh || tool.description || '').slice(0, 300),
        useCase: String(tool.useCase_zh || tool.useCase || '').slice(0, 300),
        capabilities: (tool.capabilities || []).slice(0, 10),
        advantages: (tool.advantages || []).slice(0, 5),
        negativeConstraints: (tool.negativeConstraints_zh || tool.negativeConstraints || []).slice(0, 3),
        triggers: (tool.triggers || []).slice(0, 6),
      }
    : {
        useCase: String(tool.useCase_zh || tool.useCase || ''),
        // Tier 0 的兩個實來源（compile-wiki.js:122-126）：description 與前 6 個 triggers。
        // 缺 description 時，7/12 支靠它取句的 Tier 0 詞條改了不會報漂移＝假綠。
        description: String(tool.description_zh || tool.description || ''),
        triggers: (tool.triggers || []).slice(0, 6),
        capabilities: tool.capabilities || [],
        category: tool.category,
        install: tool.install?.method || '',
        language: tool.language || '',
        negative: tool.negativeConstraints_zh || tool.negativeConstraints || [],
      };
  return createHash('sha1').update(JSON.stringify(view)).digest('hex').slice(0, 16);
}

// ── E5 雙重否定模式 ──────────────────────────────────────────────────────
// 保守清單：只抓已被評測實證會誤判的寫法（c61：「不適合非 Microsoft 生態」）。
// 刻意不抓「需要／必須搭配」這類正面表述——那些由 negativePenalty 的
// 重疊門檻（散文 0.25／結構 0.30）處理，不屬於語意矛盾。
// 第 4 條原本寫 `/非.{0,12}(情況|情境|下)/`，活資料實測抓到 freetube 的
// 「無法下載影片離線觀看（非下載工具）」——「非」後面直接接到「下載」的「下」，
// 沒有否定套疊，是純誤報。改成「非 … 情狀名詞 ＋ 下」：裸「下」一定要和前一個詞
// 構成「情況下／環境下」這類處所式收尾才算數。
const DOUBLE_NEG_PATTERNS = [
  /不適合非/,
  /不宜非/,
  /不適用非/,
  /非.{0,16}(情況|情形|情境|環境|條件|狀態|場景)下/,
];

// ── 載入 ─────────────────────────────────────────────────────────────────
const reg = JSON.parse(readFileSync(REG_PATH, 'utf8'));
const tools = reg.tools.filter((t) => t.status === 'active' || t.status === 'experimental');
const toolById = new Map(tools.map((t) => [t.id, t]));

if (!existsSync(WIKI_PATH)) {
  console.error(`❌ 找不到詞檔：${WIKI_PATH}`);
  console.error('   請先執行：npm run compile:wiki');
  process.exit(1);
}
let wiki;
try {
  wiki = JSON.parse(readFileSync(WIKI_PATH, 'utf8'));
} catch (e) {
  console.error(`❌ 詞檔損壞（${e.message}）——檢索端的 V5 此刻已自動停用`);
  process.exit(1);
}
const entries = wiki.entries || {};

let baseline = null;
if (existsSync(BASELINE_PATH)) {
  try {
    baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8')).fingerprints || null;
  } catch {
    baseline = null;
  }
}

// ── E1 來源漂移 ──────────────────────────────────────────────────────────
const drift = [];
if (baseline) {
  for (const [id, entry] of Object.entries(entries)) {
    const tool = toolById.get(id);
    if (!tool) continue; // 交給 E2 處理，這裡不重複報
    const prev = baseline[id];
    if (!prev) continue; // 交給「未對基線」統計
    if (prev !== fingerprintSource(tool, entry.tier === 1 ? 1 : 0)) drift.push(id);
  }
}
const unblessed = baseline ? Object.keys(entries).filter((id) => !baseline[id]) : Object.keys(entries);

// ── E2 幽靈詞條 ──────────────────────────────────────────────────────────
const ghosts = Object.keys(entries).filter((id) => !toolById.has(id));

// ── E3 缺詞條 ────────────────────────────────────────────────────────────
const missing = tools.filter((t) => !(entries[t.id]?.intents || []).length).map((t) => t.id);

// ── E4 鑑別力腐化（以當前全庫重算 df）────────────────────────────────────
const ids = Object.keys(entries);
const df = documentFrequency(ids.map((id) => (entries[id]?.intents || []).join(' ')));
const maxDf = Math.max(2, Math.floor(ids.length * MAX_DF_RATIO));
const decayed = [];   // 有句子已經淪為萬能詞（但詞條整體還可用）
const deadEntries = []; // 全部句子都沒有鑑別力 → 這筆詞條對 V5 沒有貢獻
for (const id of ids) {
  const intents = entries[id]?.intents || [];
  if (intents.length === 0) continue;
  const alive = intents.filter((s) => {
    const toks = tokenize(s);
    return toks.length > 0 && toks.some((t) => (df.get(t) || 0) <= maxDf);
  });
  if (alive.length === intents.length) continue;
  if (alive.length === 0) deadEntries.push(id);
  else decayed.push({ id, dropped: intents.length - alive.length, kept: alive.length });
}

// ── E5 雙重否定殘留 ──────────────────────────────────────────────────────
// 分兩級：帶 negativeFacets 的工具，agent-retrieval 已「一律以結構為準、
// 忽略散文」（core/agent-retrieval.js:296-297）→ 屬遺留髒資料（低危）；
// 沒有 facets 的工具，散文仍會進 negativePenalty 扣分 → 會誤判（高危）。
const highRisk = [];
const lowRisk = [];
for (const t of tools) {
  const hits = (t.negativeConstraints || [])
    .map((c) => String(c || ''))
    .filter((c) => DOUBLE_NEG_PATTERNS.some((re) => re.test(c)));
  if (hits.length === 0) continue;
  const hasFacets = Array.isArray(t.negativeFacets) && t.negativeFacets.length > 0;
  (hasFacets ? lowRisk : highRisk).push({ id: t.id, sample: hits[0].slice(0, 70) });
}

// ── 報告 ─────────────────────────────────────────────────────────────────
const summary = {
  tools: tools.length,
  entries: ids.length,
  drift: drift.length,
  ghosts: ghosts.length,
  missing: missing.length,
  decayedIntents: decayed.length,
  deadEntries: deadEntries.length,
  doubleNegHigh: highRisk.length,
  doubleNegLow: lowRisk.length,
  baselineExists: Boolean(baseline),
  unblessed: unblessed.length,
};

if (JSON_OUT) {
  console.log(JSON.stringify({
    summary,
    drift,
    ghosts,
    missing,
    decayed,
    deadEntries,
    doubleNegHigh: highRisk,
    doubleNegLow: lowRisk,
  }, null, 2));
} else {
  console.log(`🔍 詞檔體檢：${summary.entries} 筆詞條／${summary.tools} 支工具（df 門檻 ${maxDf}）`);

  const line = (label, n, note) => console.log(`  ${label.padEnd(14)} ${String(n).padStart(4)}  ${note || ''}`);
  line('E1 來源漂移', drift.length, baseline ? '' : '（無基線，無法判定 → 跑 --update-baseline）');
  line('E2 幽靈詞條', ghosts.length);
  line('E3 缺詞條', missing.length);
  line('E4 腐化詞條', decayed.length, deadEntries.length ? `其中 ${deadEntries.length} 筆整筆失效` : '');
  line('E5 高危雙否', highRisk.length, '散文仍會進 negativePenalty 扣分');
  line('E5 低危雙否', lowRisk.length, '已有 facets，散文被忽略');
  if (baseline) line('未對基線', unblessed.length, '新編譯但尚未納入指紋基線');

  const listBlock = (title, arr) => {
    if (!arr.length) return;
    const items = arr.slice(0, SHOW);
    console.log(`\n⚠️ ${title}（前 ${items.length}／共 ${arr.length}）`);
    for (const it of items) {
      console.log(typeof it === 'string' ? `     ${it}` : `     ${it.id}${it.sample ? ` ← ${it.sample}` : ''}`);
    }
    if (arr.length > items.length) console.log(`     …（--json 看完整清單）`);
  };
  listBlock('E1 來源漂移：這些工具的 metadata 在編譯後被改過', drift);
  listBlock('E2 幽靈詞條：詞檔有、registry 沒有（需人工決定刪除）', ghosts);
  listBlock('E3 缺詞條：V5 對這些工具恆為 0', missing);
  listBlock('E5 高危雙重否定（先抽成 negativeFacets 就解除了）', highRisk);

  console.log('\n📊 下一步');
  if (missing.length) {
    console.log('   npm run compile:wiki        # 補 E3（尚未編譯過的工具，需 AGNES_API_KEY）');
  }
  if (drift.length) {
    // ⚠️ 不能用裸 compile:wiki 重編漂移工具：LLM 模式的 targets 會過濾掉
    //    已是 Tier 1 的詞條（compile-wiki.js:287）→ 漂移的那批會被靜默跳過。
    //    --ids 走的是另一條分支（:281-284），會強制重編。
    console.log('   AGNES_API_KEY=sk-... node scripts/compile-wiki.js --ids=<E1 清單>   # 重編漂移工具');
  }
  if (highRisk.length) {
    console.log('   node scripts/infer-facets.js --top=100        # 先乾跑看提案');
    console.log('   node scripts/infer-facets.js --ids=<高危 id> --apply   # 再寫入');
  }
  if (!baseline) {
    console.log('   node scripts/lint-wiki.js --update-baseline   # 建立來源指紋基線');
  }
  if (drift.length || missing.length || highRisk.length) {
    console.log('   ⚠️ 詞檔一經重編，請重跑 npm run ablate:v5 重定 V5 權重');
    console.log('      （core/agent-retrieval.js:245：最適值會跟著詞檔變）');
  }
}

// ── 重建基線 ─────────────────────────────────────────────────────────────
if (UPDATE_BASELINE) {
  const fingerprints = {};
  for (const [id, entry] of Object.entries(entries)) {
    const tool = toolById.get(id);
    if (!tool) continue; // 幽靈詞條不進基線
    fingerprints[id] = fingerprintSource(tool, entry.tier === 1 ? 1 : 0);
  }
  writeFileSync(BASELINE_PATH, JSON.stringify({ version: '1.0.0', generatedAt: new Date().toISOString(), fingerprints }, null, 2) + '\n', 'utf8');
  console.log(`\n✅ 已重建來源指紋基線：${Object.keys(fingerprints).length} 筆 → ${BASELINE_PATH}`);
}

const blocking = drift.length + ghosts.length;
if (!JSON_OUT) console.log(blocking ? `\n❌ 阻斷級問題 ${blocking} 件（E1／E2）` : '\n✅ 無阻斷級問題');
process.exit(blocking > 0 ? 1 : 0);
