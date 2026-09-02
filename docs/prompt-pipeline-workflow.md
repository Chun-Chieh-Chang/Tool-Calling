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

  groups: [                      // 可選：群組容器（一進一出）
    {
      id:       'grp_name',
      title:    '群組標題',
      members:  ['node_id_1', 'node_id_2'],
      colStart: 1, rowStart: 3, colSpan: 2, rowSpan: 2
    }
  ],

  edges: [                       // 顯式路由邊線（自動計算幾何，不需手寫 path）
    { from: 'node_a', to: 'node_b', route: 'v',    label: '是' },
    { from: 'node_a', to: 'node_c', route: 'hdown', label: '否' }
  ]
};
```

---

## 二、節點型態規範（四種）

| type | 形狀 | 語義 | 視覺特徵 |
|---|---|---|---|
| `start` / `end` | 膠囊圓角矩形 rx=h/2 | 流程起點或終點 | 綠色描邊（accent=success） |
| `process` | 圓角矩形 rx=10 | 處理步驟／子程式 | 主副多行文字 + 來源標籤 |
| `decision` | 菱形 polygon | 條件分支 | 僅 title，lines[] 留空 |
| `group` | 容器框（非節點） | 平行模組分組 | 由 groups[] 定義，不自列於 nodes |

**決策節點特殊規則**：
- `title` 換行用 `\n`
- `lines[]` 建議留空 `[]`
- 必須有 ≥2 條 outgoing edge，每條 `label` 必填（是/否、條件A/條件B）

---

## 三、邊線路由引擎（八種）

```
route: 'v'     同欄直線    from.bottom → to.top
route: 'h'     同列水平    from.right  → to.left（label 置於邊線**下方** 8px）
route: 'hdown' L型右轉下    from.right → 右 → 下 → to.top（分流）
route: 'sdown' S型返回     from.bottom → 下 → 右 → 下 → to.top（匯流）
route: 'elbow' L型彎折     自動選最簡捷方向（異欄異列）
route: 'h2'    橫跨下行    from.bottom → 下降 → 橫跨 → 上升 → to.bottom
route: 'gdown' 群組出口    從群組底邊中點垂直下行
route: 'vloop' 回流線      同欄向下繞回上方節點（從 from.bottom 下行至 hook 後水平回流至 to.top）
```

**鐵律**：
- 路徑末端內縮 **6px** 預留箭頭空間（marker refX=8, refY=5，tip 約伸入 5-6px）；起訖點 100% 貼齊錨點邊線中點，不允許浮空
- `route: 'h'` 的 label 必須位於邊線**下方**（`y + 8`），不得位於上方（`y - 8`），避免與菱形頂點重疊
- `route: 'vloop'` 專用於同欄循環回流；不得用於異欄連接（否則落入 default 生成對角斜線）
- `start` 節點如需連接非第一列節點，使用 `route: 'v'`（垂直向下）而非 `route: 'h'`（水平穿越空白區域）
- **渲染順序**：edges → nodes → groups（群組邊界最後繪製，確保浮在邊線上方遮擋穿透）
- **群組背景**：`.svg-group-rect` 必須使用半透明 fill（如 `rgba(accent-rgb, 0.04)`）遮擋穿過的邊線

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

## 十、質量守則（生成前檢查）

- [ ] 所有 `id` 唯一，不得使用空字串或純數字 ID（避免 CSS selector 衝突）
- [ ] 同一 `row` 之節點不得使用相同 `col`，避免重疊
- [ ] 邊線 `from` / `to` 必須是 `nodes` 中已定義的 `id`
- [ ] 所有決策節點的 outgoing edge `label` 必須填滿，不可省略
- [ ] `module` 欄位必須指向實際存在的檔案路徑（如 `core/search-engine.js:extractQueryContext`）
- [ ] `desc` 描述 ≤ 60 字，技術精確，避免模糊形容詞
- [ ] 無外部請求（所有資料 inline，無 fetch/ajax，無 CDN 非必要元件）
- [ ] dark 與 light 主題下文字對比度 ≥ 4.5:1（WCAG AA）
- [ ] Chrome / Firefox / Safari 均無 console error
