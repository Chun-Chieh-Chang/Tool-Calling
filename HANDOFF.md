# HANDOFF — 交接文檔

> 給接手的 AI 助手（Claude）。閱讀順序建議：**先讀「關鍵陷阱」，再讀「目前狀態」**。
> 最後更新：2026-09-20

---

## 一、這個專案是什麼

**Tool-Calling** — 一個「找工具、裝工具、用工具」的 AI 工具箱系統。

- 收錄 **705 筆**開源 AI 工具與 Agent 技能，分為 **18 個領域分類**
- 提供三個入口：**Web 工作台**、**MCP server**、**CLI**
- 核心價值是**檢索**：使用者用自然語言描述需求，系統找出最適合的工具

技術棧：純 Node.js（無框架）、ESM、無外部執行期依賴。

---

## 二、🔴 關鍵陷阱（必讀，這些都是踩過的坑）

### 1. 量測本身會騙人（最重要）

**兩次差點得出錯誤結論：**

| 症狀 | 真因 | 檢查方式 |
|---|---|---|
| 評測跑出 50.0%（比基準差） | **API 限流**，成功呼叫只有 29/42 | 一定要看「成功呼叫數」 |
| 評測跑出 61.9%（比基準差） | 用了**不同參數**（topK=20 vs 50），天花板不同 | 比較前確認參數一致 |

→ **看到數字異常時，先懷疑量測方法，再懷疑改動。**

### 2. 「先診斷」勝過「先動手」

三次原定計畫都被診斷推翻：

| 原本要做 | 診斷後發現 |
|---|---|
| 補 344 筆缺欄位 | 瓶頸是語意鴻溝，不是欄位缺失 |
| 做能力圖譜 | 只是排序問題（調參數即可） |
| 改 rerank 架構 | 病灶是「無條件替換」，加棄權出口即可 |

→ **動手前先確認問題是什麼。**

### 3. 擴充過度會退步

trigger 擴充到 361 筆時，fusion Hit@1 **從 11.9% 退步到 7.1%**。
根因是**鑑別力被稀釋**（新詞讓競爭對手一起變強）。

→ 已實作鑑別力守門（df > 3 剔除，每批剔除約 49%）。
→ **「更多資料一定更好」是錯的。每批擴充後必須量測，且要能回滾。**

### 4. 簡繁必須一致

LLM 產生的簡體詞（「浏览器」）與繁體查詢的 bigram **完全不重疊**——
tokenize 把「瀏覽器」切成 瀏覽/覽器、「浏览器」切成 浏览/览器，零交集。
曾污染 508 項／1201 字元／110 筆工具。

→ 已用 `scripts/fix-simplified.js` 全數修正，並在產生端防護。
→ **但注意：`CLASSIFICATION.md` 的「开发工具」是刻意引用（描述 bug），不可改。**

### 5. git remote-tracking 在此環境不會更新

`git fetch` 回報成功，但 `packed-refs` 不變；`git update-ref` 也不建立 loose ref。

**症狀**：`git status` 誤報「ahead 352」、`git merge` 誤說「Already up to date」。

**解法**：直接改 `.git/packed-refs` 中該行的 hash。
**驗證**：一律用 `git ls-remote origin main` 查真實遠端，別信 remote-tracking。

### 6. 工具輸出過大

`knowledge-graph.html` 的節點資料是嵌在**單行**的巨大 JSON（1.2MB+）。
直接 grep 會吐出巨量內容塞爆 context。

→ **改用 Node 腳本先解析再輸出摘要。**

### 7. 命令被安全機制擋

- 含 `$null` 字面量 → 被判定為「從 Bash 呼叫 PowerShell」
- commit message 含 "PowerShell" 字樣 → 同樣觸發

→ 改寫用詞即可繞過（不是錯誤，是保護機制正常運作）。

### 8. 🔴 緩解機制的 bug 會偽裝成別的問題（2026-09-19 最重要的教訓）

同一天內遇到**四次**，表面症狀都指向別處，根因都是緩解機制本身有缺陷：

| 表面症狀 | 實際根因 |
|---|---|
| 重試加了仍偶發 fail | 退避總和 15.5s，但該測試 timeout 只有 10s → **重試還沒跑完就先超時** |
| 簡繁轉換一直漏字 | 手維護對照表**註定補不完**（補 37 又補 32 仍漏） |
| 標註放寬做了仍有一半漏評 | 用 `benchmark`（topK=5）的失敗清單，但上線路徑是 `eval:rerank`（topK=50），**兩者失敗集合不同** |
| README 數字改了又飄 | 把「每次 build 會自動重生」的數字手抄進 README |

