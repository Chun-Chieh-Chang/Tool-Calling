# 任務：生成 {SYSTEM_NAME} 的互動式知識圖譜

請生成一個完整的、可獨立運行的單檔案 HTML（{FILENAME}.html），作為 {SYSTEM_NAME} 的互動式全景知識圖譜。

---

## 一、資料結構定義

### 1.1 節點（{ENTITY}）基本結構

```json
{
  "id": "唯一識別字串",
  "name": "顯示名稱",
  "description": "一句話說明（≤80字）",
  "category": "所屬分類",
  "{CUSTOM_FIELD_A}": "...",
  "{CUSTOM_FIELD_B}": "...",
  "parent_id": null,
  "connections": ["related_id_1", "related_id_2"]
}
```

### 1.2 邊（Edge）生成規則

邊線由下列規則自動產生，無需手列：

| 邊線來源 | 條件 | 用途 |
|---|---|---|
| 分類聚合 | 同一 `category` 的所有 {ENTITY} → 各自連線到該分類節點 | 建立分層架構 |
| 明確連接 | `{ENTITY}.connections[]` 中有目標 `id` | 建立自定义關係 |
| 父子鏈 | `{ENTITY}.parent_id` 指向另一個 `id` | 建立嵌套階層（BOM / 組織架構） |

**不產生任何沒有明確來源的邊線。**

### 1.3 分類變數說明（填寫時二擇一）

```
{DOMAIN_CONFIG}  = {
  graph_type: "tree" | "graph" | "hierarchy" | "hybrid",
  custom_fields: ["field_a", "field_b"],      // 領域特有欄位
  category_color_overrides: {                 // 可选：覆蓋特定分類色（HSL hex）
    "分類A": "#dc2626",
    "分類B": "#0284c7"
  }
}
```

- **tree** — root → 分類 → {ENTITY}（單一中心擴散，適用分類目錄）
- **graph** — {ENTITY} 互相透過 connections 連線（適用關係網絡，無分類星團）
- **hierarchy** — root → level1 → level2 → … → {ENTITY}（適用 BOM / 組織架構多階層）
- **hybrid** — 以上組合（例如：BOM 展階 + 類別色標）

---

## 二、色彩系統（動態 HSL 色相環）

### 2.1 自動配色演算法

1. 讀取全部 {ENTITY} 的 `category` 欄位，取得去重分類列表 `[C1, C2, ..., CN]`
2. 對每個分類計算色相：
   ```
   hue = Math.floor((index × 360) / N_categories)
   saturation = 65%
   lightness    = 48%
   → hsl(hue, 65%, 48%)
   ```
3. 若 `category_color_overrides` 中有同名分類，使用覆寫值
4. 根節點（總索引）固定使用中性藍：`#0284c7`

### 2.2 UI 配色（CSS Custom Properties）

```css
/* Dark 模式（預設） */
:root[data-theme="dark"] {
  --bg-base:         #0a0a0a;
  --bg-surface:      #141414;
  --bg-panel:        rgba(18, 18, 18, 0.94);
  --text-primary:    #e4e4e7;
  --text-secondary:  #a1a1aa;
  --text-muted:      #71717a;
  --border:          #27272a;
  --accent:          #3b82f6;
  --line-color:      rgba(255, 255, 255, 0.12);
  --line-active:     #3b82f6;
  --shadow:          0 8px 32px rgba(0, 0, 0, 0.8);
}

/* Light 模式 */
:root[data-theme="light"] {
  --bg-base:         #f4f4f5;
  --bg-surface:      #ffffff;
  --bg-panel:        rgba(255, 255, 255, 0.94);
  --text-primary:    #18181b;
  --text-secondary:  #52525b;
  --text-muted:      #71717a;
  --border:          #e4e4e7;
  --accent:          #2563eb;
  --line-color:      rgba(0, 0, 0, 0.1);
  --line-active:     #2563eb;
  --shadow:          0 8px 32px rgba(0, 0, 0, 0.08);
}
```

---

## 三、幾何格點系統

所有節點以 `col`（欄）與 `row`（行）座標定位，支援小數。

### 3.1 計算公式

