# 🔌 Tool-Calling 外掛安裝指南 — 任意 Agentic IDE 通用

> 本專案透過 **MCP（Model Context Protocol）+ Agent Skill** 雙介面，
> 可作為外掛掛載到任何支援 MCP 的 Agentic IDE / CLI。

---

## 🚀 一鍵安裝（推薦）

```bash
# 查看支援的 IDE 清單
node scripts/install-plugin.js --list

# 預覽（不寫入任何檔案）
node scripts/install-plugin.js --ide all --scope global --dry-run

# 全域安裝到所有支援的 IDE
node scripts/install-plugin.js --ide all --scope global

# 只裝到特定 IDE 的特定專案
node scripts/install-plugin.js --ide claude,cursor --scope project --target D:\path\to\your-project

# 連同行為 SOP（Agent Skill）一起安裝
node scripts/install-plugin.js --ide claude --scope project --with-skills

# 卸載（只移除 tool-calling，不動其他 MCP 設定）
node scripts/install-plugin.js --ide claude --scope project --uninstall
```

安裝完成後 **重啟 IDE**，即可使用 13 個 MCP 工具：
`search_tools`、`list_tools`、`get_tool_detail`、`plan_tool_chain`、`clarify_requirement`、
`plan_ingestion`、`find_skill`、`install_skill`、`run_tool_async`、`get_job_status`、
`cancel_job`、`list_jobs`、`get_job_stats`。

---

## 🗺️ 支援矩陣

| IDE | 全域 (global) | 專案 (project) | 設定檔位置 | 格式 |
|-----|:---:|:---:|---|:---:|
| Claude Code | ✅ `~/.claude.json` | ✅ `<proj>/.mcp.json` | `mcpServers` 鍵 | JSON |
| Cursor | ✅ `~/.cursor/mcp.json` | ✅ `<proj>/.cursor/mcp.json` | `mcpServers` 鍵 | JSON |
| Gemini CLI | ✅ `~/.gemini/settings.json` | ✅ `<proj>/.gemini/settings.json` | `mcpServers` 鍵 | JSON |
| Antigravity IDE | ✅ `~/.gemini/antigravity/mcp_config.json` | — | `mcpServers` 鍵 | JSON |
| Windsurf | ✅ `~/.codeium/windsurf/mcp_config.json` | — | `mcpServers` 鍵 | JSON |
| VS Code (Copilot/Cline) | — | ✅ `<proj>/.vscode/mcp.json` | `servers` 鍵 | JSON |
| Kiro | ✅ `~/.kiro/settings/mcp.json` | ✅ `<proj>/.kiro/settings/mcp.json` | `mcpServers` 鍵 | JSON |
| Zed | ✅ `~/.config/zed/settings.json`（Win: `%APPDATA%\Zed\settings.json`） | ✅ `<proj>/.zed/settings.json` | `context_servers` 鍵 | JSON |
| Trae | ⚠️ 僅能 UI 手動貼上 | ✅ `<proj>/.trae/mcp.json` | `mcpServers` 鍵 | JSON |
| Roo Code (VS Code 擴充) | ⚠️ 存在擴充 globalStorage | ✅ `<proj>/.roo/mcp.json` | `mcpServers` 鍵 | JSON |
| OpenCode | ✅ `~/.config/opencode/opencode.json` | ✅ `<proj>/opencode.json` | `mcp` 鍵 + `type/command[]` 格式 | JSON |
| OpenAI Codex CLI | ✅ `~/.codex/config.toml` | — | `[mcp_servers.tool-calling]` | TOML |

> ⚠️ = 該 scope 無文件化的設定檔路徑，需透過 IDE UI 手動設定；安裝器會自動 skip 並提示。
>
> **需手動設定（支援 MCP，但安裝器不涵蓋）**：
> - **Qoder**：支援 STDIO/SSE MCP，透過 GUI 編輯 JSON（Qoder Settings → MCP → My Servers → + Add），直接貼上 `mcpServers` 格式即可
> - **AgnesCode**：官方文件有「Configuring MCP Servers」章節（確認支援 MCP），但設定檔路徑未能從公開文件查證，請以其官方文件為準
> - **JetBrains Junie / AI Assistant**：透過 IDE GUI（Settings → Tools → AI Assistant → MCP）或 Junie CLI 設定
> - **Continue**：`~/.continue/config.yaml` 的 `mcpServers:` 區段（YAML 格式，請手動加入）
> - **Cline**：全域設定存於 VS Code 擴充 globalStorage（路徑隨安裝而異）；專案級可用上方 VS Code 原生 `.vscode/mcp.json`
>
> **未能確認 MCP 支援**（截至 2026-09 查證，公開文件無 MCP 章節）：
> HermesAgents（僅見 model provider 設定）、WorkBuddy（僅見模型/Skills 設定）。
> 此類工具可改用 AGENTS.md + CLI 方式整合（AGENTS.md 為跨工具標準）。
>
> **無原生 MCP 支援**（截至 2026-09 查證）：Aider（需第三方 bridge 才能使用 MCP 工具，可改用 AGENTS.md + CLI 方式整合）。

---

## ✍️ 手動設定（通用）

在任何 MCP 客戶端的設定中加入：

```json
{
  "mcpServers": {
    "tool-calling": {
      "command": "node",
      "args": ["<Tool-Calling 倉庫絕對路徑>/mcp-server.js"]
    }
  }
}
```

前置需求：Node.js ≥ 18，且已在倉庫根目錄執行過 `npm install`。

---

## 🧩 雙介面架構

```
┌────────────────────────────────────────────────┐
│              任意 Agentic IDE                   │
│  Claude Code / Cursor / Gemini / Codex / ...   │
└───────┬────────────────────────┬───────────────┘
        │ MCP (stdio)            │ Agent Skill (SKILL.md)
        ▼                        ▼
┌───────────────┐      ┌──────────────────────────┐
│ mcp-server.js │      │ skills/tool-calling/     │
│ 13 個功能工具  │      │ 四階段 SOP（行為協議）    │
└───────┬───────┘      └──────────────────────────┘
        ▼
┌────────────────────────────────────────────────┐
│  registry/tools.json（725+ 工具，單一真理來源） │
└────────────────────────────────────────────────┘
```

- **MCP = 功能介面**：檢索、規劃、釐清、執行等實際能力。
- **Skill = 行為介面**：告訴 Agent「何時觸發、按什麼 SOP 使用這些工具」，
  支援 `--with-skills` 安裝到 `.claude/skills/` 或 `.agents/skills/`。
- **AGENTS.md = 規範介面**：倉庫根目錄的 AGENTS.md 遵循 agents.md 標準，
  支援該標準的 IDE 會自動讀取本專案的行為協議。

---

## ⚠️ 注意事項

- 安裝器採 **合併寫入**，絕不覆蓋既有的其他 MCP server 設定。
- 搬移倉庫路徑後需重新執行安裝（設定檔內為絕對路徑）。
- 卸載只移除 `tool-calling` 相關條目，不影響其他設定。
