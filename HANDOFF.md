# HANDOFF — 交接文檔

> 給接手的 AI 助手（Claude）。閱讀順序建議：**先讀「關鍵陷阱」，再讀「目前狀態」**。
> 最後更新：2026-10-07（`lint:wiki` E1–E5 上線＋四項裁決落地與「乾跑」成本實測＋12 支缺詞條＋19 支雙否結構化＋Tier 0 消融重量（§5.4 舊表已註銷）——見「三、目前狀態」頂部四節 10-07；其下為 10-06 embedding 量測與 10-05 批次加入 10 支工具至 746 的快照）

---

## 一、這個專案是什麼

**Tool-Calling** — 一個「找工具、裝工具、用工具」的 AI 工具箱系統。

- 收錄 **748 筆**開源 AI 工具與 Agent 技能（以 registry/tools.json 為準），分為 **18 個領域分類**
- 提供三個入口：**Web 工作台**、**MCP server**、**CLI**
- 核心價值是**檢索**：使用者用自然語言描述需求，系統找出最適合的工具

技術棧：純 Node.js（無框架）、ESM、無外部執行期依賴。

---

## 二、🔴 關鍵陷阱（必讀，這些都是踩過的坑）

### 1. 量測本身會騙人（最重要）

**四次差點得出錯誤結論（最後兩列同為 2026-10-07 第四輪）：**

| 症狀 | 真因 | 檢查方式 |
|---|---|---|
| 評測跑出 50.0%（比基準差） | **API 限流**，成功呼叫只有 29/42 | 一定要看「成功呼叫數」 |
| 評測跑出 61.9%（比基準差） | 用了**不同參數**（topK=20 vs 50），天花板不同 | 比較前確認參數一致 |
| 換了 `--wiki=` 詞檔，數字卻跟對照組一模一樣 | **假開關**：腳本只用載入的詞檔印標頭，打分那路仍自己讀預設路徑 | 拿一份「必定讓結果變差」的錯掛資料跑；數字不動＝開關是假的（2026-10-07 第四輪 §6） |
| grep 回報「全庫沒人 import SDK／express」 | pattern 只寫了**單引號**形式（`from 'express'`），而實際檔案用的是雙引號 | 同一個符號換第二種引號再掃一次，或直接讀那支檔的 import 行（第四輪 §10 就這樣躲過一次假證據） |

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

**v1.3.0 實測（停用 V5）**：direct 天花板 100%、semantic **90.7%**、constrained 98.1%。
**啟用 V5 後**：direct 100%、semantic **96.1%**、constrained 100%——
知識編譯器把 semantic 的召回缺口從 9.3% 縮到 3.9%（見陷阱 17 以下的知識編譯器章節）。

答案不在 top-50 的原因：使用者用日常語言描述**具體應用場景**，metadata 用技術分類描述**通用能力**。
最極端 c111「齒輪的齒數跟模數一改整組尺寸自動跟著變」vs cadquery「參數化 3D CAD 腳本框架」——**bigram 重疊 0**，詞彙檢索原理上不可能找到。

→ **別再假設「描述太短」**：實測 547/705 工具描述 < 60 字，短描述是全庫常態。
→ 剩餘缺口是真實限制，**不建議強修**（補 metadata 會變成針對評測答案調參 = overfitting）。
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

### 20. ⚠️ eval-rerank 預設 topK=20，上線 recallK=30（兩者不一致）

`scripts/eval-rerank.js` 的 `K` 預設是 **20**，
但上線的 `retrieval-fusion.js` 的 `retrieveWithRerank()` 用 `recallK = 30`。

→ 直接跑 `npm run eval:rerank` 得到的數字**低估了上線表現**
   （v1.3.0：top-20 天花板 93.0% vs top-30 天花板 95.7%）。
→ 要量「實際上線表現」必須明確加 `--topK=30`。

ℹ️ recallK 原本是 50，2026-09-20 改為 30：配對 A/B 顯示兩者端到端準確率
   **完全相同**（v1.3.0 皆為 80.4%，差異 0.0pp，McNemar 不一致對 11:11 對稱，p=1.000），
   但 top-30 省 40% token。詳見 `core/retrieval-fusion.js` 的註解。

這與既有的「評測必須與正式路徑一致」原則衝突（同一條原則讓 `buildCandidateText()`
在評測與上線共用）。之所以維持預設 20，是為了與歷史數字可比較；
**引用 rerank 數字時務必標明 topK**。

### 21. 🔴 LLM 的「乾跑提案」不是「寫入內容」，且 prompt 的佔位符會被字面複製（2026-10-07）

- `infer-facets.js` 的 prompt 用 `"[-+]facet:value"` 表達格式，`facet` 在這裡是偽變量；
  模型把它原字抄進輸出（實測 `-facet:scale:streaming`、`-facet:syntax tutorials`），
  整批被 facet 白名單拒收。格式說明改用 `<NAME>:<VALUE>` 這種不會與資料詞彙相撞的佔位符，
  並明寫「Never write the literal word "facet"」。
- `temperature=0` **不等於可重現**：同 19 支、同一份 prompt，dry 與 apply 兩次呼叫的輸出不同，
  甚至翻轉極性（`+platform:seedance 2` → `-platform:seedance 1`；`+language:python` → `-language:python`）。
  「先乾跑看提案」只能驗**格式與管線會不會全滅**，不能當成**寫入內容的憑證**；
  落地後一律回頭讀 `registry/tools.json` 的實際值再引用或寫文件。

---

## 三、目前狀態（頂部一節為 2026-10-09 快照，其下四節為 2026-10-07；再下方舊快照與 2026-09-21 分析結論仍有效，數字已過期）

### 2026-10-09（第一輪）negativeFacets 品質債務清償：改寫 1／刪除 2／撤回 1 條指控，並推翻 §8 的「0／267」口徑

**需求來源**：用戶要求把「未做／待裁」做成一頁可點的選擇題。四項裁決——①本輪範圍＝只做零成本兩項
②facets 品質債務＝逐條覆核後改寫或刪 ③npm audit＝`audit fix` 全套 ④telemetry＝只驗寫入通路。
本節記 ①②；③④各自落稿時再補。

**覆核方法**：逐條比對該工具的 `negativeConstraints` 原文依據句，再對 `core/registry-contract.js:51-57`
的白名單與 `scripts/infer-facets.js` prompt 的 cheatsheet 判 facet 名稱是否用對
（platform＝OS/runtime 表面、interface＝CLI/GUI/API 表面、integration＝外部服務依賴、
format＝檔案／資料格式、scale＝資料量或團隊規模）。**改動前已採完整份 before（benchmark＋ablate），
原始碼未動時採的才作數。**

| 條目 | 依據句（原文） | 判定 |
|---|---|---|
| `remotion -platform:liver streaming` | NC[0]「不適合即時串流直播場景」 | **改寫**為 `-integration:live streaming`。`liver` 是 `live` 的拼字錯→永不命中；且「直播串流」是外部服務依賴不是 OS 表面。同語意在 `ffmpeg` 早已寫成 `-integration:live-streaming`，兩支至此一致 |
| `ffmpeg -interface:intuitive` | NC[2]「不適合非技術用戶的直覺操作」 | **刪除**。`intuitive` 是形容詞，不在 CLI/GUI/API 值域內；且 NC[0] 已由 `-interface:gui` 覆蓋。散文 NC[2] 保留→資訊不丟 |
| `code-review-skill -integration:sole security audit` | NC[0]「不適合作為替代人工安全審計的唯一安全把關手段」 | **刪除**。安全審計不是外部服務依賴，`sole` 是句子殘餘（「作為……的唯一……手段」）。散文 NC[0] 保留 |
| `exercises-dataset -format:biomechanics data` | NC[0]「不適合需要 3D 骨骼動畫或**生物力學數據**的研究」 | **未動**——見下方「撤回」 |

**結果（確定性證據）**
- `registry/tools.json` diff ＝ **3 增／5 刪**（逐字可覆核：`lastUpdated` 1/1、`remotion` 改寫 1/1、
  `ffmpeg` 因尾逗號重排 1/2、`code-review-skill` 刪 1 行）。
- facets 覆蓋 **111 支／293 條**（改寫前現量 295 條）。殘留掃描：`liver` 0、`intuitive` 0、
  `sole security audit` 0、`biomechanics` 1（刻意保留）。
- `node cli.js validate` 0 errors／6 warnings／99.8（不變）；`npm run lint:wiki` E1–E5 與未對基線
  **全 0、exit 0**——再次印證 facets 不在 E1 指紋來源欄位內，**寫入本身不需重建基線**。
- `npm test` exit 0：**382／380 pass／0 fail／2 skip**，九道 ✅ 閘門全綠（本輪未新增測試，
  故 `TEST_STATS` 與 `AGENTS.md` 的測試數區塊不動）。

**量測 A/B（離線免費、同支腳本、先採 before）**

| 尺 | before | after |
|---|---|---|
| `npm run benchmark`（267 題） | fusion 58.0%／63.0%／MRR 0.614；含近義 59.1%／63.8%；direct 68.4%／semantic 50.4%／constrained 61.5%；空集 10/10 | **輸出逐位元組相同** |
| `npm run ablate:v5` | 建議 0.20（天花板 98.4%／top1 58.0%） | **輸出逐位元組相同**，建議仍 0.20 |

**行為級證據（證明改寫真的會扣分，不是只讓檔案整齊）**：記憶體中 A/B——把 `remotion` 的 facets
臨時還原成改寫前的值跑同一查詢，不落盤。

| 查詢 | 舊 `-platform:liver streaming` | 新 `-integration:live streaming` |
|---|---|---|
| 「live streaming 影片」 | 第 3 名／score 0.1191 | **第 20 名／0.0814**（如設計起罰） |
| 「make videos programmatically with React」 | 第 1 名／0.2115 | 第 1 名／0.2115（不誤傷） |
| 「即時串流直播」（純中文） | 不在前 200 名 | 不在前 200 名 |

🔴 **更正一（推翻 §8 的口徑，且是我自己先前報錯的）**：第四輪 §8 宣稱「評測集 267 題裡
`expected`／`alsoAcceptable` 指向這 19 支的題數＝0／267（實測）」。實測 **c07**
「找一份健身動作的資料集，每個動作最好有動畫可以看」（type=direct）的 `expected`
就是 `exercises-dataset`，而它在該 19 支清單內 → 正確口徑是 **18 支零命中、1 支有 1 題**。
根因記錄：評測集的容器欄位名是 **`cases`**，不是 `queries`；我第一次用 `e.queries` 迭代得到
`TypeError: qs is not iterable`。**若那行不報錯，我就會把「0 題」當成實測結果**——
「零命中」型宣稱必須連欄位名一起驗，並拿一個已知數（此處 267）打樁。

🔴 **更正二（撤回 §9 對 `exercises-dataset` 的指控）**：§9 把 `-format:biomechanics data`
列為「格式合法但語意牽強」。覆核後**該指控不成立**——NC[0] 原文明確寫「……或生物力學數據的研究」，
而 format＝檔案／資料格式對得上。該筆**未動**。

**更正三（§6／§9 的覆蓋數已過期）**：文件仍寫「92 支／248 條」，那是 10-07 落地前的值；
落地後現量 111 支／295 條，本輪清償後 111 支／293 條。

🔴 **新陷阱（編入 §二 清單的補遺）：結構化扣分對純中文查詢是盲的**。白名單規定 facet 值只能是
1–3 個**英文**詞，而 `negativePenalty`（`core/agent-retrieval.js:296` 起）走 `core/tokenize.js`
的共享詞重疊——「即時串流直播」與 `live streaming` 重疊為 0，改前改後 remotion 都不在前 200 名
（上表實測）。這是陷阱 4「簡繁 bigram 零重疊」的同族但**性質不同**：簡繁是同一語言的字形差
（`fix-simplified.js` 修得掉），中英是跨語言零重疊（修不掉，除非值欄放中文）。
→ 引用「已結構化」時必須同時講「對哪種語言的查詢生效」；本輪那 1 筆改寫只在**夾帶英文詞的查詢**上有用。

**本輪順手發現、未修的資料缺陷（需裁）**
1. **59 支工具有 `negativeConstraints` 但 `negativeConstraints_zh` 整個欄位不存在**（實測掃全庫；
   而 NC／NCZ **筆數**不對齊者 0 支 → 缺的是整欄，不是部分筆數）。`validate` 的 6 個警告只看 NC
   有無，抓不到 NCZ 缺口；`displayText()`（`core/registry.js:48-54`）只支援
   description／useCase／advantages 三個欄位，NCZ 缺時 UI 直接顯示英文原文。補齊要 `translate:zh`＝燒額度。
2. **`bootstrap-icons` NC[0]「非 Bootstrap 專案需額外整合」有零成本正解：`+ecosystem:bootstrap`**
   （要求值，非排除值——「非 Bootstrap 專案不適合」＝「需要 Bootstrap 生態」）。
   這不需要額度，是極性判讀漏了；§9 把它歸給「等額度」是錯誤分類。
   同族未覆蓋：`code-review-skill` NC[1]、`exercises-dataset` NC[1]／NC[2]。

**下一個人的待裁清單（本輪新增）**

1. ⏳ 上述 2. 的 `+ecosystem:bootstrap` 等 4 條「有零成本正解但未寫入」的覆蓋缺口——要不要補。
2. ⏳ 59 支缺 `negativeConstraints_zh`——要補（需額度），還是明定「NCZ 非必填、UI 顯示英文可接受」。
3. ⏳ 中英零重疊這件事要不要進 §二 正式陷阱清單（本輪先記在本節補遺）。

