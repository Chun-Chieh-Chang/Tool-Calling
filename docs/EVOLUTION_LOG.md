# EVOLUTION_LOG.md
## Trae Agent 自我進化日誌

> 記錄每次重大問題的 RCA、CAPA 與教訓萃取，作為後續迭代的核心養分。

---

## 2026-09-03：pipeline-workflow.html 箭頭連接問題

### 問題現象
用戶多次反饋流程圖的連接箭頭「指向空虛」、「穿透紫紅線邊界」、「完全沒變」。

### RCA 根因分析

#### 根因 1：marker tip 計算公式錯誤
- **錯誤**：`tip_offset = refX × (markerWidth / viewBox)² = 8 × (6/10)² = 1.6px`（平方錯誤）
- **正確**：`tip_offset = refX × (markerWidth / viewBox) = 8 × 6/10 = 4.8px`
- **影響**：GAP=2 遠小於 tip=4.8，箭頭尖端插入節點邊界內 2.8px，視覺上「浮在空中」

#### 根因 2：diagnostic 腳本本身有 bug
- 缺少 `case 'h2'` 路徑計算（落入 default case）
- default case 對 h2 route 使用 `t.top.y - GAP`，但 h2 實際從底部進入，應使用 `t.bottom.y + GAP`
- 結果：diagnostic 顯示所有 edge「✓ OK」，但實際座標計算錯誤

#### 根因 3：同列節點不必要繞行
- `parse_intent` 與 `l2_keyword` 同列（col=1），使用 h2 route 等價於垂直線 +48px 額外高度
- 無意義增加圖形高度，且 label 位置偏移

#### 根因 4：未先讀取源碼即提議修改
- 在沒有讀取 pipeline-workflow.html 的情況下，根據對話摘要推測修改點
- 導致初始建議方向性錯誤，延誤 7+ 輪修復

### CAPA 對策實施

| 步驟 | 行動 | 狀態 |
|------|------|------|
| 1 | 修正 GAP 從 2 → 5（4.8px tip + 0.2px margin） | ✅ |
| 2 | 將 parse_intent→l2_keyword route 改回 'v' | ✅ |
| 3 | 重寫 edge-diagnostic.cjs，精確模擬 calculateEdgePath() | ✅ |
| 4 | 更新 prompt-pipeline-workflow.md 參數說明 | ✅ |
| 5 | 建立 project-constraints.md 固化公式 | ✅ |
| 6 | 建立 SELF-EVOLUTION-REPORT.md 完整記錄 | ✅ |

### 可運用的教訓（萃取為行動守則）

```markdown
1. 數學公式必須手算驗證，不依賴記憶或推測
   → 寫入 project-constraints.md 核心公式區

2. diagnostic 腳本本身必須被交叉驗證
   → 每次修改前 trace 至少一條 edge 的完整座標

3. 用戶截圖是唯一真理來源，優先於任何診斷輸出
   → 寫入 AGENTS.md 回應品質條款

4. 同列節點用 route='v'，同行節點用 route='h'，不繞行
   → 寫入 route 類型定義表

5. 修改前必看源碼，不憑記憶推測
   → 寫入 AGENTS.md 修改前檢查清單
```

### 後續行動

- [ ] 將 project-constraints.md 的內容整合進 AGENTS.md
- [ ] 建立 GitHub Actions workflow 自動運行 edge-diagnostic.cjs
- [ ] 每季度回顧本日誌，更新公式與規則
- [ ] 若遇到類似 SVG 渲染問題，優先查閱本文檔

---

## 模板：未來問題記錄格式

```markdown
## YYYY-MM-DD：{問題簡短描述}

### 問題現象
{用戶反饋或觀察到的現象}

### RCA 根因分析
#### 根因 N：{標題}
- **錯誤**：{錯誤的做法或理解}
- **正確**：{正確的做法或公式}
- **影響**：{具體影響範圍}

### CAPA 對策實施
| 步驟 | 行動 | 狀態 |
|------|------|------|
| 1 | {行動描述} | ✅/❌ |

### 萃取教訓
- {教訓 1} → 寫入 {檔案位置}
- {教訓 2} → 寫入 {檔案位置}

### 後續行動
- [ ] {待辦事項}
```
