# Cloudflare Worker 部署指南（「加入工具庫」提名管線）

> 對應 2026-10-15 第六輪 Q1=B 裁決：由 Worker 開 PR，不直推 main。
> 本指南為**外部操作**——需由 repo 擁有者（你本人）在 Cloudflare 與 GitHub 上執行。

---

## 你需要什麼

| 項目 | 用途 | 備註 |
|---|---|---|
| Cloudflare 帳號 | 託管 Worker | 免費層即足夠（每日 10 萬請求） |
| GitHub fine-grained PAT | Worker 代你開 PR | **只限這個 repo**，權限最小化 |
| 本機 Node.js | 執行 wrangler CLI | 不需裝在專案內，`-g` 即可 |

---

## 步驟 1：安裝 wrangler 並登入

```bash
npm install -g wrangler
wrangler login
# 會開瀏覽器讓你授權 Cloudflare 帳號
```

---

## 步驟 2：建立 GitHub fine-grained PAT

1. 前往 [GitHub Settings → Developer settings → Personal access tokens → Fine-grained tokens](https://github.com/settings/personal-access-tokens/new)
2. **Token name**：`tool-calling-add-pr`（或你喜歡的名字）
3. **Expiration**：建議 90 天（到期前 GitHub 會發信提醒）
4. **Resource owner**：選你自己的帳號
5. **Repository access**：**Only select repositories** → 選 `Chun-Chieh-Chang/Tool-Calling`
6. **Permissions**（只需要兩項）：
   - **Contents** → `Read and write`（建立分支、commit、push）
   - **Pull requests** → `Read and write`（開 PR）
7. 點「Generate token」→ **立刻複製**（頁面關閉後無法再看）

> 這個 PAT 的風險範圍極小：只能操作這一個 repo，且 Worker 只會用它開 PR（不會直接推送 main）。

---

## 步驟 3：把 PAT 注入 Worker secret

在專案根目錄執行：

```bash
cd worker
wrangler secret put GITHUB_TOKEN
# 貼上剛才複製的 PAT → 按 Enter
```

> `wrangler secret put` 會把金鑰加密存入 Cloudflare，**不會進 git**。

---

## 步驟 4：（選配）設定提交令牌

如果你希望多一層防線（避免有人直接 POST 到 Worker 網址濫用）：

```bash
wrangler secret put SUBMIT_TOKEN
# 自訂一組亂碼，例如：tool-calling-2026-add-7x9k3m
```

設定後，前端 `web/index.html` 的 `meta[name="tools-add-endpoint"]` 需要帶 `x-submit-token` 標頭——這需要額外改 `web/app.js` 的 `add-pipeline.js`。若暫不啟用，Worker 會接受任何來源的請求（濫用防線只剩 IP 限流）。

---

## 步驟 5：設定來源限制

編輯 `worker/wrangler.toml`，把 `ALLOWED_ORIGINS` 從註解改為實際值：

```toml
[vars]
REPO_OWNER = "Chun-Chieh-Chang"
REPO_NAME = "Tool-Calling"
ALLOWED_ORIGINS = "https://chun-chieh-chang.github.io"
```

> 留空 = 暫不限制來源（任何網站都能送提名）。

---

## 步驟 6：部署

```bash
wrangler deploy
```

成功後會顯示類似：

```
Published tool-calling-add (3.45 sec)
  https://tool-calling-add.<你的-subdomain>.workers.dev
```

**把這個網址記下來**（下一步需要）。

---

## 步驟 7：把 Worker 網址填回前端

編輯 `web/index.html` 第 15 行：

```html
<!-- 修改前 -->
<meta name="tools-add-endpoint" content="">

<!-- 修改後（範例） -->
<meta name="tools-add-endpoint" content="https://tool-calling-add.your-subdomain.workers.dev">
```

> 這是**唯一需要改程式碼**的步驟。`web/data/tools-add-endpoint.json` 只作本機覆寫用（優先序低於 meta），所以即使它存在也不影響 Pages 上的行為。

---

## 步驟 8：重新 build 並推送

```bash
cd ..
npm run build        # 重新產生 dist/（含更新後的 index.html）
git add web/index.html dist/
git commit -m "deploy: 設定 Cloudflare Worker 提名端點"
git push origin main
```

GitHub Actions 會自動部署 Pages。約 1–2 分鐘後：

1. 開啟 Pages 網址 `https://chun-chieh-chang.github.io/Tool-Calling/`
2. 按「＋ 加入工具庫」→ 應該不再顯示「尚未設定提名端點」，而是正常開啟對話框
3. 輸入一個 GitHub repo 網址測試 → 送出後應收到「已開立 PR」連結

---

## 驗收清單

| # | 檢查項 | 預期結果 |
|---|---|---|
| 1 | `wrangler whoami` | 顯示你的 Cloudflare 帳號 |
| 2 | `curl https://<worker>/.well-known/health` | `{"ok":true}` |
| 3 | Pages 上按「＋ 加入工具庫」 | 對話框正常開啟，無「尚未設定」提示 |
| 4 | 提名一個新工具並送出 | Worker 回 `pr` 連結；GitHub 上確實出現新 PR |
| 5 | 同一工具重複提名 | Worker 回 `duplicate`，不開新 PR |
| 6 | 快速連送 6 次 | 第 6 次被限流（429），1 小時後重置 |

---

## 故障排除

| 症狀 | 可能原因 | 解法 |
|---|---|---|
| `wrangler deploy` 失敗「No account found」 | 沒登入或登入過期 | `wrangler login` 重新授權 |
| Worker 回 `{"error":"GitHub API 401"}` | GITHUB_TOKEN 無效或過期 | 在 GitHub 重新產生 PAT，再 `wrangler secret put GITHUB_TOKEN` |
| Worker 回 `{"error":"CORS"}` | ALLOWED_ORIGINS 沒填對 | 確認 Pages 網址（含 `https://`）與 `wrangler.toml` 一致，重新 deploy |
| Pages 仍顯示「尚未設定提名端點」 | `meta` 的 `content` 仍為空，或 `npm run build` 沒跑 | 確認 `web/index.html` 已改、有執行 build、有 push |
| PR 上 CI 失敗 | 提名資料格式不符 schema | 這是預期行為——修正資料後重新提名，或手動改 PR 分支 |

---

## 回滾

若需停用 Worker：

```bash
cd worker
wrangler delete
```

然後把 `web/index.html` 的 `meta[name="tools-add-endpoint"]` 改回 `content=""`，重新 build + push。Pages 會回到「尚未設定提名端點」狀態。

---

## 相關文件

- `worker/README.md` — 架構圖、端點說明、濫用防線細節
- `worker/index.js` — Worker 原始碼（零外部依賴）
- `tests/worker-tools-add.test.js` — 16 項守門測試（validate／merge／限流／enum 比對）
- `HANDOFF.md` §「待外部操作」— 與 Q2 live 重發佈並列的待辦
