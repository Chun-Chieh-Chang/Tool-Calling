/**
 * telemetry-endpoint.js — 行為遙測回流（唯寫附加；分析在別處做）
 *
 * 背景：web/behavior-tracker.js 只把行為存在瀏覽器 localStorage，
 * 資料從未回到伺服器。真人查詢語料是本專案最缺的證據
 * （eval-queries.json 的 methodology 欄位明言下一步應收集真人問句），
 * 本模組是回流的最後一哩路。
 *
 * 格式：JSON Lines（一行一事件），附加寫入、不重寫整檔。
 * 位置：web/data/telemetry-events.jsonl（已列入 .gitignore，使用者資料不進版控）。
 * 測試：環境變數 TELEMETRY_DIR 可改寫輸出目錄（每次呼叫時讀取，便於測試隔離）。
 */
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_DIR = join(__dirname, 'data');
const ALLOWED_TYPES = new Set(['search', 'click', 'abandon']);

export function telemetryFilePath() {
  const dir = process.env.TELEMETRY_DIR || DEFAULT_DIR;
  return join(dir, 'telemetry-events.jsonl');
}

/**
 * 驗證並寫入一筆行為事件。
 * @param {object} event - { type, query, timestamp?, toolId?, position? }
 * @returns {{ status: number, body: object }}
 */
export function handleTelemetry(event) {
  if (!event || !ALLOWED_TYPES.has(event.type)) {
    return { status: 400, body: { error: `type 必須是 ${[...ALLOWED_TYPES].join('/')}` } };
  }
  if (typeof event.query !== 'string' || event.query.trim().length === 0) {
    return { status: 400, body: { error: 'query 必須是非空字串' } };
  }
  const clean = {
    type: event.type,
    query: event.query.slice(0, 500),
    timestamp: Number.isFinite(event.timestamp) ? event.timestamp : Date.now(),
  };
  // 搜尋事件的量測欄位：resultCount / duration 是日後做成功率和放棄分析的基礎，
  // 語料一開始就存齊，事後補不回來。形狀不合法一律落到 null（不拒收事件）。
  if (event.type === 'search') {
    clean.resultCount = Number.isFinite(event.resultCount) ? event.resultCount : null;
    clean.topResultId = typeof event.topResultId === 'string' ? event.topResultId.slice(0, 120) : null;
    clean.duration = Number.isFinite(event.duration) ? event.duration : null;
  }
  if (event.type === 'click') {
    if (typeof event.toolId !== 'string' || !event.toolId) {
      return { status: 400, body: { error: 'click 事件需要 toolId' } };
    }
    clean.toolId = event.toolId.slice(0, 120);
    clean.position = Number.isFinite(event.position) ? event.position : null;
  }
  const file = telemetryFilePath();
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(file, JSON.stringify(clean) + '\n', 'utf-8');
  return { status: 200, body: { ok: true } };
}
