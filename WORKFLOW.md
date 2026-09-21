# 工具庫新增工作流 (Workflow)

## 一、新增工具的路徑

### 方法 A：單一工具新增
```bash
node cli.js add <github-url>
```

**處理流程：**
1. 驗證 URL 格式（支援 subpath）
2. 檢查是否已存在（by URL）
3. 呼叫 `scan-tool.js` 掃描 README + GitHub API
4. 自動分類（三階段：精準比對 → 備用比對 → Heuristic 推斷）
5. 猜測安裝方式（pip/npm/cargo/composer/git-clone）
6. 寫入 `registry/tools.json`
7. 更新知識圖譜

### 方法 B：批量新增
```bash
node cli.js batch-add urls.txt
```

**urls.txt 格式：**
```
# 這是註解，會被跳過
https://github.com/owner/repo-1
https://github.com/owner/repo-2
```

**處理流程：**
1. 讀取檔案，過濾空白行與註解
2. 去重（同一 URL 不會重複加入）
3. 對每條 URL 執行 `resolve()` 判斷類型：
   - **resource** → 直接從 GitHub API 抓基本資訊，設為 `method: none`
   - **tool** → 呼叫 `scan()` 掃描後加入
   - **monorepo** → 拆解為子工具，逐一掃描加入
4. 寫入 `registry/tools.json`

---

## 二、URL 類型解析規則 (`scripts/url-resolver.js`)

### Resource 類型（學習資源）
**信號詞：**
- `awesome-list`, `public-apis`, `free-api`, `api-directory`
- `roadmap`, `curriculum`, `learning-path`, `cheatsheet`
- `handbook`, `reference-guide`, `catalog`, `directory`

**行為：** 設為 `method: "none"`，作為參考資料加入

### Monorepo 類型（需拆解）
**信號詞：**
- `skills-builder`, `agent-skills`, `claude-skills`, `prompt-library`
- `toolkit`, `collection`, `monorepo`, `awesome-`, `list-of`

**拆解規則：**
1. 排除已知單體專案：`gemini-cli`, `claude-code`, `cursor`, `copilot`, `continue`
2. 偵測子目錄是否符合工具集合模式：
   - 目錄名含 `skills/`, `agents/`, `tools/`, `providers/`, `extensions/`, `plugins/`, `modules/`, `components/`
3. 檢查根目錄 `package.json` 是否有 `workspaces` 設定
4. 至少需要 2 個有效子工具才觸發拆解
5. 🔴 **「同一產品的樣板／領域實例」不拆**（2026-09-21 新增判準）

   **判準**：子目錄是「獨立的工具」，還是「同一產品的樣板／領域實例」？後者不拆。

   實例：`oracle/fusion-ai-studio` 的 `aiapps/{scm,prc,hcm}`、`extensions`、`how-to`
   全部是**同一產品（Oracle Fusion AI Agent Studio）的樣板與領域實例**，
   且按產品 release 分支發佈。拆成 N 筆只會得到 N 筆重複條目，
   反而稀釋鑑別力（見 HANDOFF 陷阱 3「擴充過度會退步」）。

   對照：真正的 monorepo 每個子工具都有**自己的**安裝方式與用途 → 該拆。

---

## 三、分類規則 (`scripts/scan-tool.js`)

### Phase 1 — 精準比對（複合關鍵字 + word boundary）
| 分類 | 關鍵詞範例 |
|------|-----------|
| AI 代理 | `agent-framework`, `llm-app`, `gemini`, `gpt-proxy` |
| 瀏覽器自動化 | `browser-automation`, `headless-browser`, `playwright` |
| 學習資源 | `awesome-list`, `reference-guide`, `roadmap`, `api-directory` |
| 安全性 | `cybersec`, `osint`, `pentest`, `vulnerability`, `ctf` |
| 文件生產力 | `powerpoint`, `spreadsheet`, `docx`, `xlsx`, `pdf` |
| 知識管理 | `knowledge-graph`, `knowledge-base`, `memory`, `wiki` |
| API 整合 | `mcp-server`, `webhook`, `graphql`, `rest-api`, `sdk` |
| ...等共 **12 條**規則（輸出仍是 18 個分類） | 詳見 `docs/CATEGORY-SYSTEM.md` (MECE 原則) |

