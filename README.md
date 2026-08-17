# Tool-Calling 🔧⚡

> 一個帮你自动找工具、装工具、用工具的全自动 AI 助手、多工具协同与知识图谱系统

## 这是什么？

想像你有一个 **全功能 AI 工具箱**，里面收录了 **597 个顶尖开源 AI 工具与 Agent 技能**：

- 📊 **数据与分析**：Grafana、Pandas-AI、PostHog、PyGWalker
- 📄 **简报与文件生产力**：AIPPT、NotebookLM2PPT、Docling、Reader3、PPT Master
- 🧠 **知识管理与图谱**：Graphify、Ontology、RAGFlow、Awesome LLM Apps
- 🤖 **AI 框架与 MCP**：LangChain、Dify、CrewAI、AutoGen、Langflow
- 🕷️ **网页爬虫与撷取**：Crawl4AI、Firecrawl、Crawlee、Scrapy、Selenium、Playwright、BeautifulSoup4
- 🧪 **测试与自动化**：Playwright、n8n、Browser-Use
- 🎨 **多媒体与设计**：Stable Diffusion、ComfyUI、Canvas
- 还有更多……

**这个专案的作用就是：** 当你需要完成某项任务时，它能透过 **五维度竞品重排矩阵** 自动为你筛选最适工具，透过 **多工具链规划器** 组合多个工具协同运作，透过 **白话互动问答** 逼近真实需求，并且在执行验证完成后 **自动解耦清理**，不为你的新专案增加任何维护负担！

---

## 🔥 检索引擎优化 (Phase 1-3, 2026-08-10)

本次更新对搜寻引擎进行了全面优化，主要成果：

| 优化项目 | 效能提升 | 说明 |
|---------|---------|------|
| triggerNormCache | +40-60% L2速度 | 触发词规范化快取 |
| 搜索结果快取 | -90% 延迟 | 5分钟TTL记忆体快取 |
| Web Worker | UI流畅度↑ | 离线TF-IDF计算 |
| IndexedDB | 冷启动<100ms | 跨页面持久化快取 |
| Fuzzy Matching | +15% 容错率 | Levenshtein距离模糊匹配 |
| 同義詞擴充 | 356詞彙 | 41個種子詞 + 422組配對自動挖掘 |

詳細報告請見 [docs/SEARCH-ENGINE-OPTIMIZATION-REPORT.md](./docs/SEARCH-ENGINE-OPTIMIZATION-REPORT.md)

---

## ⚡ 核心亮點功能

1. 🌌 **Obsidian 風格 2D / 3D 雙視角動態知識圖譜 (Interactive Knowledge Graph)**：
   - 整合 597 個 AI 工具與技能的深層拓撲星系，支援 2D Vis.js 平面與 3D Three.js 宇宙視角無縫切換。
   - **第一性原理零位移縮放 (Zero-Drift Mouse Pivot Zoom)**：滾輪縮放時精確鎖定滑鼠當前游標位置，支援 `0.05x ~ 20.0x` 雙向縮放，完全 0 像素偏移。
   - 支援 22 個領域分類篩選、多關鍵字即時檢索、一鍵「🔄 重置全景視角」與抽屜式詳細資料卡。
2. 🗺️ **複雜任務多工具鏈自動規劃 (Tool Chain Planner)**：
   - 專案開發往往需要多個工具協同（例如：`網頁爬蟲` + `LLM RAG 清洗` + `簡報生成`）。
   - 自動將長任務 Prompt 拆解為 DAG 執行流程圖，定義輸入/輸出 Data Flow 介面與備選競品。
3. 🏆 **五維度競品適配重排矩陣 (5D Disambiguation Matrix)**：
   - 解決同類工具混淆問題（如 6 大網頁爬蟲工具之選擇）。
   - 計算程式語言對齊 (+30%/-35%)、下游場景匹配 (RAG/E2E/Pipeline)、禁用場景硬性門禁 (Negative Constraints -60%) 與 GitHub Stars 加权。
