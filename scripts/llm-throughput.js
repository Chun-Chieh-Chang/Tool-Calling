#!/usr/bin/env node
/**
 * llm-throughput.js — 實測「多把金鑰能不能解決限流」
 *
 * 為什麼要量，不能直接用常識判斷
 * ──────────────────────────────
 * 多把金鑰只有在「限制綁定在金鑰上」時才有用：
 *   綁金鑰 → 多把金鑰線性放大吞吐量 ✅
 *   綁帳號 → 同一帳號下的多把金鑰完全無效 ❌
 *   綁 IP  → 同一台機器發請求，完全無效 ❌
 * 事先無法知道是哪一種，只能打一輪看 429 的分布。
 *
 * 怎麼讀結果
 * ──────────
 *   - 「429 次數」很高 → 確實被限流，這時加金鑰才可能有效
 *   - 加了金鑰後「每秒請求數」等比例上升 → 限制是綁金鑰的（值得加）
 *   - 加了金鑰後吞吐量**沒變** → 限制綁帳號或 IP（加金鑰白搭，
 *     該改的是降低併發或換供應商）
 *   - 429 次數本來就接近 0 → 你根本沒被限流，瓶頸是**單次延遲**；
 *     這時該提高併發，而不是加金鑰
 *
 * 用法
 * ────
 *   AGNES_API_KEY=sk-... node scripts/llm-throughput.js
 *   AGNES_API_KEYS=k1,k2,k3 node scripts/llm-throughput.js --concurrency=6
 *   node scripts/llm-throughput.js --requests=40 --concurrency=8
 */

import { nextKey, reportSuccess, reportFailure, keyStats, resetKeyPool } from '../core/llm-keys.js';

const args = process.argv.slice(2);
const REQUESTS = Number(args.find((a) => a.startsWith('--requests='))?.split('=')[1]) || 20;
const CONCURRENCY = Number(args.find((a) => a.startsWith('--concurrency='))?.split('=')[1]) || 4;
const MODEL = args.find((a) => a.startsWith('--model='))?.split('=')[1] || 'agnes-2.5-flash';
const API_BASE = (process.env.LLM_API_BASE || 'https://apihub.agnes-ai.com/v1').replace(/\/$/, '');
const TIMEOUT_MS = Number(args.find((a) => a.startsWith('--timeout='))?.split('=')[1]) || 30000;

resetKeyPool();
const stats = keyStats();
if (stats.total === 0) {
  console.error('沒有金鑰。請設定 AGNES_API_KEY 或 AGNES_API_KEYS（逗號分隔）。');
  process.exit(1);
}

console.log(`\n═══ LLM 吞吐量實測 ═══`);
console.log(`請求數 ${REQUESTS}　併發 ${CONCURRENCY}　模型 ${MODEL}`);
console.log(`金鑰數 ${stats.total}（可用 ${stats.available}）\n`);

// 🔴 這裡刻意用**極短請求**：只想量「併發／請求數」維度的限流行為。
//    但實測發現真實限制是 **TPM（每分鐘 token 數）**——
//    短請求在併發 4 下 0 次 429，真實 prompt（2 萬字）在併發 3 下卻有 58% 失敗。
//    → 本腳本的結果**不能直接外推到真實 payload**。
//      若要模擬真實情境，用 --big 打一個接近真實長度的 prompt。
const BIG = args.includes('--big');
const PAYLOAD = {
  model: MODEL,
  messages: [{
    role: 'user',
    content: BIG
      // 約 2 萬字，接近 rerank 實際 prompt（50 候選 × 550 字）
      ? `以下是 50 個工具的描述，請只回覆 OK 兩個字。\n${'這是一段用來逼近真實 prompt 長度的填充文字，內含工具描述、適用情境、能力與優勢等欄位。'.repeat(400)}`
      : '回覆 OK 兩個字，不要其他內容。',
  }],
  temperature: 0,
  max_tokens: 5,
};

let done = 0;
let ok = 0;
let rate429 = 0;
let otherFail = 0;
const latencies = [];

