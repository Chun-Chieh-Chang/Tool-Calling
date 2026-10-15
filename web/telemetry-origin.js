/**
 * telemetry-origin.js — 遙測端點的來源判定與 CORS 標頭（2026-10-15 Q2=A）
 *
 * 為什麼存在：診斷「真人遙測 0 筆」時發現兩個結構性斷點——
 *   ① 公開可見的 GitHub Pages 是靜態站，根本沒有 /api/telemetry
 *      （Pages 訪客的 fetch 全部 404、靜默失敗）；
 *   ② 即使想讓 Pages 中繼到 live 工作台，`isTrustedOrigin` 只信同源，
 *      且伺服器沒有 OPTIONS preflight 處理，跨域一律被擋。
 *
 * 本模組把「同源信任」與「顯式 allowlist」合成單一判定，讓 Pages 可以在
 * 嚴格把關下中繼遙測。從 web/server.js 抽出是為了可測——server.js 匯入即
 * listen()，無法在測試裡直接 import。
 *
 * 安全邊界（與 Strix 修掉的 CWE-346 同一思路）：
 *   · allowlist 預設為空 → 行為與 2026-10-14 發佈時完全一致（只有同源可信）。
 *   · 無 Origin 的直連（curl）維持開放——遙測只寫 JSONL，無副作用放大。
 *   · allowlist 只放行「明確列出的來源」，不接受萬用字元。
 */

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/**
 * 解析逗號分隔的 allowlist（env TELEMETRY_ALLOWED_ORIGINS）。
 * 尾斜線會去掉，空項過濾；不含萬用字元（有意為之）。
 */
export function parseAllowedOrigins(raw) {
  return String(raw || '')
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean);
}

/** 同源信任：Origin 的 host 必須等於 Host 或 X-Forwarded-Host（server.js 同語意） */
export function isSameOriginTrusted(origin, hostHeader, xForwardedHost) {
  try {
    const { host } = new URL(origin);
    return !!host && (host === hostHeader || (!!xForwardedHost && host === xForwardedHost));
  } catch {
    return false;
  }
}

/**
 * allowlist 比對：項可以是完整 origin（`https://x.github.io`，路徑無關——
 * origin 語意本就不含路徑）或 bare host（`x.github.io`，任何 scheme 皆符）。
 */
function originInAllowlist(origin, host, allowedOrigins) {
  return allowedOrigins.some((a) => {
    if (a === origin || a === host) return true;
    try {
      const u = new URL(a);
      return u.origin === origin || u.host === host;
    } catch {
      return false; // allowlist 裡的畸形項一律不匹配（不萬用）
    }
  });
}

/**
 * 遙測寫入來源判定。
 * @param {string|undefined} origin - req.headers.origin
 * @returns {boolean} true＝允許寫入
 */
export function isTelemetryOrigin(origin, { hostHeader, xForwardedHost, allowedOrigins = [] } = {}) {
  if (!origin) return true; // 無 Origin（curl／非瀏覽器）維持開放
  let hostname;
  let host;
  try {
    ({ hostname, host } = new URL(origin));
  } catch {
    return false; // 畸形 Origin 一律拒絕
  }
  if (LOCAL_HOSTS.has(hostname)) return true;
  if (isSameOriginTrusted(origin, hostHeader, xForwardedHost)) return true;
  return originInAllowlist(origin, host, allowedOrigins);
}

/**
 * 跨域（allowlist）所需的 CORS 標頭；非 allowlist 來源回空物件。
 * 同源請求由瀏覽器自然放行，不需要 ACAO，因此本地／同源一律回空——
 * 這樣 allowlist 語意只有一個出口，不會有「多一條路繞過把關」。
 */
export function telemetryCorsHeaders(origin, allowedOrigins = []) {
  if (!origin) return {};
  let hostname;
  let host;
  try {
    ({ hostname, host } = new URL(origin));
  } catch {
    return {};
  }
  if (LOCAL_HOSTS.has(hostname)) return {};
  if (!originInAllowlist(origin, host, allowedOrigins)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    Vary: 'Origin',
    'Access-Control-Allow-Methods': 'POST',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}
