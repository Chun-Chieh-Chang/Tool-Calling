# 2026-10-15 第八輪執行紀錄（Q1～Q7 全 A）

> 裁決來源：`docs/decisions-2026-10-15c.html`
> 執行日期：2026-10-15～16
> 對應 commit：待補（第八輪收尾提交）

---

## 執行前錨點

| 項目 | 數值 |
|---|---|
| 工具數 | 771（`registry/tools.json`） |
| 評測集 | v1.4.0，267 題，可命中 257 筆 |
| 基線 | `docs/benchmarks/2026-10-15-v1.4.0-baseline.*` |
| 遙測事件 | 1 筆（allowlist 探針） |
| 缺 capabilities | 159 支 |

---

## Q1=A：Registry 簡體字清洗

### 發現過程

初始盤點（`*_zh` 欄位）發現 **20 字串／15 工具**，但決策頁預期是「17 筆」。追查後發現：
- `negativeConstraints_zh` 不進索引，排除後 = **18 筆**（含 1 筆 decision page 未列的 `negativeConstraints_zh`）
- 原文欄位（`description`/`useCase`/`triggers`）另有 **24 筆** 簡體，同樣餵進索引
- 擴大 `S2T_SAFE` 偵測範圍後，發現 **第三波 100 筆**（`subTools[].description`，6 工具）
- 最終用**位置過濾 opencc** 處理歧義字（`复`→`複`、`里`→`裡`、`于`→`於` 等），又補 **31 筆**

### 修正總數

| 批次 | 字串數 | 工具數 | 欄位 |
|---|---|---|---|
| 第一波：`*_zh` 顯示欄位 | 18 | 15 | `description_zh`/`useCase_zh`/`advantages_zh` |
| 第二波：原文欄位 | 24 | 22 | `description`/`useCase`/`triggers` |
| 第三波：subTools | 69 | 6 | `subTools[].name`/`description` |
| 第四波：歧義字過濾 | 31 | 30 | 多欄位 |
| **合計** | **~143** | **~34**（去重後） | — |

> 確切數字因「單工具多欄位」而難以簡單加總，以「掃描結果 0 殘留」為收斂標準。

### 偵測器擴充：`S2T_SAFE` +52 字

`scripts/fix-simplified.js` 的內建對照表從 21 字擴充到 **73 字**，新增：

```
机→機, 审→審, 谱→譜, 将→將, 绘→繪, 获→獲, 监→監, 词→詞, 脚→腳,
逻→邏, 环→環, 纯→純, 讨→討, 润→潤, 释→釋, 纸→紙, 较→較, 础→礎,
装→裝, 树→樹, 气→氣, 温→溫, 娲→媧, 联→聯, 畅→暢, 灯→燈, 旧→舊,
脑→腦, 栅→柵, 盖→蓋, 状→狀, 满→滿, 断→斷, 栏→欄, 渗→滲, 账→賬,
职→職, 尔→爾, 涨→漲, 积→積, 虫→蟲, 缀→綴, 揽→攬, 尽→盡, 迁→遷,
营→營, 拦→攔, 胀→脹, 访→訪, 许→許, 竞→競, 盘→盤
```

這些字同時補齊了 `check-traditional.js` 門禁的偵測能力與 `fix-simplified.js` 的轉換能力——**治本**。

### 變體字處理

opencc 轉換會引入台灣不常用的變體（`臺`/`衆`/`爲`/`裏`/`佈`），以**語料多數決**還原：
- 平台（232）> 平臺（7）→ 還原 `臺`→`台`
- 社群（134）> 社羣（3）→ 還原 `衆`→`眾`
- 為（752）> 爲（17）→ 還原 `爲`→`為`
- 裡（16）> 裏（1）→ 還原 `裏`→`裡`
- 宣布（55）> 宣佈（47）→ 還原 `佈`→`布`

另發現 opencc 字典缺口：`复雜`→`復雜`（正確應為`複雜`），已手動修正。

### 程式碼層面修正

- `web/server.js`：9 處「公開访客」→「公開訪客」
- `tests/platform-deploy-gate.test.js`：同步修正
- `scripts/fix-simplified.js`：註解中的示例更新
- `DEV_LOG.md`：歷史紀錄中的引用更新

### 驗證

```bash
node scripts/_tmp-sweep.mjs      # 全庫遞迴掃描 → 0 殘留
node scripts/check-traditional.js --full core/ scripts/ web/ tests/ docs/ ...
# → ✅ 201 個檔案，未發現簡體字
```

---

## Q2=A：`check:lang:full` 綠燈

### 問題根因

`docs/knowledge-graph.html` 是機器生成檔（`generate-knowledge-graph.js` 產出），內含 registry 的傾印。registry 清洗前它會帶簡體字；清洗後雖然乾淨，但**行內豁免標記會被下次重建覆蓋**——那種豁免等於不存在。

### 解法