```
cx = padX + col × (nodeWidth + colGap) + nodeWidth / 2
cy = padY + row × (nodeHeight + rowGap) + nodeHeight / 2
```

### 3.2 錨點定義（用於邊線貼齊）

```
top:    (cx, cy - height / 2)
bottom: (cx, cy + height / 2)
left:   (cx - width  / 2, cy)
right:  (cx + width  / 2, cy)
```

### 3.3 節點尺寸規格

| type | 寬度 | 高度 | 圓角 |
|---|---|---|---|
| root / start / end | 180 | 44 | rx: 22（膠囊） |
| category | 150 | 52 | rx: 10 |
| entity | 130 | 48 | rx: 8 |
| decision | 160 | 72 | 菱形（四頂點 polygon） |

---

## 四、SVG 渲染管線

渲染順序（嚴格）：

1. **computeGeometry()** — 計算所有節點 BBox 與錨點，建立 `nodeMap`
2. **computeGroupBounds()** — 計算群組容器邊界，建立 `groupMap`
3. **renderGroupRects()** — 在 `layer-groups` 渲染群組框與標題
4. **renderEdges()** — 在 `layer-edges` 渲染邊線（path + arrow marker + label）
5. **renderNodes()** — 在 `layer-nodes` 渲染節點（rect/polygon + text + click handler）

### 4.1 邊線路由語法

```javascript
// 八種顯式路由
'v'     → 同欄直線：from.bottom → to.top
'h'     → 同列水平：from.right  → to.left
'hdown' → L型：先向右 → 再向下（用於從主流程分流）
'sdown' → S型：先向下 → 再向右 → 再向下（用於返回主流程）
'elbow' → 自動選擇最簡捷的 L 型彎折
'h2'    → 橫跨下行：from.bottom → 下降至目标下方 → 水平 → 上升 → to.bottom
'gdown' → 群組容器出口：從群組下邊中點垂直下行
'vloop' → 回流線：從 from 下方繞回上方 to（用於反馈循環）
```

**鐵律**：所有路徑末端內縮 2px 預留箭頭空間，起點與終點 100% 貼齊錨點。

---

## 五、互動功能規格

### 5.1 必選功能

| 功能 | 實現方式 |
|---|---|
| Dark / Light 主題切換 | CSS Custom Properties + `data-theme` attribute |
| 滾輪縮放 + 拖曳平移 | SVG `transform="translate(x,y) scale(s)"` + `transform-origin: center` |
| Reset 視圖 | 按鈕重置 transform 回 `translate(0,0) scale(1)` |
| 懸浮提示 | SVG `<title>` 元素（原生 browser tooltip） |
| 點擊詳情面板 | 右側固定寬度抽屜，由 JS 動態填入 HTML |
| 分類圖例 | 左下角靜態列表，點擊切換 `.hidden` class 顯示/隱藏 |

### 5.2 可選功能（勾選需要的）

- [ ] **文字搜尋**：輸入即時篩選並高亮匹配節點
- [ ] **邊線 hover 連動**：hover 某節點時，所有相連邊線與節點高亮，其餘淡化
- [ ] **動畫脈衝**：根節點或關鍵節點 `@keyframes pulse-ring` 呼吸效果
- [ ] **2D↔3D 切換**：需引入 three.js + 3d-force-graph（僅建議 ≥200 節點時啟用）
- [ ] **導出 PNG/SVG**：將當前 SVG 內容另存為下載檔案

### 5.3 詳情面板內容規則

根據節點 `group` 或 `type` 決定面板顯示內容：

```
root        → 總數 {N} 個 {ENTITY}、{M} 大分類、最後更新時間
category    → 分類描述、收錄數量、領域特有統計（如 stars 總和 / 平均引用）
entity      → {CUSTOM_FIELD_A} + {CUSTOM_FIELD_B} + connections[] 列表
decision    → 條件說明 + 各分支觸發規則
```

---

## 六、技術規格與輸出格式

### 6.1 依賴清單（根據 graph_type 選擇）

| 依賴 | 用途 | 是否必要 |
|---|---|---|
| 無 | 2D 純 SVG 渲染 | ✅ 預設（推薦） |
| vis-network@8 | 2D 力導向圖 | 選項（適合大型網絡圖） |
| three@0.149 + 3d-force-graph@1.73 | 3D 宇宙圖 | 選項（僅 ≥200 節點） |
| Google Fonts: JetBrains Mono | 面板代碼字型 | 可選 |

