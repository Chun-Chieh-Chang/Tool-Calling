# 任務：生成 {SYSTEM_NAME} 的全鏈路架構流程圖

請生成一個完整的、可獨立運行的單檔案 HTML（{FILENAME}.html），作為 {SYSTEM_NAME} 的互動式全鏈路架構流程圖。

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
    diamondH:    74,   // 菱形高度（高軸）
    colGap:      72,   // 欄間距（同列節點水平淨距）
    rowGap:      76,   // 行間距（同行節點垂直淨距）
    padX:       144,   // 畫布左邊距（≥128，避免 L1 等首欄節點貼邊）
    padY:        60    // 畫布上邊距
  },

  nodes: [
    {
      id:      'unique_id',        // 唯一字串 ID（勿用純數字）
      col:     0,                  // 格線欄位（可 0.5 小數）
      row:     0,                  // 格線行位（可 0.5 小數）
      type:    'start|process|decision|end|group',
      title:   '標題文字',         // 菱形限制最多 2 行，用 \n 換行
      lines:   ['副行內容', '更多'], // process 支持多行副文，決策節點通常 []
      module:  'src/file.js:fnName', // 對應該實作檔案與函式
      desc:    '簡短說明（≤60字）',
      cls:     'active|warn|error'  // 可選：邊線樣式
    }
  ],

  groups: [                      // 可選：群組容器（嚴格一進一出，不穿透邊界）
    {
      id:       'grp_name',
      title:    '群組標題',
      members:  ['node_id_1', 'node_id_2'],
      colStart: 1, rowStart: 3, colSpan: 2, rowSpan: 2
    }
  ],

  edges: [                       // 顯式路由邊線（自動計算幾何，嚴格起訖邊線中點對齊）
    { from: 'node_a', to: 'node_b',    route: 'v',     label: '是' },
    { from: 'node_a', to: 'grp_name',  route: 'v',     label: '進入群組 (接頂邊中點)' },
    { from: 'grp_name', to: 'node_c',  route: 'gdown', label: '匯流出群組 (接底邊中點)' }
  ]
};
```

---

## 二、節點型態規範（四種標準形狀）

| type | 形狀 | 語義 | 視覺特徵與幾何排版 |
|---|---|---|---|
| `start` / `end` | 膠囊圓角矩形 rx=h/2 | 流程起點或終點 | 綠色描邊（`accent=success`），文字上下垂直置中 |
| `process` | 圓角矩形 rx=10 | 處理步驟／子程序 | 藍色描邊，內置主標題 + 多行副行說明 + 來源模組 |
| `decision` | 橫向扁平菱形 polygon | 互斥條件分支（一問擇一） | 警告黃框（`--warning`）；寬高比約 2.0~2.6；**僅 title 折兩行，lines[] 強制留空 []** |
| `group` | 虛線圓角容器框（非節點） | 平行檢核／子系統集合 | 紫色虛線（`--purple`）；**對外嚴格一進一出，內部不畫線，絕不穿透邊界** |

**決策節點特殊規則**：
- `title` 換行用 `\n`，嚴禁超過 2 行
- `lines[]` 強制留空 `[]`（副行說明放 SVG `<title>` 懸浮提示）
- 出口條件必須客觀互斥（如「是 / 否」），**嚴禁條件倒置**（不得在尚未執行子系統前預先判定結果）
- 必須有 ≥ 2 條 outgoing edge，每條 `label` 必填

---

## 三、邊線路由引擎（八大標準路由）

```
route: 'v'     同欄自上而下直線   from.bottom → to.top (嚴格同欄 colA = colB, ΔX = 0)
route: 'h'     同列水平向右直通   from.right  → to.left (嚴格同列 rowA = rowB, ΔY = 0, label 置於邊線下方 8px)
route: 'hdown' L型右轉下折分流    from.right  → 右水平 → 垂直下折 → to.top (箭頭垂直打入頂邊正中點)
route: 'sdown' S型左轉下折回流    from.left   → 左水平 → 垂直下折 → to.top (箭頭垂直打入頂邊正中點)
route: 'elbow' 階梯避障彎折       from.bottom → 垂直下行 → midY 水平橫跨 → 垂直下行 → to.top (異欄異列)
route: 'sider' 階梯側邊匯入       from.bottom → 垂直下行 → channelX 列距通道 → 下行至 to.right.y → to.right (箭頭水平打入目標右側邊線正中點，防同軌重疊)
route: 'h2'    跨欄底邊下行繞行   from.bottom → 下降 → 列間橫跨 → 上升 → to.bottom (同列避開中間節點)
route: 'gdown' 群組底邊出口直通   group.bottom → 垂直下行 → to.top (從群組底邊正中點垂直直入下游頂邊正中點)
```

### 幾何對齊與連線鐵律（核心紅線）

1. **同列水平線鐵律 (`route: 'h'`)**：
   - 僅專用於**絕對同列**節點（`row_from === row_to`，$\Delta Y = 0$）。
   - 箭頭 $100\%$ 精準水平射入目標圖塊左側邊線垂直正中點。
   - `label` 必須位於邊線**下方**（`y + 8`），嚴禁位於上方（`y - 8`），避免與菱形頂點重疊。
   - 嚴禁在異列節點誤用 `route: 'h'`（否則會產生 40px+ 偏差射向頂角外緣）。

2. **同欄垂直線鐵律 (`route: 'v'`)**：
   - 僅專用於**絕對同欄**節點（`col_from === col_to`，$\Delta X = 0$）。
   - 嚴禁跨欄誤用 `route: 'v'`（否則會在空白處垂直斷頭懸空）。

3. **起點橫向分流與近列避障鐵律 (`route: 'hdown'`)**：
   - 當來源節點向右下游分流、且兩節點垂直間距極小（$\Delta Y < 60\text{px}$，例如 row 0 底邊到 row 0.5 頂邊）時：
     - **嚴禁使用 `route: 'elbow'`**（因 $midY$ 距離目標頂部過近，會造成貼著起點底邊橫跨、切過目標右上角的 1px 擦邊畸形）。
     - **強制使用 `route: 'hdown'`**（從來源右側邊線正中點水平向右射出，在高空開闊帶橫跨，再垂直直折直入目標頂邊正中點）。

4. **群組容器邊界錨點鐵律（ISO 5807 / ANSI 嚴格規範）**：
   - **邊界絕不穿透**：群組容器為子系統黑盒邊界，**絕對禁止連線穿透紫紅色群組邊框直接連向內部子節點**！
   - **進入群組（一進）**：上游邊線目標必須直接指定為群組 ID（`to: 'grp_id'`），以 `route: 'v'` 嚴格**終止於群組頂部邊界正中點**。
   - **離開群組（一出）**：下游邊線來源必須直接指定為群組 ID（`from: 'grp_id'`），以 `route: 'gdown'` 嚴格**起始於群組底部邊界正中點**。
   - **引擎實體支援**：`calculateEdgePath` 必須支援群組實體（`nodeMap.get(id) || groupMap.get(id)`），由 `groupMap` 計算之 `top` 與 `bottom` 中點對接邊線。

5. **精確內縮與箭頭觸線公式**：
   - SVG marker 規格：`viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6"`。
   - marker tip 伸出路徑 endpoint 距離：$8 \times 6 / 10 = 4.8\text{px}$。
   - 邊線路徑末端統一內縮 **`GAP = 5`**：path endpoint 距邊界 5px，tip 伸入 4.8px 後超出 border 0.2px，視覺上緊貼邊界不浮空、不穿透，審計誤差 $\le 3\text{px}$。

