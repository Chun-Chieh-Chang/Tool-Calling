# 任務：生成 {SYSTEM_NAME} 的全鏈路架構流程圖

請生成一個完整的互動式全鏈路架構流程圖，輸出格式由第零節指定。

---

## 零、使用前必做：理解目標系統

**在填寫第九節任何欄位之前，強制執行以下步驟。跳過此節將導致業務邏輯錯誤的圖。**

```
STEP 0-A：識別入口文件
  閱讀以下任一存在的文件（按優先順序）：
  1. README.md / docs/ 下的架構說明
  2. 主要入口模組（main.js / cli.js / app.py / server.js / index.ts）
  3. 資料流說明（ARCHITECTURE.md、DESIGN.md、FLOW.md）

STEP 0-B：萃取核心流程骨架
  從源碼或文件中辨識：
  - 系統的起點觸發條件（用戶輸入？排程？API 呼叫？）
  - 主要處理階段（≥ 3 個，≤ 12 個）
  - 決策分支點（條件必須互斥，且有明確的「是/否」或 A/B）
  - 終點（成功輸出、錯誤中止、或持續循環）

STEP 0-C：驗證推導正確性
  對每個節點確認：
  - 有對應的真實原始碼位置（檔名:函式名）
  - 描述的是系統「實際在做什麼」，不是「應該做什麼」
  - 邏輯上能從上個節點到達此節點
```

---

## 一、資料驅動架構

所有視覺元素由單一 `GRAPH_DATA` JavaScript 物件驅動，渲染引擎與資料完全分離。

### 1.1 GRAPH_DATA 結構

```javascript
const GRAPH_DATA = {
  config: {
    nodeWidth:  236,   // 標準流程節點寬度
    nodeHeight:  68,   // 標準流程節點高度
    diamondW:    170,  // 菱形寬度（寬軸）
    diamondH:     74,  // 菱形高度（高軸）
    colGap:       72,  // 欄間距（同列節點水平淨距）
    rowGap:       76,  // 行間距（同行節點垂直淨距）
    padX:        144,  // 畫布左邊距（≥128，避免首欄節點貼邊）
    padY:         60   // 畫布上邊距
  },

  nodes: [
    {
      id:      'unique_id',        // 唯一字串 ID（勿用純數字，避免 CSS selector 衝突）
      col:     0,                  // 格線欄位（可 0.5 小數）
      row:     0,                  // 格線行位（可 0.5 小數）
      type:    'start|process|decision|end|group',
      title:   '標題文字',          // 菱形限制最多 2 行，用 \n 換行
      lines:   ['副行內容', '更多'], // process 支持多行副文；決策節點強制留空 []
      module:  'src/file.js:fnName', // 對應實作檔案與函式（必須真實存在）
      desc:    '說明（≤60字）',
      cls:     'active|warn|error'  // 可選：邊線樣式
    }
  ],

  groups: [                       // 可選：群組容器（嚴格一進一出，不穿透邊界）
    {
      id:       'grp_name',
      title:    '群組標題',
      members:  ['node_id_1', 'node_id_2'],
      colStart: 1, rowStart: 3, colSpan: 2, rowSpan: 2
    }
  ],

  edges: [
    { from: 'node_a', to: 'node_b',    route: 'v',     label: '是' },
    { from: 'node_a', to: 'grp_name',  route: 'v',     label: '進入群組' },
    { from: 'grp_name', to: 'node_c',  route: 'gdown', label: '匯流出群組' }
  ]
};
```

---

## 二、節點型態規範（四種標準形狀）

| type | 形狀 | 語義 | 視覺特徵 |
|---|---|---|---|
| `start` / `end` | 膠囊圓角矩形 rx=h/2 | 流程起點或終點 | 成功綠色描邊，文字垂直置中 |
| `process` | 圓角矩形 rx=10 | 處理步驟／子程序 | 主色描邊，主標題 + 多行副行 + 來源模組 |
| `decision` | 橫向扁平菱形 polygon | 互斥條件分支 | 警告黃框；**僅 title 折兩行（`\n`）；lines[] 強制留空 []** |
| `group` | 虛線圓角容器框 | 平行子系統集合 | 紫色虛線；**嚴格一進一出，絕不穿透邊界** |

**決策節點特殊規則**：
- 出口條件必須客觀互斥（「是/否」），**嚴禁條件倒置**（不得在子系統執行前預判結果）
- 必須有 ≥ 2 條 outgoing edge，每條 `label` 必填