### 2026-10-07 LLM Wiki（Karpathy gist）對照 ＋ `lint:wiki` 起草（唯讀診斷，未接線）

**問題**：Karpathy 的 LLM wiki gist 能否幫到檢索與配對。
**結論**：gist 的架構本專案**已實作且帶消融實驗**——`docs/LLM-WIKI-BLUEPRINT.md`
就是同一份 Karpathy 概念的 OCR 整理版（標籤 `#AndrejKarpathy`）。逐條對照：

| gist 主張 | 本專案對應 | 狀態 |
|---|---|---|
| 知識該復利、不該每次重推 | `compile-wiki.js` → `compiled-entries.json` → V5 | ✅ 天花板 94.9%→98.1%、top1 +9.4pp |
| 不用 embedding，純文字導航 | L1/L1.5/L2/L3 + PPR 圖譜為預設路徑，V0 向量僅可選 | ✅ |
| `index.md` 精簡目錄 | `mcp-server.js:45-48` `list_tools` 回傳 id/name/category/desc≤200 | ✅ |
| `AGENTS.md` 結構約定 | `scripts/generate-agents-md.js` 全檔生成 | ✅ |
| 信任層 [V]/[S] | `epistemic` 欄位（733 筆全為 Tier 1 → `[S]`） | ✅ |
| **Ingest／Query／Lint 的 Lint** | 缺 → 本次起草 `scripts/lint-wiki.js` 補上 | 🆕 |

**首跑實測（詞條 733／active+experimental 744／全庫 748）**

- E2 幽靈詞條 **1**（`tokentab`）、E3 缺詞條 **12**、E5 高危雙重否定 **20** ＋ 低危 **1**
- E4 腐化 **0**（df 門檻 43）。為排除「靜默綠」：把門檻壓到 maxDf=3 時報出 2 筆腐化
  → **檢查路徑會響**，現行門檻下確實為零。
- E1 漂移 **0** —— ⚠️ 這**不是**「沒有漂移」的證據：來源指紋基線尚未建立，E1 目前恆為 0。

**更正一個口徑錯誤**：先前回報「15/748 缺詞條」。748 含非活躍狀態；實際待補是 **12 支**
（active/experimental），另 3 支屬已停用工具（不該補），還有 1 支是反向問題
（詞條還在、工具已不在庫 → E2）。教訓：**缺詞條要先定義分母是哪個狀態子集**，
`tools.json` 全庫數 ≠ 檢索可見數。

**更正二（同一批數字，這次錯在我的 Regex）**：首報的 E5 高危 **20** 筆含 1 筆誤報——`freetube`
的「無法下載影片離線觀看（非下載工具）」。第 4 條原本寫 `/非.{0,12}(情況|情境|下)/`，那個
**裸「下」**讓「非」直接接上「**下**載」的下，而該句沒有任何否定套疊。已改成
`/非.{0,16}(情況|情形|情境|環境|條件|狀態|場景)下/`（裸「下」必須和前一個詞構成
「情況下／環境下」這類處所式收尾），實測 **20 → 19**，低危 1 不變。
教訓：**修誤報時要同時釘住一個正向案例**，否則收緊 Regex 的過程中很可能順手把檢查修成
靜默綠——新增的 `E5 誤報防線` 測試兩邊一起斷言（「（非下載工具）」不響 ＋ 「非…的情況下」仍響）。

**新增陷阱（編入 §二 清單的補遺）**

- 🔴 **裸跑 `npm run compile:wiki` 修不了來源漂移**：LLM 模式的 targets 過濾掉已是 Tier 1
  的詞條（`compile-wiki.js:287`），漂移那批會被靜默跳過；要用 `--ids=<清單>`（走 `:281-284`）。
- ⚠️ **E1 的指紋複刻了 prompt 的截斷長度**（description 300／capabilities 10／advantages 5／
  negativeConstraints 3／triggers 6），與 `compile-wiki.js:154-163` 是隱性耦合。
  之所以不直接雜湊整筆工具：改到沒進 prompt 的第 12 項 capabilities 也會報漂移 → 誤報淹沒訊號。
- 🔴 **把工具標成 deprecated 不會連帶清掉詞條**：`tokentab` 10-04 轉 deprecated，詞條卻留到
  本次才刪；那段期間每次 lint 都被 E2 擋成 exit 1（E1／E2 屬阻斷級）。deprecate 流程缺一步
  「刪 `compiled-entries.json` 的對應 key」，本次補刪的 diff 是純刪除（0 增／27 刪）。

**驗證（分三層，避免只測夾具）**

1. **腳本重寫不回歸**：整檔重寫＋加路徑覆蓋後，活資料 10 項計數與重寫前**完全一致**
   （733 詞條／744 工具、df 門檻 43、E2=1、E3=12、E4=0、E5=20 高危＋1 低危）。
2. **E1 在活資料上會響**：把 `tools.json` 複製到暫存目錄、只改 `ppt-master` 的 `useCase_zh`，
   用 `--registry=<副本>` 搭真實基線跑同一支腳本 → `drift=["ppt-master"]` 且 exit 1；
   原檔全程未動（事後 `git status registry/tools.json` clean、暫存目錄已清）。
   這層不能省：夾具只有 35 筆合成詞條，指紋視圖是否真的對得上 `compile-wiki.js` 的截斷，
   只有在真資料上才驗證得到。
3. **資料收斂後的終態**：732 詞條、E1=0（基線已建、未對基線 0）、E2=0、E3=12、E4=0、
   E5=19 高危＋1 低危、**exit 0**。

`tests/wiki-lint.test.js` **12 項全綠**；完整 `npm test`：**366 tests／364 pass／0 fail／2 skip**，
七道門禁全綠（`check-syntax` 134 檔、Doc Stats 748、兩道繁體掃描）。
（本檔 10-04／10-05／10-06 快照的 354／352 是這些測試加入前的歷史值，刻意不改寫。）

**新陷阱：批次改字時，「換過去的那個字」也要驗碼位**
為把簡體 `夹`（allow-simplified：此處引用的是錯字本體，換成繁體就失去例證）一次換成繁體，我用 codepoint 替換寫成 `0x5939 → 0x592A`——但 `0x592A` 是
`太`，`夾` 其實是 `0x593E`。三條不變量（改動行數＝命中數、總行數不變、無 U+FFFD）全部通過，
`check-traditional` 也全綠（`太` 本身是合法繁體字），於是 6 處 `太具` 無聲地進了 3 個檔案，
直到人掃文件才發現。教訓：**codepoint 映射要從實字反查（`'夾'.codePointAt(0)`），不能憑記憶寫
hex**；批次改字還需要第四條不變量——拿一個「該字必然出現的已知詞」斷言結果，例如改完後檔內
應能掃到 `夾具`、且 `太具` 為 0（實測：全庫殘留 2 處，都在本段對照引用、非真錯字——
這條掃法會被文件自己引用的反例汙染，判讀時要連行號一起看）。

**文件債已補**：README npm scripts 表 ＋ `docs/WIKI-COMPILER.md` §6.1／§7。
**順帶發現的不一致（待裁，未改）**：AGENTS.md 仍要求「重大變更記錄 DEV_LOG.md」，
但 `DEV_LOG.md` 最後一篇是 2026-09-27，之後 4 次文件提交全落在本檔——
該指引硬編在 `scripts/generate-agents-md.js:198/436`，屬於改產生器而非改文件，故未動。
同檔的 `TEST_STATS`（`generate-agents-md.js:16`，原為 315／313）**已更新並重生成**：
先寫成 365／363，接著為 E5 誤報防線補了第 12 項測試、數字又失效，定稿點重量為 **366／364**。
兩次 diff 都只有 7 行（6 行測試數＋1 行時間戳），工具數／star 數區塊完全沒變，
所以沒有把 cron 的浮動數字混進這次文件變更。該常數的註解本來就寫「改動測試後在此更新即可」，
走的是既有慣例、不是新流程。⚠️ 教訓：**測試數是自引用活數**——只要還會補測試，AGENTS.md
的數字就注定過期，必須放到最後一步再重量＋重生成。
**仍待裁**：DEV_LOG 那條指引本身（繼續用 HANDOFF 取代 DEV_LOG，還是把 DEV_LOG 寫回管線）
沒有決定 → 已裁定「改產生器」，落實在下方「2026-10-07（第二輪）」。

**下一步**

1. ✅ **已完成**：證明 E1 不是靜默綠。`tests/wiki-lint.test.js` 用子行程跑**同一支腳本、
   同一套判定**（靠 `--registry`／`--wiki`／`--baseline` 指向暫存目錄夾具，不 mock、不複製邏輯）：
   正向——改 `useCase` → `drift=['tool-03']` 且 exit 1；兩個不誤報反例——改 `stars`
   （nightly cron 的欄位）與改第 12 項 `capabilities`（超出 `slice(0, 10)`）→ `drift=[]`；
   無基線時必報 `baselineExists:false`，而不是宣稱 `drift:0`。基線由被測腳本自己
   `--update-baseline` 產生，測試裡不重述 hash 邏輯。E4 另有一組：35 筆詞條共用同一句
   萬能詞 → 恰 3 筆腐化（dropped=1／kept=1）、其餘 32 筆不誤報。
2. ✅ **已完成**：`--update-baseline` → `registry/wiki-lint-baseline.json`（732 筆指紋，
   `tokentab` 已不在詞檔所以自然排除）。**時效成本照舊**：漂移只能從此刻往後偵測；
   之後每多一次 enrich/add/translate 提交，就多永久隱藏一部分更早的變動。
3. ✅ **已完成**：刪 `tokentab` 幽靈詞條 → E2 歸零、lint **exit 0**（詞檔 733 → 732）。
   順帶把「deprecated 工具不會自動掉詞條」寫進上面的陷阱清單。
4. ⏳ 19 支高危雙否（`infer-facets.js --ids=…`）與 12 支缺詞條（`compile:wiki`）**當一批做**，
   共用一次測量週期：兩者都動 wiki 語料 → `df` 與共現圖改變 → `V5_WEIGHT=0.20` 作廢，
   需重跑 `ablate:v5` ＋ `benchmark`。拆兩次做就得量兩次。
   （要 `AGNES_API_KEY`、花額度，**尚未經核准**；做完必須連基線一起 `--update-baseline` 重建，
   否則新編譯的詞條落在基線外，「未對基線」會非零。）

### 2026-10-07（第二輪）四項裁決落地 ＋ 「乾跑」實測推翻了對 item 4 的成本假設

**本輪性質**：上一節 push 後，依四項裁決執行。除治理檔與本檔外**沒有任何寫入**。

**裁決與執行**

| 裁決 | 動作 | 結果 |
|---|---|---|
| ① 現在 push | `git push origin main` | `bf69ba0..48ab756 main -> main` ✅ |
| ② 先乾跑看提案 | `infer-facets.js --dry`（19 支雙否）＋ Tier 0 詞條預覽（12 支缺詞條） | 見下方實測，**成本假設被推翻** |
| ③ 不動，維持 0.20 | `V5_WEIGHT` 零改動 | 消融建議值 0.15 **未採**，程式碼未動 |
| ④ 改產生器、寫 HANDOFF | `scripts/generate-agents-md.js` 的 DEV_LOG 指引改指本檔 | 見下方「治理改道」 |

**②的實測（19 支高危雙否，`infer-facets.js --dry --ids=…`，model=agnes-2.5-flash）**

摘要：**成功 8／全遭門禁剔除 1／空輸出 1／API 失敗 9**。9 支全在同一句話上失敗：
`HTTP 429: You've reached the API rate limit for free users`（free 層額度，非本專案的併發設定問題）。

8 支提案（`[-+]facet:value`）：

- `remotion`：`-interface:live-streaming`、`-interface:gui`、`-scale:4k-8k`
- `ffmpeg`：`-interface:cli`、`-interface:gui`
- `exercises-dataset`：`-format:3d`、`-ecosystem:fitness`、`-platform:medical`
- `opencode-acp`：`+ecosystem:opencode`、`-integration:other-context-management`（另丟棄 1 筆不合格）
- `phosphor-icons`：`+format:svg`、`-scale:many-choices`、`+scale:varies-import`
- `bootstrap-icons`：`-platform:desktop`（另丟棄 1 筆不合格）
- `agents-course`：`-integration:ml`、`+integration:agent`、`+language:python`、`+language:english`
- `hugagentos`：`-scale:small`、`+ecosystem:ontology`

`adhd` 被**整批**剔除的原因值得記：模型把 schema 的佔位名當欄位名輸出成
`+facet:language:programming`（facet 位址填了字面上的 `facet`），格式門禁如設計擋下。
這是模型輸出形態問題，不是門禁誤報。

**🔴 新陷阱：本專案的「乾跑」有兩種相反的コスト語意**

- `compile-wiki.js --dry`（LLM 模式）：在呼叫模型**之前**就 `process.exit(0)`，只印目標數 → 零成本。
- `infer-facets.js --dry`：預設不寫入 registry，但**照樣逐支呼叫 LLM** → 會燒額度，本次就撞上 429。

我先前把前一者的行為當成兩支腳本的共通前提，於是回報「乾跑是免費預覽」。這是**錯誤前提**，
且直接影響 ② 的裁決品質（他選「先看提案」正是為了不花額度）。規則：**同名動詞（乾跑／試跑／
`--dry`）跨腳本不保證同義，引用成本前必須讀到 exit 點與 fetch 點各自的行號**。

**12 支缺詞條：`--offline --dry` 看不到提案本體，要靠 OUT_PATH 改指的副本**

