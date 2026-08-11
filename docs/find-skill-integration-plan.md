# Find Skill Integration Plan

## 目標
讓 Tool-Calling 能搜尋外部 Skill 生態系（skills.sh, ClawHub, HuggingFace），並能直接安裝到本機。

---

## 方案比較

### 方案 A：CLI Wrapper（最簡單）
使用現有的 `npx skills` CLI，包裝成我們自己的函數。

**優點：**
- 零依賴，直接用現成的 skills CLI
- 命令簡單：`npx skills find <query>` / `npx skills add <skill>`

**缺點：**
- 需要用戶已安裝 Node.js + npx
- 無法完全控制行為

---

### 方案 B：MCP Tool（推薦）
在 MCP Server 中新增 `find_skill` 和 `install_skill` 工具。

**流程：**
1. 用戶說「找一個能做 X 的 skill」
2. MCP 呼叫 `find_skill("X")` → 查詢 skills.sh API
3. 顯示結果列表（含 star、健康分數）
4. 用戶選擇後，呼叫 `install_skill(id)` → npx skills add

**優點：**
- 整合現有 MCP 系統
- AI Agent 可直接調用
- 支援串流輸出

**缺點：**
- 需要寫新的 MCP tool handler
- 依賴外部 API 可用性

---

### 方案 C：獨立 Service（最完整）
建立 `core/skill-discovery.js`，封裝多個來源：
- skills.sh（Vercel 官方）
- ClawHub
- HuggingFace Agents
- GitHub Search

**優點：**
- 多來源聚合
- 可離線緩存
- 可自訂排序邏輯

**缺點：**
- 開發成本較高
- 需要維護多個 API

---

## 建議實施路線

### Phase 1：快速驗證（1天）
```bash
# 先測試 skills CLI 是否可用
npx skills find "pdf" --limit 5
npx skills list
```

如果可用，直接走 **方案 A**：
1. 在 `scripts/` 下建立 `find-skills.js`
2. 用 `child_process.execSync('npx skills find ...')` 包裝
3. 加入 `cli.js` 的新指令：`node cli.js find-skill "<需求>"`

### Phase 2：MCP 集成（2-3天）
1. 在 `mcp-server.js` 新增 `find_skill` tool
2. 實作 skills.sh API 查詢邏輯
3. 支援安裝指令：`npx skills add <repo>/skills/<skill-name>`

### Phase 3：多來源聚合（可選）
建立 `core/skill-discovery.js`：
- 優先查詢 skills.sh（最完整）
- 備援：ClawHub、HuggingFace
- 本地緩存 `~/.tool-calling/skills-cache.json`

---

## 技術細節

### Skills.sh API
```
GET https://api.skills.sh/skills?query={query}&limit={n}
Headers: { 'Accept': 'application/json' }
```

### 典型命令
```bash
# 搜尋
npx skills find "pdf" 

# 查看詳情
npx skills info anthropic/document-skills

# 安裝
npx skills add anthropic/document-skills

# 列出已安裝
npx skills list
```

### 可能的錯誤處理
- API 超时 → 降级為 GitHub search
- 無結果 → 建議手動瀏覽 skills.sh
- 安裝失敗 → 返回診斷資訊

---

## 決策點

請確認：
1. **優先方案？** A (CLI)、B (MCP)、還是 C (全功能)？
2. **需要支援哪些來源？** skills.sh / ClawHub / HuggingFace / GitHub
3. **離線緩存需求？** 是否需要預先下載技能清單？