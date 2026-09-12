# `開發工具` 分類稽核報告

> **日期**：2026-09-12
> **範圍**：`registry/tools.json` 中 `category === "開發工具"` 的全部 **91 筆**
> **狀態**：**提案，尚未套用任何變更**
> **依據**：`docs/CLASSIFICATION.md`、`registry/categories.json`

---

## 摘要

**判定：`開發工具` 是一個變相的「其他」。**

它目前有 91 筆（第 2 大分類），但成員彼此毫無關聯 —— 其中包含 **Linux 核心**、
**GNOME 螢幕閱讀器**、**網頁瀏覽器**、**桌面佈景主題**、**勞工權益專案**、
**Figma 設計工具**、**低程式碼平台**、**資料庫引擎**。

這不是「分類有點雜」，而是**分類失效**：一個使用者若在介面上點開「開發工具」，
得到的是一份無法預期的清單。

### 判定分佈

| 判定 | 筆數 | 說明 |
|------|------|------|
| **A** 確實屬於「開發工具」 | 32 | 保留 |
| **B** 明確誤放，有明確去處 | 20 | 可修正 |
| **C** 無合適去處／需檢視 | 39 | 需 taxonomy 決策或補資料 |
| **合計** | **91** | |

---

## 一、根本原因（RCA）

`開發工具` 不是「逐漸變雜」的，它是**在某一次提交中被指定為傾倒場**。

提交 `f996f69 refactor(categorization): merge 22→18 categories` 的訊息自己寫著：

```
- Merge 資料庫(4) into 開發工具
- Redistribute 基礎設施(6): awesome-selfhosted→學習資源, ontology-ontio/fanqiang→安全性,
                             block-buzz→AI代理, celld/omarchy→開發工具
```

### 實際落點

| 原類別 | 工具 | 現在的歸屬 |
|--------|------|-----------|
| `資料庫` | `postgres-mcp` | → 開發工具 |
| `資料庫` | `duckdb` | → 開發工具 |
| `資料庫` | `sqlite` | → 開發工具 |
| `資料庫` | `sqlitebrowser-sqlitebrowser` | → 開發工具 |
| `基礎設施` | `celld` | → 開發工具 |
| `基礎設施` | `omarchy` | → 開發工具 |
| `基礎設施` | `awesome-selfhosted` | → 學習資源 |
| `基礎設施` | `ontology-ontio` | → 安全性 |
| `基礎設施` | `block-buzz` | → AI 代理 |
| `基礎設施` | `fanqiang` | → 安全性 |

### 為什麼這證明它是「殘餘桶」

`基礎設施` 的 6 筆中，有 **4 筆被賦予了語意上合理的去處**（學習資源／安全性／AI 代理），
只有 `celld`、`omarchy` 這兩筆「找不到家」的被丟進 `開發工具`。
而 `資料庫` 整個類別（4 筆）被**整批**併入，沒有逐筆判斷。

換句話說：**當一個工具找不到家，它就進 `開發工具`。** 這正是「其他」的定義。

### 決定性鐵證

| 指標 | 數值 |
|------|------|
| 全庫「無描述」工具總數 | **7 筆** |
| 其中位於 `開發工具` | **6 筆（86%）** |

`dashi-taskboard`、`openmouse`、`gathered-scenes-zine-skill`、`wechat-ai`、
`photo-abstract-editorial`、`opengym` —— 全都是 `description: "No description provided."`。

一個類別承接了全庫 86% 的「不知道這是什麼」的工具，它與「其他」無異。

---

## 二、B 類：明確誤放（20 筆，有明確去處）

以下每一筆都有**現行 18 分類中語意明確的歸屬**：

