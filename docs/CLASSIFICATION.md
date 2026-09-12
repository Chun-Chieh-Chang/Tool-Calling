# CLASSIFICATION.md — 工具分類決策樹（單一真理來源）

> **版本**：v1.1（2026-09-12 制定，同日下午修訂）
> **適用範圍**：`registry/tools.json` 所有工具的分類判定
> **強制性**：所有新增／重新分類工具 MUST 依本文件決策樹歸類

---

## 為什麼需要這份文件

2026-09-12 的全庫審計發現，分類系統存在三類系統性問題：

| 問題 | 證據 | 後果 |
|---|---|---|
| **分類定義無明文** | Awesome List 散落於 `學習資源`(5)、`AI 框架`(3)、`研究`(2) 三個分類 | 同類工具無法聚類，檢索精度下降 |
| **程式碼與資料脫節** | `core/classifier.js` 的 `VALID_CATEGORIES` 為簡體中文（`开发工具`），與 registry 的繁體（`開發工具`）不符 | LLM 分類結果被驗證拒絕 → 靜默退回規則引擎 |
| **Schema 未同步** | `tool.schema.json` 只列 9 個分類（含違反 MECE 的「其他」），語言只列 8 種、安裝方式只列 7 種 | 實際資料有 18 分類 / 23 語言 / 17 安裝方式，形同無約束 |

本文件即為修正後的權威定義。

---

## 一、18 個正規分類（MECE）

所有分類必須**相互獨立**且**完全窮盡**，且**不得存在「其他」「未分類」殘留**。

| # | 分類 | 定義範圍 | 典型例子 |
|---|---|---|---|
| 1 | `AI 代理` | 成品 Agent 產品、agent harness、**通用型** skill・plugin 集合（領域專屬 skill 包歸該領域，見 §2-4） | freebuff, awesome-llm-apps, youtube-automation-agent, openai-codex-skills |
| 2 | `AI 框架` | LLM SDK、模型本體、推理／訓練框架、本地模型運行時（**不含** skill・plugin 包） | web-llm, freetoken, airllm |
| 3 | `開發工具` | CLI、IDE、代碼審查、token 壓縮、開發流程 proxy | pr-agent, free-claude-code, rtk |
| 4 | `UI/UX設計` | 前端框架、設計系統、網頁動畫、原型、圖標庫 | m3e-canvas, storybook |
| 5 | `知識管理` | agent 記憶、RAG、知識圖譜、codebase 索引 | OpenViking, graphify |
| 6 | `學習資源` | 教程、課程、書籍、Awesome Lists（以**閱讀學習**為主要價值） | free-books, free-for-dev, weread-hot-booklists |
| 7 | `研究` | 學術研究、文獻、論文、學術資料集 | systempromptsleaks |
| 8 | `安全性` | 滲透測試、漏洞掃描、資訊安全 | anthropic-cybersecurity-skills |
| 9 | `金融與投資` | 交易、量化、股票分析 | financial-services |
| 10 | `3D工程繪圖` | CAD、3D 建模、3D 資產／零件庫 | FreeCAD, freecad-library |
| 11 | `瀏覽器自動化` | 爬蟲、Scraper、Headless 瀏覽器 | browser-use, scrapling |
| 12 | `API 整合` | API 網關、整合工具、**可直接調用的 API 端點目錄／聚合器** | public-apis, gpt4free, freellmapi |
| 13 | `數據分析` | Pandas/Polars、資料框架、產品分析 | posthog |
| 14 | `多媒體生成` | AI 圖像／影片**生成** | stable-diffusion-webui |
| 15 | `影片` | 影片編輯、影片**串流**、影片客戶端 | freetube, youtube-skills |
| 16 | `音訊` | TTS/STT、音訊處理、音樂播放 | musicfree |
| 17 | `文件生產力` | 簡報／PPT、Office、PDF | ppt-master, markitdown |
| 18 | `測試與自動化` | 測試框架、CI/CD、自動化腳本 | playwright |

> **已移除**：`圖文資源`（0 個工具，空分類）、`基礎設施`（0 個工具）、`其他`（違反 MECE）。
> 圖標庫／SVG 資源改歸 `UI/UX設計`。

---

## 二、判定決策樹（依序套用，先命中者勝）