---

## 三、邊線路由引擎（九大標準路由）

```
route: 'v'     同欄垂直直線（↓）  from.bottom → to.top
               條件：col_from === col_to（ΔX = 0），嚴禁跨欄使用

route: 'gdown' 群組底邊出口（↓）  group.bottom → to.top
               條件：from 為群組 ID，從底邊正中點垂直直入下游頂邊正中點

route: 'h'     同列水平向右（→）  from.right → to.left
               條件：row_from === row_to（ΔY = 0），label 置邊線下方 8px
               嚴禁在異列節點使用（否則箭頭射向頂角外緣產生 40px+ 偏差）

route: 'hl'    同列水平向左（←）  from.left → to.right
               條件：row_from === row_to（ΔY = 0），h 的鏡像，用於回流分支

route: 'hdown' L 型右轉下折（→↓） from.right → 水平 → to.top
               用於：向右分流後需向下進入目標頂邊正中點
               必用情境：ΔY < 60px 的近列右向分流（此時 elbow 會產生 1px 擦邊畸形）

route: 'sdown' S 型左轉下折（←↓） from.left → 水平 → to.top
               用於：向左分流後需向下進入目標頂邊正中點

route: 'sider' 側邊右壁匯入（↓→） from.bottom → 垂直 → channelX → to.right
               用於：防同軌重疊。當目標節點同時接收垂直主線(v)與側向分支時，
               側向分支強制使用 sider，箭頭從目標右側邊線中點水平射入
               嚴禁此場景用 elbow/sdown（兩線同軸重疊，動態虛線融合成粗實線）

route: 'elbow' 階梯彎折（↓→↓）   from.bottom → midY 水平橫跨 → to.top
               用於：異欄異列的一般繞行連線

route: 'h2'    底邊下行跨欄繞行   from.bottom → 下降 → 橫跨 → to.bottom
               用於：同側節點避開正面障礙（目標從下方接入）

已廢棄（禁止使用）：
route: 'vloop' ❌ 2026-09-02 廢棄。同軸折返導致兩條線重疊，動畫呈粗實線視覺 bug。
```

### 路由選擇速查

| 情境 | 正確路由 | 禁止使用 |
|---|---|---|
| 同欄，上→下 | `v` | `elbow`、`hdown` |
| 同列，左→右 | `h` | `v` |
| 同列，右→左（回流） | `hl` | `h` |
| 右向分流，ΔY < 60px | `hdown` | `elbow`（1px 擦邊畸形） |
| 目標接收兩條線（垂直主線 + 側向分支） | 側向用 `sider` | `elbow`、`sdown`（同軸重疊） |
| 群組出口 | `gdown` | `v` |
| 異欄異列一般彎折 | `elbow` | — |

---

## 四、格線幾何系統

```
節點中心座標：
  cx = padX + col × (nodeWidth + colGap) + nodeWidth / 2
  cy = padY + row × (nodeHeight + rowGap) + nodeHeight / 2

SVG Marker 箭頭觸線公式（不可改動）：
  tip_offset = refX × (markerWidth / viewBox) = 8 × (6 / 10) = 4.8px
  路徑末端統一內縮 GAP = 5px（緊貼）或 6px（保守）
  ❌ 禁止將 refX 值（8）直接當作 tip_offset
  ❌ 禁止使用 GAP < 5（箭頭穿透邊框）
```

---

## 五、色彩系統

### 5.1 流程語義色彩（跨主題不變）

| 語義 | 適用範圍 |
|---|---|
| **主色 / accent** | 流程線、主要節點邊框、活躍狀態 |
| **成功 / success** | start / end 節點 |
| **警告 / warning** | decision 菱形框 |
| **危險 / danger** | 錯誤分支、fallback 路徑 |
| **紫色 / purple** | group 容器虛線框 |
| **靜默 / muted** | 預設流程線 |

### 5.2 UI 配色方案（選擇一種，或自訂）

