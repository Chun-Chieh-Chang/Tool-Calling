# 分類全庫重掃差異報告

> **產生時間**：2026-09-12T07:12:18.294Z
> **依據**：`docs/CLASSIFICATION.md` v1.1（18 分類 + 決策樹 + §2.1 領域關鍵詞表 + 邊界裁決案例）
> **掃描範圍**：全部 696 個工具
> **方法**：規則違反審計 — 僅在已明文規則**明確適用**且現行分類與其不符時才列出
> **輪次**：第二輪（決策樹修訂後重掃；第一輪見第六節說明）

---

## 一、摘要

| 分層 | 數量 | 說明 |
|---|---|---|
| **Tier 1 — 明確規則違反** | **0** | 決策樹有明文規則適用，現行分類不符 → 建議套用 |
| Tier 2 — 需人工裁決 | 12 | 決策樹與既有慣例衝突，或規則依賴語境、誤判率偏高 → 不自動套用 |
| Tier 3 — 領域關鍵詞啟發 | 17 | 決策樹 §2.1 關鍵詞表在**啟發級**（含 triggers）命中 → 僅供參考，不自動套用 |
| 合規（規則命中且分類正確） | 170 | 已符合決策樹 |
| 無明確規則命中 | 497 | 決策樹未涵蓋，**維持現狀（非違規）** |

**規則命中者合規率**：170 / 199 = 85.4%
**決策樹覆蓋率**：199 / 696 = 28.6%

> ⚠️ 覆蓋率未達 100% 是**預期結果**：決策樹的 7 個步驟為「先命中者勝」的粗篩，
> 且 Tier 1 只採「名稱欄位命中」等**高精度**條件。實測放寬到身分欄位雖可把覆蓋率推高，
> 但偽陽性隨之暴增（見第六節 6.4 的誤判事故），故寧可低覆蓋、零誤判。
> 未命中規則者一律視為「維持現狀」，不臆測變更。

### 變更方向彙總

_無 Tier 1 變更_

### 分類分布：重掃前 vs 套用 Tier 1 後

| 分類 | 現況 | 套用後 | 增減 |
|---|---:|---:|---:|
| AI 代理 | 149 | 149 | — |
| 開發工具 | 91 | 91 | — |
| AI 框架 | 71 | 71 | — |
| 學習資源 | 60 | 60 | — |
| 文件生產力 | 58 | 58 | — |
| UI/UX設計 | 54 | 54 | — |
| 知識管理 | 34 | 34 | — |
| 金融與投資 | 25 | 25 | — |
| 影片 | 24 | 24 | — |
| 研究 | 21 | 21 | — |
| 多媒體生成 | 18 | 18 | — |
| 瀏覽器自動化 | 18 | 18 | — |
| API 整合 | 16 | 16 | — |
| 安全性 | 14 | 14 | — |
| 數據分析 | 11 | 11 | — |
| 音訊 | 11 | 11 | — |
| 3D工程繪圖 | 11 | 11 | — |
| 測試與自動化 | 10 | 10 | — |

---

## 二、Tier 1 — 明確規則違反（0 筆，建議套用）

_無_
---

## 三、Tier 2 — 需人工裁決（12 筆）

這些不是「錯誤」，而是**規則依賴語境、自動判定誤判率偏高**，或**決策樹與既有慣例衝突**。
需人工覆核後再決定，故不列入自動套用。