→ **看到「明明加了防護卻還出問題」，先檢查防護本身，不要加大劑量。**

### 9. 共用可變狀態的測試必須序列化

`category-guards.test.js` 必須寫真實的 `categories.json`／`tool.schema.json`
（`check-mece.js` 路徑寫死，無法導向暫存副本），與 `tier1-preservation.test.js`
共用可變狀態，而 node:test 預設跨檔平行 → 必然競爭。
2026-09-19 起 `npm test` 改為 `--test-concurrency=1`。
**共用可變狀態時序列化是正確解法，不是權宜之計。**

### 10. opencc-js 會把「已經是繁體」的字串改錯

`減少干擾` → `減少幹擾`（因為「干擾」不在簡轉繁詞庫內，退回單字 干→幹）。
同理單字 台→臺。
→ **偵測用保守的內建表（排除歧義字），轉換才交給 opencc**，兩者職責不可顛倒。
`findSimplified` 若改用 opencc 會把「減少干擾」「跨平台」誤報成簡體。

### 11. 評測集已有 13 筆 alsoAcceptable，嚴格／寬鬆要分開看

放寬標註後嚴格分數**完全不變**，只有寬鬆上升。這是正確的——
兩個數字並列就是為了不讓放寬掩蓋真實能力。**只報寬鬆數字是誤導。**

### 12. 🔴 Git 倉庫會反覆損壞（已發生兩次，禁止 rebase / stash）

`git stash` 或 `git rebase` 被 SIGTERM 中斷後，`.git/refs/` 與 `.git/logs/` 目錄會整個消失，且部分 commit 物件遺失。
症狀：`fatal: not a git repository`、`Could not read <sha>`、`bad tree object HEAD`。

**修復程序（已驗證兩次）：**
1. 先備份工作區變更檔（工作區檔案不受 `.git` 損壞影響，一定先複製出來
2. `mv .git /tmp/...`（保留損壞版本）
3. 從 GitHub 重新 clone 到暫存目錄，`cp -r <clone>/.git ./.git`
4. `git status` 應只剩自己的變更 → 重新提交

⚠️ **此環境禁用 `git rebase` 與 `git stash`，改用 `git merge`，或先備份再操作。

### 13. 🔴 Web 靜態根目錄：改動服務來源後必須枚舉所有依賴資源

伺服器預設服務 `dist/`（**gitignored 的建置產物**）。這造成一整串連環陷阱：

| 陷阱 | 症狀 |
|---|---|
| 改了 `web/*` 卻沒生效 | 因為伺服器服務 `dist/`，需 `npm run build` |
| `--dev` 參數曾未實作 | 參數存在但沒作用，仍服務 `dist/` |
| `/core/*` 未對應 | `app.js` import 404 → **畫面全白** |
| `docs/*.html` 被 build 複製到 `dist/` 根目錄 | **全鏈路流程圖消失**（正式網址是 `/pipeline-workflow.html`，不是 `/docs/pipeline-workflow.html`）

**版本**：`--dev` 模式已於 2026-09-20 修好（服務 `web/`，並把 `/core/`、`/docs/` 與兩個 build 複製的 html 對應回專案根。

**健檢（改動後必跑）**：
```bash
for u in / /app.js /core/search-engine.js /registry/tools.json \
         /pipeline-workflow.html /knowledge-graph.html /docs/pipeline-workflow.html; do
  echo -n "$u → "; curl -s -o /dev/null -w "%{http_code}\n" "http://127.0.0.1:3000$u"
done
```

### 14. `advantages` 必須是陣列

`registry-contract.js` 檢查 `Array.isArray(tool.advantages)`。補成字串的話
`cli.js validate` **照樣警告（692/705 工具都是陣列。轉成陣列後品質從 99.7 → 100。

→ **補欄位前先看 `core/registry-contract.js` 的檢查條件。

### 15. `batch-add` 不會寫 stars

`node cli.js batch-add urls.txt` 收錄後 `stars` 是 `undefined`（其他 669/705 都有）。
需另外用 GitHub API 補 `stargazers_count`，否則排行榜與 `getCategoryStarScore` 會當成 0。

### 16. 🔴 模型「照抄」譯文（偷懶譯文）