6. **分支匯流防同軌重疊鐵律 (`route: 'sider'`)**：
   - 當目標節點同時接收「上方主垂直流線 (`route: 'v'`)」與「右側回退/匯流分支線」時：
     - **嚴禁使用 `route: 'elbow'` 或 `route: 'sdown'` 盲目灌入頂部中點 (`to.top`)**（因兩條線在同一垂直像素軸重疊流動時，會造成動態虛線波形重合融合成「粗實線」的嚴重視覺 Bug，且標籤文字相互遮擋）。
     - **強制使用 `route: 'sider'` 側邊接入**（從來源底邊出發，在列間淨空帶折向欄間通道，垂直下行後水平射入目標節點**右側邊線垂直正中點 (`to.right`)**）。
   - 保證主幹垂直線貫通無阻、分支線平滑自右側匯入，各邊線 $100\%$ 軌道隔離、零疊字、零共軌。

7. **業務邏輯閉環與死循環防禦**：
   - 決策分流（如置信度 $\ge 0.5$ 與 $< 0.5$）必須在圖面上完整繪製回退線與採納分流線，禁止斷頭懸空。
   - 流程必須收尾於明確的終點節點（`type: 'end'`），禁止死循環（如重審後重新循環回到 POST 新增起點）。
   - 禁止使用未列入標準規範之非法路由（如 `vloop` 原地同軸折返）。

