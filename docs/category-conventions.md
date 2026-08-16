# 工具庫分類慣例 (Category Conventions)

> **版本**:2026-08-16 v1.0
> **背景**:2026-08-16 全面稽核發現 35% 工具誤置(詳見 `category-audit-2026-08-16.md`),經用戶確認後確立本慣例。
> **地位**:所有人工/AI 分類決策與 `scripts/reclassify-tools.js` 規則維護時,必須遵循本文件。

---

## 慣例一:領域優先 (Domain-First)

分類體系同時存在「領域軸」與「功能軸」。判定順序:

1. **先判領域**:工具的主要用途屬於特定領域 → 歸領域分類
   - 金融與投資:交易、量化、股票分析、投資研究(即使底層是 LLM agent,如 `tradingagents`)
   - 行銷:SEO、社群媒體自動化、CRM、文案行銷
   - 3D工程繪圖:CAD、3D 建模、3D 資產生成、網格/幾何(`blender`、`text-to-cad`、`trellis2`)
   - 研究:學術研究、文獻、洩漏提示詞研究(`cl4r1t4s` 系列)
2. **再判功能**:無明確領域 → 依功能歸類(AI 框架/AI 代理/開發工具/…)

**反例警示**:「用 LLM 做的股票交易系統」→ 金融與投資(不是 AI 框架);「3D 落地頁產生器」→ UI/UX設計(不是 3D工程繪圖,因用途為網頁視覺)。

## 慣例二:AI 框架 vs AI 代理 邊界

| 分類 | 定義 | 判準 | 範例 |
|---|---|---|---|
| **AI 框架** | 建構用的「積木」 | 別人用它來「做」AI 應用 | langchain、llamafactory、sglang、smolagents、tensorflow、opencv、LLM 模型本體(glm-5、kimi-k3)、推論引擎(airllm、h3-c) |
| **AI 代理** | 可直接使用的「成品」 | 它本身就是 agent,或 agent 生態的配套 | codex、openhands、autogpt(成品 agent);claude-skills、agent-skills-manager(skill/plugin 集合);dify、agent 平台 |

**速記**:框架回答「如何建」;代理回答「拿來用」。

## 各分類收錄基準(快速索引)

| 分類 | 收錄 | 不收錄(改歸) |
|---|---|---|
| AI 框架 | LLM SDK、模型、推論/訓練框架、CV/ML 庫、agent 建構庫 | 成品 agent(→AI 代理)、領域工具(→領域) |
| AI 代理 | 成品 agent、agent harness、skill/plugin/subagent 集合、agent 平台、桌面 client | 建構庫(→AI 框架) |
| 知識管理 | agent 記憶、RAG、知識圖譜、codebase 索引、NotebookLM 整合、筆記 | 一般文件轉換(→文件生產力) |
| 文件生產力 | 簡報/PPT、Office、PDF、文件轉換、寫作輔助(含去 AI 味) | 知識檢索(→知識管理) |
| 瀏覽器自動化 | 爬蟲、scraper、headless 瀏覽器、agent 瀏覽器 | E2E 測試框架(→測試與自動化) |
| UI/UX設計 | 前端框架(react/next/tailwind)、設計系統、網頁動畫、原型、圖標的「設計」用法 | 圖標庫本體(→圖標與視覺資源) |
| 圖標與視覺資源 | 圖標庫本體(lucide、tabler…) | 設計系統(→UI/UX設計) |
| 開發工具 | 泛用開發工具、CLI、IDE、代碼審查、token 壓縮 | 不得作為 fallback 垃圾桶 |
| 學習資源 | 課程、教學、書籍、awesome 清單、面試指南 | 提及語言名稱≠學習資源 |

## 規則引擎使用規範

`scripts/reclassify-tools.js` 為 **建議引擎**,預設 dry-run:

```bash
node scripts/reclassify-tools.js            # dry-run,僅輸出建議
node scripts/reclassify-tools.js --apply    # 寫入(使用前必須人工覆核建議清單)
```

- regex 粒度有限,**--apply 前必須逐項覆核**
- 嚴禁加入的關鍵字(歷史教訓):
  - UI/UX 規則含 `agents` → 15 個工具誤入
  - `/\b3d\b/` → scroll-world 誤入 3D工程繪圖
  - 語言名稱(python/js/…) → 學習資源 → scrapy 誤入
  - `analytics` → 行銷 → Apache OSSIE 誤入

## 未決事項(T3,2026-08-16 稽核保留原分類)

`ruview`、`worldmonitor`、`crm`、`gnome-orca`、`dbskill`、`reader3`、`ai-job-search`、`knowledge-work-plugins`、`gpt-5-6-instruct`、`conversation-steganography`、`996-icu`、`linux`、`exercises-dataset`、`heilcheng-awesome-agent-skills` — 共 14 項語義模糊或無理想歸屬,維持現狀待後續裁決。