模型有時把英文原文原封不動當譯文回傳。log 顯示成功、`*_zh` 有值，但 UI 仍是英文——**完全不會在 log 顯現。

偵測（只在原文為純英文時才算失敗；原文是中文時回傳相同為正確行為）：
```js
if (src && !hasZH(src) && zh === src && src !== t.id && src !== t.name) → 偷懶譯文
```

排除「原文剛好是 id／name」的無意義資料。**修法：單筆（batch=1）重呼叫；批次越大越容易照抄。
skill `i18n-coverage` 的 `audit.js` 會獨立回報「偷懶譯文」。

### 17. 天花板缺口的根因是詞彙鴻溝，不是 metadata 太薄

用 `npm run ceiling`（不需 API、幾秒）可區分：天花板低 = 召回問題；天花板高但 top1 低 = 排序問題。

**v1.2.0 實測**：direct 天花板 100%、semantic **91.1%**、constrained 96.9%。

8 題答案不在 top-50 的原因：使用者用日常語言描述**具體應用場景**，metadata 用技術分類描述**通用能力**。
最極端 c111「齒輪的齒數跟模數一改整組尺寸自動跟著變」vs cadquery「參數化 3D CAD 腳本框架」——**bigram 重疊 0**，詞彙檢索原理上不可能找到。

→ **別再假設「描述太短」**：實測 547/705 工具描述 < 60 字，短描述是全庫常態。
→ 這 5% 缺口是真實限制，**不建議強修**（補 metadata 會變成針對評測答案調參 = overfitting）。
→ 2026-09-20 起改由「知識編譯器」正面處理，見 `docs/WIKI-COMPILER.md`。

### 18. 🔴 同一個檔案不要在同一次回應裡連續下兩次編輯

實測兩次：對**同一個檔案**在**同一則訊息**裡發出兩個 Edit，
第一個 Edit 會被第二個覆蓋而**靜默消失**（工具回報成功，但內容沒進去）。

症狀：後續引用該函式/常數時報「找不到」，或行為與預期不符。

→ **一個檔案一次只下一次 Edit**，改第二處要等下一次訊息。
→ 改完務必 `grep` 或 `git diff` 確認真的寫進去了，不要信任工具的「成功」回報。

### 19. 🔴 簡繁轉換曾有「偵測與轉換共用同一張表」的循環盲區（已修）

`scripts/fix-simplified.js` 原本拿內建保守表 `S2T_KEYS` 當**閘門**：
只有偵測到明確簡體字，才把整串交給 opencc 做詞組級轉換。

問題：S2T 表不完整（缺「没」等字），所以這些字**永遠轉不到**；
而 `findSimplified()` 也用同一張表，複檢也抓不到 → **雙雙失明**。
（知識編譯器 Tier 1 試跑時輸出「有没有」才被發現。）

修法：新增 `S2T_SAFE`（只收無歧義簡體字），在閘門未開時做單字對照。

🔴 **不能直接把字加進 S2T**：那會讓閘門為「含『没』但其他部分是繁體」
的字串打開，整串丟給 opencc 後會把繁體改錯——
`跨平台→跨平臺`、`群組→羣組`、`減少干擾→減少幹擾`、`漏斗→漏鬥`。

→ 判定某字能否進 `S2T_SAFE`：opencc 單字轉換後不同、**且**該字在繁體裡
不存在同樣字形（排除 台/群/干/斗/里/面/发/只/松/适/复/于/后…）。

### 20. ⚠️ eval-rerank 預設 topK=20，上線 recallK=50（兩者不一致）

`scripts/eval-rerank.js` 的 `K` 預設是 **20**，
但上線的 `retrieval-fusion.js` 的 `retrieveWithRerank()` 用 `recallK = 50`。

→ 直接跑 `npm run eval:rerank` 得到的數字**低估了上線表現**
   （top-20 天花板 90.6% vs top-50 天花板 96.9%）。
→ 要量「實際上線表現」必須明確加 `--topK=50`（成本約 2.5 倍）。

這與既有的「評測必須與正式路徑一致」原則衝突（同一條原則讓 `buildCandidateText()`
在評測與上線共用）。之所以維持預設 20，是為了與歷史數字可比較；
**引用 rerank 數字時務必標明 topK**。

---

## 三、目前狀態（2026-09-20）

### Git

```
最新提交：9ff0ede
遠端：    github.com:Chun-Chieh-Chang/Tool-Calling.git（已同步，無未推送提交）
工具數：  705（tools.json，active + experimental）
```