**方案 A：深藍科技風（Slate 調色系，Tool-Calling 原版）**
```css
:root[data-theme="dark"] {
  --bg-base: #0F172A; --bg-surface: #1E293B;
  --text-primary: #F1F5F9; --text-secondary: #94A3B8;
  --accent: #60A5FA; --success: #34D399; --warning: #FBBF24;
  --danger: #F87171; --purple: #C084FC;
  --line-color: #64748B; --line-active: #60A5FA;
  --node-fill: #1E293B; --node-stroke: #475569;
}
:root[data-theme="light"] {
  --bg-base: #F9FAFB; --bg-surface: #FFFFFF;
  --text-primary: #111827; --text-secondary: #6B7280;
  --accent: #3B82F6; --success: #10B981; --warning: #F59E0B;
  --danger: #EF4444; --purple: #A855F7;
  --line-color: #94A3B8; --line-active: #3B82F6;
  --node-fill: #FFFFFF; --node-stroke: #CBD5E1;
}
```

**方案 B：純黑極簡風**
```css
:root[data-theme="dark"] {
  --bg-base: #0a0a0a; --bg-surface: #141414;
  --text-primary: #e4e4e7; --text-secondary: #a1a1aa;
  --accent: #3b82f6; --success: #10b981; --warning: #f59e0b;
  --danger: #ef4444; --purple: #a855f7;
  --line-color: rgba(255,255,255,0.18); --line-active: #3b82f6;
  --node-fill: #141414; --node-stroke: #3f3f46;
}
```

**方案 C：自訂（替換語義色值即可，無需更動渲染邏輯）**
```css
/* 只需為以下變數賦值，渲染引擎自動套用 */
--accent, --success, --warning, --danger, --purple,
--bg-base, --bg-surface, --text-primary, --text-secondary,
--line-color, --line-active, --node-fill, --node-stroke
```

---

## 六、SVG 渲染管線

渲染順序（嚴格）：

1. **computeGeometry()** — 所有節點 BBox 與錨點，建立 `nodeMap`
2. **computeGroupBounds()** — 群組容器邊界，建立 `groupMap`
3. **renderGroupRects()** — 在 `layer-groups` 渲染群組框
4. **renderEdges()** — 在 `layer-edges` 渲染 path + arrow marker + label
5. **renderNodes()** — 在 `layer-nodes` 渲染 rect/polygon + text + click handler

### 六層 SVG `<g>` 結構

```svg
<g id="flowchart">
  <g id="layer-grid"  opacity:0.04></g>   <!-- 背景網格（可選） -->
  <g id="layer-groups"></g>                <!-- 群組容器 -->
  <g id="layer-edges">                     <!-- 邊線層（< nodes 疊加順序） -->
    <defs>
      <marker id="arrow-end" ... />
      <marker id="arrow-active" ... />
    </defs>
    <g class="edges-default"></g>
    <g class="edges-active"></g>
    <g class="edges-warn"></g>
    <g class="edges-error"></g>
  </g>
  <g id="layer-nodes"></g>                 <!-- 節點層 -->
</g>
```

---

## 七、互動功能規格

### 7.1 必選功能

| 功能 | 實現方式 |
|---|---|
| Dark / Light 主題切換 | CSS Custom Properties + `data-theme` attribute |
| 滾輪縮放 + 拖曳平移 | SVG `transform="translate(x,y) scale(s)"` |
| Reset 視圖按鈕 | 重置 transform 回 `translate(0,0) scale(1)` |
| 懸浮提示 | SVG `<title>` 原生 tooltip |
| 點擊詳情面板 | 右側固定寬度抽屜，JS 動態填入 |

### 7.2 可選功能

- [ ] 文字搜尋定位（即時篩選節點）
- [ ] Hover 連動高亮（相連節點與邊線）
- [ ] 啟動脈衝動畫（start 節點 pulse-ring）
- [ ] 導出 PNG / SVG

---

## 八、技術規格與輸出格式

### 8.1 輸出模式（填寫第九節時選擇）

**模式 A — 完整單一 HTML 檔**
AI 輸出一個可直接在瀏覽器開啟的 `.html` 檔，包含：
- 完整 CSS（含兩種主題）
- 完整 SVG 渲染引擎 JS
- `GRAPH_DATA` 物件（inline 於 JS）
- 所有互動功能

```html
<!DOCTYPE html>
<html lang="zh-TW" data-theme="dark">
<head>
  <meta charset="UTF-8">
  <title>{SYSTEM_NAME}</title>
  <style>/* 全部 CSS */</style>
</head>
<body>
  <header><!-- 工具列 --></header>
  <main id="main-canvas"><svg id="canvas"></svg></main>
  <aside id="detail-panel"><!-- 詳情抽屜 --></aside>
  <script>
    const GRAPH_DATA = { /* ... */ };
    /* 全部渲染引擎 JS */
  </script>
</body>
</html>
```

