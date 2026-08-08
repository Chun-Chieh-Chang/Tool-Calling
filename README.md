# Tool-Calling 🔧⚡

> 一個幫你自動找工具、裝工具、用工具的全自動 AI 助手、多工具協同與知識圖譜系統

## 這是什麼？

想像你有一個 **全功能 AI 工具箱**，裡面收錄了 **464+ 個頂尖開源 AI 工具與 Agent 技能**：

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

## ⚡ 核心亮點功能 (Phases 106 - 112)

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
5. 🔥 **雲端 Auto-Trending 自動探勘管道**：
   - 連線 GitHub Search API 自動探勘新漲星熱門 AI Agent 與 MCP 專案。
6. 📈 **每週漲星排行榜 (Weekly Star Trending)**：
   - 基於固定追蹤池（2000+ repos）與歷史快照，計算真實的週漲星數。
   - 自動篩選有意義的漲幅（過濾異常數據），生成 Top 10 排行榜。
   - 每週自动入庫高潛力新工具，保持工具箱時時更新。

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