# Tool-Calling 🔧⚡

> 一個幫你自動找工具、裝工具、用工具的全自動 AI 助手、多工具協同與知識圖譜系統

## 這是什麼？

想像你有一個 **全功能 AI 工具箱**，裡面收錄了 **381+ 個頂尖開源 AI 工具與 Agent 技能**：

- 📊 **數據與分析**：Grafana、Pandas-AI、PostHog、PyGWalker
- 📄 **簡報與文件生產力**：AIPPT、NotebookLM2PPT、Docling、Reader3、PPT Master
- 🧠 **知識管理與圖譜**：Graphify、Ontology、RAGFlow、Awesome LLM Apps
- 🤖 **AI 框架與 MCP**：LangChain、Dify、CrewAI、AutoGen、Langflow
- 🕷️ **網頁爬蟲與擷取**：Crawl4AI、Firecrawl、Crawlee、Scrapy、Selenium、Playwright、BeautifulSoup4
- 🧪 **測試與自動化**：Playwright、n8n、Browser-Use
- 🎨 **多媒體與設計**：Stable Diffusion、ComfyUI、Canvas
- 還有更多……

**這個專案的作用就是：** 當你需要完成某項任務時，它能透過 **五維度競品重排矩陣** 自動為你篩選最適工具，透過 **多工具鏈規劃器** 組合多個工具協同運作，透過 **白話互動問答** 逼近真實需求，並且在執行驗證完成後 **自動解耦清理**，不為你的新專案增加任何維護負擔！

---

## ⚡ 核心亮點功能 (Phases 106 - 111)

1. 🗺️ **複雜任務多工具鏈自動規劃 (Tool Chain Planner)**：
   - 專案開發往往需要多個工具協同（例如：`網頁爬蟲` + `LLM RAG 清洗` + `簡報生成`）。
   - 自動將長任務 Prompt 拆解為 DAG 執行流程圖，定義輸入/輸出 Data Flow 介面與備選競品。
2. 🏆 **五維度競品適配重排矩陣 (5D Disambiguation Matrix)**：
   - 解決同類工具混淆問題（如 6 大網頁爬蟲工具之選擇）。
   - 計算程式語言對齊 (+30%/-35%)、下游場景匹配 (RAG/E2E/Pipeline)、禁用場景硬性門禁 (Negative Constraints -60%) 與 GitHub Stars 加權。
3. 💬 **親和白話需求導向互動引導問答 (Jargon-Free Interactive Interview)**：
   - 徹底剔除生澀專業術語！當需求模糊時，透過 3 步直覺情境問答（開發語言、真實用途、網頁動態畫面）主動逼近用戶真實需求。
4. 🛡️ **沙盒環境預檢與安全調用驗證器 (Pre-flight Sandbox Validator)**：
   - 一鍵預檢本機 `Node.js`, `Python`, `pip`, `npx`, `Git`, `Docker` 相依環境準備狀況。
5. 🔥 **雲端 Auto-Trending 自動探勘管道 (Auto-Trending Discovery)**：
   - 連線 GitHub Search API 自動探勘新漲星熱門 AI Agent 與 MCP 專案並去重佇列化。

---

## 🚀 CLI 完整指令指南

打開心命令提示字元（CMD / PowerShell），即可調用全功能 CLI：

```bash
# 最常見用法
node cli.js search "Python RAG 網頁爬蟲"
node cli.js plan "抓取動態網頁內容，並轉成簡報"
node cli.js interview "網頁爬蟲"
```

### 指令對照表

| 功能類別 | CLI 指令 | 說明 |
|---|---|---|
| **搜尋與比較** | `node cli.js search "<需求>"` | 三層檢索（L1精確/L2關鍵字/L3語意）工具 |
| | `node cli.js compare "<需求>"` | 輸出 **五維度競品適配矩陣** 與 Trade-offs 理由 |
| | `node cli.js interview "<需求>"` | 啟動 **親和白話互動問答** 逼近真實需求 |
| **工具鏈與預檢**| `node cli.js plan "<長任務描述>"` | 自動規劃 **多工具協同 DAG 流程圖** 與 Data Flow 介面 |
| | `node cli.js verify-environment <id>` | 執行 **沙盒環境預檢**（Node, Python, Docker 等） |
| **目錄與詳情** | `node cli.js list` | 列出所有已註冊工具 (可用 `-c <分類>` 過濾) |
| | `node cli.js info <tool-id>` | 查看工具詳細詮釋資料、語言與場景標籤 |
| **新增與管理** | `node cli.js add <github-url>` | 新增單一工具並自動補齊詮釋資料 |
| | `node cli.js batch-add urls.txt` | 批量新增（自動分類、去重、Monorepo 拆解） |
| | `node cli.js index-subtools <id>` | 深層拆解 Monorepo 子工具 |
| | `node cli.js discover-trending` | 自動探勘 GitHub Trending 熱門專案 |
| | `node cli.js cleanup <tool-id>` | 任務完成後 **解耦與零負擔清理** 工具 |
| | `node cli.js validate` | 執行工具庫詮釋資料品質門禁驗證 |

---

## 🧙‍♂️ 全自動工具調用與多工具協同 SOP

在其他 Agent 或專案對話中說出喚醒咒語：

> **喚醒咒語**：「啟動全自動工具調用模式：[用戶的任務描述]」

