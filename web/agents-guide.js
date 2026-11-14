/**
 * agents-guide.js — AI Agents 使用方法說明與接入指南模組
 *
 * 涵蓋：
 *  1. 截圖專屬推薦清單（12 款 AI Agents）
 *  2. 其他相容 IDE 既有支援清單（7 款）
 *  3. 動態依專案路徑產生一鍵安裝指令、MCP JSON 設定與協作提示詞範本
 */

export const DEFAULT_PROJECT_PATH = 'D:\\Self-developed_Apps\\G2\\Tool-Calling';

/**
 * 所有支援的 AI Agents 清單（截圖 12 款置頂 + 既有相容 IDE）
 */
export const AGENTS_CATALOG = [
  // ─── 截圖專屬 12 款 AI Agents ─────────────────────────────────────────────
  {
    id: 'agnes-code',
    name: 'Agnes Code',
    group: 'featured',
    categoryLabel: '桌面版 GUI 開發代理',
    mode: 'manual-mcp',
    modeLabel: 'AGENTS.md + 標準 MCP / 內建終端',
    installIdeKey: null,
    configPath: '桌面版設定 > MCP 面板（貼上標準 JSON），或開啟專案讀取 AGENTS.md 與 .agents/skills/',
    mcpFormat: 'mcpServers',
    summary: 'Agnes Code 桌面版 GUI 原生相容專案根目錄的 AGENTS.md 統一協議與 .agents/skills/；若於介面啟用 MCP 面板，亦可直接匯入下方標準 JSON。',
    steps: [
      '在 Agnes Code 桌面版開啟 Tool-Calling 專案資料夾，系統會自動載入根目錄 AGENTS.md 與 .agents/skills/ 規範。',
      '若需跨專案呼叫工具庫，請在 Agnes Code 桌面版設定的 MCP 面板貼上下方「標準 MCP 設定 JSON」。',
      '於對話框輸入「啟動全自動工具調用模式：<需求>」，或透過內建終端機執行 node cli.js search / plan。',
    ],
    promptTemplate: '請先閱讀專案根目錄 AGENTS.md，並執行 `node cli.js search "<你的需求>"` 或呼叫 tool-calling MCP 的 search_tools 工具，為我篩選最適合的開源工具與執行步驟。',
  },
  {
    id: 'antigravity',
    name: 'Antigravity',
    group: 'featured',
    categoryLabel: '桌面版 Agentic IDE',
    mode: 'auto-mcp',
    modeLabel: '一鍵安裝 (MCP + Skill)',
    installIdeKey: 'antigravity',
    defaultScope: 'global',
    hasSkillsFlag: true,
    configPath: '~/.gemini/antigravity/mcp_config.json + <目標專案>/.agents/skills/',
    mcpFormat: 'mcpServers',
    summary: '桌面版 Agentic IDE，已深度整合至 install-plugin.js，支援一鍵寫入全域 MCP 設定並同步複製 Agent Skill（行為 SOP）。',
    steps: [
      '於本專案根目錄執行下方「一鍵安裝指令」，自動將 tool-calling 註冊至 Antigravity 桌面版 MCP 設定。',
      '重啟 Antigravity 或在 MCP 面板重新載入伺服器清單，確認 search_tools、plan_toolchain 等工具已就緒。',
      '在對話視窗直接描述開發需求，或輸入「啟動全自動工具調用模式：<任務>」觸發工具鏈規劃。',
    ],
    promptTemplate: '啟動全自動工具調用模式：請使用 tool-calling MCP 的 search_tools 與 plan_toolchain 幫我規劃並完成以下任務：<在此輸入需求>',
  },
  {
    id: 'chatgpt-classic',
    name: 'ChatGPT Classic',
    group: 'featured',
    categoryLabel: '桌面版 GUI 對話代理',
    mode: 'cli-prompt',
    modeLabel: '本機 CLI + 提示詞協作',
    installIdeKey: null,
    configPath: '無本地 MCP 設定檔（透過本機終端機 CLI 與提示詞範本搭配桌面版視窗使用）',
    mcpFormat: null,
    summary: 'ChatGPT Classic 桌面版未提供本地 MCP stdio 設定檔入口，建議搭配本機 CLI 先行檢索工具庫，再將結果貼入桌面版視窗協作。',
    steps: [
      '先在本機終端機執行 `node cli.js search "<需求>"` 或 `node cli.js plan "<長任務>"`，取得推薦工具清單與架構建議。',
      '複製下方「協作提示詞範本」連同終端機輸出貼入 ChatGPT Classic 桌面版，讓它依現有工具庫產出實作方案或執行指令。',
      '回到本機終端機驗證與執行，必要時再用 `node cli.js verify-environment <tool-id>` 檢查相依環境。',
    ],
    promptTemplate: '我正在使用本機 Tool-Calling 工具庫（透過 `node cli.js search "<需求>"` 與 `node cli.js plan "<任務>"` 檢索開源工具）。請根據以下本機檢索結果，幫我設計實作步驟與對應的執行指令：\n\n[貼上終端機輸出]',
  },
  {
    id: 'cline',
    name: 'Cline',
    group: 'featured',
    categoryLabel: '桌面版 GUI 代理 (VS Code)',
    mode: 'auto-mcp',
    modeLabel: '一鍵專案安裝 + MCP JSON',
    installIdeKey: 'cline',
    defaultScope: 'project',
    hasSkillsFlag: false,
    configPath: '<目標專案>/.vscode/mcp.json（或 Cline 面板 Configure MCP Servers 的 cline_mcp_settings.json）',
    mcpFormat: 'servers',
    summary: '桌面版 IDE 代理擴充，支援透過 install-plugin.js 寫入專案級 .vscode/mcp.json，亦可複製標準 mcpServers JSON 至 Cline 面板設定。',
    steps: [
      '執行下方一鍵安裝指令寫入目標專案 .vscode/mcp.json；或點擊 Cline 桌面面板右上角「MCP Servers」→「Configure MCP Servers」。',
      '若使用全域設定檔（cline_mcp_settings.json），請改貼下方 `mcpServers` 格式區塊並儲存。',
      '確認 tool-calling 狀態為綠燈後，即可在 Cline 對話中自動呼叫 search_tools / list_tools。',
    ],
    promptTemplate: '請呼叫 tool-calling MCP 的 search_tools 查詢符合以下需求的開源工具，並比較推薦方案後再開始實作：<在此輸入需求>',
  },
  {
    id: 'deepseek-harness',
    name: 'DeepSeek Harness',
    group: 'featured',
    categoryLabel: '桌面版 GUI 調用環境',
    mode: 'manual-mcp',
    modeLabel: '標準 MCP JSON / 內建終端',
    installIdeKey: null,
    configPath: 'DeepSeek Harness 桌面版設定 > MCP / Tools（貼上標準 mcpServers JSON）',
    mcpFormat: 'mcpServers',
    summary: '桌面版 AI 代理環境，支援透過標準 MCP stdio 設定或專案內 CLI 調用本工具庫，可將下方 mcpServers JSON 填入工具設定面板。',
    steps: [
      '打開 DeepSeek Harness 桌面版的工具／MCP 設定面板，將下方「標準 MCP 設定 JSON」加入 `mcpServers` 區塊。',
      '若目前版本未掛載 MCP，可直接在工作區終端機執行 `node cli.js search "<需求>"`。',
      '透過 `node cli.js info <tool-id>` 取得工具詳細規格、推薦場景（useCase）與禁用場景（negativeConstraints）。',
    ],
    promptTemplate: '請優先透過 tool-calling MCP（或執行 `node cli.js search "<需求>"`）檢索工具庫，確認推薦場景與禁用條件後再挑選工具。',
  },
  {
    id: 'kiro',
    name: 'Kiro',
    group: 'featured',
    categoryLabel: '桌面版 Agentic IDE',
    mode: 'auto-mcp',
    modeLabel: '一鍵安裝 (全域 / 專案)',
    installIdeKey: 'kiro',
    defaultScope: 'global',
    hasSkillsFlag: false,
    configPath: '~/.kiro/settings/mcp.json 或 <目標專案>/.kiro/settings/mcp.json',
    mcpFormat: 'mcpServers',
    summary: '桌面版 Agentic IDE，已原生支援於 install-plugin.js，可自動合併寫入全域或專案級的 Kiro MCP 設定檔，不影響既有設定。',
    steps: [
      '於終端機執行下方「一鍵安裝指令」，將 tool-calling 寫入 ~/.kiro/settings/mcp.json。',
      '重新啟動 Kiro 桌面版或於 Kiro MCP 面板重新整理，確認 tool-calling 工具列表已載入。',
      '在 Kiro Spec / Chat 視窗中直接提出任務需求，代理會自動透過 search_tools 與 plan_toolchain 選型。',
    ],
    promptTemplate: '請使用 tool-calling MCP 的 plan_toolchain 為以下開發任務規劃多工具鏈與步驟：<在此輸入需求>',
  },
  {
    id: 'kirocrew',
    name: 'KiroCrew',
    group: 'featured',
    categoryLabel: '桌面版多代理協作工具',
    mode: 'manual-mcp',
    modeLabel: '共用 Kiro MCP / AGENTS.md',
    installIdeKey: null,
    configPath: '共用 ~/.kiro/settings/mcp.json（或於桌面版 Crew 設定貼上標準 mcpServers JSON）',
    mcpFormat: 'mcpServers',
    summary: '桌面版多代理協作工具，可沿用 Kiro 的 MCP 設定檔與專案 AGENTS.md 協議，讓團隊代理在分工前先檢索並對齊工具選型。',
    steps: [
      '若已透過 Kiro 一鍵安裝過 tool-calling（`--ide kiro`），KiroCrew 桌面版可直接共用該 MCP 伺服器設定。',
      '若為獨立配置，請將下方「標準 MCP 設定 JSON」貼入 KiroCrew 的 MCP / Tools 設定面板。',
      '指派任務時可要求協調者代理先呼叫 `plan_toolchain` 產生 DAG 工具鏈，再分配給各子代理執行。',
    ],
    promptTemplate: '請協調者代理先呼叫 tool-calling MCP 的 plan_toolchain 拆解任務依賴，再將各步驟指派給對應子代理：<在此輸入需求>',
  },
  {
    id: 'minimax-code',
    name: 'MiniMax Code',
    group: 'featured',
    categoryLabel: '桌面版 GUI 開發代理',
    mode: 'manual-mcp',
    modeLabel: '標準 MCP JSON / 內建終端',
    installIdeKey: null,
    configPath: 'MiniMax Code 桌面版 MCP 設定面板（貼上標準 mcpServers JSON）',
    mcpFormat: 'mcpServers',
    summary: '桌面版 AI 程式開發代理，可透過標準 MCP stdio 設定連接本專案的 mcp-server.js，或於專案資料夾內搭配 AGENTS.md 與 CLI 檢索。',
    steps: [
      '在 MiniMax Code 桌面版的設定介面新增 MCP Server，並貼上下方「標準 MCP 設定 JSON」。',
      '儲存後確認連線狀態正常，即可使用 `search_tools`、`compare_tools` 等 MCP 工具。',
      '若以一般對話模式協作，請直接指示代理於內建終端機執行 `node cli.js search "<需求>"` 取得候選清單。',
    ],
    promptTemplate: '請使用 tool-calling MCP（或執行 `node cli.js search "<需求>"`）搜尋最適合的開源工具，並列出比較後再動手撰寫程式。',
  },
  {
    id: 'opencode',
    name: 'OpenCode',
    group: 'featured',
    categoryLabel: '桌面版 GUI 開發代理',
    mode: 'auto-mcp',
    modeLabel: '一鍵安裝 (專屬 JSON 格式)',
    installIdeKey: 'opencode',
    defaultScope: 'global',
    hasSkillsFlag: false,
    configPath: '~/.config/opencode/opencode.json 或 <目標專案>/opencode.json',
    mcpFormat: 'opencode',
    summary: '桌面版 GUI 與核心共用 opencode.json 設定，已原生支援於 install-plugin.js！採用專屬 `"mcp"` 鍵與 `type: "local"` 格式，建議以腳本自動寫入。',
    steps: [
      '執行下方「一鍵安裝指令」，自動在 opencode.json 合併寫入 `mcp.tool-calling` 區段。',
      '開啟 OpenCode 桌面版後檢視 MCP 工具狀態，確認 `tool-calling` 已啟用 (`enabled: true`)。',
      '直接在 OpenCode 對話框中描述需求，代理將自動呼叫 `search_tools` 與 `plan_toolchain`。',
    ],
    promptTemplate: '請呼叫 tool-calling MCP 的 search_tools 工具檢索目前專案需求的最佳開源工具：<在此輸入需求>',
  },
  {
    id: 'qoder',
    name: 'Qoder',
    group: 'featured',
    categoryLabel: '桌面版 AI IDE',
    mode: 'manual-mcp',
    modeLabel: '標準 MCP JSON / AGENTS.md',
    installIdeKey: null,
    configPath: 'Qoder 桌面版設定 > MCP 伺服器設定（貼上標準 mcpServers JSON）',
    mcpFormat: 'mcpServers',
    summary: '桌面版 AI 程式開發 IDE，支援標準 MCP Server 整合與專案規範讀取。貼上下方 JSON 後即可在對話中直接檢索 Tool-Calling 工具庫。',
    steps: [
      '開啟 Qoder 桌面版設定中的 MCP 伺服器管理頁面，選擇新增本地 (stdio) 伺服器或編輯 JSON 設定。',
      '複製下方「標準 MCP 設定 JSON」並貼入，確認 `args` 中的 `mcp-server.js` 路徑正確無誤。',
      '開啟本專案資料夾時，Qoder 亦會讀取 AGENTS.md 規範；在對話框中描述需求即可觸發工具檢索。',
    ],
    promptTemplate: '請透過 tool-calling MCP 檢索並比較相關開源工具（注意檢查 negativeConstraints 禁用條件），再給我實作建議：<在此輸入需求>',
  },
  {
    id: 'trae',
    name: 'TRAE',
    group: 'featured',
    categoryLabel: '桌面版 AI IDE',
    mode: 'auto-mcp',
    modeLabel: '一鍵專案安裝 / 手動全域',
    installIdeKey: 'trae',
    defaultScope: 'project',
    hasSkillsFlag: false,
    configPath: '<目標專案>/.trae/mcp.json（全域可於 TRAE 桌面版「設定 > MCP > 手動添加」貼上 JSON）',
    mcpFormat: 'mcpServers',
    summary: '桌面版 AI 程式開發 IDE，已原生支援於 install-plugin.js 專案級寫入（.trae/mcp.json）；若要全域使用，請於 TRAE 介面手動貼上標準 JSON。',
    steps: [
      '執行下方一鍵安裝指令，將設定寫入目標專案的 `.trae/mcp.json`；或開啟 TRAE 桌面版「設定 > MCP > 手動添加」。',
      '確認 TRAE MCP 清單中 `tool-calling` 顯示已連線。',
      '於 TRAE Builder / Chat 模式輸入任務需求，代理即可調用工具庫進行選型與環境預檢。',
    ],
    promptTemplate: '請呼叫 tool-calling MCP 的 search_tools 與 plan_toolchain 協助我完成以下任務：<在此輸入需求>',
  },
  {
    id: 'workbuddy-ai',
    name: 'WorkBuddy AI',
    group: 'featured',
    categoryLabel: '桌面版 GUI 工作助理',
    mode: 'manual-mcp',
    modeLabel: '標準 MCP JSON / CLI 協作',
    installIdeKey: null,
    configPath: 'WorkBuddy AI 桌面版設定 > 擴充／MCP 面板（或於本機搭配 CLI 使用）',
    mcpFormat: 'mcpServers',
    summary: '桌面版 AI 工作助理代理。若您的 WorkBuddy AI 版本支援 MCP 外掛，請貼上下方標準 JSON；若為一般工作流對話模式，可搭配本機 CLI 快速查詢工具。',
    steps: [
      '檢查 WorkBuddy AI 桌面版設定中是否有 MCP / Tools 擴充入口，若有請貼上下方「標準 MCP 設定 JSON」。',
      '若無 MCP 入口，可在終端機執行 `node cli.js interview "<模糊需求>"` 或 `node cli.js search "<需求>"`。',
      '將檢索到的工具規格與下方提示詞範本貼給 WorkBuddy AI，協助整理工作流與執行清單。',
    ],
    promptTemplate: '請協助我整合以下透過 Tool-Calling 檢索出的開源工具，整理成具體的操作步驟與注意事項：\n\n[貼上 CLI 輸出或描述需求]',
  },

  // ─── 其他既有相容 IDE（保留支援） ─────────────────────────────────────────
  {
    id: 'claude',
    name: 'Claude Code',
    group: 'other',
    categoryLabel: '終端機 Agent',
    mode: 'auto-mcp',
    modeLabel: '一鍵安裝 (MCP + Skill)',
    installIdeKey: 'claude',
    defaultScope: 'global',
    hasSkillsFlag: true,
    configPath: '~/.claude.json 或 <目標專案>/.mcp.json',
    mcpFormat: 'mcpServers',
    summary: '完整支援全域與專案級 MCP 安裝及 Claude Skills 同步複製。',
    steps: [
      '執行下方一鍵安裝指令，自動寫入 MCP 設定並複製技能檔。',
      '執行 `claude` 啟動後輸入 `/mcp` 確認 tool-calling 已連線。',
      '直接下達開發需求即可呼叫工具庫。',
    ],
    promptTemplate: '請使用 tool-calling MCP 搜尋並規劃適合以下任務的工具鏈：<在此輸入需求>',
  },
  {
    id: 'cursor',
    name: 'Cursor',
    group: 'other',
    categoryLabel: 'AI IDE',
    mode: 'auto-mcp',
    modeLabel: '一鍵安裝 (全域 / 專案)',
    installIdeKey: 'cursor',
    defaultScope: 'global',
    hasSkillsFlag: false,
    configPath: '~/.cursor/mcp.json 或 <目標專案>/.cursor/mcp.json',
    mcpFormat: 'mcpServers',
    summary: '支援透過 install-plugin.js 寫入全域或專案級 .cursor/mcp.json。',
    steps: [
      '執行下方一鍵安裝指令。',
      '開啟 Cursor Settings > MCP 重新整理工具列表。',
      '在 Agent 模式中直接提出需求即可使用。',
    ],
    promptTemplate: '請透過 tool-calling MCP 檢索最適合的工具：<在此輸入需求>',
  },
  {
    id: 'gemini',
    name: 'Gemini CLI',
    group: 'other',
    categoryLabel: '終端機 Agent',
    mode: 'auto-mcp',
    modeLabel: '一鍵安裝 (MCP + Skill)',
    installIdeKey: 'gemini',
    defaultScope: 'global',
    hasSkillsFlag: true,
    configPath: '~/.gemini/settings.json 或 <目標專案>/.gemini/settings.json',
    mcpFormat: 'mcpServers',
    summary: '支援全域與專案級 MCP 設定以及 Skills 目錄同步。',
    steps: [
      '執行下方一鍵安裝指令。',
      '啟動 Gemini CLI 並確認 tool-calling MCP 工具已載入。',
      '輸入任務需求即可自動檢索與調用。',
    ],
    promptTemplate: '請呼叫 tool-calling MCP 為此任務推薦與規劃工具：<在此輸入需求>',
  },
  {
    id: 'windsurf',
    name: 'Windsurf',
    group: 'other',
    categoryLabel: 'AI IDE',
    mode: 'auto-mcp',
    modeLabel: '一鍵安裝 (全域)',
    installIdeKey: 'windsurf',
    defaultScope: 'global',
    hasSkillsFlag: false,
    configPath: '~/.codeium/windsurf/mcp_config.json',
    mcpFormat: 'mcpServers',
    summary: '支援全域寫入 Windsurf mcp_config.json。',
    steps: [
      '執行下方一鍵安裝指令。',
      '於 Windsurf Cascade 面板重新載入 MCP 設定。',
      '即可於對話中使用工具庫。',
    ],
    promptTemplate: '請使用 tool-calling MCP 搜尋合適的開源工具：<在此輸入需求>',
  },
  {
    id: 'vscode',
    name: 'VS Code (Copilot)',
    group: 'other',
    categoryLabel: 'IDE 擴充',
    mode: 'auto-mcp',
    modeLabel: '一鍵安裝 (專案級)',
    installIdeKey: 'vscode',
    defaultScope: 'project',
    hasSkillsFlag: false,
    configPath: '<目標專案>/.vscode/mcp.json',
    mcpFormat: 'servers',
    summary: '支援寫入 VS Code 原生 .vscode/mcp.json（使用 "servers" 鍵）。',
    steps: [
      '執行下方一鍵安裝指令（建議指定目標專案路徑）。',
      '於 VS Code Copilot Agent 模式啟用 tool-calling MCP。',
      '直接提問即可進行工具檢索。',
    ],
    promptTemplate: '請透過 tool-calling MCP 檢索並比較相關工具：<在此輸入需求>',
  },
  {
    id: 'zed',
    name: 'Zed',
    group: 'other',
    categoryLabel: '高效能 IDE',
    mode: 'auto-mcp',
    modeLabel: '一鍵安裝 (全域 / 專案)',
    installIdeKey: 'zed',
    defaultScope: 'global',
    hasSkillsFlag: false,
    configPath: '~/.config/zed/settings.json（或 Windows %APPDATA%\\Zed\\settings.json）',
    mcpFormat: 'context_servers',
    summary: '支援寫入 Zed 的 context_servers 區段（全域或專案級）。',
    steps: [
      '執行下方一鍵安裝指令。',
      '重新載入 Zed Assistant 面板確認 context server 就緒。',
      '在對話中呼叫 tool-calling 工具。',
    ],
    promptTemplate: '請使用 tool-calling context server 查詢適合的工具：<在此輸入需求>',
  },
  {
    id: 'roo',
    name: 'Roo Code',
    group: 'other',
    categoryLabel: 'VS Code 擴充代理',
    mode: 'auto-mcp',
    modeLabel: '一鍵安裝 (專案級)',
    installIdeKey: 'roo',
    defaultScope: 'project',
    hasSkillsFlag: false,
    configPath: '<目標專案>/.roo/mcp.json',
    mcpFormat: 'mcpServers',
    summary: '支援專案級 .roo/mcp.json 自動寫入。',
    steps: [
      '執行下方一鍵安裝指令。',
      '於 Roo Code 面板確認 MCP 伺服器已啟動。',
      '在任務中直接呼叫 search_tools / plan_toolchain。',
    ],
    promptTemplate: '請呼叫 tool-calling MCP 搜尋並規劃任務工具鏈：<在此輸入需求>',
  },
  {
    id: 'codex',
    name: 'OpenAI Codex CLI',
    group: 'other',
    categoryLabel: '終端機 Agent',
    mode: 'auto-mcp',
    modeLabel: '一鍵安裝 (TOML)',
    installIdeKey: 'codex',
    defaultScope: 'global',
    hasSkillsFlag: false,
    configPath: '~/.codex/config.toml',
    mcpFormat: 'toml',
    summary: '支援自動合併寫入 ~/.codex/config.toml 的 [mcp_servers.tool-calling] 區段。',
    steps: [
      '執行下方一鍵安裝指令。',
      '啟動 Codex CLI 後即可自動載入 tool-calling MCP。',
      '直接輸入任務需求進行檢索與規劃。',
    ],
    promptTemplate: '請透過 tool-calling MCP 檢索並比較適合的工具：<在此輸入需求>',
  },
];

