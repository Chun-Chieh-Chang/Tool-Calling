# 工具分類系統 (MECE 原則)

## 概述

本系統基於 **MECE 原則**（Mutually Exclusive, Collectively Exhaustive）設計，確保工具分類：
- **相互獨立**：每個工具只屬於一個明確的分類
- **完全窮盡**：所有工具都能被歸類到某個類別

---

## 權威來源（請先讀這裡）

本文件**不重複定義分類規則**，避免與權威文件脫節。各項事實的單一來源如下：

| 想知道什麼 | 去哪裡看 |
|---|---|
| 分類的**判定規則**（某工具該歸哪一類） | `docs/CLASSIFICATION.md` |
| 分類的**慣例與邊界案例**（領域優先、AI 框架 vs 代理） | `docs/category-conventions.md` |
| 分類的**機器可讀定義**（名稱／定義／色碼／關鍵詞） | `registry/categories.json` |
| 工具的**實際資料**（含 category 欄位） | `registry/tools.json` |
| 本文件的**統計表** | 由 `npm run categories:sync` 自動產生（見下節） |

---

## 當前分類架構

<!-- CATEGORIES:INVENTORY:START -->
> 本表由 `registry/tools.json` ＋ `registry/categories.json` 自動產生，**請勿手改**。
> 修改分類請改 `categories.json`，再執行 `npm run categories:sync`。

| 分類 | 數量 | 定義 |
|---|---:|---|
| `AI 代理` | 149 | 成品 Agent 產品、agent harness、通用型 skill・plugin 集合（領域專屬 skill 包歸該領域，見 CLASSIFICATION.md §2-4） |
| `開發工具` | 91 | CLI、IDE、代碼審查、token 壓縮、開發流程 proxy |
| `AI 框架` | 71 | LLM SDK、模型本體、推理／訓練框架、本地模型運行時（不含 skill・plugin 包） |
| `學習資源` | 60 | 教程、課程、書籍、Awesome Lists（以閱讀學習為主要價值） |
| `文件生產力` | 58 | 簡報／PPT、Office、PDF |
| `UI/UX設計` | 54 | 前端框架、設計系統、網頁動畫、原型、圖標庫 |
| `知識管理` | 34 | agent 記憶、RAG、知識圖譜、codebase 索引 |
| `金融與投資` | 25 | 交易、量化、股票分析 |
| `影片` | 24 | 影片編輯、影片串流、影片客戶端 |
| `研究` | 21 | 學術研究、文獻、論文、學術資料集 |
| `多媒體生成` | 18 | AI 圖像／影片生成 |
| `瀏覽器自動化` | 18 | 爬蟲、Scraper、Headless 瀏覽器 |
| `API 整合` | 16 | API 網關、整合工具、可直接調用的 API 端點目錄／聚合器 |
| `安全性` | 14 | 滲透測試、漏洞掃描、資訊安全 |
| `3D工程繪圖` | 11 | CAD、3D 建模、3D 資產／零件庫 |
| `音訊` | 11 | TTS/STT、音訊處理、音樂播放 |
| `數據分析` | 11 | Pandas/Polars、資料框架、產品分析 |
| `測試與自動化` | 10 | 測試框架、CI/CD、自動化腳本 |

**合計**: 696 個工具, 18 個分類, 無「其他」殘留（MECE 強制 100% 覆蓋）。
<!-- CATEGORIES:INVENTORY:END -->

> 本表為**衍生內容**，由 `registry/tools.json` ＋ `registry/categories.json` 自動產生，
> 請勿手改；執行 `npm run categories:sync` 更新，`npm run categories:check` 會檢查是否同步。
>
> **歷史教訓**：此表的數字在本專案至少被人工修正過 5 次
> （483/21 類 → 474/21 類 → 538/21 類 → 585/22 類 → 680/18 類 → 695/19 類），
> 每次都是同一種腐化。改為自動產生後，這類漂移在結構上不可能再發生。

---

## 自動重構機制（2026-08-16 起為建議模式）

> ⚠️ 行為變更：registry 分類已於 2026-08-16 完成人工稽核修正（255 項，見
> `docs/category-audit-2026-08-16.md`）。規則引擎不再自動寫入，僅輸出差異建議。

### 觸發時機

1. **工具新增後**：`node cli.js add <url>` —— 新工具由 `scan-tool.guessCategory()` 給初始分類
2. **建議檢查**：`node scripts/hook-reclassify.js`（dry-run，輸出建議不寫入）
3. **確定採用**：`node scripts/reclassify-tools.js --apply`（寫入前必須人工覆核建議清單）
4. **全庫重掃**：`npm run rescan-classification`（唯讀差異報告，分 Tier 1／2／3）

### 執行流程

```
用戶執行 add/batch-add
        ↓
    新增工具到 registry（guessCategory 給初始分類）
        ↓
    hook-reclassify.js（dry-run）
        ↓
    reclassify-tools.js 規則引擎輸出差異建議
        ↓
    人工覆核 → 確認後 --apply 寫入
        ↓
    記錄執行日誌到 .agnes/hooks/reclassify-log.json
```

---

## 指令說明

### 手動執行分類重構

```bash
# 自動模式（檢查是否需要重分類）
node scripts/hook-reclassify.js

# 強制重分類（忽略快取）
node scripts/hook-reclassify.js force

# 僅檢查（不修改）
node scripts/hook-reclassify.js check

# 全庫重掃（唯讀，產出差異報告）
npm run rescan-classification
```

### 產生／驗證衍生檔

```bash
npm run categories:sync    # 重生 schema enum、CLASSIFICATION.md §2.1、本文件統計表
npm run categories:check   # 檢查是否同步（CI 門禁，不同步則 exit 1）
```

### 查看重構日誌

```bash
cat .agnes/hooks/reclassify-log.json
```

---

## MECE 驗證指標

`node scripts/check-mece.js` 會自動檢查以下指標：

1. **互斥性檢查**
   - 「其他」／「未分類」類別是否為空
   - 是否有過度重疊的類別
   - 分類色碼是否唯一、色距是否足夠、對黑底對比是否足夠

2. **窮盡性檢查**
   - 所有工具是否都已歸類
   - 是否有未被覆蓋的空白類別

3. **平衡性檢查**
   - 小類別警告（≤2 個工具）
   - 大類別警告（≥50 個工具）

4. **來源一致性檢查**（2026-09-12 新增）
   - `registry/categories.json`、schema enum、色表、`CLASSIFICATION.md` 是否一致

---

## 未來擴展

當新工具加入時，分類系統會：

1. **自動檢測**新工具的特徵
2. **套用現有規則**進行分類
3. **提示潛在的新類別**需求
4. **建議類別合併或拆分**方案

---

## 注意事項

- 分類規則會持續優化，每當有新的工具類型出現時
- 手動修改 `registry/tools.json` 中的 `category` 欄位也會生效
- **新增或調整分類**時，請改 `registry/categories.json`（單一來源），再依序執行
  `npm run categories:sync` → `npm run check-mece` → `npm test`；
  分類的**判定規則**變更則編輯 `docs/CLASSIFICATION.md`