`--offline --dry` 實測（1 秒、exit 0、`registry/compiled-entries.json` 的 `git status`＋`--numstat` 皆空）：

```
Tier 0 規則式編譯：12 筆
鑑別力守門：剔除 2 句低鑑別力 intent（df 門檻 44/744）
[dry] 範例詞條：
  ppt-master: […]   graphify: […]
```

- 🔴 `[dry] 範例詞條` 印的是 `Object.entries(out.entries).slice(0, 2)`，而 `out.entries` 從既有詞檔
  讀入 → 前兩筆是**既有條目**（`ppt-master`／`graphify`），**不是本次 12 支 targets**。乾跑能看到計數，
  看不到提案本體。
- 要看本體只能做一件事：把 `compile-wiki.js` 的 `OUT_PATH`（硬編碼，`:63`，無 `--wiki=` 覆蓋）
  改指向暫存檔，在 `scripts/` 內跑一份副本（相對 import 才解得開），跑完即刪。本輪即用此法。
- ⚠️ **預覽副本必須用真詞檔 seed**：暫存檔不存在時，守門的分母掉成本次targets 12 筆
  → `df 門檻 2/12`、**剔除 0 句**；seed 真詞檔後才是 `44/744`、**剔除 2 句**。未 seed 的「0 剔除」是假綠。

**Tier 0 的品質代價（這是 item 4 還沒做的真正原因，全部實測）**

預覽產物（已過守門）744 筆中 tier0=12／tier1=732：

| | 筆數 | intents | 無中文（純 ASCII）的 intent |
|---|---|---|---|
| 既有語料 | 732 | 2636 | **0（0.0%）** |
| Tier 0 新增 | 12 | 47 | **33（70.2%）** |

那 33 句的內容是工具 id 自我重複＋`triggers` 原詞（`quilt`、`design-tool`、`awesome`、`video`、
`deepseek`、`clash-meta`…）。`compileOffline()` 完全不做 `isGenericIntent()` 過濾，守門也只按
**文件頻率**剔除，因此 `df` 低的裸詞全部存活 → E3 歸零的代價是把 33 句「非需求語句」灌進 V5 索引。
反過來若加「必須含中文且 ≥8 字」的過濾：47 → **13** 句，其中 **5 支只剩 1 句**，而既有語料的形態是
平均 3.60 句、最少 2 句、**1 句的 0 筆**。混合來源（`useCase` ＋ 中文 `description`）可讓 **7/12** 達 2 句，
另外 5 支的 `description` 本身就是英文（近重複 0 筆），所以混合也補不齊那 5 支。

**治理改道（裁決④）**

- `scripts/generate-agents-md.js` 的 DEV_LOG 指引**有 3 處**，不是本檔先前寫的 2 處；三處都改，
  並新增「歷史歸檔 (DEV_LOG.md)」區塊，說明 2026-09-27 之後的記錄落在本檔。
  ⚠️ 教訓：文件裡「某檔有 N 處」這種計數，動手前必須重掃一遍。
- `AGENTS.md` 走 `npm run agents:init` 重生成（不手改），diff 只含治理行＋時間戳。
- 產生器自報的測試數（`TEST_STATS`）在本輪定稿點重量為 **366／364／2 skip**。
- 金鑰只做**存在性**檢查（長度 51），值從未讀出。
- ⚠️ push 時 GitHub 回報：預設分支有 **5 個中危 Dependabot 漏洞**，尚未開單處理（本輪未動依賴）。

**繁體閘門的實際覆蓋率（本輪實測，不是宣稱）**

`check-traditional` 的偵測器是 `fix-simplified.js` 的 `findSimplified()`，而本機 **opencc 未安裝**
（`usingOpenCC()=false`），跑的是內建備援表。拿 20 個常用簡體字探它：**抓到 15 個**，未抓到的 5 個
碼位是 `U+79BB`／`U+91CC`／`U+7CFB`／`U+4E8E`／`U+540E`。其中四個屬**刻意豁免**（這些字形在繁體裡
本身合法，例：中文「系」、單位「里」），只有 `U+79BB`（「離」的簡體形）是**真缺口**。

本輪我在同一節手寫出 6 個簡體字，閘門抓到 5 個（`check:lang` 一次報出其中 3 個），
**唯一它報不出來的那個正是 `U+79BB`**，由人工掃字抓到。教訓：備援表回報「✅ 未發現簡體字」
只代表「表內那些會響」，**不能當成繁簡全覆蓋的憑證**；要全覆蓋得裝 opencc。

**item 4 現況（從「未核准」改成「證據已到位，待重新裁」）**

原計畫把 19 支雙否與 12 支缺詞條當一批做，理由是兩者都動 wiki 語料 → `df` 與共現圖改變 →
`V5_WEIGHT=0.20` 作廢、需重跑 `ablate:v5`＋`benchmark`（一輪約 42 秒＋226 秒，皆離線免費）。
本輪把成本量清楚了：

1. **雙否那 19 支需要 LLM**，而 free 額度已 429；9 支提案因此取不到，短期內只能等額度重置或改走人工。
2. **缺詞條那 12 支不需要 LLM**，但 Tier 0 未過濾會灌 33 句裸詞、過濾後有 5 支只剩 1 句 → 兩邊都偏離語料形態。
3. 兩者都動語料 → 一旦落地就必須重跑 `ablate:v5`＋`benchmark`＋`--update-baseline`（基線不重建，新詞條會落在基線外）。
   → **本節的缺詞條一半已於下方「第三輪」落地**（12 支寫入、E3 歸零）；雙否那半仍等額度。

### 2026-10-07（第三輪）12 支缺詞條落地：Tier 0 改成只收整句 ＋ A/B 全在 ±1 筆內

**裁決**：缺詞條走「混合來源＋過濾後寫入」；19 支雙否「等額度重置一次跑完」；`b21e8c2` 暫不 push。

**實作（`scripts/compile-wiki.js`）**

- `compileOffline()` 的 `intents` 改成**只收整句**：依序取 `useCase_zh` → 中文 `description` →
  含中文且 ≥8 字的 `triggers`，前 24 字相同視為近重複只留一句，上限 4 句。
- 沒有整句來源就**跳過不寫**，而不是寫一筆空 `intents`——後者會讓 E3 假性歸零。
- 新增 `--out=`／`--registry=` 路徑覆蓋（與 `lint-wiki.js` 同形）。這是本輪能寫測試與預覽的前提：
  在此之前要看 Tier 0 提案本體，只能複製整支腳本改硬編碼的 `OUT_PATH`。

**落地結果（寫入 `registry/compiled-entries.json`，numstat 312 增／2 刪，2 刪是 generatedAt＋generatedBy）**

- 詞條 732 → **744**；12 筆共 **22 句**、**純 ASCII 0 句**（若沿用未過濾的舊實作會是 47 句、33 句 ASCII）
- 形態：7 筆有 ≥2 句（其中 `compositor` 4 句、`clash-verge-rev` 3 句），**5 筆只有 1 句**
  （`claude-howto`／`quilt`／`voicestudio`／`awesome-vibecoding-guide`／`ollama`——它們的
  `description` 本身是英文，中文整句只剩 useCase 一條來源）
- `--stats`：有 intents **744/744**（原本 732/744）、信任標記 S=732／V=12、
  知識圖譜 2391→**2427** 節點、3138→**3161** 條邊
- 最終 `lint:wiki`：E1 0／E2 0／**E3 0**／E4 0／E5 19 高危＋1 低危／未對基線 0，exit 0
  （基線已 `--update-baseline` 重建為 744 筆，時間戳 2026-10-07T10:58:12Z）

**驗證分三層**

1. **注銷測試（mutation）**：把 `isSentenceIntent` 換成 `() => true` 後跑新測試檔 →
   **T1／T2／T4 三項轉紅**，證明這三項真的掛在過濾邏輯上；還原後與備份 **md5 相同**
   （`8a33b0c3…1092`）、8/8 復綠。另外 5 項在關掉過濾後仍綠，代表它們守的是別件事
   （句數上限、近重複去重、`--out` 的路徑隔離、非目標詞條不被動）。
2. **確定性覆蓋**：上面的 `--stats` 744/744 與 lint E3=0——這才是「12 支已可被 V5 命中」的證據。
3. **量測 A/B**（同支腳本、同一 267 題、離線免費、先採完整 before 再動手）：

| | before（732 詞檔） | after（744 詞檔） | 換算成筆數 |
|---|---|---|---|
| `ablate:v5` 建議 | **0.15**（w=0.2 天花板 98.1%／top1 57.6%） | **0.20**（w=0.2 天花板 98.4%／top1 58.0%） | top1 +1 筆／267 |
| benchmark fusion Hit@1 | 58.0% | 58.0% | 0 |
| fusion Hit@3 | 63.4% | 63.0% | **−1 筆／267** |
| fusion MRR | 0.616 | 0.614 | — |
| 含近義 Hit@3 | 64.2% | 63.8% | **−1 筆／267** |
| 分組 semantic Hit@3 | 56.6% | 55.8% | **−1 筆／129** |
| agent 引擎 Hit@1 | 57.6% | 58.0% | +1 筆／267 |
| 空集誠實率 | 10/10 | 10/10 | 0 |

`direct`／`constrained` 兩組完全不動。**所有移動都是 ±1 筆**，屬雜訊級、淨中性；
`V5_WEIGHT` 依裁決③維持 0.20，程式碼零改動，而新詞檔的消融建議值剛好也是 0.20（不必開新待裁）。

🔴 **本輪最重要的口徑**：評測集 267 題裡**沒有任何一題**的 `expected`／`alsoAcceptable`
指向這 12 支工具（實測 0／267）。所以這次改動**在 benchmark 上不可能顯示改進**，它只承擔
顯示回歸的功能；「分數沒動」絕對不能讀成「補詞條沒用」。要證明有效就看確定性那兩個數
（`--stats` 744/744、lint E3=0），別拿 267 題的 ±1 筆硬講故事。

**文件同步（含一處由文件自己害我的錯）**

- `docs/WIKI-COMPILER.md`：§3.1 改成「只收整句」＋附實測根據；§7 三列（詞檔 744／基線 744／
  新增 `tests/wiki-compile-offline.test.js` 8 項）、`wiki-lint` 11→**12** 項、`wiki-matcher` 19→**20** 項
  （後兩者是既有文件早就過期，本輪順著實測更正）。
- 🔴 §8 用法區原本把 `--dry` 註解寫成「**先看 prompt**」——這正是我上一輪誤信「乾跑能看到提案」的來源。
  實測 `--dry` 只印目標數，已連同「`--offline --dry` 的範例詞條印的是既有條目」一起寫進文件。
- §5.4／§5.5 的 Tier 0 消融數字標明屬「未過濾時期」，現行實作下**未重量**，引用前要重建。
  ✅ 已於第四輪 §6 重量（先給 `scripts/v5-ablate.js` 加 `--wiki=`），`docs/WIKI-COMPILER.md` §5.4／§5.5
  整節換掉，舊表那句「0.10 天花板不降反升」已註銷。
- README 詞檔筆數 732 → 744（並註明 Tier 1 732＋Tier 0 12）。
- `TEST_STATS` 於定稿點重量為 **374／372／2 skip**（`npm test` exit 0、九個 ✅ 閘門全綠），
  `AGENTS.md` 重生成 diff 為 7 增／7 刪＝6 行測試數＋1 行時間戳，工具數／star 數區塊未動。

**下一個人的待裁清單**

1. 19 支高危雙否：等 free 額度重置後 `infer-facets --dry --ids=<19>` 一次收齊再 `--apply`
   （已到手 8 支的提案內容記在上一節；落地後同樣要重跑 `ablate:v5`＋`benchmark`＋`--update-baseline`）。
   ✅ 已於下方「第四輪」落地（E5 高危 19→0；8 支的舊提案內容已被 apply 時的實際值取代，見該節 §2）。
2. `b21e8c2` 與本輪 commit 是否一起 push。
3. 那 5 筆只有 1 句的 Tier 0 詞條：要留著（E3 已歸零），還是等 Tier 1 額度時重寫成 2~4 句。
   ✅ 第四輪 §9 已查完：素材在 `advantages_zh`，但那是「這是什麼」語域，建議不納入來源集——變成待裁①。
4. §5.4 的 Tier 0 對照數字要不要重量（現在是已知過期、標了警告）。
   ✅ 第四輪 §6 已重量（先給 `v5-ablate.js` 補 `--wiki=`），§5.4／§5.5 整節換掉，舊表已撤。

### 2026-10-07（第四輪）19 支高危雙否落地：根因是 prompt 的佔位符被模型字面複製

**做了什麼**：把 19 支「散文雙重否定」工具抽成結構化 `negativeFacets`（裁決：額度重置後一次跑完），
順手修掉造成整批失敗的 prompt 缺陷、收緊一道門禁，並修正 3 筆「極性反轉」的寫入。
其後補完第三輪留下的兩項：重量 §5.4 的 Tier 0 消融（`v5-ablate.js` 加 `--wiki=`，過程中抓到一個
只改標頭不改打分的假開關），以及查清 5 支單句 Tier 0 詞條的素材到底在哪（結論見 §9）。

#### 1. 根因：`facet` 是偽變量，模型會原字複製