```
1. 學術研究 / 論文 / 文獻 / 學術資料集？
   └─ 是 → 研究
   └─ 否 ↓

2. 教程 / 課程 / 書籍 / Awesome 清單 / 領域主題 curated 清單，
   且主要價值是「閱讀、學習、參考」？
   └─ 是 → 學習資源
   └─ 否 ↓

3. 可直接調用的 API 端點目錄 / API 網關 / 多供應商聚合器？
   （主要價值是「取用服務」而非「閱讀」）
   └─ 是 → API 整合
   └─ 否 ↓

4. 成品 Agent 產品 / agent harness / skill・plugin 集合？
   （可直接執行任務或掛載使用的 agent 套件）
   ├─ skill・plugin 集合，且**名稱**指向單一領域 → 該領域（領域專屬）
   └─ 其餘（成品 agent / harness / 通用型 skill 集合）→ AI 代理
   └─ 否 ↓

5. LLM SDK / 模型本體 / 推理訓練框架 / 本地模型運行時？
   └─ 是 → AI 框架
   └─ 否 ↓

6. 開發流程輔助（CLI / IDE / code review / proxy / token 壓縮）？
   └─ 是 → 開發工具
   └─ 否 ↓

7. 依領域關鍵字落入 UI/UX設計、知識管理、安全性、金融與投資、
   3D工程繪圖、瀏覽器自動化、數據分析、多媒體生成、影片、音訊、
   文件生產力、測試與自動化（關鍵詞表見 §2.1）
   └─ 皆未命中 → 開發工具（預設值，且 MUST 人工覆核）
```

### 2.1 領域關鍵詞表（由 `registry/categories.json` 自動產生）

原決策樹只寫「依領域關鍵詞落入其餘分類」而未列關鍵詞，導致領域分類無明文依據。
下表為正式詞表，**唯一來源是 `registry/categories.json`** —— 程式（`scripts/rescan-classification.js`）
與本文件都從它衍生，因此不可能再各自脫節。

<!-- CATEGORIES:KEYWORDS:START -->
> 本表由 `registry/categories.json` 自動產生，**請勿手改**。修改請執行 `npm run categories:sync`。

| 分類 | 色碼 | 信號關鍵詞（正規表達式片段） |
|---|---|---|
| `AI 代理` | `#0ea5e9` | —（無關鍵詞：靠結構性規則或語意判斷，見 §2 步驟 1–6） |
| `AI 框架` | `#2563eb` | —（無關鍵詞：靠結構性規則或語意判斷，見 §2 步驟 1–6） |
| `開發工具` | `#94a3b8` | —（無關鍵詞：靠結構性規則或語意判斷，見 §2 步驟 1–6） |
| `UI/UX設計` | `#ec4899` | `design system` `ui (kit\|library\|component)` `prototyp` `wireframe` `design token` `figma (plugin\|api\|library\|sdk\|widget\|integration)` |
| `知識管理` | `#9333ea` | `\brag\b` `retrieval[- ]augmented` `knowledge graph` `vector (db\|database\|store)` `embedding (store\|index)` `second brain` `agent memory` `codebase (index\|map)` |
| `學習資源` | `#ea580c` | `tutorial` `course` `curriculum` `roadmap` `handbook` `cheat ?sheet` `interview (prep\|handbook)` `learn .{0,20}(from\|by) (scratch\|doing\|example)` `guide to` |
| `研究` | `#78716c` | `arxiv` `research paper\|academic (paper\|research)` `literature review\|systematic review` `preprint\|peer[- ]reviewed` `论文\|論文\|文献\|學術\|学术` |
| `安全性` | `#dc2626` | `pentest\|penetration test\|vulnerability (scan\|assessment)\|exploit (dev\|development)\|malware\|owasp\|threat (intel\|hunt)\|security (audit\|scanner)\|forensic` |
| `金融與投資` | `#f59e0b` | `\btrading\b\|quant(itative)? (trading\|finance\|strategy)\|portfolio (optim\|management)\|backtest\|stock (analysis\|market\|screening)\|financial (analysis\|data\|statement)` |
| `3D工程繪圖` | `#0891b2` | `\bcad\b\|parametric (3d\|model)\|openscad\|freecad\|3d (model\|asset\|mesh\|printing)\|blender\|\bbim\b` |
| `瀏覽器自動化` | `#6366f1` | `\bscrap(e\|er\|ing)\b\|web crawler\|crawling\|headless browser\|browser automation\|stealth.*fetch` |
| `API 整合` | `#10b981` | —（無關鍵詞：靠結構性規則或語意判斷，見 §2 步驟 1–6） |
| `數據分析` | `#16a34a` | `\bpandas\b\|\bpolars\b\|dataframe\|exploratory data analysis\|\beda\b\|\bolap\b\|data (analysis\|visuali[sz]ation) (tool\|library)\|analytical (database\|engine)` |
| `多媒體生成` | `#d946ef` | `image generation\|text[- ]to[- ](image\|video)\|stable diffusion\|diffusion model\|generative (image\|video\|media)\|image (generator\|synthesis)` |
| `影片` | `#f43f5e` | `video (edit\|editor\|generation\|pipeline\|production)\|ffmpeg\|subtitle (generation\|editing)\|\bmanim\b` |
| `音訊` | `#84cc16` | `\btts\b\|\bstt\b\|text[- ]to[- ]speech\|speech[- ]to[- ]text\|voice (cloning\|synthesis)\|audio (processing\|transcription)\|transcrib` |
| `文件生產力` | `#a16207` | `\bpptx?\b\|powerpoint\|slide deck\|presentation (deck\|generation)\|docx\|xlsx\|pdf (generation\|parsing\|conversion\|extraction)\|office (document\|file)` |
| `測試與自動化` | `#2dd4bf` | `test (runner\|framework\|automation\|harness)\|ci\/cd\|e2e test\|unit test\|\bcypress\b\|\bvitest\b\|\bjest\b\|regression test` |
<!-- CATEGORIES:KEYWORDS:END -->

