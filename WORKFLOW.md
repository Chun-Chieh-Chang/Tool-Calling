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
| 基礎設施 | `infrastructure`, `devops`, `kubernetes`, `docker`, `cloud` |
| API 整合 | `mcp-server`, `webhook`, `graphql`, `rest-api`, `sdk` |
| ...等 17 個分類 | ... |

### Phase 2 — 備用比對（15 個通用分類）
### Phase 3 — Heuristic 推斷
- `microsoft` / `azure` → **基礎設施**
- `aws` / `google-cloud` → **基礎設施**
- `ai` / `llm` → **AI 代理**
- `cli` / `command` → **開發工具**

---

## 四、安裝方式猜測 (`guessInstall`)

| 語言 / 特徵 | 安裝方式 |
|------------|---------|
| Python | `pip install git+{url}.git` |
| TypeScript / JavaScript | `npx {repo-name}` |
| PHP | `composer require owner/repo` |
| Rust | `cargo install --git {url}` |
| Markdown / 無程式碼 | `method: "none"` |
| 包含 resourceSignals | `method: "none"` |

---

## 五、 enrich 補完流程

新增工具後，執行：
```bash
npm run enrich
# 或
node scripts/enrich-registry.js
```

**會自動補完的欄位：**
- `description` - 專業摘要（100字以內）
- `useCase` - 推薦場景（1句具體描述）
- `advantages` - 優勢標籤（2-3條）
- `negativeConstraints` - 禁用場景（1-3條）
- `triggers` - 觸發詞（至少2個）

**觸發條件（status 為 experimental 的工具）：**
- 缺少 `useCase`
- 缺少 `advantages` 或為空陣列
- 缺少 `negativeConstraints` 或為空陣列
- 描述含「待補充描述」
- 觸發詞不足 2 個

---

## 六、品質門禁（提交前必過）

新增或修改工具後，必須依序通過以下三項檢查才能提交 Git：

```bash
node cli.js validate        # 1. 全庫 0 錯誤 0 警告
npm run check-mece          # 2. MECE 分類檢查（無「其他」殘留）
npm test                    # 3. 11/11 測試全數 PASS
```

批次新增後另需執行 `node scripts/build-web.js` 更新知識圖譜與前端。

---

> 📌 過往批次的新增紀錄與 Git commit 對照請見 `DEV_LOG.md`（單一數據源），本文件僅保留可重複執行的流程規範。
