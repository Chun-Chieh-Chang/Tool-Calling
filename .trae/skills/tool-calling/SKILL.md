---
name: "tool-calling"
description: "Wake word for Tool-Calling: search and invoke tools from the global tool library. Trigger with: /tc, /tool-calling, '找工具', 'tool call', 'skills', or when user asks about available tools/capabilities."
---

# Tool-Calling Skill

## Purpose

This skill activates the **Tool-Calling** global tool library — a curated registry of 300+ AI agents, skills, MCP tools, and automation frameworks. Use it to find, plan, and invoke tools for any development task.

## Wake Words (Triggers)

Invoke this skill when the user says ANY of the following:

| Wake Word | Language | Example |
|-----------|----------|---------|
| `/tc` | Slash command | `/tc PDF converter` |
| `/tool-calling` | Slash command | `/tool-calling search coding agent` |
| `找工具` | Chinese | `找工具 幫我處理 PDF` |
| `tool call` | English | `let me tool call for image generation` |
| `skills` | English | `show me available skills` |
| `工具庫` | Chinese | `工具庫有什麼可以用的` |
| `what tools` | English | `what tools can help with this` |

## How It Works

### Option A: CLI Mode (Terminal)

When user prefers terminal-based workflow:

```bash
# Search for tools matching a query
node d:/Self-developed_Apps/Tool-Calling/cli.js search "PDF 轉換"

# Plan a task using multiple tools
node d:/Self-developed_Apps/Tool-Calling/cli.js plan "爬取網站並生成報告"

# Get details about a specific tool
node d:/Self-developed_Apps/Tool-Calling/cli.js detail pdf-converter

# Run a skill
node d:/Self-developed_Apps/Tool-Calling/cli.js run summarize-pdf input.pdf output.txt
```

### Option B: MCP Server Mode (AI Agent Integration)

When the project needs persistent tool access (Claude Code, Cursor, etc.):

```bash
# Start MCP server
cd d:/Self-developed_Apps/Tool-Calling && npm run mcp
```

The MCP server exposes these tools to any MCP-compatible client:
- `find_skill` — search and return matching skills
- `search_tools` — semantic search across the tool registry
- `plan_task` — automatic multi-step task planning
- `invoke_tool` — execute a specific tool by ID

### Option C: Visual Dashboard

```bash
cd d:/Self-developed_Apps/Tool-Calling && npm start
```

Opens a browser-based dashboard at `http://localhost:3001` for browsing and searching tools.

## Common Workflows

### Workflow 1: Find a Tool for a Task

```
User: /tc 我需要一個圖片生成的工具
Agent: 
  1. Run: node cli.js search "image generation"
  2. Present top results with descriptions
  3. Ask which tool the user wants to use
  4. Optionally run: node cli.js detail <tool-id>
```

### Workflow 2: Plan a Complex Task

```
User: 幫我從網站抓資料並生成報告
Agent:
  1. Run: node cli.js plan "爬取網站資料並生成報告"
  2. Parse the JSON plan output
  3. Execute tools step by step with user confirmation
  4. Report progress and results
```

### Workflow 3: Check Available Tools by Category

```
User: 有哪些 AI 代理的工具
Agent:
  1. Run: node cli.js search "AI agent" --limit 10
  2. Group results by category (AI 代理, AI 框架, etc.)
  3. Present categorized list
```

## Quick Reference Commands

| Command | Purpose |
|---------|---------|
| `/tc <query>` | Search tools by query |
| `/tc list` | List all tools (with pagination) |
| `/tc detail <id>` | Show full details of a tool |
| `/tc plan <task>` | Auto-plan a multi-step task |
| `/tc run <tool-id>` | Execute a skill directly |
| `/tc mcps` | List available MCP servers |
| `/tc stats` | Show registry statistics |
| `/tc sync` | Refresh tool data from GitHub |

## Important Notes

1. **Tool-Calling path is fixed**: `d:/Self-developed_Apps/Tool-Calling/`
2. **Registry location**: `registry/tools.json` contains 300+ tools
3. **MCP servers**: Pre-configured at `c:/Users/ws61/.trae/mcps/s_Tool-Calling-9ee1a471/solo_agent/`
4. **Language**: The tool registry supports both English and Chinese queries
5. **Always confirm**: Before running `invoke_tool` on write-modifying operations, show the user what will be executed