**詞表的兩級套用（精度設計）**

同一組關鍵詞在**不同欄位**出現，證據力差異極大，故分兩級使用：

| 級別 | 命中欄位 | 證據力 | 用途 |
|---|---|---|---|
| **精確（Tier 1）** | `id` / `name`（**只認名稱，不做 body 回退**） | 工具「自稱」是該領域工具 | 可自動套用 |
| **啟發（Tier 3）** | `id` / `name` / `triggers` | 只是「提到」該領域 | 僅列報告供人工覆核 |

> **為何精確級不做 body 回退**（2026-09-12 修正）：若允許「描述命中 ≥2 個信號」也算精確級，
> `langchain` 會因為描述同時出現 `RAG` 與 `retrieval-augmented generation` 而被判成「知識管理」。
> 但決策樹**步驟 5（LLM 框架 → AI 框架）優先於步驟 7（領域關鍵詞）**，框架不該被領域詞搶走。
> 名稱欄位才是工具「自稱」是什麼的可靠證據。

> ⚠️ **不可列入詞表的兩類信號**（2026-09-12 誤判事故後定為禁令）：
> 1. **特定工具名**：把 `duckdb` 列為「數據分析」信號，會讓 duckdb 自己命中自己 —— 循環論證。
> 2. **裸品牌名**：把 `figma` 列為「UI/UX設計」信號，會誤中 `figma-guide`、`figma-community-resources`
>    這類**教學／資源**。必須是工具類型措辭（`figma plugin\|api\|library\|sdk`）才算。

---

## 三、容易混淆的邊界（裁決案例）

