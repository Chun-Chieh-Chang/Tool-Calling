---
name: tool-calling
description: 全自動工具調用效能外掛系統。當用戶說出「啟動全自動工具調用模式」時，自動從工具註冊庫中識別、檢索、調用最適合的開發工具，任務完成後自動清理。支援 PPT 生成、知識圖譜、安全測試、AI 圖片/影片生成、瀏覽器自動化等 10+ 類工具。
---

# Tool-Calling：全自動工具調用效能外掛

> **平台**: Gemini (Antigravity / Jules / Gemini CLI)
> **格式**: SKILL.md with YAML frontmatter

## 觸發條件

當用戶的需求匹配以下任一條件時，啟用本 Skill：

1. **咒語觸發**：用戶說出「啟動全自動工具調用模式」
2. **任務推斷**：用戶的任務描述匹配已註冊工具的觸發關鍵字
3. **明確指名**：用戶提到某個已註冊工具的名稱（如 "playwright", "PPT Master"）

## 完整操作指引

請參閱核心指令模板，包含完整的 CLI 命令、調用流程與工具清單：

📖 **核心指令**：[core-instructions.md](file:///d:/Self-developed_Apps/Tool-Calling/skill/core-instructions.md)

## 快速命令

```bash
# 搜尋工具
node d:/Self-developed_Apps/Tool-Calling/cli.js search "<任務描述>"

# 列出所有工具
node d:/Self-developed_Apps/Tool-Calling/cli.js list

# 查看工具詳情
node d:/Self-developed_Apps/Tool-Calling/cli.js info <tool-id>

# 新增工具
node d:/Self-developed_Apps/Tool-Calling/cli.js add <github-url>
```

## 全自動調用 SOP

1. 解析用戶意圖 → 2. `search` 檢索工具 → 3. 評估信心度 → 4. 動態安裝 → 5. 執行任務 → 6. 清理復歸

## 關鍵路徑

- 註冊庫：`d:/Self-developed_Apps/Tool-Calling/registry/tools.json`
- CLI：`d:/Self-developed_Apps/Tool-Calling/cli.js`
- 檢索引擎：`d:/Self-developed_Apps/Tool-Calling/core/search-engine.js`