`infer-facets.js` 的 prompt 把格式寫成 `Each string is "[-+]facet:value"`，而 `facet` 在這裡是**佔位符**，
不是白名單詞。模型把它抄進輸出：實測 `-facet:scale:streaming`、`-facet:syntax tutorials`
→ 白名單檢查拒絕 → 該工具「全部條目不合格」。上一輪 8 支乾跑折損 1 支、這一輪 remotion／adhd
兩支全滅，都是同一個原因。**改法**：佔位符改成 `<NAME>`／`<VALUE>`，把 10 個白名單名稱獨立成
一行「MUST be copied verbatim」，並補一條「Never write the literal word "facet"」。
驗證方式：同一對工具（remotion, adhd）改前 2/2 全滅 → 改後 2/2 合格（2 次 API 呼叫）。

#### 2. 🔴 陷阱：`temperature=0` 不保證可重現，dry 的提案≠apply 的寫入

19 支乾跑清單與隨後 `--apply` 實際寫入的內容**不同**（19 支裡多數有差異，且含極性翻轉：
seedance2-skill 乾跑是 `+platform:seedance 2`，寫入變成 `-platform:seedance 1`；
adhd 乾跑 3 條 `+`，寫入變成 `+integration:agent`／`-interface:medical`）。
所以**落地後必須回頭讀 `registry/tools.json` 的實際值**，引用乾跑清單會把不存在的資料寫進文件。

#### 3. 3 筆極性反轉已修（依據句逐條列在這裡，易於覆核）

| 工具 | 寫入值（錯） | 依據句（原文） | 修正 |
|---|---|---|---|
| `ai-agents-for-beginners` | `-language:python` | 不適合非 Python 開發者，大部分範例以 Python 為主 | `+language:python` |
| `ai-agents-for-beginners` | `-format:course` | 本質是學習課程而非可安裝套件 | `+format:course` |
| `ant-design-icons` | `-ecosystem:ant design` | 非 Ant Design 專案需額外適配 | `+ecosystem:ant design` |

這三筆留下的後果比散文雙否**更糟**：`core/agent-retrieval.js:291-296` 對有 facets 的工具
「一律以結構為準」，等於把工具自己的核心需求寫成扣分項。修正只做一件事——翻極性符號，
facet 與 value 原封不動，並用 `loadRegistry`／`saveRegistry` 寫回（不手改 JSON 字串）。

#### 4. 門禁收緊：`not` 與連字號後的 `non-` 原本是漏網的

舊規則 `/(^|\s)non-/i` 抓不到「獨立字 not」（`-ecosystem:not bootstrap`）與
「連字號後的 -non-」（`-language:backend-non-frontend`）。收緊前先量既有資料：
現況 92 支工具／248 條 facets 中，值內含否定詞的 **0 筆** → 收緊不會讓已 blessed 的資料轉紅
（實測 `node cli.js validate`：0 errors／6 warnings／99.8）。
新規則 `/(^|[\s.\-])(?:non-|not|without)\b/i`。

- 測試 `tests/negative-facets-contract.test.js` 9 → **12 項**：兩個漏網正例＋一個
  「note／cannot 不被誤殺」的對照組（`\b` 與前置字元類別就是為了不誤殺 `note-taking`、`cannot-fit`）。
- ⚠️ 刻意維持的相容點：新錯誤訊息仍含子字串 `non-`，所以既有第 9 項 `includes('non-')` 不必改。

#### 5. 順手修掉一個「E1 對 Tier 0 假綠」的缺陷（上一輪自己留下的）

`lint-wiki.js:89` 的 `fingerprintSource(tool, tier)` 對 Tier 0 走另一個視圖，但那個視圖
與 `compileOffline()` 的實際來源**不同步**：`description` 完全沒進視圖、`triggers` 只取到 4
（編譯器取 6）。後果是實測的——**12 支 Tier 0 詞條裡有 7 支的 intents 收了 description 句**，
而改了那欄 E1 不會報。這是上一輪把 description 加進 Tier 0 來源時漏改的另一邊。

- 修：視圖補 `description`、`triggers` 改 `slice(0, 6)`，與 `compile-wiki.js:122-126` 對齊。
- 注銷驗證（把 `lint-wiki.js` 還原成 HEAD 版跑同一批測試）：**兩條新的「該響」測試轉紅、
  「第 7 個 trigger 不該響」的對照仍綠**（13 pass／2 fail），還原後 15/15 全綠。
  這證明測試掛在真實耦合上，不是自證。
- 代價（如實記）：指紋定義一變，12 支 Tier 0 的指紋全數不符 → `lint:wiki` 一度報
  **E1=12**（不是資料變了，是尺變了），`--update-baseline` 重建後回到 0。
  基線 diff = 13 行（12 支 Tier 0＋`generatedAt`），與預期一致。
- 邊界刻意保留：視圖仍不含 `stars`（cron 每晚改），也不覆蓋第 7、8 個 trigger——
  兩條「不該響」的測試就是把這道邊界釘住。

#### 6. 重量 §5.4 的 Tier 0 消融：順手抓到 `v5-ablate.js` 的靜默假量測

第三輪留下的待裁項（「§5.4 仍屬過期；需先給 `scripts/v5-ablate.js` 加詞檔路徑覆蓋」）本輪做完。

- 先補尺：`v5-ablate.js` 加 `--wiki=<路徑>`（預設仍是 `registry/compiled-entries.json`），
  才能拿一份純 Tier 0 詞檔去量。建詞檔用 `npm run compile:wiki -- --offline --out=<暫存>`，
  `--out` 不碰正式版（見 `docs/WIKI-COMPILER.md` §6 的 seed 警告）。
- 🔴 **改動前腳本是假開關**：`run()` 從未把載入的詞檔傳給 `agentRetrieve`，它自己讀預設路徑
  → 換 `--wiki=` 只改了標題那一行，數字量的還是正式版。修法是在 `agentRetrieve` 的 opts 裡
  一路傳 `wiki`（`core/agent-retrieval.js` 端 `wiki === undefined ? loadWikiCached() : (wiki || null)`）。
- ⚠️ **中性與有效性是兩件事，要分開證**：
  ①**中性**（改動沒動到現行行為）＝`--wiki=registry/compiled-entries.json`（明確指正式版）
  與不加參數跑同組權重，兩份輸出**只差「來源：…」那一行標頭**（一個列相對路徑、一個列解析後的
  絕對路徑），天花板／平均排名／top1／三個類型欄逐字相同。
  ②**有效**（flag 真的進打分）＝①本身證不了——flag 若被無視，輸出也會一樣。靠的是下面的錯掛夾具。
  拿①當②的證據，就是「0 殘留」型假綠。
- 反例夾具（`tests/v5-ablate-wiki-flag.test.js`，2 項）：把 261 筆詞條「錯掛」——第 i 題的 query
  接到第 i+1 題的 expected 工具上。flag 若沒接進打分，錯掛與正確詞檔的數字會一致；實測
  錯掛 top1 **21.0%** vs 基線 **50.6%**（會變差才算真的讀到）；單次子行程實測 30.7 秒，
  是整套 `npm test` 裡最貴的一筆（同輪量過 41.6 秒與 86.6 秒兩種總時長，震盪來自機器負載而非這支測試）。
- 重量結果（v1.3.0／267 題，寫進 `docs/WIKI-COMPILER.md` §5.4／§5.5）：現行 Tier 0
  **沒有任何權重**能讓天花板不降（舊表「0.10 讓天花板 95.0%→95.6%」是未過濾時期，已整節撤掉）；
  top1 最好 54.1%（w=0.10）但天花板 96.9%→94.9%。Tier 1 仍是 0.20（天花板 98.4%／top1 58.0%）。
  ⚠️ `npm run benchmark` 那張表**仍未重量**：要接詞檔覆蓋得動 `core/retrieval-fusion.js`（生產路徑），
  為一個文件數字不划算——已在文件上明寫「未重量」，不留假數。
- 文件同步：`docs/WIKI-COMPILER.md` §5.4／§5.5 整節重寫（舊表註銷）、§6 加 `--wiki=` 用法與
  「只改標頭」的警告、§7 檔案清單補 `scripts/v5-ablate.js` 與 `tests/v5-ablate-wiki-flag.test.js` 兩列。

#### 7. 結果（確定性證據）

- `lint:wiki`：E5 高危 19 → **0**、低危 1 → **20**；E1–E4／未對基線全 0，exit 0。
  寫入 `negativeFacets` **本身不需重建基線**（facets 不在 E1 的指紋來源欄位內，實測 E1=0）；
  需要重建的是 §5 的指紋視圖修正——兩個動作的基線影響要分開講，別混成一件事。
- 一筆 API 層失敗（`evidence-dev-evidence`：JSON parse error）重跑單支後成功，19/19 全落地。
- `node cli.js validate`：0 errors／6 warnings／平均品質 99.8。
- `npm test` exit 0：**382 tests／380 pass／0 fail／2 skip**（本輪新增 8 項＝
  `negative-facets-contract` 9→12、`wiki-lint` 12→15、`v5-ablate-wiki-flag` 新檔 2 項；374＋8=382，與總數自我吻合）。
  最後一次完整重量是在 §6 的 `--wiki=` 程式改動與新測試檔落地**之後**做的——本輪途中還讀到過
  380/378 與 377/375 兩個較舊的數，引用時以本行 382/380 為準。此後只再動文件；文件改完在提交前
  重跑一次 `npm test`（含繁中字守門）才算數。
  `TEST_STATS` 已同步；`AGENTS.md` 重生成 diff = **8 增／8 刪**＝6 行測試數＋1 行
  `最後更新: 2026/10/6 → 2026/10/7`（`saveRegistry` 更新了 tools.json 的 `lastUpdated`，
  產生器把這個日期取自 registry，不是手改）＋1 行 ISO 時間戳。
  ⚠️ 數 `-` 行時注意：`- [ ] 所有測試通過 (…)` 在 diff 裡長成 `-- ` 開頭，用
  `grep -c "^-[^-]"` 會少算一行——這一輪的 8/8 與 7/8 之爭就是這樣來的。
- 🔴 **順手撤銷自己寫錯的一條歸因**：`/tmp` 的 `wiki-bad-*` 空目錄原本記成「被中斷的 run 留下的」，
  實測發現是 `tests/wiki-matcher.test.js:53` **每次 exit 0 都漏一個**（只 `unlinkSync` 檔案、不刪
  `mkdtempSync` 的目錄）。證據是時間戳：今日新增的 21:18／21:30／21:33 三個目錄，正好對應本輪三次
  全綠的 `npm test`。改成 `rmSync(dir, {recursive, force})` 後重跑該檔：250 → 250（不再成長），
  測試仍 20 項全綠。歷史殘留的清理因此從「撿破爛」變成「一次核准刪 250 個空目錄」。
- 🔴 **連 commit message 都在門禁範圍內（本輪踩了兩次）**：`tests/check-traditional.test.js:184` 會拿
  `check-traditional.js` 檢查 `HEAD~1..HEAD` 的**提交訊息**。上一筆 `b32059d` 的 body 把「經」打成簡體形、
  又多打一個「依」字，讓整串 `npm test` 轉紅。本專案禁 rebase／stash（陷阱 12）、也不改已提交的
  message，所以解法是**下一筆用字正確**（檢查範圍往前移一格），歷史那筆留檔並在此記帳。
  - ⚠️ **同一天復發**：寫 §10 那筆 `6c959e7` 又中了兩個字（「口徑」的「徑」與「改寫」的「寫」打成簡體形）。
    兩個錯字都落在 **body** 而不是標題（標題每輪都會重讀一遍，body 寫完就直接送出）。
  - 🔴 **commit 訊息沒有預檢這回事，除非你先把訊息落成檔**：`--commits` 掃的是 `HEAD~1..HEAD`，
    **一定要 commit 之後**才測得到，所以它的真實角色是「事後讓 `npm test` 轉紅」，不是攔在送出前。
    實測過三條自以為可用的預檢路徑，只有一條成立（下方為各次實測的 exit code）：
    1. ❌ `--full <倉庫外路徑>`：印「⚠️ 路徑不存在，已跳過」→ **仍 exit 0**，整條綠是空的。
    2. ❌ `--full scratch/msg.txt`：`SCAN_EXTENSIONS`（`scripts/check-traditional.js:69`）只有
       `.js/.mjs/.cjs/.ts/.md/.html/.json`，`.txt` 不在內 → 自報「整檔掃描 **0 個檔案**」exit 0。
    3. ✅ `--full scratch/msg.md`：把訊息寫成**倉內 `.md`** 再掃，實測抓到 2 字、exit 1，
       接著 `git commit -F scratch/msg.md`，才算真的有提交前閘門。
    ⚠️ 這三條都是同一支尺、只差 argv 的結果，再次印證「引用驗法要連 argv 一起貼」。

#### 8. 量測口徑：這批改動在 benchmark 上「不可能顯示改進」

評測集 267 題裡 `expected`／`alsoAcceptable` 指向這 19 支的題數＝**0／267**（實測）。
所以 `ablate:v5` 與 `benchmark` 只能承擔**測回歸**的角色：

| | 前一輪（744 詞檔、尚未寫 facets） | 本輪（已寫 20 支 facets） |
|---|---|---|
| `ablate:v5` 建議 | 0.20（天花板 98.4%／top1 58.0%） | 0.20（天花板 98.4%／top1 58.0%） |
| benchmark fusion Hit@1／Hit@3／MRR | 58.0%／63.0%／0.614 | 58.0%／63.0%／0.614 |
| 含近義 fusion Hit@3 | 63.8% | 63.8% |
| semantic Hit@3（129 題） | 55.8% | 55.8% |
| 空集誠實率 | 10/10 | 10/10 |

**全部零移動**＝無回歸；不可讀成「補 facets 沒用」。真正證明本輪有效的是確定性那兩個數
（E5 高危 0、validate 0 errors），結構化扣分路徑本身由 `tests/negative-facets-penalty.test.js` 守著。

