# LLM Wiki 建構藍圖 — 與本專案的對照

> 來源：使用者提供的 `The_LLM_Wiki_Blueprint.pdf`（15 頁，圖片型簡報，無文字層）。
> 整理日期：2026-09-20。目的：記錄這份藍圖給了我們什麼、以及本專案目前涵蓋到哪裡。

## 1. 一句話主張

> **「工具負責編譯，人類負責思考」**
> Shadow captures. Obsidian stores. AI compiles. You think.

配套的觀念（頁 2）：過去是「對話與搜尋」（上下文視窗一關就消失），
2026 起是「AI 知識編譯」——**LLM 是編譯器，不是檢索器**。

另一句值得記的：**不要把「理解」外包，要把「知識後勤」外包。**

## 2. 三層架構（本份藍圖最實用的部分）

| 層 | 角色 | 藍圖舉的工具 | 本專案現況 |
|---|---|---|---|
| **擷取層 Capture** | 自動把素材收進來（會議、語音、網頁、PDF）| Shadow、MinerU、Web Clipper | ⚠️ 有工具、但**沒有管線概念** |
| **創作層 Composition** | 筆記內輔助寫作、自動擴寫、模板化 | Smart Composer、Text Generator | ❌ 幾乎沒有（registry 多為離線 LLM 工具）|
| **檢索層 Retrieval** | 語意搜尋、全局問答 | Smart Connections、Copilot、BMO | ✅ **本專案的核心**，且有知識編譯器 V5 |

🔴 **藍圖自己用黃底警告標出的盲點**：
「絕大多數人只專注在創作與檢索，卻忽略了最底層的**輸入瓶頸**（擷取層）。」

## 3. 藍圖的管線 vs 我們的實作

藍圖（頁 1）：

```
Source Material → Data Ingestion → Semantic Mapping → Entity Extraction
  → Relationship Mapping → LLM Processing Core → Knowledge Synthesis
  → Knowledge Interface → User Interface → AI-Agent Deployment
```

本專案對應（已實作）：

```
registry/tools.json（原始素材）
  → scripts/compile-wiki.js  【離線編譯器／擷取＋語意化】
  → registry/compiled-entries.json（編譯詞條）
  → core/wiki-matcher.js  【知識圖譜一階擴散】
  → core/agent-retrieval.js 五維融合  【LLM Processing Core】
  → core/llm-rerank.js  【挑選／最佳化】
  → CLI / MCP / Web 三端  【AI-Agent Deployment】
```

→ **我們其實已經把這條管線走完了一遍**，只是用詞不同：
藍圖的「Knowledge Compilation」就是本專案的「知識編譯器 V5」。

## 4. 這份藍圖有沒有引導出新工作？

**老實說：沒有。**

- 核心觀念（編譯器 vs 檢索器）正是本次開發的主軸，方向被**驗證**而非被改變。
- 三層框架是有用的**分類視角**，適合當作日後擴展的參考座標。
- 擷取／創作兩層不在本專案範圍內（本專案做的是「工具選用」，
  不是「幫使用者建知識庫」），硬做會失焦。

因此這份藍圖的處理方式是**消化進文件**，不另開工。

## 5. 若日後要補，優先順序

1. **擷取層管線化**（呼應藍圖的警告）：把 registry 裡既有的 10 支擷取工具
   （firecrawl、pdf-inspector、mineru2ppt…）串成一條「素材 → 筆記」的建議路徑，
   並讓 `plan_tool_chain` 能規劃出來。成本低，且補的正是藍圖說的瓶頸。
2. **知識管理分類強化**：registry 已有「知識管理」分類，
   但與「文件生產力」、「研究」邊界模糊，可做一次 MECE 盤點。
3. 創作層：暫不建議（與本專案定位差距最大）。