4. 💬 **親和白話需求導向互動引導問答 (Jargon-Free Interactive Interview)**：
   - 徹底剔除生澀專業術語！當需求模糊時，透過 3 步直覺情境問答（開發語言、真實用途、網頁動態畫面）主動逼近用戶真實需求。
5. 🛡️ **沙盒環境預檢與安全調用驗證器 (Pre-flight Sandbox Validator)**：
   - 一鍵預檢本機 `Node.js`, `Python`, `pip`, `npx`, `Git`, `Docker` 相依環境準備狀況。
6. 🔥 **雲端 Auto-Trending 自動探勘管道**：
   - 連線 GitHub Search API 自動探勘新漲星熱門 AI Agent 與 MCP 專案。
7. 📈 **每週漲星排行榜 (Weekly Star Trending)**：
   - 基於固定追蹤池（2220 repos）與歷史快照，計算真實的週漲星數，每週自動入庫高潛力新工具。
   - **雙週展示**：同時展示「上週完整數據（LAST WEEK，列入工具箱納入判斷）」與「本週迄今即時數據（THIS WEEK，進行中，不列入判斷）」，清晰區隔正式與預覽數據。
   - 嚴格遵守 ISO-8601 World Week 國際標準（週一 00:00:00 UTC → 週日 23:59:59 UTC）。
8. 🔄 **啟動自動按需更新與介面即時刷新 (Startup Auto-Update & Live Refresh)**：
   - 本地伺服器每次啟動 (`npm start`) 時自動檢查是否跨日或跨週，背景非阻塞式抓取 GitHub 最新 Star 數據。
   - 網頁介面每週漲星榜頂部提供「🔄 刷新當日即時數據」按鈕，隨時一鍵取得當日最新 Star 增量。

---

## 🚀 CLI 完整指令指南

打开命令提示字元（CMD / PowerShell），即可调用全功能 CLI：

```bash
# 最常见用法
node cli.js search "Python RAG 网页爬虫"
node cli.js plan "抓取动态网页内容，并转成简报"
node cli.js interview "网页爬虫"
```

### 指令对照表

| 功能类别 | CLI 指令 | 说明 |
|---------|----------|------|
| 核心命令 | `node cli.js search "<查询>" [-c 分类]` | 搜寻最适工具（支援自然语言与分类过滤） |
| 核心命令 | `node cli.js plan "<长任务>"` | 多工具链 DAG 规划 |
| 核心命令 | `node cli.js interview "<需求>"` | 白话互动问答 |
| 核心命令 | `node cli.js compare <id1> <id2>` | 工具比较 |
| 核心命令 | `node cli.js invoke <id> [args...]` | 在 Docker 沙盒中安全执行工具（自动安装） |
| 核心命令 | `node cli.js install <id>` | 获取工具原始码到 `.temp/` 临时目录 |
| 技能管理 | `node cli.js find-skill "<关键词>" [-n 数量]` | 搜寻 Agent Skills（支援 skills.sh 与 GitHub 多来源聚合） |
| 技能管理 | `node cli.js install-skill <skill-id>` | 安装 Agent Skill |
| 技能管理 | `node cli.js list-skills` | 列出已安装的 Skills |
| 核心命令 | `node cli.js cleanup` | 移除所有临时工具，复归系统 |
| 核心命令 | `node cli.js export-dataset [path]` | 汇出 Telemetry 作为 LLM 微调资料集 |
| 管理命令 | `node cli.js list [-c 分类]` | 列出所有已注册工具（可依分类过滤） |
| 管理命令 | `node cli.js info <id>` | 查看工具详细资讯 |
| 管理命令 | `node cli.js add <github-url>` | 新增工具（自动解析类型：tool/resource/monorepo） |
| 管理命令 | `node cli.js batch-add <file>` | 从档案批量新增（多行 URL，自动分类与去重） |
| 管理命令 | `node cli.js remove <id|url>` | 移除工具 |
| 管理命令 | `node cli.js index-subtools <id>` | 深层扫描并索引大补帖内部的子工具 |
| 管理命令 | `node cli.js validate` | 验证注册库格式（0 错误才可提交） |
| 管理命令 | `node cli.js health-check` | 检查所有工具 URL 可用性 |
| 探勘命令 | `node cli.js discover-trending` | 云端 Auto-Trending 自动探勘热门工具 |
| 环境命令 | `node cli.js verify-environment` | 沙盒环境预检（Node/Python/Docker 等） |

