# AGENTS.md 整合指南 — AgnesCode × Antigravity IDE

> 本文檔說明如何將本專案的 AGENTS.md 與本機 Antigravity IDE 全域規則整合。

---

## 🎯 目標

將 **AgnesCode 的行為協議**（反向提問、AI 智囊團審查）與 **Antigravity IDE 的開發 SOP**（PDCA、YAGNI、MECE）統一到一份 `AGENTS.md` 文件中，實現跨工具相容。

---

## 📁 檔案位置

| 工具 | 檔案路徑 | 狀態 |
|------|---------|------|
| **本專案** | `D:\Self-developed_Apps\Tool-Calling\AGENTS.md` | ✅ 已建立 |
| **AgnesCode 全域規則** | 編譯進 system prompt (`reverse_interview_and_advisory_board`) | ✅ 活躍 |
| **Antigravity IDE 全域規則** | `C:\Users\3kids\.gemini\GEMINI.md` | ✅ 存在 |

---

## 🔧 整合步驟

### 步驟 1：同步 AGENTS.md 到 Global Rules

由於 Antigravity IDE 的全域規則儲存在 `~/.gemini/GEMINI.md`，而專案層的規則應放在 `.agents/rules/`，建議：

```powershell
# 方法 A：複製到專案層級規則目錄
copy "D:\Self-developed_Apps\Tool-Calling\AGENTS.md" ".agents\rules\project-protocol.md"

# 方法 B：在 GEMINI.md 中加入對 AGENTS.md 的參照
# 在 ~/.gemini/GEMINI.md 末尾新增：
# ## 與 AGENTS.md 協同協議
# 當處理此專案時，請參閱專案根目錄的 AGENTS.md 以獲取行為協議。
```

### 步驟 2：驗證讀取優先級

根據 AAIF 規範，AGENTS.md 的讀取順序為：
1. `~/.gemini/GEMINI.md` (全域)
2. `.agents/rules/*.md` (專案層)
3. `AGENTS.md` (根目錄)

確保三者內容協調一致，避免衝突。

---

## 📊 功能比對表

| 功能領域 | AgnesCode | Antigravity IDE | AGENTS.md 整合方案 |
|---------|-----------|-----------------|-------------------|
| **需求釐清** | ✅ 反向提問機制 | ❌ 無 | ✅ 協議一：反向提問與澄清 |
| **決策審查** | ✅ AI 智囊團 (5 顧問) | ❌ 無 | ✅ 協議二：AI 智囊團審查 |
| **開發流程** | ⚠️ 基礎 | ✅ PDCA + YAGNI | ✅ 協議三：PDCA + YAGNI 開發循環 |
| **品質守則** | ✅ 準確性優先 | ⚠️ 基礎 | ✅ 協議四：核心承諾 |
| **MECE 原則** | ✅ 強制 | ✅ 鼓勵 | ✅ Architecture Guidelines section |
| **安全協議** | ⚠️ 基礎 | ✅ 詳細 | ✅ Security + Protected Paths |

---

## 🚀 下一步建議

### 短期（本週）
- [ ] 在 Antigravity IDE 中載入本專案，驗證 AGENTS.md 是否被正確讀取
- [ ] 測試兩種模式切換：開發 vs 研究場景

### 中期（下月）
- [ ] 收集其他 28+ 工具的相容性反饋
- [ ] 提交 PR 至 AAIF 官方 repo 參與標準制定

### 長期（季度）
- [ ] 將 AGENTS.md 轉換為 SKILL.md 格式，支援 Skills 系統
- [ ] 探索與 MCP 协议的整合

---

## 📖 參考資源

- **AGENTS.md Spec**: https://agents.md/
- **AAIF 官方**: https://aaif.io/projects/agents-md
- **Linux Foundation**: https://linuxfoundation.org/
- **本專案比較報告**: `docs/agnes-vs-antigravity-comparison.md`

---

> **最後更新**：2026-08-10
> **維護者**：chun-chieh-chang
