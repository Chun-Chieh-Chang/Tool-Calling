# LLM Wiki 建構藍圖 — 全文重點與本專案對照

> 來源：`The_LLM_Wiki_Blueprint.pdf`（15 頁，**純圖片無文字層**，22MB）
> ⚠️ 本文件內容由 **OCR 擷取**（rapidocr-onnxruntime）後人工整理，
>    圖表內的細字可能有辨識誤差，已標示 `[?]` 處請以原圖為準。
> 整理日期：2026-09-20。附「對本專案的可行動結論」。

## 0. 這份藍圖給了我們什麼（先看結論）

| 項 | 對本專案的價值 |
|---|---|
| 三層框架（Capture／Composition／Retrieval）| 分類視角，作為擴展座標 |
| **PPR 圖譜擴散演算法（第 7 頁）** | ⭐ **直接可實作**——我們的一階共現擴散只貢獻 0.7pp，PPR 是它的完整版 |
| Epistemic Markers `[V]/[S]/[?]`（第 10 頁）| 可對應到我們既有的 `decision`，並可用於標記編譯詞條的可信度 |
| 模型路由（第 9 頁）| 批次作業（compile-wiki）可改用便宜模型 |
| 其餘（平台選擇、漂移管理、5 步工作流）| 與本專案定位無關，不採用 |

---

## 1. 封面：管線全貌（第 1 頁）

標題：**LLM Wiki 建構藍圖 — 2026 個人知識库的典範轉移：「手動整理」到「AI 自動編譯」**
標籤：`#Obsidian` `#PKM` `#AndrejKarpathy` `#AI-Agent`

管線（上層語意／下層資料兩條）：

```
SOURCE MATERIAL → DATA INGESTION → SEMANTIC LAYER → ENTITY EXTRACTION
  → RELATIONSHIP MAPPING → LLM PROCESSING CORE → KNOWLEDGE SYNTHESIS
  → USER INTERFACE → AI-AGENT DEPLOYMENT
```

## 2. 典範轉移（第 2 頁）

- 過去＝**對話與搜尋**：缺乏積累，對話視窗關閉即消失
- 2026＝**AI 知識編譯**：人類提供素材，AI 負責歸檔、交叉引用與維護
- 核心洞察：**不要把「理解」外包，而是把「知識後勤」外包**

## 3. 三個維度（第 3 頁）— 含黃字盲點警告

| 層 | 角色 | 工具 |
|---|---|---|
| 擷取層 Capture | 讓資訊無縫流入（會議、語音、網頁）| Shadow、MinerU、Web Clipper |
| 創作層 Composition | 筆記內輔助寫作、自動寫與模板化 | Smart Composer、Text Generator |
| 檢索層 Retrieval | 語意搜尋與全域問答 | Copilot、Smart Connections、BMO |

🔴 **盲點提示（原文）**：絕大多數人只專注在創作與檢索，**卻忽略了最底層的「輸入瓶頸」**。

## 4. Layer 1 擷取層（第 4 頁）

- **Shadow**（Mac Native）：語音與會議，背景執行、本地轉錄
- **MinerU**：文獻與圖表，解析複雜排版、保留數學公式，統一輸出 **Markdown + YAML**
- **Web Clipper**：網頁碎片，結合 AI 擷取乾淨內文
- 核心洞察：**你的知識庫上限，取決於高品質資料流入的速度**

## 5. Layer 2 創作層（第 5 頁）

- **Smart Composer**：高亮文本 → AI 提議修改 → 「一鍵套用（Diff Apply）」
  適用：把 Obsidian 當主要寫作工作台的創作者
- **Text Generator**：由 Frontmatter 驅動，一鍵將「會議逐字稿」轉行動清單、
  或將「讀書筆記」轉為閃卡。適用：擁有固定工作流的 Power Users

## 6. Layer 3 檢索層定位圖譜（第 6 頁）

兩個軸：單篇筆記（Single Note）↔ 全域金庫（Full Vault）；
發現者（Finder）↔ 對話者（Conversationalist）

- **Smart Connections**：本地 Embedding，無感提示相關筆記，不打斷心流（被動發現）
- **Copilot for Obsidian**：支援拖拽筆記作為 Context，強大的 Vault QA 全域問答（主動提問）
- **BMO / LocalGPT**：輕量純本地、隱私優先的單篇筆記對話
- 最佳實踐：**組合使用**——Smart Connections 用於「被動發現」，Copilot 用於「主動提問」

## 7. ⭐ 深度解析：零向量檢索演算法（第 7 頁）— 對我們最重要的一頁

Karpathy 的 LLM Wiki 如何運作？

- **拋棄傳統 RAG：不切碎文本（No Chunking）**，保留 LLM 的全局推理能力
- 利用人類建立的**雙向連結**，進行**蒙地卡羅隨機漫步**，找出語意關聯
- **PPR 演算法（Personalized PageRank）**

三步驟：
1. **詞彙速查**（Step 1）
2. **LLM 關鍵字掃描**（Step 2）
3. **PPR 圖譜擴展**（Step 3）

特性：**速度極快、純本地運作，計算成本完全獨立於筆記總量**。

### → 對本專案的可行動結論

我們 `core/wiki-matcher.js` 做的是「詞—詞共現圖 + **一階**鄰居擴散」，
實測只貢獻 **+0.7pp**（Tier 1 詞檔、w=0.20）。原因很可能就是**只走一階**：
共現邊太稀疏（355 節點／264 邊），一階擴散幾乎擴不出去。

PPR（隨機漫步 + 重啟）相當於**多階、加權、帶衰減**的擴散，
正好補上這個弱點，且**純本地、不需 API、成本與詞彙量無關**——
可用 `npm run ablate:v5`（確定性）立即驗證。