#### 9. 留下的品質債務（未修，需裁）

- 「格式合法但語意牽強」的寫入：`-platform:liver streaming`（拼字錯 → 永不命中，屬無效雜訊）、
  `-interface:intuitive`、`-scale:audit`、`-format:biomechanics data`。
- 3 支的依據句語意未被覆蓋：`bootstrap-icons` 的「需要 bootstrap」被新門禁擋掉後只剩
  `-platform:desktop`；`code-review-skill`、`exercises-dataset` 同理。
- 5 支只有 1 句的 Tier 0 詞條（claude-howto／quilt／voicestudio／awesome-vibecoding-guide／ollama）
  **素材確實存在，但語域不對**（本輪量過）：把 `advantages_zh` 暫時併入 `compileOffline()` 來源集、
  跑 `--offline --out=<暫存檔>` 後立刻還原原始檔 → 12 支 Tier 0 有 **11 支**的 intents 直達上限 4 句。
  但收進來的是工具中心的優惠散文（claude-howto 新第 2 句＝「提供可立即複製貼上的生產級配置範本
  （如 CLAUDE.md、鉤子腳本、MCP 設定）…」），正是 §2「詞彙鴻溝」要消滅的「這是什麼」寫法，
  不是使用者的「我想達成什麼」。→ 建議**不納入**來源集；要補就等 Tier 1。

#### 10. npm audit 影響面報告（裁決③：只量不修，2026-10-07）

裁的是「先弄清楚暴露面，再決定要不要動受保護的 `package-lock.json`」。以下全部是本輪實測。

**依賴鏈（`package-lock.json` 反查）**

| 套件 | 嚴重度 | 版本 | 誰拉進來的 | 直接依賴？ |
|---|---|---|---|---|
| `proxy-addr` | **critical**（IPv4-mapped IPv6 trust subnet 的 IP 欺騙） | 2.0.7 | `express@5.2.1` | 否 |
| `@modelcontextprotocol/sdk` | **high**（OAuth client 可能把憑證送給 server 選的授權伺服器） | 1.30.0 | root | 是 |
| `fast-uri` | moderate（percent-encoded octets 的主機大小寫不一致） | 3.1.7 | `ajv@8.20.0` | 否 |
| `ip-address` | moderate（上游 4 條：subnet 比對跨家族、Address6 診斷無長度上限、isLinkLocal 範圍錯、NAT64 未識別） | 10.5.0 | `express-rate-limit@8.6.0` | 否 |

**可達性實測（這才是「要不要急」的關鍵）**

- 全庫只有 `mcp-server.js:3-4` 用到 SDK，而且只 import `server/mcp.js` ＋ `server/stdio.js`；
  載入這兩條後 `process.moduleLoadList` 共 158 個模組，**express／proxy-addr／ajv／fast-uri／
  ip-address 零命中**——弱點鏈的程式根本沒進到執行途徑裡。
- HTTP 入口是 `web/server.js:1` 的 `node:http`（不是 express），加上本專案的 `isTrustedOrigin`
  本機安全模型，`proxy-addr` 那條「要開啟 trust proxy 才走得到的 IP 欺騙」沒有可觸發的路徑；
  SDK 那條 high 是 OAuth 流程，我們走 stdio，同樣碰不到。
- 🔴 這裡我差點報了假證據：第一次 grep `from 'express'`／`require('express')` 得到「全庫零命中」，
  我幾乎要寫成「沒人 import SDK」；實情是 `mcp-server.js` 用的是**雙引號** import，pattern 的引號
  形式決定了命中與否。已把這條收進 §二 陷阱 1 的表格。

**`npm audit fix --dry-run`（未寫入；`git status package-lock.json` 實測 0 變更）**

proxy-addr 2.0.7→2.0.8、ip-address 10.5.0→10.7.3、fast-uri 3.1.7→3.1.8、SDK 1.30.0→1.32.1；
另外它要 `add playwright / playwright-core / opencc-js`——這三個 devDep 在 lock 有、`node_modules`
**沒裝**（實測），正好對應 2 個 skip 的 e2e 測試，以及繁中守護自報的「opencc 未安裝，走備援」。
→ 真要用 `npm audit fix` 修漏洞時，**主要成本不是漏洞本身**：它會順手把 playwright 裝回來，
那 2 支從沒在本機跑過的 e2e 會第一次真的執行，可能翻出舊破損。這件事要先讓你知道再裁。

**本地 4 項 vs GitHub 7 則的差異（把舊警告講確切）**

本輪兩邊都讀過：本地 `npm audit --json` metadata＝critical1／high1／moderate2／**total 4**；
Dependabot open alerts（`gh api`）＝critical1／high1／medium5／**7 則**。差在**計數粒度**，不是資料不同：
`ip-address` 上游有 4 條獨立 advisory，npm 把它們收斂成 1 個條目。引用時要講「4 個套件／7 條 advisory」，
別再寫成「本地 4、遠端 5 個中危」那種對不齊的口徑。

**裁決與後續**：本輪**未動** `package-lock.json`（受保護路徑）。下次要裁只要回答一句話：
「願不願意為了這 7 條 advisory，換一次 e2e 首次真跑」。

**下一個人的待裁清單**

1. ✅ **已裁（2026-10-07）：留著等 Tier 1**，不納入 `advantages_zh`。E3 保持 0；等額度回來用 Tier 1
   重寫這 5 支才是正解（跑法見上方 §9 與 `docs/WIKI-COMPILER.md` §6）。若日後又有人提議納入來源集，
   本輪的代價已量：11/12 支詞條變動＋E1 指紋視圖與 `--update-baseline` 同步＋ablate 重量。
2. ✅ **已裁「現在推」並執行**：已推送兩段區間——`48ab756..37dd971`（7 筆）與
   `37dd971..478b76e`（2 筆，含 §10 那筆與 commit 訊息門禁那筆），兩段都屬同一項核准的範圍。
   ⚠️ **本條目自此不再追加筆數**：每補一筆文件就多一次推送，把「執行過幾次」寫死必然過期
   （陷阱 5 ＋ §7「自引用活數要在定稿點一次重量」）。同步狀態一律現量：
   `git rev-list --count origin/main..HEAD` 與 `git rev-list --count HEAD..origin/main`
   都應為 **0**（此環境的 remote-tracking 不會自動更新）。
   ⚠️ 遠端在 push 時回報的 Dependabot 摘要：**7 項（1 critical／1 high／5 moderate）**，
   與 §10 本地 4 項的「計數粒度」結論相符——那是遠端口徑，引用時要連來源一起講。
3. ✅ **已裁「先出影響面報告」**：報告在上方 §10。實測結論——弱點鏈（express／proxy-addr／ajv／
   fast-uri／ip-address）在我們真正載入的模組圖裡**零命中**，本地 4 項與 Dependabot 7 則的差是
   **計數粒度**而非資料不同。`package-lock.json` **仍未動**；下次要裁的是那一句：「願不願意為了
   7 條 advisory，換一次 e2e 首次真跑」（`npm audit fix` 會順手把 playwright 裝回來）。
4. ✅ **已裁「刪掉」並執行**：刪前先量——250 個 `wiki-bad-*` 全是**空**目錄（非空 0 個），
   所以用 `find … -type d -empty -delete` 只碰空的；刪後實測剩 0，其他前綴（`wiki-lint-*`、
   `v5-ablate-wiki-*`）未受影響。源頭已在 `3bb80d4` 修好，往後不會再長。
   ⚠️ 上面那段「歸因寫錯」的記錄**不要刪**——那是本輪最值錢的一次自我撤銷。
5. ⏳ **未裁**：`npm run benchmark` 的詞檔覆蓋尚未接線（§6 末已裁為不做：要動
   `core/retrieval-fusion.js` 這條生產路徑；文件裡那張表已標明「未重量」）。

### 2026-10-06 embedding 可行性量測（本地 multilingual-e5；只量測、未接線、專案零改動）

- **診斷**：接線早已存在（`core/embedding.js`、`scripts/embed-build.js`、fusion／agent-retrieval 的
  V0 維度與 `queryVector` 參數，權重預設 0），缺的只有向量來源（`registry/embeddings/` 不存在）。
  AGNES 端點重驗：`/models` 12 個全是對話／影像／影片模型；`/embeddings` 試三個常見名稱皆回
  503 `model_not_found` → **「端點無 embedding」封鎖仍成立**。
- **方法**：scratchpad 內安裝 `@huggingface/transformers`（`package-lock.json` 是受保護路徑，
  專案內不 `npm install`）；257 題可命中題（嚴格標註）；基準是單獨的 `agentRetrieve`
  （topK=50＋intent 權重，**不是完整 fusion**，與 59.1% 不可直接比）；工具文字兩種：
  base＝`toolEmbedText`、withZh＝再加 `description_zh`／`useCase_zh`；e5 前綴 `passage:`／`query:`；
  742 支（active＋experimental）。

| 方案（e5-small，嚴格） | Hit@1 | Hit@5 | 召回@30 | semantic 召回@30 |
|---|---|---|---|---|
| 詞彙引擎（基準） | 57.6% | 84.0% | 96.1% | 93.0% |
| 純向量 base | 39.7% | 64.6% | 85.6% | 82.2% |
| 純向量 withZh | 47.5% | 69.6% | 89.1% | 85.3% |
| RRF(k=60) 詞彙＋向量 withZh | 57.2% | 86.8% | 98.8% | 97.7% |

  候選池（詞彙 top20 ∪ 向量 top10）召回@30：96.1% → 97.3%（約 3 題）。
- **e5-base（fp32，模型約 1.1GB；計算 742 工具×2 變體＋257 查詢 279s，e5-small 為 95s）**：

| 方案（e5-base，嚴格） | Hit@1 | Hit@5 | 召回@30 | semantic 召回@30 |
|---|---|---|---|---|
| 純向量 base | 43.2% | 68.1% | 91.4% | 89.1% |
| 純向量 withZh | 52.9% | 74.3% | 93.0% | 90.7% |
| RRF(k=60) 詞彙＋向量 base | 56.8% | 86.4% | 98.8% | 98.4% |
| RRF(k=60) 詞彙＋向量 withZh | **61.1%** | 87.9% | 98.8% | 97.7% |

  候選池（詞彙 top20 ∪ 向量 top10）召回@30：base 97.3%、withZh 98.4%（基準 96.1%）。
  **配對 McNemar（RRF vs 詞彙基準，Hit@1，257 題）**：
  e5-small base −0.8pp（p=0.894）、e5-small withZh −0.4pp（p=1.000）、e5-base base −0.8pp（p=0.894）、
  **e5-base withZh +3.5pp（只基準對 19／只變體對 28，p=0.243；含近義 +4.3pp，p=0.152）**——全部不顯著。
- **e5-base 量化版（q8，約 280MB；預先註冊「只比 withZh＋RRF(k=60) Hit@1 對詞彙基準的配對 McNemar」）**：
  資料固定為當時的 `tools.json`（`b4502e7` 版、啟用 742 支，與 fp32 量測同源；現行版已 744 支，
  向量會錯位）。**詞彙基準重現 57.6%＝與先前一致（資料對得上）。**

| e5-base withZh | q8 | fp32 |
|---|---|---|
| **主要指標：RRF Hit@1（嚴格）** | **58.4%（+0.8pp，只基準對 28／只 q8 對 30，p=0.896）** | 61.1%（+3.5pp，p=0.243） |
| RRF Hit@1（含近義） | 61.1%（+2.3pp，p=0.519） | 63.0%（+4.3pp） |
| RRF Hit@5／召回@30 | 80.2%／98.4% | 87.9%／98.8% |
| 純向量 Hit@1／召回@30 | **38.9%／85.2%** | 52.9%／93.0% |

  q8 與 fp32 的向量一致性（平均 cosine）：工具 0.9768、查詢 0.9872；RRF q8 vs RRF fp32 Hit@1
  −2.7pp（只 fp32 對 17／只 q8 對 10，p=0.248）。計算 742 支工具＋257 查詢 76.6s（fp32 為 279s）、
  模型載入 141.9s（含下載）。
  **判讀：預先註冊的主要指標不顯著，且量化把 fp32 的正訊號幾乎吃光**（純向量 Hit@1 −14pp、召回@30 −7.8pp；
  cosine 0.98 看似接近，但排序在近鄰間差一點就翻盤）。這是動態 int8（`dtype: 'q8'`）對 e5 系列的已知退化，
  **未測**其他精度（fp16、q4f16、`model_quantized` 以外的量化）。
