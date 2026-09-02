# 工具分類系統 (MECE 原則)

## 概述

本系統基於 **MECE 原則**（Mutually Exclusive, Collectively Exhaustive）設計，確保工具分類：
- **相互獨立**：每個工具只屬於一個明確的分類
- **完全窮盡**：所有工具都能被歸類到某個類別

---

## 當前分類架構

> 統計時間: 2026-09-02 (`node cli.js validate` + `node scripts/check-mece.js` 確認)
> 分類慣例與兩大判定原則詳見 `docs/category-conventions.md` (領域優先 + AI 框架/代理邊界)

| 分類 | 數量 | 說明 |
|------|------|------|
| AI 代理 | 141 | 成品 agent、agent harness、skill/plugin 集合、agent 平台 |
| 開發工具 | 83 | CLI、IDE、代碼審查、token 壓縮等泛用工具 |
| AI 框架 | 78 | LLM SDK、模型本體、推論/訓練框架、agent 建構庫 |
| 文件生產力 | 58 | 簡報/PPT、Office、PDF、文件轉換、寫作輔助 |
| 學習資源 | 54 | 教程、課程、書籍、Awesome Lists |
| UI/UX設計 | 53 | 前端框架、設計系統、網頁動畫、原型、圖標庫 |
| 知識管理 | 32 | agent 記憶、RAG、知識圖譜、codebase 索引 |
| 金融與投資 | 25 | 交易、量化、股票分析、投資研究 |
| 影片 | 23 | 視頻編輯、視頻生成、串流 |
| 研究 | 23 | 學術研究、文獻、洩漏提示詞研究 |
| 多媒體生成 | 18 | AI 圖像/視頻生成 |
| 瀏覽器自動化 | 16 | 爬蟲、Scraper、Headless、agent 瀏覽器 |
| 安全性 | 15 | 滲透測試、漏洞掃描、資安技能 |
| 數據分析 | 10 | Pandas/Polars、產品分析 |
| 音訊 | 10 | TTS/STT、音頻處理 |
| 3D工程繪圖 | 10 | CAD、3D 建模、3D 資產生成 |
| API 整合 | 9 | API 閘道、整合工具 |
| 測試與自動化 | 8 | Test Runner、E2E 測試框架 |

**合計**: 666 個工具, 18 個分類, 無「其他」殘留 (MECE 強制 100% 覆蓋)。

---

## 分類判定原則(2026-08-16 稽核後確立)

1. **領域優先**:屬於特定領域(金融/行銷/3D/研究)的工具,先歸領域分類,再考慮功能
2. **AI 框架 vs AI 代理**:框架=建構積木(SDK/模型/推論引擎);代理=可直接使用的成品(agent 本體/skill 集合/平台)
3. **規則引擎優先級**:明確名稱匹配(100)→ 語義短語(90-95)→ 功能特徵(80-85),並遵守排除條件
4. **嚴禁關鍵字**(歷史教訓,详见 `category-conventions.md`):`agents`(UI/UX 誤判)、`/\b3d\b/`(3D 誤判)、語言名稱(學習資源誤判)、`analytics`(行銷誤判)

---

## 自動重構機制(2026-08-16 起為建議模式)

> ⚠️ 行為變更:registry 分類已於 2026-08-16 完成人工稽核修正(255 項,見
> `docs/category-audit-2026-08-16.md`)。規則引擎不再自動寫入,僅輸出差異建議。

### 觸發時機

1. **工具新增後**:`node cli.js add <url>` —— 新工具由 `scan-tool.guessCategory()` 給初始分類
2. **建議檢查**:`node scripts/hook-reclassify.js`(dry-run,輸出建議不寫入)
3. **確定採用**:`node scripts/reclassify-tools.js --apply`(寫入前必須人工覆核建議清單)

### 執行流程

```
用戶執行 add/batch-add
        ↓
    新增工具到 registry(guessCategory 給初始分類)
        ↓
    hook-reclassify.js(dry-run)
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
```

### 查看重構日誌

```bash
cat .agnes/hooks/reclassify-log.json
```

---

## MECE 驗證指標

系統會自動檢查以下指標：

1. **互斥性檢查**
   - 「其他」類別是否為空
   - 是否有過度重疊的類別

2. **窮盡性檢查**
   - 所有工具是否都已歸類
   - 是否有未被覆蓋的空白類別

3. **平衡性檢查**
   - 小類別警告（≤2 個工具）
   - 大類別警告（≥50 個工具）

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
- 如需調整分類規則，請編輯 `scripts/reclassify-tools.js`
