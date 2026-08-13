# Tool-Calling 喚醒技能使用指南

## 如何使用

### 方法一：放入專案目錄（推薦）

將 `.trae/skills/tool-calling/` 目錄複製到任何 Trae 專案中：

```bash
# 在你的目標專案中執行
mkdir -p .trae/skills
cp -r d:\Self-developed_Apps\Tool-Calling\.trae\skills\tool-calling .trae/skills/
```

然後在 Trae 中使用以下任何「喚醒咒語」：

| 咒語 | 用法 |
|------|------|
| `/tc` | `/tc 找工具` |
| `/tool-calling` | `/tool-calling search AI agent` |
| `找工具` | `找工具 圖片生成` |
| `tool call` | `let me tool call` |
| `skills` | `show me skills` |
| `工具庫` | `工具庫有什麼` |

### 方法二：使用全局配置（僅此專案）

如果是 Tool-Calling 專案本身，技能已放在 `.trae/skills/tool-calling/`。

## 測試方法

1. 在 Trae 中開啟包含 `.trae/skills/tool-calling/SKILL.md` 的專案
2. 輸入任一喚醒咒語，例如：`/tc PDF`
3. Trae 會自動載入此技能並執行搜尋

## 注意事項

- 確保 `d:/Self-developed_Apps/Tool-Calling/` 路徑正確
- 首次使用需 `npm install`
- MCP 模式需在獨立終端啟動：`npm run mcp`
