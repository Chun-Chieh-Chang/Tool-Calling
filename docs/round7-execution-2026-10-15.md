# 第七輪裁決執行紀錄（2026-10-15）

> 來源：`docs/decisions-2026-10-15b.html`。裁決 **Q1=A／Q2=A／Q3=A／Q4=A／Q5=A／Q6=A／Q7=A**。
> 本檔記錄「已落地什麼、用什麼證據、還有什麼沒做」。裁決頁本身是歷史紀錄，不因執行而改寫。

---

## 摘要

| 題 | 裁決 | 狀態 | 一句話 |
|---|---|---|---|
| Q1 | A | ⏳ 待外部操作 | Worker 程式已備妥並測試；Cloudflare 帳號與 token 必須由你操作 |
| Q2 | A | ⏳ 待外部操作 | 導流橫幅已上線；還差 live 環境變數 `TELEMETRY_ALLOWED_ORIGINS` |
| Q3 | A | ✅ 已落地 | 評測集 9 題簡體清洗 → **v1.4.0**，全部基線已重跑 |
| Q4 | A | ✅ 已落地 | 離線量測完成（**+22.6～23.3pp**）且已接上檢索入口 |
| Q5 | A | ✅ 無需動作 | 「等真人遙測累積後再補」——本輪刻意不動 |
| Q6 | A | ✅ 已落地 | 守門「掃描 0 個檔案即失敗」＋ 7 項測試 |
| Q7 | A | ✅ 已落地 | 4 個未追蹤項目進 `.gitignore`（未刪任何檔案） |

---

## Q3：評測集簡繁清洗 → v1.4.0

**做了什麼**：`registry/eval-queries.json` 的 257 筆非空集查詢中，有 9 筆混入簡體字
（c14／c77／c79／c106／c144～c148），係產生流程的瑕疵——`methodology` 未記載任何
「刻意保留簡體查詢」的意圖。以專案唯一的轉換來源 `toTraditional()` 逐題轉為繁體，
**只動 `query` 欄位**（diff 恰為 9 行 `query` ＋ version／updated／methodology）。

**台灣用語修正**：opencc 設定是 `cn→t`（純字形，不做詞彙本地化），c146 產出「軟件」。
本專案語料慣例是台灣用語（評測集既有 5 處全用「軟體」、registry 為 1352:23），
故手工覆寫「軟件」→「軟體」並在 methodology 記錄理由。

### 為什麼要「同碼配對」而不是比舊基線

`methodology` 裡的 v1.3.0 基線是 **2026-09-20** 量的，其後程式碼改過多次
（V5 詞檔、recallK 50→30、意圖權重…）。直接拿今天的數字比它，會把
「尺變了」與「程式變了」混在一起。因此改為**同一份程式碼、同一批工具，只換評測集**：

| 引擎 | v1.3.0 評測集 | v1.4.0 評測集 | Δ Hit@1 |
|---|---|---|---|
| L2 | 9.7% | 9.7% | 0.0pp |
| agent | 58.0% | **58.4%** | **+0.4pp** |
| fusion | 57.2% | **57.6%** | **+0.4pp** |

（topK=5，不含 rerank；Hit@1）

> ⚠️ 若照舊比文件上的 58.8%，會得到「58.8% → 58.4%，退步 0.4pp」的**錯誤結論**。
> 那個 58.8% 是兩個月前、不同程式碼的數字。

### 被清洗的 9 題：逐題配對

| 題 | 天花板路徑 bestRank | top-5 命中位置（agent） |
|---|---|---|
| c14 | 4 → 2 | 3 → 1 |
| c77 | 26 → 26 | 未進 → 未進 |
| c79 | 39 → 9 | 未進 → 未進 |
| c106 | 1 → 1 | 1 → 1 |
| c144 | **>50 → 7** | 未進 → 未進 |
| c145 | 1 → 1 | 1 → 1 |
| c146 | 23 → 8 | 未進 → 未進 |
| c147 | 4 → 1 | **3 → 1** |
| c148 | 9 → 4 | 未進 → 3 |

