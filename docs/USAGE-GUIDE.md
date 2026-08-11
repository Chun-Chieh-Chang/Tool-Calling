# Tool-Calling 使用指南（人話版）

## 這是什麼？

想像你有一個 **AI 工具工具箱**，裡面收錄了 **513 個熱門開源工具**。當你不知該用哪個工具時，直接問它就好！

**例子：**
- "我要做簡報" → 它會推薦最合適的工具
- "爬網站" → 列出所有爬蟲工具讓你選
- "圖片生成" → 找出 Stable Diffusion、ComfyUI 等

---

## 你最可能用到的指令

### 📍 搜尋工具（最常用）

```bash
# 用中文或英文問都行
node cli.js search "製作簡報"
node cli.js search "python web scraper"
node cli.js search "圖片生成 ai" -c "多媒體生成"
```

### 🧭 規劃流程（複雜任務）

```bash
# 一個指令幫你拆解整個流程
node cli.js plan "爬取 GitHub 熱門專案，分析星數趨勢，產出報告"
```

### 🚀 執行工具

```bash
# 在安全的 Docker 環境中執行
node cli.js invoke ppt-master --template basic

# 先安裝再看效果
node cli.js install ppt-master
```

### 🗂️ 管理工具庫

```bash
# 看有哪些工具可用
node cli.js list

# 查看某個工具的詳細資訊
node cli.js info ppt-master

# 新增工具（貼上 GitHub 連結）
node cli.js add https://github.com/user/some-tool
```

---

## AI Agent 怎麼用？（MCP Server）

如果你要用 Claude、Cursor、Codex 這些 AI 編輯器，可以啟動 MCP Server：

```bash
npm run mcp
```

啟動後，AI 就能直接用這些工具：
- `search_tools` — 搜尋工具
- `run_tool_async` — 背景執行工具（不會卡住）
- `get_job_status` — 查看執行進度
- `cancel_job` — 取消正在跑的任務

---

## 常見問題

### Q: 我不知道要用哪個工具怎麼辦？
A: 直接問 `node cli.js interview "我想要做簡報"`，它會一步步問清楚你的需求。

### Q: 工具會在我電腦亂跑嗎？
A: 不會。所有工具都在 Docker 沙盒中執行，預設是「離線模式」，不能連網、不能讀寫你的檔案。

### Q: 資料品質如何？
A: 每次驗證都會檢查：
```bash
npm run validate    # 0 errors, 0 warnings = 完美
```

### Q: 搜尋準確嗎？
A: 經過評測：
- **90%** 的查詢都能找到正確的 Tool
- 回應速度 **< 1ms**
- 支援中英文、口語化搜尋

---

## 快速參考卡

| 你想做什麼 | 輸入這個 |
|-----------|---------|
| 找工具 | `node cli.js search "需求"` |
| 規劃流程 | `node cli.js plan "長任務"` |
| 執行工具 | `node cli.js invoke <id>` |
| 列出工具 | `node cli.js list` |
| 查詢詳情 | `node cli.js info <id>` |
| 新增工具 | `node cli.js add <url>` |
| 清理殘留 | `node cli.js cleanup` |
| 健康檢查 | `npm run health-check` |

---

## 開發者怎麼用？

### 直接在程式碼中導入
```javascript
import { search } from './core/search-engine.js';
import { loadRegistry } from './core/registry.js';

const tools = loadRegistry().tools;
const results = search(tools, '簡報', { topK: 5 });
console.log(results[0].tool.name); // "PPT Master"
```

### 建立非同步作業
```javascript
import { createJob, getJob } from './core/job-manager.js';

// 提交背景任務
const { job_id } = createJob({
  tool_id: 'ppt-master',
  args: ['--template', 'basic'],
  tool: tools[0],
  targetPath: '/tmp/tools',
});

// 稍後查詢結果
const job = getJob(job_id);
console.log(job.status); // "completed"
```

---

## 一句话總結

> **「描述你的需求，它幫你找工具、跑流程、守安全。」**

不需要懂技術細節，只要說出你想做什麼就好。