| 工具 | 現行分類 | 決策樹建議 | 規則 | 說明 |
|---|---|---|---|---|
| `impeccable` | UI/UX設計 | AI 代理 | R6 | 編碼 Agent（會自行讀寫程式碼的成品 agent）→ AI 代理 |
| `designmd` | UI/UX設計 | AI 代理 | R6 | 編碼 Agent（會自行讀寫程式碼的成品 agent）→ AI 代理 |
| `terax-ai` | 開發工具 | AI 代理 | R6 | 編碼 Agent（會自行讀寫程式碼的成品 agent）→ AI 代理 |
| `zarazhangrui-frontend-slides` | 文件生產力 | AI 代理 | R6 | 編碼 Agent（會自行讀寫程式碼的成品 agent）→ AI 代理 |
| `beautiful-html-templates` | 文件生產力 | AI 代理 | R6 | 編碼 Agent（會自行讀寫程式碼的成品 agent）→ AI 代理 |
| `destructivecommandguard` | 開發工具 | AI 代理 | R6 | 編碼 Agent（會自行讀寫程式碼的成品 agent）→ AI 代理 |
| `ai-agent-book` | 學習資源 | AI 代理 | R6 | 編碼 Agent（會自行讀寫程式碼的成品 agent）→ AI 代理 |
| `system-prompts-and-models-of-ai-tools` | 研究 | AI 代理 | R6 | 編碼 Agent（會自行讀寫程式碼的成品 agent）→ AI 代理 |
| `codexbar` | 開發工具 | AI 代理 | R6 | 編碼 Agent（會自行讀寫程式碼的成品 agent）→ AI 代理 |
| `nofx` | 金融與投資 | AI 代理 | R6 | 編碼 Agent（會自行讀寫程式碼的成品 agent）→ AI 代理 |
| `graft` | API 整合 | AI 代理 | R6 | 編碼 Agent（會自行讀寫程式碼的成品 agent）→ AI 代理 |
| `magnitude` | AI 框架 | AI 代理 | R6 | 編碼 Agent（會自行讀寫程式碼的成品 agent）→ AI 代理 |

### 為何 R6（編碼 Agent）不自動套用

「agent」是本語料中最高頻的詞之一，且大量工具的描述屬於「**為** AI coding agent 服務」
（peripheral）而非「**本身是** coding agent」。本掃描已加入語境判別（排除 `for/using/with ... agents`
與 `... coding model`），但仍會誤判 model、book、menu-bar app 等，故僅列待覆核。

人工覆核時請自問：**這個工具自己會不會讀寫程式碼？** 會 → AI 代理；只是輔助別的 agent → 維持原分類。

---

## 四、Tier 3 — 領域關鍵詞啟發（17 筆，僅供參考）

決策樹 §2 步驟 7 只寫「依領域關鍵詞落入其餘分類」，**未定義具體關鍵詞**。
本節為本輪掃描所草擬的關鍵詞規則命中結果，用途是**檢驗既有分類是否自洽**，
而非斷言正確答案 —— 關鍵詞可能同時命中多個領域，也可能只是工具描述中的附帶提及。

> 這些關鍵詞已於 2026-09-12 正式寫入 `docs/CLASSIFICATION.md` **§2.1 領域關鍵詞表**，
> 並以兩級方式套用：名稱欄位命中（`D*-T1`）為 Tier 1，身分欄位命中（`D*-T3`）為 Tier 3。
> 下表即 `D*-T3`（啟發級）的命中結果 —— 因為 Tier 1 的命中者已被自動套用，不再列於此。

| 規則 | 建議分類 | 筆數 | 工具 |
|---|---|---:|---|
| D1-T3 | UI/UX設計 | 1 | `figma-code-connect` |
| D11-T3 | 影片 | 1 | `oil-motion` |
| D2-T3 | 知識管理 | 10 | `markitdown`, `langflow`, `dify`, `langchain`, `hello-agents`, `llama-index`, `reader3`, `warp` …+2 |
| D3-T3 | 學習資源 | 1 | `heilcheng-awesome-agent-skills` |
| D8-T3 | 瀏覽器自動化 | 2 | `browser-use`, `playwright` |
| D9-T3 | 數據分析 | 2 | `duckdb`, `yfinance` |

---

## 五、套用方式

```bash
# 1. 檢視機器可讀差異
cat registry/classification-rescan.json

# 2. 確認後套用 Tier 1 變更
node scripts/rescan-classification.js --apply

# 3. 重新驗證
node scripts/check-mece.js && node cli.js validate
```