---

## 四、格線幾何系統

```
節點 cx = padX + col × (nodeWidth + colGap) + nodeWidth / 2
節點 cy = padY + row × (nodeHeight + rowGap) + nodeHeight / 2
```

**座標範例**：

```
Row 0  start ──┬──> dec_auth ──┬──> end(exists)
               │              │
               │              └──> llm-classify
               │
               └──> scan-tool  ──> reclassify
                                    │
                                    └──> hook-reclassify ──> saveRegistry
```

---

## 五、色彩系統

### 5.1 流程語義色彩

| 語義 | 色值 | 適用範圍 |
|---|---|---|
| 主色 accent | `#3b82f6` | root、標題、active 邊線 |
| 成功 success | `#10b981` | start 節點、成功邊線 |
| 警告 warning | `#f59e0b` | 分支警告、需人工介入 |
| 危險 danger | `#ef4444` | 錯誤、中止、fallback |
| 中性 muted | `#64748b` | end 節點、info 邊線 |

### 5.2 UI 配色（CSS Custom Properties）

```css
/* Dark 模式 */
:root[data-theme="dark"] {
  --bg-base:        #0a0a0a;
  --bg-surface:     #141414;
  --bg-panel:       rgba(18, 18, 18, 0.94);
  --text-primary:   #e4e4e7;
  --text-secondary: #a1a1aa;
  --text-muted:     #71717a;
  --border:         #27272a;
  --line-color:     rgba(255, 255, 255, 0.12);
  --line-active:    #3b82f6;
  --shadow:         0 8px 32px rgba(0, 0, 0, 0.8);
}

/* Light 模式（語義相同，數值調亮） */
:root[data-theme="light"] { /* 對應變體 */ }
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
  <g id="layer-edges">                     <!-- 邊線層（< 0 疊加節點） -->
    <defs>
      <marker id="arrow-end" ... />
      <marker id="arrow-active" ... />
    </defs>
    <g class="edges-default"></g>
    <g class="edges-active"></g>
    <g class="edges-warn"></g>
    <g class="edges-error"></g>
  </g>
  <g id="layer-nodes"></g>                 <!-- 節點層（> 0 疊加邊線） -->
</g>
```

---

## 七、互動功能規格

### 7.1 必選功能

| 功能 | 實現方式 |
|---|---|
| Dark / Light 主題切換 | CSS Custom Properties + `data-theme` attribute |
| 滾輪縮放 + 拖曳平移 | SVG `transform="translate(x,y) scale(s)"` + `transform-origin: center` |
| Reset 視圖按鈕 | 重置 transform 回 `translate(0,0) scale(1)` |
| 懸浮提示 | SVG `<title>` 原生 tooltip |
| 點擊詳情面板 | 右側固定寬度抽屜，JS 動態填入 HTML |
| 分類圖例 | 左下角靜態列表，點擊切換 `.hidden` class |

### 7.2 可選功能（勾選需要的）

- [ ] **文字搜尋定位**：即時篩選並縮放聚焦匹配節點
- [ ] **節點 hover 連動高亮**：hover 時相連節點與邊線高亮，其餘淡化 40%
- [ ] **啟動脈衝動畫**：start 節點 `@keyframes pulse-ring` 呼吸效果
- [ ] **導出 PNG/SVG**：將當前 SVG 內容另存為下載檔案

### 7.3 詳情面板內容規則

```
start / end  → 標題 + 副文 + 說明 + module 來源
process      → 標題 + 副文 + 說明 + module 來源 + 流程角色
decision     → 條件說明 + 各分支觸發規則 + module 來源
group        → 群組標題 + 成員列表 + 群組說明
```

---

## 八、技術規格與輸出格式

### 8.1 依賴清單

```
零外部 CDN 依賴（純原生 SVG + Vanilla JS）
可選：Google Fonts「JetBrains Mono」（面板代碼字型，僅用於 code 樣式段落）
```

### 8.2 檔案結構

