#!/usr/bin/env node
/**
 * llm-keys.js — API 金鑰池（輪替 + 429 隔離 + 統計）
 *
 * 能不能靠多把金鑰解決限流？
 * ─────────────────────────
 * **只有在「限制是 per-key」時才有效。** 三種常見情況：
 *
 *   1. 限制綁定在金鑰上（多數聚合型 API 平臺）→ 多把金鑰**線性放大**吞吐量。
 *   2. 限制綁定在帳號上 → 同一帳號下的多把金鑰**完全沒用**。
 *   3. 限制綁定在 IP 上 → 同一台機器發出請求，**完全沒用**。
 *
 * 本專案無法事先知道是哪一種，**只能實測**。
 * 因此這個模組除了做輪替，也記錄每把金鑰的成功／429／失敗次數，
 * 配合 `scripts/llm-throughput.js` 就能用數據回答「加金鑰有沒有用」。
 *
 * 設計
 * ────
 *   - 輪替：round-robin，避免單把金鑰被集中打爆
 *   - 隔離：收到 429 的金鑰暫時停用（QUARANTINE_MS），期間改用別把
 *   - 全數隔離時：退回「最快解禁的那把」並由呼叫端退避（不會無金鑰可用）
 *   - 統計：每次成功／失敗都記數，供診斷
 *
 * 設定
 * ────
 *   AGNES_API_KEYS=key1,key2,key3   # 多把（逗號分隔）
 *   AGNES_API_KEY=key1              # 單把（向後相容）
 *
 * 離線安全：沒有任何金鑰時 `nextKey()` 回傳 null，呼叫端照原邏輯停用 LLM 功能。
 */

const QUARANTINE_MS = Number(process.env.LLM_KEY_QUARANTINE_MS || 60000);

let pool = null;
let cursor = 0;

function initPool() {
  const raw = process.env.AGNES_API_KEYS || process.env.AGNES_API_KEY || '';
  const keys = String(raw)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  // 同一把金鑰重複出現沒有意義，去掉
  pool = [...new Set(keys)].map((k) => ({
    key: k,
    label: `key_${mask(k)}`,
    ok: 0,
    fail: 0,
    status429: 0,
    quarantinedUntil: 0,
  }));
  cursor = 0;
  return pool;
}

function mask(k) {
  const s = String(k || '');
  return s.length <= 8 ? '***' : `${s.slice(0, 4)}…${s.slice(-4)}`;
}

/** 取得金鑰池（必要時初始化） */
export function getKeyPool() {
  return pool || initPool();
}

/** 目前可用（未被隔離）的金鑰數 */
export function availableCount() {
  const now = Date.now();
  return getKeyPool().filter((e) => e.quarantinedUntil <= now).length;
}

/**
 * 取下一把可用金鑰。
 * @returns {string|null} 沒有金鑰時回傳 null（呼叫端應停用 LLM 功能）
 */
export function nextKey() {
  const p = getKeyPool();
  if (p.length === 0) return null;
  const now = Date.now();
  for (let i = 0; i < p.length; i++) {
    const idx = (cursor + i) % p.length;
    if (p[idx].quarantinedUntil <= now) {
      cursor = (idx + 1) % p.length;
      return p[idx].key;
    }
  }
  // 全部被隔離：退回最快解禁的那把（讓呼叫端決定要不要等）
  const soonest = p.reduce((a, b) => (a.quarantinedUntil <= b.quarantinedUntil ? a : b));
  return soonest.key;
}

/** 回傳下一次有金鑰可用的等待毫秒數（全部隔離時 > 0） */
export function nextAvailableDelayMs() {
  const p = getKeyPool();
  if (p.length === 0) return 0;
  const now = Date.now();
  const min = Math.min(...p.map((e) => e.quarantinedUntil));
  return Math.max(0, min - now);
}

export function reportSuccess(key) {
  const e = getKeyPool().find((x) => x.key === key);
  if (e) e.ok++;
}

/**
 * 回報失敗。429 會把該金鑰隔離一段時間。
 * @param {string} key
 * @param {number|string} status - HTTP 狀態碼（或 'timeout' / 'network'）
 */
export function reportFailure(key, status) {
  const e = getKeyPool().find((x) => x.key === key);
  if (!e) return;
  e.fail++;
  if (Number(status) === 429) {
    e.status429++;
    e.quarantinedUntil = Date.now() + QUARANTINE_MS;
  }
}

/** 統計快照（供診斷與實測） */
export function keyStats() {
  const p = getKeyPool();
  return {
    total: p.length,
    available: availableCount(),
    keys: p.map((e) => ({
      label: e.label,
      ok: e.ok,
      fail: e.fail,
      status429: e.status429,
      quarantined: e.quarantinedUntil > Date.now(),
    })),
  };
}

/** 測試用：重置金鑰池（重新讀取環境變數） */
export function resetKeyPool() {
  pool = null;
  cursor = 0;
  return initPool();
}