Agent 將嚴格遵循以下四階段 SOP 執行：

1. **階段 1：白話模糊需求釐清 (Interactive Clarification)**：
   - 避免生澀術語，透過 2~3 個親和白話問題釐清語言偏好、真實用途與畫面防護需求，禁止盲猜。
2. **階段 2：多工具鏈選型與 DAG 規劃 (Multi-Tool Chain Planning)**：
   - 執行 `node cli.js plan` 自動分解多步驟任務，為每個步驟匹配 **最適首選工具** 與 **備選競品**。
3. **階段 3：彈性協同開發與環境預檢 (Flexible Synergy & Sandbox Verification)**：
   - 工具可整合進新專案（`npm`/`pip`），亦可獨立運行（CLI, Docker, Daemon, MCP）。
   - 執行前呼叫 `node cli.js verify-environment` 完成環境預檢。
4. **階段 4：任務結束自動解耦與清理 (Post-Task Decoupling & Cleanup)**：
   - 開發驗證完成後，若新專案不需永久保留該工具，執行 `node cli.js cleanup` 自動卸載。
   - 確保目標專案代碼庫保持 MECE 乾淨整潔，不增加任何維護與效能負擔！

---

## 🌐 網頁控制台與 2D/3D 互動式知識圖譜 Web UI

開啟專案下的 `web/index.html` 或執行打包 `node scripts/build-web.js`：

全站包含 **4 大視圖分頁**，由全域 `AppState` 單一真理來源實時連動：

1. 📊 **儀表板總覽**：KPI 統計指標、Chart.js 分類與語言分佈圖、分類 Overview。
2. 🔧 **工具目錄列表**：三層檢索（L1精態/L2關鍵字/L3語意）工具卡片與 Match 比例。
3. 🔥 **每週漲星榜**：自動探勘 GitHub 當週熱門漲星排行榜。
4. 🌐 **2D/3D 雙視角全景知識圖譜 (Knowledge Graph)**：
   - **100% Data-Driven**：所有節點、描述、數字與關聯 100% 由 `tools.json` 動態運算產生。
   - **🌌 3D 宇宙視角 & 📄 2D 平面視角一鍵切換**。
   - **平移與對焦**：`Shift` + 滑鼠左鍵拖曳 100% 平滑平移視角，滾輪精準縮放。

---

## 🔌 MCP Server 整合 (Claude Desktop & Cursor)

### 1. Claude Desktop
在 `%APPDATA%\Claude\claude_desktop_config.json` 寫入：
```json
{
  "mcpServers": {
    "tool-calling": {
      "command": "node",
      "args": ["D:\\YourPath\\Tool-Calling\\mcp-server.js"]
    }
  }
}
```

### 2. Cursor
前往 Settings → Features → MCP → Add New MCP Server：
- Name: `tool-calling`
- Type: `Command`
- Command: `node D:\YourPath\Tool-Calling\mcp-server.js`

---

## 📂 專案檔案結構說明 (MECE 分類)

```
Tool-Calling/
├── cli.js              ← CLI 命令列控制端（支援 search, plan, compare, interview, verify-environment, cleanup 等）
├── mcp-server.js       ← MCP 通訊伺服器（適配 Claude Desktop / Cursor）
├── registry/
│   ├── tools.json      ← 工具庫單一真理來源（目前 381 個 AI 工具）
│   └── trending-candidates.json ← 自動探勘熱門候選佇列
├── core/
│   ├── search-engine.js        ← 三層檢索 + 5D 競品適配重排 + 多工具鏈規劃器
│   ├── interactive-approximator.js ← 親和白話需求導向互動引導問答系統
│   ├── sandbox-validator.js    ← 沙盒環境與相依性預檢驗證器
│   ├── synonyms.generated.js   ← 同義詞自動探勘詞典
│   ├── installer.js            ← 動態工具安裝器 (支援 Sparse Checkout)
│   ├── sandbox.js              ← Docker 沙盒隔離執行環境
│   ├── telemetry.js            ← 工具調用軌跡追蹤
│   └── cleanup.js              ← 任務執行完畢清理器
├── scripts/
│   ├── auto-trending-discovery.js ← GitHub Trending 熱門專案自動探勘
│   ├── build-web.js            ← 靜態 Web 與圖譜打包發行腳本
│   ├── generate-knowledge-graph.js ← 100% Data-Driven 互動式圖譜生成器
│   ├── enrich-registry.js      ← AI 批次補齊 recommended useCase 與 constraints
│   ├── mine-synonyms.js        ← 同義詞自動探勘腳本
│   └── scan-monorepo.js        ← Monorepo 深層索引拆解器
├── tests/
│   ├── search.test.js          ← 核心檢索單元測試
│   ├── tool-chain.test.js      ← 多工具鏈規劃單元測試
│   └── sandbox.test.js         ← 沙盒預檢單元測試
├── web/
│   ├── index.html              ← 全站 4 大分頁 Web 主介面
│   ├── style.css               ← 暗色系毛玻璃與 Design Tokens 樣式
│   └── app.js                  ← AppState 4 視圖連動引擎
└── .agents/
    ├── AGENTS.md               ← 專案級開發 SOP 與多工具協同規則
    └── skills/tool-calling/    ← Custom Skill 權威規範檔
```

---

License: MIT