| 工具 | 現況 | 建議歸屬 | 理由 |
|------|------|---------|------|
| `postgres-mcp` | 開發工具 | 數據分析 | PostgreSQL 查詢與效能分析 |
| `duckdb` | 開發工具 | 數據分析 | OLAP 分析型資料庫 |
| `sqlite` | 開發工具 | 數據分析 | SQL 資料庫引擎 |
| `sqlitebrowser-sqlitebrowser` | 開發工具 | 數據分析 | SQLite 圖形化管理工具 |
| `sqlmesh-sqlmesh` | 開發工具 | 數據分析 | 資料轉換框架（dbt 替代品） |
| `nocodb-nocodb` | 開發工具 | 數據分析 | 資料庫轉智慧表格（Airtable 替代品） |
| `baserow-baserow` | 開發工具 | 數據分析 | 無程式碼資料庫／應用建構 |
| `tooljet` | 開發工具 | 數據分析 | 內部工具／儀表板建構平台 |
| `figma-sharp` | 開發工具 | UI/UX設計 | Figma → .NET 原生 UI |
| `figma-sds` | 開發工具 | UI/UX設計 | Figma Code Connect + 設計系統 |
| `figma-plugin-samples` | 開發工具 | UI/UX設計 | Figma 外掛範例集 |
| `figma-code-connect` | 開發工具 | UI/UX設計 | Figma 設計 → 程式碼 |
| `paddleocr` | 開發工具 | 文件生產力 | PDF／影像 → 結構化資料 |
| `openclaw` | 開發工具 | AI 代理 | 自架個人 AI 助理 |
| `the-art-of-command-line` | 開發工具 | 學習資源 | Unix 指令的策展教學文件 |
| `destructivecommandguard` | 開發工具 | 安全性 | 阻擋危險 git／shell 指令 |
| `arc-task-gen` | 開發工具 | 研究 | 產生 ARC-AGI 基準測試任務 |
| `3d-web-experience` | 開發工具 | 3D工程繪圖 | 多人 3D 網頁體驗框架 |
| `kunpeng` | 開發工具 | 多媒體生成 | 中文 AIGC 創作工作台 |
| `chrome-devtools-mcp` | 開發工具 | 瀏覽器自動化 | Chrome DevTools Protocol 供代理使用 |

> **注意**：其中 8 筆（`postgres-mcp`、`duckdb`、`sqlite`、`sqlitebrowser`、
> `sqlmesh`、`nocodb`、`baserow`、`tooljet`）指向 `數據分析`，但這其實是**權宜之計** ——
> 它們是「資料庫／資料平台」，與「數據分析」並不完全等義。詳見第三節。

---

## 三、Taxonomy 缺口（需您裁定）

稽核揭露了 **2 個分類體系的結構性缺口**。這不是資料錯誤，是**分類架構本身的問題**。

### 缺口 1：`資料庫` 應該復活

`資料庫` 曾是合法分類（4 筆），在 `f996f69` 被併入 `開發工具` 以達成「18 分類」的目標。

但資料庫工具並沒有消失，反而增加了。若把 B 類中指向資料庫的工具加總：

`postgres-mcp`、`duckdb`、`sqlite`、`sqlitebrowser`、`sqlmesh`、`nocodb`、`baserow`、`tooljet`
→ **8 筆**，且其中 3 筆（`sqlmesh`、`nocodb`、`baserow`）是**合併之後才加入的**。

> **這代表當初的合併決策與現實脫節**：為了湊到 18 個分類而消滅一個真實存在的類別，
> 結果是它的成員全部變成 `開發工具` 的雜訊。

**建議**：恢復 `資料庫`（或更精確的 `資料庫與資料平台`），收納上述 8 筆。

### 缺口 2：「桌面與系統工具」無處可去

以下工具在現行 18 分類中**完全找不到歸屬**：

| 工具 | 性質 |
|------|------|
| `linux` | Linux 核心原始碼 |
| `ladybird` | 網頁瀏覽器引擎 |
| `gnome-orca` | GNOME 螢幕閱讀器（無障礙） |
| `polybar-themes` | 桌面狀態列佈景 |
| `omarchy` | Linux 發行版 |
| `openlogi` | Logitech 滑鼠按鍵重映射 |
| `findphone` | 藍牙裝置定位 |
| `wand-enhancer` | WeMod 桌面應用擴充 |
| `996-icu` | 勞工權益文件專案 |

**建議**：考慮新增 `桌面與系統工具`；或將 `996-icu`（純文件專案）導向 `學習資源`。

---

## 四、C 類：無合適去處／需檢視（39 筆）

依「為什麼難以歸類」分群：

### C1 — AI 開發輔助／MCP 基礎設施（11 筆）

