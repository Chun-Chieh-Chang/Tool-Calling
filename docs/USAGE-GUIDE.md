# Tool-Calling 使用指南

## 🚀 快速開始

### 環境準備

```powershell
# 1. 切換到專案目錄
cd "D:\Self-developed_Apps\Tool-Calling"

# 2. 安裝依賴（如果尚未安裝）
npm install

# 3. 驗證環境
npm test                    # 運行所有測試
node cli.js health-check    # 檢查系統健康狀態
```

---

## 📦 核心功能一覽

### 1. 工具管理命令

| 命令 | 說明 | 範例 |
|------|------|------|
| `list` | 列出所有已註冊工具 | `node cli.js list` |
| `search` | 搜尋最適工具 | `node cli.js search "做簡報"` |
| `info` | 查看工具詳細資訊 | `node cli.js info playwright` |
| `add` | 新增工具 | `node cli.js add https://github.com/xxx/tool` |
| `batch-add` | 批量新增 | `node cli.js batch-add tools.json` |
| `remove` | 移除工具 | `node cli.js remove my-tool` |
| `validate` | 驗證註冊庫格式 | `node cli.js validate` |
| `health-check` | 檢查工具 URL 可用性 | `node cli.js health-check` |

### 2. 技能搜尋命令（新功能）

| 命令 | 說明 | 範例 |
|------|------|------|
| `find-skill` | 搜尋 Agent Skills | `node cli.js find-skill "pdf"` |
| `install-skill` | 安裝技能 | `node cli.js install-skill "anthropic/document-skills"` |
| `list-skills` | 列出已安裝技能 | `node cli.js list-skills` |

### 3. 執行命令

| 命令 | 說明 | 範例 |
|------|------|------|
| `install` | 獲取工具原始碼 | `node cli.js install playwright` |
| `invoke` | 在沙盒中執行工具 | `node cli.js invoke playwright --headless` |
| `cleanup` | 清除臨時文件 | `node cli.js cleanup` |

### 4. 分析命令

| 命令 | 說明 | 範例 |
|------|------|------|
| `plan` | 多工具鏈自動規劃 | `node cli.js plan "抓取網頁內容並生成報告"` |
| `compare` | 競品選型對比 | `node cli.js compare "playwright" "puppeteer"` |
| `interview` | 互動式需求釐清 | `node cli.js interview "我要做自動化測試"` |
| `verify-environment` | 沙盒環境預檢 | `node cli.js verify-environment playwright` |

---

## 🎯 使用場景範例

### 場景 1：搜尋 PDF 相關工具

```powershell
# 使用自然語言搜尋
node cli.js search "PDF 轉換"

# 查看詳細資訊
node cli.js info pdf-to-html

# 在沙盒中執行
node cli.js invoke pdf-converter --input report.pdf --output report.html
```

### 場景 2：任務規劃與執行

```powershell
# 規劃複雜任務的工具鏈
node cli.js plan "爬取公司官網的產品資訊，整理成 Excel 表格"

# 查看規劃結果後執行
node cli.js invoke web-scrape --url "https://example.com/products"
node cli.js invoke excel-export --data scraped-data.json --sheet products
```

### 場景 3：Find Skill - 技能發現

```powershell
# 搜尋 PDF 處理技能
node cli.js find-skill "pdf" -n 5

# 搜尋並查看結果
node cli.js find-skill "typescript testing"

# 安裝技能
node cli.js install-skill "anthropics/document-skills"

# 列出已安裝的技能
node cli.js list-skills
```

### 場景 4：競品對比分析

```powershell
# 對比多個工具
node cli.js compare "playwright" "puppeteer" "selenium"

# 分析結果會顯示每個工具的優缺點和適用場景
```

### 場景 5：互動式需求釐清

```powershell
# AI 會透過問答幫你釐清需求
node cli.js interview "我需要一個自動化測試解決方案"

# 系統會逐步提問：
# - 測試對象是什麼？
# - 需要支援哪些瀏覽器？
# - 測試頻率如何？
# ...然後推薦最適合的工具組合
```

---

## 🤖 MCP Server 使用

MCP Server 提供 AI Agent 可調用的工具接口：

### 啟動 MCP Server

```powershell
# 運行 MCP Server
npm run mcp

# 輸出：
# [MCP] Tool-Calling MCP v2.0 已啟動 (STDIO)
# [MCP] Async job system enabled
```

### AI Agent 可調用的工具

#### 工具管理
| 工具名 | 功能 |
|--------|------|
| `list_tools` | 列出所有工具 |
| `search_tools` | 搜尋工具 |
| `get_tool_detail` | 獲取工具詳情 |

#### 背景作業
| 工具名 | 功能 |
|--------|------|
| `run_tool_async` | 异步執行工具 |
| `get_job_status` | 查詢作業狀態 |
| `cancel_job` | 取消作業 |
| `list_jobs` | 列出作業記錄 |
| `get_job_stats` | 作業統計 |

#### 技能發現（新功能）
| 工具名 | 功能 |
|--------|------|
| `find_skill` | 搜尋 Agent Skills |
| `install_skill` | 安裝技能 |
| `list_skills` | 列出已安裝技能 |

### MCP 使用範例

