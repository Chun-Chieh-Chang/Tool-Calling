# 批量加入工具庫 — 自動化邏輯

## 概述

當使用者說「繼續幫我把以下這些網址批量加入工具庫（檢查是否需要拆解）」時，系統會自動執行一套完整的解析 → 分類 → 寫入流程，無需人工介入。

---

## 使用方式

```bash
# 1. 建立 URL 清單檔案（每行一個 URL，# 開頭為註解）
cat > urls.txt << EOF
https://github.com/owner/repo-1
https://github.com/owner/repo-2
# 這是註解，會被跳過
https://github.com/owner/repo-3
EOF

# 2. 執行批量新增
node cli.js batch-add urls.txt
```

---

## 三層自動處理邏輯

### 第一層：URL 類型解析 (`scripts/url-resolver.js`)

辨識每條 URL 屬於三種類型之一：

| 類型 | 特徵 | 處理動作 |
|------|------|---------|
| **resource** | 包含 `awesome-list`, `public-apis`, `api-directory`, `roadmap`, `catalog` 等關鍵詞 | 直接從 GitHub API 抓取基本資訊，以 `method: none` 作為學習資源加入 |
| **tool** | 單一可執行工具或套件 | 透過 `scan-tool.js` 掃描 README + GitHub API，生成完整 entry |
| **monorepo** | 包含多個獨立工具的集合（如 skills 目錄、workspace 配置） | 拆解為多個子 entry，逐一掃描加入 |

#### 拆解規則

1. **排除已知單體專案**：`gemini-cli`, `claude-code`, `cursor`, `copilot` 等不會被誤判
2. **信號目錄偵測**：只掃描名稱含 `skills/`, `agents/`, `tools/`, `providers/`, `extensions/`, `plugins/` 的目錄
3. **Workspace 支援**：若根目錄 `package.json` 有 `workspaces` 設定，會自動解析子套件
4. **最小門檻**：至少 2 個有效子工具才觸發拆解
5. 🔴 **「同一產品的樣板／領域實例」不拆**（2026-09-21 新增判準）

   **判準**：子目錄是「獨立的工具」，還是「同一產品的樣板／領域實例」？後者不拆。

   實例：`oracle/fusion-ai-studio` 底下有 `aiapps/{scm,prc,hcm}`、`extensions`、
   `how-to`、`.agents/skills`，看似多個工具。但實際查證後，全部是
   **同一個產品（Oracle Fusion AI Agent Studio）的樣板與領域實例**，
   且按產品 release 分支（`release-26C`）發佈。
   拆成 N 筆只會得到 N 筆「用 Oracle Fusion AI Agent Studio 做 X」的重複條目，
   對檢索的鑑別力是傷害（見 HANDOFF 陷阱 3「擴充過度會退步」）。

   對照：真正的 monorepo（如含多個獨立 CLI 的 repo）每個子工具都有**自己的**
   安裝方式與用途，拆解後是 N 筆不同的工具 → 該拆。

---

### 第二層：自動分類 (`scripts/scan-tool.js`)

三階段分類機制，確保工具歸類到正確的分類：

#### Phase 1 — 精準比對
使用 `CATEGORY_RULES`（**12 條**規則，每條含複合關鍵字 + word boundary 檢查）：

| 分類 | 關鍵詞範例 |
|------|-----------|
| AI 代理 | `agent-framework`, `llm-app`, `gemini`, `gpt-proxy`, `openai-compatible` |
| 瀏覽器自動化 | `browser-automation`, `headless-browser`, `playwright`, `puppeteer` |
| 學習資源 | `awesome-list`, `reference-guide`, `roadmap`, `api-directory`, `public-apis` |
| 安全性 | `cybersec`, `osint`, `pentest`, `vulnerability`, `ctf` |
| 文件生產力 | `powerpoint`, `spreadsheet`, `docx`, `xlsx`, `pdf` |
| ...等 12 條規則 | ... |

#### Phase 2 — 備用比對
使用 `FALLBACK_KEYWORDS`（**10 條**規則，一般關鍵字覆蓋更多長尾場景）

