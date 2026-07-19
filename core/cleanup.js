import { rmSync, existsSync } from 'node:fs';

/**
 * 清理臨時目錄
 * @param {string} tempDir - 要清理的臨時目錄路徑
 */
export function cleanup(tempDir) {
  if (existsSync(tempDir)) {
    console.log(`\x1b[36m正在清理臨時工具目錄: ${tempDir}...\x1b[0m`);
    try {
      rmSync(tempDir, { recursive: true, force: true });
      console.log(`\x1b[32m✓ 復歸完成，系統已清理乾淨\x1b[0m\n`);
    } catch (err) {
      console.error(`\x1b[31m✗ 清理失敗:\x1b[0m ${err.message}`);
    }
  } else {
    console.log(`\x1b[33m提示:\x1b[0m 臨時目錄不存在，無需清理。\n`);
  }
}