`sequentialthinking`、`mcp-sequential-thinking`、`lean-ctx`、`caveman`、`headroom`、
`opencode-acp`、`codex-autorunner`、`free-claude-code`、`deepseek-harness-desktop-anywhere`、
`dsh-routing-suite`、`dsh-desktop-anywhere`

> 這些是「給 AI 代理用的工具」（MCP 伺服器、context 壓縮、token 節省、代理代理）。
> 它們既非傳統開發工具，也不完全是 `AI 代理`。**可能需要的是一個新類別
> `AI 開發輔助`，或重新界定 `AI 代理` 的邊界。**

### C2 — 桌面／系統／硬體（9 筆）

見第三節「缺口 2」。

### C3 — 專案管理／協作（4 筆）

`kaneo`（Jira 替代品）、`dashi-taskboard`、`canvas-project-manager`、`lark-cli`

### C4 — 其他領域（9 筆）

`speak-human-tw`（繁中 AI 去味）、`reactphp-filesystem`（PHP 非同步檔案庫）、
`react-d3-tree`（React 樹狀圖元件）、`loopx`（迴圈工作流自動化）、
`decimen-optical-transfer`（光學傳遞函數分析）、`os-taxonomy`（作業系統分類法）、
`celld`（Deno 分散式 Durable Objects）、`nativ`（macOS 本機 MLX 模型）、
`car-model-skill`（車款資訊查詢）

### C5 — 資料不足，無法判定（6 筆）

`openmouse`、`gathered-scenes-zine-skill`、`wechat-ai`、`photo-abstract-editorial`、
`opengym`、`dashi-taskboard`

> 全部是 `description: "No description provided."`。
> **必須先補齊描述才能分類** —— 這是前置工作，不是分類問題。

> **稽核後進度**：`opengym` 已於本次查證後補上描述（並發現它是健身應用，
> 且 URL 誤指 fork —— 見六-3）。**剩餘 5 筆仍缺描述。**
> 另註：全庫共 7 筆無描述工具，其中 6 筆集中於此類別（見第一節「決定性鐵證」）。

---

## 五、守衛盲點（重要）

**現行的所有分類守衛都攔不住這件事。**

`scripts/check-mece.js` 只檢查：

1. 是否出現字面值「其他」／「未分類」
2. 類別是否過小（需合併）
3. 類別是否過大（僅**警告**，≥50 筆）
4. `category` 是否符合 schema enum
5. 分類來源一致性（與 `categories.json` 同步）

所以一個 **91 筆、成員彼此毫不相干**的類別，可以**完全通過** `check-mece`、
`categories:check`，以及我們今天剛上線的 CI gate。

**建議新增檢查**：偵測「語意內聚度過低」的類別。可行的啟發式做法：

- 若某類別中「無描述」工具佔比超過門檻 → 警告（本次為 6/91 ≈ 6.6%，但全庫 86% 集中於此）
- 若某類別的工具語言／topics 分佈過於分散 → 警告
- 若某類別的 star 中位數遠低於全庫 → 可能是「不知道放哪就丟這裡」的訊號

這類檢查會有偽陽性，建議以**警告**而非**失敗**呈現，避免誤擋部署。

---

## 六、附帶發現的資料品質問題

### 1. 疑似重複項目

| id | url | stars |
|----|-----|-------|
| `deepseek-harness-desktop-anywhere` | `github.com/anywhere-labs/deepseek-harness-desktop` | 9,576 |
| `dsh-desktop-anywhere` | `github.com/anywhere-labs/dsh-desktop` | 22,262 |

**同一個 GitHub 組織、完全相同的描述、完全相同的 capabilities**，只有 repo 名稱不同。
極可能是**同一個專案被重新命名**（`deepseek-harness-desktop` → `dsh-desktop`）後被重複收錄。
建議查證後合併為一筆。

### 2. star 資料缺失

`開發工具` 中有 7 筆 `stars` 為 0 或未定義：`omarchy`、`openlogi`、
`canvas-project-manager`、`car-model-skill`、`lark-cli`、`cognicode-core`、`cognicode-mcp-driven`。

### 3. URL 錯誤：`opengym` 指向 fork 而非上游

查證後發現兩件事：

**(a) `opengym` 根本不是開發工具。** 它是**自架健身與體重追蹤應用**
（*A self-hosted gym & body-weight tracker you actually own*），有 1,324 個動作的
訓練資料庫、passkey 登入、無廣告無訂閱。它與「開發工具」毫無關係。

