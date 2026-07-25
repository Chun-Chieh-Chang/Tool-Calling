# Tool-Calling 🔧⚡

> 一個幫你自動找工具、裝工具、用工具的全自動 AI 助手與知識圖譜系統

## 這是什麼？

想像你有一個 **全功能 AI 工具箱**，裡面收錄了 **320+ 個開源 AI 工具與 Agent 技能**：

- 📊 **數據與分析**：Grafana、Pandas-AI、PostHog
- 📄 **簡報與文件生產力**：AIPPT、NotebookLM2PPT、Docling
- 🧠 **知識管理與圖譜**：Graphify、Ontology、RAGFlow
- 🤖 **AI 框架**：LangChain、Dify、CrewAI、AutoGen
- 🧪 **測試與自動化**：Playwright、n8n、Browser-Use
- 🎨 **多媒體與設計**：Stable Diffusion、ComfyUI、Canvas
- 還有更多……

**這個專案的作用就是：** 當你需要做某件事時，它幫你自動找到最適合的工具，裝好、執行完、再收乾淨，同時提供 **全站 4 大分頁實時連動與 100% 資料驅動的互動式知識圖譜**。

---

## 用法一：自己搜尋（最直覺）

打開心命令提示字元（CMD / PowerShell），輸入：

```bash
node cli.js search "我要做簡報"
```

它會列出符合的工具，你挑一個來用。

更多指令：

| 你要做什麼 | 輸入這行 |
|-----------|---------|
| 看所有工具 | `node cli.js list` |
| 搜尋工具 | `node cli.js search "我想做簡報"` |
| 看某個工具的詳細資料 | `node cli.js info playwright` |
| 新增一個新工具 | `node cli.js add https://github.com/使用者/倉庫名稱` |
| **批量新增多個工具** | `node cli.js batch-add urls.txt` |
| **深層拆解 Monorepo 子工具** | `node cli.js index-subtools 工具ID` |
| 移除一個工具 | `node cli.js remove 工具ID` |

---

## 用法二：網頁版與 4 大分頁實時連動 Web UI (推薦 ⭐)

開啟專案下的 `web/index.html` 或執行打包 `node scripts/build-web.js`：

全站包含 **4 大視圖分頁**，並由全域 `AppState` 單一真理來源實時連動：

1. 📊 **儀表板總覽**：KPI 統計指標、Chart.js 分類與語言分佈圖、分類 Overview。
2. 🔧 **工具目錄列表**：三層檢索（L1精態/L2關鍵字/L3語意）工具卡片與 Match 比例。
3. 🔥 **每週漲星榜**：自動探勘 GitHub 當週熱門漲星排行榜。
4. 🌐 **互動式工具圖譜**：
   - **100% Data-Driven**：所有描述、數字與關聯 100% 由 `tools.json` 動態運算產生。
   - **連線語意說明**：
     - ━ **實線**：主分類歸屬網絡 (Category Hierarchy)
     - ╌ **虛線**：拆解微技能與能力 (Capability / SubTool)，點擊時亮顯。
   - **對角雙面板佈局**：右中分類選擇器 + 左下富文本抽屜面板。

---

## 用法三：讓 AI 自動幫你用 (MCP Server)

如果你在用 **Claude Desktop** 或 **Cursor** 這類 AI 軟體，可以把這個工具箱接上去。

接好之後，你只需要對 AI 說：

> 「幫我產生一份簡報」

AI 就會自己：
1. 搜尋工具箱 → 找到適合的工具
2. 安裝工具
3. 執行工具
4. 把結果回傳給你

### 怎麼接？

#### Claude Desktop

