#!/usr/bin/env node
/**
 * install-plugin.js — 將 Tool-Calling 安裝為各家 Agentic IDE 的外掛
 *
 * 雙介面設計：
 *   1. MCP Server（功能介面）：寫入各 IDE 的 MCP 設定檔，指向本 repo 的 mcp-server.js
 *   2. Agent Skill（行為 SOP）：可選複製 skills/tool-calling 到 IDE 的 skills 目錄
 *
 * 用法：
 *   node scripts/install-plugin.js --list
 *   node scripts/install-plugin.js --ide all --scope global --dry-run
 *   node scripts/install-plugin.js --ide claude,cursor --scope project --target D:\path\to\proj
 *   node scripts/install-plugin.js --ide claude --uninstall --scope project
 *   node scripts/install-plugin.js --ide claude --with-skills
 *
 * 設計原則：
 *   - 合併寫入（merge），絕不覆蓋使用者既有的其他 MCP server 設定
 *   - --dry-run 只輸出計畫，不碰磁碟
 *   - 不新增任何 npm 依賴（TOML 以最小手寫邏輯處理 Codex 設定）
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, cpSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const MCP_ENTRY = join(ROOT, 'mcp-server.js');
const SKILL_SRC = join(ROOT, 'skills', 'tool-calling');
const SERVER_KEY = 'tool-calling';
const HOME = os.homedir();

/** Zed 全域 settings.json 路徑（Windows: %APPDATA%\Zed，macOS/Linux: ~/.config/zed） */
function zedGlobalSettings() {
  return process.platform === 'win32'
    ? join(process.env.APPDATA || join(HOME, 'AppData', 'Roaming'), 'Zed', 'settings.json')
    : join(HOME, '.config', 'zed', 'settings.json');
}

/** MCP server 啟動設定（各 IDE 共用） */
export function serverEntry() {
  return { command: 'node', args: [MCP_ENTRY] };
}

/**
 * 各 IDE 的設定檔位置與格式定義。
 * format: 'json'（合併 rootKey）或 'toml'（Codex 專用）
 * scopes: 該 IDE 支援的範圍（global=使用者級 / project=專案級）
 */
export const IDE_MATRIX = {
  claude: {
    label: 'Claude Code',
    scopes: ['global', 'project'],
    file: (scope, project) =>
      scope === 'global' ? join(HOME, '.claude.json') : join(project, '.mcp.json'),
    format: 'json',
    rootKey: 'mcpServers',
    skillDir: (scope, project) =>
      scope === 'global' ? join(HOME, '.claude', 'skills') : join(project, '.claude', 'skills'),
  },
  cursor: {
    label: 'Cursor',
    scopes: ['global', 'project'],
    file: (scope, project) =>
      scope === 'global' ? join(HOME, '.cursor', 'mcp.json') : join(project, '.cursor', 'mcp.json'),
    format: 'json',
    rootKey: 'mcpServers',
  },
  gemini: {
    label: 'Gemini CLI',
    scopes: ['global', 'project'],
    file: (scope, project) =>
      scope === 'global'
        ? join(HOME, '.gemini', 'settings.json')
        : join(project, '.gemini', 'settings.json'),
    format: 'json',
    rootKey: 'mcpServers',
    skillDir: (scope, project) =>
      scope === 'global' ? join(HOME, '.gemini', 'skills') : join(project, '.agents', 'skills'),
  },
  antigravity: {
    label: 'Antigravity IDE',
    scopes: ['global'],
    file: () => join(HOME, '.gemini', 'antigravity', 'mcp_config.json'),
    format: 'json',
    rootKey: 'mcpServers',
    skillDir: (scope, project) => join(project, '.agents', 'skills'),
  },
  windsurf: {
    label: 'Windsurf',
    scopes: ['global'],
    file: () => join(HOME, '.codeium', 'windsurf', 'mcp_config.json'),
    format: 'json',
    rootKey: 'mcpServers',
  },
  vscode: {
    label: 'VS Code (Copilot / Cline 相容)',
    scopes: ['project'],
    file: (scope, project) => join(project, '.vscode', 'mcp.json'),
    format: 'json',
    rootKey: 'servers', // VS Code 原生 MCP 使用 "servers" 鍵
  },
  kiro: {
    label: 'Kiro',
    scopes: ['global', 'project'],
    file: (scope, project) =>
      scope === 'global'
        ? join(HOME, '.kiro', 'settings', 'mcp.json')
        : join(project, '.kiro', 'settings', 'mcp.json'),
    format: 'json',
    rootKey: 'mcpServers',
  },
  zed: {
    label: 'Zed',
    scopes: ['global', 'project'],
    file: (scope, project) =>
      scope === 'global' ? zedGlobalSettings() : join(project, '.zed', 'settings.json'),
    format: 'json',
    rootKey: 'context_servers', // Zed 使用 "context_servers" 鍵
  },
  trae: {
    label: 'Trae',
    // 全域設定僅能透過 Trae UI（設定 > MCP > 手動添加）貼上，無文件化檔案路徑
    scopes: ['project'],
    file: (scope, project) => join(project, '.trae', 'mcp.json'),
    format: 'json',
    rootKey: 'mcpServers',
  },
  roo: {
    label: 'Roo Code (VS Code 擴充)',
    // 全域設定存放於 VS Code 擴充 globalStorage，路徑隨安裝而異，僅支援專案級
    scopes: ['project'],
    file: (scope, project) => join(project, '.roo', 'mcp.json'),
    format: 'json',
    rootKey: 'mcpServers',
  },
  opencode: {
    label: 'OpenCode',
    scopes: ['global', 'project'],
    file: (scope, project) =>
      scope === 'global'
        ? join(HOME, '.config', 'opencode', 'opencode.json')
        : join(project, 'opencode.json'),
    format: 'json',
    rootKey: 'mcp', // OpenCode 使用 "mcp" 鍵，且 local server 需 type/command 陣列格式
    entryTransform: (e) => ({ type: 'local', command: [e.command, ...e.args], enabled: true }),
  },
  codex: {
    label: 'OpenAI Codex CLI',
    scopes: ['global'],
    file: () => join(HOME, '.codex', 'config.toml'),
    format: 'toml',
  },
};