**(b) 登錄的 URL 是 fork。** 現行資料為：

```
https://github.com/arvids-unavailable/openGym   ← fork
https://github.com/DuarteSantos8/openGym        ← 上游正版（應採用）
```

`arvids-unavailable` 這個組織名稱本身即暗示該 fork 可能已不可用。
自動探勘腳本抓到 fork 而非上游，導致 description 也抓不到。

> **建議**：更正 URL 為上游；`opengym` 的歸屬則需在第三節的 taxonomy 決策中一併處理
> （現行 18 分類無「健康／健身」相關類別）。

### 4. 自動探勘工具的 `useCase` 欄位語意錯誤

本輪修正的兩筆工具，其 `useCase` 實際內容為：

```
"openGym — 上週漲星 +2726 (2026-W36 自動探勘入庫)。"
```

這是**入庫來源資訊（provenance）**，不是使用場景。`useCase` 欄位語意應描述
「適合什麼情境使用」，但目前被自動探勘腳本填入漲星資訊。
**建議**：修正 `scripts/trending-weekly.js` 的寫入邏輯，將 provenance 移至獨立欄位
（如 `addedAt` / `source`），`useCase` 留空或待人工補寫。

---

## 七、建議行動（分階段）

> **本報告不套用任何變更。** 以下每一階段都需要您明確裁定後才執行。

### 階段 1 — 低風險，可直接執行（需您確認）

把 B 類 20 筆移到有明確歸屬的類別。
**風險**：低。所有目標類別都已存在，不涉及 taxonomy 變更。
**注意**：`數據分析` 暫時吸納 8 筆資料庫工具 —— 若您決定恢復 `資料庫`，這 8 筆應直接進新類別。

### 階段 2 — 需 taxonomy 決策（需您裁定）

1. 是否恢復 `資料庫`（8 筆）
2. 是否新增 `桌面與系統工具`（9 筆）
3. 是否新增 `AI 開發輔助`，或重新界定 `AI 代理` 邊界（11 筆）
4. 是否為 `專案管理／協作`（4 筆）建立歸屬

> **決策順序建議**：先定 taxonomy，再搬工具。反過來做會搬兩次。

### 階段 3 — 資料補齊（前置作業）

1. 補齊 6 筆「無描述」工具的 description（否則無法分類）
2. 查證 `deepseek-harness-desktop-anywhere` 與 `dsh-desktop-anywhere` 是否重複
3. 補齊 7 筆缺失的 star 數

### 階段 4 — 防止再發

為 `check-mece.js` 新增「語意內聚度」警告（見第五節）。

---

## 附錄：全部 91 筆逐筆判定

判定代碼：**A** = 確實屬於開發工具｜**B** = 明確誤放｜**C** = 無去處／需檢視