/**
 * 依專案路徑產生 mcp-server.js 完整路徑
 */
export function resolveMcpEntryPath(projectPath) {
  const clean = (projectPath || DEFAULT_PROJECT_PATH).trim().replace(/[\\/]+$/, '');
  const sep = clean.includes('/') && !clean.includes('\\') ? '/' : '\\';
  return `${clean}${sep}mcp-server.js`;
}

/**
 * 依 Agent 格式產生對應 MCP 設定文字（JSON 或 TOML）
 */
export function buildMcpConfigText(agent, projectPath) {
  if (!agent || !agent.mcpFormat) return null;
  const entryPath = resolveMcpEntryPath(projectPath);

  if (agent.mcpFormat === 'opencode') {
    return JSON.stringify(
      {
        mcp: {
          'tool-calling': {
            type: 'local',
            command: ['node', entryPath],
            enabled: true,
          },
        },
      },
      null,
      2
    );
  }

  if (agent.mcpFormat === 'servers') {
    return JSON.stringify(
      {
        servers: {
          'tool-calling': {
            command: 'node',
            args: [entryPath],
          },
        },
      },
      null,
      2
    );
  }

  if (agent.mcpFormat === 'context_servers') {
    return JSON.stringify(
      {
        context_servers: {
          'tool-calling': {
            command: 'node',
            args: [entryPath],
          },
        },
      },
      null,
      2
    );
  }

  if (agent.mcpFormat === 'toml') {
    return `[mcp_servers.tool-calling]\ncommand = "node"\nargs = [${JSON.stringify(entryPath)}]`;
  }

  return JSON.stringify(
    {
      mcpServers: {
        'tool-calling': {
          command: 'node',
          args: [entryPath],
        },
      },
    },
    null,
    2
  );
}