```json
// AI Agent 調用範例
{
  "name": "find_skill",
  "arguments": {
    "query": "pdf",
    "limit": 10
  }
}
```

---

## 🔍 搜尋技巧

### 自然語言搜尋

Tool-Calling 支援自然語言查詢，無需記準確的工具名稱：

```powershell
# ❌ 不需要記得精確名稱
node cli.js search "web scraping tool"

# ✅ 可以使用中文
node cli.js search "網頁爬蟲工具"

# ✅ 可以描述需求
node cli.js search "我要做自動化測試"
```

### 分類過濾

```powershell
# 按分類篩選
node cli.js search "API client" -c "networking"

# 限制結果數量
node cli.js search "testing" -k 5
```

---

## 🛡️ 安全執行

### 沙盒隔離

所有工具都在 Docker 沙盒中執行，確保安全：

```powershell
# 執行工具時自動使用沙盒
node cli.js invoke my-tool --args "arg1" "arg2"

# 指定超時時間
node cli.js invoke my-tool --timeout 60
```

### 環境預檢

在執行前檢查環境是否就緒：

```powershell
# 檢查特定工具的執行環境
node cli.js verify-environment playwright

# 檢查通用環境
node cli.js health-check
```

---

## 📊 常用命令彙總

### 日常使用

```powershell
# 查看所有可用命令
node cli.js help

# 列出工具庫
node cli.js list

# 搜尋工具
node cli.js search "<需求>"

# 搜尋技能
node cli.js find-skill "<關鍵字>"

# 查看幫助
node cli.js <command> --help
```

### 開發者使用

```powershell
# 新增工具
node cli.js add https://github.com/user/tool-repo

# 批量新增
node cli.js batch-add tools.json

# 驗證註冊庫
node cli.js validate

# 清理臨時文件
node cli.js cleanup
```

### 測試與除錯

```powershell
# 運行測試
npm test

# 檢查環境
node cli.js health-check

# 查看作業記錄
node cli.js list-jobs
```

---

## ⚙️ 配置選項

### CLI 參數

| 參數 | 說明 | 預設值 |
|------|------|--------|
| `-n`, `--limit` | 限制結果數量 | 10 |
| `-c`, `--category` | 按分類過濾 | 全部 |
| `-k`, `--topK` | 返回前 K 筆 | 5 |
| `-g`, `--global` | 全域安裝 | false |
| `-a`, `--agent` | 指定目標 Agent | null |
| `--timeout` | 執行超時秒數 | 120 |

### 環境變數

| 變數 | 說明 | 預設值 |
|------|------|--------|
| `TOOL_CALLING_DEBUG` | 啟用除錯模式 | false |
| `SKILL_LIMIT` | 技能搜尋最大結果 | 10 |
| `CACHE_TTL` | 緩存有效期（毫秒） | 3600000 |

---

## 🐛 疑難排解

### 問題：找不到 Node.js

```
[Agnes] Node.js not found. Downloading portable Node.js...
```

**解決方法：**
```powershell
# 方法 1：等待自動下載完成（約需 1-2 分鐘）
# 方法 2：手動安裝 Node.js
# 下載：https://nodejs.org/
```

### 問題：GitHub API 401 錯誤

```
[skill-discovery] GitHub search failed: GitHub API error: 401
```

**說明：** 這是預期行為，GitHub API 需要認證才能使用。系統會自動 fallback 到 skills.sh。

**解決方法：**
```powershell
# 使用 skills.sh 作為主要來源（已自動處理）
node cli.js find-skill "pdf"

# 或設定 GitHub Token
export GITHUB_TOKEN=your_token_here
```

### 問題：skills CLI 下載失敗

**原因：** 網路連線不穩定或防火牆阻擋。

**解決方法：**
```powershell
# 方法 1：等待下載完成（首次約需 10-20 秒）
# 方法 2：手動安裝 skills CLI
npx skills --version

# 方法 3：使用離線模式（如果有緩存）
node cli.js list-skills
```

### 問題：測試超時

```
AssertionError: Search should complete within 10 seconds
```

**解決方法：** 這通常是因為首次執行 skills CLI 需要下載時間。系統已自動調整為 30 秒超時。

---

## 📚 更多資源

- **技術文檔**: `docs/FIND-SKILL-INTEGRATION-COMPLETE.md`
- **整合報告**: `docs/FIND-SKILL-FINAL-REPORT.md`
- **比較分析**: `docs/SKILLS-SH-vs-TOOL-CALLING.md`

---

## 🎯 快速參考卡片

```
┌─────────────────────────────────────────────────────┐
│         Tool-Calling 快速參考                       │
├─────────────────────────────────────────────────────┤
│ 搜尋工具：   node cli.js search "<需求>"             │
│ 搜尋技能：   node cli.js find-skill "<關鍵字>"       │
│ 執行工具：   node cli.js invoke <id> [args...]       │
│ 規劃任務：   node cli.js plan "<任務描述>"           │
│ 對比工具：   node cli.js compare <tool1> <tool2>     │
│ 查看幫助：   node cli.js help                        │
│ 列出技能：   node cli.js list-skills                 │
│ 安裝技能：   node cli.js install-skill <id>          │
└─────────────────────────────────────────────────────┘
```
