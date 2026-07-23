# Tool-Calling 🔧⚡

> 一個幫你自動找工具、裝工具、用工具的 AI 助手

## 什麼這是什麼？

想像你有一個 **工具箱**，裡面放了 279 個不同的開源工具：

- 📄 做簡報的（AIPPT、NotebookLM2PPT）
- 🧠 管理知識的（Graphify、Ontology）
- 🤖 AI 框架（Langchain、Dify、CrewAI）
- 🧪 測試工具（Playwright、n8n）
- 🎨 圖片影片生成（Stable Diffusion）
- 還有更多……

**這個專案的作用就是：** 當你需要做某件事時，它幫你自動找到最適合的工具，裝好、執行完、再收乾淨。

---

## 三種用法（從簡單到進階）

### 用法一：自己搜尋（最直覺）

打開終端機（命令提示字元），輸入：

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
| 移除一個工具 | `node cli.js remove 工具ID` |

### 用法二：讓 AI 自動幫你用（推薦 ⭐）

如果你在用 **Claude Desktop** 或 **Cursor** 這類 AI 軟體，可以把這個工具箱接上去。

接好之後，你只需要對 AI 說：

> 「幫我產生一份簡報」

AI 就會自己：
1. 搜尋工具箱 → 找到適合的工具
2. 安裝工具
3. 執行工具
4. 把結果回傳給你

全程不用你動手。

#### 怎麼接？

**Claude Desktop：**
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

**Cursor：**
1. 打開 Settings → Features → MCP
2. 點擊 Add New MCP Server
3. Name 填 `tool-calling`
4. Type 選 `Command`
5. Command 填 `node D:\你的路徑\Tool-Calling\mcp-server.js`
6. 存檔，重啟 Cursor

### 用法三：在 Agnes 對話中使用

在 Agnes 聊天中說：

> 「啟動全自動工具調用模式，我想做一份簡報」

Agnes 就會自動幫你搜尋、確認、執行、清理。

---

## 安全嗎？

**安全。** 所有工具都在隔離的容器（Docker）裡執行，不會影響你的電腦。

具體來說：
- 工具只能在容器內跑，不能存取你的網路
- 容器是唯讀的，不能改你的檔案
- 只允許從 GitHub 下載工具，不允許其他來源

---

## 常見問題

**Q：我需要裝什麼才能用？**
A：需要安裝 [Node.js](https://nodejs.org/)（版本 18 以上）。裝好後就能用指令列模式了。如果要讓 AI 自動執行工具，還需要安裝 Docker。

**Q：裡面有多少工具？**
A：目前超過 279 個，涵蓋 20 多個分類。

**Q：我可以自己加工具嗎？**
A：可以！只要提供 GitHub 倉庫網址就行：
```bash
node cli.js add https://github.com/使用者/倉庫名稱
```

**Q：這些工具免費嗎？**
A：專案本身是 MIT 授權（免費）。裡面的每個工具各有自己的授權，使用前請確認。

---

## 檔案說明

```
Tool-Calling/
├── cli.js              ← 命令列入口，用來搜尋和管理工具
├── mcp-server.js       ← 讓 Claude / Cursor 等 AI 軟體能使用這個工具箱
├── registry/
│   └── tools.json      ← 工具清單（目前 279 個）
├── core/
│   ├── search-engine.js  ← 搜尋引擎
│   ├── installer.js      ← 安裝工具
│   ├── sandbox.js        ← Docker 沙盒隔離
│   └── cleanup.js        ← 清理工具
└── web/
    └── index.html        ← 網頁版介面（雙擊就能開）
```

---

License: MIT
