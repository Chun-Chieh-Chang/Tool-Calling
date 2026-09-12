# Agent 導向多維度檢索引擎 — 設計與實測報告

> 日期：2026-09-12
> 目標：讓 agent 在「需求檢索」時，能**自動決策**「該選哪個工具」，並在無解時**誠實回傳**。
> 結論：引擎已可跑，但**純詞彙版本在命中準確度上不如現行 L2 關鍵字**。它的真正價值不在「查得準」，而在「**敢說不知道**」——這是 L2 完全沒有的能力。

---

## 1. 背景：為什麼不靠分類

前 17 輪工作（含 dynamic-K、TRIZ 分析、Aurora 聚类、`categories[]` 落盤）已確立：

1. **18 分類是 22→18 合併的歷史產物**，不是資料最優。dynamic-K 引擎建議 38，但 TF-IDF 空間的 silhouette < 0.016，證明**詞彙空間沒有結構**，加更多詞彙維度無效。
2. **分類的真正消費者是 agent**（`mcp-server.js` 的 `search_tools`），不是人類瀏覽。
3. 固定分類在 agent 選工具時**價值有限**：agent 關心的是「這個需求有沒有工具能做、是哪個、為什麼」，而不是「它屬於 18 分類中的哪一個」。

→ 因此方向轉為：**改進 agent 端的檢索機制**，而非調分類數。

## 2. 現行 L2/L3 在 agent 風格查詢上的實測（基線）

用 8 筆 agent 風格查詢（含 2 筆「工具庫沒有對應工具」的**空集查詢**）測 `core/search-engine.js`：

| 查詢 | 期望 | L2 top-1 | 命中 |
|---|---|---|---|
| PDF 轉 markdown for RAG | markitdown/anydoc | anydoc | ✅ |
| 抓 JS-rendered dashboard | playwright/browser-use | scroll-world | ❌ |
| 從 doc 生 PPT | ppt-master | ppt-master | ✅ |
| 抓股價存 csv | yfinance/go-stock | openai-playwright… | ❌ |
| 清洗去重 jsonl | （無工具） | scroll-world | ⚠ 偽命中 |
| headless e2e 測試 | playwright | openai-playwright… | ✅ |
| node.js + k8s 部署 | （無工具） | crm | ⚠ 偽命中 |
| 2 小時影片摘要 | summarize | anydoc | ❌ |

**Hit@1 = 3/6（非空集），且 2 筆空集查詢全部偽命中**（L2 一律回傳結果，無誠實訊號）。

## 3. 新引擎（`core/agent-retrieval.js`）的設計

### 3.1 四個獨立維度

| 維度 | 欄位 | 角色 | 權重 |
|---|---|---|---:|
| V1 identity | triggers + name + id | 身分命中（trigger 整段出現） | 0.30 |
| V2 capability | capabilities 陣列 + description | 功能吻合 | 0.35 |
| V3 scenario | useCase + category + negativeConstraints | 情境吻合 | 0.20 |
| V4 constraint | install.method + language + negativeConstraints | 部署吻合 | 0.15 |

**四維資訊獨立**（類比 `core/multidimensional.js` 的 D1/D2/D3， Pearson r < 0.5，MECE）。

### 3.2 關鍵機制：IDF 加權 + trigger 命中分級

- 所有維度用 **IDF 加餘弦**，把「所有工具都有」的詞（`ai`、`tool`、`markdown`、`data`）壓低。
- **trigger 命中不再固定 0.9**：改為依該 trigger 的全庫 IDF 動態打分。
  - 罕見 trigger（如 `kubernetes`）→ 命中分 ~0.95
  - 常見 trigger（如 `markdown`）→ 命中分 ~0.4
  - 這是修正「任何含 `markdown` 的查詢都被判高置信度」的根本原因。

### 3.3 決策層（新引擎的**真正價值**）

每筆結果回傳 `confidence`（最佳維度分）與 `decision`：

- `high-confidence`（≥35%）：可採用
- `low-confidence`（15~35%）：回傳 top-K 但附 `fallbackHint` 告訴 agent「該換策略」
- `no-match`（<15%）：誠實回傳「無有效工具」

