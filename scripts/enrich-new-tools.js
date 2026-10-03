#!/usr/bin/env node
/**
 * enrich-new-tools.js — 批次補齊「掃描階段填不出來」的語意欄位
 *
 * 用途
 * ────
 * `scan-tool.js` 只能填機器可得的欄位，語意欄位（useCase／advantages／*_zh）
 * 一律留空或複製 description。本腳本把這些工具找出來，逐一抓 README 後
 * 用 LLM 補齊。
 *
 * 適用時機
 * ────────
 * - 用 UI「加入工具庫」或 `node cli.js add <url>` 之後
 * - 自動探勘批次加入工具之後
 * - 任何時候發現 validate 有 warning（缺 advantages 之類）
 *
 * 判定「需要補」的條件（三者任一成立）
 *   1. 沒有 advantages
 *   2. useCase 為空，或與 description 完全相同（＝掃描階段的複製品）
 *   3. 缺 description_zh 或 useCase_zh
 *
 * 用法
 * ────
 *   AGNES_API_KEY=sk-... node scripts/enrich-new-tools.js --dry
 *   AGNES_API_KEY=sk-... node scripts/enrich-new-tools.js --limit=10
 *   AGNES_API_KEY=sk-... node scripts/enrich-new-tools.js --ids=aircard,zcode
 *   AGNES_API_KEY=sk-... node scripts/enrich-new-tools.js          # 全量
 *
 * 誠實原則
 * ────────
 * README 資訊不足時，`enrichToolFromReadme` 會回傳 null 或部分欄位，
 * 本腳本**不會**為了消 warning 而填入推測內容——寧可維持留白。
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { enrichToolFromReadme } from '../core/tool-enricher.js';
import { activateIfComplete } from '../core/tool-lifecycle.js';
import { loadRegistry, saveRegistry } from '../core/registry.js';
import { nextKey, reportSuccess, reportFailure } from '../core/llm-keys.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const REGISTRY = path.join(ROOT, 'registry', 'tools.json');

const args = process.argv.slice(2);
const DRY = args.includes('--dry');
const LIMIT = Number(args.find((a) => a.startsWith('--limit='))?.split('=')[1]) || Infinity;
const IDS = args.find((a) => a.startsWith('--ids='))?.split('=')[1]?.split(',').map((s) => s.trim());
const MODEL = args.find((a) => a.startsWith('--model='))?.split('=')[1];
// CONCURRENCY 保留為相容別名但不再使用（2026-10-03 起強制序列，見下方）。
// 若未來 TPM 額度放寬，要恢復併發請同時重跑限流實測並更新 HANDOFF 陷阱 21。
// 2026-10-03 限流紀律：API 限制是 TPM，每分鐘 token 數，不是併發數。
// 實測大 prompt 併發 3 即 58% 失敗（見 HANDOFF 陷阱 21），且失敗越多 req/s 越高、
// 極度誤導。本腳本自此強制序列（concurrency=1）；TPM 窗口恢復（60~70 秒）
// 後重跑即可，腳本冪等（只補缺欄、不覆蓋既有），已完成的不會重燒額度。
const EFFECTIVE_CONCURRENCY = 1;

const reg = JSON.parse(readFileSync(REGISTRY, 'utf8'));
const tools = reg.tools.filter((t) => t.status === 'active' || t.status === 'experimental');

/** 這個工具需要補嗎？（2026-10-03 補：negativeConstraints 也是補齊目標；
 * 09-27 佔位樣板清理後，誠實留空的負邊界只能由 enrich 管線依 README 回補，
 * 但此函式此前不認它，導致缺負邊界的工具永遠排不進待補清單。） */
function needsEnrich(t) {
  if (!t.advantages || t.advantages.length === 0) return true;
  if (!t.useCase || t.useCase === t.description) return true;
  if (!t.description_zh || !t.useCase_zh) return true;
  if (!t.negativeConstraints || t.negativeConstraints.length === 0) return true;
  return false;
}

