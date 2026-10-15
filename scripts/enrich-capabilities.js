#!/usr/bin/env node
/**
 * enrich-capabilities.js — 精實補 capabilities（2026-10-15 Q4=B）
 *
 * 為什麼是「精實」：全庫有 159 支工具沒有 capabilities（多數是 GitHub repo
 * 沒設 topics）。它是**已知的非召回瓶頸**（2026-10-14 盤點），所以不做全庫
 * 批次回填——那是浪費 LLM 額度換邊際效益。只補「真的有被用到」的那些。
 *
 * 選誰來補（優先序）：
 *   ① 真人遙測命中：web/data/telemetry-events.jsonl 的 search.topResultId
 *      與 click.toolId（真實使用訊號，最該優先）。
 *   ② 遙測 0 筆時的**代理訊號**：registry/eval-queries.json 的 expected 命中
 *      （--proxy）。這只是「哪些工具在評測裡被期待」的排序代理，**不是**
 *      真人需求證據；輸出時會明確標示，避免被誤讀成真實使用率。
 *
 * 硬規則（MEMORY §7）：
 *   · 必須基於 README——enricher 會抓 README，抓不到就不猜（回 null）。
 *   · 不產生 `*_zh`（`skipZh: true`）——中文欄位只由 `npm run translate:zh` 產生。
 *   · 不覆蓋既有值（normalizeEnrichment 只在原本為空時給 capabilities）。
 *   · 預設 dry-run；`--apply` 才寫入，且**先備份** registry。
 *
 * 用法：
 *   node scripts/enrich-capabilities.js                    # dry-run（唯讀）
 *   node scripts/enrich-capabilities.js --limit 20
 *   node scripts/enrich-capabilities.js --proxy            # 用 eval-queries 代理排序
 *   node scripts/enrich-capabilities.js --apply --limit 5  # 真的補（序列、有延遲）
 *
 * 注意：需 LLM 金鑰（AGNES_API_KEYS／AGNES_API_KEY）。單把金鑰受限 TPM，
 * 一次別開太大（見 MEMORY §6：序列跑、別看 req/s）。
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const TELEMETRY = path.join(ROOT, 'web', 'data', 'telemetry-events.jsonl');
const EVAL_QUERIES = path.join(ROOT, 'registry', 'eval-queries.json');
const BACKUP_DIR = path.join(ROOT, 'registry', 'backups');

// ─── 純函式（可測，不觸網、不碰檔案） ─────────────────────────────────────

/** 從遙測事件收集工具命中次數：search→topResultId、click→toolId */
export function collectTelemetryHits(events = []) {
  const hits = new Map();
  for (const e of events) {
    const id = e?.type === 'search' ? e.topResultId
      : e?.type === 'click' ? e.toolId
        : null;
    if (typeof id !== 'string' || !id) continue;
    hits.set(id, (hits.get(id) || 0) + 1);
  }
  return hits;
}

/** 代理訊號：eval-queries 的 expected＋alsoAcceptable 命中次數（明確標示為代理） */
export function collectEvalProxyHits(cases = []) {
  const hits = new Map();
  const bump = (id) => {
    if (typeof id !== 'string' || !id) return;
    hits.set(id, (hits.get(id) || 0) + 1);
  };
  for (const c of cases) {
    for (const id of c?.expected || []) bump(id);
    for (const id of c?.alsoAcceptable || []) bump(id);
  }
  return hits;
}

/** 缺 capabilities 的判準（與 core/tool-enricher.js 的補齊條件一致） */
export function needsCapabilities(tool) {
  return !Array.isArray(tool?.capabilities) || tool.capabilities.length === 0;
}

/**
 * 選出要補的候選：缺 capabilities、狀態為 active（預設）、且在 hits 內。
 * @returns {{tool: object, hits: number}[]} 依命中次數降冪
 */
export function selectCandidates(tools = [], hits = new Map(), { limit = Infinity, includeExperimental = false } = {}) {
  const out = [];
  for (const tool of tools) {
    if (!tool?.id || !needsCapabilities(tool)) continue;
    if (!includeExperimental && tool.status && tool.status !== 'active') continue;
    const h = hits.get(tool.id) || 0;
    if (h <= 0) continue;
    out.push({ tool, hits: h });
  }
  out.sort((a, b) => b.hits - a.hits || String(a.tool.id).localeCompare(String(b.tool.id)));
  return out.slice(0, limit === Infinity ? undefined : limit);
}

