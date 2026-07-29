import { execSync } from 'node:child_process';

/**
 * 檢查系統環境中各個 CLI 工具是否可用
 * @returns {object} 環境檢測結果
 */
export function checkSystemEnvironment() {
  const tools = ['node', 'npm', 'npx', 'python', 'pip', 'git', 'docker'];
  const status = {};

  for (const t of tools) {
    try {
      const cmd = process.platform === 'win32' ? `where ${t}` : `which ${t}`;
      execSync(cmd, { stdio: 'ignore' });
      status[t] = true;
    } catch {
      status[t] = false;
    }
  }

  return status;
}

/**
 * 為指定工具進行預檢與沙盒相依性確效 (Pre-flight Dry-run Sandbox Check)
 * @param {object} tool 
 * @returns {object} 相依性檢查報告
 */
export function verifyToolEnvironment(tool) {
  if (!tool) {
    return { ok: false, message: '無效的工具物件' };
  }

  const env = checkSystemEnvironment();
  const issues = [];
  const method = tool.install ? tool.install.method : 'none';

  if (method === 'pip' && !env.python && !env.pip) {
    issues.push('系統未偵測到 Python / pip 環境');
  } else if (method === 'npm' && !env.node && !env.npm) {
    issues.push('系統未偵測到 Node.js / npm 環境');
  } else if (method === 'npx' && !env.npx) {
    issues.push('系統未偵測到 npx 環境');
  } else if ((method === 'git-clone' || method === 'git-clone-sparse') && !env.git) {
    issues.push('系統未偵測到 Git 環境');
  } else if (method === 'docker' && !env.docker) {
    issues.push('系統未偵測到 Docker 容器服務');
  }

  return {
    toolId: tool.id,
    toolName: tool.name,
    installMethod: method,
    command: tool.install ? tool.install.command : '無',
    isEnvironmentReady: issues.length === 0,
    systemEnvironment: env,
    issues
  };
}
