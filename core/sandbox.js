import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 推斷工具對應的 Docker 映像檔
 */
function getDefaultImage(language) {
  switch (language?.toLowerCase()) {
    case 'python':
      return 'python:3.10-slim';
    case 'typescript':
    case 'javascript':
      return 'node:18-alpine';
    case 'go':
      return 'golang:1.21-alpine';
    case 'rust':
      return 'rust:1.75-slim';
    case 'php':
      return 'php:8.2-cli-alpine';
    default:
      return 'ubuntu:22.04';
  }
}

/**
 * 產生依賴安裝指令 (僅在容器內部執行)
 */
function getSetupCommand(workspacePath, tool) {
  const commands = [];
  
  // 如果工具有明確的安裝指令 (例如 npm install -g ... 或 pip install ...)
  if (tool.install && ['npm', 'pip', 'composer', 'cargo'].includes(tool.install.method)) {
    // 檢查標記檔案避免重複安裝
    const flagFile = join(workspacePath, '.installed');
    if (!existsSync(flagFile)) {
      commands.push(tool.install.command);
      commands.push('touch .installed');
    }
  } else {
    // 傳統的 git clone 專案，檢查依賴清單
    if (existsSync(join(workspacePath, 'package.json'))) {
      if (!existsSync(join(workspacePath, 'node_modules'))) {
        commands.push('npm install');
      }
    }
    
    if (existsSync(join(workspacePath, 'requirements.txt'))) {
      const flagFile = join(workspacePath, '.pip_installed');
      if (!existsSync(flagFile)) {
        commands.push('pip install -r requirements.txt --no-cache-dir');
        commands.push('touch .pip_installed');
      }
    }
  }
  
  return commands.length > 0 ? commands.join(' && ') + ' && ' : '';
}

/**
 * 在 Sandbox 中安全調用工具
 * @param {object} tool 
 * @param {string} targetDir 
 * @param {string[]} args 
 */
export function invokeInSandbox(tool, targetDir, args) {
  const image = tool.sandbox?.image || getDefaultImage(tool.language);
  
  console.log(`\x1b[36m[Sandbox]\x1b[0m 正在準備容器環境: ${image}`);
  
  const setupCmd = getSetupCommand(targetDir, tool);
  const userCmd = args.join(' ');
  const finalCmd = `${setupCmd}${userCmd || 'echo "No command provided"'}`;
  
  // Docker 掛載指令
  // 處理 Windows 路徑，需轉為 Docker 能接受的格式 (通常 docker run 在 Win 也能接受 C:\... 但保險起見直接用 targetDir)
  const mountPath = targetDir.replace(/\\/g, '/');
  
  const dockerCmd = `docker run --rm -v "${mountPath}:/workspace" -w /workspace ${image} sh -c "${finalCmd}"`;
  
  console.log(`\x1b[36m[Sandbox]\x1b[0m 啟動隔離執行: ${userCmd}`);
  
  try {
    const startTime = Date.now();
    // 使用 stdio: 'inherit' 直接將容器的輸出串流到本機終端機
    execSync(dockerCmd, { stdio: 'inherit' });
    const duration = Date.now() - startTime;
    console.log(`\n\x1b[32m✓ 執行完畢\x1b[0m (耗時 ${duration}ms)`);
    return { exitCode: 0, duration };
  } catch (error) {
    console.log(`\n\x1b[31m✗ 執行失敗\x1b[0m (Exit Code: ${error.status})`);
    return { exitCode: error.status || 1, duration: 0, error: error.message };
  }
}