/** 讀遙測 JSONL（不存在＝0 筆真人事件，非錯誤） */
export function readTelemetryEvents(file = TELEMETRY) {
  if (!existsSync(file)) return [];
  const out = [];
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t) continue;
    try { out.push(JSON.parse(t)); } catch { /* 壞行跳過，不讓單行毀掉整批 */ }
  }
  return out;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const num = (k, d) => {
    const i = argv.indexOf(k);
    return i >= 0 && argv[i + 1] ? Number(argv[i + 1]) : d;
  };
  return {
    apply: argv.includes('--apply'),
    proxy: argv.includes('--proxy'),
    includeExperimental: argv.includes('--include-experimental'),
    limit: num('--limit', Infinity),
    delayMs: num('--delay', 1200),
  };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const { loadRegistry, saveRegistry } = await import('../core/registry.js');
  const data = loadRegistry();
  const tools = Array.isArray(data.tools) ? data.tools : [];

  // ① 真人遙測
  const events = readTelemetryEvents();
  let hits = collectTelemetryHits(events);
  let source = `真人遙測（${events.length} 筆事件）`;

  // ② 代理訊號（遙測無命中時才用；必須明示）
  if (hits.size === 0 && opts.proxy) {
    const evalData = JSON.parse(readFileSync(EVAL_QUERIES, 'utf8'));
    hits = collectEvalProxyHits(evalData.cases || []);
    source = `⚠️ 代理訊號：eval-queries expected/alsoAcceptable（非真人使用率）`;
  }

  const missing = tools.filter(needsCapabilities).length;
  const candidates = selectCandidates(tools, hits, {
    limit: opts.limit,
    includeExperimental: opts.includeExperimental,
  });

  console.log(`[enrich-capabilities] 工具庫 ${tools.length} 支、缺 capabilities ${missing} 支`);
  console.log(`[enrich-capabilities] 排序來源：${source}`);
  console.log(`[enrich-capabilities] 候選 ${candidates.length} 支${opts.apply ? '（--apply：將呼叫 LLM）' : '（dry-run，唯讀）'}`);
  for (const { tool, hits: h } of candidates.slice(0, 30)) {
    console.log(`  · ${tool.id} (hits=${h}) ${tool.name || ''}`);
  }
  if (candidates.length > 30) console.log(`  … 其餘 ${candidates.length - 30} 支略`);

  if (!opts.apply) {
    console.log('\n（dry-run 結束；要真的補請加 --apply。建議先小批量 --limit 5 觀察品質。）');
    return;
  }
  if (!candidates.length) {
    console.log('\n沒有候選可補——先累積遙測（見 docs/telemetry-diagnosis-2026-10-15.md）。');
    return;
  }

  // 備份（--apply 才動檔案）
  mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(BACKUP_DIR, `tools-before-capabilities-${stamp}.json`);
  writeFileSync(backupPath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
  console.log(`\n[enrich-capabilities] registry 已備份 → ${path.relative(ROOT, backupPath)}`);

  const { enrichToolFromReadme } = await import('../core/tool-enricher.js');
  let filled = 0;
  let empty = 0;
  for (const { tool } of candidates) {
    try {
      // skipZh：中文欄位只由 translate:zh 產生（見 normalizeEnrichment 註解）
      const patch = await enrichToolFromReadme(tool, { skipZh: true });
      const caps = patch?.capabilities;
      if (Array.isArray(caps) && caps.length && needsCapabilities(tool)) {
        tool.capabilities = caps;
        filled++;
        console.log(`  ✓ ${tool.id} → ${caps.join(', ')}`);
      } else {
        empty++;
        console.log(`  – ${tool.id}：README 無足夠證據，留白（不猜）`);
      }
    } catch (err) {
      empty++;
      console.warn(`  ! ${tool.id} 失敗：${err.message}`);
    }
    if (opts.delayMs > 0) await new Promise((r) => setTimeout(r, opts.delayMs));
  }

  if (filled > 0) {
    saveRegistry(data);
    console.log(`\n[enrich-capabilities] 已寫入 ${filled} 支（留白 ${empty} 支）。`);
    console.log('🔴 自動化只保證「有值」，不保證「值是對的」——請人工核對 capabilities 與 description 同一主題。');
    console.log('🔴 之後跑 npm run translate:zh 才會產生中文欄位；別忘了 npm test。');
  } else {
    console.log('\n[enrich-capabilities] 沒有任何工具取得新 capabilities——registry 未寫入。');
  }
}

const isDirect = typeof process !== 'undefined' && process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirect) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