1. **路徑排除**：`scripts/check-traditional.js` 的 `SKIP_PATH_PATTERNS` 新增 `/^docs\/knowledge-graph\.html$/`
2. **行內標記**：`docs/CLASSIFICATION.md`、`HANDOFF.md`、`DEV_LOG.md` 共 28 處歷史引用簡體字，加 `<!-- allow-simplified：逐字引用簡體 bug 本身（歷史紀錄），改了等於塗掉證據 -->`
3. **守門測試擴充**：
   - `tests/check-traditional.test.js`：新增 `docs/knowledge-graph.html` 路徑排除測試（正負控制）
   - `tests/fix-simplified.test.js`：新增 S2T_SAFE 擴充驗證（`机器人`→`機器人`、`公开访客`→`公開訪客`）

### 驗證

```bash
node scripts/check-traditional.js --full core/ scripts/ web/ tests/ docs/ README.md HANDOFF.md DEV_LOG.md AGENTS.md
# → ✅ 201 個檔案，未發現簡體字
```

---

## Q3=A：Worker 部署逐步指令

### 產出

`docs/worker-deploy-guide.md`：8 步驟完整指南

| 步驟 | 內容 |
|---|---|
| 1 | 安裝 wrangler 並登入 Cloudflare |
| 2 | 建立 GitHub fine-grained PAT（僅 `Contents: R/W` + `Pull requests: R/W`） |
| 3 | `wrangler secret put GITHUB_TOKEN` |
| 4 |（選配）`wrangler secret put SUBMIT_TOKEN` |
| 5 | 編輯 `worker/wrangler.toml` 設 `ALLOWED_ORIGINS` |
| 6 | `wrangler deploy` |
| 7 | 把 Worker 網址填回 `web/index.html` 的 `meta[name="tools-add-endpoint"]` |
| 8 | `npm run build` + `git add` + `commit` + `push` |

附：驗收清單（6 項）、故障排除表（5 症狀）、回滾指令。

### 已知限制

- Worker 程式碼（`worker/index.js`）與測試（`tests/worker-tools-add.test.js`，16 項）已於第七輪 Q1=B 完成
- 尚未部署：`meta[name="tools-add-endpoint"]` 仍為空，`web/data/tools-add-endpoint.json` 的 `url` 亦為空
- 部署為**外部操作**，需用戶本人在 Cloudflare 與 GitHub 上執行

---

## Q4=A：`eval:rerank` 完整基線重跑

### 執行

```bash
export AGNES_API_KEY=...
npm run eval:rerank
```

- 評測集：v1.4.0（267 題，可命中 257 筆）
- 模型：預設（`core/llm-rerank.js` 的 DEFAULT_MODEL）
- 路徑：單一路徑（`retrieveWithRerank`）
- 耗時：13 分 46 秒
- 併發：1（序列，預設）

### 結果

| 指標 | 數值 | 說明 |
|---|---|---|
| 詞彙 agent top-1 | 58.0%（149/257） | 未經 rerank 的融合排序 |
| 天花板（正確在 top-20） | 93.8%（241/257） | rerank 可達到的理論上限 |
| LLM rerank 後 | 33.1%（85/257） | **⚠️ 不可採信** |
| 成功呼叫 | 111/257（43.2%） | 146 次因 TPM 限流失敗 |
| 含近義 | 33.9%（87/257） | — |

### 結論：不可採信

**這個基線不能與 v1.4.0 比對。** 原因：

1. **TPM 限流**：端點 `apihub.agnes-ai.com` 的限制綁定**帳號／IP**（非 per-key）。`core/llm-keys.js` 註解記載 2026-09-20 實測：2 把 key → 成功數與 1 把完全相同（23/40），只是失敗平均攤到兩把上。
2. **大 prompt 累積超標**：top-20 × 550 字 ≈ 每題 1.1 萬 token（含 system prompt），連續發送即使 concurrency=1 也會在數分鐘內觸發 429。
3. **失敗時退回融合排序**：eval-rerank.js 在 `error` 時 `continue`，不計入 rerank 成功。這 146 題實際上沒被 rerank，分數自然偏低。

### 解法（需另立裁決或外部條件）

| 方案 | 可行性 | 說明 |
|---|---|---|
| 多把金鑰 | ❌ 已實證無效 | 帳號/IP 綁定，加 key 不增加 TPM |
| 降低 topK（20→10） | ⚠️ 改測試條件 | 減少每次 token 數，但天花板也降了，與舊基線不可比 |
| 降低 DESC_LIMIT（550→300） | ⚠️ 改測試條件 | 同樣改變測試條件 |
| 加請求間延遲（如 2 秒/題） | ✅ 最可行 | 需改 `eval-rerank.js` 或 `llm-rerank.js` 加 throttle |
| 換供應商 | ✅ 長期方案 | 需評估新端點的 CORS、價格、模型品質 |

### 當前狀態

