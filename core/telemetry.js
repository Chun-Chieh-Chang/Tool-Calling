import { appendFileSync, existsSync, mkdirSync, readFileSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const TRACES_DIR = join(homedir(), '.tool-calling', 'traces');
const TRACES_FILE = join(TRACES_DIR, 'traces.jsonl');

/**
 * 確保目錄存在（僅擁有者可存取 0o700）
 */
function ensureDir() {
  if (!existsSync(TRACES_DIR)) {
    mkdirSync(TRACES_DIR, { recursive: true, mode: 0o700 });
  }
}

/**
 * 記錄一次調用軌跡 (Telemetry)
 */
export function recordTrace(toolId, args, exitCode, duration, errorMessage = null) {
  ensureDir();
  
  const trace = {
    timestamp: new Date().toISOString(),
    toolId,
    args: args.length > 0 ? '[REDACTED]' : '', // Privacy Fix: Do not log raw user args
    exitCode,
    success: exitCode === 0,
    duration,
    error: errorMessage
  };

  // 以 0o600 權限寫入（僅擁有者可讀寫），避免明文軌跡被其他使用者讀取
  appendFileSync(TRACES_FILE, JSON.stringify(trace) + '\n', { encoding: 'utf-8', mode: 0o600 });
  // 既有檔案若曾被以寬鬆權限建立，於此補正
  try { chmodSync(TRACES_FILE, 0o600); } catch (e) { /* 檔案可能不存在，忽略 */ }
}

/**
 * 讀取並彙整統計資料
 * 回傳格式: { 'tool-id': { total: 5, success: 3, fail: 2, successRate: 0.6 } }
 */
export function getTelemetryStats() {
  if (!existsSync(TRACES_FILE)) return {};

  const lines = readFileSync(TRACES_FILE, 'utf-8').split('\n').filter(Boolean);
  const stats = {};

  for (const line of lines) {
    try {
      const trace = JSON.parse(line);
      const id = trace.toolId;
      
      if (!stats[id]) {
        stats[id] = { total: 0, success: 0, fail: 0 };
      }
      
      stats[id].total++;
      if (trace.success) {
        stats[id].success++;
      } else {
        stats[id].fail++;
      }
      
      stats[id].successRate = stats[id].success / stats[id].total;
    } catch (e) {
      // 忽略解析錯誤的行
    }
  }
  
  return stats;
}