### Phase 2 — 備用比對（通用分類關鍵詞）
### Phase 3 — Heuristic 推斷
- `ai` / `llm` → **AI 代理**
- `agent` / `skill` → **開發工具**
- `cli` / `command` → **開發工具**
- `automation` → **測試與自動化**
- MECE 兜底 → **開發工具**（禁止產生「其他」殘留）

---

## 四、安裝方式判定 (`detectInstall`)

🔴 **2026-09-21 改寫**。舊版 `guessInstall()` 只憑語言猜測，會產生「照著做必定失敗」的指令
（例：Next.js 應用被給 `npx anatomy`、Blender 範本被給 `pip install git+…`）。

現在**讀 repo 根目錄的封裝檔，有證據才給套件指令**：

| 根目錄檔案 | 安裝方式 |
|------------|---------|
| `package.json` 有 `bin` 且非 `private` | `npx <name>` |
| `package.json` 其他（應用程式／樣板） | `git clone` |
| `pyproject.toml` / `setup.py` | `pip install git+{url}.git` |
| `Cargo.toml` | `cargo install --git {url}` |
| `composer.json` | `composer require owner/repo` |
| 以上皆無 | `git clone` |
| 查不到檔案清單（限流等） | `git clone`（**不猜**） |
| 含 resourceSignals（15 個信號詞） | `method: "none"` |

> 原則：`git clone` 對任何 GitHub repo 都成立，是**誠實的下界**。
> 給錯的指令比留白更糟。

---

## 五、語意欄位補齊（兩階段流程）

新增工具後**不要**執行 `npm run enrich`。

```bash
# ✅ 正確：第二階段（基於 README，需 AGNES_API_KEY）
npm run enrich:new              # 可加 --dry / --limit=N / --ids=a,b

# ❌ 禁用：scripts/enrich-registry.js
#    它的 prompt 明寫「依 Name 與 URL 猜測用途」，
#    違反本專案「不可憑名稱推測 metadata」的規範。
```

**流程**：`scripts/scan-tool.js`（第一階段，無 LLM）先把工具寫入 registry，
狀態為 `experimental`；`core/tool-enricher.js`（第二階段，讀 README）補齊語意欄位，
通過 `isFullyEnriched()` 才升為 `active`。

**會自動補完的欄位（皆基於 README，不足時留白）：**
- `useCase` - 具體使用情境（1 句，不可複製 `description`）
- `advantages` - 相對其他選擇的優勢（2~4 條，必須是陣列）
- `capabilities` - kebab-case 技術標籤（3~6 個）
- `useCase_zh` / `advantages_zh` - 上述欄位的繁體中文版

> ⚠️ `description_zh` **只由 `npm run translate:zh` 產生**，enricher 刻意不產生它
> （否則會出現「英文描述說 A、中文描述說 B」的不一致）。

---

## 六、品質門禁（提交前必過）

新增或修改工具後，必須依序通過以下檢查才能提交 Git：

```bash
node scripts/check-syntax.js  # 0. 語法守門（全部 .js 跑 node --check）
node cli.js validate          # 1. 全庫 0 錯誤 0 警告
npm run check-mece            # 2. MECE 分類檢查（無「其他」殘留）
npm run categories:check      # 3. 衍生分類文件與 categories.json 同步
npm test                      # 4. 測試 0 fail（項數以實際輸出為準）
```

批次新增後另需執行 `node scripts/build-web.js` 更新知識圖譜與前端。

---

> 📌 過往批次的新增紀錄與 Git commit 對照請見 `DEV_LOG.md`（單一數據源），本文件僅保留可重複執行的流程規範。