/**
 * 產生 install-plugin.js 一鍵安裝指令
 */
export function buildCliInstallCommand(agent, projectPath) {
  if (!agent || !agent.installIdeKey) return null;
  const scope = agent.defaultScope || 'global';
  const parts = ['node', 'scripts/install-plugin.js', '--ide', agent.installIdeKey, '--scope', scope];
  if (scope === 'project') {
    const clean = (projectPath || DEFAULT_PROJECT_PATH).trim() || '<你的目標專案路徑>';
    parts.push('--target', `"${clean}"`);
  }
  if (agent.hasSkillsFlag) {
    parts.push('--with-skills');
  }
  return parts.join(' ');
}

/**
 * 複製文字到剪貼簿並顯示按鈕回饋
 */
async function copyTextWithFeedback(text, btn) {
  const original = btn.dataset.originalLabel || btn.textContent;
  btn.dataset.originalLabel = original;
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    btn.textContent = '已複製 ✓';
    btn.classList.add('copied');
  } catch {
    btn.textContent = '複製失敗';
  }
  setTimeout(() => {
    btn.textContent = original;
    btn.classList.remove('copied');
  }, 1600);
}

/**
 * 建立帶複製按鈕的程式碼區塊
 */
function createCodeBlock(titleText, codeText) {
  const wrap = document.createElement('div');
  wrap.className = 'ag-code-block';

  const bar = document.createElement('div');
  bar.className = 'ag-code-bar';

  const label = document.createElement('span');
  label.className = 'ag-code-title';
  label.textContent = titleText;

  const copyBtn = document.createElement('button');
  copyBtn.type = 'button';
  copyBtn.className = 'ag-copy-btn';
  copyBtn.textContent = '複製';
  copyBtn.addEventListener('click', () => copyTextWithFeedback(codeText, copyBtn));

  bar.append(label, copyBtn);

  const pre = document.createElement('pre');
  pre.className = 'ag-code-pre';
  const code = document.createElement('code');
  code.textContent = codeText;
  pre.appendChild(code);

  wrap.append(bar, pre);
  return wrap;
}