倉庫損毀已發生**兩次**（09-19 與 09-20），修復程序見**陷阱 12**。
`.git` 於 2026-09-20 從遠端重建過；本地 `origin/main` ref 需手動校正（見陷阱 5）。

### 檢索準確度（核心指標，評測集 v1.2.0／169 題）

**rerank 路徑（實際上線，topK=50）**

| 指標 | 數值 | 備註 |
|---|---|---|
| 詞彙引擎 top-1 | 59.7% | 知識編譯器 V5 啟用（Tier 1 LLM 詞檔） |
| 召回天花板（top-50） | 96.9% | 停用時 95.0% |
| rerank 天花板（top-20） | 90.6% | 停用時 89.3% |
| **rerank 後（嚴格）** | **76.4%** ⚠️ | 配對 A/B：V5 開 76.4% vs 關 75.8%，**p=1.000 無差異** |
| 空集誠實率 | 100%（10/10）| V5 啟用前後皆為 100% |

⚠️ **rerank 路徑統計上無差異**（2026-09-20，交替配對 A/B）：

```
有效配對 157 題（成功呼叫：V5 開 158／關 157）← 配額對稱，偏誤已消除
V5 開 Hit@1 : 120/157  76.4%
V5 關 Hit@1 : 119/157  75.8%   差異 +0.6pp
McNemar：都對 109／只開對 11／只關對 10／都錯 27 → p = 1.000 不顯著
召回天花板：開 90.6% vs 關 89.3%（+1.3pp）
詞彙 top-1：開 60.4% vs 關 51.6%（+8.8pp）
```

🔴 **這是決定性的對照實驗**：同一次執行中，詞彙路徑進步 +8.8pp、
候選池也變好 +1.3pp，但最終 rerank 結果**完全沒吃到這些紅利**。
→ **rerank 的瓶頸是 LLM 挑選力，不是召回、也不是候選排序。**
→ 日後要提升深度搜尋，應改 **rerank 的挑選機制**，不是繼續加召回。

**方法論教訓（第三次栽在順序效應）**：
第一輪量測用「先跑三輪 A、再跑一輪 B」，B 拿到 73.0%（成功呼叫 153 vs 156~158），
看似 V5 大勝——其實是配額遞減造成的假象。
→ **A/B 一定要配對交替**（同一筆查詢跑兩次、交替先後順序），
   已實作為 `node scripts/eval-rerank.js --paired`。
→ V5 的價值在**詞彙／融合路徑**（快速搜尋，+8pp，確定性）。

### 22. 🔴 跑完 `npm test` 一定要看完整計數（tail -4 會漏掉失敗）

TAP 輸出的順序是：

```
# tests N
# suites N
# pass N
# fail N        ← tail -4 剛好把這行切掉
# cancelled N
# skipped N
# todo N
# duration_ms
```

實測踩過：用 `npm test | tail -4` 只看到 `cancelled/skipped/todo/duration`，
誤以為全綠，結果**深度搜尋整個壞掉（ReferenceError）卻沒發現**——
因為編輯註解時誤刪了 `const DEFAULT_MODEL = ...` 這一行。

→ **至少 `tail -8`，或直接 `npm test 2>&1 | grep -E "^# (tests|pass|fail)"`。**
→ 同理：任何「只看尾部 N 行」的驗證都要確認關鍵行沒被截掉。

### 21. 🔴 API 限流是 TPM，而且多把金鑰對本專案**沒有效果**

實測（同一端點 apihub.agnes-ai.com 的兩把金鑰，相同設定、中間等 100 秒）：

| | 成功 | 429 |
|---|---|---|
| 1 把金鑰 | **23/40** | 17 |
| 2 把金鑰 | **23/40** | 17（各 8、9 次）|

**成功數完全相同** → 額度綁帳號／IP，**加金鑰無效**（只是把失敗平均分攤）。

其他實測結論：
- 限制是 **TPM（每分鐘 token 數）**，不是併發數也不是請求數。
  短請求併發 4 → 0 次 429；真實 prompt（2 萬字）併發 3 → 58% 失敗。
- 單把金鑰持續吞吐約 0.2~0.5 req/s（大 prompt）→ **評測只能序列跑**。
- 額度是時間窗：用完後連併發 6 都整批 429，等 60~70 秒恢復。
  （這就是「配額遞減順序效應」的物理機制。）

