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

### 2026-07-21 — 第二波批量工具擴增與深層拆解 (Phase 16)

#### 需求與動機
1. **擴充註冊庫生態**：將使用者提供的另外 22 個新 GitHub 專案 URL 批量加入工具庫。
2. **大補帖深層索引 (檢查是否需要拆解)**：針對新匯入且疑似為綜合技能包的專案進行深層掃描。

#### 完成項目
- [x] **批量註冊**：建立 `.exports/urls_batch4.txt` 並執行 `node cli.js batch-add`，成功將新專案加入 `tools.json` 註冊庫。
- [x] **自動化深層掃描**：對多個可能的大補帖執行 `index-subtools`，成功拆解出更多子工具：
  - `skills-emilkowalski` (發現 7 個子工具)
  - `skills-MiniMax-AI` (發現 23 個子工具)
  - `ui-skills` (發現 7 個子工具)
  - `stitch-skills` (發現 15 個子工具)
  - `andrej-karpathy-skills` (發現 1 個子工具)
- [x] **MECE 檔案管理**：`urls_batch4.txt` 已經直接建立在 `.exports/` 目錄中，無需再做搬移。

#### RCA / CAPA
- (無異常狀況，系統穩定處理所有解析與寫入)

### 2026-07-21 — 專案程式碼與檔案優化作業 (Phase 17)

#### 需求與動機
1. **全面盤點與清理**：移除過時的生成的 HTML 檔案與遺留的安裝快取，以及為了維持嚴格的 MECE 原則，清除所有只有單行指標作用的冗餘 IDE 設定檔。
2. **同步更新文件與還原點**：確保文件與程式碼一致，並建立優化後的 Git 基準點。

#### 完成項目
- [x] **冗餘檔案與無效快取清理**：刪除了 `.temp/lingbot-map` 及 `docs/` 下過時的靜態輸出 (`實際開發情境.html` 等)。
- [x] **IDE 配置檔 MECE 整合**：刪除了冗餘的 `.cursorrules`, `.windsurfrules`, `CLAUDE.md`, `.github/copilot-instructions.md`, `.trae/`, `.kiro/`，使 `.agents/AGENTS.md` 成為唯一的系統開發規範。
- [x] **文件同步**：更新 `README.md`，使註冊庫總數更新為最新的「超過 265 庫」，並更新此開發日誌。
- [x] **版本控制**：建立清新的 Git 基準點並推送至遠端。

#### RCA / CAPA
- (本次為專案架構優化，無特殊錯誤發生，成功瘦身並提升專案整潔度)

### 2026-07-21 — MCP 介面整合與安全防禦固化 (Phase 18)

#### 需求與動機
1. **防禦機制固化**：將 Claude 提出的三項安全需求（強制金鑰自檢、Prompt Injection 防禦標籤 `<untrusted_data>`、以及優雅降級 Fallback 機制）寫入專案的最高指導原則 `.agents/AGENTS.md`。
2. **MCP (Model Context Protocol) 介面實作**：避免直接引入 Smart Reranker 帶來的新攻擊面與外部 API 成本，改以提供標準的 MCP 介面，讓 AI Agent (如 Claude Desktop) 透過兩階段漸進式揭露 (Progressive Disclosure) 來安全地檢索與調用工具。

#### 完成項目
- [x] **安全防禦固化**：更新 `.agents/AGENTS.md` 加入 `LLM 整合安全與防禦元規則`。
- [x] **MCP Server 實作**：新增 `mcp-server.js`，實作 STDIO 傳輸介面，並暴露出 `list_tools`、`search_tools`、`get_tool_detail` 與 `run_tool` 四個工具。
- [x] **沙盒執行對接**：`run_tool` 成功對接 `core/sandbox.js` 邏輯，保留嚴格的 Docker 容器限制 (`--network none`, `--read-only`, `--cap-drop ALL`)。
- [x] **依賴更新**：`package.json` 新增 `@modelcontextprotocol/sdk`。
- [x] **文件同步**：更新 `README.md` 加入 MCP 伺服器的啟動與設定方式。

