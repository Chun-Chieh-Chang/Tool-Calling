# Tool-Calling：全自動工具調用效能外掛系統

> 核心指令模板 — 所有 AI IDE/Agent 平台共用

## 系統概述

Tool-Calling 是一套 AI Agent 工具調用基礎設施，為新專案開發提供「效能外掛助手」。
本系統維護一個結構化的工具註冊庫，內含多種開發工具的元資料（名稱、功能、觸發關鍵字、安裝方式等），
並提供三層檢索引擎（精確匹配 → 關鍵字匹配 → 語義檢索）來自動識別最適合用戶任務的工具。

## 觸發條件

當以下任一條件成立時，啟用本系統：

1. **咒語觸發**：用戶說出「啟動全自動工具調用模式」
2. **任務推斷**：用戶的任務描述匹配已註冊工具的觸發關鍵字（如「做簡報」→ PPT Master、「安全掃描」→ Strix）
3. **明確指名**：用戶提到某個已註冊工具的名稱（如 "playwright", "imaginairy"）

## CLI 命令

所有操作透過 Node.js CLI 執行（需 Node.js >= 18）：

```bash
# 搜尋最適工具（支援中英文自然語言）
node d:/Self-developed_Apps/Tool-Calling/cli.js search "<用戶任務描述>"

# 列出所有已註冊工具
node d:/Self-developed_Apps/Tool-Calling/cli.js list

# 查看工具詳情
node d:/Self-developed_Apps/Tool-Calling/cli.js info <tool-id>

# 新增工具
node d:/Self-developed_Apps/Tool-Calling/cli.js add <github-url>

# 批量新增
node d:/Self-developed_Apps/Tool-Calling/cli.js batch-add <urls.txt>

# 驗證註冊庫格式
node d:/Self-developed_Apps/Tool-Calling/cli.js validate

# 針對大補帖專案執行深層索引 (提取內部子工具)
node d:/Self-developed_Apps/Tool-Calling/cli.js index-subtools <tool-id>

# 健康檢查
node d:/Self-developed_Apps/Tool-Calling/cli.js health-check
```

## 全自動調用流程 (SOP)

當用戶說出「啟動全自動工具調用模式」後，依序執行：

1. **解析意圖** — 分析用戶的任務需求，提取關鍵字
2. **檢索工具** — 執行 `node cli.js search "<任務描述>"`，取得信心度排名。注意搜尋結果中的 `⭐ 場景` 與 `★ 優勢` 來區分同質工具。
3. **評估結果** — 信心度較高且 `useCase` 最吻合的工具納入候選；若無匹配，告知用戶並建議手動添加。
4. **安裝調用** — 根據工具的 `install` 欄位動態安裝（pip/npm/git clone，支援 Sparse Checkout）。
5. **執行任務** — 調用工具完成用戶任務
6. **清理復歸** — 任務完成後，移除臨時安裝的工具（刪除 `.temp/` 目錄），保持系統清潔

## 已註冊工具概覽（超過 140 個工具）

目前工具庫涵蓋多個領域，包含但不限於：
- **文件生產力**：AIPPT, NotebookLM2PPT, Markitdown...
- **知識管理**：Graphify, Ontology...
- **🤖 AI 框架**：Langchain, Dify, MetaGPT, CrewAI, Autogen...
- **測試與自動化**：Playwright, n8n...
- **多媒體生成**：Stable Diffusion WebUI, Open Generative AI...
- **學習資源**：技術面試寶典、系統設計指南等。

## 擴充方式

系統支援無限制新增工具：
- **CLI 單筆新增**：`node cli.js add <github-url/tree/main/subpath>`
- **批量匯入**：`node cli.js batch-add <urls.txt>`（每行一個 URL）
- **手動編輯**：直接修改 `registry/tools.json`（可手動擴充 `useCase` 與 `advantages`）

## 關鍵檔案位置

- 工具註冊庫：`d:/Self-developed_Apps/Tool-Calling/registry/tools.json`
- CLI 入口：`d:/Self-developed_Apps/Tool-Calling/cli.js`
- 檢索引擎：`d:/Self-developed_Apps/Tool-Calling/core/search-engine.js`
- JSON Schema：`d:/Self-developed_Apps/Tool-Calling/registry/schemas/tool.schema.json`
