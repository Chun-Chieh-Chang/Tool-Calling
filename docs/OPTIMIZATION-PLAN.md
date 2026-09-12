# OPTIMIZATION-PLAN.md — 分類系統優化方案

> **日期**：2026-09-12
> **依據**：決策樹全庫重掃（第二輪）後的跨檔全域診斷
> **狀態**：**提案，尚未執行任何變更**

---

## 摘要

本次審計修好了「當下的分類錯誤」，但**沒有修好「會持續產生分類錯誤的機制」**。

一天之內就抓到 **4 次文件／程式脫節**，每次成因都相同：**18 個分類沒有單一機器可讀來源**。

因此本方案的核心不是「再修幾筆分類」，而是 **B 批：把 18 個分類收斂成一個 `registry/categories.json`**。

---

## 一、診斷

### 1.1 已驗證的缺陷（P0）

| # | 缺陷 | 證據 | 影響 |
|---|---|---|---|
| **D1** | 知識圖譜色表**缺 `金融與投資`** | `dist/knowledge-graph.html` 中該分類渲染為 `hsl(240, 65%, 48%)`，而非設計色 | 25 筆金融工具與 `研究`(#7e22ce)、`3D工程繪圖`(#4f46e5) 視覺混淆 |
| **D2** | 色表有 **4 個幽靈 key** | `資料庫`、`基礎設施`、`行銷`、`圖標與視覺資源`（後者已改名為 `UI/UX設計`） | 色表與實際分類不一致，新分類容易被漏加 |
| **D3** | **`AI 框架` 與 `知識管理` 共用同一色** `#0284c7` | `generate-knowledge-graph.js:10` 與 `:20` | **105 筆工具（15%）在圖上無法區分** |
| **D4** | `core/classifier.js` 的 LLM prompt **停在舊版決策樹** | `classifier.js:41-73` 只有 6 步；無 §2.1 領域關鍵詞、無 §2-4 skill 包規則、無 §2-2 清單裁決；且描述文字為**簡體** | LLM 分類結果與 `CLASSIFICATION.md` v1.1 不一致 |
| **D5** | 分類失敗時**靜默預設 `開發工具`** | `classifier.js:169`：`return bestMatch.weight > 0 ? bestMatch.cat : '開發工具'` | 與 MECE「不得有殘留分類」衝突 —— 只是把「其他」**改名**為「開發工具」（現 91 筆，13%） |

### 1.2 制度性缺口（P1）— D1～D5 的共同根因

**18 個分類目前散落在 5 個以上位置，彼此靠人工同步：**

| 位置 | 內容 | 本次是否已修正 |
|---|---|---|
| `docs/CLASSIFICATION.md` | 權威定義 + §2.1 詞表 | ✅ |
| `registry/schemas/tool.schema.json` | `category` enum | ✅（9 → 18） |
| `core/classifier.js` | `VALID_CATEGORIES` + LLM prompt | ⚠️ 常數已修，**prompt 未修**（D4） |
| `scripts/generate-knowledge-graph.js` | 色表 | ❌ **未修**（D1/D2/D3） |
| `scripts/rescan-classification.js` | `DOMAIN_RULES` | ✅ 但與 §2.1 是**兩份拷貝**（本次新增的技術債） |

**一天內 4 次脫節**：簡繁不符（`VALID_CATEGORIES`）→ schema enum 過期 → 色表缺漏/重複 → prompt 過期。

### 1.3 CI 防護網未生效（P1）

`.github/workflows/deploy-pages.yml` 只執行 `npm run validate` + `npm test`：

| 檢查 | 是否在 CI |
|---|---|
| `cli.js validate` | ✅ |
| `npm test` | ✅ |
| `scripts/check-mece.js`（MECE + enum 守衛） | ❌ **不在** |
| `rescan-classification`（分類漂移偵測） | ❌ **不在** |

> **已實測**：`check-mece.js` 的 enum 守衛有效 —— 注入 `category=其他`、`category=資料庫`、`language=Python`、`install.method=pip3` 四種違規，**全部攔下並回傳非零退出碼**，訊息精確（例：`✗ language 有 1 筆不符合 schema enum：{"Python":1}`）。
> 但因為不在 CI，這個守衛目前只能靠人工記得跑。

### 1.4 方法論邊界（P2）— 需誠實面對

**覆蓋率 28.2% 已接近規則法的上限，繼續加關鍵詞的投報率很低。**

證據：未命中率與**分類性質**高度相關 ——

| 分類類型 | 代表分類（未命中率） | 判定 |
|---|---|---|
| **領域型**（有專屬詞彙） | 音訊 9%、瀏覽器自動化 28%、測試與自動化 30%、3D工程繪圖 36%、金融與投資 40% | 低 ✅ |
| **判斷型**（靠語意，非詞彙） | AI 代理 90%、開發工具 87%、AI 框架 85%、知識管理 79%、UI/UX設計 74% | 高 ❌ |

未命中者包含 `react`、`vue`、`tensorflow`、`python`、`linux`、`n8n`、`awesome-selfhosted` ——
**它們的分類都是正確的**，只是「這是成品 agent 還是框架？」本質上是**語意判斷，不是關鍵詞特徵**。

→ 想再提高覆蓋率，**只能改用 LLM 輔助，不能靠繼續擴充詞表**。

---

## 二、優化方案

### B 批（根因治理）★ 建議優先

**B1. 建立 `registry/categories.json` 作為 18 分類的唯一來源**

```json
{
  "version": 1,
  "categories": [
    {
      "name": "金融與投資",
      "definition": "交易、量化、股票分析",
      "color": "#ca8a04",
      "examples": ["financial-services"],
      "keywords": ["trading", "quant(itative)? (trading|finance|strategy)", "backtest", "..."]
    }
  ]
}
```

**B2. 讓所有衍生處從 B1 產生**（或至少加一致性檢查）

| 衍生目標 | 目前狀態 |
|---|---|
| `tool.schema.json` → `category.enum` | 手寫 → 產生 |
| `core/classifier.js` → `VALID_CATEGORIES` **與 LLM prompt** | 手寫 → 產生（同時解 D4） |
| `generate-knowledge-graph.js` → 色表 | 手寫 → 讀取（同時解 D1/D2/D3） |
| `rescan-classification.js` → `DOMAIN_RULES` | 拷貝 → 讀取（消掉本次新增的技術債） |
| `CLASSIFICATION.md` §2.1 表格 | 手寫 → 產生 |

**B3. 把防護網接上 CI**

```yaml
- run: node scripts/check-mece.js
- run: node scripts/rescan-classification.js   # 唯讀；確認 Tier 1 = 0
```

> ⚠️ `.github/workflows/*.yml` 屬 `AGENTS.md` 定義的**受保護路徑**，需你明確同意後才能修改。

### A 批（立即修復，低風險）

| # | 動作 | 對應缺陷 |
|---|---|---|
| **A1** | 補齊 `金融與投資` 設計色、移除 4 個幽靈 key、拆開 `AI 框架`／`知識管理` 的重複色，並加「每個分類都必須有唯一設計色」守衛 | D1, D2, D3 |
| **A2** | 更新 `classifier.js` LLM prompt：改為繁體、補上 §2.1 七步決策樹與 §2-4 skill 包規則 | D4 |
| **A3** | `classifier.js:169` 的靜默預設改為**顯式回報**（回傳 `null` 或標記 `status: 'needs-review'`），讓分類失敗可見 | D5 |

### C 批（品質提升，工作量較大）

| # | 動作 | 說明 |
|---|---|---|
| **C1** | 用 LLM 對 500 筆未命中產出 **Tier 4（LLM 建議）** 報告 | **僅供人工覆核，不自動套用**。這是唯一能真正提高覆蓋率的路徑 |
| **C2** | 把 Tier 2 的 12 筆做成互動式覆核清單 | R6/R9 本質無法自動化 |
| **C3** | 審計 `開發工具` 的 91 筆 | 確認它不是新的「其他」（對應 D5） |

---

## 三、建議執行順序

```
B1 → A1 → B2 → A2 / A3 → B3 → C1
```

**理由**：

1. **B1 先做** —— 它是根因。做完之後 A1/A2/A3 都變成「從單一來源衍生」，不必手改 5 個地方。
2. **A1 次之** —— 最便宜的可見缺陷修復；知識圖譜**現在就在用錯色**（105 筆同色、25 筆任意色）。
3. **B2 接著** —— 把衍生鏈接上；此後改分類只需改一個檔。
4. **A2 / A3** —— 依賴 B1（prompt 可由 `categories.json` 自動產生，不必手寫 18 行）。
5. **B3** —— 讓防護網生效，防止未來再脫節。**需你確認**（受保護路徑）。
6. **C1** —— 成本最高且需人工覆核，放最後。

**若只想做一件事**：做 **B1**。其餘問題多半是它的症狀。

---

## 四、明確不做

| 不做 | 理由 |
|---|---|
| 用關鍵詞繼續衝高覆蓋率 | 已證實判斷型分類無詞彙特徵（§1.4） |
| 自動套用 LLM 分類結果 | 本次已因自動化誤判吃過 **27 筆錯誤**；LLM 建議一律只列 Tier 4 供覆核 |
| 強行自動化 Tier 2 / Tier 3 | R6 的 "agent" 語境依賴、Tier 3 本質為啟發 |
| 新增或刪除分類 | 18 分類剛通過 MECE 驗證，**無證據**需要變動 |

---

*本方案為提案。執行前請確認 B3 的受保護路徑變更。*
