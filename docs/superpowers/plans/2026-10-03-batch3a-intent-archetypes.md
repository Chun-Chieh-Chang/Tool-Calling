# Batch 3a：意圖原型層（intent archetypes）計畫

> 承接 2026-10-02 計畫附錄 Batch 3 第 1 項。專家藍圖中「專家的檔案櫃」。
> 教訓先行：Batch 2 證明彌散軟訊號在現行評測量不出增益——本批的機制必須更銳：
> **原型是高精準的同分群裁決者**，不是第二個模糊加分項。

## 設計

**資料資產** `registry/intent-archetypes.json`：

```json
[{ "id": "transcribe", "name": "語音/影片轉逐字稿",
   "patterns": ["逐字稿", "transcript", "speech to text"],
   "tools": ["youtube-skills", "whisper"], "source": "tool-metadata-derived" }]
```

- 25-40 個原型，涵蓋任務家族（轉逐字稿、做簡報、爬網頁、e2e 測試、生圖、RAG…）
- **衍生源頭 = 工具側元資料**（trigger/useCase/description 的任務詞彙聚類），不從評測題反推
  ——避免「自出題自批改」的循環論證；評測集對本層而言是**乾淨的考卷**
- patterns 手工策展（中英並列）；tools 由腳本從 registry 依 metadata 匹配 + stars 排序
  產生候選，人工核對後定稿，每原型 ≤5 支

**引擎** `core/archetype.js` + `core/agent-retrieval.js`：

- `loadArchetypes()`（mtime 快取；檔案不存在或格式壞 → 停用，零回歸）
- `matchArchetypes(query, archetypes)`：pattern 子串匹配（正規化後），回傳命中原型集
- `agentRetrieve`：每次查詢匹配一次，命中原型的 tools 集合在 `fuse()` 內對
  `weighted + ARCHETYPE_BOOST (0.03)`——只影響已在候選中的工具的**排序**，
  不擴召回、不加候選（零垃圾風險）；量級刻意小於任何維度分數差距下限的
  顯著部分，只裁決「本來就並列」的同分群

## 可證偽判定

- gate A：agent / fusion Hit@1 降幅 ≤ 3pp、空集誠實率 10/10
- gate B：semantic 組（129 題，現 49.6%）或整體 Hit@1 出現 > 噪音地板（3pp）的改善
  ——若不動，誠實記錄 null result（Batch 2 已示範這種紀律），機制保留與否依
  「零回歸 + 顯示價值」判準

## 任務序列

1. 原型表衍生腳本（patterns 手寫 → registry 匹配 → 候選表）+ 人工核對定稿
2. `core/archetype.js` + fuse 整合 + 測試（合成註冊表：原型命中把正解從同分群拉出）
3. benchmark 判定 → DEV_LOG → commit → push
