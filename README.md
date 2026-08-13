# Tool-Calling 🔧⚡

> 一個帮你自动找工具、装工具、用工具的全自动 AI 助手、多工具协同与知识图谱系统

## 这是什么？

想像你有一个 **全功能 AI 工具箱**，里面收录了 **566 个顶尖开源 AI 工具与 Agent 技能**：

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
| 同义词扩充 | 239词汇 | 41个种子词自动挖掘 |

详细报告请见 [docs/OPTIMIZATION-REPORT.md](./docs/OPTIMIZATION-REPORT.md)

---

## ⚡ 核心亮点功能 (Phases 106 - 112)

1. 🗺️ **复杂任务多工具链自动规划 (Tool Chain Planner)**：
   - 专案开发往往需要多个工具协同（例如：`网页爬虫` + `LLM RAG 清洗` + `简报生成`）。
   - 自动将长任务 Prompt 拆解为 DAG 执行流程图，定义输入/输出 Data Flow 介面与备选竞品。
2. 🏆 **五维度竞品适配重排矩阵 (5D Disambiguation Matrix)**：
   - 解决同类工具混淆问题（如 6 大网页爬虫工具之选择）。
   - 计算程式语言对齐 (+30%/-35%)、下游场景匹配 (RAG/E2E/Pipeline)、禁用场景硬性门禁 (Negative Constraints -60%) 与 GitHub Stars 加权。
3. 💬 **亲和白话需求导向互动引导问答 (Jargon-Free Interactive Interview)**：
   - 彻底剔除生涩专业术语！当需求模糊时，透过 3 步直觉情境问答（开发语言、真实用途、网页动态画面）主动逼近用户真实需求。
4. 🛡️ **沙盒环境预检与安全调用验证器 (Pre-flight Sandbox Validator)**：
   - 一键预检本机 `Node.js`, `Python`, `pip`, `npx`, `Git`, `Docker` 相依环境准备状况。
5. 🔥 **云端 Auto-Trending 自动探勘管道**：
   - 连线 GitHub Search API 自动探勘新涨星热门 AI Agent 与 MCP 专案。
6. 📈 **每週涨星排行榜 (Weekly Star Trending)**：
   - 基于固定追踪池（2000+ repos）与历史快照，计算真实的週涨星数。
   - 自动筛选有意义的涨幅（过滤异常数据），生成 Top 10 排行榜。
   - 每週自动入库高潜力新工具，保持工具箱时时更新。

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
| `npm test` | `node --test tests/*.test.js` | 执行 11 项测试 |
| `npm run mcp` | `node mcp-server.js` | 启动 MCP 伺服器 |

---

---

## 📁 档案结构

```
Tool-Calling/
├── core/               # 核心模组
│   ├── search-engine.js     # 三层检索引擎 (L1-L3)
│   ├── synonyms.generated.js # 同义词词典 (239词汇)
│   ├── telemetry.js         # 使用统计
│   └── ...
├── web/                # 前端应用
│   ├── app.js              # 主应用 (集成Worker+快取)
│   ├── search-worker.js    # Web Worker (离线计算)
│   ├── persist-cache.js    # IndexedDB 持久化快取
│   ├── behavior-tracker.js # 使用者行为追踪
│   ├── fonts.css           # 自托管 Inter 字型 (SRI 安全)
│   ├── fonts/              # 字型檔案 (woff2)
│   └── index.html          # UI 介面
├── scripts/            # 自动化脚本
│   ├── mine-synonyms.js    # 同义词挖掘
│   ├── build-web.js        # 构建 dist (同步字型)
│   └── check-mece.js       # MECE 分类检查
├── registry/           # 工具库
│   └── tools.json        # 538 工具 (单一真理来源)
├── docs/               # 文档
│   ├── OPTIMIZATION-REPORT.md  # 优化报告
│   └── PROJECT-OPTIMIZATION-SUMMARY.md # 总览
└── tests/              # 测试
    └── *.test.js       # 11 项单元测试
```

---

## ✅ 质量门禁

提交前必须通过：

```bash
npm test                          # 全套單元與 Playwright 視覺測試 (100% PASS)
node scripts/check-utf8.js        # UTF-8 編碼物理防護門禁 (0 個 U+FFFD)
node scripts/check-duplicate-ids.js # 全站 HTML ID 唯一性門禁 (0 個重複)
node cli.js validate              # 工具庫 100/100 詮釋資料品質門禁
node scripts/check-mece.js        # MECE 原則分類完整度驗證
```

---

> Developed by Wesley Chang, July-2026.  
> Tool-Calling v1.2 - 566 Tools, 267 Synonyms
---

## 🌐 網頁版 UI

啟動網頁介面（**必須從專案根目錄執行**）：

```bash
# 方式一：Python HTTP Server
python -m http.server 3000

# 方式二：Node http-server
npx http-server -p 3000

# 然後開啟瀏覽器訪問 http://localhost:3000/web/
```

> ⚠️ **重要**：不要直接打開 `web/index.html`（file:// 協議不支援 ES Module），必須透過 HTTP Server 才能正常載入！

網頁版提供：
- 📊 **儀表板總覽** - 統計圖表與分類概覽
- 🔧 **工具目錄列表** - 完整的工具瀏覽與搜尋
- 🔥 **每週涨星榜** - GitHub 熱門 AI 工具排行
- 🌐 **互動式知識圖譜** - 3D 可視化工具關係網絡
