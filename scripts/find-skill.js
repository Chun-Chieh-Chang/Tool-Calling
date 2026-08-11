#!/usr/bin/env node

/**
 * Find Skill CLI Wrapper
 * 使用 npx skills CLI 搜索和安裝 AI Agent Skills
 * 
 * 用法:
 *   node scripts/find-skill.js search <query>
 *   node scripts/find-skill.js install <skill-id>
 *   node scripts/find-skill.js list
 */

import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const CACHE_DIR = join(homedir(), '.tool-calling', 'skills-cache');
const CACHE_FILE = join(CACHE_DIR, 'skills.json');

// ANSI 顏色
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
};

function success(text) {
  console.log(`${c.green}✓${c.reset} ${text}`);
}

function info(text) {
  console.log(`${c.cyan}ℹ${c.reset} ${text}`);
}

function warn(text) {
  console.log(`${c.yellow}⚠${c.reset} ${text}`);
}

function error(text) {
  console.log(`${c.red}✗${c.reset} ${text}`);
}

function header(text) {
  console.log(`\n${c.bgBlue}${c.white}${c.bold} ${text} ${c.reset}\n`);
}

/**
 * Ensure cache directory exists
 */
function ensureCacheDir() {
  if (!existsSync(CACHE_DIR)) {
    mkdirSync(CACHE_DIR, { recursive: true });
  }
}

/**
 * Load cached results
 */
function loadCache() {
  try {
    return JSON.parse(readFileSync(CACHE_FILE, 'utf8'));
  } catch {
    return {};
  }
}

/**
 * Save results to cache (1 hour TTL)
 */
function saveCache(data) {
  ensureCacheDir();
  writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2), 'utf8');
}

/**
 * Search skills using npx skills find
 */
function searchSkills(query, limit = 10) {
  const cache = loadCache();
  const cacheKey = `${query}_${limit}`;
  
  // Check cache (valid for 1 hour)
  if (cache[cacheKey] && Date.now() - cache[cacheKey].timestamp < 3600000) {
    console.log(`${c.dim}(使用快取結果)${c.reset}\n`);
    return cache[cacheKey].results;
  }
  
  try {
    console.log(`${c.dim}正在搜尋 skills.sh...${c.reset}`);
    
    // Use non-interactive mode
    const output = execSync(
      `npx skills find "${query}" --limit ${limit}`,
      { encoding: 'utf8', timeout: 30000 }
    );
    
    const results = parseSkillOutput(output);
    
    // Cache results
    cache[cacheKey] = { results, timestamp: Date.now() };
    saveCache(cache);
    
    return results;
  } catch (error) {
    error(`搜尋失敗: ${error.message}`);
    return [];
  }
}

/**
 * Parse skill output from npx skills find
 */
function parseSkillOutput(output) {
  const lines = output.split('\n').filter(line => line.trim() && !line.includes('[Agnes]'));
  const results = [];
  
  for (const line of lines) {
    // Match patterns like "owner/repo@skill-name  X installs"
    const match = line.match(/(\w+\/\w+@[\w-]+)\s+\d+\s+installs?/);
    if (match) {
      const id = match[1];
      const name = id.split('@')[1] || id.split('/').pop();
      
      results.push({
        id,
        name,
        source: 'skills.sh',
        url: `https://skills.sh/${id}`,
        description: `Skill from ${id.split('/')[0]}`,
      });
    }
  }
  
  return results;
}

/**
 * Install a skill using npx skills add
 */
function installSkill(skillId) {
  try {
    console.log(`${c.dim}正在安裝 ${skillId}...${c.reset}`);
    
    const output = execSync(
      `npx skills add ${skillId} --yes`,
      { encoding: 'utf8', stdio: 'pipe', timeout: 60000 }
    );
    
    success(`已安裝: ${skillId}`);
    console.log(output);
  } catch (error) {
    error(`安裝失敗: ${error.message}`);
  }
}

/**
 * List installed skills
 */
