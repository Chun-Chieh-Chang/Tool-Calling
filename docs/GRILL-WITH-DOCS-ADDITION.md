# 工具加入記錄 - Grill With Docs

## 任務完成說明

已成功將 Matt Pocock 的 `/grill-with-docs` 技能加入工具庫，並配置為斜槓（"/"）命令形式調用。

## 修改檔案

### 1. 工具庫註冊 (`registry/tools.json`)
```json
{
  "id": "grill-with-docs",
  "name": "Grill With Docs",
  "url": "https://github.com/mattpocock/skills/tree/main/skills/engineering/grill-with-docs",
  "description": "A relentless interview to sharpen a plan or design, which also creates docs (ADR's and glossary) as we go.",
  "category": "研究",
  "language": "markdown",
  "triggers": [
    "/grill-with-docs",
    "grill-with-docs",
    "grill me",
    "stress-test",
    "design interview",
    "plan review"
  ],
  "install": {
    "method": "npx",
    "command": "npx skills@latest add mattpocock/skills --skill grill-with-docs"
  },
  "status": "active"
}
```

### 2. Skills 目錄結構
```
Tool-Calling/
├── .claude/
│   └── skills/
│       └── grill-with-docs.md   # Skill 文件（用於 Claude Code 識別）
├── .agents/
│   └── skills/
│       └── grill-with-docs.md   # 備份（Agent 標準路徑）
└── SKILL.md                     # 原始文件副本
```

## 驗證方式

### CLI 命令列驗證
```bash
# 搜尋斜槓命令
node cli.js search "/grill-with-docs"

# 查看工具詳情
node cli.js info grill-with-docs

# 列出所有工具
node cli.js list | findstr "grill"
```

### 測試結果
```
#1 Grill With Docs (grill-with-docs)
   信心度: █████████████░░░░░░░░░░░ 67%  [L2-keyword]
```

## AgnesCode 桌面應用使用方式

**方法一：直接使用（推薦）**
在 AgnesCode 聊天視窗中輸入：
```
/grill-with-docs 我想開發一個新的功能...
```
或
```
grill me about my authentication plan
```

**方法二：通過工具庫搜尋**
```bash
node cli.js search "grill"
```

**方法三：網頁 UI 驗證**
重新載入 `web/index.html`，在搜尋框輸入 `/grill-with-docs`

## 注意事項

1. **斜槓命令限制**：AgnesCode 桌面應用目前主要透過自然語言觸發工具，斜槓命令需在支援的編程代理（如 Claude Code、Cursor）中直接輸入

2. **重新啟動**：如果桌面應用顯示 "no command found"，請：
   - 關閉並重新開啟 AgnesCode
   - 或在設定中清除緩存後重啟

3. **MCP 集成**：如需 MCP Server 集成，需配置 `mcp-server.js` 並添加到 AgnesCode 設定

## 原始來源

- GitHub: https://github.com/mattpocock/skills/tree/main/skills/engineering/grill-with-docs
- Stars: 212,012 ⭐
- License: MIT

---
建立時間: 2026-08-10T13:20:00+08:00