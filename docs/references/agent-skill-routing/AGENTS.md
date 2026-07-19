# Tool-Calling：全自動工具調用效能外掛系統

> **平台**: ChatGPT (Codex) / OpenCode / 通用 AGENTS.md 標準
> **觸發咒語**: 「啟動全自動工具調用模式」

## 系統說明

Tool-Calling 是一套 AI Agent 工具調用基礎設施，提供結構化的工具註冊庫與三層檢索引擎，
讓 AI 助手能自動識別、選擇並調用最適合用戶任務的開發工具。

## 觸發條件

啟用本系統的條件：
- 用戶說出「啟動全自動工具調用模式」
- 用戶任務匹配已註冊工具的觸發關鍵字
- 用戶明確提到某個工具名稱

## CLI 命令

```bash
# 搜尋工具
node d:/Self-developed_Apps/Tool-Calling/cli.js search "<任務描述>"

# 列出所有工具
node d:/Self-developed_Apps/Tool-Calling/cli.js list

# 查看詳情
node d:/Self-developed_Apps/Tool-Calling/cli.js info <tool-id>

# 新增工具
node d:/Self-developed_Apps/Tool-Calling/cli.js add <github-url>

# 批量新增
node d:/Self-developed_Apps/Tool-Calling/cli.js batch-add <urls.txt>

# 驗證格式
node d:/Self-developed_Apps/Tool-Calling/cli.js validate
```

## 全自動調用 SOP

1. 解析意圖 → 2. 檢索工具 → 3. 評估信心度 → 4. 動態安裝 → 5. 執行任務 → 6. 清理復歸

## 已註冊工具

PPT Master | Graphify | Strix | AI Animation Video Generator | Open Generative AI | ImaginAIry | Vercel AI SDK Skills | Total TypeScript Skills | Playwright | Flysystem

## 完整指引

詳見：`d:/Self-developed_Apps/Tool-Calling/skill/core-instructions.md`
