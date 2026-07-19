import { rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 清理臨時目錄
 * @param {string} tempDir - 要清理的臨時目錄路徑
 * @param {string} [toolId] - 指定要清理的工具 ID (選填)
 */
export function cleanup(tempDir, toolId) {
  if (toolId && (toolId.includes('..') || toolId.includes('/') || toolId.includes('\\'))) {
    throw new Error('Invalid tool ID: Path traversal detected.');
  }
  
  const targetDir = toolId ? join(tempDir, toolId) : tempDir;

  if (existsSync(targetDir)) {
    console.log(`\x1b[36m正在清理臨時工具目錄: ${targetDir}...\x1b[0m`);
    try {
      rmSync(targetDir, { recursive: true, force: true });
      console.log(`\x1b[32m✓ 復歸完成，已清理: ${toolId || '全部工具'}\x1b[0m\n`);
    } catch (err) {
      console.error(`\x1b[31m✗ 清理失敗:\x1b[0m ${err.message}`);
    }
  } else {
    console.log(`\x1b[33m提示:\x1b[0m 目標目錄不存在，無需清理。\n`);
  }
}
