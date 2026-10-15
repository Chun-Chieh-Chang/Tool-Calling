# 真人遙測診斷（2026-10-15 Q2=A）

> 執行紀錄。裁決來源：`docs/decisions-2026-10-15.html` Q2=A「診斷入口可見度後再累積 2–4 週」。
> 所有數字皆為 2026-10-15 實測，指令與回應一併列出，可重跑驗證。

## 1. 問題

Q3=A（2026-10-14）以 workbuddy sites 發佈了公開工作台，目的是累積**真人查詢語料**，
用來重校準原型表、並改用真人問句建評測集。發佈約 23 小時後，匯出仍只有 2 筆
`__deploy_smoke_test__` 標記事件——**真人事件 0 筆**。

## 2. 實測證據

| # | 檢查 | 指令 | 結果 |
|---|---|---|---|
| 1 | live 實例存活 | `curl -o /dev/null -w "%{http_code}" <live>/` | `200` |
| 2 | 遙測後端可用 | `curl "<live>/api/telemetry/export?token=<token>"` | `{"count":2, events:[2 筆 smoke test]}` |
| 3 | 寫入路徑可用（公開 Origin） | `curl -X POST <live>/api/telemetry -H "Origin: <live 自身>" -d '{...}'` | `{"ok":true}` HTTP 200 |
| 4 | 落盤持久 | 再次匯出 | `count: 3`（含 #3 那筆）→ 寫入鏈**完全正常** |
| 5 | Pages 有無遙測端點 | 靜態站 `dist/` 內無 `server.js` | 無 `/api/telemetry`（fetch 404、靜默失敗） |
| 6 | 跨域（Pages → live）可行性 | `OPTIONS <live>/api/telemetry -H "Origin: https://<user>.github.io"` | `404`（伺服器無 preflight 處理）→ 跨域被擋 |
| 7 | 寫入觸發條件 | `web/app.js:806-810`、`1355-1358` | 只在「搜尋輸入非空」與「點擊結果卡片」時記錄 |

**結論：後端沒有壞。** 寫入、落盤、匯出三段全部實測通過。問題在**前端事件到不了伺服器**。

## 3. 根因（三層，皆為結構性）

1. **入口不可見**——live 連結只存在 `HANDOFF.md` 與 `.workbuddy-ai/memory/`，沒有任何
   使用者看得到的頁面導流。repo 的 `README.md` 當時只寫 `http://localhost:3000`；
   公開可見的 GitHub Pages 是**唯讀靜態站**，訪客在那裡搜尋、點卡片，事件 POST 到
   不存在的 `/api/telemetry`，404 後靜默丟棄（`behavior-tracker.js` 的設計是絕不干擾前端）。
2. **純瀏覽不產生事件**——遙測只在「有查詢字串的搜尋」與「點擊結果卡片」時記錄。
   看排行榜、知識圖譜、儀表板都**不計事件**，低互動流量下累積極慢。
3. **跨域被刻意擋住**——`/api/telemetry` 原以 `isTrustedOrigin`（同源才信）把關，
   且伺服器沒有 OPTIONS preflight 處理。這是 2026-10-14 防語料毒化的**刻意設計**，
   不是 bug；但它同時封死了「Pages 中繼到 live」這條唯一的補救路。

## 4. 最小修正（本次已實作）

### F1：入口可見（解根因 1）

- `web/index.html` 新增 `#staticSiteBanner` 導流橫幅；`web/app.js` 的
  `setupStaticSiteBanner()` 只在「非本機、非 live 工作台」的純靜態託管顯示
  （本機與 live 自己是完整版，不顯示）。
- `README.md` 新增線上版對照表（完整版 live 連結＋Pages 靜態展示版連結）。
- `web/style.css` 新增 `.static-site-banner`（沿用 neumorphism 配色，非刺眼通知條）。

### F2：Pages 跨域中繼（解根因 3，需顯式開啟）

- 新模組 `web/telemetry-origin.js`：把來源判定抽成可測純函式——
  `isTelemetryOrigin()`（無 Origin／本機／同源／allowlist 四路放行）與
  `telemetryCorsHeaders()`（只有 allowlist 跨域才回 ACAO，同源不回，避免多一條繞過路徑）。
- `web/server.js`：遙測端點改吃 `TELEMETRY_ALLOWED_ORIGINS`（env，逗號分隔，
  **預設空＝行為與發佈時完全一致**）；新增 `OPTIONS /api/telemetry` preflight 處理。
- `web/behavior-tracker.js`：`_postToServer()` 讀 `meta[name="telemetry-relay"]`
  （`web/index.html` 已填 live 網址）；relay 與本站同源或未設定時，行為與原本完全相同。
- 安全邊界：allowlist 不接受萬用字元；陌生跨域一律 403；無 Origin 的 curl 直連維持開放
  （遙測只寫 JSONL，無副作用放大）。

### F3：未做（列為後續選項）

補記「排行榜點擊」等瀏覽事件（根因 2）。這會放大語料量，但也稀釋「真人查詢」的訊號純度，
建議等 F1/F2 生效、觀察 2–4 週後再評估。

## 5. 驗收（實測，皆為本地等價驗證）

`tests/telemetry-origin.test.js`（8 項，來源判定與 CORS 標頭）＋
`tests/telemetry-endpoint.test.js`（既有，事件形狀）＋
本地起 `PORT=3793 TELEMETRY_ALLOWED_ORIGINS=https://<user>.github.io` 的
端到端 12 項：allowlist preflight 204＋ACAO、陌生 preflight 403、allowlist POST 200、
陌生 POST 403、同源 POST 200、無 Origin POST 200、匯出 count 與事件內容正確
（陌生來源的事件確實未落盤）。**12/12 全綠。**

## 6. 待辦（未完成，需外部動作）

1. **重新發佈 live 實例**，並在其環境設 `TELEMETRY_ALLOWED_ORIGINS=https://chun-chieh-chang.github.io`
   ——沒設這條，F2 不會生效（allowlist 預設空）。
2. **推送 Pages 更新**（橫幅＋中繼 meta 要經 `npm run build` 進 `dist/` 才會上 Pages）。
3. 觀察期結束後：`curl "<live>/api/telemetry/export?token=<token>"` 看 `count` 是否成長；
   成長才有語料可用於原型表重校準。