> ⚠️ `--apply` 只套用 **Tier 1**。Tier 2 需人工裁決後另行處理。

---

## 六、第二輪（同日）— 決策樹修訂後的重掃

第一輪報告出爐後，決策樹完成三項修訂，本節記錄修訂內容與其效果。

### 6.1 三項決策樹修訂

| 缺口 | 修訂 |
|---|---|
| §2 步驟 7 未定義關鍵詞 | 新增 **§2.1 領域關鍵詞表**（13 個領域），並成為程式 `DOMAIN_RULES` 的單一來源 |
| §2-2 領域主題清單政策未定 | 裁決 **A**：清單一律 → `學習資源`，主題不改變清單性質 |
| §2-4 skill 包缺「通用型」限定 | 修訂為 **領域專屬 → 該領域；通用型 → `AI 代理`** |

### 6.2 領域關鍵詞的兩級套用

同一組關鍵詞在不同欄位出現，證據力差異極大：

| 級別 | 命中欄位 | 規則 ID | 層級 | 結果 |
|---|---|---|---|---|
| 精確 | `id` / `name` | `D*-T1` | Tier 1 | 可自動套用 |
| 啟發 | `id` / `name` / `triggers` | `D*-T3` | Tier 3 | 僅供人工覆核 |

**為何要分級**：實測單用精確級，覆蓋率僅 11.9%；單用啟發級，偽陽性爆炸。
分級後 Tier 1 保持零偽陽性，同時把覆蓋率拉回約 28%。

### 6.3 已套用的 Tier 1 變更（10 筆）

| 工具 | 原分類 | 新分類 | 規則 | 依據 |
|---|---|---|---|---|
| `vercel-ai-skills` | AI 框架 | AI 代理 | R10b | skill 包不可能是框架（排除法） |
| `addyosmani-agent-skills` | AI 框架 | AI 代理 | R10b | 同上 |
| `knowledge-work-plugins` | AI 框架 | AI 代理 | R10b | 同上 |
| `skill` | AI 框架 | AI 代理 | R10b | 同上 |
| `taste-skill` | AI 框架 | AI 代理 | R10b | 同上 |
| `compound-engineering-plugin` | AI 框架 | AI 代理 | R10b | 同上 |
| `playwright-skill` | AI 框架 | 測試與自動化 | R10 | 名稱含 `playwright` |
| `github-copilot-playwright-test-skill` | AI 代理 | 測試與自動化 | R10 | 名稱含 `playwright` `test` |
| `browserbase-web-automation-skills` | AI 代理 | 瀏覽器自動化 | R10 | 名稱含 `browser` `automation` |
| `minimax-ppt-skills` | AI 代理 | 文件生產力 | R10 | 名稱含 `ppt` |

### 6.4 已否決的做法（誤判事故記錄）

第二輪初版把 §2-4 實作成「名稱自稱 skill/plugin 且**不含**領域詞 ⇒ 通用型 ⇒ AI 代理」。
結果 37 筆 Tier 1 中約 27 筆錯誤，包括：

| 誤判 | 根因 |
|---|---|
| `ui-skills`、`trailofbits-skills`、`gsap-skills`、`mengto-skills` 被判為「通用型」 | 領域詞表不可能窮盡，**「名稱沒有領域詞」不等於通用型** |
| `notebooklm-skill-*`、`claude-world-notebooklm` 被判為 `學習資源` | `book` 未加詞邊界，誤中 `note**book**lm` |
| `figma-plugin-samples` 被判為 `UI/UX設計` | 未排除 `samples` 這類學習產物 |

**修正**：R10 只保留**正向**判定（名稱明確指向領域才算領域專屬）；
通用型的推論收窄為 R10b，且**必須以「現行分類為 AI 框架」為前提**（排除法），
而非單純因為「找不到領域詞」。修正後 Tier 1 由 37 筆降至 10 筆，全數可辯護。