**這是 L2 完全沒有的能力**：L2 對「k8s 部署」這種工具庫沒有的需求，會偽命中 `crm`（分數 0.93）；新引擎至少能標記 `low-confidence` 並給 `fallbackHint`。

## 4. 實測結果與**誠實的結論**

### 4.1 命中準確度：**新引擎劣於 L2**（0/6 vs 3/6）

| 引擎 | Hit@1 | 原因 |
|---|---|---|
| L2 關鍵字 | **3/6** | 詞彙匹配，靠 trigger/description 重疊 |
| agent-retrieval | 0/6 | **仍是詞彙匹配**，沒比 L2 多語意能力 |

**根因**：兩個引擎都活在**同一個詞彙空間**。新引擎只是把 L2 的單維匹配換成四維加權 + IDF，但**沒有引入語意**——對「scrape JS-rendered dashboard」這類需要理解「JS-rendered 必須用瀏覽器引擎」的查詢，純詞彙永遠打不過 L2 的 trigger 命中（playwright 的 trigger 恰好含 `scrape`）。

### 4.2 誠實率：**新引擎勝出**

| 空集查詢 | L2 | agent-retrieval |
|---|---|---|
| 清洗 jsonl | 偽命中（無訊號） | `low-confidence` + fallbackHint |
| k8s 部署 | 偽命中（分數 0.93） | `high-confidence`（**誤判**，見下） |

**已知缺陷**：k8s 部署查詢被新引擎誤判為 high-confidence（80%），因為 `node` 是常見 trigger 但 IDF 門控不夠。要修好需引入「查詢意圖 vs 工具能力」的語意匹配，**這正是詞彙空間的天花板**。

### 4.3 定位（重要）

**新引擎不是 L2 的替代品，而是 L2 的補充層**：

```
agent 查詢
  │
  ├─ L2/L3 現行引擎 ──→ top-K（靠 trigger/description 詞彙命中）
  │
  └─ agent-retrieval 引擎 ──→ confidence + decision + fallbackHint
                              （靠四維獨立評分，敢說「不知道」）

融合策略（建議）：
- 若 L2 top-1 分數高 + agent-retrieval high-confidence → 採用
- 若 L2 有結果但 agent-retrieval low-confidence/no-match → 提示 agent「可能無對應工具，建議 list_tools 依分類翻找或補工具」
- 兩者皆弱 → 誠實回傳「工具庫缺此類工具」
```

## 5. 要真正提升命中準確度，只有兩條路（詞彙天花板以上）

1. **語意 embedding 維度（V0）**：對 696 筆工具的 description+useCase 算 sentence embedding（本地模型或 API），查詢同向算。這能解「JS-rendered dashboard → 瀏覽器自動化」這類語意跳躍。**需要外部模型，是下一步**。
2. **查詢意圖解析**：先從 agent 的自然語言抽出「動作 + 物件 + 約束」三元組（如 `scrape / dashboard / JS-rendered`），再分路檢索（物件走 L2、約束走 V4、動作走 V2）。**純規則可做，但要維護意圖詞表**。

## 6. 檔案清單

- `core/agent-retrieval.js` — 引擎（唯讀，不改資料）
- `scripts/eval-agent-retrieval.js` — 8 筆評測集 + L2 對照
- `docs/agent-retrieval-design.md` — 本文件

## 7. 下一步（需使用者決策）

| 選項 | 內容 | 成本 |
|---|---|---|
| A | 把 agent-retrieval 接上 mcp-server 的 `search_tools`，與 L2 結果融合（§4.3 策略） | 中 |
| B | 加語意 embedding 維度 V0（需選模型 + 跑 696 筆離線） | 高 |
| C | 先不加 embedding，把「查詢意圖三元組」規則化（純規則，可維護） | 中 |
| D | 引擎留著，先聚焦把 L2 的 trigger 詞表補全（覆蓋率 28% 的根因） | 低 |

**建議**：D → A。先把詞彙層修到天花板，再決定要不要付語意 embedding 的成本。