**v1.4.1 基線未產出**。registry 已清洗（143+ 筆簡體字修正），但無法量化對 rerank 路徑的影響。若需有效基線，建議先解決 TPM 問題（加延遲或換供應商）後重跑。

---

## Q5=A：Live 網址輪替機制確認

### 已落地（第七輪）

| 機制 | 位置 | 說明 |
|---|---|---|
| 能力探測 | `web/app.js` `setupStaticSiteBanner()` | `fetch('./api/trending/status')` → ok 則不顯示橫幅 |
| 一致性守門 | `tests/live-url-consistency.test.js` | 3 項測試：index.html 唯一 URL、README 匹配、app.js 無硬編碼 |
| 同源優先中繼 | `web/behavior-tracker.js` `_postToServer()` | 先打 `/api/telemetry`，失敗才 fallback 到 relay meta |

### 驗證

```bash
node -e "const fs=require('fs'); const a=fs.readFileSync('web/app.js','utf8'); console.log('含 agentos-app.run:', a.includes('agentos-app.run')); console.log('能力探測:', a.includes('api/trending/status'));"
# → 含 agentos-app.run: false
# → 能力探測: true
```

---

## Q6=A：裁決頁上 Pages

### 修改

`scripts/build-web.js`：

```javascript
// 修改前（硬編碼兩個檔案）
fs.copyFileSync(..., 'knowledge-graph.html');
fs.copyFileSync(..., 'pipeline-workflow.html');

// 修改後（通配所有 docs/*.html）
for (const entry of fs.readdirSync(docsDir)) {
  if (entry.endsWith('.html')) {
    fs.copyFileSync(path.join(docsDir, entry), path.join(distDir, entry));
  }
}
```

### 驗證

```bash
node -e "const fs=require('fs'); const d='docs/'; const h=fs.readdirSync(d).filter(e=>e.endsWith('.html')); console.log('docs/ HTML:', h.length); for(const f of h) console.log(' ',f);"
# → docs/ HTML: 6
#    decisions-2026-10-15.html
#    decisions-2026-10-15b.html
#    decisions-2026-10-15c.html
#    knowledge-graph.html
#    pipeline-workflow.html
#    relationship-diagram.html
```

---

## Q7=A：每週遙測自動檢查

### 建立自動化

- **名稱**：每週遙測健康檢查
- **頻率**：每週一 09:00
- **動作**：
  1. 讀 `web/data/telemetry-events.jsonl` → 總事件數、近 7 天事件數、類型分佈
  2. 讀 `registry/tools.json` → 總工具數、缺 capabilities 數、近一週新增
  3. 判斷：流量 < 5 或缺 capabilities > 100 → 報告「需關注」+ 建議
  4. 寫入 `.workbuddy-ai/memory/YYYY-MM-DD.md`

### 現況

- 遙測事件：1 筆（allowlist 探針）
- 狀態：「遙測流量過低」——預期內，Pages 上尚無真人使用

---

## 待辦（第八輪收尾後）

1. `eval:rerank` 完成後產出基線檔案並比對 v1.4.0
2. 確認 `docs/benchmarks/` 新檔加入 `docs/README.md` 索引
3. 更新 `registry/tools.json` 的 `version` 欄位為 `1.4.1`（若基線顯著改善）
4. 推送第八輪收尾 commit

---

## 附錄：變更檔案清單

| 檔案 | 變更類型 | 說明 |
|---|---|---|
| `registry/tools.json` | 資料修正 | 143+ 筆簡體字 → 繁體 |
| `registry/zh-translation-state.json` | 資料修正 | 同步更新翻譯快取 |
| `scripts/fix-simplified.js` | 功能擴充 | `S2T_SAFE` +52 字 |
| `scripts/check-traditional.js` | 功能擴充 | `SKIP_PATH_PATTERNS` 加 `knowledge-graph.html` |
| `scripts/build-web.js` | 功能擴充 | 通配複製 `docs/*.html` |
| `web/server.js` | 修正 | 9 處「访客」→「訪客」 |
| `tests/fix-simplified.test.js` | 測試擴充 | S2T_SAFE 擴充驗證 |
| `tests/check-traditional.test.js` | 測試擴充 | 路徑排除正負控制 |
| `tests/platform-deploy-gate.test.js` | 修正 | 「访客」→「訪客」 |
| `docs/CLASSIFICATION.md` | 標記 | 11 處 `allow-simplified` |
| `HANDOFF.md` | 標記 | 12 處 `allow-simplified` |
| `DEV_LOG.md` | 標記 | 5 處 `allow-simplified` |
| `docs/worker-deploy-guide.md` | 新增 | Worker 部署 8 步驟指南 |
| `docs/round8-execution-2026-10-15.md` | 新增 | 本文件 |
| `docs/README.md` | 索引更新 | 裁決頁狀態改「已裁」、加 round8 執行紀錄 |
