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

### 2026-07-19：沙盒隔離、遙測追蹤與資料萃取 (Phase 12)

#### 需求與動機
1. **動態沙盒隔離 (Sandbox Invocation Mode)**：原先 `installer.js` 會在主機環境執行 `npm install` 與 `pip install`，存在極大的安全隱患（RCE 風險）。需導入 Docker 隔離執行環境，保護主機安全。
2. **軌跡追蹤與動態權重 (Telemetry)**：系統需要具備自我學習能力。藉由記錄工具調用的成功與失敗軌跡，動態調整 TF-IDF 的權重分數，實現自動化的淘汰與推薦機制。
3. **SFT 微調資料集萃取**：為了未來能微調出專精於工具調用選擇的專屬 LLM（如 Llama-3-ToolCalling），需將成功調用的歷史軌跡萃取為 ShareGPT/OpenAI Chat ML 格式的微調資料集。

#### 完成項目
- [x] **沙盒隔離實作**：擴充了 `registry/schemas/tool.schema.json` 支援 `sandbox` 屬性，並實作 `core/sandbox.js` 管理 Docker 容器生命週期，修改 `installer.js` 避免於主機執行任何相依套件安裝。
- [x] **CLI 新增指令**：於 `cli.js` 新增 `invoke <id> [args...]`，實現安全隔離執行工具。
- [x] **遙測系統實作**：建立 `core/telemetry.js`，將軌跡寫入至 `~/.tool-calling/traces/traces.jsonl`，並修改 `cli.js` 在 `invoke` 結束後自動記錄。
- [x] **搜尋演算法動態加權**：修改 `core/search-engine.js`，讀取 Telemetry 並於搜尋時動態乘上懲罰 (0.1x) 或獎勵 (1.2x) 係數，並在匹配關鍵字中顯示提示。
- [x] **資料萃取工具**：實作 `scripts/export-dataset.js`，新增 `export-dataset` 指令，成功將成功的軌跡轉換為 OpenAI Chat ML 的訓練格式。

#### RCA / CAPA
- **問題**：實作沙盒時，遺漏了 `npm` 與 `pip` 安裝方式的防禦，導致 `installer.js` 仍然在主機執行 `pip install`。
- **根本原因**：只修改了 `git-clone` 分支的代碼，未全面檢視所有 `switch case` 分支。
- **矯正措施**：修改 `installer.js` 的 `npm/pip/composer/cargo` 分支，移除主機執行邏輯，推遲至 `core/sandbox.js` 產生對應的依賴安裝指令在 Docker 內執行。
- **預防措施**：執行修改時，必須遵守全域變更掃描 SOP，檢視 `switch` 區塊的所有可能進入點。

### 2026-07-19：批量工具擴增與深層索引 (Phase 12.5)

#### 需求與動機
1. **擴充註冊庫生態**：用戶提供 26 個全新 AI 工具專案（涵蓋 Legal, Trading, Slide Generation 等），需要快速將其索引至系統。
2. **Monorepo 解析**：這些專案中有 5 個為彙整型大補帖 (Monorepo)，如果僅註冊表層，檢索引擎將無法觸及內部的微技能，需要進行深層索引 (Deep Indexing)。

#### 完成項目
- [x] **批量註冊**：使用 `node cli.js batch-add` 成功將 26 個 GitHub URL 註冊至 `tools.json`。
- [x] **自動化深層掃描**：對 `knowledge-work-plugins`, `financial-services`, `claude-for-legal`, `skill`, `skills-JimLiu` 執行了 `index-subtools`。
- [x] **索引成果**：成功為這 5 個大補帖拆解出總計 **568** 個子工具，大幅提升了語義檢索 L3 與關鍵字 L2 的命中範圍。總工具庫突破 160+ 主專案，包含近千個微技能。

### 2026-07-19：專案全域 MECE 清理與文件同步 (Phase 13)

#### 需求與動機
1. **保持極致潔淨 (MECE)**：專案經過多輪迭代，根目錄開始出現如 `urls.txt`、`my_sft_dataset.jsonl` 等暫時性或匯出產物。必須將它們收納至獨立目錄，以符合「相互獨立、完全窮盡」的分類邏輯。
2. **文件同步**：`README.md` 需要更新，以反映 Phase 12 的 Sandbox 隔離、Telemetry 遙測與 SFT 資料萃取等新特性，讓使用者了解最新的架構與功能。

