# Tool-Calling 開發日誌

## 2026-07-19 — 初始建設 (Phase 1)

### 需求
建立全自動工具調用效能外掛系統，解析 10 個 GitHub 工具 URL，建立工具註冊庫與檢索引擎。

### 完成項目
- [x] 專案結構建立 (`package.json`, 目錄架構)
- [x] JSON Schema 驗證格式 (`registry/schemas/tool.schema.json`)
- [x] 工具註冊庫 (`registry/tools.json`) — 10 個工具
- [x] 三層檢索引擎 (`core/search-engine.js`) — L1 精確/L2 關鍵字/L3 語義
- [x] CLI 介面 (`cli.js`) — 8 個命令
- [x] Agent Skill 入口 (`skill/SKILL.md`)
- [x] 開發日誌 (`DEV_LOG.md`)

### 已解析工具
| # | 名稱 | 分類 | 語言 |
|---|------|------|------|
| 1 | PPT Master | 文件生產力 | Python |
| 2 | Graphify | 知識管理 | TypeScript |
| 3 | Strix | 安全性 | Python |
| 4 | AI Animation Video Generator | 多媒體生成 | Python |
| 5 | Open Generative AI | 多媒體生成 | Python |
| 6 | ImaginAIry | 多媒體生成 | Python |
| 7 | Vercel AI SDK Skills | AI 框架 | TypeScript |
| 8 | Total TypeScript Skills | 學習資源 | TypeScript |
| 9 | Playwright | 測試與自動化 | TypeScript |
| 10 | Flysystem | 基礎設施 | PHP |

### 2026-07-19 — 系統整合與優化 (Phase 2 - 5)

#### 需求
實作工具掃描器，升級三層檢索引擎，並支援多種 AI Agent 平台的指令適配。

#### 完成項目
- [x] 工具掃描器 (`scripts/scan-tool.js`) — 支援從 GitHub URL 自動抓取 meta 並推測分類。
- [x] L3 語義檢索升級 — 使用 TF-IDF + 字元 N-gram + 中英文同義詞對齊取代簡易 Jaccard 算法。
- [x] 各平台適配檔案建立 (`.cursorrules`, `.windsurfrules`, `AGENTS.md` 等)。
- [x] 動態安裝模組 (`core/installer.js` & `core/cleanup.js`)，支援依賴項自動安裝，並整合進 CLI 的 `install` 與 `cleanup` 命令。
- [x] 單元測試建置 (`tests/search.test.js`)，共 6 項核心邏輯測試。

#### RCA / CAPA
- **問題**：`node --test tests/` 目錄執行測試時，Windows Node.js 18+ 環境可能因為 ESM 與 CommonJS 模組解析機制產生 `MODULE_NOT_FOUND`。
- **矯正措施**：直接指定目標檔案 `node --test tests/search.test.js` 解決問題，測試 100% 通過。