```html
<!DOCTYPE html>
<html lang="zh-TW" data-theme="dark">
<head>
  <meta charset="UTF-8">
  <title>{SYSTEM_NAME}</title>
  <style> /* 全部 CSS */ </style>
</head>
<body>
  <!-- 工具列 -->
  <header>...</header>
  <!-- 圖譜容器 -->
  <main id="main-canvas"><svg id="canvas"></svg></main>
  <!-- 右側詳情抽屜 -->
  <aside id="detail-panel">...</aside>
  <!-- 資料源 -->
  <script id="flow-data" type="application/json">{...}</script>
  <!-- 渲染引擎 -->
  <script> /* 全部 JS */ </script>
</body>
</html>
```

---

## 九、{SYSTEM_NAME} 實例填充區（必填）

```
SYSTEM_NAME        = {系統完整名稱}
FILENAME           = {輸出 HTML 檔名}
DOMAIN_CONTEXT     = {領域描述，例：Tool-Calling AI 工具檢索全流程}
TOTAL_NODES        = {總節點數}
DECISION_COUNT     = {決策節點數}
GROUP_COUNT        = {群組容器數，可為 0}
```

### 主要節點清單

以 bullet points 列出所有節點，格式如下：

```
1. id=xxx  type=start/process/decision/end  title="標題"
   lines=["副文1", "副文2"]  col=X  row=Y
   module="path/to/file.js:function"  desc="說明"  [optional: cls=active|warn|error]

2. id=yyy  type=decision  title="問題？"
   lines=[]  col=A  row=B
   module="path/file.js"  desc="分支說明"
   outgoing: "是"→node_z   "否"→node_w
```

### 群組容器清單（若有）

```
grp_x: title="群組名稱"  members=[id1, id2, id3]  colStart=C  rowStart=R  colSpan=S  rowSpan=T
```

---

## 十、質量守則（生成前檢查門禁）

- [ ] 所有 `id` 唯一，不得使用空字串或純數字 ID（避免 CSS selector 衝突）
- [ ] 同一 `row` 之節點不得使用相同 `col`，避免圖塊重疊
- [ ] 邊線 `from` / `to` 必須是 `nodes` 或 `groups` 中已定義的合法實體 `id`
- [ ] **同列水平線**：凡使用 `route: 'h'`，起訖兩端之 `row` 必須完全相等（$\Delta Y = 0$），箭頭 $100\%$ 精準水平射入目標左側邊線正中點
- [ ] **同欄垂直線**：凡使用 `route: 'v'`，起訖兩端之 `col` 必須完全相等（$\Delta X = 0$），嚴禁跨欄誤用產生垂直斷頭懸空線
- [ ] **起點近列分流**：起點向右橫向分流至相鄰行（$\Delta Y < 60\text{px}$）強制使用 `route: 'hdown'`，嚴禁使用 `elbow` 避免 1px 貼邊橫切畸形
- [ ] **群組邊界絕不穿透**：進入群組接群組頂邊中點（`to: 'grp_id'`），離開群組從群組底邊中點出發（`from: 'grp_id', route: 'gdown'`），嚴禁穿透紫紅色群組邊框
- [ ] **決策邏輯嚴密性**：菱形條件互斥對稱，禁止條件倒置；多級決策（如置信度分流）圖面上必須完整繪製回退線與採納線，禁止斷頭懸空
- [ ] **閉環收尾**：流程必須收尾於明確的終點節點（`type: 'end'`），禁止死循環（如審查後重回新增 API 起點）
- [ ] 所有決策節點的 outgoing edge `label` 必須填滿，不可省略；菱形副行 `lines: []` 強制留空
- [ ] `module` 欄位必須指向實際存在的檔案路徑（如 `core/search-engine.js:extractQueryContext`）
- [ ] `desc` 描述 ≤ 60 字，技術精確，避免模糊形容詞
- [ ] 無外部請求（所有資料 inline，無 fetch/ajax，無 CDN 非必要元件）
- [ ] dark 與 light 主題下文字對比度 ≥ 4.5:1（WCAG AA）
- [ ] Chrome / Firefox / Safari 均無 console error
- [ ] 執行 `node scripts/verify-flowchart-spec.js` 通過三層審計驗證管線（Layer 0~3 幾何對齊誤差 $\le 3\text{px}$）