#### RCA / CAPA
- **問題 (審查階段發現)**：開發夥伴 (opencode) 雖然完美實作了程式碼與 `README.md` 的更新並完成了 Commit 推播，但遺漏了同步更新 `DEV_LOG.md`，違反了 `AGENTS.md` 中「禁止文件與代碼提交脫鉤 (Zero Detached Commits for Docs/Logs)」的規則。
- **矯正措施**：主動補上本階段的開發日誌紀錄，並進行補充 Commit。

### 2026-07-23 — 全面程式碼重構與共享模組抽取 (Phase 19)

#### 需求與動機
在歷經 18 個階段的快速迭代後，專案中積累了大量的程式碼重複 (Duplication)：
- `loadRegistry()` / `saveRegistry()` 在 4 個檔案中各寫一份 (`cli.js`, `mcp-server.js`, `scan-monorepo.js`, `enrich-registry.js`)
- `generateId()` 在 `cli.js` 與 `scan-tool.js` 中重複
- `parseMarkdownDescription()` 在 `scan-tool.js` 內嵌實作，`scan-monorepo.js` 獨立函式
- Docker 沙盒建置邏輯 (`allowedImages`, docker args 陣列) 在 `core/sandbox.js` 與 `mcp-server.js` 中各寫一份
- `.gitignore` 中的 `~/.tool-calling/` 條目因 Git 不展開 `~` 實為無效

#### 完成項目
- [x] **共享模組抽取**：
  - 建立 `core/registry.js`，統一提供 `loadRegistry()` / `saveRegistry()` / `getToolById()` / `generateId()`
  - 建立 `scripts/scanner-utils.js`，統一提供 `parseMarkdownDescription()`
  - 更新 `cli.js`, `mcp-server.js`, `scan-tool.js`, `scan-monorepo.js`, `enrich-registry.js` 全部改用共享模組
- [x] **Docker 沙盒邏輯合併**：
  - `core/sandbox.js` 提取 `buildDockerArgs()` 內部函式供兩種模式共用
  - 新增 `invokeInSandboxCapture()` 導出（pipe stdio，供 MCP server 使用）
  - `mcp-server.js` 移除重複的 `executeInSandbox()` / `allowedImages` / `__dirname` 常數
- [x] **無效配置清理**：修正 `.gitignore` 中的惰性 `~/.tool-calling/` 條目為說明註解
- [x] **一致性修正**：`scan-monorepo.js` 原本的 `saveRegistry()` 缺少 `lastUpdated` 更新，統一使用共享模組後自動修復
- [x] **文件同步**：更新 `DEV_LOG.md` 記錄本階段

#### 移除/重構統計
| 類別 | 數量 |
|------|------|
| 移除重複函式 (程式碼行) | ~80 行 |
| 統一路徑常數 (REGISTRY_PATH) | 4 處 → 1 處 |
| 合併 Docker 建置邏輯 | 2 處 → 1 處 |
| 新增共享模組 | 2 個 (`core/registry.js`, `scripts/scanner-utils.js`) |

#### RCA / CAPA
- **問題 (審查階段發現)**：原始 `scan-monorepo.js` 的 `saveRegistry()` 忘記更新 `lastUpdated` 時間戳，導致後續排序依賴 `addedAt` 的查詢可能異常。
- **矯正措施**：由於已將所有寫入操作統一至 `core/registry.js` 的 `saveRegistry()`，此問題於 source 層級永久修復。
- **預防措施**：未來新增任何需要讀寫 `tools.json` 的模組，一律從 `core/registry.js` 導入，禁止自行定義路徑或解析邏輯。


### 2026-07-23 — 專案整體程式碼與檔案優化 (Phase 20)

#### 需求與動機
專案歷經 19 個階段的快速迭代，已具備完整功能（279 個工具、三層檢索、MCP Server、Docker 沙盒、Telemetry）。現在進入「穩定化」階段，執行全面盤點與清理。

