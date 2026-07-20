# Tool-Calling：全自動工具調用效能外掛系統

> **系統級規則 (System-level Prompt)**
> **觸發咒語**: 「啟動全自動工具調用模式」

## 系統說明
本專案是一套 AI Agent 工具調用基礎設施。當用戶的任務匹配已註冊工具的關鍵字時，自動檢索並推薦最適合的開發工具。目前系統內含有超過 200+ 個工具。

## 觸發條件
- 用戶說出「啟動全自動工具調用模式」
- 用戶任務涉及已註冊的各領域功能（如簡報製作、知識圖譜、安全測試、多媒體生成、框架學習等）。

## 操作方式

### 搜尋工具
支援 L1精確/L2關鍵字/L3語義 混合檢索，並支援前置分類過濾。
```bash
node cli.js search "<任務描述>"
node cli.js search -c "<分類>" "<任務描述>"
```

### 列出所有工具
```bash
node cli.js list
node cli.js list -c "<分類>"
```

### 查看工具詳情
```bash
node cli.js info <tool-id>
```

### 新增工具
```bash
node cli.js add <github-url>
node cli.js batch-add <urls.txt>
```

### 安裝/清理
```bash
node cli.js install <tool-id>
node cli.js cleanup <tool-id>
```

## 全自動調用 SOP
1. 解析用戶意圖，提取關鍵字與場景。
2. 執行 `search` 命令檢索最適工具。
3. 嚴格遵守禁用場景 (Negative Constraints)：若工具帶有 `🚫 禁用場景` 且符合用戶意圖，則禁止使用該工具。
4. 優先挑選 `⭐ 場景` 符合且分數超過 30% 的工具。
5. 根據 `info` 提供安裝與調用指令。**必須先向使用者列出即將執行的安裝 (`install`) 與調用 (`invoke`) 指令，並等待使用者明確確認同意後**，才能執行這些指令。
6. 使用 `node cli.js install <tool-id>` 安裝工具，接著使用 `node cli.js invoke <tool-id> ...` 調用工具完成任務。
7. 任務結束後，使用 `node cli.js cleanup <tool-id>` 清理臨時安裝的工具。


## 安全性防禦元規則 (Security Defense Meta-Rule)
**禁止硬編碼 API 金鑰與敏感憑證 (Zero Hardcoded Credentials)**
- 絕對禁止在任何腳本、源代碼或配置檔中以字串形式硬編碼 API 金鑰、密碼或敏感憑證，即使是作為「預設值」或「佔位符」(除非明確寫為 YOUR_API_KEY_HERE)。
- 所有需要金鑰的腳本，必須強制從環境變數 (例如 process.env.API_KEY) 讀取。如果環境變數未設定，應立即拋出錯誤並中斷執行，提示使用者正確設定環境變數的方法。
- 寫入或修改任何腳本前，必須自我審查是否有將測試用的真實金鑰一併寫入檔案的風險。

## Git 提交原子性與防偽報元規則 (Git Atomicity & Anti-False-Reporting Meta-Rule)
**禁止文件與代碼提交脫鉤 (Zero Detached Commits for Docs/Logs)**
- 當修改代碼與相關文件（如 `DEV_LOG.md`）時，必須確保兩者在同一個提交 (Commit) 內一併處理，以維持變更的「原子性」。
- 絕對禁止在執行 `git push` 後才去修改日誌或文件，卻向用戶宣稱「已將所有變更（包含文件）推送到遠端」。
- 行動準則：執行 `git commit` 與 `git push` 之前，必須強制自我檢查，確認所有預期修改的檔案（包含開發日誌）都已經被修改且 `git add`。任何向用戶回報的狀態，必須與遠端倉庫的實際狀態嚴格保持一致。