- **結論**：向量單獨用都比詞彙差（e5-small −10pp、e5-base 最佳 −4.7pp）。融合後：e5-small 兩種變體與
  e5-base base 的 Hit@1 皆無進步（±1pp 內）；**唯一有正訊號的是 e5-base＋中文譯文（+3.5pp、p=0.243）**，
  但那是 4 種組合裡事後挑出最好的一個（多重比較，p 值偏樂觀），且不顯著，**不能當成已證實的進步**。
  模型加大（small→base）確實有幫助（withZh 純向量 Hit@1 47.5%→52.9%、融合 57.2%→61.1%），
  所以「更大模型可能達顯著」是合理假設，但**尚未驗證**（e5-large 約 2.2GB、算向量更慢）。
  與既有結論一致：rerank 路徑對召回不敏感（top-30 vs top-50 端到端相同），故**預期不會動到 rerank 後的 80.4%**，
  收益最多落在快速搜尋路徑。代價是新增執行期依賴（目前零依賴）與載入成本（base fp32 約 1.1GB、
  首次載入含下載 559s）。**量化版已測（見上）：q8 把體積縮到約 280MB，但品質退化到與詞彙基準無差異
  （+0.8pp，p=0.896），所以「用量化換小體積」這條路在 q8 下不成立。**
  **暫不接進上線路徑。** 目前唯一的正訊號是 fp32 e5-base（+3.5pp、p=0.243，事後挑選、不顯著），要證實
  只剩兩條路：(a) e5-large（約 2.2GB fp32，更大且更慢，與「零依賴、輕量」目標相衝）；(b) 擴大評測集以降低
  標準誤。以目前約 47 題不一致對估算，257 題要在 p<0.05 偵測到差異，**至少需要約 +5.8pp**
  （不一致對 40～55 題時為 5.4～6.6pp）——所以 +3.5pp 在現有評測集下本來就不可能顯著，
  「不顯著」≠「無效」，只是**這個評測集量不出來**。**兩者成本都高、預期
  收益只落在快速搜尋路徑，建議在 telemetry 累積真人查詢之前不再投入。** 若重啟，沿用預先註冊原則
  （只比 withZh＋RRF(k=60) 一個設定）。
- **限制**：評測集由 metadata 反推（偏向哪邊不明）；未試 V0 加權融合（對評測集調權重＝過擬合風險）；
  RRF 只是參數無關的粗估，不是最佳融合。
- **工具箱／本機盤點**：`cli.js search` 前 5 名皆不相關；關鍵字掃庫 4 筆命中
  （claude-mem、tencentdb-agent-memory、stable-diffusion-webui、tldraw）**無一是 embedding 套件**
  → 庫中沒有 embedding 模型／函式庫類工具（收錄缺口，非檢索問題）。本機 Ollama 0.32.5 已裝但未啟動、
  只拉了 gemma4；LM Studio 只有 gemma-4——**皆無 embedding 模型**。
- **外部來源評估**：`semantica-agi/semantica`（已在庫）是 Python 知識圖譜／決策溯源平台，向量部分
  需自備 embedding（`embeddings-local` 只是包 sentence-transformers／fastembed／onnxruntime），
  **與瓶頸（詞彙鴻溝）無關**；`github/semantic` 是已封存的 Haskell 程式碼解析工具，**無關**；
  影片（Karpathy 閱讀 AI 輸出四層階梯）是輸出格式技巧，**與檢索無關**（僅 README／影片層級查證，
  未核對原推文）。
- **新陷阱**：
  1. `~/.workbuddy-ai/models.json` **已無 agnes-ai.com 項目**（只剩 tokenharbor、NVIDIA）；
     AGNES 金鑰現在只在 `~/.strix/cli-config.json` 的 `env.OPENAI_API_KEY`（陷阱 21 的來源清單已過期）。
  2. `onnxruntime-node` 的 postinstall 需 `npm approve-scripts onnxruntime-node` 才會執行。
  3. Windows 主控台（cp950）印簡體字會 `UnicodeEncodeError`——先寫檔再讀。
  4. 量測腳本在 scratchpad（會隨 session 清除）；要重現需重寫：載入 e5、對 `toolEmbedText` 與查詢算向量、
     對照 `agentRetrieve`、RRF(k=60)。

### 2026-10-06 cron 自動探勘新增 2 支並補齊（746 → 748）

- **來源**：遠端 cron 提交 `a5f8ef0`（W40 自動探勘）加入 compositor（Mac 版 Photoshop 替代）與
  clash-verge-rev（Clash Meta 圖形客戶端），只有掃描階段欄位（advantages／NC 為空、useCase＝description、
  triggers 僅名稱），品質 50／65 分。
- **補齊流程**：`enrich-new-tools --ids` → **逐條對 README 全文核實** → 手動修正 → `enrich-triggers-llm`
  → `translate-to-zh --ids` → 手動修正譯文。抓到的問題：
  - clash-verge-rev 兩條 NC 站不住：「僅限有圖形介面」是由 GUI 演繹推論（README 無此句）；「需另配代理後端」
    與 README 相反（README 寫**內置** mihomo 內核）。**全數移除、NC 誠實留空**（第 6 個警告）。
  - 「安全性、輕量」是 README 沒有的潤飾；compositor 的「專為 Mac 優化」同理；compositor 第 4 條優點其實是
    系統需求（macOS 26＋Apple Silicon）被包裝成優點，改為 README 有的「完全免費開源、可改 Xcode 專案」。
  - triggers 帶 `linux`、`mac` 這類泛詞（稀釋鑑別力，陷阱 3）→ 剔除；`enrich-triggers-llm` 補上
    5 個含口語中文的詞（守門 20→10 詞）。
- **分類（判斷題，可推翻）**：compositor 開發工具→**UI/UX設計**（圖像編輯器，最近分類，非 AI 生成；
  先例 pixel2motion）；clash-verge-rev 開發工具→**安全性**（先例 fanqiang＝翻牆代理彙編，雖然「安全性」
  的定義是滲透測試，兩者都不貼切）。rescan Tier 1＝0。
- **新陷阱**：
  1. **`translate-to-zh --ids` 的欄位歸屬閘門仍會漏**：compositor 的 `advantages_zh` 被寫成黏了 NC 內容的
     **單一字串**（還截斷），`negativeConstraints_zh` 缺；clash 的 `advantages_zh` 缺。落盤後必須檢查
     zh 欄位是**陣列且筆數與英文一致**，不能只看「成功 2 筆」。
  2. **`zh-translation-state.json` 會快取這份壞譯文**（陷阱 6 的再現）→ 手動修正後必須同步刪該 id 的
     state 條目。
  3. **`enrich-triggers-llm.js` 沒有 `--ids`**，預設處理**所有**尚未處理的工具（本次 17 筆，其中 15 筆與
     本任務無關）。限縮範圍的做法：先備份 `trigger-enrich-state.json`，把其餘待處理 id 暫標為 done，
     跑完再刪除暫標記（只留目標 id 的新條目）。
  4. **Node 的 `/tmp` 不等於 Git Bash 的 `/tmp`**：Node 會解析成 `D:\tmp`，暫存檔一律放 scratchpad 的完整路徑，
     否則 `&&` 串接的管線會在中途靜默斷掉並留下半套狀態。
  5. `compositor`／`clash-verge-rev` 的 `install.method` 仍是 `none`（README 只有下載／Homebrew 或 Release 頁，
     未改動）。
- **驗證**：只有這 2 筆與 `trigger-enrich-state.json` 的 2 個條目有變動；validate 0 錯誤／6 警告／99.8；
  check-doc-stats、check-templates、check-traditional、check-mece 全綠；rescan Tier 1＝0；
  測試 354／352 pass／0 fail／2 skip。

### 2026-10-05 批次加入 10 支工具（736 → 746）

- **入庫**：`cli.js add` 逐支序列（兩階段管線），10 支全數入庫且 stars 寫入
  （陷阱 15 對 `cli.js add` 已不存在）——claude-howto、osiris、quilt、ow-bridge、
  voicestudio、awesome-vibecoding-guide、video-shotcraft-dsh、sc-datav、
  heterogeneous-gpu-pd-lab、ollama（182k★，此前竟不在庫中）。
- **拆解判定：10 支全不拆**（5 個可疑結構查證：osiris／VoiceStudio／Quilt 的
  monorepo 組件、video-shotcraft-dsh 的技能包、gpu-pd-lab 的實驗集——皆為同一
  產品的組成，依 oracle/fusion-ai-studio 先例不拆）。
- **分類修正 5 支**（依定義＋先例）：ollama→AI 框架（本地模型運行時，laya-mlx
  先例）、awesome-vibecoding-guide→學習資源（指南彙編）、gpu-pd-lab→AI 框架
  （vLLM/SGLang 推理基礎設施）、quilt→UI/UX設計（原型工具，m3e-canvas 先例）、
  sc-datav→UI/UX設計（前端資料視覺化專案範本）。
- **加入後審計紀律（本次教訓）**：batch add 當下不逐支核、入庫後**逐 README
  重審**——抓到 6 條擬造條件（5 支），其中 qwenpaw 的 badge 版本宣稱經正文重查
  **成立**（重產通過、從 A 批留空清單除名）；ow-bridge 擬造條目拒收重產後 2 條
  逐字核實。最終 22 條 NC 全數過覆核（19 條自動字詞命中＋3 條人工逐字）。
- **文件數字同步**：README／AGENTS.md（agents:init 重生成）736→746，
  check-doc-stats 回綠；本文件第一節與此快照同步。
- **zh 全齊**：10/10 完成 description_zh／useCase_zh／advantages_zh／
  negativeConstraints_zh（sc-datav 的 desc_zh 去除冗餘重複段）。
- **驗證**：rescan Tier1=0、check-mece 綠、tier1+category-guards 19/19、
  validate 0 錯誤、測試 354/352/0、門禁全綠。

### 2026-10-04 A 批回補後的現況（歷史快照，數字仍有效除工具數）

- **A 批 negativeConstraints 全數判定完成（39 支）**：33 支依 README 逐條人工核實回補
  （每支 NC 與 NCZ 筆數對齊），6 支**誠實留空**（awesome／awesome-python／awesome-mac
  書單型、qwenpaw badge 陷阱、arc-task-gen 無邊界、tokentab 死鏈）。過程攔下 13 條捏造
  （書單型 README 必然捏造；badge 數字不算證據）。
- **validate 門禁語義已對齊**：NC 缺失降級 error→warn（`cli.js`，與 `registry-contract.js`
  的 09-27「誠實的訊號」設計一致；同族欄位 advantages 本來就是 warning）。現況：
  **0 錯誤／6 警告／品質 99.8／exit 0**。留空壓力由 enrich 管線承擔
  （`needsEnrich()` 已認 NC 為補齊目標）。
- **檢索核心指標（267 題 v1.3.0）**：fusion Hit@1 **59.1%**（A 批前 58.0%，+1.1pp，
  噪音地板內）、agent 58.8%、semantic 50.4%、direct 68.4%、constrained 61.5%、
  **空集誠實率 100%**——A 批 33 支 NC 變動零回歸。
- **測試**：**354** tests / 352 pass / 0 fail / 2 skip；check-mece、樣板、繁體門禁綠。
- **管線能力更新**：`translate-to-zh.js` 新增 `--ids`（限定套用範圍）＋**欄位歸屬閘門**
  （模型回錯鍵不再覆寫，khoj 污染案）＋**陣列筆數比對**（NCZ[i] 恆對應 NC[i]，
  freecodecamp 黏接案）；`enrich-new-tools.js` 認 NC 為補齊目標＋強制序列（TPM）＋
  `saveRegistry` 原子寫入。
- **tokentab 已標 deprecated**：上游 `damejan80/tokentab` GitHub API 404（作者公開
  repo 數 0，無改名新家）；依既有慣例僅改 status。active+experimental = 732。

### 2026-10-03 六批次衝刺後的現況（A 批前的歷史快照）

- **檢索核心指標（267 題評測 v1.3.0）**：fusion Hit@1 **58.0%**（9/21 時 56.8%）、
  agent 57.6%、semantic 50.4%、direct 68.4%、**空集誠實率 100%（全程未破）**。
  LLM rerank 已三端預設啟用（有 key 就開；CLI `--no-rerank` 可停）。
- **測試**：355 tests / 0 fail / 2 skip；validate 0 errors；全門禁綠。
- **治理**：tools.json 寫入點 6→1（`saveRegistry`，**原子寫入** temp+rename）；
  新門禁 `check-templates`（樣板黑名單含 *_zh）、`check-doc-stats`（文件數字=實際）、
  `tracked-repos-schema`（頂層只准 owner/repo 鍵）；`enrich-registry` 需 `--force`。
- **新資產**：`registry/intent-archetypes.json`（26 家族原型層 → fuse 加權 +0.03 同分群裁決）、
  `registry/recipes.json`（3 條人工驗證配方 → CLI/Web/MCP plan 三端，命中回 `source: 'recipe-library'`）、
  `web/telemetry-endpoint.js`（真人查詢 JSONL 回流，含 isTrustedOrigin 防護）、
  `scripts/infer-facets.js`（negativeFacets ±極性萃取，冪等）。
- **設計紅線（勿違反）**：配方**禁止自動生成**（人工驗證才上線）；原型表**禁止從評測題反推**；
  negativeFacets 的 value 不得含「non-」（極性歸 ± 符號，雙重否定不得復活）。
- **並行 session 已關閉**：其 W39 同步、CI 淺 clone 修復皆已入庫；陳舊 stash 已刪。
- **數字基準**：追蹤池 2,581（頂層含 `_meta`/`lastGenerated` 中繼欄位，
  計數一律用 owner/repo 形狀 regex，勿用 `_` 前綴過濾）。

### 2026-10-03 新增陷阱（編入上方陷阱清單的補遺）

1. **port 3000 可能被舊 server 佔用**：`node web/server.js` EADDRINUSE 會靜默失敗
   （錯誤進 log 沒人看），curl 打到的是**舊程式**——測新端點前先
   `netstat -ano | grep :3000`，或用 `PORT=3457` 起驗證實例。
2. **Git Bash 的 curl 傳中文 POST body 會亂碼**：先寫 UTF-8 檔案再 `--data-binary @file`。
3. **`npm test | grep -E "pass|fail"` 不是閘門**：grep 匹配到「fail 1」也 exit 0，
   曾帶紅燈推送——驗證一律看 exit code 或精確匹配 `fail 0`。
4. **AGNES API 429 限流**：約 30-45 呼叫/窗口；LLM 萃取腳本皆冪等
   （自動跳過已完成），額度恢復後重跑即可，勿在 429 時硬幹。
