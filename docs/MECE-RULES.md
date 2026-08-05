# 🧠 AGES 全域思考規則（MECE 原則）

> 此文件定義了系統在執行任務時的思維框架，確保分類、檢索、決策符合 **MECE 原則**。

---

## 一、MECE 核心原則

### 1.1 相互獨立（Mutually Exclusive）
- ✅ 每個項目只能屬於**一個**明確的分類
- ❌ 禁止出現「既是 A 又是 B」的模糊邊界
- 🔍 檢查方法：任意兩個分類之間不能有交集

### 1.2 完全窮盡（Collectively Exhaustive）
- ✅ 所有可能的項目都必須能被歸入某個分類
- ❌ 禁止出現「無法歸類」的項目
- 🔍 檢查方法：所有分類的數量加總 = 總項目數

### 1.3 單一數據源（Single Source of Truth）
- ✅ 每個數據只存儲在**一個**地方
- ❌ 禁止在同一意義上重複存儲數據
- 🔍 檢查方法：問「這個數據在哪裡更新？是否只有一個來源？」

---

## 二、分類系統的 MECE 規範

### 2.1 分類結構要求

```
✅ 正確範例：
├── AI 代理      （129個）
├── AI 框架      （83個）
├── UI/UX設計    （26個）
├── 圖標與視覺資源（10個）
└── ...（其他互斥類別）

❌ 錯誤範例：
├── 設計          （30個）← 包含 UI/UX 工具
├── UI/UX設計     （3個） ← 與「設計」重疊！
└── 其他          （11個）← 未窮盡！
```

### 2.2 新增分類時的檢查清單

每次新增或修改分類時，必須回答以下問題：

- [ ] **互斥性檢查**：新分類與現有分類是否有重疊？
- [ ] **窮盡性檢查**：是否所有項目都能歸類？有無「其他」殘留？
- [ ] **邊界清晰**：能否用一句話清楚說明這個分類的定義？
- [ ] **命名一致**：名稱是否符合現有命名風格？

### 2.3 分類邊界範例

| 分類 | 定義 | 排除 |
|------|------|------|
| UI/UX設計 | 前端框架、設計系統、UI 組件庫 | 圖標庫、插画資源 |
| 圖標與視覺資源 | 圖標集合、SVG 圖庫、矢量圖資源 | UI 框架、設計系統 |
| 多媒體生成 | AI 生成圖像/視頻的工具 | 傳統影片編輯工具 |
| 影片 | 影片編輯、渲染、動畫工具 | AI 生成內容工具 |

---

## 三、數據管理的 MECE 規範

### 3.1 單一數據源原則

| 數據類型 | 單一來源 | 消費者 |
|----------|----------|--------|
| 工具列表 | `registry/tools.json` | web/app.js, search-engine.js |
| 每週漲星榜 | `scripts/trending-weekly.js` 生成 | `registry/weekly-trending.json` |
| Star 快照 | `registry/star-snapshots.json` | trending-weekly.js |
| 同義詞字典 | `scripts/mine-synonyms.js` 生成 | `core/synonyms.generated.js` |

**規則**：任何數據只能由**一個**腳本生成，其他模組只讀取。

### 3.2 數據一致性檢查

每次執行涉及數據寫入的操作前：

```javascript
// 檢查公式
const totalInRegistry = tools.length;
const sumByCategory = Object.values(categoryCounts).reduce((a,b) => a+b, 0);
assert(totalInRegistry === sumByCategory, '分類統計與實際數量不一致！');

// 檢查無遺漏
const anyUncategorized = tools.some(t => !t.category || t.category === '其他');
assert(!anyUncategorized, '發現未分類或「其他」類別的工具！');
```

---

## 四、決策判斷的 MECE 檢查表

### 4.1 當需要「新增分類」時

請按以下順序思考：

1. **是否有現有的分類可以容納？** → 是 → 使用現有分類
2. **新分類與其他分類是否有重疊？** → 是 → 重新定義邊界
3. **新分類是否能被清晰定義？** → 否 → 暫不建立，歸入「其他」等待釐清
4. **新分類是否能被穷盡列出子項？** → 否 → 考慮是否真的需要獨立分類

### 4.2 當遇到「邊界案例」時

使用 **決策樹** 而非感覺：

```
這個工具是什麼？
├── 主要是給 AI Agent 使用的？ → AI 代理
├── 是 LLM/模型相關的框架？ → AI 框架
├── 是前端 UI 組件/框架？ → UI/UX設計
├── 是圖標集合？ → 圖標與視覺資源
├── 是 AI 生成圖像/視頻？ → 多媒體生成
├── 是傳統影片編輯？ → 影片
├── 是傳統音頻處理？ → 音訊
└── 以上都不符合 → 回到第 1 步重新檢查邊界定義
```

---

## 五、檢索引擎的 MECE 優化

