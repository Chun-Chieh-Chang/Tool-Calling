# Tool-Calling 快速上手指南

## 🚀 5 分鐘快速開始

### Step 1：切換到專案目錄
```powershell
cd "D:\Self-developed_Apps\Tool-Calling"
```

### Step 2：查看可用命令
```powershell
node cli.js help
```

### Step 3：試試搜尋工具
```powershell
# 用自然語言搜尋
node cli.js search "PDF 轉換工具"

# 或搜尋技能
node cli.js find-skill "pdf"
```

### Step 4：列出已安裝的技能
```powershell
node cli.js list-skills
```

---

## 📋 常用命令速查表

### 工具管理
```powershell
node cli.js list                          # 列出所有工具
node cli.js search "搜尋關鍵字"            # 搜尋工具
node cli.js info <工具ID>                  # 查看詳情
```

### 技能發現
```powershell
node cli.js find-skill "關鍵字"           # 搜尋技能
node cli.js install-skill "skill-id"      # 安裝技能
node cli.js list-skills                   # 列出已安裝
```

### 任務執行
```powershell
node cli.js plan "<任務描述>"             # 自動規劃工具鏈
node cli.js invoke <工具ID> [參數]         # 執行工具
node cli.js cleanup                       # 清理臨時文件
```

### 分析對比
```powershell
node cli.js compare <工具1> <工具2>       # 競品對比
node cli.js interview "<需求>"            # 需求釐清問答
```

---

## 💡 實際使用範例

### 範例 1：處理 PDF 文件
```powershell
# 1. 搜尋相關工具
node cli.js search "PDF"

# 2. 搜尋技能
node cli.js find-skill "pdf"

# 3. 安裝需要的技能
node cli.js install-skill "anthropics/document-skills"

# 4. 執行轉換
node cli.js invoke pdf-converter --input file.pdf --output file.html
```

### 範例 2：網頁爬蟲任務
```powershell
# 1. 規劃完整工作流程
node cli.js plan "爬取產品網站，提取資料，生成報告"

# 2. 執行各步驟
node cli.js invoke web-scrape --url "https://example.com"
node cli.js invoke data-cleaner --input scraped.json
node cli.js invoke report-generator --data cleaned.json
```

### 範例 3：測試框架選型
```powershell
# 1. 進行需求釐清
node cli.js interview "我需要一個自動化測試框架"

# 2. 對比競爭工具
node cli.js compare "playwright" "puppeteer" "selenium"

# 3. 選擇最適合的工具
```

---

## 🤖 AI Agent 集成（MCP）

### 啟動 MCP Server
```powershell
npm run mcp
```

### AI Agent 可調用的工具
| 工具名 | 功能 |
|--------|------|
| `find_skill` | 搜尋 Agent Skills |
| `install_skill` | 安裝技能 |
| `list_skills` | 列出已安裝技能 |
| `search_tools` | 搜尋工具 |
| `plan_task` | 規劃任務流程 |
| `invoke_tool` | 執行工具 |

---

## ❓ 常見問題

**Q: 為什麼第一次執行很慢？**
A: skills.sh CLI 首次需要下載 Node.js（約 10-20 秒），之後會快很多。

**Q: GitHub API 返回 401 是什麼意思？**
A: 這是正常的，GitHub API 需要認證。系統會自動 fallback 到 skills.sh。

**Q: 離線可以使用嗎？**
A: 可以！有緩存時（1小時內）可離線使用基本功能。

**Q: 如何添加自己的工具？**
A: 使用 `node cli.js add https://github.com/your/repo`

---

## 📚 詳細文檔

更多資訊請查看：
- `docs/USAGE-GUIDE.md` - 完整使用指南
- `docs/SKILLS-SH-vs-TOOL-CALLING.md` - 與 skills.sh 的比較

---

**祝您使用愉快！** 🎉
