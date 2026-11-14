import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { AGENTS_CATALOG, buildMcpConfigText, buildCliInstallCommand } from '../web/agents-guide.js';
import { IDE_MATRIX } from '../scripts/install-plugin.js';

const SCREENSHOT_AGENT_NAMES = [
  'Agnes Code',
  'Antigravity',
  'ChatGPT Classic',
  'Cline',
  'DeepSeek Harness',
  'Kiro',
  'KiroCrew',
  'MiniMax Code',
  'OpenCode',
  'Qoder',
  'TRAE',
  'WorkBuddy AI',
];

describe('agents-guide：桌面版 AI Agents 使用指南', () => {
  test('截圖內 12 款桌面版 AI Agents 全部收錄於 featured 群組', () => {
    const featuredNames = AGENTS_CATALOG.filter((a) => a.group === 'featured').map((a) => a.name);
    assert.equal(featuredNames.length, 12);
    for (const name of SCREENSHOT_AGENT_NAMES) {
      assert.ok(featuredNames.includes(name), `缺少截圖中的 AI Agent: ${name}`);
    }
  });

  test('所有 auto-mcp 代理皆對應至 install-plugin.js 的 IDE_MATRIX', () => {
    for (const agent of AGENTS_CATALOG) {
      if (agent.mode === 'auto-mcp') {
        assert.ok(agent.installIdeKey, `${agent.id} 缺少 installIdeKey`);
        assert.ok(IDE_MATRIX[agent.installIdeKey], `${agent.installIdeKey} 不存在於 IDE_MATRIX`);
        const cmd = buildCliInstallCommand(agent, 'D:\\Test\\Tool-Calling');
        assert.ok(cmd && cmd.includes(`--ide ${agent.installIdeKey}`), `${agent.id} 安裝指令格式異常`);
      }
    }
  });

  test('buildMcpConfigText：依指定路徑產生合法 JSON / TOML 設定', () => {
    const customPath = 'C:\\Workspace\\Tool-Calling';
    for (const agent of AGENTS_CATALOG) {
      const text = buildMcpConfigText(agent, customPath);
      if (!agent.mcpFormat) {
        assert.equal(text, null);
        continue;
      }
      assert.ok(text && text.includes('mcp-server.js'), `${agent.id} 必須包含 mcp-server.js 路徑`);
      if (agent.mcpFormat === 'toml') {
        assert.ok(text.includes('[mcp_servers.tool-calling]'));
      } else {
        const parsed = JSON.parse(text);
        if (agent.mcpFormat === 'opencode') {
          assert.equal(parsed.mcp['tool-calling'].type, 'local');
        } else if (agent.mcpFormat === 'servers') {
          assert.ok(parsed.servers['tool-calling']);
        } else if (agent.mcpFormat === 'context_servers') {
          assert.ok(parsed.context_servers['tool-calling']);
        } else {
          assert.ok(parsed.mcpServers['tool-calling']);
        }
      }
    }
  });
});