#### Phase 3 — Heuristic 推斷
從描述與 topics 中推斷（依序判斷，先命中者勝）：
- 含 `ai` / `llm` → **AI 代理**
- 含 `agent` / `skill` → **開發工具**
- 含 `cli` / `command` → **開發工具**
- 含 `automation` → **測試與自動化**
- 皆未命中 → **開發工具**（MECE 原則：禁止產生「其他」殘留分類）

---

### 第三層：安裝方式判定 (`detectInstall`)

🔴 **2026-09-21 改寫**。舊版 `guessInstall()` 只憑 GitHub 偵測到的**語言**就生成指令：

```js
if (language === 'typescript') return { method: 'npm', command: `npx ${repo}` };
if (language === 'python')     return { method: 'pip', command: `pip install git+${url}.git` };
```

但**語言 ≠ 可安裝套件**，於是產生了一批「照著做必定失敗」的指令：

| repo | 舊指令 | 為什麼錯 |
|---|---|---|
| `thebuggeddev/anatomy` | `npx anatomy` | Next.js 應用（`package.json` 是 `private: true`），npm 上沒有這個套件 |
| `Z-Anatomy/Models-of-human-anatomy` | `pip install git+…` | Blender 範本，沒有 `setup.py`／`pyproject.toml` |

現在改為**讀 repo 根目錄的封裝檔，有證據才給套件指令**：

| 根目錄檔案 | 判定 |
|---|---|
| `package.json` 有 `bin` 且非 `private` | `npx <name>` |
| `package.json` 其他（應用程式／樣板） | `git clone` |
| `pyproject.toml` 或 `setup.py` | `pip install git+<url>.git` |
| `Cargo.toml` | `cargo install --git <url>` |
| `composer.json` | `composer require <owner>/<repo>` |
| 以上皆無（只有原始碼） | `git clone` |
| **查不到檔案清單**（API 限流等） | `git clone`（**不猜**） |

**非可安裝資源檢測**：若描述或 topics 包含 `awesome-list`, `public-apis`,
`api-directory`, `catalog`, `roadmap` 等 15 個信號詞，直接設為 `method: "none"`。

> 設計原則：`git clone` 對任何 GitHub repo 都成立，是**誠實的下界**。
> 給錯的指令比留白更糟——使用者會直接踩雷。

---

### 第四層：README 段落衛生（2026-09-21 新增）

第一階段（`scan-tool.js`）與第二階段（`core/tool-enricher.js`）都以 **README 首段**為描述來源，
但首段經常不是功能說明。三種實例與對應處理：

| 症狀 | 實例 | 處理 |
|---|---|---|
| 首段是上游樣板文 | `thebuggeddev/anatomy` 是未修改的 `vinext-starter` README | `isBoilerplateParagraph()` 黑名單 |
| 首段是更新公告 | `oracle/fusion-ai-studio`「The repository has been restructured…」 | 同上 |
| H1 標題與內文黏成同段 | `Z-Anatomy` 用行尾雙空白軟換行 | `stripMarkdown()` 移除 ATX 標題整行 |

另外：
- **描述優先序**：GitHub 的 `description` 可用（≥40 字且非「待補充」）就用它，
  README 只當後備。否則樣板文會蓋掉維護者自己寫的正確描述。
- **`truncateAtWord()`**：在詞邊界截斷並補省略號，取代 `slice(0, 200)`
  （硬切會產生 `…Gauthier Kervyn (de` 這種看起來像資料損毀的尾巴）。
- **README 檔名大小寫不一致**：`README.md`／`Readme.md`／`readme.md` 都要試。
- **`description_zh` 只由 `npm run translate:zh` 產生**，enricher 不可產生
  （否則會出現「英文描述說 A、中文描述說 B」）。

> 🔴 **自動化只能保證「有值」，不能保證「值是對的」。**
> 加入工具後必須人工核對 `useCase` 與 `description` 是否同一主題。

---

## 加入工具的兩階段架構（2026-09-21）

本文件描述的是**第一階段**。完整流程是兩階段：