let targets = tools.filter(needsEnrich);
if (IDS) {
  const set = new Set(IDS);
  targets = tools.filter((t) => set.has(t.id));
}
targets = targets.slice(0, LIMIT);

console.log(`\n待補齊：${targets.length} / ${tools.length} 支`);
if (targets.length === 0) { console.log('沒有需要補的工具。'); process.exit(0); }
if (DRY) {
  targets.slice(0, 15).forEach((t) => {
    const why = [];
    if (!t.advantages?.length) why.push('缺 advantages');
    if (!t.useCase || t.useCase === t.description) why.push('useCase 為複製品');
    if (!t.description_zh || !t.useCase_zh) why.push('缺 *_zh');
    if (!t.negativeConstraints?.length) why.push('缺 negativeConstraints');
    console.log(`  ${t.id.padEnd(28)} ${why.join('、')}`);
  });
  if (targets.length > 15) console.log(`  …另有 ${targets.length - 15} 支`);
  process.exit(0);
}

// 乾跑不需要 key；真正要呼叫 LLM 時才檢查
const apiKey = process.env.AGNES_API_KEY;
if (!apiKey) { console.error('\n需要 AGNES_API_KEY（或加 --dry 只看清單）'); process.exit(1); }

const byId = new Map(reg.tools.map((t) => [t.id, t]));
let ok = 0, skip = 0, fail = 0, upgraded = 0, cursor = 0;
const SAVE_EVERY = 10;

function flush() {
  // 寫入前重讀，避免蓋掉其他程序（例如 sync-daemon）的更新。
  // 2026-10-03 起走 saveRegistry 原子寫入（temp+rename），取代直接 writeFileSync，
  // 避免並行測試讀到截斷 JSON（見 HANDOFF 新增陷阱 5）。
  const fresh = loadRegistry();
  const freshById = new Map(fresh.tools.map((t) => [t.id, t]));
  for (const [id, patch] of applied) {
    const t = freshById.get(id);
    if (t) Object.assign(t, patch);
  }
  saveRegistry(fresh);
}

const applied = new Map();

async function worker() {
  while (cursor < targets.length) {
    const t = targets[cursor++];
    const patch = await enrichToolFromReadme(t, { apiKey, model: MODEL });
    if (!patch) { skip++; process.stdout.write('.'); continue; }
    // 只補缺的，不覆蓋既有內容（useCase 例外：複製品要換掉）
    const merged = {};
    for (const [k, v] of Object.entries(patch)) {
      if (k === 'useCase' && t.useCase === t.description) merged[k] = v;
      else if (!t[k] || (Array.isArray(t[k]) && t[k].length === 0)) merged[k] = v;
    }
    if (Object.keys(merged).length === 0) { skip++; process.stdout.write('-'); continue; }
    Object.assign(byId.get(t.id), merged);
    // 生命週期：補齊完成才升級為 active（與 Web／CLI 共用同一實作）。
    // merged 才是落盤的載體（flush() 會重讀磁碟再 Object.assign(patch)），
    // 所以新狀態必須同時記在 merged 上，不只要改記憶體那份。
    if (activateIfComplete(byId.get(t.id))) {
      merged.status = 'active';
      upgraded++;
    }
    applied.set(t.id, merged);
    ok++;
    process.stdout.write('✓');
    if (applied.size % SAVE_EVERY === 0) flush();
  }
}

await Promise.all(Array.from({ length: Math.min(EFFECTIVE_CONCURRENCY, targets.length) }, worker));
flush();

console.log(`\n\n完成：成功 ${ok}／無足夠資訊 ${skip}／失敗 ${fail}`);
console.log(`其中 ${upgraded} 支語意欄位補齊 → 狀態由 experimental 升級為 active`);
console.log(`已寫入 registry/tools.json（經 saveRegistry 原子寫入）`);
console.log('建議接著執行：npm run validate 與 npm run translate:zh（補齊剩餘 *_zh）');