## 8. 知識架構的演進與擴展邊界（第 8 頁）

階梯（由小到大）：

| 階段 | 規模 | 做法／限制 |
|---|---|---|
| 單一檔案 Single-File | < 50k tokens | 適合特定領域參考 |
| 多檔案金庫 Multi-File Vault | < 40 萬字 | 利用 Index 檔路由，高度依賴雙向連結 —— **Karpathy 實測的最佳甜蜜點** |
| 程式碼管線 Code-Based Pipeline | 中大型專案 | 需客製化預處理（Python/CLI），維護成本大幅增加 |
| 檢索增強 RAG-Augmented | 數百萬 tokens | Embedding、切塊（Chunking）與重排（Reranking）；企業級，超出極限 AI 會「遺忘」 |

## 9. 模型路由策略（第 9 頁）

不要用同一個模型做所有事：

| 任務 | 建議模型 | 理由 |
|---|---|---|
| 海量長文檔攝取 Ingestion | Gemini 1.5 Pro (2M) / Claude 3.5 Sonnet (200K) | 需要極大上下文視窗處理完整文獻 |
| 複雜跨文件合成 Synthesis | GPT-4o / Claude 3.5 Sonnet | 頂級指令遵循能力與低幻覺率 |
| 日常索引與標籤維護 Maintenance | DeepSeek V3 / GPT-4o-mini / LLaMA 3 (Local) | 跑批次 Lint 與關聯性檢查，追求極低成本 |

→ 對我們：`scripts/compile-wiki.js` 是批次維護型任務，可考慮改用便宜模型。

## 10. 建立信任層：解決幻覺（第 10 頁）

AI 在 Wiki 裡會產生「幽靈連結」。解法：**強制 AI 進行認識論標記（Epistemic Markers）**，
寫入 YAML Frontmatter：

| 標記 | 意義 |
|---|---|
| `[V] Verified`（已證實）| 直接引用原始來源，附精確連結 |
| `[S] Synthesized`（綜合）| AI 結合多個來源生成，節點可追溯，但連結由 AI 建立 |
| `[?] Speculative`（推測）| 超出給定上下文，由 AI 基於預訓練權重推測，**需人類覆核** |

→ 對我們：與既有的 `decision`（adopt／adopt-with-warning／no-match）概念同源。
可考慮為**編譯詞條**加上 `[V]/[S]` 標記——直接從 metadata 推得者標 `[V]`，
由 LLM 推論補充者標 `[S]`，讓下游知道哪些詞條可信度高。

## 11. 寫給知識庫的 Prompt 工程（第 11 頁）

1. **Context 優先**：將檢索到的筆記放在 Prompt **最上方**，最大化注意力機制
2. **基礎限制（Grounding Constraint）**：「僅基於提供的筆記回答，不可使用訓練資料」
3. **思維鏈驗證（Chain-of-thought）**：列出相關筆記 → 擷取關鍵段落 → 識別盲點 → 給出最終答案
4. **矛盾偵測（Contradiction Detection）**：「特別指出新舊筆記中互相衝突的點」

⚠️ 注意第 3 點與本專案實測**衝突**：我們在 rerank 允許推理（CoT），
實測 semantic 類型完全沒動、且整體略降，故維持禁止解釋。
差異可能是任務性質不同（它們是問答、我們是挑選）。

## 12. 對抗「知識漂移」：生命週期管理（第 12 頁）

**知識漂移（Knowledge Drift）**：過去正確的筆記，在數月後成為錯誤的預設前提。

- Daily（日）：丟入 Inbox，不需任何整理與排版
- Weekly（週）：將碎片轉化為概念草稿，並打上 `compiled_at` 時間戳記
- Monthly（月）：清理死連結（Dead links）、孤兒筆記，運行 Lint 掃描

## 13. 平台決策（第 13 頁）

| | Obsidian | Logseq | AFFiNE | Notion |
|---|---|---|---|---|
| 核心優勢 | 極客首選，純本地 Markdown | 大綱愛好者，適合節點式思考 | 視覺學習者，內建 AI 與無限白板 | 團隊協作，開箱即用 |
| 資料主權 | 極高（本地） | 極高（本地） | 高（開源可自管） | 低（雲端鎖定） |
| AI 整合 | 原生內建 | 需組裝社群外掛 | 需組裝社群外掛 | 原生（需額外付費） |

## 14. 5 步起手工作流（第 14 頁）

1. **Capture**：丟入 3 份原始來源到 Inbox（不要排版）
2. **Summarize**：AI 讀取來源，生成概念頁面草稿（Tier 2）
3. **Verify**：人工閱讀，加入洞察，降級或升級信任標記
4. **Link**：在畫布或圖譜中建立視覺連結
5. **Consolidate**：將碎片概念合併為完整的「參考文章」

## 15. 結語（第 15 頁）

> **工具負責編譯，人類負責思考**
> Shadow captures. Obsidian stores. AI compiles. You think.

Next Action：今天就建立你的 Inbox，投入頭三份文件，讓知識開始自動復利。

---

## 附：與本專案管線的對照

```
藍圖：  Source → Ingestion → Semantic → Entity → Relationship → LLM Core → Synthesis → UI → Agent
本專案：tools.json → compile-wiki.js → compiled-entries.json → wiki-matcher(圖譜)
        → agent-retrieval 五維融合 → llm-rerank 挑選 → CLI/MCP/Web 三端
```

→ 我們的「知識編譯器 V5」本質上就是這份藍圖的具體實作。
本專案涵蓋的是**檢索層**；擷取／創作兩層不在範圍內（本專案做的是「工具選用」，
不是「幫使用者建知識庫」）。
