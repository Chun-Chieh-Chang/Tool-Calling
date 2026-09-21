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

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { enrichToolFromReadme, isFullyEnriched } from '../core/tool-enricher.js';
import { nextKey, reportSuccess, reportFailure } from '../core/llm-keys.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const REGISTRY = path.join(ROOT, 'registry', 'tools.json');

const args = process.argv.slice(2);
const DRY = args.includes('--dry');
const LIMIT = Number(args.find((a) => a.startsWith('--limit='))?.split('=')[1]) || Infinity;
const IDS = args.find((a) => a.startsWith('--ids='))?.split('=')[1]?.split(',').map((s) => s.trim());
const MODEL = args.find((a) => a.startsWith('--model='))?.split('=')[1];
const CONCURRENCY = Number(process.env.ENRICH_CONCURRENCY || 2);

const reg = JSON.parse(readFileSync(REGISTRY, 'utf8'));
const tools = reg.tools.filter((t) => t.status === 'active' || t.status === 'experimental');

/** 這個工具需要補嗎？ */
function needsEnrich(t) {
  if (!t.advantages || t.advantages.length === 0) return true;
  if (!t.useCase || t.useCase === t.description) return true;
  if (!t.description_zh || !t.useCase_zh) return true;
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
  // 寫入前重讀，避免蓋掉其他程序（例如 sync-daemon）的更新
  const fresh = JSON.parse(readFileSync(REGISTRY, 'utf8'));
  const freshById = new Map(fresh.tools.map((t) => [t.id, t]));
  for (const [id, patch] of applied) {
    const t = freshById.get(id);
    if (t) Object.assign(t, patch);
  }
  writeFileSync(REGISTRY, JSON.stringify(fresh, null, 2));
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
    // 生命週期：補齊完成才升級為 active（與 Web／CLI 共用同一判準）
    if (isFullyEnriched(byId.get(t.id)) && byId.get(t.id).status === 'experimental') {
      merged.status = 'active';
      byId.get(t.id).status = 'active';
      upgraded++;
    }
    applied.set(t.id, merged);
    ok++;
    process.stdout.write('✓');
    if (applied.size % SAVE_EVERY === 0) flush();
  }
}

await Promise.all(Array.from({ length: Math.min(CONCURRENCY, targets.length) }, worker));
flush();

console.log(`\n\n完成：成功 ${ok}／無足夠資訊 ${skip}／失敗 ${fail}`);
console.log(`其中 ${upgraded} 支語意欄位補齊 → 狀態由 experimental 升級為 active`);
console.log(`已寫入 ${REGISTRY}`);
console.log('建議接著執行：npm run validate 與 npm run translate:zh（補齊剩餘 *_zh）');
