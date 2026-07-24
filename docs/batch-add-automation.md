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

---

### 第二層：自動分類 (`scripts/scan-tool.js`)

三階段分類機制，確保工具歸類到正確的分類：

#### Phase 1 — 精準比對
使用 `CATEGORY_RULES`（17 個分類，每個含複合關鍵字 + word boundary 檢查）：

| 分類 | 關鍵詞範例 |
|------|-----------|
| AI 代理 | `agent-framework`, `llm-app`, `gemini`, `gpt-proxy`, `openai-compatible` |
| 瀏覽器自動化 | `browser-automation`, `headless-browser`, `playwright`, `puppeteer` |
| 學習資源 | `awesome-list`, `reference-guide`, `roadmap`, `api-directory`, `public-apis` |
| 安全性 | `cybersec`, `osint`, `pentest`, `vulnerability`, `ctf` |
| 文件生產力 | `powerpoint`, `spreadsheet`, `docx`, `xlsx`, `pdf` |
| ...等 17 個分類 | ... |

#### Phase 2 — 備用比對
使用 `FALLBACK_KEYWORDS`（15 個分類，一般關鍵字覆蓋更多長尾場景）

#### Phase 3 — Heuristic 推斷
從 URL 與描述中推斷：
- `microsoft` / `azure` → **基礎設施**
- `aws` / `google-cloud` → **基礎設施**
- `ai` / `llm` → **AI 代理**
- `cli` / `command` → **開發工具**

---

### 第三層：安裝方式猜測 (`guessInstall`)

根據語言與 repo 特徵決定安裝指令：

| 語言 / 特徵 | 安裝方式 |
|------------|---------|
| Python | `pip install git+{url}.git` |
| TypeScript / JavaScript | `npx {repo-name}` |
| PHP | `composer require owner/repo` |
| Rust | `cargo install --git {url}` |
| Markdown / 無程式碼 | `method: "none"`（僅供參考） |

**非可安裝資源檢測**：若描述或 topics 包含 `awesome-list`, `public-apis`, `api-directory`, `catalog`, `roadmap` 等信號，自動設為 `method: "none"`，避免產生錯誤的安裝指令。

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
| `scripts/scan-tool.js` | 擴充分類規則（+15 關鍵詞）、修正 `guessInstall` 處理非安裝型 repo |
| `cli.js` | 重寫 `cmdBatchAdd` — 整合 resolver + scanner，產出詳細報告 |

---

## 未來擴充方向

- [ ] 支援非 GitHub 平台（GitLab, Bitbucket, PyPI, npm）
- [ ] 人工確認模式（`batch-add --review`）：產生草稿後等待確認再寫入
- [ ] 自動更新檢測：定期檢查已註冊工具的 README 是否有重大變更
- [ ] 分類自學習：根據使用者實際搜尋行為調整分類權重
