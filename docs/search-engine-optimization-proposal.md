# 工具檢索引擎優化提案

## 當前架構分析

### 三層檢索系統 (L1-L3)

| 層級 | 函數 | 功能 | 權重 | 效能 |
|------|------|------|------|------|
| **L1** | `exactMatch()` | ID/名稱完全匹配 | 100% | O(n) - 快速 |
| **L2** | `keywordMatch()` | 觸發詞 + 分類 + 描述交叉匹配 | 動態 | O(n×m) - 中速 |
| **L3** | TF-IDF 語義檢索 | 中文 N-gram + 中英同義詞擴展 | 最終排序 | O(n log n) - 較慢 |

---

## 🔴 性能瓶頸分析

### 問題 1: L2 關鍵字匹配重覆正規化
```javascript
// 當前程式碼 (line ~2530)
for (const trigger of tool.triggers) {
  const triggerNorm = normalize(trigger); // ⚠️ 每個 tool 每次都重新計算
  if (normQuery.includes(triggerNorm)) { ... }
}
```
**影響**: 每次搜尋都會對所有工具的 triggers 重複正規化

### 問題 2: subToolNormCache 未使用
```javascript
// 已實作但未被 L2 呼叫使用
function getSubToolNorm(subTool) { ... }
```
**影響**: Monorepo 子工具匹配時仍重複計算

### 問題 3: 沒有結果快取機制
- 相同查詢每次都會重新計算
- 無結果 TTL 控制

---

## 🟢 優化建議

### 建議 1: 觸發詞正規化快取 (高優先)

```javascript
// 新增全局快取
const triggerNormCache = new Map();

function getTriggerNorm(trigger) {
  if (!triggerNormCache.has(trigger)) {
    triggerNormCache.set(trigger, normalize(trigger));
  }
  return triggerNormCache.get(trigger);
}
```

**預期效果**: 
- L2 匹配速度提升 40-60%
- 減少約 70% 的重複字符串操作

---

### 建議 2: 啟用 subToolNormCache (高優先)

```javascript
// 修改 keywordMatch 函數，加入 subTool 匹配
for (const subTool of tool.subTools || []) {
  const subNorm = getSubToolNorm(subTool);
  const subTriggerNorm = getTriggerNorm(subTrigger);
  if (subNorm.name.includes(subTriggerNorm) || ...) {
    score += SUBTOOL_WEIGHT;
  }
}
```

**預期效果**:
- Monorepo 工具匹配準確度提升 30%
- 子工具搜尋速度提升 50%

---

### 建議 3: 查詢結果快取 (中優先)

```javascript
const searchCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 分鐘

function cachedSearch(query, tools) {
  const key = `${query}_${tools.length}`;
  const cached = searchCache.get(key);
  
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.results;
  }
  
  const results = performSearch(query, tools);
  searchCache.set(key, { results, timestamp: Date.now() });
  return results;
}
```

**預期效果**:
- 重複查詢響應時間 < 1ms
- 減少約 60% 的搜尋計算

---

### 建議 4: TF-IDF 向量預計算 (中優先)

```javascript
// 啟動時預計算所有工具的 TF-IDF 向量
const toolVectors = new Map();

function precomputeVectors(tools) {
  const corpus = tools.map(t => buildToolText(t));
  const idf = computeIDF(corpus);
  
  tools.forEach(tool => {
    const tf = computeTF(buildToolText(tool), idf);
    toolVectors.set(tool.id, tf);
  });
}
```

**預期效果**:
- L3 搜尋速度提升 80%
- 首次搜尋延遲增加 2-3 秒 (可接受)

---

### 建議 5: 分頁與遊標優化 (低優先)

```javascript
// 支援遊標式分頁，避免深層翻頁
export async function searchWithPagination(tools, query, options = {}) {
  const { limit = 20, cursor, rankBy = 'relevance' } = options;
  
  const results = await performSearch(query, tools);
  
  if (cursor) {
    const cursorIdx = parseInt(cursor, 36);
    return results.slice(cursorIdx, cursorIdx + limit);
  }
  
  return results.slice(0, limit);
}
```

**預期效果**:
- 大量結果集記憶體使用降低 70%
- 前端渲染更流暢

---

### 建議 6: 同義詞擴展現狀檢視 (低優先)

當前 `synonyms.generated.js` 已實作，但可考慮：
- 動態載入大詞典 (lazy loading)
- 依分類過濾同義詞 (category-aware synonyms)

---

## 📊 優化效益預估

| 優化項目 | 效能提升 | 實作難度 | 建議優先級 |
|---------|---------|---------|-----------|
| 觸發詞正規化快取 | +40-60% | 低 | 🔴 高 |
| 啟用 subToolNormCache | +30% 準確度 | 低 | 🔴 高 |
| 查詢結果快取 | -90% 延遲 | 中 | 🟡 中 |
| TF-IDF 向量預計算 | +80% L3速度 | 中 | 🟡 中 |
| 分頁與遊標優化 | -70% 記憶體 | 低 | 🟢 低 |

---

## 🎯 立即行動建議

### Phase 1: 快速優化 (1-2 小時)
1. ✅ 實作 `triggerNormCache`
2. ✅ 啟用 `getSubToolNorm()` 在 L2 中使用
3. ✅ 添加查詢結果快取

### Phase 2: 深度優化 (4-8 小時)
1. 🔄 TF-IDF 向量預計算
2. 🔄 分頁遊標系統
3. 🔄 同義詞動態載入

### Phase 3: 長期優化 (1-2 天)
1. 🔮 Web Worker 離線計算
2. 🔮 IndexedDB 持久化快取
3. 🔮 分散式搜尋索引

---

## 📝 測試計畫

### 基準測試
```bash
# 執行前測量
time node cli.js search "Python RAG 網頁爬蟲"
# 輸出: ~150ms

# 優化後預期
# 輸出: ~50ms (L2), ~10ms (快取命中)
```

### 覆蓋率測試
- [ ] L1 精確匹配 (現有 11 tests)
- [ ] L2 關鍵字匹配 (英文)
- [ ] L2 關鍵字匹配 (中文)
- [ ] L3 TF-IDF 語義檢索
- [ ] 結果快取正確性
- [ ] subTool 匹配準確度

---

## 🔗 相關檔案

- `core/search-engine.js` - 主檢索引擎 (863 行)
- `core/synonyms.generated.js` - 同義詞詞典
- `tests/search.test.js` - 搜尋單元測試 (11 tests)
- `web/app.js` - 前端搜尋 UI

---

**提案版本**: v1.0  
**最後更新**: 2026-08-10  
**維護者**: AgnesCode × Tool-Calling 核心團隊
