---
name: flowchart-spec
description: 專業原生 SVG 流程圖設計與建置規範（基於 ISO 5807 / ANSI 標準）。當使用者提及「流程圖」、「流程圖規範」、「繪製流程圖」、「架構流程圖」、「全鏈路流程圖」、「flowchart」、「SVG 流程圖」或需要以資料驅動、零依賴原生 SVG 渲染流程圖時觸發。包含格點系統計算、標準符號形狀、顯式路由算法、互動四件套與三層審計驗證管線。
metadata:
  type: procedural
---

# Flowchart Spec — 規範級原生 SVG 流程圖架構規範

> 本規範定義了以**零依賴原生 SVG + Vanilla JS** 打造工業級、規範級互動流程圖的完整工程標準與 SOP。嚴禁手寫 SVG 座標，強制採用**資料驅動 (Data-Driven Layout)** 與**幾何程式化審計**。

---

## 核心架構決策 (Core Architectural Decisions)

1. **零依賴原生 SVG + Vanilla JS**：
   - 絕對禁止引入 Mermaid、D3.js 等外部胖依賴——確保純本地離線可用、iframe sandbox 安全且無版本升級斷裂風險。
2. **資料驅動佈局 (Data-Driven Layout)**：
   - 流程圖必須以純資料定義（`nodes: {id, col, row, type, title, lines[]}` ＋ `edges: {from, to, route, label?, cls?}`），由渲染器統一計算座標、路徑與標籤。
   - **禁止手寫座標 SVG**——手寫座標無法審計、無法程式化驗證、極易發生斷裂。
3. **格點系統 (Grid System)**：
   - 定義常數：`nodeWidth`, `nodeHeight`, `colGap`, `rowGap`, `padX`, `padY`, `diamondWidth`, `diamondHeight`（向下相容 `diamondSize`）。
   - 支援小數 `row` 做交錯排列（如 row 1.5, 2.2），讓肘線水平段精準落在列間淨空區域（建議淨距 ≥ 13px），確保線條永不穿透節點或文字。
4. **互動四件套 (Interactive Suite)**：
   - **滾輪縮放**：以滑鼠游標為錨點 (Cursor-Anchored Zoom)，平滑無突跳。
   - **拖曳平移**：Pointer Events (`pointerdown`, `pointermove`, `pointerup` + `setPointerCapture` / `releasePointerCapture`)。
   - **工具列控制**：放大、縮小、🔝 起點置頂 (`fit('top')`)、⛶ 全圖適配 (`fit('all')`)。
   - **自適應與全域註冊**：監聽 `resize` 重算；並註冊 `window.__fcFit = { main: (mode) => fit(mode) }`，供容器從隱藏變可見時（如 `<details>` 展開）調用。
5. **防裁切與防遮擋鐵律 (Zero Occlusion & No-Clipping Layout)**：
   - **圖例解耦**：圖例欄與審計徽章必須位於畫布外的獨立工具列 (`sub-header-bar`)，**畫布內部絕對禁止有 position: absolute 浮動元素遮擋流程圖節點**。
   - **SVG 高度崩塌防護**：
     - `html, body { height: 100%; width: 100%; margin: 0; padding: 0; }`
     - `body { height: 100vh; height: 100dvh; display: flex; flex-direction: column; overflow: hidden; }`
     - `.canvas-viewport { flex: 1 1 0%; min-height: 0; position: relative; overflow: hidden; }`
     - `#flowchart-svg { position: absolute; top: 0; left: 0; width: 100%; height: 100%; overflow: visible; }` 徹底防止 flex 下 SVG 150px 高度崩塌裁切。
   - **頂部起點優先顯示**：預設載入採用 `fit('top')`，鎖定頂部保留 28px~40px 乾淨留白，確保任務起點與首個決策菱形 100% 完整露出。

---

## 標準符號規範 (ISO 5807 / ANSI Standard Shapes)

| 節點類型 (`type`) | 符號意義 | SVG 實作標準 | 幾何與排版規則 |
|---|---|---|---|
| **起訖 (Start/End)** | 流程起點 / 終點 | 膠囊形 (`rect rx = h / 2`) | 綠色邊框 (`--success`)，文字動態垂直置中 |
| **處理 (Process)** | 常規運算、轉換、步驟 | 圓角矩形 (`rect rx = 10`) | 藍色邊框 (`--accent`)，內置標題 + 副行說明 |
| **判斷 (Decision)** | 互斥條件分支（一問擇一） | **橫向扁平菱形** (`polygon 四頂點`) | 警告黃框 (`--warning`)；**寬高比約 2.0 ~ 2.6 (標準寬 180 / 高 72)**；**標題自動折兩行**；**副行嚴禁放菱形內**（文字折兩行處內部水平可用空間需達中文字寬度 2.5 倍以上，兩側保留充沛呼吸感留白） |
| **資料 (Data)** | 輸入 / 輸出 (I/O) | 平行四邊形 (`polygon 斜角 16px`) | 紫色邊框 (`--purple`)，左右斜切 16px |
| **預定義程序 (Subprocess)** | 呼叫子系統、外部沙盒 | 雙線框矩形 (`rect rx=8` + 兩條直線) | 左右內縮 10px 處繪製兩條垂直平行線 |
| **群組容器 (Boundary)** | 平行檢核或次系統邊界 | 虛線圓角矩形 (`stroke-dasharray: 6 4`) | 由 members 的 bbox 自動計算延伸 (上 34px、其餘 20px)，附左上標題 |