- **天花板路徑配對**：改善 6／不變 3／變差 0 —— 與清洗前的量測**完全複現**。
- **top-5 配對**：agent 改善 3／變差 0、fusion 改善 2／變差 0。
- **外溢檢查**：248 題未清洗題目的命中位置 **0 題改變**（改動沒有副作用）。

### v1.4.0 新基線（已寫入 `methodology.baseline_2026_10_15_v1_4_0`）

- benchmark（strict）：L2 9.7%／agent 58.4%／fusion 57.6%
- benchmark（含 13 筆 alsoAcceptable）：L2 10.5%／agent 59.5%／fusion 58.8%
- 空集誠實率：agent 10/10、fusion 10/10
- 天花板（top-50）：direct 100.0%／semantic **97.7%**（v1.3.0 為 96.1%）／constrained 100.0%，合計 98.8%
- 失敗結構：召回缺口 **3**（c17／c66／c111，全 semantic）／排序問題 **38**
- 產物：`docs/benchmarks/2026-10-15-v1.4.0-baseline.txt` ＋ `.meta.json`

> 🔴 **v1.4.0 與 v1.3.0 不可直接比較**（題目內容已變）。v1.3.0 的數字保留為歷史，不重算。
> 🔴 未重跑：`eval:rerank`（實際上線路徑，**需 API key**）與 `ablate:v5`（依既有規則於詞檔重編譯時執行）。

---

## Q4：查詢端「簡轉繁」正規化

### 離線量測（先量測，再上線）

把 257 題各用 opencc 反向轉成簡體，造出「輸入法預設簡體」的使用者語料：

| 條件 | L2 Hit@1 | agent Hit@1 | fusion Hit@1 |
|---|---|---|---|
| T-OFF 繁體・正規化前 | 9.7% | 58.4% | 57.6% |
| S-OFF 簡體・正規化前 | 5.8% | 35.0% | 34.2% |
| S-ON 簡體・正規化後 | **9.7%** | **58.4%** | **56.8%** |

- **效益**：agent **+23.3pp**（MRR 0.434→0.674）、fusion **+22.6pp**（0.389→0.600）、L2 +3.9pp。
- **回歸**：257 題繁體查詢的命中位置 **0 題改變** → 對既有使用者是 no-op。
- **誤報**：評測集 257 題 0 筆誤判；`registry/` 繁體欄位抽樣 2593 筆有 17 筆被判定含簡體，
  逐筆檢視**全部是真陽性**，故真實語料上的觀察誤報率為 0。
- 為什麼 S-ON 仍略低於 T-OFF（fusion 56.8% vs 57.6%）：合成語料走 `t→cn` 會把台灣詞彙
  也換掉（資訊→信息），而 `cn→t` 只還原字形、不還原詞彙。**真人只換字形，回復率會更高**。

### 已接線（5 個入口）

新增 `core/query-normalize.js`（`hasSimplifiedQuery()`／`normalizeQuery()`，**冪等**），
接在：`search()`／`agentRetrieve()`／`retrieve()`／`retrieveWithRerank()`／`retrieveWithAdaptiveHyDE()`。

- `retrieveWithRerank` 必須在**呼叫 rerank 之前**換掉，否則召回用繁體、rerank prompt 還帶簡體。
- `search()` 在**快取查詢之前**換掉，這樣簡體與繁體問句共用同一筆快取。
- 為什麼不無條件套 opencc：`toTraditional()` 內部已守門，對純繁體是恆等函式——這正是 0 回歸的原因。

### 接線後的驗證

天花板（98.8%／top1 58.4%）與 benchmark（9.7%／58.4%／57.6%）**與接線前逐字相同**
→ 證實對繁體輸入是 no-op，v1.4.0 基線依然有效，不需要重跑。

測試：`tests/query-normalize.test.js` 6 項（含一條有牙齒的整合鎖——c144 的簡體 top1 是
`openclaw`、繁體是 `open-llm-vtuber`，移除接線必紅）。

---

## Q5：精實補 capabilities —— 本輪刻意不動