### npm scripts 对照表

| npm script | 指令 | 说明 |
|-----------|------|------|
| `npm run validate` | `node cli.js validate` | 注册库完整性验证 |
| `npm run check-mece` | `node scripts/check-mece.js` | MECE 分类原则检查 |
| `npm run enrich` | `node scripts/enrich-registry.js` | 补齐工具诠释资料 |
| `npm run reclassify` | `node scripts/hook-reclassify.js` | 全盘分类重构 |
| `npm run trending` | `node scripts/trending-weekly.js` | 每週涨星探勘 |
| `npm run daemon` | `node scripts/sync-daemon.js` | 背景 Star 同步精灵 |
| `npm run mine-synonyms` | `node scripts/mine-synonyms.js` | 挖掘同义词词典 |
| `npm test` | `node scripts/check-utf8.js && node scripts/check-duplicate-ids.js && node --test tests/*.test.js` | 執行 75 項單元與 Playwright 3D 視覺測試 |
| `npm start` | `node web/server.js` | 啟動精密儀表數據工作台 (http://localhost:3000) |
| `npm run mcp` | `node mcp-server.js` | 启动 MCP 伺服器 |

---

## 📁 档案结构

```
Tool-Calling/
├── core/               # 核心模组
│   ├── search-engine.js     # 三层检索引擎 (L1-L3)
│   ├── synonyms.generated.js # 同义词词典 (356词汇)
│   ├── telemetry.js         # 使用统计
│   └── ...
├── web/                # 前端精密儀表數據工作台
│   ├── app.js              # 主应用 (集成Worker+快取)
│   ├── search-worker.js    # Web Worker (离线计算)
│   ├── persist-cache.js    # IndexedDB 持久化快取
│   ├── behavior-tracker.js # 使用者行为追踪
│   ├── server.js           # 零相依本地 HTTP 伺服器
│   ├── style.css           # 精密儀表板高對比樣式
│   └── index.html          # UI 介面
├── scripts/            # 自动化脚本
│   ├── mine-synonyms.js    # 同义词挖掘
│   ├── build-web.js        # 构建 dist (同步知識圖譜與資產)
│   ├── generate-knowledge-graph.js # 100% OLED 純黑實心知識圖譜生成器
│   └── check-mece.js       # MECE 分类检查
├── registry/           # 工具库
│   └── tools.json        # 597 工具 (单一真理来源)
├── docs/               # 文档
│   ├── SEARCH-ENGINE-OPTIMIZATION-REPORT.md  # 检索引擎优化报告
│   ├── category-conventions.md    # 分類慣例(領域優先 + AI 框架/代理邊界)
│   └── category-audit-2026-08-16.md # 分類全面稽核報告(255 項修正)
└── tests/              # 测试
    └── *.test.js       # 13 套件、57 項單元與端到端測試
```

---

## ✅ 质量门禁

提交前必须通过：

```bash
npm test                          # 全套單元與 Playwright 3D 視覺測試 (57/57 PASS)
node scripts/check-utf8.js        # UTF-8 編碼物理防護門禁 (0 個 U+FFFD)
node scripts/check-duplicate-ids.js # 全站 HTML ID 唯一性門禁 (0 個重複)
node cli.js validate              # 工具庫 100/100 詮釋資料品質門禁 (0 錯誤 0 警告)
node scripts/check-mece.js        # MECE 原則分類完整度驗證
```

---

> Developed by Wesley Chang, August-2026.  
> Tool-Calling v1.4 - 597 Tools, 356 Synonyms, Live Refresh & Dual-Week Trending
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
