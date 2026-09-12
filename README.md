# Tool-Calling 🔧⚡

> 一個幫你自動找工具、裝工具、用工具的全自動 AI 助手、多工具協同與知識圖譜系統

## 這是什麼？

想像你有一個 **全功能 AI 工具箱**，裡面收錄了 **696 個頂尖開源 AI 工具與 Agent 技能**：

- 📊 **數據與分析**：Grafana、Pandas-AI、PostHog、PyGWalker
- 📄 **簡報與檔案生產力**：AIPPT、NotebookLM2PPT、Docling、Reader3、PPT Master
- 🧠 **知識管理與圖譜**：Graphify、Ontology、RAGFlow、Awesome LLM Apps
- 🤖 **AI 框架與 MCP**：LangChain、Dify、CrewAI、AutoGen、Langflow
- 🕷️ **網頁爬蟲與擷取**：Crawl4AI、Firecrawl、Crawlee、Scrapy、Selenium、Playwright、BeautifulSoup4
- 🧪 **測試與自動化**：Playwright、n8n、Browser-Use
- 🎨 **多媒體與設計**：Stable Diffusion、ComfyUI、Canvas
- 還有更多……

**這個專案的作用就是：** 當你需要完成某項任務時，它能透過 **五維度競品重排矩陣** 自動為你篩選最適工具，透過 **多工具鏈規劃器** 組合多個工具協同運作，透過 **白話互動問答** 逼近真實需求，並且在執行驗證完成後 **自動解耦清理**，不為你的新專案增加任何維護負擔！

---

## 🔥 檢索引擎優化 (Phase 1-3, 2026-08-10)

本次更新對搜尋引擎進行了全面優化，主要成果：

| 優化專案 | 效能提升 | 說明 |
|---------|---------|------|
| triggerNormCache | +40-60% L2速度 | 觸發詞規範化快取 |
| 搜尋結果快取 | -90% 延遲 | 5 分鐘 TTL 記憶體快取 |
| Web Worker | UI 串流暢度↑ | 離線 TF-IDF 計算 |
| IndexedDB | 冷啟動 <100ms | 跨頁面持久化快取 |
| Fuzzy Matching | +15% 容錯率 | Levenshtein 距離模糊匹配 |
| 同義詞擴充 | 620 詞彙 | 41 個種子詞 + 945 組配對自動挖掘 |

詳細報告請見 [docs/SEARCH-ENGINE-OPTIMIZATION-REPORT.md](./docs/SEARCH-ENGINE-OPTIMIZATION-REPORT.md)

---

## ⚡ 核心亮點功能

1. 🌌 **Obsidian 風格 2D / 3D 雙視角動態知識圖譜 (Interactive Knowledge Graph)**：
   - 整合 696 個 AI 工具與技能的深層拓撲星系，支援 2D Vis.js 平面與 3D Three.js 宇宙視角無縫切換。
   - **第一性原理零位移縮放 (Zero-Drift Mouse Pivot Zoom)**：滾輪縮放時精確鎖定滑鼠當前游標位置，支援 `0.05x ~ 20.0x` 雙向縮放，完全 0 像素偏移。
   - 支援 18 個領域分類篩選、多關鍵字即時檢索、一鍵「🔄 重置全景視角」與抽屜式詳細資料卡。
2. 🗺️ **複雜任務多工具鏈自動規劃 (Tool Chain Planner)**：
   - 專案開發往往需要多個工具協同（例如：`網頁爬蟲` + `LLM RAG 清洗` + `簡報生成`）。
   - 自動將長任務 Prompt 拆解為 DAG 執行串流程圖，定義輸入／輸出 Data Flow 介面與備選競品。
3. 🏆 **五維度競品適配重排矩陣 (5D Disambiguation Matrix)**：
   - 解決同類工具混淆問題（如 6 大網頁爬蟲工具之選擇）。
   - 計算程式語言對齊 (+30%/-35%)、下游場景匹配 (RAG/E2E/Pipeline)、禁用場景硬性門禁 (Negative Constraints -60%) 與 GitHub Stars 加權。
4. 💬 **親和白話需求導向互動引導問答 (Jargon-Free Interactive Interview)**：
   - 徹底剔除生澀專業術語！當需求模糊時，透過 3 步直覺情境問答（開發語言、真實用途、網頁動態畫面）主動逼近用戶真實需求。
5. 🛡️ **沙盒環境預檢與安全調用驗證器 (Pre-flight Sandbox Validator)**：
   - 一鍵預檢本機 `Node.js`, `Python`, `pip`, `npx`, `Git`, `Docker` 相依環境準備狀況。
6. 🔥 **雲端 Auto-Trending 自動探勘管線**：
   - 連線 GitHub Search API 自動探勘新漲星熱門 AI Agent 與 MCP 專案。
