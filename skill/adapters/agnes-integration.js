// Tool-Calling：全自動工具調用效能外掛系統
// 平台: Agnes (OpenAI Codex Agent)
// 觸發咒語: 「啟動全自動工具調用模式」
//
// 此檔案作為 Agnes proxy 的工具調用擴展。
// 當 Agnes 偵測到用戶的任務匹配已註冊工具時，
// 透過 CLI 調用 Tool-Calling 系統進行工具檢索與推薦。

const TOOL_CALLING_CLI = 'd:/Self-developed_Apps/Tool-Calling/cli.js';

/**
 * Agnes 整合指引：
 *
 * 1. 觸發條件：
 *    - 用戶說出「啟動全自動工具調用模式」
 *    - 用戶任務匹配已註冊工具的觸發關鍵字
 *
 * 2. 調用方式：
 *    - 搜尋工具: exec(`node ${TOOL_CALLING_CLI} search "${taskDescription}"`)
 *    - 列出工具: exec(`node ${TOOL_CALLING_CLI} list`)
 *    - 工具詳情: exec(`node ${TOOL_CALLING_CLI} info ${toolId}`)
 *    - 新增工具: exec(`node ${TOOL_CALLING_CLI} add ${githubUrl}`)
 *
 * 3. 全自動 SOP:
 *    解析意圖 → 檢索工具 → 評估信心度 → 動態安裝 → 執行 → 清理
 *
 * 4. 完整指引:
 *    d:/Self-developed_Apps/Tool-Calling/skill/core-instructions.md
 */

export default {
  name: 'tool-calling',
  cliPath: TOOL_CALLING_CLI,
  trigger: '啟動全自動工具調用模式',
  registryPath: 'd:/Self-developed_Apps/Tool-Calling/registry/tools.json',
};
