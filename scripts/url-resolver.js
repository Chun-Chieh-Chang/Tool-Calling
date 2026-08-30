/**
 * URL Resolver — 辨識網址類型並決定是否需要拆解
 * 
 * 三種類型：
 *   tool     — 單一可執行工具/套件（直接掃描加入）
 *   resource — 參考資料/目錄/清單（method: none，作為學習資源）
 *   monorepo — 包含多個獨立工具的集合（需要拆解為多個 entry）
 */

const RESOURCE_SIGNALS = [
  'public-apis', 'awesome-list', 'free-api', 'api-directory',
  'roadmap', 'curriculum', 'learning-path', 'cheatsheet',
  'handbook', 'reference-guide', 'catalog', 'directory'
];

/**
 * 解析 GitHub monorepo URL，回傳子模組列表
 * 只有當子目錄符合「工具集合」模式時才拆解：
 *   - 目錄名含 skills/agents/tools/providers 等關鍵詞
 *   - 或根目錄有明确的多工具結構（如 package.json workspace）
 */
export async function resolveMonorepo(url, options = {}) {
  const githubRegex = /^https?:\/\/github\.com\/([^/]+)\/([^/]+)(?:\/(?:tree|blob)\/([^/]+))?\/?$/;
  const match = url.match(githubRegex);
  if (!match) return null;

  const [, owner, repo, branch = 'main'] = match;

  // 排除常見的非工具型單體專案
  const singleRepoRepos = ['gemini-cli', 'claude-code', 'cursor', 'copilot', 'continue'];
  if (singleRepoRepos.includes(repo.toLowerCase())) {
    return null;
  }

  try {
    // 列出倉庫根目錄結構
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/`;
    const res = await fetch(apiUrl, {
      headers: {
        'User-Agent': 'Tool-Calling-Resolver/1.0',
        'Accept': 'application/vnd.github.v3+json',
      }
    });

    if (!res.ok) return null;

    const items = await res.json();
    
    // 只尋找可能包含獨立工具的目錄
    const TOOL_DIR_SIGNALS = ['skills', 'agents', 'tools', 'providers', 'extensions', 'plugins', 'modules', 'components'];
    const subItems = items.filter(item => item.type === 'dir').map(item => item.name);
    const candidateDirs = subItems.filter(d => 
      TOOL_DIR_SIGNALS.some(signal => d.toLowerCase().includes(signal))
    );

    // 若沒有符合信號的目錄，檢查是否有 .workspace / package.json workspace 配置
    if (candidateDirs.length === 0) {
      // 檢查根目錄的 package.json 是否有 workspaces 設定
      try {
        const rawPkgUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/package.json`;
        const pkgRes = await fetch(rawPkgUrl);
        if (pkgRes.ok) {
          const pkgData = await pkgRes.json();
          if (pkgData.workspaces && Array.isArray(pkgData.workspaces) && pkgData.workspaces.length >= 2) {
            for (const ws of pkgData.workspaces) {
              if (ws.startsWith('packages/') || ws.startsWith('src/')) {
                const pkgPath = ws + '/package.json';
                try {
                  const wsPkgRes = await fetch(`https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${pkgPath}`);
                  if (wsPkgRes.ok) {
                    const wsData = await wsPkgRes.json();
                    if (wsData.name) {
                      candidateDirs.push(ws.replace(/\/package\.json$/, ''));
                    }
                  }
                } catch {}
              }
            }
          }
        }
      } catch {}
    }

    // 若只有 1 個候選目錄 (如 plugins/ 或 skills/)，進一步探測其子目錄
    if (candidateDirs.length === 1) {
      const containerDir = candidateDirs[0];
      try {
        const subApiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${containerDir}`;
        const subRes = await fetch(subApiUrl, {
          headers: {
            'User-Agent': 'Tool-Calling-Resolver/1.0',
            'Accept': 'application/vnd.github.v3+json',
          }
        });
        if (subRes.ok) {
          const subContents = await subRes.json();
          if (Array.isArray(subContents)) {
            const nestedDirs = subContents.filter(i => i.type === 'dir').map(i => `${containerDir}/${i.name}`);
            if (nestedDirs.length >= 2) {
              candidateDirs.length = 0;
              candidateDirs.push(...nestedDirs);
            }
          }
        }
      } catch {}
    }

    if (candidateDirs.length < 2) return null;

    // 對候選目錄做進一步驗證
    const candidates = [];
    for (const subdir of candidateDirs.slice(0, 10)) { // 限制深度
      // 1. SKILL.md 直接或在子目錄下
      try {
        const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${subdir}/SKILL.md`;
        const skillRes = await fetch(rawUrl, { method: 'HEAD' });
        if (skillRes.ok) {
          candidates.push({ path: subdir, type: 'skill', url: `https://github.com/${owner}/${repo}/tree/${branch}/${subdir}` });
          continue;
        }
      } catch {}

      // 2. Claude Plugin (plugin.json)
      try {
        const pluginUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${subdir}/.claude-plugin/plugin.json`;
        const pRes = await fetch(pluginUrl, { method: 'HEAD' });
        if (pRes.ok) {
          candidates.push({ path: subdir, type: 'plugin', url: `https://github.com/${owner}/${repo}/tree/${branch}/${subdir}` });
          continue;
        }
      } catch {}

      // 3. package.json / pyproject.toml
      try {
        const pkgUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${subdir}/package.json`;
        const pkgRes = await fetch(pkgUrl, { method: 'HEAD' });
        if (pkgRes.ok) {
          candidates.push({ path: subdir, type: 'package', url: `https://github.com/${owner}/${repo}/tree/${branch}/${subdir}` });
          continue;
        }
      } catch {}
      
      // 4. README.md
      try {
        const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${subdir}/README.md`;
        const readmeRes = await fetch(rawUrl, { method: 'HEAD' });
        if (readmeRes.ok) {
          candidates.push({ path: subdir, type: 'readme', url: `https://github.com/${owner}/${repo}/tree/${branch}/${subdir}` });
        }
      } catch {}
    }

    return candidates.length >= 2 ? {
      type: 'monorepo',
      rootUrl: `https://github.com/${owner}/${repo}`,
      subTools: candidates.map(c => ({ path: c.path, type: c.type, url: c.url, id: c.path.toLowerCase().replace(/[^a-z0-9]+/g, '-') }))
    } : null;
  } catch {
    return null;
  }
}

/**
 * 判斷 URL 是否屬於「非可安裝資源」
 */
export function isResourceUrl(url, description = '', topics = []) {
  const text = ((description || '') + ' ' + (topics || []).join(' ') + ' ' + url).toLowerCase();
  return RESOURCE_SIGNALS.some(s => text.includes(s));
}

/**
 * 主解析函式：回傳工具類型與建議動作
 */
export async function resolve(url, description = '', topics = []) {
  if (isResourceUrl(url, description, topics)) {
    return { type: 'resource', action: 'add-as-is', url };
  }

  const monorepo = await resolveMonorepo(url, description);
  if (monorepo && monorepo.subTools.length >= 2) {
    return { type: 'monorepo', action: 'split', ...monorepo };
  }

  return { type: 'tool', action: 'scan-and-add', url };
}
