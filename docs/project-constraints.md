# 專案限制條件速查卡
## project-constraints.md

> **目的**：記錄不可違背的技術鐵律，避免重複犯錯
> **最後更新**：2026-09-03

---

## SVG Marker 渲染鐵律

### 核心公式（必須背誦）

```
MARKER TIP OFFSET（超出 path endpoint 的像素數）:
  tip_offset = refX × (markerWidth / viewBox)

本專案實際值:
  refX = 8, markerWidth = 6, viewBox = 10
  → tip_offset = 8 × 6 / 10 = 4.8px

GAP 設定規則:
  GAP = Math.ceil(tip_offset) + safety_margin
  → GAP = 5（緊貼，0.2px 超出 border）
  → GAP = 6（保守，1.2px 安全間距）

絕對禁止的錯誤:
  ❌ 將 refX 值（8）直接當做 tip_offset
  ❌ 錯誤計算：refX × (viewBox / markerWidth) = 13.3 或 refX × (markerWidth / viewBox)² = 1.6
  ❌ 使用 GAP = 0~4（tip 必然穿透 border 或浮空）
  ❌ 未運行 diagnostic 前假設數學正確
```

### SVG 座標系方向

```
- SVG y 軸向下為正（browser coordinate system）
- node.bounds.top.y < node.bounds.bottom.y（top 的 y 值較小）
- marker tip 伸出方向與路線方向一致（v=向下伸出，h=向右伸出）
```

### route 類型定義

| route | 起點 | 終點 | 適用場景 |
|-------|------|------|---------|
| `v` | from.bottom.x, from.bottom.y | to.top.x, to.top.y-GAP | 同列（相同 col），上→下 |
| `h` | from.right.x, from.right.y | to.left.x-GAP, from.right.y | 同行（相同 row），左→右 |
| `hdown` | from.right.x, from.right.y | to.top.x, to.top.y-GAP | 需轉彎：先水平再垂直 |
| `sdown` | from.left.x, from.left.y | to.top.x, to.top.y-GAP | S 形繞行，從目標左側入 |
| `elbow` | from.bottom.x, from.bottom.y | to.top.x, to.top.y-GAP | L 形：先下後橫再上 |
| `vloop` | from.bottom.x, from.bottom.y | to.top.x, to.top.y-GAP | 環形繞行（下方繞過） |
| `gdown` | group.bottom.x, group.bottom.y | node.top.x, node.top.y-GAP | 群組→節點 |

### 同列/同行規則

```
⚠ 同列節點（相同 col）：一律使用 route='v'，不繞行
⚠ 同行節點（相同 row）：優先使用 route='h'，不繞行
✅ 僅當有第三方節點擋路時，才考慮 hdown / elbow / vloop 繞行
```

---

## 流程圖修改 SOP（強制執行）

```
修改 pipeline-workflow.html 或任何 SVG 流程圖前：

STEP 1: 讀碼（MANDATORY）
  - 使用 Read 工具讀取源碼，確認現有 renderFlowchart()、calculateEdgePath() 實作
  - 確認 nodeMap / groupMap / edgeMap 的結構
  - 不得憑記憶推測行號

STEP 2: 量化診斷（MANDATORY）
  - 運行 node docs/edge-diagnostic.cjs
  - 記錄每條 edge 的 gap 值與 penetration 狀態
  - 若有 ✗ PENETRATE，先理解根因再動手

STEP 3: 提出修改方案
  - 給出具體行號、舊值、新值
  - 說明數學計算過程（tip_offset = ? → GAP = ?）
  - 預估影響範圍（幾條 edge 會變化）

STEP 4: 執行修改
  - 同步修改 HTML + diagnostic.cjs + prompt-pipeline-workflow.md
  - 三者 GAP 值必須一致

STEP 5: 驗證（MANDATORY）
  - 重新運行 node docs/edge-diagnostic.cjs
  - 確認所有 edge 顯示 ✓ OK
  - 建議用戶截圖確認視覺效果
```

---

## 回應品質鐵律

```
❌ 禁止行為：
  - 未讀取源碼前提出修改建議
  - 基於錯誤數學公式做決策
  - 忽略用戶截圖的反饋，堅持「數學正確」
  - 編造數據（如 DIAGNOSTIC 顯示全部 OK 但實際有問題）

✅ 必要行為：
  - 收到「沒改善」反饋時，第一反應是檢查自己的假設哪裡錯了
  - 用戶提供截圖時，截圖優先於任何診斷腳本輸出
  - 修改前先讀檔案，確認行號和上下文
  - 每次修改必須提供可驗證的量化結果
```
