# Tool-Calling：全自動工具調用效能外掛系統
#
# 平台: VSCode GitHub Copilot
# 位置: .github/copilot-instructions.md
# 觸發咒語: 「啟動全自動工具調用模式」

## 系統說明

Tool-Calling 提供結構化的工具註冊庫與三層檢索引擎（精確匹配 → 關鍵字匹配 → 語義檢索），
讓 AI 助手能自動識別、選擇並調用最適合用戶任務的開發工具。

## 觸發條件

- 用戶說出「啟動全自動工具調用模式」
- 用戶任務涉及簡報、知識圖譜、安全測試、圖片/影片生成、瀏覽器測試、檔案系統操作

## 操作

```bash
node d:/Self-developed_Apps/Tool-Calling/cli.js search "<任務描述>"
node d:/Self-developed_Apps/Tool-Calling/cli.js list
node d:/Self-developed_Apps/Tool-Calling/cli.js info <tool-id>
node d:/Self-developed_Apps/Tool-Calling/cli.js add <github-url>
```

## SOP: 解析意圖 → 檢索工具 → 評估信心度 → 動態安裝 → 執行 → 清理

## 完整指引: d:/Self-developed_Apps/Tool-Calling/skill/core-instructions.md