// ─── JSON 合併 ──────────────────────────────────────────────────────────────

function mergeJsonConfig(existing, rootKey, uninstall, entryTransform) {
  const config = existing ? JSON.parse(existing) : {};
  if (!config[rootKey] || typeof config[rootKey] !== 'object') config[rootKey] = {};
  if (uninstall) {
    delete config[rootKey][SERVER_KEY];
  } else {
    const entry = serverEntry();
    config[rootKey][SERVER_KEY] = entryTransform ? entryTransform(entry) : entry;
  }
  return JSON.stringify(config, null, 2) + '\n';
}

// ─── TOML 最小合併（Codex config.toml 專用，無外部依賴）─────────────────────

const TOML_SECTION_HEADER = `[mcp_servers.${SERVER_KEY}]`;

function tomlSection() {
  const entry = serverEntry();
  const args = entry.args.map((a) => JSON.stringify(a)).join(', ');
  return `${TOML_SECTION_HEADER}\ncommand = ${JSON.stringify(entry.command)}\nargs = [${args}]\n`;
}

function mergeTomlConfig(existing, uninstall) {
  const text = existing || '';
  // 移除既有 [mcp_servers.tool-calling] 區段（到下一個 section header 或 EOF）
  const sectionRe = new RegExp(
    `^\\[mcp_servers\\.${SERVER_KEY}\\]\\n(?:[^\\[][^\\n]*\\n|[^\\n]*\\n)*?(?=^\\[|\\s*$)`,
    'm'
  );
  const cleaned = text.replace(sectionRe, '');
  if (uninstall) return cleaned.trimEnd() + (cleaned.trim() ? '\n' : '');
  const sep = cleaned.trim() ? (cleaned.endsWith('\n') ? '\n' : '\n\n') : '';
  return cleaned.trimEnd() + sep + tomlSection();
}

// ─── 計畫產生（純函式，供測試與 --dry-run 使用）─────────────────────────────

/**
 * 建立安裝/卸載計畫
 * @param {{ides: string[], scope: string, targetDir?: string, uninstall?: boolean, withSkills?: boolean}} opts
 */
