#!/usr/bin/env node

/**
 * 工具新增後的自動分類重構 Hook
 * 
 * 用途：當有新的工具被加入到工具庫後，自動觸發全盤分類檢討
 * 執行方式：在 cli.js 的 add/batch-add 命令結束後調用此腳本
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = import.meta.dirname;
const ROOT = join(__dirname, '..');
const REGISTRY_PATH = join(ROOT, 'registry', 'tools.json');
const HOOK_LOG_PATH = join(ROOT, '.agnes', 'hooks', 'reclassify-log.json');

// ─── ANSI 顏色 ─────────────────────────────────────────────────────────────
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
};

function log(msg, color = 'white') {
  console.log(`${c[color]}${msg}${c.reset}`);
}

// ─── 主要執行函式 ─────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const mode = args[0] || 'auto'; // 'auto' | 'force' | 'check'
  
  log('\n╔══════════════════════════════════════════════════════════╗', 'cyan');
  log('║      工具分類自動重構系統 (MECE Compliance Hook)        ║', 'cyan');
  log('╚══════════════════════════════════════════════════════════╝', 'cyan');
  
  // 檢查註冊表是否存在
  if (!existsSync(REGISTRY_PATH)) {
    log('錯誤：找不到工具註冊表 ' + REGISTRY_PATH, 'red');
    process.exit(1);
  }
  
  // 讀取當前狀態
  const registry = JSON.parse(readFileSync(REGISTRY_PATH, 'utf8'));
  const totalTools = registry.tools.length;
  
  log(`📊 當前工具庫：${totalTools} 個工具`, 'blue');
  
  // 執行分類重構
  try {
    // 動態載入分類腳本
    const { reclassifyAllTools } = await import('./reclassify-tools.js');
    const result = await reclassifyAllTools();
    
    // 記錄執行日誌
    const logEntry = {
      timestamp: new Date().toISOString(),
      mode,
      totalTools: result.total,
      changed: result.changed,
      oldStats: result.oldStats,
      newStats: result.newStats
    };
    
    // 確保 .agnes/hooks 目錄存在
    const hooksDir = join(ROOT, '.agnes', 'hooks');
    if (!existsSync(hooksDir)) {
      const { mkdirSync } = await import('node:fs');
      mkdirSync(hooksDir, { recursive: true });
    }
    
    // 寫入日誌
    writeFileSync(HOOK_LOG_PATH, JSON.stringify(logEntry, null, 2), 'utf8');
    
    log(`✅ 分類重構完成！已記錄到 ${HOOK_LOG_PATH}`, 'green');
    
    // 提示後續操作
    if (result.changed > 0) {
      log(`\n💡 建議：請執行 git diff 查看變更，然後提交：`, 'yellow');
      log('   git add registry/tools.json', 'dim');
      log('   git commit -m "refactor: auto reclassify tools (MECE)"', 'dim');
    }
    
  } catch (err) {
    log(`❌ 分類重構失敗：${err.message}`, 'red');
    log(err.stack, 'dim');
    process.exit(1);
  }
}

// ─── 入口 ────────────────────────────────────────────────────────────────

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch(err => {
    log(`未預期的錯誤：${err.message}`, 'red');
    process.exit(1);
  });
}

export { main };