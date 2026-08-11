/**
 * @module core/sandbox
 * Shared sandbox execution module.
 *   invokeInSandbox()     — CLI mode: inherits stdio for interactive output
 *   invokeInSandboxCapture() — MCP/server mode: captures stdout/stderr via pipe
 */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * POSIX shell escape — 將單一引數用單引號包裹，防止 shell 元字元注入。
 * 內部的單引號以 '\'' 跳脫（結束引號 → 跳脫單引號 → 重新開啟引號）。
 * @param {string} arg
 * @returns {string}
 */
function shellEscape(arg) {
  if (arg === '') return "''";
  return "'" + arg.replace(/'/g, "'\\''") + "'";
}

/**
 * 安裝指令白名單前綴驗證。
 * 僅允許已知安全的套件管理器指令，拒絕任意 shell 命令。
 * @param {string} cmd - 來自 tool.install.command 的安裝指令
 * @returns {string} 驗證通過的原始指令
 * @throws {Error} 若指令不在白名單中
 */
const ALLOWED_INSTALL_PREFIXES = [
  'npm install',
  'npm i ',
  'npm ci',
  'npx ',
  'pip install',
  'pip3 install',
  'composer require',
  'composer install',
  'cargo install',
  'cargo build',
  'git clone',
  'go install',
  'go get',
];

function validateInstallCommand(cmd) {
  if (!cmd || typeof cmd !== 'string') {
    throw new Error('[Sandbox 安全] install.command 為空或非字串');
  }
  const trimmed = cmd.trim();
  const isAllowed = ALLOWED_INSTALL_PREFIXES.some(prefix => trimmed.startsWith(prefix));
  if (!isAllowed) {
    throw new Error(
      `[Sandbox 安全] install.command 被拒絕：「${trimmed}」不在白名單中。` +
      `\n允許的前綴: ${ALLOWED_INSTALL_PREFIXES.join(', ')}`
    );
  }
  return trimmed;
}

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
      commands.push(validateInstallCommand(tool.install.command));
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
const allowedImages = [
  'python:3.10-slim',
  'node:18-alpine',
  'golang:1.21-alpine',
  'rust:1.75-slim',
  'php:8.2-cli-alpine',
  'ubuntu:22.04'
];

const SANDBOX_PROFILES = {
  'safe-offline': {
    name: 'safe-offline',
    dockerNetwork: 'none',
    allowsNetwork: false
  },
  'networked-runtime': {
    name: 'networked-runtime',
    dockerNetwork: 'bridge',
    allowsNetwork: true
  }
};

export function resolveSandboxProfile(tool = {}) {
  const requestedProfile = tool.sandbox?.profile || 'safe-offline';
  return SANDBOX_PROFILES[requestedProfile] || SANDBOX_PROFILES['safe-offline'];
}

function resolveImage(tool) {
  let image = tool.sandbox?.image || getDefaultImage(tool.language);
  if (!allowedImages.includes(image)) {
    console.warn(`\x1b[33m警告:\x1b[0m 映像檔 ${image} 不在白名單中，退回預設映像檔 ubuntu:22.04`);
    image = 'ubuntu:22.04';
  }
  return image;
}

export function buildDockerArgs(tool, targetDir, args) {
  const image = resolveImage(tool);
  const profile = resolveSandboxProfile(tool);
  const setupCmd = getSetupCommand(targetDir, tool);
  const userCmd = args.length > 0 ? args.map(shellEscape).join(' ') : '';
  const finalCmd = `${setupCmd}${userCmd || 'echo "No command provided"'}`;
  const mountPath = targetDir.replace(/\\/g, '/');

  const dockerArgs = [
    'run', '--rm',
    '-v', `${mountPath}:/workspace`,
    '-w', '/workspace',
    '--network', profile.dockerNetwork,
    '--read-only',
    '--tmpfs', '/tmp',
    '--env', 'HOME=/tmp',
    '--cap-drop', 'ALL',
    '--user', '1000:1000',
    '--memory=512m',
    '--cpus=1',
    image,
    'sh', '-c', finalCmd
  ];

  return { image, dockerArgs, userCmd };
}

export function invokeInSandbox(tool, targetDir, args) {
  const { image, dockerArgs, userCmd } = buildDockerArgs(tool, targetDir, args);

  console.log(`\x1b[36m[Sandbox]\x1b[0m 正在準備容器環境: ${image}`);
  console.log(`\x1b[36m[Sandbox]\x1b[0m 啟動隔離執行: ${userCmd}`);
  
  try {
    const startTime = Date.now();
    const result = spawnSync('docker', dockerArgs, { stdio: 'inherit' });
    const duration = Date.now() - startTime;

    if (result.error) {
      throw result.error;
    }
    
    if (result.status !== 0) {
      console.log(`\n\x1b[31m✗ 執行失敗\x1b[0m (Exit Code: ${result.status})`);
      return { exitCode: result.status || 1, duration, error: `Command failed with exit code ${result.status}` };
    }

    console.log(`\n\x1b[32m✓ 執行完畢\x1b[0m (耗時 ${duration}ms)`);
    return { exitCode: 0, duration };
  } catch (error) {
    console.log(`\n\x1b[31m✗ 執行異常\x1b[0m: ${error.message}`);
    return { exitCode: 1, duration: 0, error: error.message };
  }
}

export function invokeInSandboxCapture(tool, targetDir, args) {
  const { image, dockerArgs, userCmd } = buildDockerArgs(tool, targetDir, args);
  const startTime = Date.now();

  try {
    const result = spawnSync('docker', dockerArgs, {
      stdio: 'pipe',
      encoding: 'utf-8',
      timeout: 300_000,
    });
    const duration = Date.now() - startTime;

    if (result.error) {
      return { exitCode: 1, duration, error: result.error.message, stdout: '', stderr: '' };
    }

    return {
      exitCode: result.status ?? 1,
      duration,
      stdout: result.stdout || '',
      stderr: result.stderr || '',
      error: result.status === 0 ? null : `Exit code ${result.status}`,
    };
  } catch (err) {
    return { exitCode: 1, duration: Date.now() - startTime, error: err.message, stdout: '', stderr: '' };
  }
}