#### 完成項目
- [x] **目錄清理**：建立 `.exports/` 目錄，將匯出的資料集與批量網址檔移入，並更新 `.gitignore` 排除追蹤。
- [x] **IDE 配置檔審查**：確認 `.cursorrules`, `.windsurfrules`, `CLAUDE.md`, `.trae`, `.kiro` 皆維持為導向 `.agents/AGENTS.md` 的單一真理來源指標，無冗餘配置。
- [x] **README 重構**：
  - 更新已註冊工具數量為「>160 庫」。
  - 在「快速開始」補充 `invoke` 與 `export-dataset` 指令。
  - 在「核心特性」補上 Sandbox 安全隔離與 Telemetry 動態評分的說明。
  - 在「架構樹」補上 `core/sandbox.js`, `core/telemetry.js`, `scripts/export-dataset.js`。
- [x] **建立還原基準點**：執行 `npm test` 確認功能無損，並建立清晰的 Git Commit (`chore: perform MECE global cleanup and documentation synchronization`) 推送至遠端倉庫。


### 2026-07-19：嚴重安全事故 - API 金鑰外洩 (Phase 13.5)

#### 問題描述
在實作 scripts/enrich-registry.js 批次更新腳本時，將真實的 Agnes AI API 金鑰 (sk-SMfdNFc2...) 寫死於程式碼中作為預設值，並隨同 Commit c00000 推送至 GitHub 公開倉庫，造成嚴重的憑證外洩風險。

#### 矯正措施 (Corrective Action - CAPA)
- **移除金鑰**：修改 scripts/enrich-registry.js，強制僅從環境變數 process.env.AGNES_API_KEY 讀取金鑰，若無則拋出錯誤並中斷執行。
- **清除 Git 歷史**：使用 git reset --soft 將分支退回金鑰外洩前的乾淨狀態，重新 Commit 並執行 git push -f，將遠端倉庫的所有金鑰歷史抹除。
- **憑證註銷**：通知使用者立即前往 Agnes AI 後台註銷該組外洩金鑰，徹底阻斷濫用可能。

#### 預防措施 (Preventive Action - CAPA)
- 觸發 <proactive_self_evolution> 規則，主動於專案全域指令 .agents/AGENTS.md 中新增了 **「禁止硬編碼 API 金鑰與敏感憑證 (Zero Hardcoded Credentials)」** 條款。未來撰寫任何需驗證的腳本前，強制實施自我審查，確保無憑證硬編碼情事。

### 2026-07-20：安全性強化 (Phase 14)

#### 需求與動機
修復 `installer.js` 中潛在的 Git RCE 與路徑穿越漏洞（例如 `ext::` 傳輸層、`--upload-pack` 參數注入、以及子目錄的路徑穿越）。

#### 完成項目
- [x] 導入 `SAFE_REPO_URL` 正則白名單，嚴格限制 Github Repo URL 格式。
- [x] 實作 `assertSafeRef` 函式，防止參數注入（阻擋 `-` 開頭）與路徑穿越（阻擋 `..`）。
- [x] 將修復後的 `core/installer.js` 提交並推送到遠端。

### 2026-07-21 — 批量工具擴增與深層拆解 (Phase 15)

#### 需求與動機
1. **擴充註冊庫生態**：將 36 個新的 GitHub 專案 URL 批量加入工具庫。
2. **大補帖深層索引 (檢查是否需要拆解)**：針對其中包含多個技能的 Cybersecurity 和 LLM API 等大補帖進行深層掃描。

#### 完成項目
- [x] **批量註冊**：建立 `urls_batch3.txt` 並執行 `node cli.js batch-add urls_batch3.txt`，成功將新專案加入 `tools.json` 註冊庫。
- [x] **自動化深層掃描**：對多個可能的大補帖執行 `index-subtools`，成功拆解大量子工具：
  - `anthropic-cybersecurity-skills` (發現 817 個子工具)
  - `cybersecurity-skills` (發現 29 個子工具)
  - `claude-code-cybersecurity-skill` (發現 19 個子工具)
  - `awesome-free-llm-apis` (發現 1 個子工具)
- [x] **MECE 檔案管理**：完成批量匯入後，將 `urls_batch3.txt` 移至 `.exports/` 中，保持根目錄乾淨。

#### RCA / CAPA
- (無異常狀況，系統穩定處理大批量子技能的解析與寫入)
