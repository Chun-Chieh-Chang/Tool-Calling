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
- **矯正措施**：在 `cmdAdd` 中增加邏輯，當 ID 碰撞但 URL 不同時，動態將 owner 加上 baseName 作為新 ID (`skills-anthropics`)。

### 2026-07-19 — 千級技能精準調度架構升級 (Phase 9)

#### 需求
因應系統工具即將邁入千級規模，需解決「注意力稀釋 (Attention Dilution)」與「標籤混淆 (Label Confusion)」兩大核心問題，避免 Agent 在高度相似的工具群中發生「工具使用幻覺 (Tool-use Hallucination)」。

#### 完成項目
- [x] **導入負樣本約束 (Hard Negatives)**：
  - 更新 `tool.schema.json` 加入 `negativeConstraints` (禁用場景)。
  - 修改 `core/search-engine.js` 關鍵字檢索邏輯，當檢索詞命中禁用場景時，給予致命扣分 (強制降至 1%)。
  - 在 `cli.js` 中實作紅色的 `🚫 禁用場景` 警告顯示，加強 LLM 辨識度。
- [x] **實作領域分類過濾 (Category Routing)**：
  - 更新 `cli.js` 的 `search` 指令，支援 `-c, --category <name>` 參數。
  - 在 `core/search-engine.js` 中於核心算法前加入前置過濾，將 $O(N)$ 空間降維至 $O(\log N)$。
- [x] **文檔收納**：將架構白皮書收錄至 `docs/references/agent-skill-routing/` 以保持專案 MECE 結構。

#### RCA / CAPA
- **問題**：`search-engine.js` 處理負樣本時，因 `queryTokens` 的 `includes` 邏輯無法正確捕捉未切分開的中文字串 (如 "撰寫後端代碼ppt")，導致負樣本扣分失效。
- **矯正措施**：改用 `normalize(query).includes(negNorm)`，直接判斷原始查詢字串是否包含負樣本詞彙，修復並驗證成功。

### 2026-07-19 — GitHub Pages 靜態網站建置與 CI/CD 部署 (Phase 10)

#### 需求
將現有的檢索系統擴展至瀏覽器端，建立 Premium UI 靜態網站，並透過 GitHub Actions 達成推播自動確效與部署。

#### 完成項目
- [x] **核心代碼解耦 (Isomorphic Code)**：拔除 `core/search-engine.js` 中的 `node:fs` 依賴，使同一套檢索引擎能同時在 Node CLI 與 Browser 中完美運行。
- [x] **Premium UI 介面實作**：以 Vanilla HTML/CSS/JS 實作「毛玻璃 (Glassmorphism)」與深色系 (Dark Mode) 介面，渲染 140+ 工具卡片。
- [x] **自動化建置部署**：撰寫 `scripts/build-web.js` 與 `.github/workflows/deploy-pages.yml`，實現 `npm test` 自動確效與靜態網頁打包。

#### RCA / CAPA
- **問題**：線上部署完成後，畫面變成全白/空白，且 Console 出現 `marked()` 函式庫的廢棄警告。
- **原因分析 (Root Cause)**：這是我（AI）在此前階段產生的失誤。早前曾建立過一份舊的自動部署腳本 `.github/workflows/validate-and-deploy.yml`。本次建立新版網頁時，**我沒有先檢查 `.github/workflows/` 目錄**，就直接新增了第二份腳本 `deploy-pages.yml`。導致 Push 後兩個腳本同時觸發並產生競爭，舊腳本覆蓋了新網頁的輸出，且舊腳本內含的 `md-block.js` 引發了上述報錯。
- **矯正措施 (Corrective Action)**：使用 `git rm` 刪除了舊有的衝突檔案 `validate-and-deploy.yml`，確保系統內只有唯一正確的部署流程。
- **預防措施 (Preventive Action)**：未來開發新專案，新增 CI/CD 或配置檔案前，必須強制執行 **「狀態前置掃描 (Pre-condition Scan)」**：
  1. 建立任何部署工作流（如 `.github/workflows`）前，必須先執行 `ls` 盤點該目錄下是否已有功能重疊的舊檔案。
  2. 若有舊檔案，應優先採取「修改/更新」或「明確刪除後再建立」，絕對禁止在未確認環境狀態下「盲目新增」同質檔案。

### 2026-07-19 — 專案 MECE 結構整併與優化 (Phase 11)

#### 需求
執行專案的全局盤點與清理，移除冗餘檔案，整合分散設定檔，更新核心文件以符合最新狀態，並建立乾淨的版本基準點。

#### 完成項目
- [x] **移除冗餘檔案**：刪除了無效的 `skill/adapters/agnes-integration.js`、`skill/core-instructions.md` 與 `skill/SKILL.md`。
- [x] **Agent 規則 MECE 整合**：建立單一真理來源 `.agents/AGENTS.md`，將散落於 `.cursorrules`, `.windsurfrules`, `CLAUDE.md`, `.trae`, `.kiro` 等平台的指令精簡為單一指標，消弭維護負擔與版本分歧。
- [x] **文件目錄重構**：將過長的白皮書目錄 `docs/references/agent-skill-routing/...` 重新命名並整併至 `docs/architecture/`，提昇目錄結構的可讀性。
- [x] **文件同步更新**：更新了 `README.md` 的專案架構樹與 GitHub Pages 網頁連結，確保文件與當前代碼結構一致。
- [x] **建立版本基準點**：清理完畢後，透過 `git add .` 與 `git commit` 將專案推進至全新的高潔淨狀態，並推送至 GitHub 遠端倉庫。
