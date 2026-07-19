# Tool-Calling：全自動工具調用效能外掛系統

> **系統級規則 (System-level Prompt)**
> **觸發咒語**: 「啟動全自動工具調用模式」

## 系統說明
本專案是一套 AI Agent 工具調用基礎設施。當用戶的任務匹配已註冊工具的關鍵字時，自動檢索並推薦最適合的開發工具。目前系統內含有超過 140+ 個工具。

## 觸發條件
- 用戶說出「啟動全自動工具調用模式」
- 用戶任務涉及已註冊的各領域功能（如簡報製作、知識圖譜、安全測試、多媒體生成、框架學習等）。

## 操作方式

### 搜尋工具
支援 L1精確/L2關鍵字/L3語義 混合檢索，並支援前置分類過濾。
```bash
node cli.js search "<任務描述>"
node cli.js search -c "<分類>" "<任務描述>"
```

### 列出所有工具
```bash
node cli.js list
node cli.js list -c "<分類>"
```

### 查看工具詳情
```bash
node cli.js info <tool-id>
```

### 新增工具
```bash
node cli.js add <github-url>
node cli.js batch-add <urls.txt>
```

### 安裝/清理
```bash
node cli.js install <tool-id>
node cli.js cleanup <tool-id>
```

## 全自動調用 SOP
1. 解析用戶意圖，提取關鍵字與場景。
2. 執行 `search` 命令檢索最適工具。
3. 嚴格遵守禁用場景 (Negative Constraints)：若工具帶有 `🚫 禁用場景` 且符合用戶意圖，則禁止使用該工具。
4. 優先挑選 `⭐ 場景` 符合且分數超過 30% 的工具。
5. 根據 `info` 中提供的 `install` 指令，使用 `node cli.js install <tool-id>` 動態安裝工具。
6. 調用工具完成任務。
7. 任務結束後，使用 `node cli.js cleanup <tool-id>` 清理臨時安裝的工具。
