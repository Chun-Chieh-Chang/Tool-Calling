# 工具庫檢索與 Workflow 優化分析

## 一、檢索引擎現狀分析

### 三層檢索架構
| 層級 | 機制 | 權重 | 狀態 |
|------|------|------|------|
| L1 | 精確匹配 (ID/Name) | 1.0 | ✅ 已完善 |
| L2 | 關鍵字匹配 (triggers/category/desc/capabilities/useCase/advantages) | 0~0.99 | ✅ 已完善 |
| L3 | TF-IDF + N-gram + 同義詞擴展 | 0.6+0.4融合 | ⚠️ 可優化 |

### 五維度競品重排矩陣
| 維度 | 邏輯 | 狀態 |
|------|------|------|
| A. 語言偏好對齊 | TypeScript/JS 匹配 +0.25, 不匹配 -0.35 | ✅ |
| B. 下游場景意圖 | RAG/testing/pipeline 匹配 +0.25~0.30 | ✅ |
| C. 禁用場景強硬扣分 | negativeConstraints 匹配 -0.60 | ✅ |
| D. GitHub Stars 加權 | log10(stars) × 0.05, 上限 +0.20 | ✅ |
| E. Telemetry 動態權重 | 成功率 ≤30% ×0.1, ≥80% ×1.2 | ✅ |

---

## 二、檢索優化建議

### 🔴 高優先級

#### 1. 同義詞詞典覆蓋不足
**問題**: 部分常用查詢無對應同義詞映射

| 查詢詞 | 建議映射 |
|--------|----------|
| `資料分析` | `data analysis`, `analytics`, `dashboard` |
| `知識庫` | `knowledge base`, `rag`, `vector db` |
| `API 呼叫` | `api call`, `rest`, `graphql`, `webhook` |
| `自動化腳本` | `automation script`, `workflow automation` |
| `程式碼生成` | `code generation`, `codegen`, `scaffold` |

**解決方案**: 
- 擴充 `scripts/mine-synonyms.js` 的 `SEED_SYNONYMS`
- 定期重新執行挖掘 (`node scripts/mine-synonyms.js`)

#### 2. L2 關鍵字匹配缺乏模糊匹配
**問題**: 拼字錯誤或 variant 無法匹配

**現狀**:
```javascript
// 目前只做嚴格子字串匹配
if (triggerNorm.includes(token)) { ... }
```

**建議**: 引入 fuzzy matching (Levenshtein distance)
```javascript
// 對於短 token (<4 chars), 允許 1 個字元差異
if (similarity(triggerNorm, token) >= 0.85) { ... }
```

#### 3. 缺少查詢意圖預解析
**問題**: 自然語言查詢需進一步抽象

**建議**: 在 L1/L2 之前加入意圖解構階段
```javascript
const parsedIntent = parseQueryIntent(query);
// 輸入: "幫我找一個能做簡報的 React 工具"
// 輸出: { action: 'find', domain: 'presentation', lang: 'react' }
```

### 🟡 中優先級

#### 4. 分類熱度動態調整
**問題**: 各分類工具數量不均（AI 代理 114 vs 行銷 1）

**現狀**:
```
114  AI 代理
 36  學習資源
 36  開發工具
 29  設計
 28  文件生產力
  1  行銷
```

**建議**: 為稀有家分類提供 boosting，避免被熱門分類淹沒

#### 5. 增加工具年齡衰減因子
**問題**: 舊工具可能已過時

**建議**: 加入 time-decay
```javascript
const ageFactor = Math.max(0.5, 1 - (daysSinceAdded / 365) * 0.5);
score *= ageFactor;
```

#### 6. 優化 monorepo 拆解判定
**問題**: 目前只檢查 `skills/`, `agents/` 等目錄信號

**建議**: 
- 加入 `README` 中的 "packages", "modules", "workspaces" 關鍵字檢測
- 檢查 `package.json` 的 `name` 是否暗示多工具集合

### 🟢 低優先級

#### 7. 增加中文繁體/簡體轉換
**問題**: `簡報` vs `简报` 可能視為不同詞

**建議**: 加入 `zhconv` 轉換或統一繁簡標準

#### 8. 工具健康度評分
**問題**: 缺少工具質量評分機制

**建議**: 建立 health score = f(uses, success_rate, recent_updates, community_stars)

---

## 三、Workflow 優化建議

### 🔴 高優先級

#### 1. 新增工具前加入 Dry-run 模式
**現狀**: `cli.js add` 直接寫入 registry

**建議**: 
```bash
node cli.js add --dry-run https://github.com/...
# 僅顯示分類結果、預估 fields，不寫入
```

#### 2. 批量新增加入人工確認階段
**現狀**: batch-add 自動處理全部 URL

**建議**: 
```bash
node cli.js batch-add urls.txt --review
# 顯示預覽清單，詢問確認後再寫入
```

#### 3. Enrich 失敗重試機制
**現狀**: 單個工具 enrich 失敗會中斷整個批次

**建議**: 
- 加入 exponential backoff
- 記錄失敗清單到 `registry/enrich-failures.json`
- 提供 `npm run enrich-retry` 命令

### 🟡 中優先級

#### 4. 增加 URL 重複檢測精確度
**現狀**: 只檢查 `t.url === url`

**建議**: 同時檢查 normalized URL
```javascript
const normalizeUrl = (url) => url.replace(/\/$/, '').toLowerCase();
// 避免 https://github.com/owner/repo 與 https://github.com/owner/repo/ 視為不同
```

#### 5. 加入 GitHub API Rate Limit 處理
**現狀**: 未處理 API rate limit

**建議**: 
- 加入 token 輪換支援
- 加入 `Retry-After` header 等待邏輯
- 加入本地 cache 減少重複請求

#### 6. 優化工具分類邊界
**問題**: `React D3 Tree` 歸類為「其他」而非「數據可視化」

**建議**: 
- 擴充分類規則
- 加入 ML-based 分類（可選）
- 允許工具多分類標籤

### 🟢 低優先級

#### 7. 加入工具版本追蹤
**現狀**: 無版本資訊

**建議**: 
- 定期檢查最新版本
- 記錄 version history
- 標記 deprecated 工具

#### 8. 優化学習資源分類
**問題**: `awesome-solidity`、`ai-for-beginners` 都是「學習資源」但性質不同

**建議**: 
- 區分 `awesome-list`、`curriculum`、`reference` 子類別
- 或在 triggers 中明確標註類型

---

## 四、綜合建議

### 短期可執行的優化（1-2週）
1. [ ] 擴充 SEED_SYNONYMS 覆蓋核心概念
2. [ ] 加入 dry-run 模式
3. [ ] 加入 rate limit 處理
4. [ ] 優化学習資源分類規則

### 中期優化（1個月）
1. [ ] 加入 fuzzy matching
2. [ ] 建立工具健康度評分
3. [ ] 加入年齡衰減因子
4. [ ] 實現 enrich 失敗重試

### 長期優化（3個月）
1. [ ] ML-based 分類模型
2. [ ] 自動化 trending 檢測
3. [ ] 跨平台支援（GitLab, PyPI, npm）
4. [ ] 使用者行為分析反饋循環
