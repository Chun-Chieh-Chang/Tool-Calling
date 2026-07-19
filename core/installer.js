import { execSync } from 'node:child_process';
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
  let command = '';

  try {
    switch (method) {
      case 'git-clone':
        command = `git clone ${tool.install?.repoUrl || tool.url}.git "${targetDir}"`;
        execSync(command, { stdio: 'inherit' });
        // 若有 package.json，自動 npm install
        if (existsSync(join(targetDir, 'package.json'))) {
          console.log(`\x1b[36m偵測到 package.json，執行 npm install...\x1b[0m`);
          execSync('npm install', { cwd: targetDir, stdio: 'inherit' });
        }
        // 若有 requirements.txt，自動 pip install
        if (existsSync(join(targetDir, 'requirements.txt'))) {
          console.log(`\x1b[36m偵測到 requirements.txt，執行 pip install...\x1b[0m`);
          execSync('pip install -r requirements.txt', { cwd: targetDir, stdio: 'inherit' });
        }
        break;
      case 'git-clone-sparse':
        mkdirSync(targetDir, { recursive: true });
        console.log(`\x1b[36m執行 Sparse Checkout，僅下載子目錄: ${tool.install.subpath}...\x1b[0m`);
        execSync(`git clone --filter=blob:none --no-checkout ${tool.install?.repoUrl || tool.url}.git .`, { cwd: targetDir, stdio: 'inherit' });
        execSync(`git sparse-checkout set ${tool.install.subpath}`, { cwd: targetDir, stdio: 'inherit' });
        execSync(`git checkout ${tool.install.branch || 'main'}`, { cwd: targetDir, stdio: 'inherit' });
        
        const subPathDir = join(targetDir, tool.install.subpath);
        // 若有 package.json，自動 npm install
        if (existsSync(join(subPathDir, 'package.json'))) {
          console.log(`\x1b[36m偵測到 package.json，執行 npm install...\x1b[0m`);
          execSync('npm install', { cwd: subPathDir, stdio: 'inherit' });
        }
        // 若有 requirements.txt，自動 pip install
        if (existsSync(join(subPathDir, 'requirements.txt'))) {
          console.log(`\x1b[36m偵測到 requirements.txt，執行 pip install...\x1b[0m`);
          execSync('pip install -r requirements.txt', { cwd: subPathDir, stdio: 'inherit' });
        }
        console.log(`\n\x1b[32m✓ 安裝完成\x1b[0m`);
        return subPathDir;


      case 'npm':
        // 建立空的 package.json 然後安裝
        mkdirSync(targetDir, { recursive: true });
        execSync('npm init -y', { cwd: targetDir, stdio: 'ignore' });
        command = tool.install.command;
        execSync(command, { cwd: targetDir, stdio: 'inherit' });
        break;

      case 'pip':
      case 'composer':
      case 'cargo':
        mkdirSync(targetDir, { recursive: true });
        command = tool.install.command;
        execSync(command, { cwd: targetDir, stdio: 'inherit' });
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