/**
 * 初始化「AI Agents 使用指南」視圖
 */
export function initAgentsGuide() {
  const featuredGrid = document.getElementById('agFeaturedGrid');
  const othersGrid = document.getElementById('agOthersGrid');
  const detailPanel = document.getElementById('agDetailPanel');
  const pathInput = document.getElementById('agentProjectPathInput');
  const toggleOthersBtn = document.getElementById('agToggleOthersBtn');

  if (!featuredGrid || !detailPanel) return;

  if (pathInput && !pathInput.value) {
    pathInput.value = DEFAULT_PROJECT_PATH;
  }

  let selectedId = AGENTS_CATALOG[0].id;
  const cardButtons = new Map();

  function renderDetail() {
    const agent = AGENTS_CATALOG.find((a) => a.id === selectedId) || AGENTS_CATALOG[0];
    const projectPath = pathInput ? pathInput.value : DEFAULT_PROJECT_PATH;

    for (const [id, btn] of cardButtons.entries()) {
      const isSelected = id === agent.id;
      btn.classList.toggle('active', isSelected);
      btn.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
    }

    detailPanel.innerHTML = '';

    // 標頭區
    const head = document.createElement('div');
    head.className = 'ag-detail-head';

    const titleGroup = document.createElement('div');
    titleGroup.className = 'ag-detail-title-group';

    const h3 = document.createElement('h3');
    h3.className = 'ag-detail-name';
    h3.textContent = agent.name;

    const badges = document.createElement('div');
    badges.className = 'ag-detail-badges';

    const catBadge = document.createElement('span');
    catBadge.className = 'ag-badge ag-badge-neutral';
    catBadge.textContent = agent.categoryLabel;

    const modeBadge = document.createElement('span');
    modeBadge.className = `ag-badge ag-badge-${agent.mode}`;
    modeBadge.textContent = agent.modeLabel;

    badges.append(catBadge, modeBadge);
    titleGroup.append(h3, badges);
    head.appendChild(titleGroup);

    const summary = document.createElement('p');
    summary.className = 'ag-detail-summary';
    summary.textContent = agent.summary;

    // 設定路徑提示
    const pathBox = document.createElement('div');
    pathBox.className = 'ag-config-path';
    const pathLabel = document.createElement('span');
    pathLabel.className = 'ag-config-path-label';
    pathLabel.textContent = '設定檔位置：';
    const pathVal = document.createElement('code');
    pathVal.textContent = agent.configPath;
    pathBox.append(pathLabel, pathVal);

    // 操作步驟
    const stepsWrap = document.createElement('div');
    stepsWrap.className = 'ag-steps-wrap';
    const stepsTitle = document.createElement('h4');
    stepsTitle.className = 'ag-section-heading';
    stepsTitle.textContent = '接入步驟';
    const ol = document.createElement('ol');
    ol.className = 'ag-steps-list';
    for (const stepText of agent.steps) {
      const li = document.createElement('li');
      li.textContent = stepText;
      ol.appendChild(li);
    }
    stepsWrap.append(stepsTitle, ol);

    detailPanel.append(head, summary, pathBox, stepsWrap);

    // 一鍵安裝指令
    const cliCmd = buildCliInstallCommand(agent, projectPath);
    if (cliCmd) {
      detailPanel.appendChild(createCodeBlock('一鍵安裝指令（於 Tool-Calling 根目錄執行）', cliCmd));
    }

    // MCP JSON / TOML 設定
    const mcpText = buildMcpConfigText(agent, projectPath);
    if (mcpText) {
      const formatTitle =
        agent.mcpFormat === 'toml'
          ? 'Codex TOML 設定片段'
          : agent.mcpFormat === 'opencode'
            ? 'OpenCode MCP 設定 JSON'
            : agent.mcpFormat === 'servers'
              ? 'VS Code / Cline 專案級 MCP 設定 JSON'
              : '標準 MCP 設定 JSON（可手動貼入對應設定檔）';
      detailPanel.appendChild(createCodeBlock(formatTitle, mcpText));
    }

    // Cline 額外提供全域 mcpServers JSON（cline_mcp_settings.json 使用 mcpServers 鍵）
    if (agent.id === 'cline') {
      const clineGlobalJson = JSON.stringify(
        {
          mcpServers: {
            'tool-calling': {
              command: 'node',
              args: [resolveMcpEntryPath(projectPath)],
            },
          },
        },
        null,
        2
      );
      detailPanel.appendChild(createCodeBlock('Cline 全域設定檔（cline_mcp_settings.json）用 JSON', clineGlobalJson));
    }

    // 常用 CLI 指令（所有代理皆可用於手動或終端機協作）
    detailPanel.appendChild(
      createCodeBlock(
        '常用本機 CLI 指令（所有 AI Agents 皆可搭配）',
        [
          'node cli.js search "<你的任務需求>"',
          'node cli.js plan "<多步驟複雜任務>"',
          'node cli.js interview "<模糊需求>"',
          'node cli.js info <tool-id>',
        ].join('\n')
      )
    );

    // 協作提示詞範本
    if (agent.promptTemplate) {
      detailPanel.appendChild(createCodeBlock('對話協作提示詞範本', agent.promptTemplate));
    }
  }

  function createAgentCard(agent) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ag-agent-card';
    btn.dataset.agentId = agent.id;
    btn.setAttribute('aria-pressed', 'false');

    const top = document.createElement('div');
    top.className = 'ag-agent-card-top';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'ag-agent-name';
    nameSpan.textContent = agent.name;

    const dot = document.createElement('span');
    dot.className = `ag-mode-dot ag-mode-dot-${agent.mode}`;
    dot.title = agent.modeLabel;

    top.append(nameSpan, dot);

    const sub = document.createElement('span');
    sub.className = 'ag-agent-cat';
    sub.textContent = agent.categoryLabel;

    btn.append(top, sub);

    btn.addEventListener('click', () => {
      selectedId = agent.id;
      renderDetail();
    });

    cardButtons.set(agent.id, btn);
    return btn;
  }

  const featuredAgents = AGENTS_CATALOG.filter((a) => a.group === 'featured');
  const otherAgents = AGENTS_CATALOG.filter((a) => a.group === 'other');

  featuredGrid.innerHTML = '';
  for (const agent of featuredAgents) {
    featuredGrid.appendChild(createAgentCard(agent));
  }

  if (othersGrid) {
    othersGrid.innerHTML = '';
    for (const agent of otherAgents) {
      othersGrid.appendChild(createAgentCard(agent));
    }
  }

  if (toggleOthersBtn && othersGrid) {
    const otherCount = otherAgents.length;
    toggleOthersBtn.textContent = `展開其他相容 IDE（${otherCount} 款）`;
    toggleOthersBtn.addEventListener('click', () => {
      const isHidden = othersGrid.hasAttribute('hidden');
      if (isHidden) {
        othersGrid.removeAttribute('hidden');
        toggleOthersBtn.setAttribute('aria-expanded', 'true');
        toggleOthersBtn.textContent = `收合其他相容 IDE（${otherCount} 款）`;
      } else {
        othersGrid.setAttribute('hidden', '');
        toggleOthersBtn.setAttribute('aria-expanded', 'false');
        toggleOthersBtn.textContent = `展開其他相容 IDE（${otherCount} 款）`;
      }
    });
  }

  if (pathInput) {
    pathInput.addEventListener('input', () => renderDetail());
  }

  renderDetail();
}