1. 在檔案總管地址列貼上 `%APPDATA%\Claude\`
2. 打開（或建立）`claude_desktop_config.json`
3. 寫入這段：

```json
{
  "mcpServers": {
    "tool-calling": {
      "command": "node",
      "args": ["D:\\你的路徑\\Tool-Calling\\mcp-server.js"]
    }
  }
}
```

⚠️ 記得把 `D:\\你的路徑\\Tool-Calling\\` 換成你實際的位置。

4. 重啟 Claude Desktop

#### Cursor

1. 打開 Settings → Features → MCP
2. 點擊 Add New MCP Server
3. Name 填 `tool-calling`
4. Type 選 `Command`
5. Command 填 `node D:\你的路徑\Tool-Calling\mcp-server.js`
6. 存檔，重啟 Cursor

---

## 用法四：在 Agnes 對話中使用

在 Agnes 聊天中說：

> 「啟動全自動工具調用模式，我想做一份簡報」

Agnes 就會自動幫你搜尋、確認、執行、清理。

---

## 用法五：跟 SkillsBuilder 搭配使用（擴充工具箱）

**SkillsBuilder** 是一個用來「開發和整理技能」的工具，而 **Tool-Calling** 是「搜尋和使用技能」的工具。兩者搭配起來就像：

- **SkillsBuilder** = 工廠（生產技能）
- **Tool-Calling** = 超市（搜尋和購買技能）

---

## 安全嗎？

**安全。** 所有工具都在隔離的容器（Docker）裡執行，不會影響你的電腦。

具體來說：
- 工具只能在容器內跑，不能存取你的網路
- 容器是唯讀的，不能改你的檔案
- 只允許從 GitHub 下載工具，不允許其他來源

---

## 檔案與架構說明 (MECE 分類)

```
Tool-Calling/
├── cli.js              ← 命令列控制端（支援 search, add, batch-add, list, info 等）
├── mcp-server.js       ← MCP 通訊伺服器（適配 Claude Desktop / Cursor）
├── registry/
│   ├── tools.json      ← 工具庫主單一真理來源（目前 320+ 個 AI 工具）
│   └── schemas/        ← JSON Schema 規範格式
├── core/
│   ├── search-engine.js  ← 三層檢索引擎（L1精確/L2關鍵字/L3 TF-IDF 語意）
│   ├── synonyms.generated.js ← 自動挖掘與同義詞詞典
│   ├── installer.js      ← 動態工具安裝器 (支援 Sparse Checkout)
│   ├── sandbox.js        ← Docker 沙盒隔離執行環境
│   ├── telemetry.js      ← 工具調用軌跡追蹤
│   ├── cleanup.js        ← 任務執行完畢清理器
│   └── registry.js       ← 工具庫載入與寫入核心模組
├── scripts/
│   ├── build-web.js            ← 靜態 Web 與圖譜打包發行腳本
│   ├── generate-knowledge-graph.js ← 100% Data-Driven 互動式圖譜生成器
│   ├── enrich-registry.js      ← AI 批次補齊 recommended useCase 與 constraints
│   ├── export-dataset.js       ← 萃取 Telemetry 為 SFT 訓練資料
│   ├── mine-synonyms.js        ← 同義詞自動探勘腳本
│   ├── populate-stars.js       ← 補齊 GitHub Stars 數據腳本
│   ├── scan-tool.js            ← GitHub URL 自動掃描解析器
│   ├── scan-monorepo.js        ← Monorepo 深層索引拆解器
│   ├── sync-github-stars.js    ← GitHub Stars 定期同步器
│   ├── trending-weekly.js      ← 每週熱門漲星排行榜探勘器
│   └── url-resolver.js         ← URL 類型自動解析器
├── tests/
│   └── search.test.js      ← 8 項單元測試 Suite
├── web/
│   ├── index.html          ← 全站 4 大分頁 Web 主介面
│   ├── style.css           ← 暗色系毛玻璃與 Design Tokens 樣式
│   └── app.js              ← AppState 單一真理來源 4 視圖連動引擎
├── docs/
│   ├── knowledge-graph.html    ← 100% 資料驅動全景互動式知識圖譜
│   ├── batch-add-automation.md ← 批量加入自動化白皮書
│   └── architecture/           ← 技能路由優化架構白皮書
└── .agents/
    └── AGENTS.md           ← 專案級開發 SOP 與安全防禦規則
```

---

License: MIT