| 階段 | 檔案 | 需 LLM | 產出 | 時機 |
|---|---|---|---|---|
| 1 解析 | `scripts/scan-tool.js` | 否 | description、language、topics→capabilities、install | 同步（毫秒）|
| 2 補齊 | `core/tool-enricher.js` | **是** | useCase、advantages、capabilities、`*_zh` | 非同步（秒級）|

- 加入的工具一律 `experimental`，**語意欄位補齊完成才升 `active`**
  （判準：`isFullyEnriched()`，Web／CLI／批次三端共用）。
- 接入點：Web `POST /api/tools/add`（`setImmediate` 背景補齊、不阻塞回應）、
  CLI `add`（同步）、批次 `npm run enrich:new`（可 `--dry`／`--limit`／`--ids`）。
- 🔴 第二階段**必須基於 README**，不可憑名稱推測。README 不足時寧可留白。
- ⚠️ **不要用 `scripts/enrich-registry.js`**——它的 prompt 明寫「依 Name 與 URL 猜測用途」，
  違反本專案的「不可憑名稱推測 metadata」規範。

---

## CLI 命令

### `batch-add <file>`

```
node cli.js batch-add urls.txt
```

**處理流程：**

1. 讀取檔案，按行分割，過濾空白行與註解（`#` 開頭）
2. 去重（同一 URL 不會重複加入）
3. 逐一處理每條 URL：
   - 呼叫 `resolve()` 判斷類型
   - Resource → 直接抓 GitHub API 資訊加入
   - Tool → 呼叫 `scan()` 掃描後加入
   - Monorepo → 拆解為子工具，逐一掃描加入
4. 寫入 `registry/tools.json`
5. 輸出詳細報告

**輸出範例：**

```
╔══════════════════════════════════════╗
║  批量新增 (3 個 URL)               ║
╚══════════════════════════════════════╝

正在掃描: https://github.com/chatanywhere/GPT_API_free
✓ 已新增: GPT API Free (gpt-api-free) — AI 代理

Monorepo 拆解: https://github.com/... → 5 個子工具
  ✓ skill-one (skill-one) — AI 代理
  ✓ skill-two (skill-two) — 開發工具
  ⊘ 已存在: skill-three

批量新增完成
  新增: 6 | 跳過: 1 | 失敗: 0 | 總計: 7

─ 詳細報告 ─
  ✓ GPT API Free — AI 代理
  ✓ skill-one — AI 代理
  ✓ skill-two — 開發工具
  ⊘ 已存在: skill-three
```

---

## 現有工具

| 命令 | 說明 |
|------|------|
| `node cli.js add <url>` | 新增單一 GitHub URL |
| `node cli.js batch-add <file>` | 從檔案批量新增（本文件所述） |
| `node cli.js list` | 列出所有已註冊工具 |
| `node cli.js search <query>` | 搜尋工具（三層檢索架構） |
| `node cli.js info <id>` | 查看工具詳細資訊 |
| `node cli.js remove <id>` | 移除工具 |
| `node cli.js validate` | 驗證 registry 完整性 |

---

## 修改檔案一覽

| 檔案 | 變更內容 |
|------|---------|
| `scripts/url-resolver.js` | **新檔案** — URL 類型解析 + monorepo 拆解 |
| `scripts/scan-tool.js` | 擴充分類規則（+15 關鍵詞）；`guessInstall` → **`detectInstall`**（依封裝檔判定，2026-09-21）；README 段落衛生（2026-09-21）|
| `core/tool-enricher.js` | **第二階段**：讀 README 產生語意欄位（需 LLM）|
| `scripts/enrich-new-tools.js` | 批次補齊語意欄位（`npm run enrich:new`）|
| `cli.js` | 重寫 `cmdBatchAdd` — 整合 resolver + scanner，產出詳細報告 |

---

## 未來擴充方向

- [ ] 支援非 GitHub 平台（GitLab, Bitbucket, PyPI, npm）
- [ ] 人工確認模式（`batch-add --review`）：產生草稿後等待確認再寫入
- [ ] 自動更新檢測：定期檢查已註冊工具的 README 是否有重大變更
- [ ] 分類自學習：根據使用者實際搜尋行為調整分類權重