7. 📈 **每週漲星排行榜 (Weekly Star Trending)**：
   - 基於固定追蹤池（2,433 repos）與歷史快照，計算真實的週漲星數，每週自動入庫高潛力新工具。
   - **雙週展示**：同時展示「上週完整數據（LAST WEEK，列入工具箱納入判斷）」與「本週迄今即時數據（THIS WEEK，進行中，不列入判斷）」，清晰區隔正式與預覽數據。
   - 嚴格遵守 ISO-8601 World Week 國際標準（週一 00:00:00 UTC → 週日 23:59:59 UTC）。
8. 🔄 **啟動自動按需更新與介面即時重新整理 (Startup Auto-Update & Live Refresh)**：
   - 本地伺服器每次啟動 (`npm start`) 時自動檢查是否跨日或跨週，背景非阻塞式抓取 GitHub 最新 Star 數據。
   - 網頁介面每週漲星榜頂部提供「🔄 重新整理當日即時數據」按鈕，隨時一鍵取得當日最新 Star 增量。

---

## 🚀 CLI 完整指令指南

開啟指令提示字元（CMD / PowerShell），即可調用全功能 CLI：

```bash
# 最常見用法
node cli.js search "Python RAG 網頁爬蟲"
node cli.js plan "抓取動態網頁內容，並轉成簡報"
node cli.js interview "網頁爬蟲"
```

### 指令對照表

| 功能類別 | CLI 指令 | 說明 |
|---------|----------|------|
| 核心指令 | `node cli.js search "<查詢>" [-c 分類]` | 搜尋最適工具（支援自然語言與分類過濾） |
| 核心指令 | `node cli.js plan "<長任務>"` | 多工具鏈 DAG 規劃 |
| 核心指令 | `node cli.js interview "<需求>"` | 白話互動問答 |
| 核心指令 | `node cli.js compare <id1> <id2>` | 工具比較 |
| 核心指令 | `node cli.js invoke <id> [args...]` | 在 Docker 沙盒中安全執行工具（自動安裝） |
| 核心指令 | `node cli.js install <id>` | 取得工具原始碼到 `.temp/` 暫時目錄 |
| 技能管理 | `node cli.js find-skill "<關鍵詞>" [-n 數量]` | 搜尋 Agent Skills（支援 skills.sh 與 GitHub 多來源聚合） |
| 技能管理 | `node cli.js install-skill <skill-id>` | 安裝 Agent Skill |
| 技能管理 | `node cli.js list-skills` | 列出已安裝的 Skills |
| 核心指令 | `node cli.js cleanup` | 移除所有暫時工具，復歸系統 |
| 核心指令 | `node cli.js export-dataset [path]` | 匯出 Telemetry 作為 LLM 微調資料集 |
| 管理指令 | `node cli.js list [-c 分類]` | 列出所有已註冊工具（可依分類過濾） |
| 管理指令 | `node cli.js info <id>` | 查看工具詳細資訊 |
| 管理指令 | `node cli.js add <github-url>` | 新增工具（自動解析類型：tool/resource/monorepo） |
| 管理指令 | `node cli.js batch-add <file>` | 從檔案批次新增（多行 URL，自動分類與去重） |
| 管理指令 | `node cli.js remove <id\|url>` | 移除工具 |
| 管理指令 | `node cli.js index-subtools <id>` | 深層掃描並索引大補帖內部的子工具 |
| 管理指令 | `node cli.js validate` | 驗證工具庫格式（0 錯誤才可提交） |
| 管理指令 | `node cli.js health-check` | 檢查所有工具 URL 可用性 |
| 探勘指令 | `node cli.js discover-trending` | 雲端 Auto-Trending 自動探勘熱門工具 |
| 環境指令 | `node cli.js verify-environment` | 沙盒環境預檢（Node/Python/Docker 等） |

### npm scripts 對照表