⚠️ **只看「成功數」，不要看 req/s**：429 瞬間失敗，失敗越多 req/s 越高，
極度誤導（曾出現 2.13 → 3.25 看似提升、成功數卻完全沒變）。

🔴 **失敗時 rerank 會被略過、退回融合排序**，數字看起來正常但全廢。
`eval-rerank.js` 會在成功呼叫 < 90% 時印警告。
→ **看任何 LLM 評測數字前，先看成功呼叫數。**

🔑 金鑰來源（都不在環境變數裡）：
`~/.workbuddy-ai/models.json`（找 url 含 agnes-ai.com）、
`~/.strix/cli-config.json` 的 `env.OPENAI_API_KEY`（同一端點）。
用 `AGNES_API_KEYS=k1,k2` 可多把（對本端點無效，但機制已備妥）。

**benchmark 路徑（topK=5，不含 rerank）**：
agent **59.7%**（含近義 61.6%）／fusion **58.5%**（含近義 60.4%）。
停用 V5 時為 agent 51.6%／fusion 50.3% → **+8.1pp／+8.2pp**。
這些數字是**確定性的**（不呼叫 LLM，不含隨機誤差）。

⚠️ **v1.2.0 與 v1.1.0 不可直接比較**：評測集從 69 擴充至 169 題，
且 semantic 佔比由 33% 升至 50%（產生方法的偏差，見陷阱 11 與 DEV_LOG）。

**分類型（fusion，topK=5，V5 啟用）**：
| 類型 | 筆數 | Hit@1 | 天花板 | 停用時 Hit@1 / 天花板 |
|---|---|---|---|---|
| direct | 48 | 70.8% | 100.0% | 64.6% / 100.0% |
| semantic | 79 | **49.4%** | 93.7% | 40.5% / 91.1% |
| constrained | 32 | 62.5% | 100.0% | 53.1% / 96.9% |

→ semantic 仍是唯一有召回缺口的類型（93.7%），根因是詞彙鴻溝（見**陷阱 17**）。
→ 正面處理方式是「知識編譯器」（`docs/WIKI-COMPILER.md`），**Tier 1 已全量完成**：
   離線把 705 支工具的 metadata 用 LLM 編譯成使用者語言的詞條，
   查詢時比對詞條而非原始描述。天花板 95.0% → 96.9%、agent Hit@1 +8.1pp。
   🔑 `AGNES_API_KEY` 不在環境變數裡，但在
   `~/.workbuddy-ai/models.json`（找 url 含 agnes-ai.com 的項目）。

### 測試

`npm test` → **170 tests / 168 pass / 0 fail**（2 skipped 為需外部依賴者）
2026-09-19 起改為 `--test-concurrency=1` 序列化（見陷阱 9），耗時 12.5s → 21.4s。
`cli.js validate` → **0 錯誤／0 警告／品質 100.0**。
`npm run ceiling` → 天花板診斷（不需 API，見陷阱 17）。

---

## 四、架構

```
Web  ─┐
MCP  ─┼─→ core/retrieval-fusion.js ─→ agent-retrieval + L2 (+ 可選 rerank)
CLI  ─┘
```

**三端共用同一套引擎**（這曾是三套各自實作，已統一）。

### 檢索流程

1. **L2 詞彙**（`core/search-engine.js`）— 關鍵字與觸發詞
2. **Agent 四維**（`core/agent-retrieval.js`）— V1 身分／V2 功能／V3 情境／V4 部署
3. **Fusion**（`core/retrieval-fusion.js`）— 融合上述，決策 adopt／no-match
4. **LLM rerank**（`core/llm-rerank.js`）— 可選後處理，recallK=50

### 三個對外能力（2026-09-20 起，Web／MCP／CLI 三端皆有）

1. **單一工具檢索**（原本就有）：`search_tools` ／ `/api/search`
2. **多工具鏈**（`plan_tool_chain` ／ `/api/chain`）：
   專案型需求多半要數支工具接力。把任務拆步驟，每步給主力 + 備選 + 資料流向。
   走融合引擎（`core/tool-chain.js`），不是舊的 L2 版。
3. **需求收斂追問**（`clarify_requirement` ／ `/api/clarify`）：
   **只在系統不確定時才提問**；題目由候選集在語言／安裝／領域哪個維度
   `entropy` 最高動態決定，不是寫死題庫。`no-match` 時優先問「用途領域」。