export function buildPlan(opts) {
  const { ides, scope, uninstall = false, withSkills = false } = opts;
  const project = resolve(opts.targetDir || process.cwd());
  const plan = [];

  for (const ide of ides) {
    const def = IDE_MATRIX[ide];
    if (!def) {
      plan.push({ ide, action: 'error', file: '', scope, note: `不支援的 IDE: ${ide}` });
      continue;
    }
    if (!def.scopes.includes(scope)) {
      plan.push({
        ide,
        action: 'skip',
        file: '',
        scope,
        note: `${def.label} 僅支援 ${def.scopes.join('/')} scope`,
      });
      continue;
    }

    const file = def.file(scope, project);
    const existing = existsSync(file) ? readFileSync(file, 'utf8') : '';
    const after =
      def.format === 'toml'
        ? mergeTomlConfig(existing, uninstall)
        : mergeJsonConfig(existing, def.rootKey, uninstall, def.entryTransform);

    plan.push({
      ide,
      action: existsSync(file) ? (uninstall ? 'merge-remove' : 'merge-update') : 'create',
      file,
      scope,
      after,
    });

    if (withSkills && def.skillDir) {
      plan.push({
        ide,
        action: uninstall ? 'remove-skill' : 'copy-skill',
        file: join(def.skillDir(scope, project), 'tool-calling'),
        scope,
        note: uninstall ? undefined : `複製 ${SKILL_SRC}`,
      });
    }
  }
  return plan;
}

/** 執行計畫（dryRun=true 時只回傳不寫入） */
export function applyPlan(plan, { dryRun = false } = {}) {
  const results = [];
  for (const step of plan) {
    if (step.action === 'skip' || step.action === 'error') {
      results.push({ ...step, ok: false });
      continue;
    }
    if (dryRun) {
      results.push({ ...step, ok: true, dryRun: true });
      continue;
    }
    try {
      if (step.action === 'copy-skill') {
        mkdirSync(dirname(step.file), { recursive: true });
        cpSync(SKILL_SRC, step.file, { recursive: true });
      } else if (step.action === 'remove-skill') {
        if (existsSync(step.file)) rmSync(step.file, { recursive: true, force: true });
      } else {
        mkdirSync(dirname(step.file), { recursive: true });
        writeFileSync(step.file, step.after, 'utf8');
      }
      results.push({ ...step, ok: true });
    } catch (err) {
      results.push({ ...step, ok: false, note: err.message });
    }
  }
  return results;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

function printMatrix() {
  console.log('🔌 Tool-Calling 外掛支援矩陣\n');
  for (const [ide, def] of Object.entries(IDE_MATRIX)) {
    console.log(`  ${ide.padEnd(12)} ${def.label.padEnd(28)} scope: ${def.scopes.join(', ')}`);
  }
  console.log('\n範例：');
  console.log('  node scripts/install-plugin.js --ide all --scope global');
  console.log('  node scripts/install-plugin.js --ide claude --scope project --target <你的專案>');
}

function main(argv) {
  const args = { ides: [], scope: 'global', uninstall: false, withSkills: false, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--list') return printMatrix();
    if (a === '--ide') args.ides = argv[++i].split(',').map((s) => s.trim());
    else if (a === '--scope') args.scope = argv[++i];
    else if (a === '--target') args.targetDir = argv[++i];
    else if (a === '--uninstall') args.uninstall = true;
    else if (a === '--with-skills') args.withSkills = true;
    else if (a === '--dry-run') args.dryRun = true;
  }

  if (args.ides.length === 0) {
    console.error('❌ 請指定 --ide（可用 --list 查看支援清單）');
    process.exit(1);
  }
  if (args.ides.includes('all')) {
    args.ides = Object.keys(IDE_MATRIX).filter((ide) =>
      IDE_MATRIX[ide].scopes.includes(args.scope)
    );
  }

  const plan = buildPlan(args);
  const results = applyPlan(plan, { dryRun: args.dryRun });

  console.log(args.dryRun ? '🔍 Dry-run 計畫（未寫入任何檔案）：\n' : '🔌 執行結果：\n');
  let failCount = 0;
  for (const r of results) {
    const icon = r.ok ? '✅' : r.action === 'skip' ? '⏭️' : '❌';
    if (!r.ok && r.action !== 'skip') failCount++;
    console.log(`  ${icon} [${r.ide}] ${r.action} → ${r.file || '-'}`);
    if (r.note) console.log(`       ${r.note}`);
  }
  console.log(
    args.dryRun
      ? '\n（以上為預覽，移除 --dry-run 重新執行即可實際寫入）'
      : `\n${failCount === 0 ? (args.uninstall ? '🎉 卸載完成！重啟 IDE 後生效。' : '🎉 完成！重啟 IDE 後即可使用 13 個 tool-calling MCP 工具。') : `⚠️ ${failCount} 個步驟失敗`}`
  );
  if (failCount > 0) process.exit(1);
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main(process.argv.slice(2));

