#!/usr/bin/env node

/**
 * Tool-Calling CLI
 * 命令列介面：add / list / search / remove / validate / health-check / index-subtools
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { search, listAll, listByCategory, getById } from './core/search-engine.js';
import { scanMonorepo } from './scripts/scan-monorepo.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REGISTRY_PATH = join(__dirname, 'registry', 'tools.json');

// ─── 工具函式 ─────────────────────────────────────────────────────────────

function loadRegistryRaw() {
  return JSON.parse(readFileSync(REGISTRY_PATH, 'utf-8'));
}

function saveRegistry(data) {
  data.lastUpdated = new Date().toISOString();
  writeFileSync(REGISTRY_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

function generateId(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

// ─── ANSI 顏色 ─────────────────────────────────────────────────────────────

const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
  white: '\x1b[37m',
  bgBlue: '\x1b[44m',
  bgGreen: '\x1b[42m',
};

function header(text) {
  console.log(`\n${c.bgBlue}${c.white}${c.bold} ${text} ${c.reset}\n`);
}

function success(text) {
  console.log(`${c.green}✓${c.reset} ${text}`);
}

function warn(text) {
  console.log(`${c.yellow}⚠${c.reset} ${text}`);
}

function error(text) {
  console.log(`${c.red}✗${c.reset} ${text}`);
}

// ─── 命令：list ─────────────────────────────────────────────────────────────

function cmdList() {
  header('工具註冊庫');
  const byCategory = listByCategory();
  let total = 0;

  for (const [category, tools] of byCategory) {
    console.log(`${c.cyan}${c.bold}【${category}】${c.reset} (${tools.length})`);
    for (const tool of tools) {
      total++;
      const status = tool.status === 'active'
        ? `${c.green}●${c.reset}`
        : tool.status === 'deprecated'
          ? `${c.red}●${c.reset}`
          : `${c.yellow}●${c.reset}`;
      console.log(`  ${status} ${c.bold}${tool.name}${c.reset} ${c.dim}(${tool.id})${c.reset}`);
      console.log(`    ${c.dim}${tool.description.slice(0, 70)}${tool.description.length > 70 ? '...' : ''}${c.reset}`);
      console.log(`    ${c.blue}${tool.url}${c.reset}`);
      console.log(`    ${c.magenta}觸發:${c.reset} ${tool.triggers.slice(0, 5).join(', ')}${tool.triggers.length > 5 ? '...' : ''}`);
      console.log();
    }
  }

  console.log(`${c.dim}─────────────────────────────────────────${c.reset}`);
  console.log(`${c.bold}共 ${total} 個工具${c.reset}，分佈於 ${byCategory.size} 個分類\n`);
}

// ─── 命令：search ─────────────────────────────────────────────────────────

function cmdSearch(query, options = {}) {
  if (!query) {
    error('請提供搜尋查詢。用法: node cli.js search "我想做簡報"');
    process.exit(1);
  }

  header(`搜尋: "${query}"`);
  const results = search(query, { topK: options.topK || 5 });

  if (results.length === 0) {
    warn('未找到匹配的工具。');
    console.log(`${c.dim}提示: 嘗試更換關鍵字，或使用 'node cli.js list' 瀏覽所有工具${c.reset}\n`);
    return;
  }

  for (let i = 0; i < results.length; i++) {
    const { tool, score, matchLevel, matchedKeywords } = results[i];
    const bar = '█'.repeat(Math.round(score * 20)).padEnd(20, '░');
    console.log(`${c.bold}#${i + 1}${c.reset} ${c.cyan}${tool.name}${c.reset} ${c.dim}(${tool.id})${c.reset}`);
    console.log(`   信心度: ${c.green}${bar}${c.reset} ${(score * 100).toFixed(0)}%  [${matchLevel}]`);
    console.log(`   ${c.dim}${tool.description.slice(0, 80)}${c.reset}`);
    if (tool.useCase) {
      console.log(`   ${c.yellow}⭐ 場景:${c.reset} ${tool.useCase}`);
    }
    if (tool.negativeConstraints?.length) {
      console.log(`   ${c.red}🚫 禁用場景:${c.reset} ${tool.negativeConstraints.join('、')}`);
    }
    if (matchedKeywords && matchedKeywords.length > 0) {
      console.log(`   ${c.magenta}匹配:${c.reset} ${matchedKeywords.slice(0, 5).join(', ')}`);
    }
    console.log(`   ${c.blue}${tool.url}${c.reset}`);
    console.log();
  }
}

// ─── 命令：add ──────────────────────────────────────────────────────────────

async function cmdAdd(url, isBatch = false) {
  if (!url) {
    if (isBatch) throw new Error('請提供 GitHub URL');
    error('請提供 GitHub URL。用法: node cli.js add https://github.com/owner/repo');
    process.exit(1);
  }

  // 基本 URL 格式驗證 (支援 Monorepo 子目錄與單一檔案)
  const githubRegex = /^https?:\/\/github\.com\/([^/]+)\/([^/]+)(?:\/(?:tree|blob)\/([^/]+)\/(.+))?\/?$/;
  const match = url.match(githubRegex);
  if (!match) {
    if (isBatch) throw new Error(`無效的 GitHub URL: ${url}`);
    error(`無效的 GitHub URL: ${url}`);
    console.log(`${c.dim}預期格式: https://github.com/owner/repo 或 https://github.com/owner/repo/tree/main/subpath${c.reset}`);
    process.exit(1);
  }

  const [, owner, repo, branch, subpath] = match;
  // 若有 subpath，ID 取 subpath 最後一段，否則取 repo
  const baseName = subpath ? subpath.split('/').pop() : repo;
  let id = generateId(baseName);
  const registry = loadRegistryRaw();

  // 重複檢測
  if (registry.tools.some(t => t.url === url)) {
    warn(`工具已存在: ${id} (${url})`);
    return;
  }
  
  if (registry.tools.some(t => t.id === id)) {
    id = generateId(`${owner}-${baseName}`);
  }

  console.log(`${c.cyan}正在掃描 GitHub 倉庫: ${url}...${c.reset}`);
  
  try {
    // 動態載入 scanner 以避免啟動時的依賴負載
    const { scan } = await import('./scripts/scan-tool.js');
    const newTool = await scan(url, { silent: true });

    // 確保 ID 不重複
    if (registry.tools.some(t => t.id === newTool.id)) {
      newTool.id = `${newTool.id}-${owner}`;
    }

    registry.tools.push(newTool);
    saveRegistry(registry);

    success(`已新增工具: ${c.bold}${newTool.name}${c.reset} (${newTool.id})`);
    console.log(`  ${c.blue}${url}${c.reset}`);
    console.log(`  ${c.dim}描述: ${newTool.description.slice(0, 60)}${c.reset}`);
    console.log(`  ${c.dim}分類: ${newTool.category} | 語言: ${newTool.language}${c.reset}\n`);
  } catch (err) {
    error(`新增失敗: ${err.message}`);
    console.log(`${c.yellow}提示: 若因網路問題掃描失敗，您可以手動編輯 registry/tools.json 進行新增。${c.reset}\n`);
  }
}

// ─── 命令：remove ────────────────────────────────────────────────────────

function cmdRemove(idOrUrl) {
  if (!idOrUrl) {
    error('請提供工具 ID 或 URL。用法: node cli.js remove ppt-master');
    process.exit(1);
  }

  const registry = loadRegistryRaw();
  const idx = registry.tools.findIndex(
    t => t.id === idOrUrl || t.url === idOrUrl
  );

  if (idx === -1) {
    error(`未找到工具: ${idOrUrl}`);
    process.exit(1);
  }

  const removed = registry.tools.splice(idx, 1)[0];
  saveRegistry(registry);
  success(`已移除工具: ${c.bold}${removed.name}${c.reset} (${removed.id})`);
}

// ─── 命令：validate ──────────────────────────────────────────────────────

function cmdValidate() {
  header('驗證 tools.json');

  const registry = loadRegistryRaw();
  let errors = 0;
  let warnings = 0;

  // 基本結構
  if (!registry.version) { error('缺少 version 欄位'); errors++; }
  if (!registry.lastUpdated) { error('缺少 lastUpdated 欄位'); errors++; }
  if (!Array.isArray(registry.tools)) { error('tools 不是陣列'); errors++; return; }

  const ids = new Set();
  const urls = new Set();

  for (const tool of registry.tools) {
    // 必填欄位
    const required = ['id', 'name', 'url', 'description', 'category', 'language', 'triggers', 'status'];
    for (const field of required) {
      if (!tool[field]) {
        error(`工具 "${tool.id || tool.name || '?'}" 缺少必填欄位: ${field}`);
        errors++;
      }
    }

    // ID 唯一性
    if (ids.has(tool.id)) {
      error(`重複的工具 ID: ${tool.id}`);
      errors++;
    }
    ids.add(tool.id);

    // URL 唯一性
    if (urls.has(tool.url)) {
      warn(`重複的 URL: ${tool.url}`);
      warnings++;
    }
    urls.add(tool.url);

    // 觸發詞數量
    if (tool.triggers && tool.triggers.length < 2) {
      warn(`工具 "${tool.id}" 觸發詞不足 2 個，建議增加`);
      warnings++;
    }

    // 描述長度
    if (tool.description && tool.description.length < 15) {
      warn(`工具 "${tool.id}" 描述過短`);
      warnings++;
    }
  }

  console.log(`${c.dim}─────────────────────────────────────────${c.reset}`);
  if (errors === 0 && warnings === 0) {
    success(`所有 ${registry.tools.length} 個工具通過驗證 ✨`);
  } else {
    console.log(`${errors > 0 ? c.red : c.green}${errors} 個錯誤${c.reset}, ${warnings > 0 ? c.yellow : c.green}${warnings} 個警告${c.reset}`);
  }
  console.log();

  return errors === 0;
}

// ─── 命令：health-check ──────────────────────────────────────────────────

async function cmdHealthCheck() {
  header('工具可用性健康檢查');

  const tools = listAll();
  let healthy = 0;
  let failed = 0;

  for (const tool of tools) {
    try {
      const res = await fetch(tool.url, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        success(`${tool.name} ${c.dim}(${tool.url})${c.reset}`);
        healthy++;
      } else {
        warn(`${tool.name} — HTTP ${res.status} ${c.dim}(${tool.url})${c.reset}`);
        failed++;
      }
    } catch (err) {
      error(`${tool.name} — ${err.message} ${c.dim}(${tool.url})${c.reset}`);
      failed++;
    }
  }

  console.log(`\n${c.dim}─────────────────────────────────────────${c.reset}`);
  console.log(`${c.green}${healthy} 健康${c.reset} / ${c.red}${failed} 異常${c.reset} / 共 ${tools.length} 個工具\n`);
}

// ─── 命令：info ──────────────────────────────────────────────────────────

function cmdInfo(id) {
  if (!id) {
    error('請提供工具 ID。用法: node cli.js info playwright');
    process.exit(1);
  }

  const tool = getById(id);
  if (!tool) {
    error(`未找到工具: ${id}`);
    process.exit(1);
  }

  header(tool.name);
  console.log(`  ${c.bold}ID:${c.reset}       ${tool.id}`);
  console.log(`  ${c.bold}URL:${c.reset}      ${c.blue}${tool.url}${c.reset}`);
  console.log(`  ${c.bold}描述:${c.reset}     ${tool.description}`);
  console.log(`  ${c.bold}分類:${c.reset}     ${tool.category}`);
  console.log(`  ${c.bold}語言:${c.reset}     ${tool.language}`);
  console.log(`  ${c.bold}狀態:${c.reset}     ${tool.status}`);
  console.log(`  ${c.bold}觸發詞:${c.reset}   ${tool.triggers.join(', ')}`);
  if (tool.useCase) {
    console.log(`  ${c.yellow}⭐ 場景:${c.reset}  ${tool.useCase}`);
  }
  if (tool.negativeConstraints?.length) {
    console.log(`  ${c.red}🚫 禁用場景:${c.reset} ${tool.negativeConstraints.join('、')}`);
  }
  if (tool.advantages?.length) {
    console.log(`  ${c.yellow}★ 優勢:${c.reset}   ${tool.advantages.join('、')}`);
  }
  if (tool.capabilities?.length) {
    console.log(`  ${c.bold}能力:${c.reset}     ${tool.capabilities.join(', ')}`);
  }
  if (tool.install) {
    console.log(`  ${c.bold}安裝:${c.reset}     ${tool.install.command} [${tool.install.method}]`);
  }
  if (tool.subTools?.length) {
    console.log(`  ${c.bold}子工具 (${tool.subTools.length}):${c.reset}`);
    for (const st of tool.subTools) {
      console.log(`    - ${c.cyan}${st.name}${c.reset}`);
      console.log(`      ${c.dim}${st.description.slice(0, 80)}${c.reset}`);
      console.log(`      ${c.dim}路徑: ${st.subpath}${c.reset}`);
    }
  }
  console.log(`  ${c.bold}加入時間:${c.reset} ${tool.addedAt}`);
  console.log();
}

// ─── 命令：index-subtools ──────────────────────────────────────────────────

function cmdIndexSubtools(id) {
  if (!id) {
    error('請提供工具 ID。用法: node cli.js index-subtools agent-skills');
    process.exit(1);
  }
  try {
    scanMonorepo(id);
  } catch (err) {
    error(`掃描失敗: ${err.message}`);
  }
}

// ─── 命令：batch-add ─────────────────────────────────────────────────────

async function cmdBatchAdd(filePath) {
  if (!filePath) {
    error('請提供 URL 列表檔案路徑。用法: node cli.js batch-add urls.txt');
    process.exit(1);
  }

  if (!existsSync(filePath)) {
    error(`檔案不存在: ${filePath}`);
    process.exit(1);
  }

  const content = readFileSync(filePath, 'utf-8');
  const urls = content.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#'));

  header(`批量新增 (${urls.length} 個 URL)`);
  for (const url of urls) {
    try {
      await cmdAdd(url, true);
    } catch (err) {
      error(`✗ ${err.message}`);
    }
  }
}

// ─── 命令：install ────────────────────────────────────────────────────────

async function cmdInstall(id) {
  if (!id) {
    error('請提供工具 ID。用法: node cli.js install <tool-id>');
    process.exit(1);
  }

  const tool = getById(id);
  if (!tool) {
    error(`未找到工具: ${id}。請先使用 list 或 search 確認工具 ID。`);
    process.exit(1);
  }

  const { installTool } = await import('./core/installer.js');
  const tempDir = join(__dirname, '.temp');
  
  header(`動態安裝: ${tool.name}`);
  try {
    const targetPath = installTool(tool, tempDir);
    success(`工具已就緒: ${c.bold}${targetPath}${c.reset}`);
    console.log(`\n${c.yellow}提示: 您現在可以切換到該目錄執行工具。任務完成後，請執行 'node cli.js cleanup' 進行復歸。${c.reset}\n`);
  } catch (err) {
    error(err.message);
    process.exit(1);
  }
}

// ─── 命令：cleanup ────────────────────────────────────────────────────────

async function cmdCleanup() {
  const { cleanup } = await import('./core/cleanup.js');
  const tempDir = join(__dirname, '.temp');
  header('系統復歸與清理');
  cleanup(tempDir);
}

// ─── 幫助訊息 ─────────────────────────────────────────────────────────────

function showHelp() {
  console.log(`
${c.bgBlue}${c.white}${c.bold} Tool-Calling CLI ${c.reset}  ${c.dim}全自動工具調用效能外掛系統${c.reset}

${c.bold}用法:${c.reset}
  node cli.js <command> [args]

${c.bold}核心命令:${c.reset}
  ${c.cyan}search${c.reset} <query> [-c category] 搜尋最適工具（支援自然語言與分類過濾）
  ${c.cyan}install${c.reset} <id>             動態安裝工具到 .temp/ 臨時目錄
  ${c.cyan}cleanup${c.reset}                  移除所有臨時工具，復歸系統

${c.bold}管理命令:${c.reset}
  ${c.cyan}list${c.reset}                    列出所有已註冊工具
  ${c.cyan}info${c.reset} <id>                查看工具詳細資訊
  ${c.cyan}add${c.reset} <github-url>         新增工具（自動解析）
  ${c.cyan}batch-add${c.reset} <file>         從檔案批量新增
  ${c.cyan}remove${c.reset} <id|url>          移除工具
  ${c.cyan}index-subtools${c.reset} <id>      深層掃描並索引大補帖內部的子工具
  ${c.cyan}validate${c.reset}                 驗證註冊庫格式
  ${c.cyan}health-check${c.reset}             檢查所有工具 URL

${c.bold}觸發咒語:${c.reset}
  ${c.magenta}「啟動全自動工具調用模式」${c.reset} — AI Agent 自動識別 + 選擇 + 調用工具
`);
}

// ─── 主程式 ─────────────────────────────────────────────────────────────────

const [,, command, ...args] = process.argv;

switch (command) {
  case 'list':
    cmdList();
    break;
  case 'search': {
    const searchArgs = [];
    let searchCat = undefined;
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '-c' || args[i] === '--category') {
        searchCat = args[i + 1];
        i++;
      } else {
        searchArgs.push(args[i]);
      }
    }
    cmdSearch(searchArgs.join(' '), { category: searchCat });
    break;
  }
  case 'info':
    cmdInfo(args[0]);
    break;
  case 'install':
    await cmdInstall(args[0]);
    break;
  case 'cleanup':
    await cmdCleanup();
    break;
  case 'add':
    await cmdAdd(args[0]);
    break;
  case 'batch-add':
    await cmdBatchAdd(args[0]);
    break;
  case 'remove':
    cmdRemove(args[0]);
    break;
  case 'index-subtools':
    cmdIndexSubtools(args[0]);
    break;
  case 'validate':
    cmdValidate();
    break;
  case 'health-check':
    await cmdHealthCheck();
    break;
  case 'help':
  case '--help':
  case '-h':
    showHelp();
    break;
  default:
    if (!command) {
      showHelp();
    } else {
      error(`未知命令: ${command}`);
      showHelp();
    }
}
