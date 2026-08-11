# Tool-Calling 使用指南

## 快速开始

```bash
# 安装依赖
npm install

# 运行测试
npm test

# 验证工具库质量
npm run validate

# 检查分类完整性 (MECE)
npm run check-mece
```

---

## CLI 核心命令

### 工具搜尋
```bash
# 自然語言搜尋
node cli.js search "製作簡報"
node cli.js search "python RAG web scraper"
node cli.js search "image generation" -c "多媒體生成"

# 多工具鏈規劃
node cli.js plan "抓取動態網頁內容，轉成簡報"

# 白話互動問答
node cli.js interview "網頁爬蟲"
```

### 工具執行
```bash
# 在 Docker 沙盒中安全執行
node cli.js invoke ppt-master --template basic

# 安裝工具到 .temp/
node cli.js install ppt-master

# 清理臨時檔案
node cli.js cleanup
```

### 工具庫管理
```bash
# 列出所有工具
node cli.js list

# 查看工具詳情
node cli.js info ppt-master

# 新增工具
node cli.js add https://github.com/user/repo

# 批量新增
echo "https://github.com/a/b
https://github.com/c/d" > urls.txt
node cli.js batch-add urls.txt

# 移除工具
node cli.js remove ppt-master
```

---

## MCP Server (AI Agent 集成)

```bash
# 啟動 MCP Server
npm run mcp
# 或
node mcp-server.js
```

### MCP Tools (5 個)
| Tool | 功能 |
|------|------|
| `list_tools` | 列出所有工具（可分類過濾） |
| `search_tools` | 自然語言搜尋工具 |
| `get_tool_detail` | 獲取工具詳細資訊 |
| `run_tool_async` | 非同步執行工具（返回 job_id） |
| `get_job_status` | 查詢作業狀態 |
| `cancel_job` | 取消作業 |
| `list_jobs` | 列出近期作業 |
| `get_job_stats` | 作業統計 |

---

## 程式碼導入 (Library Mode)

```javascript
import { search } from './core/search-engine.js';
import { loadRegistry } from './core/registry.js';
import { createJob, getJob } from './core/job-manager.js';
import { assessRegistryContract } from './core/registry-contract.js';

// 搜尋工具
const tools = loadRegistry().tools;
const results = search(tools, '簡報', { topK: 5 });

// 建立非同步作業
const { job_id } = createJob({
  tool_id: 'ppt-master',
  args: ['--template', 'basic'],
  tool: { /* tool metadata */ },
  targetPath: '/tmp/tools',
});

// 檢查品質
const summary = assessRegistryContract(tools);
console.log(summary.averageQualityScore); // 100/100
```

---

## 資料結構

### 工具庫 (`registry/tools.json`)
```json
{
  "version": "2.0",
  "lastUpdated": "2026-08-11T00:00:00Z",
  "tools": [
    {
      "id": "ppt-master",
      "name": "PPT Master",
      "category": "文件生產力",
      "description": "...",
      "triggers": ["簡報", "ppt", "presentation"],
      "advantages": ["..."],
      "negativeConstraints": ["..."],
      "language": "typescript",
      "status": "active"
    }
  ]
}
```

### Job 狀態 (`core/job-manager.js`)
```javascript
{
  job_id: "job_1234567890_abc123",
  tool_id: "ppt-master",
  status: "running", // pending | running | completed | failed | cancelled | timeout
  stdout: "...",
  stderr: "...",
  exit_code: 0,
  duration_ms: 1234,
  created_at: "2026-08-11T00:00:00Z",
  completed_at: "2026-08-11T00:01:00Z"
}
```

---

## 常用指令對照表

| 用途 | 指令 |
|------|------|
| 搜尋工具 | `node cli.js search "<需求>"` |
| 規劃流程 | `node cli.js plan "<任務>"` |
| 執行工具 | `node cli.js invoke <id> [args]` |
| 查看狀態 | `node cli.js list` / `node cli.js info <id>` |
| 新增工具 | `node cli.js add <url>` |
| 驗證品質 | `npm run validate` |
| 健康檢查 | `npm run health-check` |
| 每週漲星 | `npm run trending` |

---

## API Reference

### Search Engine
```javascript
search(tools, query, options) => SearchResult[]
// options: { topK: 5, category: string, telemetryStats: {} }
```

### Job Manager
```javascript
createJob(params) => { job_id: string }
executeJob(job_id) => Promise<void>
getJob(job_id) => Job | null
cancelJob(job_id) => { success: boolean }
listJobs(options) => Job[]
getStats() => { total, pending, running, completed, ... }
```

### Telemetry Summary
```javascript
buildSummary() => TelemetrySummary
loadSummary(forceRefresh?) => TelemetrySummary
getSearchStats() => Record<string, { total, success_rate }>
invalidateCache() => void
```

---

## 進階功能

### 多工具鏈規劃 (Tool Chain Planner)
```bash
node cli.js plan "爬取 GitHub 熱門專案，分析 star 趨勢，生成報告"
```

### Telemetry 匯出
```bash
node cli.js export-dataset ./train-data.jsonl
```

### 觸發咒語
```
「啟動全自動工具調用模式」
```
AI Agent 會自動識別 + 選擇 + 調用工具

---

## 最佳實踐

1. **搜尋前確認分類**：先 `list` 查看可用分類
2. **使用 async 執行**：長任務用 `run_tool_async`，避免阻塞
3. **定期驗證**：`npm run validate` 確保資料品質
4. **監控 telemetry**：用 `get_job_stats` 了解成功率

---

## 檔案結構

```
Tool-Calling/
├── cli.js                    # 主 CLI
├── mcp-server.js             # MCP Server (v2)
├── core/
│   ├── search-engine.js      # 三層搜尋引擎
│   ├── job-manager.js        # 非同步作業系統
│   ├── telemetry-summary.js  # 快取統計
│   ├── registry-contract.js  # 品質評分
│   ├── registry.js           # 工具庫載入
│   └── sandbox.js            # Docker 沙盒
├── registry/
│   └── tools.json            # 513 工具 (JSON)
├── tests/
│   ├── eval-benchmark.js     # 評測基準
│   ├── job-manager.test.js   # 12 測試
│   └── telemetry-summary.test.js  # 5 測試
├── scripts/
│   └── fix-low-quality-tools.js  # 資料修復
└── docs/
    ├── task_plan.md          # 專案計畫
    └── progress.md           # 進度日誌
```