| 情境 | 裁決 | 理由 |
|---|---|---|
| Awesome List 該歸 `學習資源` 還是 `AI 代理`？ | 看主要價值 | 以**閱讀**為主 → `學習資源`（free-books、free-for-dev）；以**可掛載執行的 skill/agent 包**為主 → `AI 代理`（awesome-llm-apps、awesome-claude-skills） |
| Awesome List 該歸 `學習資源` 還是 `API 整合`？ | 看條目性質 | 條目是**可直接呼叫的 API 端點** → `API 整合`（public-apis、awesome-free-llm-apis）；條目是**服務／文章／書籍** → `學習資源`（free-for-dev） |
| 免費 LLM API 供應商歸哪？ | `API 整合` | gpt-api-free、gpt4free、freellmapi、opencodex — 核心價值是「取用服務」 |
| 本地 LLM 推理引擎歸哪？ | `AI 框架` | web-llm、airllm、freetoken、ds4 — 核心價值是「運行模型」 |
| AI code review 工具歸哪？ | `開發工具` | pr-agent、open-code-review — 決策樹第 6 條明列 code review |
| 編碼 Agent（會自己寫程式）歸哪？ | `AI 代理` | freebuff、kilocode — 是成品 agent 而非流程輔助 |
| 影片「客戶端／串流」歸哪？ | `影片` | freetube — `影片` 定義含串流與客戶端 |
| 音樂播放器歸哪？ | `音訊` | musicfree — 無獨立「媒體播放」分類，音訊最接近 |
| **領域主題**的 curated 清單歸哪？ | `學習資源` | 2026-09-12 修訂 §2-2：**主題不改變「清單」的性質**。清單的價值是「閱讀」，故一律歸 `學習資源`（the-book-of-secret-knowledge、awesome-notebooklm-workflows）；主題僅保留為 trigger 標籤供檢索命中。唯二例外即上兩列：條目是可直接呼叫的 API 端點 → `API 整合`；條目是可掛載執行的 agent/skill 包 → `AI 代理`。 |
| **領域專屬** skill 包歸哪？ | 該領域 | 2026-09-12 修訂 §2-4：`anthropic-cybersecurity-skills` → `安全性`、`scientific-agent-skills` → `研究`、`ui-ux-pro-max-skill` → `UI/UX設計`、`minimax-ppt-skills` → `文件生產力`。判定依據**只看名稱欄位**（id/name），僅 description 提及領域詞不算。 |
| **通用型** skill・plugin 集合歸哪？ | `AI 代理` | `openai-codex-skills`、`anthropic-claude-skills`、`vercel-agent-skills` — 跨領域、可掛載使用。 |
| skill 包被歸到 `AI 框架` 怎麼辦？ | 改歸 `AI 代理` 或該領域 | 演繹排除法：`AI 框架` 定義為「LLM SDK／模型本體／推理訓練框架／本地模型運行時」，skill 包在任何定義下都不屬此類。2026-09-12 據此修正 6 筆（vercel-ai-skills、addyosmani-agent-skills、knowledge-work-plugins、skill、taste-skill、compound-engineering-plugin）。 |
| 名為 `xxx-samples` / `xxx-examples` 的 skill 範例集歸哪？ | `學習資源` | 範例集是學習產物，不是可掛載的 skill 包，**不適用**領域專屬判定。例：`figma-plugin-samples`。 |
| 為什麼不能反推「名稱沒有領域詞 ⇒ 通用型」？ | 不可反推 | 領域詞表永遠不可能窮盡。首輪實驗據此反推，把 `ui-skills`、`trailofbits-skills`、`gsap-skills`、`reverse-skill` 等領域包誤判為通用型（37 筆 Tier 1 中約 27 筆錯誤）。**只有正向判定可用。** |

---

## 四、欄位值規範

### 4.1 `language`
一律**小寫**。常見對照：

| 錯誤寫法 | 正確值 |
|---|---|
| `Python` | `python` |
| `C++` / `cpp` | `c++` |
| `C#` / `csharp` | `c#` |
| `Jupyter Notebook` | `jupyter notebook` |
| `unknown` / 空值 | `other` |

允許值（23）：`python` `typescript` `javascript` `go` `rust` `java` `kotlin` `swift` `c` `c++` `c#` `php` `shell` `powershell` `html` `css` `less` `vue` `markdown` `mdx` `jupyter notebook` `clojure` `other`

### 4.2 `install.method`
允許值（17）：`npm` `npx` `pip` `conda` `cargo` `composer` `apt` `docker` `git` `git-clone` `git-clone-sparse` `curl` `download` `binary` `plugin-marketplace` `none` `manual`

- 純清單／文件型資源 → `none`，且 `command` 說明「無需安裝」
- 桌面應用（有 Releases 安裝檔）→ `download`

### 4.3 `category`
MUST 為第一節 18 個分類之一。**禁止** `其他`、`未分類`、`Uncategorized`。

---

## 五、強制驗證

以下檢查已納入 `node scripts/check-mece.js`，違反即視為建置失敗：

