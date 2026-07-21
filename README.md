# Tool-Calling 🔧⚡

> **全自動工具調用效能外掛系統** — 新專案開發的 AI 工具調度助手

## 概述

Tool-Calling 是一套 AI Agent 工具調用基礎設施。當你說出咒語 **「啟動全自動工具調用模式」**，系統會自動：

1. 🔍 **識別** — 分析你的任務需求
2. 🎯 **檢索** — 從工具註冊庫中找出最適合的工具，並利用深層索引精確到特定子功能
3. 📦 **調用** — 動態安裝並執行工具 (支援 Sparse-Checkout 精準備份)
4. 🧹 **清理** — 任務完成後自動移除臨時工具

## 快速開始

```bash
# 列出所有已註冊工具
node cli.js list

# 搜尋工具（支援自然語言與分類過濾）
node cli.js search "我要做簡報"
node cli.js search "security vulnerability scan" -c "安全性"

# 查看工具詳情（包含 ⭐ 場景與 ★ 優勢）
node cli.js info playwright

# 執行工具：將於 Docker 沙盒內安全隔離執行，並自動處理相依套件
node cli.js invoke ppt-master

# 匯出資料集：將成功的遙測軌跡匯出為 SFT 微調專用的 JSONL
node cli.js export-dataset ./dataset.jsonl

# 新增單一工具 (支援 Github 單一目錄或檔案)
node cli.js add https://github.com/owner/repo/tree/main/subpath

# 批量新增多個工具
node cli.js batch-add urls.txt

# 對「大補帖」專案執行深層索引 (Deep Indexing)
node cli.js index-subtools agent-skills

# 驗證註冊庫格式
node cli.js validate
```

## 已註冊工具 (>265 庫)

庫中目前已收錄 **超過 265 個**頂尖開源代理技能、框架與學習資源。包含透過深層拆解所取得的上千個微技能。部分精選類別包含：
- 📄 **文件生產力**：AIPPT, NotebookLM2PPT, Markitdown...
- 🧠 **知識管理**：Graphify, Ontology...
- 🤖 **AI 框架**：Langchain, Dify, MetaGPT, CrewAI, Autogen...
- 🧪 **測試與自動化**：Playwright, n8n...
- 🎨 **多媒體生成**：Stable Diffusion WebUI, Open Generative AI...

## 安全性強化 (Phase 14)

`core/installer.js` 已全面強化防呆機制：
- ✅ `SAFE_REPO_URL` 白名單限制，僅允許 `https://github.com/<owner>/<repo>` 格式
- ✅ `assertSafeRef` 防護參數注入（阻擋 `-` 開頭）與路徑穿越（阻擋 `..`）
- ✅ 陣列傳參 + `--` 明確標記，避免 git 誤判旗標
- ✅ Git RCE 防禦：封鎖 `ext::` 傳輸協定等惡意 payload

## 核心特性：差異化與深層索引

系統內建了強大的工具解析能力：
1. **Deep Indexing (深層索引)**：對於包含了數十個技能的 Monorepo（如 `agent-skills`），透過 `index-subtools` 指令可剖開表層，精準萃取內部每一項微技能，讓 AI 一擊命中。
2. **Tool Differentiation (差異化對比)**：Schema 支援 `useCase` (最佳場景) 與 `advantages` (優勢清單)。檢索引擎會高亮展示這些特徵，讓 AI 在面對功能重疊的工具時能做出最聰明的決策。
3. **Category Routing (領域分類過濾)**：使用 `-c, --category` 參數，將搜尋空間瞬間降維，避免千級規模下的注意力稀釋。
4. **Hard Negatives (負樣本約束)**：支援 `negativeConstraints` (🚫 禁用場景)，當用戶查詢命中禁用詞彙時，強制扣除分數使該工具墊底，徹底杜絕工具使用幻覺。
5. **Sandbox Isolation (沙盒安全隔離)**：系統具備 `sandbox` 機制，所有的工具呼叫皆於 Docker 隔離環境中執行，完全免疫不受信任腳本帶來的 RCE 風險。
6. **Telemetry & Dynamic Weights (遙測動態評分)**：內建工具呼叫軌跡追蹤，會根據工具的執行成功率動態提升或重砍 TF-IDF 分數，使系統具備自我反省與演化的能力。

## 架構

```
Tool-Calling/
├── .agents/
│   └── AGENTS.md              # Agent 觸發指令與全域統一設定 (Single Source of Truth)
├── cli.js                     # CLI 入口
├── core/
│   ├── search-engine.js       # TF-IDF 三層檢索引擎 (Pure JS，支援瀏覽器與 Node)
│   ├── installer.js           # 動態安裝 (支援 Sparse Checkout)
│   ├── sandbox.js             # Docker 沙盒隔離環境生命週期管理
│   ├── telemetry.js           # 工具呼叫軌跡與成功率分析器
│   └── cleanup.js             # 清理機制
├── docs/
│   └── architecture/          # 技能路由優化白皮書與架構圖
├── registry/
│   ├── tools.json             # 工具註冊庫 (包含子工具紀錄)
│   └── schemas/
│       └── tool.schema.json   # JSON Schema
├── scripts/
│   ├── build-web.js           # 靜態網頁打包腳本
│   ├── export-dataset.js      # 萃取 Telemetry 為 SFT (ShareGPT/ChatML) 資料集腳本
│   ├── scan-tool.js           # GitHub URL 解析器
│   └── scan-monorepo.js       # 深層索引掃描器
└── web/
    ├── index.html             # Premium UI 檢索介面 (暗色系、毛玻璃)
    ├── style.css              # 介面樣式
    └── app.js                 # 網頁端搜尋邏輯
```

## 檢索引擎

三層漸進式檢索，確保高效匹配：

| 層級 | 方法 | 適用場景 |
|------|------|----------|
| L1 | 精確匹配（ID/名稱）| "playwright", "ppt-master" |
| L2 | 關鍵字匹配（觸發詞+分類+場景/優勢）| "我想做簡報", "安全掃描" |
| L3 | 語義檢索（TF-IDF）| 模糊描述、跨語言查詢、子工具穿透 |

## License

MIT