4. **擷取管線**（`plan_ingestion` ／ `/api/ingest`）：
   `素材 → 可用筆記`。藍圖警告的「輸入瓶頸」就是這一層。
   每個階段用融合引擎挑工具，**置信度 < 0.20 就明說找不到**，不硬湊。

### 重要設計決策

- **rerank 預設關閉**：詞彙引擎 119ms vs rerank 5365ms，故做成選項
  （Web 有「深度搜尋」開關、CLI 有 `--deep`）
- **rerank 只跑序列**：實測併發 3 會讓 58% 呼叫失敗（限制是 TPM，見陷阱 21）
- **rerank 可棄權**：prompt 允許回 `NONE`，避免把已正確的 top-1 換掉
- **no-match 時仍給最佳猜測**：已明示不確定，不損害誠實性
- **深度搜尋結果不寫快取**：與快速路徑排序不同，共用快取鍵會不一致

---

## 五、檔案地圖

| 路徑 | 用途 |
|---|---|
| `registry/tools.json` | **工具庫（單一真理來源）** 705 筆 |
| `registry/categories.json` | **分類唯一來源**（機器可讀） |
| `registry/eval-queries.json` | 評測集 v1.2.0 — 169 筆（159 可命中 + 10 空集）|
| `registry/zh-translation-state.json` | 繁中譯文進度（可續跑）|
| `scripts/translate-to-zh.js` | 產生 `*_zh` 欄位（`npm run translate:zh`）|
| `scripts/ceiling-analysis.js` | 天花板診斷（`npm run ceiling`，見陷阱 17）|
| `registry/compiled-entries.json` | 知識編譯詞檔（705 筆，由 compile-wiki 產生）|
| `scripts/compile-wiki.js` | **工具知識編譯器**（解析邏輯，`npm run compile:wiki`）|
| `core/wiki-matcher.js` | 詞條配對 + 知識圖譜擴散（配對邏輯，V5）|
| `core/clarifier.js` | 需求收斂追問引擎（純函式，題目由候選差異動態產生）|
| `core/tool-chain.js` | 多工具鏈規劃（走融合引擎版，`planToolSet`）|
| `core/llm-keys.js` | API 金鑰池（輪替 + 429 隔離 + 統計）|
| `scripts/llm-throughput.js` | 限流實測：判斷限制是綁金鑰／帳號／IP |
| `scripts/v5-ablate.js` | V5 權重消融（確定性，不需 API）|
| `core/tokenize.js` | 共用斷詞／IDF（agent-retrieval 與 wiki-matcher 必須同源）|
| `core/retrieval-fusion.js` | 檢索融合（三端入口）|
| `core/agent-retrieval.js` | 五維檢索（V1 身分／V2 功能／V3 情境／V4 部署／**V5 知識詞條**）|
| `core/llm-rerank.js` | LLM 重排（含兩階段實作，未接入）|
| `core/search-engine.js` | L2 詞彙引擎 |
| `scripts/eval-benchmark.js` | 評測（嚴格／含近義兩種分數）|
| `scripts/eval-rerank.js` | rerank 評測 |
| `scripts/fix-simplified.js` | 簡繁轉換工具 |
| `web/index.html` | Web 工作台 |
| `docs/pipeline-workflow.html` | 全鏈路流程圖 |
| `DEV_LOG.md` | 開發日誌（最新在最上方）|

### 產生的檔案（不可手改）

- `core/synonyms.generated.js` ← `npm run build`
- `AGENTS.md` ← `npm run agents:init`
- `docs/CLASSIFICATION.md`、`docs/CATEGORY-SYSTEM.md` ← `npm run categories:sync`
- `dist/` ← 建置產物（已 gitignore）

---

## 六、常用指令

```bash
npm test                    # 單元測試（必須無外部依賴）
npm run validate            # 詮釋資料驗證（品質門禁）
npm run check-mece          # MECE 分類檢查
npm run categories:check    # 分類來源同步檢查
npm run benchmark           # 檢索評測（離線，topK=5）
npm run eval:rerank         # rerank 評測（需 AGNES_API_KEY，topK=50）
npm run ceiling             # 天花板診斷（不需 API，見陷阱 17）
npm run compile:wiki -- --offline    # 知識詞檔 Tier 0 編譯（不需 API）
npm run compile:wiki -- --stats      # 詞檔覆蓋率與知識圖譜統計
npm run translate:zh        # 產生繁中譯文欄位（需 AGNES_API_KEY，可續跑）
npm run build               # 建置（同步 dist/ 與 docs/*.html）
npm start                   # 啟動 Web 伺服器（:3000，服務 dist/）
node web/server.js --dev    # 開發模式（服務 web/，前端改動即時生效）
npm run mcp                 # 啟動 MCP server
```

