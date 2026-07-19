import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 動態安裝工具到臨時目錄
 * @param {object} tool - 工具元資料物件
 * @param {string} baseTempDir - 基礎臨時目錄路徑
 * @returns {string} 安裝的目標目錄
 */
export function installTool(tool, baseTempDir) {
  if (!existsSync(baseTempDir)) {
    mkdirSync(baseTempDir, { recursive: true });
  }

  const targetDir = join(baseTempDir, tool.id);
  
  if (existsSync(targetDir)) {
    console.log(`\x1b[33m提示:\x1b[0m 工具 ${tool.id} 已經安裝在 ${targetDir}，跳過安裝階段。`);
    return targetDir;
  }

  console.log(`\x1b[36m正在安裝工具 ${tool.name} 到臨時目錄...\x1b[0m`);
  console.log(`\x1b[2m目標路徑: ${targetDir}\x1b[0m`);

  const method = tool.install?.method || 'git-clone';

  try {
    switch (method) {
      case 'git-clone': {
        const repoUrl = tool.install?.repoUrl || tool.url;
        const result = spawnSync('git', ['clone', `${repoUrl}.git`, targetDir], { stdio: 'inherit' });
        if (result.status !== 0) throw new Error(`git clone failed for ${repoUrl}`);
        // Sandbox Mode: 不在本機執行 npm install 或 pip install，將其推遲至 invoke 階段的沙盒內執行
        break;
      }
      case 'git-clone-sparse': {
        const repoUrl = tool.install?.repoUrl || tool.url;
        mkdirSync(targetDir, { recursive: true });
        console.log(`\x1b[36m執行 Sparse Checkout，僅下載子目錄: ${tool.install.subpath}...\x1b[0m`);
        
        let result = spawnSync('git', ['clone', '--filter=blob:none', '--no-checkout', `${repoUrl}.git`, '.'], { cwd: targetDir, stdio: 'inherit' });
        if (result.status !== 0) throw new Error('git clone failed for sparse checkout');
        
        result = spawnSync('git', ['sparse-checkout', 'set', tool.install.subpath], { cwd: targetDir, stdio: 'inherit' });
        if (result.status !== 0) throw new Error('git sparse-checkout set failed');
        
        result = spawnSync('git', ['checkout', tool.install.branch || 'main'], { cwd: targetDir, stdio: 'inherit' });
        if (result.status !== 0) throw new Error('git checkout failed');
        
        const subPathDir = join(targetDir, tool.install.subpath);
        // Sandbox Mode: 不在本機安裝依賴
        console.log(`\n\x1b[32m✓ 安裝完成\x1b[0m`);
        return subPathDir;
      }


      case 'npm':
      case 'pip':
      case 'composer':
      case 'cargo':
        mkdirSync(targetDir, { recursive: true });
        // Sandbox Mode: 不在本機執行安裝指令，交由 Sandbox 處理
        break;

      default:
        console.warn(`\x1b[33m警告:\x1b[0m 未知的安裝方式 '${method}'，請嘗試手動安裝。`);
        mkdirSync(targetDir, { recursive: true });
        break;
    }

    console.log(`\n\x1b[32m✓ 安裝完成\x1b[0m`);
    return targetDir;
  } catch (err) {
    throw new Error(`安裝失敗: ${err.message}`);
  }
}
