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
### 2026-07-19 — 支援 GitHub 子目錄 (Monorepo) 工具匯入與安裝

#### 需求
為了能精準拆解並匯入包含多個獨立工具的 Monorepo 專案（如 `mattpocock/skills`），系統需要支援針對特定子目錄的解析與安裝。

#### 完成項目
- [x] **CLI 解析升級**：更新 `cli.js` 支援 `/tree/branch/subpath` 格式。
- [x] **智能文檔解析**：`scan-tool.js` 現支援透過 Raw API 抓取子目錄的 `README.md` 或 `SKILL.md`，並加入對 YAML Frontmatter 的解析邏輯以取得精確描述。
- [x] **Git Sparse Checkout 實作**：`installer.js` 新增 `git-clone-sparse` 安裝方法，只下載該特定子目錄，大幅加速安裝過程與節省儲存空間。
- [x] **Schema 擴充**：更新 `registry/schemas/tool.schema.json` 支援 `branch` 和 `subpath` 屬性。

#### RCA / CAPA
- **問題**：若擷取的為 `SKILL.md` 往往含有 YAML frontmatter (`---`)，單純抓取第一段會將 frontmatter 的字串也擷取下來。
- **矯正措施**：增加解析 `---` 區塊的邏輯，自動提取 `description: ...` 的內容，若無則剔除 frontmatter 再抓取第一段。

### 2026-07-19 — 擴展與優化：深層索引、大補帖與差異化 (Phase 6 - 8)

#### 需求
隨著工具庫快速膨脹（超過 140 個工具），需要解決三大問題：
1. **大補帖深層索引**：包含大量子技能的 Monorepo（如 `agent-skills`）無法被檢索引擎識別內部功能。
2. **同質工具鑑別**：大量功能相似的工具（例如各種 NotebookLM 轉 PPT 工具）在檢索時無法區分優劣與最佳場景。
3. **批量匯入效率**：一次性導入數十個 GitHub 專案。

#### 完成項目
- [x] **實作 Deep Indexing (深層索引)**：
  - 開發 `scripts/scan-monorepo.js`，支援自動 Clone 並遞迴掃描子目錄的 `README.md` / `SKILL.md`。
  - 在 Schema 增加 `subTools`，儲存掃描結果。
  - CLI 新增 `index-subtools <id>` 命令。
- [x] **檢索引擎 L2/L3 升級**：
  - 將子工具 (`subTools`) 與其敘述動態納入關鍵字比對與 TF-IDF 權重計算，確保外層查詢能命中內層子工具。
- [x] **批量大補帖匯入**：
  - CLI 新增 `batch-add` 命令，支援讀取純文字 URL 清單自動排程新增，包含自動錯誤捕捉，防止中斷。
- [x] **工具差異化對比機制 (Tool Differentiation Framework)**：
  - Schema 擴充 `useCase` (最佳場景) 與 `advantages` (優勢清單)。
  - 檢索引擎為這兩個屬性加上高權重匹配。
  - 終端機 `search` 與 `info` 輸出排版高亮展示 ⭐ 場景，幫助 AI 做出調用決策。

#### RCA / CAPA
- **問題**：`batch-add` 時遇到 `https://github.com/owner/repo/blob/main/subpath` 格式導致正則驗證失敗並中斷進程。
- **矯正措施**：修改 `cli.js` 與 `scan-tool.js` 中的 GitHub 正則表達式支援 `(?:tree|blob)`，並在 `batch-add` 迴圈中加入 `try...catch` 防護機制。
- **問題**：針對具有相同倉庫名稱（如 `openai/skills` 與 `anthropics/skills`）的網址，產生 ID 衝突。
- **矯正措施**：在 `cmdAdd` 中增加邏輯，當 ID 碰撞但 URL 不同時，動態將 owner 加上 baseName 作為新 ID (`skills-anthropics`)。