> 📌 **文字排版鐵律**：
> - 每個節點必須內嵌 SVG `<title>` 作為原生懸浮詳解。
> - 節點文字必須**依內容行數動態上下置中**，計算公式：`startY = cy - ((totalLines - 1) * lineSpacing) / 2`，禁止固定頂部偏移。

---

## 邊線路由引擎 (Explicit Route Engine)

每條邊線必須顯式指定 `route`，禁止隱式自動猜測：

| 路由類型 (`route`) | 適用拓撲情境 | 精確路徑計算公式 (SVG Path `d`) | 標籤位置 (`labelPt`) |
|---|---|---|---|
| `v` | 同欄自上而下直通 | `M f.bottom.x f.bottom.y L f.bottom.x (t.top.y - 2)` | 線條右側 `(x + 8, midY)` |
| `h` | 同列橫向流向 | `M f.right.x f.right.y L (t.left.x - 2) f.right.y` | 線條上方 `(x1 + 16, y - 8)` |
| `hdown` | 右側展開分支進入下游欄 | `M f.right.x f.right.y L t.top.x f.right.y L t.top.x (t.top.y - 2)` | 水平段上方近起點 |
| `sdown` | 左側回流分支進入下游頂部 | `M f.left.x f.left.y L t.top.x f.left.y L t.top.x (t.top.y - 2)` | 水平段中間上方 |
| `elbow` | 異欄異列標準階梯拐角 | `M f.bottom.x f.bottom.y L f.bottom.x midY L t.top.x midY L t.top.x (t.top.y - 2)`<br>*(midY = (y1 + y2) / 2)* | 水平段上方 `((x1 + x2)/2, midY - 8)` |
| `h2` | 同列跨多欄（避開中間節點） | `M f.b.x f.b.y L f.b.x underY L t.b.x underY L t.b.x (t.b.y + 2)` | 底部繞行段上方 |
| `gdown` | 群組容器底邊進入下游 | `M g.bottom.x g.bottom.y L g.bottom.x (t.top.y - 2)` | 線條右側 |

### 幾何對齊鐵律
1. **邊線起訖點必須 100% 貼齊邊線中點**（菱形頂點即中點）。
2. **箭頭尖端觸線**：路徑末端必須內縮 2px（即 `L target.x (target.y - 2)`），配合 SVG marker `refX="8"` 精確觸摸邊界，審計容差 ≤ 3px。
3. **線條不得穿越節點或文字**：規劃 col/row 格點時，水平段與上下節點需保留 ≥ 13px 淨空空間。

---

## 業務語意檢核原則 (MECE Principles)

1. **判斷菱形＝互斥分支 (Mutex Branches)**：
   - 菱形代表「一問擇一」，每個分支出口必須互斥（例如「是 / 否」、「單一 / 多步驟」）。
   - **禁止將平行、可同時發生的檢核畫成菱形扇出**。
2. **平行檢核＝群組容器 (Subprocess Boundary)**：
   - 若多個檢核步驟平行並發且可同時成立，必須納入虛線群組容器（如「平行三層混合檢索」）。
   - **容器對外僅一進一出**，內部節點之間不畫線、內部節點不直接穿透對外連線。
3. **消除重複判定**：
   - 同一個業務判定條件在整張流程圖中只能出現一次，不得出現重複或冗餘的判斷菱形。

---

## 三層審計驗證管線 (Verification Pipeline)

任何生成的流程圖檔案必須通過三層驗證：

```bash
node scripts/verify-flowchart-spec.js
```

1. **第 0 層：編碼防禦**：全檔嚴格 UTF-8，零 `\uFFFD` 亂碼字元。
2. **第 1 層：語法解析檢查**：以 `new Function(code)` 驗證 HTML 中所有 `<script>` 區塊無語法錯誤。
3. **第 2 層：資料完整性與拓撲審計**：
   - 斷言所有 `nodes.id` 100% 唯一。
   - 斷言所有 `edges` 的 `from` 與 `to` 節點存在，無孤立斷裂節點。
   - 斷言所有邊線之 `route` 均在合法路由清單內 (`v`, `h`, `h2`, `elbow`, `hdown`, `sdown`, `gdown`)。
4. **第 3 層：幾何座標審計**：
   - 依據格點常數重算每條邊線起點與終點座標。
   - 斷言邊線起點與終點對齊節點四邊中點的誤差 ≤ 3px。

---

## 最小可用範例 (Minimal Working Example)

```javascript
const GRAPH_DATA = {
  config: {
    nodeWidth: 236,
    nodeHeight: 68,
    colGap: 72,
    rowGap: 76,
    padX: 72,
    padY: 60,
    diamondWidth: 180,
    diamondHeight: 72
  },
  nodes: [
    { id: 'start', col: 1, row: 0, type: 'start', title: '任務開始', lines: ['觸發指令/咒語'] },
    { id: 'check', col: 1, row: 1, type: 'decision', title: '需求是否\n明確？', lines: [] },
    { id: 'clarify', col: 2, row: 1.5, type: 'process', title: '反向問答釐清', lines: ['確認環境與格式'] },
    { id: 'exec', col: 1, row: 2.2, type: 'process', title: '核心處理程序', lines: ['執行主要運算'] },
    { id: 'end', col: 1, row: 3.2, type: 'end', title: '任務完成', lines: ['交付成果'] }
  ],
  groups: [],
  edges: [
    { from: 'start', to: 'check', route: 'v' },
    { from: 'check', to: 'clarify', route: 'hdown', label: '否: 模糊' },
    { from: 'clarify', to: 'exec', route: 'sdown', label: '收斂回流' },
    { from: 'check', to: 'exec', route: 'v', label: '是: 明確' },
    { from: 'exec', to: 'end', route: 'v' }
  ]
};
```
