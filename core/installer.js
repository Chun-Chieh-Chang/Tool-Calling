import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { join, relative, isAbsolute } from 'node:path';

// 只允許乾淨的 https://github.com/<owner>/<repo>(.git) 形式。
// 這同時擋掉：
//  1. shell 中繼字元 (即便改用陣列傳參也一併防禦，避免依賴單一防線)
//  2. git 的 `ext::<command>` 傳輸協定 RCE(這是 git 本身的功能，不是 shell 的問題，
//     陣列傳參無法防禦，必須在交給 git 之前就擋掉非 https://github.com 的協定)
const SAFE_REPO_URL = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+(?:\.git)?$/;

// 分支/子路徑不允許路徑穿越，且不能以 '-' 開頭
// (以 '-' 開頭會被 git 誤判成參數而不是資料，即所謂的「參數注入」)
function assertSafeRef(value, label) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${label} 不可為空`);
  }
  if (value.startsWith('-')) {
    throw new Error(`${label} 不可以 '-' 開頭 (疑似參數注入): ${value}`);
  }
  if (value.split('/').includes('..')) {
    throw new Error(`${label} 含有路徑穿越字元: ${value}`);
  }
}

function assertSafeRepoUrl(url) {
  if (!SAFE_REPO_URL.test(url)) {
    throw new Error(`不安全或不支援的 repoUrl(僅允許 https://github.com/<owner>/<repo>): ${url}`);
  }
}

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
  const rawRepoUrl = tool.install?.repoUrl || tool.url;

  try {
    switch (method) {
      case 'git-clone': {
        const repoUrl = `${rawRepoUrl}.git`;
        assertSafeRepoUrl(repoUrl);
        // 陣列傳參 (execFileSync 不經過 shell 解析)，並以 `--` 明確標記後面都是位置參數，
        // 避免 repoUrl/targetDir 被 git 誤判成旗標。
        execFileSync('git', ['clone', '--', repoUrl, targetDir], { stdio: 'inherit' });
        // Sandbox Mode: 不在本機執行 npm install 或 pip install，將其推遲至 invoke 階段的沙盒內執行
        break;
      }
      case 'git-clone-sparse': {
        const repoUrl = `${rawRepoUrl}.git`;
        assertSafeRepoUrl(repoUrl);
        assertSafeRef(tool.install.subpath, 'subpath');
        const branch = tool.install.branch || 'main';
        assertSafeRef(branch, 'branch');

        mkdirSync(targetDir, { recursive: true });
        console.log(`\x1b[36m執行 Sparse Checkout，僅下載子目錄: ${tool.install.subpath}...\x1b[0m`);
        execFileSync('git', ['clone', '--filter=blob:none', '--no-checkout', '--', repoUrl, '.'], { cwd: targetDir, stdio: 'inherit' });
        execFileSync('git', ['sparse-checkout', 'set', '--', tool.install.subpath], { cwd: targetDir, stdio: 'inherit' });
        // 注意：對 `git checkout` 而言 `--` 代表「後面是路徑，不是分支」，語意跟 clone/sparse-checkout
        // 不同，加了反而會把分支名當檔案路徑處理導致失敗。分支名的參數注入已經由 assertSafeRef
        // (擋開頭 '-') 防護，這裡不需要也不能加 `--`。
        execFileSync('git', ['checkout', branch], { cwd: targetDir, stdio: 'inherit' });

        const subPathDir = join(targetDir, tool.install.subpath);
        // 二次防禦：確保最終路徑真的還在 targetDir 底下 (防止 join() 因奇怪的 subpath 跳出去)
        const rel = relative(targetDir, subPathDir);
        if (rel.startsWith('..') || isAbsolute(rel)) {
          throw new Error(`subpath 解析後跳出安裝目錄範圍: ${tool.install.subpath}`);
        }
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
