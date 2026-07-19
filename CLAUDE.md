# Tool-Calling：全自動工具調用效能外掛系統

> **平台**: Claude Code / Claude CLI
> **觸發咒語**: 「啟動全自動工具調用模式」

## 系統說明

本專案是一套 AI Agent 工具調用基礎設施。當用戶的任務匹配已註冊工具的關鍵字時，
自動檢索並推薦最適合的開發工具。

## 觸發條件

- 用戶說出「啟動全自動工具調用模式」
- 用戶任務涉及：簡報製作、知識圖譜、安全測試、圖片/影片生成、瀏覽器自動化、檔案系統操作等

## 操作方式

### 搜尋工具
```bash
node d:/Self-developed_Apps/Tool-Calling/cli.js search "<任務描述>"
```

### 列出所有工具
```bash
node d:/Self-developed_Apps/Tool-Calling/cli.js list
```

### 查看工具詳情
```bash
node d:/Self-developed_Apps/Tool-Calling/cli.js info <tool-id>
```

### 新增工具
```bash
node d:/Self-developed_Apps/Tool-Calling/cli.js add <github-url>
```

## 全自動調用流程

1. 解析用戶意圖，提取關鍵字
2. 執行 `search` 命令檢索最適工具
3. 信心度 ≥ 30% 的工具納入候選
4. 根據 `install` 欄位動態安裝工具
5. 調用工具完成任務
6. 清理臨時安裝的工具

## 已註冊工具（10 個）

- PPT Master（簡報）、Graphify（知識圖譜）、Strix（安全測試）
- AI Animation Video Generator（動畫）、Open Generative AI（200+ AI 模型）、ImaginAIry（圖片生成）
- Vercel AI SDK Skills（AI 框架）、Total TypeScript Skills（TS 學習）
- Playwright（E2E 測試）、Flysystem（PHP 檔案系統）

## 完整指引

詳見：`d:/Self-developed_Apps/Tool-Calling/skill/core-instructions.md`