#### 完成項目
- [x] **全面盤點**：
  - 遍歷所有目錄與檔案，確認核心模組無過時/重複代碼
  - 驗證 `cli.js`、`mcp-server.js` 全部改用共享模組（`core/registry.js`）
  - 確認所有工具狀態為 `active`，無 `experimental` 或 `deprecated` 項目
  - 確認所有工具皆有完整 description、negativeConstraints、triggers
- [x] **清理作業**：
  - 移除 `.exports/urls_batch3.txt` 與 `.exports/urls_batch4.txt`（Phase 15-16 的舊批次匯入 URL 清單，已無參考價值）
  - 修正 `.gitignore`：移除不存在的 `.tempmediaStorage/` 條目，移除 Phase 19 後已過時的 `~/.tool-calling/` 註解
- [x] **文件同步**：
  - `README.md` 已更新為小白友善版本（280 行，涵蓋六種用法）
  - `docs/relationship-diagram.html` 已建立三角色關係圖解
  - `DEV_LOG.md` 記錄至此階段
- [x] **測試確效**：
  - `npm test` — 6/6 通過
  - `node cli.js health-check` — 279/279 健康
  - `node cli.js validate` — 格式驗證通過

#### 專案現況摘要
| 指標 | 數值 |
|------|------|
| 註冊工具數 | 279 |
| 分類數 | 20 |
| 子工具數 | ~1,800+ |
| 單元測試 | 6 項（全通過） |
| 核心模組 | 6 個（search-engine, installer, sandbox, telemetry, cleanup, registry） |
| 腳本模組 | 6 個（build-web, enrich-registry, export-dataset, scan-tool, scan-monorepo, scanner-utils） |
| 健康度 | 100%（279/279 工具可用） |

#### RCA / CAPA
- （本次為例行性架構優化，無異常狀況）

### 2026-07-24 — 批量工具加入自動化與全面文件同步 (Phase 21)

#### 需求與動機
1. **自動化批量加入邏輯**：使用者多次要求「批量加入工具庫」，但現有 `batch-add` 僅是讀取 URL 清單逐一掃描，缺乏智能分類與拆解判斷。需建立完整的 URL 解析 → 自動分類 → 寫入 registry 流程。
2. **全面文件同步**：專案歷經 20 個階段迭代，DEV_LOG.md、README.md、AGENTS.md 中的數字與操作指引已與實際程式碼產生落差（工具數 279→280、scripts 清單過時、缺少 batch-add 增強說明等）。

#### 完成項目
- [x] **URL 解析器 (`scripts/url-resolver.js`)**：新模組，辨識三種 URL 類型：
  - `resource` — API 目錄/學習清單（method: none，作為學習資源加入）
  - `tool` — 單一可執行工具（走 scanner 完整掃描）
  - `monorepo` — 多工具集合（智能拆解為多個子 entry）
- [x] **scan-tool.js 強化**：
  - 擴充分類規則從 15 增至 17+ 個分類，新增 `gemini`, `gpt-proxy`, `openai-compatible`, `awesome-`, `public-apis` 等關鍵詞
  - `guessInstall()` 增加非可安裝資源檢測，避免對 markdown-only repo 產生錯誤安裝指令
- [x] **batch-add 命令重構**：整合 resolver + scanner，產出詳細報告（新增/跳過/失敗統計 + 每條 URL 處理結果）
- [x] **清理重複模組**：移除 `scripts/scanner-utils.js`，將共用函式 inline 至 `scan-monorepo.js`
- [x] **修復隱式依賴 bug**：`package.json` 補上 `zod` 宣告（`mcp-server.js` 依賴但未宣告）
- [x] **更新 .gitignore**：加入 `.omo/`, `.agnes/` 防止快取被提交
- [x] **工具庫更新**：手動豐富 `gemini-cli`（13 capabilities）、修正 `public-apis`（移除錯誤 pip install）、新增 `gpt-api-free`
- [x] **文件同步**：本文檔、README.md、AGENTS.md、docs/ 全面更新

