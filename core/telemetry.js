import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const TRACES_DIR = join(homedir(), '.tool-calling', 'traces');
const TRACES_FILE = join(TRACES_DIR, 'traces.jsonl');

/**
 * 確保目錄存在
 */
function ensureDir() {
  if (!existsSync(TRACES_DIR)) {
    mkdirSync(TRACES_DIR, { recursive: true });
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
    args: args.join(' '),
    exitCode,
    success: exitCode === 0,
    duration,
    error: errorMessage
  };

  appendFileSync(TRACES_FILE, JSON.stringify(trace) + '\n', 'utf-8');
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
