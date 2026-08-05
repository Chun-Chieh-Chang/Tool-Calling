# 📊 工具庫新增與知識圖譜優化報告 (2026-08-05)

## 🆕 今日新增工具

| ID | 名稱 | 分類 | Star 數 | Enriched |
|----|------|------|---------|----------|
| `crm` | Crm | AI 代理 | - | ✅ |
| `computer` | Computer (Cloudflare) | AI 代理 | - | ✅ |
| `loopx` | LoopX | 開發工具 | - | ✅ |
| `pdf-inspector` | PDF Inspector | 文件生產力 | - | ✅ |
| `deepseek-reasonix` | DeepSeek Reasonix | AI 框架 | - | ✅ |
| `supervision` | Supervision | AI 代理 | - | ✅ |
| `next-js` | Next.js | 開發工具 | - | ✅ |
| `tailwindcss` | Tailwind CSS | 設計 | - | ✅ |
| `karpathy-llm-wiki` | Karpathy LLM Wiki | 學習資源 | - | ✅ |
| `jetbrains-cc-gui` | JetBrains CC GUI | 開發工具 | - | ✅ |

**工具庫總數**: 428 個工具  
**今日新增**: 10 個工具（全部已完成 useCase/negativeConstraints/advantages 補完）

---

## 🔧 知識圖譜優化

### 問題修復

#### 1. Hover Tooltip 重複顯示
- **問題**: 2D 圖譜懸停時同時出現 vis.js 原生 tooltip 和自定義 tooltip
- **原因**: vis.js 的 `interaction.tooltip` 選項不被支援，但原生 tooltip 仍然顯示
- **修復**: 
  - 移除無效的 `tooltip: false` 配置
  - 添加 CSS: `.vis-tooltip { display: none !important; }`
  - 保留自定義 `graph-tooltip-2d` 系統

#### 2. 每週漲星探勘日期計算
- **問題**: 搜尋日期硬編碼為 `2026-06-01`，不會隨當前日期更新
- **修復**: 改用 ISO 週次計算邏輯，自動定位「最近一個完整週」

### Git 提交記錄

```
5d5d7b0 fix: add CSS to hide vis.js native tooltip and prevent duplicate hover windows
fddc268 fix: remove invalid tooltip option from vis.js interaction config
b083d2f fix: disable vis.js native tooltip to prevent duplicate hover windows
521b991 fix: auto-calculate weekly date range instead of using hardcoded dates
```

---

## 🏆 本週漲星 Top 10 (2026-W31)

| 排名 | 工具 | GitHub Repo | Stars | 漲幅 | 狀態 |
|------|------|-------------|-------|------|------|
| 1 | hyperframes | heygen-com/hyperframes | 39,579 | +37,779 | ✅ 已入庫 |
| 2 | awesome-copilot | github/awesome-copilot | 37,472 | +26,447 | ✅ 已入庫 |
| 3 | pi | earendil-works/pi | 84,038 | +5,730 | ✅ 已入庫 |
| 4 | Agent-Reach | Panniantong/Agent-Reach | 66,791 | +5,721 | ✅ 已入庫 |
| 5 | superpowers | obra/superpowers | 267,013 | +5,321 | ✅ 已入庫 |
| 6 | hermes-agent | NousResearch/hermes-agent | 225,864 | +4,820 | ✅ 已入庫 |
| 7 | worldmonitor | koala73/worldmonitor | 79,019 | +4,089 | ✅ 已入庫 |
| 8 | last30days-skill | mvanhorn/last30days-skill | 57,327 | +3,480 | ✅ 已入庫 |
| 9 | generative-ai-for-beginners | microsoft/generative-ai-for-beginners | 116,598 | +3,057 | ✅ 已入庫 |
| 10 | awesome-llm-apps | Shubhamsaboo/awesome-llm-apps | 130,719 | +2,774 | ✅ 已入庫 |

---

## 📋 待處理事項

### GitHub Actions 部署
- 已配置 `.github/workflows/deploy-pages.yml`
- 每次推送到 main 分支時自動構建並部署到 GitHub Pages
- 需要等待 GitHub Actions 完成部署後，https://chun-chieh-chang.github.io/Tool-Calling/knowledge-graph.html 才會更新

### 測試結果
- ✅ 知識圖譜測試通過
- ⚠️ 有 Three.js 多實例警告（視覺上無影響）
- ℹ️ 有 WebGL GPU 性能警告（正常現象）
