---
name: tool-enrichment
description: 自動化建構與補齊 AI 工具庫詮釋資料（包含 recommended useCase 推薦場景、negativeConstraints 禁用場景、advantages 優勢與 triggers 觸發詞），並執行品質門禁驗證。當新增工具、升級工具庫或執行 registry 確效時觸發。
---

# Tool Metadata Enrichment & Quality Enforcement SOP

本 Skill 提供標準化的工具詮釋資料（Metadata）補全與確效規範，確保所有入庫工具 100% 具備 **`useCase` (推薦場景)** 與 **`negativeConstraints` (禁用場景)**，防止前端卡片標籤缺失與檢索引擎資訊斷層。

---

## 核心詮釋資料生成規範 (Generation Standards)

當新增工具或補齊既有工具資料時，必須嚴格遵守以下 Prompt 寫作標準：

### 1. `useCase` (推薦場景)
- **定義**：一句話精確描述該工具最具價值、最適合被 AI Agent 或開發者調用的具體應用場景。
- **句型規範**：
  - 中文格式：`適用於 ... 的場景` 或 `當 ... 時使用`
  - 英文格式：`1-sentence concrete scenario where this tool is highly useful.`
  - 範例：`Automating complex multi-step web interactions across multiple accounts simultaneously while evading detection.`

### 2. `negativeConstraints` (禁用場景)
- **定義**：1 至 3 個該工具**不應該被使用**、效益極低或存在安全/技術限制的邊界場景。
- **句型規範**：
  - 中文格式：`不適用於 ...` 或 `避免在 ... 情況下使用`
  - 英文格式：`Array of 1 to 3 scenarios where this tool should NOT be used.`
  - 範例：`["Not suitable for simple, single-page static content scraping", "Avoid for tasks requiring real-time sub-millisecond execution"]`

### 3. `advantages` (技術優勢)
- **定義**：2 至 3 個該工具特有的技術或功能優勢點。
- **範例**：`["Copy-on-write process forking ~5x faster than docker commit", "~95% KV-cache reuse on replay"]`

---

## 執行流程 (Execution Protocol)

1. **掃描缺漏**：
   執行單元確效命令檢查當前狀態：
   ```bash
   node cli.js validate
   ```

2. **自動化補齊腳本**：
   若有工具缺少 `useCase` 或 `negativeConstraints`，執行既有補齊腳本：
   ```bash
   node scripts/enrich-registry.js
   ```
   *註：若缺少 API KEY，Agent 必須根據工具官方 Repository 的 README 與 Description，按照上述生成規範手動補齊 [registry/tools.json](file:///d:/Self-developed_Apps/Tool-Calling/registry/tools.json)*。

3. **確效與門禁檢查**：
   所有新增與修改必須通過下列三項硬性檢驗才能提交 Git：
   - [x] `node cli.js validate` 顯示 `0 個錯誤`。
   - [x] `node scripts/build-web.js` 打包成功。
   - [x] `npm test` 8/8 測試全數 `PASS`。
