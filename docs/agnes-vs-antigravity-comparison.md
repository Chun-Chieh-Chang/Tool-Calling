# AgnesCode vs Antigravity IDE 全域規則比較報告

## 一、規則存放位置

| 特性 | AgnesCode | Antigravity IDE (本地) |
|------|-----------|----------------------|
| **全域規則檔案** | 編譯進 system prompt (`reverse_interview_and_advisory_board`) | `~/.gemini/GEMINI.md` ✅ 存在 |
| **專案層級規則** | `.agnes/rules/*.md` | `.agents/rules/*.md` 或 `.agent/rules/` |
| **跨工具標準** | 無正式標準 | `AGENTS.md` (Linux Foundation 認證) ❌ 未使用 |
| **規則格式** | Markdown + YAML frontmatter | Markdown (純文字，無 schema) |

## 二、現有規則內容分析

### AgnesCode 全域規則
```yaml
# 名稱: reverse_interview_and_advisory_board
# 功能: 反向提問與 AI 智囊團審查機制
# 包含:
#   1. 消除模糊需求與反向提問
#   2. 組成 AI 智囊團審查機制 (5 位獨立顧問)
#   3. 最終結論必須包含 5 大要素
#
# 核心承諾: 準確性高於讓用戶滿意
```

### Antigravity IDE 全域規則 (GEMINI.md)
```markdown
# IDE 智能開發助理・核心指令集

## 1. 角色設定 (Role Definition)
- 資深全端架構師 + 頂尖數位藝術總監
- 第一性原理思考

## 2. 開發 SOP
- PDCA 方法 (精準外科手術式修改)
- 禁止亂猜 (列出所有可能原因並逐一排除)
- 副作用防禦 (Regression Control)

## 3. UI/UX 藝術總監視角
- 色彩大師規範 (Color Master Palette)
- 響應式拆解 (Mobile First)
- 卡片與間距規範

## 4. 任務執行步驟
1. Ponytail Ladder + 診斷 (YAGNI 前置審查)
2. MECE 整理與 DEV_LOG 建立
3. UI/UX 優化實施
4. 魯棒性測試
5. 回報與 Push 請求

## 5. 系統防禦
- 依賴掃描
- 按鈕可見性與後端權限對齊
- Token 剩 20% 時記錄進度
```

## 三、核心差異對比

| 維度 | AgnesCode | Antigravity IDE |
|------|-----------|-----------------|
| **設計哲學** | 行為協議 (Behavior Protocol) | 開發 SOP (Development Standard Operating Procedure) |
| **適用場景** | 通用對話/研究/決策審查 | 程式碼開發/UI 設計 |
| **規則數量** | 1 個全域規則 + 1 個核心承諾 | ~15+ 條具體指令 |
| **靈活性** | 高 (按需啟用) | 中 (固定流程) |
| **跨工具支援** | ❌ 專屬 AgnesCode | ✅ AGENTS.md 跨 28+ 工具 |
| **安全機制** | ✅ 準確性優先、禁止編造 | ⚠️ 依賴 AI 自律 |

## 四、互補性分析

### AgnesCode 可借鑒之處
1. **MECE 原則**: Antigravity 的 `MECE 整理術` 與 AgnesCode 理念一致
2. **PDCA 方法**: 反饋循環機制可強化 AgnesCode 的持續改進
3. **Token 管理**: 額度警告機制值得借鑒

### Antigravity 可借鑒之處
1. **AI 智囊團**: 多角色審查機制可補強 Antigravity 的單點決策風險
2. **反向提問**: 澄清需求機制可减少 Antigravity 的盲猜問題
3. **核心承諾**: 明確的品質守則可提升 AgnesCode 的可預測性

## 五、建議整合方案

### 方案 A: 各自獨立 (當前狀態)
- 適合：專注不同工作流
- 缺點：缺乏協同效應

### 方案 B: 協議互轉 (推薦)
```yaml
# 在 GEMINI.md 加入:
## 與 AgnesCode 協同協議
當需要審查商業想法、決策評估或深度研究時，
啟用「AI 智囊團審查模式」：
- 生成 5 位獨立顧問獨立發言
- 主席綜合給出最終結論
```

```markdown
# 在 AgnesCode 加入:
當需要快速開發/修改程式碼時，
遵循「PDCA + YAGNI」協議：
1. 先進行 YAGNI 前置審查
2. 按風險排序實施
3. 執行迴歸測試
```

### 方案 C: 統一 AGENTS.md (長期目標)
```markdown
# AGENTS.md - 跨工具統一規則
## 開發協議 (源自 Antigravity)
- PDCA 方法
- MECE 原則
- 色彩大師規範

## 審查協議 (源自 AgnesCode)
- 反向提問機制
- AI 智囊團 (5 顧問)
- 核心承諾 (準確性優先)
```

## 六、結論

| 評估項 | AgnesCode | Antigravity IDE |
|--------|-----------|-----------------|
| 規則成熟度 | 🟡 基礎 (1 規則) | 🟢 完整 (15+ 條) |
| 跨工具支援 | 🔴 無 | 🟢 完善 (28+ 工具) |
| 審查深度 | 🟢 深 (5 顧問) | 🟡 中 |
| 開發效率 | 🟡 中 | 🟢 高 (SOP 明確) |
| 安全防範 | 🟢 強 | 🟡 中 |

**建議**：短期保持各自優勢，中期探索協議互轉，長期推動 AGENTS.md 統一標準。
