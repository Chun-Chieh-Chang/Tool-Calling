# Batch 2：結構化禁用約束（negativeFacets）試點計畫

> 承接 `docs/superpowers/plans/2026-10-02-retrieval-calibration-and-governance.md` 附錄 Batch 2 第 2 項。
> 目標：一天內可證偽——結構化約束是否讓排序比散文版更準（特別是 c61 型極性誤懲）。

## Schema 定案

新 optional 欄位 `negativeFacets: string[]`，每筆 `[-+]<facet>:<value>`：

- `-platform:web` = **排除**（查詢命中 value → 扣分）；`+ecosystem:microsoft` = **要求**（命中不扣分）
- 極性是本批的核心：c61 誤懲的根源是散文的雙重否定（「不適合**非** Microsoft 生態」），
  bag-of-words 看不見否定詞；`+/-` 讓符號在**資料層**就無歧義
- facet 白名單（封閉集）：`platform, language, license, pricing, deployment, ecosystem, format, scale, interface, integration`
- value：1-3 個 token、小寫 `[a-z0-9 .+-]`、整筆 ≤ 40 字元；每工具 ≤ 6 筆、不得重複
- **散文 `negativeConstraints` 保留作顯示用**；引擎端：工具一旦有 `negativeFacets`（含純 `+`），
  negativePenalty 一律走結構化路徑、忽略散文（否定盲點從此對該工具免疫）

## 引擎規則（negativePenalty v2）

1. 有 `negativeFacets` → 只看 `-` 極性條目：value 與查詢的 IDF 加權相似度 > 0.30 才起罰，
   罰幅 `min(0.15, (sim - 0.30) * 0.5)`（與散文版同蓋帽，門檻略高因 value 短而銳）
2. 無 `negativeFacets` → 走既有散文邏輯（含其否定盲點註記）——零回歸設計：
   沒有結構資料的工具行為完全不變

## 驗證與門禁

- `registry-contract.js`：negativeFacets 存在時驗格式（白名 facet、極性、長度、重複），
  違反計 **error**（不是 warning）——資料完整性問題不得靜默
- 萃取腳本 `scripts/infer-facets.js`：LLM 從**既有散文**萃取（有依據的轉換，非「猜用途」），
  預設 dry-run、`--apply` 經 `saveRegistry()` 寫入、跳過已有 negativeFacets 的工具、
  產出先過與 contract 相同的格式門
- 母體：top-100 by stars（94 支帶散文）
- **可證偽判定**：套用後重跑 267 題 benchmark——
  gate A：agent / fusion Hit@1 降幅 ≤ 3pp、空集誠實率 10/10（不做就滾回）
  gate B（假說檢驗）：constrained 組 Hit@1 > 61.5%（現值）且 c61 不再誤懲
  兩 gate 都不過 → 保留引擎碼但清空資料（negativeFacets 撤離），結論記 DEV_LOG

## 任務序列

1. contract 驗證 + 單元測試（紅→綠）
2. negativePenalty v2 + 測試（含 c61 型合成反例：極性救命 vs 散文誤懲）
3. infer-facets.js（dry-run 預設）
4. top-100 萃取 → 抽檢 10 支人工核對 → apply
5. benchmark 判定 → DEV_LOG → commit → push