裁決是「等真人遙測累積後再補（純淨）」。目前真人遙測仍是 0 筆（見 Q2），
候選自然也是 0 支。**本輪不對 `registry/tools.json` 做任何 capabilities 寫入。**

---

## Q6：守門「掃描 0 個檔案即失敗」

`scripts/check-traditional.js` 過去會靜默跳過（HANDOFF 陷阱 27）：餵它 `.txt`，
它印「掃描 0 個檔案」然後回 exit 0——**看起來通過，其實什麼都沒檢查**。

修法（分層，避免誤傷）：

| 情境 | 新行為 |
|---|---|
| `--full <路徑>` 指定的目標全部解析不到檔案（路徑不存在／副檔名不在清單／被 `isSkippedPath` 排除） | **exit 1**，訊息說明掃描 0 個檔案與常見原因 |
| `--full` 不帶路徑但 repo 沒有可掃檔案；`--commits` 沒有提交 | **exit 1** |
| diff 模式在乾淨工作區（本來就沒有新增行可檢） | exit 0，但訊息改成「**無事可檢**」，與「檢查通過」分開——兩者不再共用同一句話 |
| 位置參數在預設模式 | 過去被**默默忽略**（餵了檔案卻什麼都沒檢查）→ 現升級為整檔掃描（等同 `--full`） |
| 成功且有掃到東西 | 訊息加上「（掃描 N 個檔案）」，讓「掃很多」與「掃 0 個」分得出來 |

> 🔴 為什麼不做成「0 檔一律失敗」：`npm test` 的預設模式在**乾淨樹**上本來就是 0 檔，
> 一律判失敗會讓 `npm test` 在乾淨樹上直接紅。分層處理同時保住「不假綠」與「不誤擋」。

測試：`tests/check-traditional.test.js` 新增 7 項（3 項直接驗 `printFindings` 的 exit code
與訊息、4 項跑 CLI 驗真的會紅）。門禁機制本身**能失敗才算數**。

---

## Q7：未追蹤目錄處置

`.gitignore` 新增 4 項（**只影響 git 顯示，磁碟上的檔案原封不動**）：

```
.workbuddy/          # 平台部署紀錄（applications.yaml）
.wbapp_*.genie       # 平台發佈描述檔
.playwright-cli/     # 瀏覽器自動化的截圖與頁面快照
scratch/             # 一次性探針腳本與中間輸出
```

驗證：`git status --short` 從 4 項未追蹤變成乾淨。

---

## Q1／Q2：待你操作的外部動作

### Q1 — Cloudflare Worker 部署

程式與測試已完成（`worker/index.js`、`tests/worker-tools-add.test.js` 16 項）。
完整逐步指令在 **[`worker/README.md`](../worker/README.md)**，摘要：

```bash
cd worker
npx wrangler login
wrangler secret put GITHUB_TOKEN     # fine-grained PAT，Contents: Read and write（PR-only）
wrangler secret put SUBMIT_TOKEN     # 選配：共享令牌
# 編輯 wrangler.toml 的 [vars]：REPO_OWNER／REPO_NAME／ALLOWED_ORIGINS
wrangler deploy
```

部署後把 Worker 網址填進 **`web/index.html` 的 `<meta name="tools-add-endpoint">`**
（🔴 不是 `web/data/tools-add-endpoint.json`——那在 `.gitignore` 內，到不了 CI 的 Pages 建置）。

**目前狀態**：`meta` 仍為空、`web/data/tools-add-endpoint.json` 的 `url` 仍為空
→ Pages 上按「＋ 加入工具庫」會顯示「尚未設定提名端點」，**不會送請求**（不是靜默失敗）。

### Q2 — live 重新發佈 ＋ 設定 allowlist

導流橫幅與 relay meta 已在今日 push 後上線。還差：live 實例的環境變數
`TELEMETRY_ALLOWED_ORIGINS=https://chun-chieh-chang.github.io`，**需重新發佈才生效**。

**目前狀態**：`web/data/telemetry-events.jsonl` 本機不存在（本機 0 筆）；
live 的 3 筆全是部署冒煙測試與診斷探針，**無真人事件**。

