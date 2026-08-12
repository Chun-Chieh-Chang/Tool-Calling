# 工具分類系統 (MECE 原則)

## 概述

本系統基於 **MECE 原則**（Mutually Exclusive, Collectively Exhaustive）設計，確保工具分類：
- **相互獨立**：每個工具只屬於一個明確的分類
- **完全窮盡**：所有工具都能被歸類到某個類別

---

## 當前分類架構

> 統計時間：2026-08-11（`node cli.js validate` + `npm run check-mece` 確認）

| 分類 | 數量 | 說明 |
|------|------|------|
| AI 框架 | 151 | LLM/Transformer/Generative AI 框架與 SDK |
| AI 代理 | 101 | Agent/Assistant/Copilot 系統 |
| 開發工具 | 72 | CLI、IDE、編程語言相關工具 |
| 學習資源 | 33 | 教程、課程、Roadmap、Awesome Lists |
| UI/UX設計 | 29 | 前端框架、設計系統、Figma 插件 |
| 文件生產力 | 25 | PPT、PDF、Markdown、Office 工具 |
| 影片 | 16 | 視頻編輯、動畫、直播工具 |
| API 整合 | 12 | REST/GraphQL SDK、集成工具 |
| 研究 | 10 | 學術論文、研究文獻 |
| 音訊 | 9 | TTS/STT、音頻處理工具 |
| 圖標與視覺資源 | 9 | 圖標庫、SVG、矢量圖形資源 |
| 安全性 | 7 | 滲透測試、漏洞掃描 |
| 知識管理 | 7 | RAG、Embedding、知識圖譜 |
| 測試與自動化 | 6 | Test Runner、E2E 測試框架 |
| 資料庫 | 5 | SQL/NoSQL 數據庫工具 |
| 多媒體生成 | 5 | AI 圖像/視頻生成工具 |
| 基礎設施 | 5 | Docker/K8s/Terraform 等 |
| 3D工程繪圖 | 4 | CAD/3D建模工具 |
| 瀏覽器自動化 | 3 | Crawl/Scrape/Headless 工具 |
| 數據分析 | 3 | Pandas/Polars/DuckDB 等 |
| 行銷 | 1 | SEO/Analytics 工具 |

**合計**：538 個工具，21 個分類，無「其他」殘留（MECE 強制）。

---

## 分類規則優先級

當一個工具可能屬於多個類別時，按以下優先順序決定：

1. **高優先級（100）**：明確匹配的關鍵字
   - `llm`, `gpt`, `claude` → AI 框架
   - `playwright`, `cypress` → 測試與自動化
   - `lucide`, `heroicons` → 圖標與視覺資源

2. **中優先級（90）**：主要功能匹配
   - `agent`, `assistant` → AI 代理
   - `ui`, `ux`, `design-system` → UI/UX設計

3. **低優先級（80）**：次要特徵匹配
   - `api`, `sdk` → API 整合
   - `learn`, `tutorial` → 學習資源

4. **預設（0）**：無法匹配時使用預設分類
   - 包含 `skill` → AI 代理
   - 包含 `awesome` → 學習資源
   - 其他 → 開發工具

---

## 自動重構機制

### Hook 觸發時機

1. **工具新增後**：執行 `node cli.js add <url>` 後
2. **批量新增後**：執行 `node cli.js batch-add <file>` 後
3. **手動觸發**：執行 `node scripts/hook-reclassify.js`

### 執行流程

```
用戶執行 add/batch-add
        ↓
    新增工具到 registry
        ↓
    調用 hook-reclassify.js
        ↓
    載入 reclassify-tools.js
        ↓
    掃描所有工具的元數據
        ↓
    應用分類規則
        ↓
    輸出變更報告
        ↓
    更新 registry/tools.json
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
