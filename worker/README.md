# worker/ — 「加入工具庫」Cloudflare Worker（Q1=B）

2026-10-15 裁決 **Q1=B**：讓外部使用者在 GitHub Pages 上按「＋ 加入工具庫」，
由使用者自備 LLM API key，在瀏覽器端完成掃描與補齊，確認預覽後透過本 Worker
**開 PR**（不直推 main，維持 2026-10-14 第五輪 Q5=B「CI 把關＋merge 模式」）。

## 架構分工

```
瀏覽器（Pages）                        Cloudflare Worker                GitHub
┌──────────────────────────┐          ┌─────────────────────┐          ┌──────────────┐
│ add-tool-dialog.js       │  POST    │ index.js            │  Git     │ 新分支 + PR  │
│  add-pipeline.js         │ ───────► │  validateToolEntry  │ Data API │  CI：npm    │
│   ├ scan-tool.js         │  {tool}  │  mergeToolEntry     │ ───────► │  test／      │
│   └ tool-enricher.js     │          │  commitViaGitData   │          │  validate／  │
│  （使用者 key 只在這裡）  │          │                     │          │  check-mece  │
└──────────────────────────┘          └─────────────────────┘          └──────────────┘
```

- **使用者的 LLM key 不經過 Worker**：瀏覽器直連 `apihub.agnes-ai.com`
  （2026-10-15 實測 CORS 開放：`Access-Control-Allow-Origin: *`）。
- Worker 只驗證 shape、合併 `registry/tools.json`、開 PR。
- 語意正確性（分類 MECE、metadata 完整性）由 PR 上的 CI 把關，人工合併。

## 部署（一次性）

```bash
cd worker
npm install -g wrangler        # 或 npx wrangler
wrangler login

# 1) fine-grained PAT：repo 選 Tool-Calling，權限只需 Contents: Read and write
#    （PR 開立需要 pull-requests: write 時再加；Contents:write 已涵蓋 Git Data API 分支建立）
wrangler secret put GITHUB_TOKEN

# 2)（選配）共享令牌：設定後前端需帶 x-submit-token 標頭
wrangler secret put SUBMIT_TOKEN

# 3) 編輯 wrangler.toml 的 [vars]（REPO_OWNER／REPO_NAME／ALLOWED_ORIGINS）
wrangler deploy
```

部署完成後：

1. 把 Worker 網址（`https://tool-calling-add.<subdomain>.workers.dev`）填入
   **`web/index.html` 的 `<meta name="tools-add-endpoint" content="...">`**。
   🔴 這是**正式路徑**：`web/data/` 在 `.gitignore` 內，放在那裡的設定檔永遠到不了
   CI 的 Pages 建置（CI 從乾淨 clone 建置，檔案不存在）。
   `web/data/tools-add-endpoint.json` 只作本機覆寫用（存在時為後備來源，優先序低於 meta）。
2. `ALLOWED_ORIGINS` 建議設為 GitHub Pages 網址（例
   `https://chun-chieh-chang.github.io`）；留空表示暫不限制來源
   （濫用防線剩每 IP 每小時 5 次 + PR 人工審核）。
3. `npm run build` 重新產生 `dist/` 並推送（GitHub Pages 工作流會部署）。

> 未填 meta 時的行為是**明確的**：Pages 上按「＋ 加入工具庫」會顯示「尚未設定提名端點」
> 與部署說明，不會送出請求（不會靜默失敗）。

## 端點

| 方法 | 路徑 | 說明 |
|---|---|---|
| POST | `/api/tools/add` |  Body `{ "tool": {...}, "meta": {...} }`；回 `pr` 連結或 `duplicate` |
| GET | `/health` | 健康檢查 |

## 濫用防線與已知限制

- **限流是 best-effort**：Cloudflare Workers 的記憶體依 isolate 分佈，同一 IP
  不一定落到同一 isolate，每 IP 每小時 5 次是「降低速度」不是嚴格配額。
  要嚴格配額需 Cloudflare Rate Limiting API（付費）或 Durable Object。
- **Payload 上限 32KB**（單一工具條目遠小於此）。
- **重複提名**：以 id 或 url 命中現有工具即回 `duplicate`，不開 PR。
- **分支碰撞**：同一工具重複提名時分支名加數字後綴（`add/<id>-2`）。

## 本機測試

```bash
node tests/worker-tools-add.test.js   # 純函式：驗證／合併／分支／commit 訊息
node --check worker/index.js          # 語法
```

守門測試會把 `worker/index.js` 的 enum 常數與 `registry/schemas/tool.schema.json`
逐項比對——schema 一改而 Worker 沒跟上就紅燈。