> 兩者都是對外動作，我會在你明確回覆後才實際執行。

---

## 順手修正（編輯時發現）

| 項目 | 問題 | 處置 |
|---|---|---|
| `docs/README.md` SSOT 表 | 工具數寫 **725**，實際 **771**（`README.md`／`AGENTS.md` 都正確） | 改為 771 ＋ 日期錨點，並註明此表**沒有自動守門**（`check-doc-stats.js` 只檢查根目錄兩檔） |
| `worker/README.md` | 未被 `docs/README.md` 索引 | 加入 §3 使用與整合 |
| `web/data/tools-add-endpoint.json` | 指向不存在的 `docs/TOOLS-ADD-VIA-PAGES.md` | 改指 `worker/README.md` |

---

## 本輪新發現（**未處理**，建議列為下輪裁決）

### `registry/` 的繁體顯示欄位有 17 筆殘留簡體，而且**永遠不會被門禁抓到**

Q4 的誤報檢查意外發現：`registry/tools.json` 的 `description_zh`／`useCase_zh`／
`advantages_zh` 共 2593 筆抽樣中，有 **17 筆含簡體字**，例如：

- `hallmark.useCase_zh`：「生成生產就**绪**的程式碼」→ 應為「生產就**緒**」<!-- allow-simplified：逐字引用實際資料缺陷，這些字就是本節的證據 -->
- `agent-reach.description_zh`：「讓 AI 代理**无**需 API 費用」→ 應為「**無**需」<!-- allow-simplified：逐字引用實際資料缺陷 -->
- `awesome-auto-research-tools.description_zh`：「涵蓋文**献**搜尋」→ 應為「文**獻**」<!-- allow-simplified：逐字引用實際資料缺陷 -->
- `evolver.description_zh`：「事件追**踪**進化歷程」→ 應為「追**蹤**」<!-- allow-simplified：逐字引用實際資料缺陷 -->

這些是**真陽性**（不是偵測器誤報）。它們之所以長期存活，是因為
`check-traditional.js` 的 `SKIP_PATH_PATTERNS` 把整個 `registry/` 列為整檔豁免
（理由正確：`tools.json` 刻意收錄簡體檢索關鍵字），但副作用是**顯示欄位也一併免檢**。

**為什麼沒有一併修**：`*_zh` 欄位**有進索引**（譯文納入索引是史上最大單次改善），
改動它們會改變檢索結果，等同又一次 SSOT 變更 → 必須重跑全部基線。
這與 Q3 同性質，應由你決定，不宜順手改。

**建議選項**：(A) 清洗這 17 筆並發 v1.4.1、重跑基線；(B) 只把 `*_zh` 欄位納入門禁
（`registry/*.json` 的部分欄位掃描），先抓出來但不改；(C) 不動，記錄備查。

---

## 本輪驗證與已知限制

**通過**：繁體門禁（`--full` 146 檔 0 違規）、`check-mece`、`check-doc-stats`（771 筆）、
`check-utf8`、`check-duplicate-ids`、`check-templates`、`categories:check`、`cli validate`（100/100）；
逐檔 `node --check` 全過；測試檔直跑：query-normalize 6／check-traditional 19（其餘 11 為環境偽失敗）、
query-intent-zh 6、ceiling-analysis 6、search 8、search-cache 1、l15-tiebreak 1、l15-score-scale 1、
negative-constraint-sign 1、negative-facets-penalty 4、negative-facets-contract 19、tool-chain 1、
world-week 4、registry-contract 3、multi-category 8 —— 全綠。

**🔴 環境限制（非程式問題）**：本沙盒**封鎖 node 的一切子行程**（`spawnSync` 對
`git`／`node`／`cmd.exe` 一律 EBUSY，即使停用沙盒也一樣）。因此 `npm test`、
`check-syntax.js`、以及所有以子行程跑 CLI 的測試在此**無法執行**。
等價驗證方式：逐檔 `node --check`、逐檔 `node <file>` 直跑、需要 git 的模式改用
`--full <路徑>` 直接指定（不經 `listSources()`）。**CI 會曝光沙盒看不見的真失敗。**