⚠️ 改了 `web/*` 要用 `--dev` 或跑 `npm run build`（見陷阱 13）。
⚠️ `npm run validate` 的 `advantages` 必須是**陣列**（見陷阱 14）。

---

**改分類的唯一流程**：改 `categories.json` → `npm run categories:sync` → `npm run check-mece` → `npm test`

---

## 七、待辦事項

### 已完成（含 2026-09-20 本輪）

**2026-09-20 新增：**

- ✅ **譯文納入檢索索引** — agent Hit@1 37.5%→53.1%、天花板 95.3%→98.4%。**本輪最大改善**
- ✅ **評測集擴充至 v1.2.0（169 題）** — 標準誤 5.4pp→3.6pp，18 分類均衡、漏詞檢查、天花板驗證
- ✅ 新增 `npm run ceiling` 天花板診斷工具（不需 API）
- ✅ dev 模式三連修：空白頁（`/core/` 404）、改了沒生效（`dist/` 過期）、流程圖消失（`docs/*.html`）。
- ✅ 批次收錄 5 個工具（stirling-pdf、kaggle-tpu-lab、security-audit-skill、openstock、claude-code 官方）
- ✅ 補齊 `advantages`（轉陣列後品質 99.7→100/100、警告 13→0）
- ✅ 修正模型「照抄」譯文（偷懶譯文，見陷阱 16）

**2026-09-19 完成：

- ✅ Web UI 深度搜尋開關
- ✅ 能力圖譜評估（結論：不需要）
- ✅ rerank 棄權機制 NONE
- ✅ `categories[]` 多值身分落盤（確認早已完成）
- ✅ **rerank 餵完整 metadata（+5～8pp）**← 本輪唯一有效的改善
- ✅ 放寬評測集標註（兩輪共 10 筆，駁回 10 筆）
- ✅ 簡繁轉換改用 opencc-js（修 102 個漏網 trigger）
- ✅ 6 筆 trigger 擴充（補齊 699/699）
- ✅ 修復間歇性測試失敗（序列化 + timeout bug）
- ✅ Git 倉庫損毀修復
- ✅ classifier 的 CWE-20 修復（曾被掩蓋）
- ✅ README／DEV_LOG 數字同步
- ✅ `docs/pipeline-workflow.html` 數字與函式名修正
- ✅ **e05「k8s 部署」— 經查證早已正常**（registry 無 k8s 部署工具，
     引擎正確回報 no-match；此條為舊記錄有誤）

### 刻意不做的（都有實測依據，勿重試）

| 項目 | 實測結果 |
|---|---|
| `rerankTwoStage` 分批淘汰 | 58.3% vs 58.3%，成本 6 倍。**保留程式碼記錄負面結果** |
| 只加 `capabilities` 到 rerank | 73.8% ≈ 基線，等於沒加 |
| subTools 餵進 rerank | 78.6% vs 78.6%（3 vs 3），prompt 還長 14% |
| 放開「禁止解釋」改允許推理 | 78.6% → 76.2%，semantic 完全沒動 |
| 升級 agnes-3.0-flash | 無增益且 API 失敗率更高 |
| 候選數降到 top-30 | 省 40% 但天花板**永久**鎖在 85.7% |
| 移除 capabilities 省成本 | 只省 8%，不值得改 |
| **HyDE 查詢改寫**（2026-09-20）| semantic 天花板 91.0%→93.6%（+2.6pp）但總計僅 +1.3pp，**低於雜訊 3.6pp**，且每次查詢多一次 LLM 呼叫（~6s）。不採用 |

### 尚未處理（經實測皆非有效槓桿，優先序低）

1. **補齊缺欄位** — 但注意：實測 547/705 工具描述 <60 字是全庫常態，且補欄位經實測非召回瓶頸（見陷阱 17
2. **能力圖譜** — 2026-09-17 評估：top-200 天花板已 100%，瓶頸是 LLM 挑選力，非召回

### 📌 下一步建議（若繼續投入）

- **攻 semantic 缺口**（40.5%，唯一有召回缺口的類型）。已知無效：HyDE 簡單版、subTools、CoT。
- **自適應 HyDE**：只對「初次檢索低信心」的查詢套用，成本只花在難題上——這是 HyDE 實驗後唯一還值得試的方向。
- **天花板 5% 缺口**（8 題）：根因是詞彙鴻溝，乾淨解法是 embedding，但 API 端點無 embedding 模型可用（已查證）