| # | id | 判定 | 建議／備註 |
|---|----|------|-----------|
| 1 | `postgres-mcp` | B | → 數據分析／資料庫 |
| 2 | `sequentialthinking` | C | C1 AI 開發輔助 |
| 3 | `mcp-sequential-thinking` | C | C1 AI 開發輔助 |
| 4 | `hallmark` | A | |
| 5 | `code-review-graph` | A | |
| 6 | `lean-ctx` | C | C1 AI 開發輔助 |
| 7 | `caveman` | C | C1（Claude Code skill） |
| 8 | `caveman-code` | A | |
| 9 | `openai-mcpkit` | A | |
| 10 | `terax-ai` | A | |
| 11 | `gh-address-comments` | A | |
| 12 | `gitignore` | A | |
| 13 | `openclaw` | B | → AI 代理 |
| 14 | `the-art-of-command-line` | B | → 學習資源 |
| 15 | `cc-switch` | A | |
| 16 | `codexplusplus` | A | |
| 17 | `wand-enhancer` | C | C2 桌面／系統 |
| 18 | `clodex-ide` | A | |
| 19 | `speak-human-tw` | C | C4 |
| 20 | `paddleocr` | B | → 文件生產力 |
| 21 | `harness` | A | |
| 22 | `headroom` | C | C1 AI 開發輔助 |
| 23 | `fff` | A | |
| 24 | `destructivecommandguard` | B | → 安全性 |
| 25 | `gnome-orca` | C | C2 桌面／系統（無障礙） |
| 26 | `duckdb` | B | → 數據分析／資料庫 |
| 27 | `ohmyzsh` | A | |
| 28 | `opencode-acp` | C | C1 AI 開發輔助 |
| 29 | `polybar-themes` | C | C2 桌面／系統 |
| 30 | `open-code-review` | A | |
| 31 | `code-review-skill` | A | |
| 32 | `reactphp-filesystem` | C | C4（函式庫非工具） |
| 33 | `react-d3-tree` | C | C4（UI 元件庫） |
| 34 | `kaneo` | C | C3 專案管理 |
| 35 | `loopx` | C | C4 |
| 36 | `jetbrains-cc-gui` | A | |
| 37 | `996-icu` | C | C2（純文件專案） |
| 38 | `linux` | C | C2 桌面／系統 |
| 39 | `x4g` | A | |
| 40 | `decimen-optical-transfer` | C | C4 科學計算 |
| 41 | `os-taxonomy` | C | C4 |
| 42 | `ladybird` | C | C2（瀏覽器） |
| 43 | `celld` | C | C4（原基礎設施） |
| 44 | `codexbar` | A | |
| 45 | `repobar` | A | |
| 46 | `dashi-taskboard` | C | C5 無描述 |
| 47 | `nativ` | C | C4 |
| 48 | `findphone` | C | C2 硬體周邊 |
| 49 | `openmouse` | C | C5 無描述 |
| 50 | `codex-autorunner` | C | C1 AI 開發輔助 |
| 51 | `plannotator` | A | |
| 52 | `cockpit-tools` | A | |
| 53 | `tree-sitter` | A | |
| 54 | `sqlite` | B | → 數據分析／資料庫 |
| 55 | `rtk` | A | |
| 56 | `open-saas` | A | |
| 57 | `gathered-scenes-zine-skill` | C | C5 無描述 |
| 58 | `wechat-ai` | C | C5 無描述 |
| 59 | `sdkmate` | A | |
| 60 | `spec-kit` | A | |
| 61 | `photo-abstract-editorial` | C | C5 無描述 |
| 62 | `nocodb-nocodb` | B | → 數據分析／資料庫 |
| 63 | `baserow-baserow` | B | → 數據分析／資料庫 |
| 64 | `sqlmesh-sqlmesh` | B | → 數據分析／資料庫 |
| 65 | `sqlitebrowser-sqlitebrowser` | B | → 數據分析／資料庫 |
| 66 | `deepseek-harness-desktop-anywhere` | C | C1＋疑似重複 |
| 67 | `dsh-routing-suite` | C | C1 AI 開發輔助 |
| 68 | `arc-task-gen` | B | → 研究 |
| 69 | `tooljet` | B | → 數據分析／資料庫 |
| 70 | `free-claude-code` | C | C1 AI 開發輔助 |
| 71 | `omarchy` | C | C2 桌面／系統（原基礎設施） |
| 72 | `openlogi` | C | C2 硬體周邊 |
| 73 | `canvas-project-manager` | C | C3 專案管理 |
| 74 | `car-model-skill` | C | C4 |
| 75 | `lark-cli` | C | C3 協作 |
| 76 | `cognicode-core` | A | |
| 77 | `cognicode-mcp-driven` | A | |
| 78 | `3d-web-experience` | B | → 3D工程繪圖 |
| 79 | `figma-sharp` | B | → UI/UX設計 |
| 80 | `figma-sds` | B | → UI/UX設計 |
| 81 | `figma-plugin-samples` | B | → UI/UX設計 |
| 82 | `figma-code-connect` | B | → UI/UX設計 |
| 83 | `fmt` | A | |
| 84 | `chrome-devtools-mcp` | B | → 瀏覽器自動化 |
| 85 | `kunpeng` | B | → 多媒體生成 |
| 86 | `cognicode` | A | |
| 87 | `nvm` | A | |
| 88 | `opengym` | C | **健身追蹤應用**（非開發工具）；URL 誤指 fork，見六-3 |
| 89 | `dsh-desktop-anywhere` | C | C1＋疑似重複 |
| 90 | `grok-bot-0-18-reconstructed` | C | C4 |
| 91 | `pr-agent` | A | |