#### 專案現況摘要
| 指標 | 數值 |
|------|------|
| 註冊工具數 | 280 |
| 分類數 | 20 |
| 子工具數 | ~2,708（30 個主工具含 subTools） |
| 單元測試 | 6 項（全通過） |
| 核心模組 | 6 個（search-engine, installer, sandbox, telemetry, cleanup, registry） |
| 腳本模組 | 5 個（build-web, enrich-registry, export-dataset, scan-tool, scan-monorepo, url-resolver） |
| 健康度 | 100%（280/280 工具可用） |

#### RCA / CAPA
- （本次為功能增強與文件同步，無異常狀況）

### 2026-07-25 — 前端 UI 防禦性重構與 Uncaught TypeError 修復 (Phase 22)

#### 需求與動機
使用者回報前端 `web/app.js` 選擇分類選單時發生執行階段未捕捉錯誤：
`app.js:225 Uncaught TypeError: Cannot read properties of undefined (reading 'name') at createToolCard`

#### 完成項目
- [x] **`web/app.js` 防禦性層級修復**：
  - `createToolCard()`：加入嚴格空值與型別檢查 (`if (!tool || typeof tool !== 'object' || !tool.name) return null;`)。
  - `renderSearchResults()`：加入對 `results` 陣列項目的結構校驗，支援 search result 物件與純 tool 物件，防範 `undefined` 或缺漏屬性傳入 `createToolCard`。
  - `getToolCategories()` / `toolBelongsToCategory()`：加入 `!tool` 空值防衛，防止非預期參數造成 TypeError。
- [x] **`core/search-engine.js` 檢索引擎魯棒性升級**：
  - `normalize()`：擴充支援 Array、非字串與 null/undefined 安全處理。
  - `search()` 前置過濾：支援單一分類字串與陣列分類 (`t.category`) 精確匹配與正規化比較。
- [x] **單元測試補充**：
  - 在 `tests/search.test.js` 中新增「陣列分類與魯棒性測試」，涵蓋 `null` / `undefined` 與陣列型別分類輸入，確保 100% 通過。

#### RCA / CAPA
- **問題**：`renderSearchResults` 假設傳入的項目直接為 valid tool 物件或帶有非空 `.tool` 屬性的搜尋結果物件，且 `createToolCard` 缺乏對 `tool` 物件及 `.name` 屬性的 null/undefined 預防校驗。當前選單切換或搜尋結果回傳異常 structure 時，存取 `tool.name` 導致 `Cannot read properties of undefined (reading 'name')` 崩潰。
- **矯正與預防措施 (CAPA)**：
  1. 在 UI 視圖層 (`createToolCard` / `renderSearchResults`) 實施「雙重防護」 (Double Guarding)，對傳入的物件進行型別與 key 存在的校驗，無效物件優雅降級跳過。
  2. 在核心邏輯層 (`search-engine.js`) 的 `normalize` 與過濾器增加對 `Array` / `null` / `undefined` 的安全防禦。
  3. 補充自動化單元測試涵蓋異常邊界資料。

### 2026-07-25 — 網站 Favicon 圖標設計與 404 資源缺失修正 (Phase 23)

#### 需求與動機
瀏覽器主動向 GitHub Pages 請求 `/favicon.ico` 資源時觸發 `GET https://chun-chieh-chang.github.io/favicon.ico 404 (Not Found)` 錯誤。

#### 完成項目
- [x] **極致視覺設計 (Favicon Assets)**：
  - 設計兼具深色毛玻璃質感與向量質感的 `favicon.svg` (含圓角深色基底、扳手 🔧 與閃電 ⚡ 高光漸層與發光濾鏡)。
  - 生成 `favicon.ico` 雙備援資源，確保現代與傳統瀏覽器皆能正常載入。