function listSkills() {
  try {
    const output = execSync('npx skills list', { encoding: 'utf8' });
    
    console.log('\n📦 已安裝的 Skills:\n');
    
    const lines = output.split('\n').filter(line => 
      line.trim() && !line.startsWith('Project') && !line.includes('[Agnes]')
    );
    
    for (const line of lines) {
      const parts = line.split(/\s{2,}/);
      if (parts.length >= 2) {
        console.log(`  ${c.blue}${parts[0]}${c.reset}  →  ${parts[1] || '本地'}`);
      }
    }
    
    if (lines.length === 0) {
      info('目前沒有安裝任何 Skills');
    }
  } catch (error) {
    info('無法取得 Skills 列表');
  }
}

/**
 * Check if skills CLI is available
 */
function checkAvailability() {
  try {
    execSync('npx skills --version', { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Print usage
 */
function printUsage() {
  console.log(`
${c.bgBlue}${c.white}${c.bold} Find Skill CLI ${c.reset}
${c.dim}搜尋和安裝 AI Agent Skills${c.reset}

${c.bold}用法:${c.reset}
  node scripts/find-skill.js search <query>    搜尋 Skills
  node scripts/find-skill.js install <id>     安裝 Skill
  node scripts/find-skill.js list             列出已安裝的 Skills
  node scripts/find-skill.js check            檢查環境可用性

${c.bold}範例:${c.reset}
  node scripts/find-skill.js search "pdf"
  node scripts/find-skill.js search "typescript testing"
  node scripts/find-skill.js install anthropic/document-skills
`);
}

// ─── Main ─────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const command = args[0];

if (!command) {
  printUsage();
  process.exit(0);
}

switch (command) {
  case 'search': {
    const query = args[1];
    if (!query) {
      error('請提供搜尋關鍵字。用法: node scripts/find-skill.js search "pdf"');
      process.exit(1);
    }
    
    header(`搜尋: "${query}"`);
    
    if (!checkAvailability()) {
      warn('npx skills CLI 暫時不可用');
      info('建議直接訪問 https://skills.sh 搜尋 Skills');
      console.log('\n📝 或者手動執行:');
      console.log(`  ${c.yellow}npx skills find "${query}"${c.reset}`);
      process.exit(0);
    }
    
    const results = searchSkills(query, 10);
    
    if (results.length === 0) {
      warn(`找不到與 "${query}" 相關的 Skills`);
      console.log(`\n${c.dim}提示: 嘗試其他關鍵字或直接在 https://skills.sh 瀏覽${c.reset}`);
    } else {
      console.log(`\n找到 ${results.length} 個結果:\n`);
      results.forEach((skill, i) => {
        console.log(`${c.bold}#${i + 1} ${c.cyan}${skill.name}${c.reset}`);
        console.log(`   ID: ${skill.id}`);
        console.log(`   URL: ${c.blue}${skill.url}${c.reset}`);
        console.log(`   來源: ${skill.source}`);
        console.log('');
      });
      
      console.log(`${c.dim}使用以下方式安裝:${c.reset}`);
      console.log(`  node scripts/find-skill.js install <skill-id>`);
    }
    break;
  }
  
  case 'install': {
    const skillId = args[1];
    if (!skillId) {
      error('請提供要安裝的 Skill ID。用法: node scripts/find-skill.js install anthropic/document-skills');
      process.exit(1);
    }
    
    header(`安裝: ${skillId}`);
    installSkill(skillId);
    break;
  }
  
  case 'list': {
    header('已安裝的 Skills');
    listSkills();
    break;
  }
  
  case 'check': {
    header('環境檢查');
    if (checkAvailability()) {
      success('npx skills CLI 可用');
      try {
        const version = execSync('npx skills --version', { encoding: 'utf8' }).trim();
        console.log(`${c.dim}版本:${c.reset} ${version}`);
      } catch {}
    } else {
      error('npx skills CLI 不可用');
      console.log('\n請安裝 Node.js 後再試:');
      console.log(`  ${c.yellow}https://nodejs.org/${c.reset}`);
    }
    break;
  }
  
  default:
    error(`未知指令: ${command}`);
    printUsage();
    process.exit(1);
}