1. **互斥性**：無「其他」殘留、無 ≤2 個工具的小分類、無 ≥50 個工具的大分類
2. **窮盡性**：所有工具都有明確分類
3. **Enum 合規**：`category` / `language` / `install.method` 必須落在 `registry/schemas/tool.schema.json` 的 enum 內
4. **單一來源一致性**（見 §六）：
   - `categories.json` 名稱唯一、每個分類都有合法色碼
   - 色碼互不重複；任兩色 RGB 距離 ≥ 55；每色對純黑對比 ≥ 3.5:1
   - `registry` 使用的分類都在 `categories.json` 有定義
   - `tool.schema.json` 的 `category` enum 與 `categories.json` 完全一致
   - 本文件涵蓋全部 18 個分類

```bash
node scripts/check-mece.js        # 必須全綠
node scripts/sync-categories.js --check   # 衍生檔是否與單一來源同步
node cli.js validate              # 詮釋資料品質門禁
```

> 這四項在 CI（`.github/workflows/deploy-pages.yml`）中都會執行，另有
> `node scripts/rescan-classification.js --ci` 確認沒有 Tier 1 分類違反。

---

## 六、變更流程（單一來源）

**18 個分類的唯一來源是 `registry/categories.json`。** 它同時定義名稱、定義、色碼、範例與領域關鍵詞。

### 新增／修改／刪除分類時

```bash
# 1. 只改這一個檔案
vi registry/categories.json

# 2. 產生所有衍生檔（schema enum、本文件 §2.1 詞表）
npm run categories:sync

# 3. 驗證
npm run check-mece
npm test
```

### 為什麼是這樣（歷史教訓）

2026-09-12 的審計發現，18 個分類原本**散落在 5 個以上位置、靠人工同步**，
一天內就出現 **4 次脫節**：

| # | 脫節 | 後果 |
|---|---|---|
| 1 | `core/classifier.js` 的分類名寫成簡體（`开发工具`），registry 用繁體（`開發工具`） | LLM 分類結果被驗證拒絕 → **靜默**退回規則引擎 |
| 2 | `tool.schema.json` 的 enum 只有 9 個分類（含違反 MECE 的「其他」） | 形同無約束 |
| 3 | 知識圖譜色表漏了 `金融與投資`，且有 4 個已廢棄分類的幽靈 key | 25 筆工具用任意色 |
| 4 | `core/classifier.js` 的 LLM prompt 停在舊版 6 步決策樹、且是簡體 | LLM 分類與本文件不一致 |

### 各消費端的取用方式

| 消費端 | 取用方式 |
|---|---|
| `core/classifier.js` | 經 `core/categories.js` 讀取（`VALID_CATEGORIES` + LLM prompt 皆為執行期產生） |
| `scripts/generate-knowledge-graph.js` | 經 `core/categories.js` 讀取色表 |
| `scripts/rescan-classification.js` | 經 `core/categories.js` 讀取領域關鍵詞（`DOMAIN_RULES`） |
| `registry/schemas/tool.schema.json` | **靜態衍生檔** → `npm run categories:sync` |
| 本文件 §2.1 | **靜態衍生檔** → `npm run categories:sync` |

> 執行期消費端不需要產生步驟，因此**不可能脫節**；兩個靜態衍生檔由
> `check-mece.js` 與 `categories:check` 把關。

---

## 七、全庫重掃機制

```bash
npm run rescan-classification            # 產出差異報告（唯讀）
npm run rescan-classification -- --apply # 套用 Tier 1 變更
```

- 產出：`docs/classification-rescan-YYYY-MM-DD.md`（人可讀）、`registry/classification-rescan.json`（機器可讀）
- 分層：**Tier 1** 明文規則違反（建議套用）／**Tier 2** 需人工裁決（不自動套用）／**Tier 3** 領域關鍵詞啟發（僅供參考）
- 精度設計：**欄位加權**（id/name/triggers 為身分欄位，命中一次成立；description/useCase/capabilities 需 ≥2 個信號）
  + **排除條款**（proxy / plugin / skill / guide / MCP server 屬周邊，非該類工具本身）
  + **三輪分層**（pass 1 精確 → pass 2 語境裁決 → pass 3 領域啟發）；
    「先命中者勝」只在同一 pass 內成立，低 pass 一律優先，確保精確規則不被寬鬆規則搶走

### 7.1 三輪分層的判定語意