5. **並行寫檔競態**：並行 session 的 daemon 寫 tools.json 時測試讀到截斷 JSON
   → 暫態失敗。saveRegistry 已原子化，**勿改回直接 writeFileSync**。
6. **翻譯狀態快取會復活手動編輯**：`registry/zh-translation-state.json` 快取歷史譯文，
   重跑時整批套回——手動清空的欄位會被舊譯文覆蓋（樣板門禁曾即時抓到 49 筆復活）。
   **清資料必須連 state 條目一起清**，否則下次重跑又套回。

### 2026-10-04 A 批新增陷阱（負邊界回補 39 支實測）

7. **逾時砍死 npm test 會讓注入殘留進真實 categories.json**：
   `tests/category-guards.test.js` 對**真實** `registry/categories.json` 注入壞值驗證
   守衛、結束時還原——測試行程被 30 秒指令逾時砍死時還原不會執行，殘留會讓
   check-mece 紅燈（實例：AI 框架色碼被改成與 AI 代理重複）。
   **復原**：`git checkout -- registry/categories.json`＋重跑 check-mece。
   凡是逾時砍掉測試，先 `git status registry/` 檢查有無非預期修改。
8. **GitHub Actions cron 會隨時搶推 main**：push 失敗時先 `git ls-remote origin main`
   對 hash——若分岔，fetch 後 `git merge <hash>`（禁 rebase），衝突通常只在
   tools.json 頂部 lastUpdated 時間戳，其餘自動合併。
9. **commit 訊息逐字引用簡體 README 會被繁體門禁攔截**：`check-traditional --commits`
   掃最新一筆、無豁免——A 批踩了兩次。CJK 引述一律**打字重寫成繁體**，不複製貼上。
10. **badge／shield.io 徽章數字不算證據**：`python-3.11~<3.14` 徽章 URL 被模型寫成
    相容性邊界（qwenpaw 案）。數字必須在 README **正文段落**出現才算。
11. **書單型 README 必然產出捏造約束**：awesome／awesome-mac 等連結清單沒有
    「何時不該用」章節，LLM 被逼著填就會編（static-list／terms-of-service 等
    十三例）——**判定誠實留空，不要硬湊**。有 CAUTION/WARNING/Limitations
    章節的 README 幾乎必然全收。
12. **Node v26 的 TAP 前綴是 `ℹ` 不是 `#`**：陷阱 22 的 `grep -E "^# (tests|pass|fail)"`
    在 Node v26 抓不到摘要——改用 `"^ℹ (tests|pass|fail)"` 或直接看 exit code。
13. **PowerShell 把 git push 的 stderr 進度訊息判為錯誤**：輸出顯示
    `Command exited with code 1` 不代表推送失敗——唯一判準是
    `git ls-remote origin main` 對 hash（A 批 20+ 次假失敗、1 次真失敗全靠此分辨）。
    **解法**：`cmd /c "git push origin main 2>nul"` 原生重導向丟 stderr 只看
    `$LASTEXITCODE`（`2>$null` 在本環境 PowerShell 壓不住；up-to-date 的 push
    不寫 stderr、乾淨無紅字；有傳輸才會出現噪音），慣例收錄於「八、協作規範」。
14. **模型會把 negativeConstraints 產成中文或回錯鍵**：已由管線閘門根治
    （translate-to-zh 欄位歸屬閘門＋筆數比對、enricher QA 覆核），但**落盤前仍須
    逐條對 README 人工核實**——QA 閘門只擋「字面不在 README」，擋不住
    「對比的錯誤轉述」（labs-oo-agents 案）與「演繹推論」（penguin-harness 案）。

─── 以下為 2026-09-21 的狀態記錄（數字已過期，rerank A/B 分析結論仍有效）───

### Git

```
最新提交：以 `git log --oneline -1` 為準（此欄先前釘死 hash，每提交必過期，已改不釘）
遠端：    github.com:Chun-Chieh-Chang/Tool-Calling.git
工具數：  725（tools.json，active + experimental 722）
```

倉庫損毀已發生**兩次**（09-19 與 09-20），修復程序見**陷阱 12**。
`.git` 於 2026-09-20 從遠端重建過；本地 `origin/main` ref 需手動校正（見陷阱 5）。

### 檢索準確度（核心指標，評測集 **v1.3.0／267 題**，標準誤 ~3.0pp）

**rerank 路徑（實際上線，recallK=30）**

| 指標 | 數值 | 備註 |
|---|---|---|
| 詞彙引擎 top-1 | **58.8%** | 知識編譯器 V5 啟用（Tier 1 LLM 詞檔）；停用 V5 則 49.4% |
| 召回天花板（top-30） | 95.7% | 停用 V5 時 94.9%（top-50 為 98.1%）|
| **rerank 後（嚴格）** | **80.4%** | 配對 A/B：top-30 與 top-50 皆 80.4%，差異 0.0pp（p=1.000）|
| 空集誠實率 | 100%（10/10）| V5 啟用前後皆為 100% |

⚠️ **v1.3.0 的數字不能與 v1.2.0 直接比較**（題數與難度分佈皆已改變）。
v1.2.0 的舊值：詞彙 top-1 62.3%、天花板 96.9%、rerank 74.2%。見 `registry/eval-queries.json`
的 `methodology.generation`。

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

→ **至少 `tail -8`，或直接 `npm test 2>&1 | grep -E "^(#|ℹ) (tests|pass|fail)"`。**
  ⚠️ Node v26 起 TAP 前綴是 `ℹ` 不是 `#`（2026-10-04 實測），舊 grep 會抓不到摘要。
→ 同理：任何「只看尾部 N 行」的驗證都要確認關鍵行沒被截掉。

### 23. 🔴 反引號寫進 template literal 會提前結束字串（2026-09-21）

`core/tool-enricher.js` 的 LLM prompt 是一整段 template literal（`` const SYS = `...` ``）。
在裡面寫了 markdown 反引號：

```js
const SYS = `...
🔴 **不要產生 description_zh**：描述的中文由 `npm run translate:zh` 負責。
...`;
//                                    ↑ 這個反引號把字串提前結束了
```

結果：`npm run translate:zh` 被當成程式碼 → `SyntaxError: Unexpected identifier 'npm'`
→ **整個模組載入失敗**。而且因為只有 `tests/tool-enricher.test.js` import 它，
其他測試照常全綠，很容易誤判沒事。

**這已經是第二次「沒被測試覆蓋的檔案語法壞掉」**（第一次是誤刪 `const DEFAULT_MODEL`，
見陷阱 22）。兩次的共同點：**編輯註解／prompt 這類「看起來不是程式碼」的區域**。

→ 已加 `scripts/check-syntax.js`（對 core/、scripts/、web/、tests/、根目錄所有 .js
   跑 `node --check`，約 1 秒），並接進 `npm test` 的第一道關卡。
→ 寫進 template literal 的內容，**絕對不要用反引號**（改用引號或直接不加標記）。
→ 改完 prompt／註解後，`node -e "import('./core/xxx.js')"` 是最快的自我檢查。

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

⚠️ **各版本評測集互不可比較**：v1.0.0(47) → v1.1.0(69) → v1.2.0(169) → **v1.3.0(267)**。
每次擴充都會改變題數與難度分佈（v1.2.0 時 semantic 佔比由 33% 升至 50%，
是產生方法的偏差，見陷阱 11 與 DEV_LOG）。

**分類型（fusion，topK=5，V5 啟用，v1.3.0）**：
| 類型 | 筆數 | Hit@1 | 天花板 |
|---|---|---|---|
| direct | 76 | 71.1% | 100.0% |
| semantic | 129 | **50.4%** | 96.1% |
| constrained | 52 | 61.5% | 100.0% |

→ semantic 仍是唯一有召回缺口的類型（96.1%），根因是詞彙鴻溝（見**陷阱 17**）。
→ 正面處理方式是「知識編譯器」（`docs/WIKI-COMPILER.md`），**Tier 1 已全量完成**：
   離線把 705 支工具的 metadata 用 LLM 編譯成使用者語言的詞條，
   查詢時比對詞條而非原始描述。天花板 94.9% → 98.1%、agent Hit@1 49.4% → 58.8%（+9.4pp）。
   🔑 `AGNES_API_KEY` 不在環境變數裡，但在
   `~/.workbuddy-ai/models.json`（找 url 含 agnes-ai.com 的項目）。

### 測試

`npm test` → **315 tests / 313 pass / 0 fail**（2 skipped 為需外部依賴者）
2026-09-19 起改為 `--test-concurrency=1` 序列化（見陷阱 9），耗時 12.5s → 21.4s → 29s。
2026-09-21 起 `npm test` 第一道關卡是 `scripts/check-syntax.js`（見陷阱 23）。
2026-09-25 起 `npm test` 多了兩道語言關卡：`check-traditional.js`（預設＝相對 HEAD 的新增行＋未追蹤檔）
與 `--full --code`（原始碼整檔綠燈鎖）。`--commits <range>` 另可查 commit 訊息——該處無法豁免，
只能改寫歷史，所以本專案的 commit 訊息自此必須全繁體。
`cli.js validate` → **0 錯誤／6 警告／品質 99.8**（748 支工具；6 警告皆為刻意留空 negativeConstraints 的 awesome／awesome-python／awesome-mac／arc-task-gen／tokentab／clash-verge-rev，2026-10-06 實測）。
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
4. **LLM rerank**（`core/llm-rerank.js`）— 可選後處理，recallK=30（原為 50，2026-09-20 改）

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
5. **加入工具（兩階段）**：
   - 第一階段 `scripts/scan-tool.js`（同步、免 LLM）：
     GitHub API 取 description／language／topics→capabilities，並抓 README
     取得更完整的描述（會清掉 Markdown 標記）。
   - 第二階段 `core/tool-enricher.js`（非同步、需 LLM）：
     讀 README 產生 `useCase`（真實情境）、`advantages`、`capabilities`
     （topics 為空時才補）與三者的 `*_zh`。
   - 接入：Web `/api/tools/add`（背景補齊、不阻塞回應）、
     `node cli.js add <url>`（同步補齊）、批次 `npm run enrich:new`。
   - 🔴 **硬規則**：必須基於 README，**不可憑名稱推測**；
     README 不足時**寧可留白**也不要填推測內容。
     不要用 `scripts/enrich-registry.js`（它的 prompt 明寫「依 Name 與 URL 猜測」）。

### 重要設計決策

- **rerank 預設「有 key 就啟用」（2026-10-02 三端對齊）**：CLI / Web / MCP 三端同語意
  （`undefined` = 由 retrieval-fusion 依 key pool 判定，離線自動略過；`false` = 明確停用）。
  CLI 提供 `--no-rerank` 強制停用；`--deep` 保留為無操作的相容別名。
  延遲取捨不變：詞彙引擎 119ms vs rerank ~5s，且深度搜尋結果仍不寫快取
- **rerank 只跑序列**：實測併發 3 會讓 58% 呼叫失敗（限制是 TPM，見陷阱 21）
- **rerank 可棄權**：prompt 允許回 `NONE`，避免把已正確的 top-1 換掉
- **no-match 時仍給最佳猜測**：已明示不確定，不損害誠實性
- **深度搜尋結果不寫快取**：與快速路徑排序不同，共用快取鍵會不一致

---

## 五、檔案地圖

| 路徑 | 用途 |
|---|---|
| `registry/tools.json` | **工具庫（單一真理來源）** 748 筆 |
| `registry/categories.json` | **分類唯一來源**（機器可讀） |
| `registry/eval-queries.json` | 評測集 **v1.3.0 — 267 筆**（257 可命中 + 10 空集），標準誤 ~3.0pp |
| `registry/zh-translation-state.json` | 繁中譯文進度（可續跑）|
| `scripts/translate-to-zh.js` | 產生 `*_zh` 欄位（`npm run translate:zh`）|
| `scripts/check-syntax.js` | **語法守門**：全部 .js 跑 `node --check`（`npm test` 第一關，見陷阱 23）|
| `scripts/scan-tool.js` | 加入工具第一階段：解析 GitHub repo（無 LLM）；`detectInstall` 依封裝檔判斷安裝方式 |
| `scripts/ceiling-analysis.js` | 天花板診斷（`npm run ceiling`，見陷阱 17）|
| `registry/compiled-entries.json` | 知識編譯詞檔（705 筆，由 compile-wiki 產生）|
| `scripts/compile-wiki.js` | **工具知識編譯器**（解析邏輯，`npm run compile:wiki`）|
| `core/wiki-matcher.js` | 詞條配對 + 知識圖譜擴散（配對邏輯，V5）|
| `core/clarifier.js` | 需求收斂追問引擎（純函式，題目由候選差異動態產生）|
| `core/tool-chain.js` | 多工具鏈規劃（走融合引擎版，`planToolSet`）|
| `core/ingestion.js` | 擷取層管線（素材 → 可用筆記）|
| `core/tool-enricher.js` | 加入工具第二階段：讀 README 產生語意欄位（需 LLM）|
| `scripts/enrich-new-tools.js` | 批次補齊語意欄位（`npm run enrich:new`）|
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
npm run eval:rerank         # rerank 評測（需 AGNES_API_KEY；預設 topK=20，
                            #   要對齊上線請加 --topK=30，見陷阱 20）
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

### 2026-10-03 起的待辦（優先序以此為準；下方歷史清單僅作脈絡）

- ✅ ~~7 支 facets 補萃取 + 3 支 zh 重譯~~ → 已完成（facets 覆蓋 92/100，其餘為
  散文無可萃取的誠實留空；zh 3 筆全數重譯成功）。注意新陷阱 6。