- [x] **HTML 標籤整合**：
  - 更新 [web/index.html](file:///d:/Self-developed_Apps/Tool-Calling/web/index.html)，補齊 `<link rel="icon" type="image/svg+xml" href="favicon.svg">` 與 `<link rel="alternate icon" href="favicon.ico">`。
- [x] **建置腳本升級**：
  - 更新 [scripts/build-web.js](file:///d:/Self-developed_Apps/Tool-Calling/scripts/build-web.js)，部署時自動將 Favicon 資源複製至 `./dist`。

#### RCA / CAPA
- **問題**：`web/index.html` 缺少 `<link rel="icon">` 標籤宣告且根目錄未提供 `favicon.ico`，導致瀏覽器發出預設 `/favicon.ico` HTTP 請求時回傳 HTTP 404。
- **矯正與預防措施 (CAPA)**：補齊 SVG 與 ICO 格式的 Favicon 資源與 HTML 宣告，並於 CI/CD 構建流程中自動進行複製，防止資源丟失。

### 2026-07-25 — 儀表板與統計圖表介面重構 (Phase 24)

#### 需求與動機
使用者需求：「介面應該是一個儀表板，顯示各分類的條目與數量，以及統計圖表」。將原本單一的搜尋列表頁面升級為國際級雙視圖儀表板與數據分析中心。

#### 完成項目
- [x] **KPI 數據指標卡片 (KPI Grid)**：展示工具總數 (280)、分類總數 (20)、子技能數 (~2,708+) 與 L1~L3 檢索引擎狀態。
- [x] **統計圖表繪製 (Chart.js)**：
  - 各分類工具數量分佈柱狀圖 (`Category Bar Chart`)，支援懸停數據與點擊圖表連動過濾條目。
  - 開發語言占比甜甜圈圖 (`Language Breakdown Doughnut Chart`)。
- [x] **分類條目與數據概覽面板 (Category Overview Grid)**：生成 20 個分類概覽卡片，含各分類條目數量 Badge 與前 3 個熱門工具預覽。
- [x] **分頁與選單連動 (Tab Switcher & Search Sync)**：支援「📊 儀表板總覽」與「🔧 工具目錄列表」動態切換，搜尋或篩選時自動滑動過濾。
- [x] **建置與測試**：`node scripts/build-web.js` 打包成功，7/7 單元測試 PASS 通過。

#### RCA / CAPA
- （本次為 UI/UX 儀表板升級與新功能建置，無異常狀況）

### 2026-07-25 — 搜尋欄位置重構與口語意圖自動清洗 (Phase 25)

#### 需求與動機
使用者回報兩項核心 UX 問題：
1. 「附圖的選擇欄應該在選擇'工具目錄列表'時才出現」：原本的全域搜尋欄出現在儀表板頂部顯得雜亂。
2. 「在那個欄位寫需求根本無效，除非接入大模型進行語意檢索」：口語化需求（如「我想做簡報」）在前端搜尋時包含雜訊詞，且 placeholder 提示不精確。

#### 完成項目
- [x] **搜尋欄位置搬移**：將 `.search-container` 移入 `toolsView` (工具目錄列表) 分頁頂部，儀表板總覽頁保持潔淨。
- [x] **Placeholder 修正**：更新提示文字為 `搜尋工具名稱、ID、關鍵詞或觸發詞 (例如: ppt-master, security, video)...`。
- [x] **口語意圖自動清洗 (Query Cleaning)**：於 `core/search-engine.js` 增加前綴清洗邏輯 (如自動去除「我想」、「請幫我」、「幫我」、「要如何」等)，讓「我想做簡報」能自動轉換為「做簡報」並命中 `ppt-master`。
- [x] **單元測試補充**：新增口語清洗單元測試，8/8 測試全數 PASS 通過。

#### RCA / CAPA
- **問題**：全域搜尋欄遮擋儀表板視覺焦點，且口語化搜尋包含「我想」等干擾詞降低 TF-IDF / 關鍵字匹配精確度。
- **矯正與預防措施 (CAPA)**：將搜尋欄歸屬於目錄分頁，並於檢索引擎入口增加自然語言填充詞預處理，維持極致 UX 與高精確度檢索。

### 2026-07-25 — 匹配工具卡片網格佈局優化與自動換行 (Phase 26)

#### 需求與動機
使用者需求：「匹配工具卡片應該由左至右排列，以及可換行顯示」。

#### 完成項目
- [x] **消除嵌套 Grid 擠壓**：將 `index.html` 中的 `#resultsGrid` class 調整為 `.results-container`，解決原本父層與子層同時為 `.grid` 導致子網格被限制在第一欄位的版面壓縮問題。
- [x] **由左至右橫向排列與自動換行**：設定 `.grid` 採用 `repeat(auto-fill, minmax(280px, 1fr))`，工具卡片自動從左至右填滿整行，空間不足時自動無縫換至下一行。
- [x] **確效與測試**：`node scripts/build-web.js` 打包成功，8/8 單元測試 PASS 通過。

#### RCA / CAPA
- **問題**：`resultsGrid` 容器誤設了 `.grid` class，導致 JS 動態產生的 `<div class="grid">` 被當成父網格的一個 cell，迫使所有工具卡片被擠在單一狹窄欄位中。
- **矯正與預防措施 (CAPA)**：分離外層容器 (`results-container`) 與內層網格 (`grid`)，確保動態產生的卡片網格能 100% 展開並橫向多欄自動換行。

### 2026-07-25 — 分類概覽卡片 4 欄佈局升級 (Phase 27)

#### 需求與動機
使用者需求：「分類卡片從目前的 3 欄布局改為 4 欄布局」。

#### 完成項目
- [x] **桌面端 4 欄網格排版**：調整 `.category-overview-grid` 桌面端為 `repeat(4, 1fr)`，提升寬螢幕資訊展示密度。
- [x] **響應式降級**：設定 `@media` 查詢，確保在中小型裝置下優雅降為 3 欄 (1024px)、2 欄 (768px) 及單欄 (480px)。
- [x] **確效與測試**：`node scripts/build-web.js` 打包成功，8/8 單元測試 PASS 通過。

#### RCA / CAPA
- （本次為 UI/UX 佈局微調升級，無異常狀況）

### 2026-07-25 — 雙頁面設計邏輯 100% 一致性對齊 (Phase 29)

#### 需求與動機
使用者需求：「兩個頁面的設計邏輯要一致」。對齊「📊 儀表板總覽」與「🔧 工具目錄列表」的全域控制列、網格規格與標題佈局。

#### 完成項目
- [x] **全域搜尋列整合**：將 `.search-container` 提升為全域頂部控制列，兩分頁共享統一的搜尋輸入與分類選單控制。
- [x] **100% 對齊網格與斷點**：`.kpi-grid`、`.category-overview-grid` 與 `.grid` 全面統一為 1440px 寬度、4 欄網格 (`repeat(4, 1fr)`)，並共享相同的響應式斷點 (1200px / 860px / 520px)。
- [x] **標題列規格統一**：統一採用 `.section-title-bar` 標題樣式與 controls 佈局。
- [x] **確效與測試**：`node scripts/build-web.js` 打包成功，8/8 單元測試 PASS 通過。

#### RCA / CAPA
- （本次為 UI/UX 一致性重構，無異常狀況）

### 2026-07-25 — 嚴格 4 欄網格佈局強制與 1200px 斷點移除 (Phase 30)

#### 需求與動機
使用者回報截圖顯示工具卡片仍為 3 欄且兩側留白過多。原因為原本 CSS 中含有 `@media (max-width: 1200px)` 降級條款，導致視窗低於 1200px 時觸發 3 欄。

#### 完成項目
- [x] **移除 1200px 3 欄降級媒體查詢**：全線網格 (`.grid`, `.kpi-grid`, `.category-overview-grid`) 於桌面與筆電螢幕下 (>768px) 無條件強制實施 **4 欄網格 (`repeat(4, 1fr)`)**。
- [x] **容器寬度動態展寬 (`width: 96%; max-width: 1600px;`)**：消除桌面視窗兩側過多的黑色空白。
- [x] **確效與測試**：`node scripts/build-web.js` 打包成功，8/8 單元測試 PASS 通過。

#### RCA / CAPA
- **問題**：`@media (max-width: 1200px)` 門檻設定過高，導致常見的中小型桌面/筆電螢幕或縮小視窗視圖被誤判為 3 欄。
- **矯正與預防措施 (CAPA)**：將 4 欄佈局的適用範圍下探至 768px 門檻，確保桌面端與筆電端 100% 呈列 4 欄美觀版面。