### 6.2 輸出格式

```
單一 .html 檔案
├── <style>  // 全部 CSS，CSS Custom Properties 控制雙主題
├── <svg id="canvas">  // 全部渲染圖層
│   ├── g#layer-groups   // 群組容器
│   ├── g#layer-edges    // 邊線層（path + marker + label）
│   └── g#layer-nodes    // 節點層（rect/polygon + text + title）
├── <script id="data-nodes">   // 節點資料 JSON
└── <script id="data-edges">   // 邊線資料 JSON
    <script>              // 全部渲染邏輯
```

### 6.3 語言標記

```html
<html lang="zh-TW" data-theme="dark">
```

---

## 七、{SYSTEM_NAME} 實例填充區（必填）

請在生成前填入以下變數：

```
SYSTEM_NAME        = {系統完整名稱，例：Tool-Calling 全景 AI 工具圖譜}
FILENAME           = {輸出 HTML 檔名，例：knowledge-graph.html}
DOMAIN_CONTEXT     = {領域描述，例：653 個 AI 工具，18 分類，支援 L1/L2/L3 檢索}
ENTITY             = {節點本體名稱，例：工具 / 料號 / 知識條目 / 論文}
CUSTOM_FIELDS      = {領域特有欄位，例：["language","stars","url"] 或 ["料號","規格書","單價","供應商"]}
CATEGORY_COLOR_OVERRIDES = {可选，例：{"安全性":"#dc2626"} 或留空 {}}
GRAPH_TYPE         = tree | graph | hierarchy | hybrid
DATA_SOURCE        = {資料來源說明，例：registry/tools.json 或 ERP 資料庫匯出}
TOTAL_COUNT        = {總節點數，例：653}
CATEGORY_COUNT     = {分類數，例：18}
```

---

## 八、資料範例（供參考，依實際修改）

### Tree 模式範例
```json
{
  "nodes": [
    { "id": "root", "name": "系統總覽", "type": "root", "col": 0, "row": 2,
      "lines": ["{TOTAL_COUNT} 個 {ENTITY}", "{CATEGORY_COUNT} 大分類"] },
    { "id": "cat_a", "name": "分類 A", "type": "category", "col": 1, "row": 1,
      "lines": ["{N} 個 {ENTITY}"], "parent_id": "root" },
    { "id": "ent_01", "name": "{ENTITY} 名稱", "type": "entity", "col": 2, "row": 0,
      "parent_id": "cat_a", "{CUSTOM_FIELD_A}": "值A", "{CUSTOM_FIELD_B}": "值B" }
  ],
  "edges": []
}
```

### Graph 模式範例（無分類星團）
```json
{
  "nodes": [
    { "id": "ent_01", "name": "{ENTITY} A", "type": "entity", "col": 2, "row": 1,
      "connections": ["ent_03", "ent_07"], "{CUSTOM_FIELD_A}": "..." },
    { "id": "ent_02", "name": "{ENTITY} B", "type": "entity", "col": 5, "row": 1,
      "connections": ["ent_01"], "{CUSTOM_FIELD_A}": "..." }
  ],
  "edges": []
}
```

---

## 九、質量守則（生成前檢查）

- [ ] 所有 `id` 唯一，不得使用空字串或數字-only ID（避免 CSS selector 衝突）
- [ ] 每個 `{ENTITY}` 節點的 `col` 與 `row` 不與其他 `type !== entity` 的節點完全重合
- [ ] 邊線 `from` / `to` 必須是 `nodes` 中已定義的 `id`
- [ ] 決策節點的 outgoing edge 必須全部有 `label`（是/否/條件A/條件B）
- [ ] `desc` 描述長度 ≤ 60 字，技術精確，避免模糊形容詞
- [ ] 無外部請求（所有資料 inline，無 fetch/ajax，無 CDN 非必要元件）
- [ ] 在 Chrome / Firefox / Safari 均無 console error
- [ ] dark 與 light 主題下文字對比度 ≥ 4.5:1（WCAG AA）