**模式 B — 純資料規格（GRAPH_DATA only）**
AI 只輸出結構化的 `GRAPH_DATA` JSON，搭配固定渲染引擎模板使用。
適用於：已有渲染引擎、只需替換資料；或需要版本控制圖譜資料。

```json
{
  "meta": {
    "system": "{SYSTEM_NAME}",
    "version": "1.0",
    "generated": "{DATE}"
  },
  "config": { "nodeWidth": 236, "nodeHeight": 68, "colGap": 72, "rowGap": 76, "padX": 144, "padY": 60 },
  "nodes": [ ... ],
  "groups": [ ... ],
  "edges": [ ... ]
}
```

### 8.2 技術約束

```
零外部 CDN 依賴（純原生 SVG + Vanilla JS）
可選：Google Fonts「JetBrains Mono」（面板代碼字型，僅 code 段落）
無外部請求（所有資料 inline，無 fetch/ajax）
Dark / Light 主題下文字對比度 ≥ 4.5:1（WCAG AA）
目標瀏覽器：Chrome / Firefox / Safari 無 console error
```

---

## 九、{SYSTEM_NAME} 實例填充區（必填）

> **先完成第零節的三個步驟，再填寫此節。**

```
輸出模式        = A（完整 HTML）| B（純 GRAPH_DATA）
色彩方案        = A（深藍科技）| B（純黑極簡）| C（自訂）
SYSTEM_NAME    = {系統完整名稱}
FILENAME       = {輸出 HTML 檔名，僅模式 A 需填}
DOMAIN_CONTEXT = {一句話描述系統用途}
語言           = {zh-TW | en | 其他}
```

### 節點清單（格式範例）

```
1. id=start       type=start     title="使用者輸入"
   lines=[]       col=0  row=0
   module="入口模組路徑"   desc="系統觸發條件"

2. id=dec_auth    type=decision  title="需要驗證？"
   lines=[]       col=0  row=1
   module="auth/middleware.js"   desc="判斷請求是否需要身份驗證"
   outgoing: "是"→verify_token   "否"→process_request

3. id=process_x   type=process   title="主要處理"
   lines=["子步驟 A", "子步驟 B"]  col=0  row=2
   module="core/handler.js:process"  desc="核心業務邏輯"
```

### 群組容器（若有）

```
grp_x: title="子系統名稱"  members=[id1, id2]
       colStart=C  rowStart=R  colSpan=S  rowSpan=T
```

### 邊線清單（可由節點清單推導，或顯式列出）

```
start → dec_auth         route=v    label=""
dec_auth → verify_token  route=h    label="是"
dec_auth → process_x     route=v    label="否"
```

---

## 十、質量守則（生成前自我檢查）

**業務邏輯層**
- [ ] 所有節點對應真實源碼位置（`module` 欄位可驗證）
- [ ] 每個決策節點出口條件互斥且完整（無遺漏分支）
- [ ] 流程從 `start` 到 `end` 至少存在一條可達路徑
- [ ] 無死循環（回流分支必須有退出條件）
- [ ] 邏輯順序正確（決策在執行之前，結果在執行之後）

**幾何正確性層**
- [ ] 所有 `id` 唯一，不含純數字 ID
- [ ] 同一 `row` 無兩個節點使用相同 `col`
- [ ] 邊線 `from` / `to` 均為已定義的合法 ID
- [ ] `route: 'h'` / `'hl'` 使用前確認 row 完全相等（ΔY = 0）
- [ ] `route: 'v'` 使用前確認 col 完全相等（ΔX = 0）
- [ ] ΔY < 60px 的右向分流使用 `hdown`，不用 `elbow`
- [ ] 目標接收兩條線時，側向分支使用 `sider`，不用 `elbow` / `sdown`
- [ ] 群組連線接群組邊界（`to: 'grp_id'`），離開用 `gdown`

**視覺品質層**
- [ ] 群組邊界不被任何邊線穿透
- [ ] 所有決策節點 outgoing edge `label` 均已填寫
- [ ] `desc` ≤ 60 字，無模糊形容詞
- [ ] Dark / Light 兩種主題均無對比度問題
- [ ] 無外部依賴請求（CDN、API）