- ✅ **A 批 negativeConstraints 39 支全數判定**（2026-10-04）→ 33 支回補＋6 支誠實
  留空＋validate NC 降級 warning 對齊 contract 層＋tokentab 標 deprecated。
  判定模式與 13 例捏造明細見 commit 5883057 之前連續 38 筆 feat(enrich)。
- ⏳ **telemetry 累積真人查詢**（目前 0 筆，`web/data/telemetry-events.jsonl`）→
  累積後兩件事：原型表依真人分佈重校準、Batch 4 用真人問句重建評測集
  （取代「由 metadata 反推」的自製題——eval-queries.json methodology 自承的偏差）。
- ✅ 本文件舊待辦中已完成者：tracked-repos schema 統一、配方庫三端對齊、
  意圖原型層、decision 閾值修正——詳 DEV_LOG 2026-10-03 六批次。
- 📌 semantic 缺口（50.4%，仍是最弱類型）的已知無效手段清單見下方
  「刻意不做的」表格；embedding 已於 2026-10-06 以本地 e5 量測（見「三、目前狀態」頂部）：
  e5-small 融合後 Hit@1 無進步；e5-base fp32＋中文譯文 +3.5pp 但不顯著（McNemar p=0.243，現有評測集
  至少需 +5.8pp 才偵測得到）；e5-base q8 退化到 +0.8pp（p=0.896），**暫不接線**；
  AGNES 端點仍無 embedding 模型。

---

### 以下為 2026-09-22 之前的歷史待辦記錄

### 已完成（含 2026-09-22 本輪）

**2026-09-22 新增（決策閾值修正 — 核心改善）：**

- ✅ **降低融合引擎的 decision 信心門檻**（AGENT_MIN_CONSISTENT 3→agentModerate 1）
  - 問題診斷：HyDE 失敗揭露真根因——26 筆 no-match 實際命中（agent 已找到答案）
  - 修正方案：新增 `agentModerate` 路徑（1-2 筆高置信 + L2 有候選 → adopt-with-warning）
  - **結果：fusion Hit@1 37.0% → 56.8% (+19.8pp)，空集誠實率 30% → 100%** ✓
  - 副產品：`scripts/diagnose-decision.mjs` 診斷工具（2026-09-22 清理：無引用已刪）

**2026-09-22 完成：**

- ✅ **Adaptive HyDE 完整評測**（Hit@1，38 題觸發子集，1 輪）— **結論：終止。** 0 改善、3 退步（c19/c185/c244）。根因：agent-retrieval 已補語意橋，HyDE 的 expanded query 反而稀釋訊號。`retrieveWithAdaptiveHyDE` 留在 codebase 但不接入任何端點。詳見 DEV_LOG。
- ✅ 新增 `scripts/eval-hyde.js`（HyDE 評測腳本，帶 `--dry-run`）（2026-09-22 清理：HyDE 終止後腳本已刪）
- ✅ 補 `tests/llm-keys.test.js` `beforeEach` — 修正測試在環境有真實 API key 時第一個 case 失敗的問題
- ✅ `docs/pipeline-workflow.html` 修正 2 個節點 `module` 欄位（`core/interactive-approximator.js` → `core/clarifier.js`）
- ✅ `HANDOFF.md` 日期 header 更新至 2026-09-22
- ✅ **Web 工作台新增 3 項 UI 功能**：`POST /api/shutdown` 端點（本機 origin 白名單 + confirm 字串雙重防護）；header 加「關閉系統」紅色按鈕；logo 與搜尋列之間加入 6 步「操作流程」可點擊步驟條（`.workflow-steps`，點擊 → scrollIntoView + focus + `wf-pulse` 光暈）；搜尋列每個控件包進 `.hint-cell` 顯示 ① ② ③ ④ 常駐微提示。詳見 DEV_LOG 2026-09-22 Session 2。
- ✅ **`toTraditional()` 修正 opencc 缺席回退**：`scripts/fix-simplified.js:187` 補 `|| S2T_SAFE[ch]`，讓「沒/熱/紅/筆/無/漸」等表外簡體字在無 opencc 環境也能正確轉換（解掉 2 個長期紅燈測試）。
- ✅ **`knowledge-graph.test.js` playwright 改為可選**：頂層 dynamic `await import('playwright')` + try/catch，缺依賴時 `describe(..., { skip: true })`，`npm test` 可在離線沙盒全綠。
- ✅ **全面盤點清理**：刪 7 支無引用一次性腳本（apply-categories / batch-add-20260908 / aurora-multidimensional / eval-hyde / expand-eval-set / verify-flowchart-spec / diagnose-decision.mjs）、孤兒 `web/fonts.css` + `web/fonts/` woff2（100 KB+，早已於 DEV_LOG 標記刪除但未實刪）、7 份日期戳記 docs；修 `package.json` 696 → 722；`scripts/generate-agents-md.js` 6 處 62/62 → 247 tests 並重生成 AGENTS.md。

**2026-09-20 新增：**

- ✅ **譯文納入檢索索引** — agent Hit@1 37.5%→53.1%、天花板 95.3%→98.4%。**本輪最大改善**
- ✅ **評測集擴充至 v1.3.0（267 題）** — 標準誤 5.4pp→3.6pp→**3.0pp**；18 分類均衡（多數 13 題）、
  漏詞檢查、天花板驗證；擴充流程已腳本化（`scripts/expand-eval-set.js`，可重現）（2026-09-22 清理：一次性腳本已刪，擴充流程見 DEV_LOG）
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
| **自適應 HyDE v2**（`decision != adopt && l2Score < 0.10`，2026-09-22）| Hit@1 評測：全部 −0.4pp，觸發子集 −2.6pp，**改善 0 筆、退步 3 筆**。根因：agent-retrieval 已補語意橋，expanded query 稀釋訊號。`retrieveWithAdaptiveHyDE` 留在 codebase 但不接入任何端點。**HyDE 方向終止** |

### 尚未處理（經實測皆非有效槓桿，優先序低）

1. **補齊缺欄位** — 但注意：實測 547/705 工具描述 <60 字是全庫常態，且補欄位經實測非召回瓶頸（見陷阱 17
2. **能力圖譜** — 2026-09-17 評估：top-200 天花板已 100%，瓶頸是 LLM 挑選力，非召回

### 📌 下一步建議（若繼續投入）

**已完成**：✅ **修正 `decision` 閾值** — fusion Hit@1 37.0% → 56.8% (+19.8pp)

**仍可投入**：
- **攻 semantic 缺口**（現在 48.1%，仍是最弱的類型，-9.7pp vs direct）。已知無效：HyDE 簡單版、HyDE v2（`l2Score < 0.10`）、subTools、CoT。可試方向：更精緻的意圖抽取（query-intent.js）、或接納 embedding 的技術債（API 端點無模型）。
- **天花板 5% 缺口**（8 題）：根因是詞彙鴻溝（使用者口語 vs metadata 技術術語），乾淨解法需 embedding，但 API 端點無 embedding 模型可用（已查證）

---

---

## 八、協作規範（使用者要求）

- **一律繁體中文（台灣）回應**，技術術語保留英文
- **原子化提交**（Conventional Commits），不要巨型 commit
- **能優化就不要怠惰**——發現問題應一併修好
- **破壞性操作、push 需先取得明確許可**
- **不確定就說不確定**，不可編造
- **push 慣例（2026-10-04 起）**：一律 `cmd /c "git push origin main 2>nul"`
  （原生重導向丟 stderr；`2>$null` 在本環境 PowerShell 版本**壓不住**假失敗紅字，
  見陷阱 13），看 `$LASTEXITCODE` 判成敗，
  **並且固定補 `git ls-remote origin main` 對 hash**——唯一可信判準；
  對不上 = 真分岔，走 fetch＋merge（陷阱 8），禁 rebase。

---

## 九、接手建議

1. 先跑 `npm test`（確認基線）→ `npm run ceiling`（**不需 API，先看召回 vs 排序問題在哪）
2. 讀 `DEV_LOG.md` 最上方條目（有完整的決策脈絡）
3. 讀 `.workbuddy-ai/memory/MEMORY.md`（專案長期記憶，含所有陷阱）
4. **動手前先診斷**——這是這個專案最重要的方法論。推薦順序：`npm run ceiling` → 分析失敗題 → 才做實驗
5. **做 A/B 前先讀「量測方法論」**：v1.3.0（267 題）單次標準誤約 **3.0pp**。差異小於 3.0pp 視為雜訊。
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

## 十三、2026-09-21 的核心結論（最新）

本輪主軸是**「加入工具」這條路的資料品質**，以及一個潛伏的語法錯誤。

### 1. 兩階段解析已上線，但**第二階段的輸入源是 README 首段，會踩到樣板文**

`scan-tool.js`（第一階段，無 LLM）+ `core/tool-enricher.js`（第二階段，LLM）分工明確。
本輪實測發現：**enricher 讀的是 README 的第一段**，而第一段經常不是功能說明。

實際踩到的三個案例（全部在本輪修掉）：

| repo | README 首段實際內容 | 後果 |
|---|---|---|
| `thebuggeddev/anatomy` | 未修改的 `vinext-starter` 樣板文 | useCase／advantages／capabilities **全部描述成 Cloudflare 樣板**，與 3D 解剖完全無關 |
| `oracle/fusion-ai-studio` | 「The repository has been restructured…」更新公告 | description 變成公告文 |
| `Z-Anatomy/Models-of-human-anatomy` | `# Z-Anatomy` H1 與內文被軟換行黏成同一段 | description 以 `# Z-Anatomy` 開頭 |

→ 三處修法：**description 優先序**（GitHub 描述可用就用）、**標題行整行移除**、
   **樣板文開頭黑名單**（`isBoilerplateParagraph`，只收明確公告式開頭，精度優先）。
→ 🔴 **教訓：加入工具後必須人工核對 useCase 與 description 是否同一主題。**
   自動化只能保證「有值」，不能保證「值是對的」。

### 2. 🔴 安裝指令曾經是「憑語言猜的」，會產生**照著做必定失敗**的指令

舊版 `guessInstall()` 只看 GitHub 偵測到的語言：

```js
if (language === 'typescript') return { method:'npm', command: `npx ${repo}` };
if (language === 'python')     return { method:'pip', command: `pip install git+${url}.git` };
```

但「語言」不等於「可安裝套件」：

- `thebuggeddev/anatomy`（Next.js 應用，`package.json` 是 `private: true`）→ 產生 `npx anatomy`，**npm 上沒這個套件**
- `Z-Anatomy/Models-of-human-anatomy`（Blender 範本，無 `setup.py`／`pyproject.toml`）→ 產生 `pip install git+…`，**裝不起來**

→ 改為 `detectInstall()`：**讀 repo 根目錄的封裝檔才給套件指令**。
   `package.json` 有 `bin` 且非 private → `npx`；其餘（應用程式／樣板）→ `git clone`。
   有 `pyproject.toml`／`setup.py` → `pip`；`Cargo.toml` → `cargo`；`composer.json` → `composer`。
   **查不到檔案清單（限流）時直接 `git clone`，不猜。**
→ 誠實的下界：`git clone` 對任何 GitHub repo 都成立，**給錯的指令比留白更糟**。

### 3. 🔴 `translate:zh` 的第四種跑版：扁平且 key 帶欄位名

當同一批次裡每個工具各自只缺**不同**欄位時，模型會回：

```json
{ "models-of-human-anatomy_description_zh": "…", "anatomy_negativeConstraints_zh": […] }
```

而不是巢狀的 `{ "id": { "description_zh": … } }`。舊版只認 `id` / `id_zh` 兩種扁平形式，
於是兩筆全被判「missing id in response」而失敗。

→ 已補第 4 種解析；並且**失敗訊息會附上實際收到的 key**
   （原本只寫「missing id」根本無從診斷）。
→ 另外發現 `translate:zh` 曾產出**韓文**（`允許自由 재배포與二次創作`）——
   已掃全庫確認只有這 1 處，並修正。

### 4. 本輪加入的 4 支工具與「是否需要拆解」的判定

| repo | 判定 |
|---|---|
| `Z-Anatomy/Models-of-human-anatomy` | 單一工具（Blender 範本）|
| `thebuggeddev/anatomy` | 單一工具（Next.js + three.js 應用）|
| `ashemag/human-atlas` | 已在庫中（僅修正 install）|
| `naver/anny` | 單一工具（PyTorch 人體網格模型，有 `pyproject.toml` → pip）|
| `oracle/fusion-ai-studio` | **不拆解**——見下 |
| `rtk-ai/rtk` | 已在庫中 |

**`oracle/fusion-ai-studio` 為何不拆解**：它底下有 `aiapps/{scm,prc,hcm}`、`extensions`、
`how-to`、`.agents/skills`，看起來像多個工具。但實際查證後：
所有內容都是**同一個產品（Oracle Fusion AI Agent Studio）的樣板與範例**，
且**按產品 release 分支**（`release-26C`）發佈。
拆成 N 筆只會得到 N 筆「用 Oracle Fusion AI Agent Studio 做 X」的重複條目。
→ **判準：子目錄是「獨立的工具」還是「同一產品的樣板／領域實例」？**
   後者不拆。

### 5. 語法守門 `scripts/check-syntax.js`

見陷阱 23。已接進 `npm test` 第一道關卡（109 個 .js 檔，約 1 秒）。
驗證方式：故意放一個壞檔 → exit 1；移除後 → exit 0（**守門機制必須能失敗才算數**）。

---

