import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REGISTRY_PATH = join(__dirname, '..', 'registry', 'tools.json');
const TEMP_DIR = join(__dirname, '..', '.temp');

function loadRegistry() {
  const raw = readFileSync(REGISTRY_PATH, 'utf-8');
  return JSON.parse(raw);
}

function saveRegistry(registry) {
  writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2), 'utf-8');
}

function parseMarkdownDescription(content) {
  let description = '';
  // 優先解析 YAML Frontmatter
  if (content.startsWith('---')) {
    const endIdx = content.indexOf('---', 3);
    if (endIdx > -1) {
      const fm = content.substring(3, endIdx);
      const descMatch = fm.match(/description:\s*(.+)/);
      if (descMatch) {
        return descMatch[1].trim().replace(/^['"]|['"]$/g, '');
      }
      content = content.substring(endIdx + 3).trim();
    }
  }

  // 抓取第一段非標題段落
  const paragraphs = content.split('\n\n');
  const firstP = paragraphs.find(p => p.trim() && !p.startsWith('#') && !p.startsWith('!') && !p.startsWith('<') && !p.startsWith('-'));
  if (firstP) {
    description = firstP.replace(/\n/g, ' ').trim().slice(0, 200);
  }
  return description;
}

export function scanMonorepo(toolId) {
  const registry = loadRegistry();
  const toolIndex = registry.tools.findIndex(t => t.id === toolId);
  
  if (toolIndex === -1) {
    throw new Error(`找不到工具: ${toolId}`);
  }
  
  const tool = registry.tools[toolIndex];
  // 檢查是否為 github 倉庫
  if (!tool.url.includes('github.com')) {
    throw new Error(`目前僅支援掃描 GitHub 倉庫，${tool.url} 不符`);
  }

  console.log(`\x1b[36m開始深層掃描 Monorepo: ${tool.name} (${tool.url})\x1b[0m`);
  
  const targetDir = join(TEMP_DIR, `${tool.id}-scan`);
  
  // 清理舊的
  if (existsSync(targetDir)) {
    rmSync(targetDir, { recursive: true, force: true });
  }
  
  try {
    // 淺拷貝 Clone
    console.log(`正在下載專案...`);
    // 確保抓取 root url
    const repoUrl = tool.install?.repoUrl || tool.url;
    const cloneResult = spawnSync('git', ['clone', '--depth', '1', `${repoUrl}.git`, targetDir], { stdio: 'ignore' });
    if (cloneResult.status !== 0) throw new Error(`git clone failed for ${repoUrl}`);
    
    // 遍歷目錄
    const subTools = [];
    
    function traverse(currentDir, currentPath) {
      const entries = readdirSync(currentDir);
      for (const entry of entries) {
        if (entry === '.git' || entry === 'node_modules') continue;
        
        const fullPath = join(currentDir, entry);
        const relativePath = currentPath ? `${currentPath}/${entry}` : entry;
        
        if (statSync(fullPath).isDirectory()) {
          // 檢查是否包含 SKILL.md 或 README.md
          let mdContent = null;
          if (existsSync(join(fullPath, 'SKILL.md'))) {
            mdContent = readFileSync(join(fullPath, 'SKILL.md'), 'utf-8');
          } else if (existsSync(join(fullPath, 'README.md'))) {
            mdContent = readFileSync(join(fullPath, 'README.md'), 'utf-8');
          }
          
          if (mdContent) {
            const desc = parseMarkdownDescription(mdContent);
            if (desc) {
              subTools.push({
                name: entry.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
                description: desc,
                subpath: relativePath
              });
            }
          }
          
          // 繼續往下挖
          traverse(fullPath, relativePath);
        }
      }
    }
    
    console.log(`掃描目錄結構...`);
    traverse(targetDir, '');
    
    if (subTools.length > 0) {
      console.log(`\x1b[32m✓ 發現 ${subTools.length} 個子工具\x1b[0m`);
      tool.subTools = subTools;
      registry.tools[toolIndex] = tool;
      saveRegistry(registry);
      console.log(`已將 subTools 寫入資料庫。`);
    } else {
      console.log(`\x1b[33m未發現任何子工具\x1b[0m`);
    }
    
  } finally {
    // 清理
    if (existsSync(targetDir)) {
      rmSync(targetDir, { recursive: true, force: true });
    }
  }
}
