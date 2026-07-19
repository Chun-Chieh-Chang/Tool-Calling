# Tool-Calling 🔧⚡

> **全自動工具調用效能外掛系統** — 新專案開發的 AI 工具調度助手

## 概述

Tool-Calling 是一套 AI Agent 工具調用基礎設施。當你說出咒語 **「啟動全自動工具調用模式」**，系統會自動：

1. 🔍 **識別** — 分析你的任務需求
2. 🎯 **檢索** — 從工具註冊庫中找出最適合的工具
3. 📦 **調用** — 動態安裝並執行工具
4. 🧹 **清理** — 任務完成後自動移除臨時工具

## 快速開始

```bash
# 列出所有已註冊工具
node cli.js list

# 搜尋工具（支援中英文自然語言）
node cli.js search "我要做簡報"
node cli.js search "security vulnerability scan"
node cli.js search "生成 AI 圖片"

# 查看工具詳情
node cli.js info playwright

# 新增工具
node cli.js add https://github.com/owner/repo

# 批量新增
node cli.js batch-add urls.txt

# 驗證註冊庫格式
node cli.js validate

# 健康檢查
node cli.js health-check
```

## 已註冊工具 (10)

| 分類 | 工具 | 用途 |
|------|------|------|
| 📄 文件生產力 | PPT Master | AI 簡報生成 |
| 🧠 知識管理 | Graphify | 代碼知識圖譜 |
| 🔒 安全性 | Strix | AI 滲透測試 |
| 🎬 多媒體生成 | AI Animation Video Generator | 動畫影片 |
| 🎨 多媒體生成 | Open Generative AI | 200+ AI 模型圖片/影片 |
| 🖼️ 多媒體生成 | ImaginAIry | Pythonic 圖片生成 |
| 🤖 AI 框架 | Vercel AI SDK Skills | AI 技能組合 |
| 📚 學習資源 | Total TypeScript Skills | TS 進階型別 |
| 🧪 測試與自動化 | Playwright | 跨瀏覽器 E2E 測試 |
| 💾 基礎設施 | Flysystem | PHP 檔案系統抽象 |

## 擴充新工具

系統支援 **無限制** 新增工具：

```bash
# 方式一：CLI 單條新增
node cli.js add https://github.com/owner/repo

# 方式二：批量匯入
node cli.js batch-add urls.txt

# 方式三：直接編輯
# 編輯 registry/tools.json，按 Schema 格式新增
```

## 架構

```
Tool-Calling/
├── cli.js                     # CLI 入口（8 個命令）
├── core/
│   └── search-engine.js       # 三層檢索引擎
├── registry/
│   ├── tools.json             # 工具註冊庫
│   └── schemas/
│       └── tool.schema.json   # JSON Schema
├── skill/
│   └── SKILL.md               # Agent Skill 入口
└── scripts/                   # 工具掃描器（待實作）
```

## 檢索引擎

三層漸進式檢索，確保高效匹配：

| 層級 | 方法 | 適用場景 |
|------|------|----------|
| L1 | 精確匹配（ID/名稱）| "playwright", "ppt-master" |
| L2 | 關鍵字匹配（觸發詞+分類+描述）| "我想做簡報", "安全掃描" |
| L3 | 語義檢索（Jaccard 相似度）| 模糊描述、跨語言查詢 |

## License

MIT
