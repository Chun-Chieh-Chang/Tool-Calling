# Tool-Calling：全自動工具調用效能外掛系統

> **平台**: Kiro (AWS)
> **觸發咒語**: 「啟動全自動工具調用模式」

## 系統說明

Tool-Calling 提供結構化工具註冊庫與三層檢索引擎，自動識別最適合用戶任務的開發工具。

## 觸發條件

- 用戶說出「啟動全自動工具調用模式」
- 用戶任務匹配已註冊工具的觸發關鍵字
- 用戶明確提到某個工具名稱

## CLI 命令

```bash
node d:/Self-developed_Apps/Tool-Calling/cli.js search "<任務描述>"
node d:/Self-developed_Apps/Tool-Calling/cli.js list
node d:/Self-developed_Apps/Tool-Calling/cli.js info <tool-id>
node d:/Self-developed_Apps/Tool-Calling/cli.js add <github-url>
```

## SOP

解析意圖 → 檢索工具 → 評估信心度 → 動態安裝 → 執行任務 → 清理復歸

## 完整指引

詳見：`d:/Self-developed_Apps/Tool-Calling/skill/core-instructions.md`