### 5.1 三層檢索架構（已實現）

| 層級 | 方式 | 適用場景 |
|------|------|----------|
| L1 | 精確匹配 | 搜尋 ID、URL |
| L2 | 關鍵字匹配 | 搜尋名稱、描述、標籤 |
| L3 | 語意匹配 | 自然語言查詢 |

### 5.2 MECE 式查詢處理

當使用者輸入查詢時：

1. **首先**嘗試 L1 精確匹配（最快）
2. **其次**嘗試 L2 關鍵字匹配（中等速度）
3. **最後**使用 L3 語意匹配（最慢但最靈活）
4. **合併結果**並去除重複（確保互斥性）
5. **排序**並返回 Top-N（確保窮盡性）

---

## 六、工作流自動化規則

### 6.1 新增工具時的自動化流程

```
用户提交 GitHub URL
    │
    ▼
┌─────────────────┐
│  1. 檢查是否已存在 │ ← 去重（互斥性）
└────────┬────────┘
         │ 不存在
         ▼
┌─────────────────┐
│  2. 掃描倉庫元數據 │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  3. 自動分類       │ ← 應用 MECE 分類規則
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  4. 執行 enrich   │ ← 補充 useCase/negativeConstraints/advantages
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  5. 全盤重新分類   │ ← 確保新增後整體仍符合 MECE
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  6. 驗證一致性    │ ← 檢查總數、分類統計、無「其他」殘留
└─────────────────┘
```

### 6.2 分類重構觸發條件

以下情況必須執行全盤分類重構：
- [ ] 新增工具超過 10 個
- [ ] 手動編輯了 `tools.json`
- [ ] 執行了 `npm run trending`
- [ ] 有新的工具被加入（通過 API 或手動）

---

## 七、自检機制

### 7.1 每次提交前的 MECE 檢查

```bash
# 執行完整性檢查
npm run validate

# 檢查分類一致性
node scripts/check-mece.js

# 檢查是否有未分類工具
node scripts/check-uncategorized.js
```

### 7.2 常見的 MECE 違反模式

| 模式 | 表現 | 修復方式 |
|------|------|----------|
| 類別漂移 | 工具從一個分類漂移到另一個 | 強制重新分類 |
| 邊界模糊 | 「設計」vs「UI/UX設計」 | 合併或明確邊界 |
| 殘留「其他」 | 有工具歸類為「其他」 | 強制歸類到新分類 |
| 數據不一致 | tools.json 與 star-snapshots 不同步 | 統一數據源 |

---

## 八、實作清單

### 8.1 已完成
- [x] 刪除「其他」類別
- [x] 合併「設計」與「UI/UX設計」
- [x] 拆分「圖標與視覺資源」
- [x] 添加分類重構脚本 (`scripts/reclassify-tools.js`)
- [x] 添加時間戳記到漲星榜數據

### 8.2 待完成
- [ ] 創建 `scripts/check-mece.js` 自動檢查腳本
- [ ] 將此規則整合到 `.git/hooks/pre-commit` 中
- [ ] 更新 `web/app.js` 以正確顯示新的分類結構
- [ ] 文檔化完整的分類邊界定義

---

## 附錄：分類邊界定義表

| 分類 | 定義 | 關鍵詞 | 排除 |
|------|------|--------|------|
| AI 代理 | 具有自主決策能力的 AI 助手/代理 | agent, assistant, copilot, autonomous | skill, framework, sdk |
| AI 框架 | LLM/多模態模型框架 | llm, transformer, gpt, claude, gemini, huggingface | agent, skill |
| UI/UX設計 | 前端 UI 框架、設計系統、組件庫 | shadcn, storybook, chakra, ant-design, material-ui, tailwind | icon, figma-plugin |
| 圖標與視覺資源 | 圖標集合、矢量圖庫、插畫資源 | lucide, heroicons, font-awesome, tabler, iconify, simple-icons | ui-framework, design-system |
| 多媒體生成 | AI 生成圖像/視頻/音頻的工具 | stable-diffusion, midjourney, dalle, generative-ai, img2video | video-editor, audio-editor |
| 影片 | 傳統影片編輯、渲染、動畫工具 | ffmpeg, animation, movie, video-editing | ai-generation, diffusion |
| 音訊 | 傳統音頻處理、TTS/STT 工具 | audio, music, speech, whisper, tts, stt | generative-ai, diffusion |
| 學習資源 | 教程、課程、教學資源 | learn, tutorial, course, education, roadmap, awesome-list | tool, framework |
| 研究 | 學術論文、研究文獻、調查報告 | research, paper, arxiv, science, survey | tutorial, course |
| 知識管理 | RAG、檢索增強、知識圖譜 | knowledge, rag, retrieval, embedding, memory, note | research, paper |

---

> 📌 **核心口訣**：「互不相交，窮盡無遺；數據唯一，邊界清晰。」