| pass | 內容 | 命中欄位 | 可否自動套用 |
|---|---|---|---|
| **1** | 結構性規則（R1–R5、R7、R8、R10、R10b）＋ 領域精確規則（`D*-T1`） | `id` / `name`（`D*-T1` 為 strict） | ✅ 是 |
| **2** | 需語境裁決（R6 編碼 agent、R9 學術研究） | 需排除「周邊語境」後才成立 | ❌ 列 Tier 2 |
| **3** | 領域啟發（`D*-T3`） | `id` / `name` / `triggers` | ❌ 列 Tier 3 |

### 7.2 已解決缺口（2026-09-12 第二次全庫重掃結案）

**缺口 1：§2 步驟 7 未定義關鍵詞 → 已解決**
關鍵詞表已明文寫入 **§2.1**，並成為程式 `DOMAIN_RULES` 的單一來源
（`categories.json` → `core/categories.js` → `rescan-classification.js`，不再手抄）。
覆蓋率由首次掃描的 29.5%（寬鬆）→ 11.9%（僅精確）→ 本次 **28.6%**（兩級並用）。

> **一次回歸與修正（誠實記錄）**：關鍵詞改由 `categories.json` 驅動後，`langchain`
> 被誤報 `AI 框架 → 知識管理`（`why=body×2`，因 description 含 `RAG`、
> `retrieval-augmented`）。根因是 `strict` 分支仍保留了「內文 ≥2 信號」的退路，
> 與本文件「Tier 1 = 僅比對名稱」的定義自相矛盾。已將 `strict` 改為**純名稱比對、
> 命中即回傳、未命中即 `no-name-hit`**，決策樹步驟 5（LLM 框架）因此正確地
> 優先於步驟 7（領域關鍵詞）。修正後 Tier 1 回到 0。

**缺口 2：「領域主題的 curated 清單」政策未定 → 已解決**
裁決為 **A：字面套用 §2-2** —— 清單一律歸 `學習資源`，主題不改變清單性質。
已套用：`the-book-of-secret-knowledge` → `學習資源`、`awesome-notebooklm-workflows` → `學習資源`。

**缺口 3：§2-4「skill・plugin 集合 → AI 代理」缺「通用型」限定 → 已解決**
§2-4 修訂為：**領域專屬** skill 包 → 該領域；**通用型** → `AI 代理`。
已套用 10 筆（見 `classification-rescan-2026-09-12.md` 第六節）。

### 7.3 剩餘未自動化項（誠實揭露）

| 項目 | 現況 | 為何不自動化 |
|---|---|---|
| 通用型 skill 包（名稱無領域詞） | 僅在**現行分類為 `AI 框架`** 時套用排除法（R10b） | 「名稱無領域詞」不等於通用型，詞表不可能窮盡。反推會誤判 `ui-skills`、`trailofbits-skills`、`gsap-skills` |
| Tier 2（12 筆）、Tier 3（17 筆） | 永久保留在報告中，供人工覆核 | R6 的 "agent" 一詞高頻且語境依賴；Tier 3 本質為啟發，不具演繹必然性 |
| 無規則命中（497 筆，71.4%） | 維持現狀 | 決策樹為粗篩，未命中即「無證據變更」，不臆測 |

> 決策樹中屬**判斷型**的分類（`AI 代理` 未命中率約 90%、`開發工具` 87%、
> `AI 框架` 85%）缺乏詞彙特徵，是 71.4% 未命中的主因；**領域型**分類
> （`音訊`、`瀏覽器自動化`、`影片`）則命中良好。這不是規則寫得不夠，而是
> 「判斷型分類本來就只能靠語意判斷」——覆蓋率的合理上限即在 30% 附近。

---

*制定日期：2026-09-12 ｜ 依據：22 個 GitHub URL 批量入庫時的全庫分類審計*
*最近更新：2026-09-12（下午）｜ v1.2：分類改為單一來源架構（`registry/categories.json` + `core/categories.js`），§6 全面改寫並附 4 次漂移史；新增 8 條一致性守衛（`check-mece.js`）與 8 個守衛測試；§7.2 補記 `langchain` 回歸與修正*
*v1.1：§2.1 領域關鍵詞表明文化、§2-2 領域主題清單裁決、§2-4 通用型／領域專屬 skill 包修訂、§3 新增 6 條邊界裁決、§7 缺口結案*