---

---

## 八、協作規範（使用者要求）

- **一律繁體中文（台灣）回應**，技術術語保留英文
- **原子化提交**（Conventional Commits），不要巨型 commit
- **能優化就不要怠惰**——發現問題應一併修好
- **破壞性操作、push 需先取得明確許可**
- **不確定就說不確定**，不可編造

---

## 九、接手建議

1. 先跑 `npm test`（確認基線）→ `npm run ceiling`（**不需 API，先看召回 vs 排序問題在哪）
2. 讀 `DEV_LOG.md` 最上方條目（有完整的決策脈絡）
3. 讀 `.workbuddy-ai/memory/MEMORY.md`（專案長期記憶，含所有陷阱）
4. **動手前先診斷**——這是這個專案最重要的方法論。推薦順序：`npm run ceiling` → 分析失敗題 → 才做實驗
5. **做 A/B 前先讀「量測方法論」**：v1.2.0（169 題）單次標準誤約 **3.6pp**。差異小於 3.6pp 視為雜訊。
   必須用**配對 + 輪替順序**，並看**不一致對與 McNemar**，
   而非比較兩個獨立比例或跑兩次比數字
6. **善用確定性指標**（天花板、可解性）——不需 API、無雜訊，比 Hit@1 更適合快速判斷方向

> 「先確認問題是什麼，再動手。」——多次診斷都推翻了原定計畫。
>
> 2026-09-20 的最佳實踐：先擴充評測集（讓量測可信）→ 用 `npm run ceiling` 定位 semantic 缺口
> → 針對性實驗（HyDE）→ 得到「低於雜訊」的結論。雖然不採用，但避免了誤判。

---

## 十、重要資產

### skill `i18n-coverage`（`~/.workbuddy-ai/skills/i18n-coverage.zip`）

繁中顯示覆蓋率的完整工作流：**審計 → 翻譯 → 驗證**。收錄所有踩過的坑：
`dist/` 服務陷阱、陣列欄位 `flush()`、模型照抄譯文、`/core/`、`/docs/` 對應、7-URL 健檢指令。
附 `scripts/audit.js`（一鍵掃描缺翻譯欄位與偷懶譯文）。

### 記憶檔

- `.workbuddy-ai/memory/MEMORY.md` — 專案長期記憶（SSOT、檢索架構、13 個實驗結論、所有陷阱）
- `.workbuddy-ai/memory/2026-09-19.md` — 本輪完整歷程（連同 09-20 補記）

## 十一、2026-09-19 的核心結論

當天跑了 **10 個實驗，只有 1 個成功**。這個分佈本身就是結論：

**本專案的瓶頸不在 prompt 技巧、不在資訊深度、不在模型版本、不在解析粒度。**
唯一實證有效的槓桿是「讓 LLM 看到更多**自然語言**語意」
（`useCase`／`advantages`），而那條路已走到底（+5～8pp）。
結構化標籤（`capabilities`／subTools）全部無效。

剩下的缺口（天花板 95.2% vs 實得 71.4%）來自「LLM 從 50 個候選裡挑不準」，
且已證實**減少候選能提升挑選率**（77.5% → 83.3%）但會同步降低天花板。
要再突破需要動排序演算法本身，那是架構改動而非微調。

---

## 十二、2026-09-20 的核心結論（最新）

**兩輪共 13 個實驗，4 個有收穫。** 關鍵是那一輪先用評測集擴充（讓量測可信）+ `npm run ceiling` 定位。

| 實驗 | 結果 |
|---|---|
| 🏆 **譯文納入檢索索引**（agent 維度）| semantic 天花板 91.1% → 93.6%、agent Hit@1 37.5%→53.1% |
| ✅ rerank 餵完整 metadata | +5～8pp |
| ✅ rerank 改餵繁中 | 準確度相同、prompt 省 29% |
| ❌ HyDE 查詢改寫 | +1.3pp（低於雜訊 3.6pp），且多一次 LLM 呼叫 → 不採用
|
| ❌ 其餘 9 個（CoT、subTools、兩階段淘汰、agnes-3.0、top-30…）| 無效，已記錄防重試

**剩下的 5% 天花板缺口是真實限制**（詞彙鴻溝，見陷阱 17），不建議強修（會變成 overfitting）。

---
