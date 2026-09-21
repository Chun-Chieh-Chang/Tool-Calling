# docs/ 文件索引

> 本目錄即本專案的「wiki」。根目錄的 `README.md`／`HANDOFF.md`／`DEV_LOG.md`
> 是對外入口，這裡放的是各主題的深入文件。
>
> **單一真理來源（SSOT）提醒**：文件只是「說明」，真正的資料在 `registry/`。
> 若文件與 registry 衝突，**以 registry 為準**（然後修文件）：
>
> | 資料 | 檔案 |
> |---|---|
> | 工具庫（722 筆）| `registry/tools.json` |
> | 分類定義與色碼 | `registry/categories.json` |
> | 評測集（v1.3.0，267 題）| `registry/eval-queries.json` |
> | 知識編譯詞條 | `registry/compiled-entries.json` |
>
> ⚠️ `CATEGORY-SYSTEM.md`、`CLASSIFICATION.md`、`AGENTS.md` 是**衍生檔**
> （由 `npm run categories:sync` / `agents:init` 產生），**不可手改**。

---

## 1. 核心機制（現行，優先讀這區）

| 文件 | 內容 |
|---|---|
| [WIKI-COMPILER.md](./WIKI-COMPILER.md) | ⭐ 知識編譯器：新的解析邏輯 + 配對邏輯。含完整實測數據與參數消融 |
| [LLM-WIKI-BLUEPRINT.md](./LLM-WIKI-BLUEPRINT.md) | ⭐ 外部藍圖（PDF，OCR 取得）15 頁全文對照，逐頁標註「已實作／實測無效／不適用」 |
| [agent-retrieval-design.md](./agent-retrieval-design.md) | 四維（V1–V4）檢索引擎的設計與決策邏輯 |

## 2. 分類與約定

| 文件 | 內容 |
|---|---|
| [CATEGORY-SYSTEM.md](./CATEGORY-SYSTEM.md) | 18 分類體系（**衍生檔**，勿手改） |
| [CLASSIFICATION.md](./CLASSIFICATION.md) | 分類規則與統計（**衍生檔**，勿手改） |
| [MECE-RULES.md](./MECE-RULES.md) | MECE 原則在本專案的具體化 |
| [category-conventions.md](./category-conventions.md) | 分類命名與歸類慣例 |
| [project-constraints.md](./project-constraints.md) | 專案層級的限制與規範 |

## 3. 使用與整合

| 文件 | 內容 |
|---|---|
| [USAGE-GUIDE.md](./USAGE-GUIDE.md) | 三端（CLI／MCP／Web）使用說明 |
| [AGENTS-Integration-Guide.md](./AGENTS-Integration-Guide.md) | 如何把本專案 `AGENTS.md` 與 IDE 全域規則整合 |
| [batch-add-automation.md](./batch-add-automation.md) | 「批次加入工具庫」的自動化流程（解析 → 分類 → 寫入） |

## 4. 資產（prompt 範本與診斷工具）

| 檔案 | 用途 |
|---|---|
| [prompt-knowledge-graph.md](./prompt-knowledge-graph.md) | 生成互動式知識圖譜的 prompt 範本 |
| [prompt-pipeline-workflow.md](./prompt-pipeline-workflow.md) | 生成全鏈路流程圖的 prompt 範本 |
| [edge-diagnostic.cjs](./edge-diagnostic.cjs) | 流程圖邊線診斷（gap / penetration 檢查），`node docs/edge-diagnostic.cjs` |
| [knowledge-graph.html](./knowledge-graph.html) | 產出的知識圖譜（單檔 HTML；**已 gitignore**——由 `saveRegistry()` 自動產生，本機才有） |
| [pipeline-workflow.html](./pipeline-workflow.html) | 產出的全鏈路流程圖 |
| [relationship-diagram.html](./relationship-diagram.html) | 關聯圖 |

## 5. 研究、分析與提案（非現行規範，供背景理解）

| 文件 | 內容 |
|---|---|
| [search-engine-optimization.md](./search-engine-optimization.md) | 檢索引擎優化：提案 → 執行結果（2026-08-10）。原為「提案」與「報告 v1.1」兩份，2026-09-21 合併，含「建議 vs 實際」對照；開頭有現況註記（其後主路徑已改為融合引擎） |
| [OPTIMIZATION-PLAN.md](./OPTIMIZATION-PLAN.md) | 優化計畫 |
| [triz-dynamic-classification-analysis.md](./triz-dynamic-classification-analysis.md) | 以 TRIZ 分析動態分類 |
| [agnes-vs-antigravity-comparison.md](./agnes-vs-antigravity-comparison.md) | 兩個 AI IDE 的比較 |
| [SKILLS-SH-vs-TOOL-CALLING.md](./SKILLS-SH-vs-TOOL-CALLING.md) | skills.sh 生態與本專案的定位比較 |
| [architecture/](./architecture/) | 技能路由的架構白皮書與標準化建議（早期研究） |

## 6. 歷史記錄（**不可修改**——改了就是偽造歷史）

這些是過往時點的紀錄，數字反映當時狀態，**不要為了「同步」去改它們**。
引用時請註明日期。

| 文件 | 時點 |
|---|---|
| [2026-09-08盤點摘要.md](./2026-09-08盤點摘要.md) | 2026-09-08 五項盤點 |
| [category-audit-2026-08-16.md](./category-audit-2026-08-16.md) | 2026-08-16 分類審計 |
| [classification-rescan-2026-09-12.md](./classification-rescan-2026-09-12.md) | 2026-09-12 分類重掃 |
| [dev-tools-audit-2026-09-12.md](./dev-tools-audit-2026-09-12.md) | 2026-09-12 開發工具審計 |
| [dynamic-k-2026-09-12.md](./dynamic-k-2026-09-12.md) | 2026-09-12 dynamic-k 分析 |
| [structural-review-2026-09-12.md](./structural-review-2026-09-12.md) | 2026-09-12 結構審查 |
| [reports/batch-add-report-20260810.md](./reports/batch-add-report-20260810.md) | 2026-08-10 批次加入報告 |
| [RCA-TOOL-VISIBILITY-ISSUE.md](./RCA-TOOL-VISIBILITY-ISSUE.md) | 工具可見性問題的根因分析 |
| [SELF-EVOLUTION-REPORT.md](./SELF-EVOLUTION-REPORT.md) | 自我演進報告 |
| [EVOLUTION_LOG.md](./EVOLUTION_LOG.md) | 演進日誌 |

---

## 維護原則

1. **新增文件必須加進本索引**，否則會淪為「看起來像死碼」的孤兒檔
   （2026-09-21 盤點時發現 5 個這樣的文件，其實都還有價值）。
2. **歷史文件不動**，只在新文件裡補充「後續發展」。
3. **衍生檔標記清楚**（`CATEGORY-SYSTEM.md` / `CLASSIFICATION.md`），避免有人手改後被覆蓋。
4. 根目錄的 `DEV_LOG.md` 是**依時間排序**的開發日誌；本索引是**依主題分類**的。
   兩者用途不同，不用互相複製。
