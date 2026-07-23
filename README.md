# Tool-Calling 🔧⚡

> 一個幫你自動找工具、裝工具、用工具的 AI 助手

## 這是什麼？

想像你有一個 **工具箱**，裡面放了 279 個不同的開源工具：

- 📄 做簡報的（AIPPT、NotebookLM2PPT）
- 🧠 管理知識的（Graphify、Ontology）
- 🤖 AI 框架（Langchain、Dify、CrewAI）
- 🧪 測試工具（Playwright、n8n）
- 🎨 圖片影片生成（Stable Diffusion）
- 還有更多……

**這個專案的作用就是：** 當你需要做某件事時，它幫你自動找到最適合的工具，裝好、執行完、再收乾淨。

---

## 用法一：自己搜尋（最直覺）

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

---

## 用法二：讓 AI 自動幫你用（推薦 ⭐）

如果你在用 **Claude Desktop** 或 **Cursor** 這類 AI 軟體，可以把這個工具箱接上去。

接好之後，你只需要對 AI 說：

> 「幫我產生一份簡報」

AI 就會自己：
1. 搜尋工具箱 → 找到適合的工具
2. 安裝工具
3. 執行工具
4. 把結果回傳給你

全程不用你動手。

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

## 用法三：在 Agnes 對話中使用

在 Agnes 聊天中說：

> 「啟動全自動工具調用模式，我想做一份簡報」

Agnes 就會自動幫你搜尋、確認、執行、清理。

---

## 用法四：跟 SkillsBuilder 搭配使用（擴充工具箱）

**SkillsBuilder** 是一個用來「開發和整理技能」的工具，而 **Tool-Calling** 是「搜尋和使用技能」的工具。兩者搭配起來就像：

- **SkillsBuilder** = 工廠（生產技能）
- **Tool-Calling** = 超市（搜尋和購買技能）

### 搭配方式

1. **用 SkillsBuilder 開發新技能** — 寫好技能後，SkillsBuilder 會幫你整理好描述、分類、觸發詞等資訊
2. **把技能匯出到 Tool-Calling** — 技能建好後，把它們加進 Tool-Calling 的工具箱裡
3. **在 Tool-Calling 裡搜尋和使用** — 之後任何時候都能用 `search` 找到你開發的技能

簡單說：SkillsBuilder 負責「造」，Tool-Calling 負責「找」。

---

## 用法五：在新專案中自動觸發（最省事 ⭐⭐）

這是**最重要也最實用**的一節。假設你剛建立了一個新專案（例如一個網站、一個 App），你希望每次打開這個專案時，AI 都能自動幫你用上 Tool-Calling 和 SkillsBuilder 的功能，不用每次都手動設定。

### 第一步：先完成一次性的環境設定

在開始任何新專案之前，先做兩件事（**只做一次**）：

#### A. 安裝 SkillsBuilder 的全域技能

進入 SkillsBuilder 目錄，執行安裝腳本：

```powershell
cd D:\Self-developed_Apps\SkillsBuilder
.\INSTALL.ps1
```

這會把所有開發技能（程式碼審查、測試驅動、知識管理等 57 個技能）安裝到你的系統全域，以後每個新專案都能直接用。

#### B. 讓 AI 知道 Tool-Calling 在哪裡

如果你用 Claude Desktop 或 Cursor，按照「用法二」的步驟，把 Tool-Calling 接上去。這樣 AI 在任何專案中都能自動搜尋工具。

---

### 第二步：在新專案中「一句話啟動」

每次你開啟一個新專案，只要對 AI 說一句話，兩個系統就會自動啟動：

#### 啟動 SkillsBuilder（開發紀律 + 知識庫）

在新專案目錄中對 AI 說：

> **「啟動 SkillsBuilder 開發模式」**

AI 會自動幫你做這些事：
- 建立 `DEV_LOG.md`（開發日誌）和 `wiki/`（知識庫）
- 載入所有開發規範（PDCA 流程、UI 設計標準、程式碼審查規則）
- 啟動圖譜索引（graphify），快速理解專案結構

#### 啟動 Tool-Calling（工具搜尋）

在同一個專案中對 AI 說：

> **「啟動全自動工具調用模式」**

AI 會自動幫你做這些事：
- 解析你的任務需求
- 從 279 個工具中找出最適合的
- 等待你確認後，自動安裝、執行、清理

---

### 完整的日常工作流程

想像你在做一個新專案，完整的流程是這樣：

```
1. 打開新專案資料夾
   ↓
2. 對 AI 說：「啟動 SkillsBuilder 開發模式」
   → AI 自動建立開發架構和知識庫
   ↓
3. 對 AI 說：「啟動全自動工具調用模式」
   → AI 自動準備好工具搜尋功能
   ↓
4. 開始工作，隨時說你需要什麼工具
   → AI 自動搜尋、安裝、執行、清理
   ↓
5. 專案完成
   → SkillsBuilder 自動記錄經驗到 wiki/
   → Tool-Calling 自動更新工具使用頻率統計
```

**重點：** 第 1 步的兩句咒語，每個新專案只需要說一次。之後就交給 AI 自動運作。

---

### 如果沒有用 Agnes，該怎麼辦？

如果你用的是 Claude Desktop、Cursor 或其他 AI 工具，同樣可以達到類似效果：

| AI 工具 | 怎麼做 |
|---------|--------|
| **Claude Desktop** | 接上 Tool-Calling 的 MCP Server（見用法二），然後直接說「幫我搜尋可以做簡報的工具」 |
| **Cursor** | 同樣接上 MCP Server，在編輯器內直接對話使用 |
| **其他工具** | 手動執行 `node cli.js search "..."` 搜尋工具，或使用網頁版 `web/index.html` |

---

## 用法六：從別的資料夾呼叫（不切換目錄）

如果你不想離開目前的專案資料夾，也可以直接指定完整路徑：

```bash
node "D:\Self-developed_Apps\Tool-Calling\cli.js" search "我要做簡報"
```

或者用 PowerShell 的 alias 方式（一勞永逸）：

1. 在 PowerShell 中執行：
```powershell
New-Alias -Name tc -Value "D:\Self-developed_Apps\Tool-Calling\cli.js" -Scope Global
```

2. 之後在任何地方都可以輸入：
```powershell
tc search "我要做簡報"
```

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
