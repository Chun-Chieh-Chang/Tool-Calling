---
name: tool-calling
description: 全自動工具調用外掛。當用戶說「啟動全自動工具調用模式」、使用 /tc 或 /tool-calling、詢問「有什麼工具可以…」、或需要多工具協同開發時觸發。提供 725+ AI 工具庫的三層檢索、五維度競品重排、多工具鏈 DAG 規劃、白話需求釐清，與任務完成後的自動解耦清理。
---

# Tool-Calling — 全自動工具調用與多工具協同開發

> **觸發方式**：「啟動全自動工具調用模式：[任務描述]」、`/tc <需求>`、`/tool-calling <需求>`、
> 或任何「找工具／選工具／多工具協同」類需求。

## 能力介面（依可用性擇一）

### 介面 A：MCP 工具（優先）
若當前環境已掛載 `tool-calling` MCP server，直接使用以下工具：

| MCP 工具 | 用途 |
|---------|------|
| `search_tools` | 融合檢索 725+ 工具庫（含誠實訊號與 LLM rerank） |
| `list_tools` / `get_tool_detail` | 瀏覽分類與工具詳情 |
| `plan_tool_chain` | 長任務 → 多工具鏈 DAG 規劃 |
| `clarify_requirement` | 低置信時產生白話釐清問題 |
| `plan_ingestion` | 素材 → 知識庫擷取管線規劃 |
| `find_skill` / `install_skill` | 搜尋與安裝 Agent Skills |
| `run_tool_async` 系列 | 非同步執行與 Job 管理 |

### 介面 B：CLI（無 MCP 時的後備）
設定環境變數 `TOOL_CALLING_HOME` 指向 Tool-Calling 倉庫根目錄後：

```bash
node "$TOOL_CALLING_HOME/cli.js" search "<需求>"      # 三層檢索
node "$TOOL_CALLING_HOME/cli.js" plan "<長任務>"      # 多工具鏈 DAG 規劃
node "$TOOL_CALLING_HOME/cli.js" interview "<需求>"   # 白話互動問答
node "$TOOL_CALLING_HOME/cli.js" compare <id1> <id2>  # 五維度競品矩陣
node "$TOOL_CALLING_HOME/cli.js" verify-environment   # 沙盒環境預檢
```

## 四階段 SOP

1. **模糊需求白話釐清**：禁止盲目猜測。關鍵問題（開發語言、真實用途、動態畫面與防護）
   先用直覺情境提問釐清；或呼叫 `clarify_requirement` / `cli.js interview`。
2. **多工具篩選與鏈式規劃**：呼叫 `plan_tool_chain` / `cli.js plan`，
   為每個子步驟產出首選工具、備選競品與 Input/Output 介面格式。
3. **彈性協同執行**：工具可作為 npm/pip 相依、獨立 CLI、Docker 或 MCP 服務運作；
   執行前先 `verify-environment` 預檢 Node/Python/Docker。
4. **任務結束自動解耦**：若目標專案不需永久保留工具，執行 `cli.js cleanup <tool-id>`，
   保持目標代碼庫零冗餘依賴。
