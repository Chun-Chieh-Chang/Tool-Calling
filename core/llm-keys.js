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
 * 本專案**已經實測過了**（2026-09-20，同一端點 apihub.agnes-ai.com 的兩把金鑰）：
 *
 *   1 把 → 成功 23/40、429 共 17 次
 *   2 把 → 成功 23/40、429 共 17 次（各分到 8、9 次）
 *
 *   **成功數完全相同** → 這個端點的額度是**帳號／IP 共享**，
 *   **加金鑰對本專案沒有效果**。輪替只是把失敗平均分攤到各把金鑰上。
 *
 * ⚠️ 因此不要期待靠加金鑰來加速本專案的批次作業。
 *    若要加速，唯一有效的方向是**降低每次請求的 token 數**
 *    （例如減少 rerank 的候選數或描述長度），或換供應商。
 *
 * 模組仍然保留：換到「限制綁金鑰」的供應商時會立刻有用，
 * 且統計功能可作為一般的診斷工具。
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
// 執行期注入的金鑰（由 UI 輸入）。**只存在記憶體**，不寫入磁碟、不進版控。
// 伺服器重啟後消失——要持久化請設環境變數 AGNES_API_KEY / AGNES_API_KEYS。
let runtimeKeys = [];

function initPool() {
  const raw = process.env.AGNES_API_KEYS || process.env.AGNES_API_KEY || '';
  const envKeys = String(raw)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  // 同一把金鑰重複出現沒有意義，去掉；環境變數優先，其次才是執行期注入的
  pool = [...new Set([...envKeys, ...runtimeKeys])].map((k) => ({
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

/**
 * 由 UI 注入金鑰（執行期，僅記憶體）
 *
 * 為什麼需要：使用者不一定會在啟動伺服器時就設好環境變數，
 * 但「加入工具後背景補齊語意欄位」需要 LLM。與其要他們重啟伺服器，
 * 不如在 UI 上提示輸入。
 *
 * ⚠️ 安全設計：
 *   - 只存記憶體，不落地（重啟即失效）
 *   - 不寫 log、不回傳完整金鑰（狀態查詢只回遮罩後的標籤）
 *   - 端點仍受 isTrustedOrigin 保護
 *
 * @param {string|string[]} keys - 逗號分隔字串或字串陣列
 * @returns {{added:number, total:number}}
 */
export function setRuntimeKeys(keys) {
  const list = (Array.isArray(keys) ? keys : String(keys || '').split(','))
    .map((s) => String(s).trim())
    .filter(Boolean);
  const before = getKeyPool().length;
  runtimeKeys = [...new Set([...runtimeKeys, ...list])];
  initPool();
  return { added: pool.length - before, total: pool.length };
}

/**
 * 金鑰狀態（給 UI 判斷是否要提示輸入）
 * @returns {{configured:boolean, count:number, available:number, labels:string[], source:string}}
 */
export function getKeyStatus() {
  const p = getKeyPool();
  const envRaw = process.env.AGNES_API_KEYS || process.env.AGNES_API_KEY || '';
  const envCount = envRaw ? new Set(String(envRaw).split(',').map((s) => s.trim()).filter(Boolean)).size : 0;
  return {
    configured: p.length > 0,
    count: p.length,
    available: availableCount(),
    labels: p.map((e) => e.label),
    // 讓 UI 知道金鑰是「環境變數」還是「本次工作階段輸入的」——
    // 後者重啟後會消失，值得提醒使用者
    source: envCount === 0 ? 'runtime' : (runtimeKeys.length > 0 ? 'env+runtime' : 'env'),
  };
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
  runtimeKeys = [];   // 重設＝連執行期注入的一起清掉
  return initPool();
}