async function oneRequest() {
  const key = nextKey();
  if (!key) { otherFail++; return; }
  const t0 = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${API_BASE}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify(PAYLOAD),
      signal: controller.signal,
    });
    if (res.ok) {
      await res.text(); // 讀掉 body，避免連線佔用
      reportSuccess(key);
      ok++;
      latencies.push(Date.now() - t0);
    } else {
      reportFailure(key, res.status);
      if (res.status === 429) rate429++; else otherFail++;
    }
  } catch {
    reportFailure(key, 'network');
    otherFail++;
  } finally {
    clearTimeout(timer);
    done++;
    process.stdout.write(`\r  進度 ${done}/${REQUESTS}`);
  }
}

const wall0 = Date.now();
const queue = Array.from({ length: REQUESTS }, () => null);
let cursor = 0;
async function worker() {
  while (cursor < queue.length) {
    const i = cursor++;
    if (i === undefined || i >= queue.length) break;
    await oneRequest();
  }
}
await Promise.all(Array.from({ length: Math.min(CONCURRENCY, REQUESTS) }, worker));
const wallMs = Date.now() - wall0;

latencies.sort((a, b) => a - b);
const pctl = (p) => (latencies.length ? latencies[Math.floor(latencies.length * p)] : 0);
const rps = (REQUESTS / (wallMs / 1000)).toFixed(2);

console.log(`\n\n  成功         : ${ok}/${REQUESTS}  (${(ok / REQUESTS * 100).toFixed(1)}%)`);
console.log(`  429 限流     : ${rate429}`);
console.log(`  其他失敗     : ${otherFail}`);
console.log(`  總耗時       : ${(wallMs / 1000).toFixed(1)}s`);
console.log(`  吞吐         : ${rps} req/s`);
console.log(`  單次延遲     : 中位 ${pctl(0.5)}ms　p90 ${pctl(0.9)}ms`);

console.log(`\n  各金鑰統計：`);
for (const k of keyStats().keys) {
  console.log(`    ${k.label}　成功 ${k.ok}　失敗 ${k.fail}　429 ${k.status429}${k.quarantined ? '　(已隔離)' : ''}`);
}

console.log(`\n  判讀：`);
console.log(`  🔴 唯一可信的指標是「成功數」，**不要看吞吐（req/s）**——`);
console.log(`     429 會瞬間失敗，失敗越多 req/s 反而越高，極度誤導。`);
if (rate429 === 0 && otherFail === 0) {
  console.log(`\n    ✅ 完全沒被限流（額度充足）。瓶頸是單次延遲（中位 ${pctl(0.5)}ms）。`);
  console.log(`       加金鑰不會更快 —— 要提高速度請加大 --concurrency（直到出現 429）。`);
} else if (rate429 > 0) {
  console.log(`\n    ⚠️ 有 ${rate429} 次 429，確實被限流。本次成功 ${ok}/${REQUESTS}。`);
  console.log(`\n    【如何判斷加金鑰有沒有用】`);
  console.log(`      1. 記下本次的「成功數 ${ok}」`);
  console.log(`      2. 等 90~120 秒讓額度窗重置，用多把金鑰重跑**完全相同**的設定：`);
  console.log(`         AGNES_API_KEYS=k1,k2 node scripts/llm-throughput.js --big --requests=${REQUESTS} --concurrency=${CONCURRENCY}`);
  console.log(`      3. 比較「成功數」：`);
  console.log(`         明顯上升（約等比例）→ 限制綁金鑰 ✅ 加金鑰有效`);
  console.log(`         幾乎相同         → 限制綁帳號或 IP ❌ 加金鑰無效，別花錢`);
  console.log(`\n    📌 2026-09-20 已在本專案的端點實測過（同一端點的兩把金鑰）：`);
  console.log(`         1 把 → 成功 23/40、429 共 17 次`);
  console.log(`         2 把 → 成功 23/40、429 共 17 次（k1 8 次 + k2 9 次）`);
  console.log(`         **成功數完全相同** → 額度是帳號／IP 共享，**加金鑰無效**。`);
} else {
  console.log(`\n    ⚠️ 失敗都不是 429（可能是逾時或網路）。`);
  console.log(`       這不是限流問題，加金鑰沒用，請檢查 timeout／網路。`);
}
console.log();