| npm script | 指令 | 說明 |
|-----------|------|------|
| `npm run validate` | `node cli.js validate` | 工具庫完整性驗證 |
| `npm run check-mece` | `node scripts/check-mece.js` | MECE 分類原則檢查 ＋ 來源一致性守衛 |
| `npm run categories:sync` | `node scripts/sync-categories.js` | 重生分類衍生檔（schema enum、文件統計表） |
| `npm run categories:check` | `node scripts/sync-categories.js --check` | 檢查衍生檔是否同步（CI 門禁） |
| `npm run rescan-classification` | `node scripts/rescan-classification.js` | 全庫分類重掃（唯讀差異報告） |
| `npm run enrich` | `node scripts/enrich-registry.js` | 補齊工具詮釋資料 |
| `npm run reclassify` | `node scripts/hook-reclassify.js` | 全盤分類重構（建議模式） |
| `npm run trending` | `node scripts/trending-weekly.js` | 每週漲星探勘 |
| `npm run daemon` | `node scripts/sync-daemon.js` | 背景 Star 同步精靈 |
| `npm run mine-synonyms` | `node scripts/mine-synonyms.js` | 挖掘同義詞詞典 |
| `npm test` | `node scripts/check-utf8.js && node scripts/check-duplicate-ids.js && node --test tests/*.test.js` | 執行單元測試（56 項，無外部依賴） |
| `npm run test:integration` | `node --test tests/*.test.js` | 含整合測試（76 項，需 `npx skills` CLI 與網路） |
| `npm start` | `node web/server.js` | 啟動精密儀表數據工作台 (http://localhost:3000) |
| `npm run mcp` | `node mcp-server.js` | 啟動 MCP 伺服器 |

---

## 📁 檔案結構

```
Tool-Calling/
├── core/               # 核心模組
│   ├── search-engine.js     # 三層檢索引擎 (L1-L3)
│   ├── categories.js        # 分類單一來源載入器
│   ├── synonyms.generated.js # 同義詞詞典 (620 詞彙)
│   ├── telemetry.js         # 使用統計
│   └── ...
├── web/                # 前端精密儀表數據工作台
│   ├── app.js              # 主應用（整合 Worker + 快取）
│   ├── search-worker.js    # Web Worker（離線計算）
│   ├── persist-cache.js    # IndexedDB 持久化快取
│   ├── behavior-tracker.js # 使用者行為追蹤
│   ├── server.js           # 零相依本地 HTTP 伺服器
│   ├── style.css           # 精密儀表板高對比樣式
│   └── index.html          # UI 介面
├── scripts/            # 自動化腳本
│   ├── mine-synonyms.js    # 同義詞挖掘
│   ├── sync-categories.js  # 分類衍生檔產生器
│   ├── build-web.js        # 建構 dist（同步知識圖譜與資產）
│   ├── generate-knowledge-graph.js # 100% OLED 純黑實心知識圖譜產生器
│   └── check-mece.js       # MECE 分類檢查 ＋ 來源一致性守衛
├── registry/           # 工具函式庫
│   ├── categories.json   # 18 個分類的單一機器可讀來源
│   └── tools.json        # 696 工具（單一真理來源）
├── docs/               # 文件
│   ├── CLASSIFICATION.md         # 分類判定規則（權威）
│   ├── CATEGORY-SYSTEM.md        # 分類統計與重構機制
│   ├── SEARCH-ENGINE-OPTIMIZATION-REPORT.md  # 檢索引擎優化報告
│   ├── category-conventions.md    # 分類慣例（領域優先 + AI 框架/代理邊界）
│   └── category-audit-2026-08-16.md # 分類全面稽核報告（255 項修正）
└── tests/              # 測試
    └── *.test.js       # 15 個測試檔、56 項單元測試
```

---

## ✅ 品質門禁

提交前必須通過：

```bash
npm test                          # 單元測試（56 項，無外部依賴）
node scripts/check-utf8.js        # UTF-8 編碼物理防護門禁 (0 個 U+FFFD)
node scripts/check-duplicate-ids.js # 全站 HTML ID 唯一性門禁 (0 個重複)
node cli.js validate              # 工具庫 100/100 詮釋資料品質門禁 (0 錯誤)
npm run check-mece                # MECE 完整度 ＋ 分類來源一致性守衛
npm run categories:check          # 分類衍生檔是否與 categories.json 同步
node scripts/rescan-classification.js --ci  # 全庫重掃，Tier 1 必須為 0
```

> 📌 **測試分層（2026-09-12 起）**：`npm test` 已與外部依賴切開，不呼叫 `npx`、不打網路，
> 因此可在離線與沙盒環境中穩定執行。需要 `npx skills` CLI 與 GitHub API 的 20 項整合測試
> 另以 `npm run test:integration` 執行（共 76 項）。

---

> Developed by Wesley Chang, August-2026.  
> Tool-Calling v2.0 - 696 Tools, 620 Synonyms, Live Refresh & Dual-Week Trending
---

## 🌐 網頁版 UI

啟動本地數據工作台（**直接執行 npm start**）：

```bash
# 啟動零相依本地精密儀表伺服器
npm start

# 開啟瀏覽器訪問
# 主工作台：http://localhost:3000
# 3D/2D 知識圖譜：http://localhost:3000/knowledge-graph.html
```

> ⚠️ **重要**：不要直接打開 `web/index.html`（file:// 協議不支援 ES Module），必須透過 HTTP Server 才能正常載入！

網頁版提供：
- 📊 **精密儀表板總覽** - 高對比度統計圖表與分類概覽
- 🔧 **工具目錄列表** - 完整的工具瀏覽與搜尋
- 🔥 **每週漲星榜** - GitHub 熱門 AI 工具排行，雙週展示（上週完整 + 本週迄今）
- 🌐 **互動式知識圖譜** - 100% OLED 純黑 3D/2D 可視化工具關係網絡
