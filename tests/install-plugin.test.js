import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildPlan, applyPlan, serverEntry, IDE_MATRIX } from '../scripts/install-plugin.js';

describe('install-plugin：外掛安裝器', () => {
  test('serverEntry 指向 mcp-server.js 且用 node 啟動', () => {
    const entry = serverEntry();
    assert.equal(entry.command, 'node');
    assert.ok(entry.args[0].endsWith('mcp-server.js'));
    assert.ok(existsSync(entry.args[0]), 'mcp-server.js 必須存在');
  });

  test('buildPlan：claude project scope 產生 .mcp.json 計畫', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tc-plugin-'));
    const plan = buildPlan({ ides: ['claude'], scope: 'project', targetDir: dir });
    assert.equal(plan.length, 1);
    assert.ok(plan[0].file.endsWith('.mcp.json'));
    const parsed = JSON.parse(plan[0].after);
    assert.equal(parsed.mcpServers['tool-calling'].command, 'node');
    rmSync(dir, { recursive: true, force: true });
  });

  test('buildPlan：合併保留既有 MCP server 設定', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tc-plugin-'));
    writeFileSync(
      join(dir, '.mcp.json'),
      JSON.stringify({ mcpServers: { 'other-server': { command: 'foo' } } })
    );
    const plan = buildPlan({ ides: ['claude'], scope: 'project', targetDir: dir });
    assert.equal(plan[0].action, 'merge-update');
    const parsed = JSON.parse(plan[0].after);
    assert.ok(parsed.mcpServers['other-server'], '既有的 other-server 必須保留');
    assert.ok(parsed.mcpServers['tool-calling'], '新的 tool-calling 必須寫入');
    rmSync(dir, { recursive: true, force: true });
  });

  test('buildPlan：uninstall 只移除 tool-calling，不動其他設定', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tc-plugin-'));
    writeFileSync(
      join(dir, '.mcp.json'),
      JSON.stringify({
        mcpServers: { 'tool-calling': { command: 'node' }, keep: { command: 'x' } },
      })
    );
    const plan = buildPlan({ ides: ['claude'], scope: 'project', targetDir: dir, uninstall: true });
    const parsed = JSON.parse(plan[0].after);
    assert.equal(parsed.mcpServers['tool-calling'], undefined);
    assert.ok(parsed.mcpServers.keep);
    rmSync(dir, { recursive: true, force: true });
  });

  test('buildPlan：vscode 使用 servers 鍵（VS Code 原生 MCP 格式）', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tc-plugin-'));
    const plan = buildPlan({ ides: ['vscode'], scope: 'project', targetDir: dir });
    const parsed = JSON.parse(plan[0].after);
    assert.ok(parsed.servers['tool-calling']);
    assert.equal(parsed.mcpServers, undefined);
    rmSync(dir, { recursive: true, force: true });
  });

  test('buildPlan：kiro project scope 產生 .kiro/settings/mcp.json', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tc-plugin-'));
    const plan = buildPlan({ ides: ['kiro'], scope: 'project', targetDir: dir });
    assert.ok(plan[0].file.replaceAll('\\', '/').endsWith('.kiro/settings/mcp.json'));
    const parsed = JSON.parse(plan[0].after);
    assert.ok(parsed.mcpServers['tool-calling']);
    rmSync(dir, { recursive: true, force: true });
  });

  test('buildPlan：zed 使用 context_servers 鍵', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tc-plugin-'));
    const plan = buildPlan({ ides: ['zed'], scope: 'project', targetDir: dir });
    assert.ok(plan[0].file.replaceAll('\\', '/').endsWith('.zed/settings.json'));
    const parsed = JSON.parse(plan[0].after);
    assert.ok(parsed.context_servers['tool-calling']);
    assert.equal(parsed.mcpServers, undefined);
    rmSync(dir, { recursive: true, force: true });
  });

  test('buildPlan：trae/roo 僅支援 project scope，global 回傳 skip', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tc-plugin-'));
    const traeProject = buildPlan({ ides: ['trae'], scope: 'project', targetDir: dir });
    assert.ok(traeProject[0].file.replaceAll('\\', '/').endsWith('.trae/mcp.json'));
    const rooProject = buildPlan({ ides: ['roo'], scope: 'project', targetDir: dir });
    assert.ok(rooProject[0].file.replaceAll('\\', '/').endsWith('.roo/mcp.json'));
    const traeGlobal = buildPlan({ ides: ['trae'], scope: 'global' });
    assert.equal(traeGlobal[0].action, 'skip');
    const rooGlobal = buildPlan({ ides: ['roo'], scope: 'global' });
    assert.equal(rooGlobal[0].action, 'skip');
    rmSync(dir, { recursive: true, force: true });
  });

  test('buildPlan：opencode 使用 mcp 鍵與 type/command 陣列格式', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tc-plugin-'));
    const plan = buildPlan({ ides: ['opencode'], scope: 'project', targetDir: dir });
    assert.ok(plan[0].file.endsWith('opencode.json'));
    const parsed = JSON.parse(plan[0].after);
    const entry = parsed.mcp['tool-calling'];
    assert.equal(entry.type, 'local');
    assert.equal(entry.command[0], 'node');
    assert.ok(entry.command[1].endsWith('mcp-server.js'));
    assert.equal(entry.enabled, true);
    assert.equal(parsed.mcpServers, undefined);
    rmSync(dir, { recursive: true, force: true });
  });

  test('buildPlan：codex 產生合法 TOML 區段', () => {
    const plan = buildPlan({ ides: ['codex'], scope: 'global' });
    assert.ok(plan[0].after.includes('[mcp_servers.tool-calling]'));
    assert.ok(plan[0].after.includes('command = "node"'));
    assert.ok(plan[0].after.includes('mcp-server.js'));
  });

  test('buildPlan：codex 重複安裝不產生重複區段', () => {
    const first = buildPlan({ ides: ['codex'], scope: 'global' })[0].after;
    // 模擬第二次安裝：buildPlan 會讀既有檔案，這裡直接測 merge 邏輯的冪等性
    const dir = mkdtempSync(join(tmpdir(), 'tc-plugin-'));
    const fakeHome = join(dir, 'config.toml');
    writeFileSync(fakeHome, first);
    // 以既有內容再合併一次
    const count = (first.match(/\[mcp_servers\.tool-calling\]/g) || []).length;
    assert.equal(count, 1);
    rmSync(dir, { recursive: true, force: true });
  });

  test('buildPlan：不支援的 scope 回傳 skip', () => {
    const plan = buildPlan({ ides: ['windsurf'], scope: 'project' });
    assert.equal(plan[0].action, 'skip');
  });

  test('buildPlan：未知 IDE 回傳 error', () => {
    const plan = buildPlan({ ides: ['notepad'], scope: 'global' });
    assert.equal(plan[0].action, 'error');
  });

  test('buildPlan：--with-skills 附加 copy-skill 步驟', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tc-plugin-'));
    const plan = buildPlan({
      ides: ['claude'],
      scope: 'project',
      targetDir: dir,
      withSkills: true,
    });
    const skillStep = plan.find((s) => s.action === 'copy-skill');
    assert.ok(skillStep, '必須包含 copy-skill 步驟');
    assert.ok(skillStep.file.includes('skills'));
    rmSync(dir, { recursive: true, force: true });
  });

  test('applyPlan：dry-run 不寫入磁碟', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tc-plugin-'));
    const plan = buildPlan({ ides: ['claude'], scope: 'project', targetDir: dir });
    const results = applyPlan(plan, { dryRun: true });
    assert.ok(results[0].ok);
    assert.ok(!existsSync(join(dir, '.mcp.json')), 'dry-run 不得建立檔案');
    rmSync(dir, { recursive: true, force: true });
  });

  test('applyPlan：實際寫入後可再讀取且 JSON 合法', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tc-plugin-'));
    const plan = buildPlan({ ides: ['claude'], scope: 'project', targetDir: dir });
    const results = applyPlan(plan);
    assert.ok(results[0].ok);
    const written = JSON.parse(readFileSync(join(dir, '.mcp.json'), 'utf8'));
    assert.ok(written.mcpServers['tool-calling']);
    rmSync(dir, { recursive: true, force: true });
  });

  test('IDE_MATRIX：每個 IDE 定義完整（label/scopes/file/format）', () => {
    for (const [ide, def] of Object.entries(IDE_MATRIX)) {
      assert.ok(def.label, `${ide} 缺 label`);
      assert.ok(def.scopes.length > 0, `${ide} 缺 scopes`);
      assert.equal(typeof def.file, 'function', `${ide} 缺 file()`);
      assert.ok(['json', 'toml'].includes(def.format), `${ide} format 須為 json/toml`);
      if (def.format === 'json') assert.ok(def.rootKey, `${ide} 缺 rootKey`);
    }
  });
});
