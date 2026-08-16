# Find Skill 整合指南 - 技術詳細說明

本文檔提供 Find Skill 功能的完整技術分析與整合方案。

## 一、現狀診斷

### 1.1 已有組件

| 組件 | 路徑 | 狀態 | 可用性 |
|------|------|------|--------|
| 核心搜尋模組 | `core/skill-discovery.js` | ✅ 已完成 | 可正常匯入 |
| CLI 命令入口 | `cli.js` (find-skill/install-skill) | ✅ 已完成 | 已整合 |
| 環境檢查 | `npx skills --version` | ✅ v1.5.18 | Node v22.14.0 就緒 |
| MCP 工具 | `mcp-server.js` | ❌ 缺失 | 需整合 |

### 1.2 環境驗證結果

```bash
$ node -v
v22.14.0

$ npx skills --version
1.5.18

$ node -e "import('./core/skill-discovery.js').then(m => console.log('OK'))"
Module loads successfully
```

**結論**: 所有基礎設施就緒，只需整合到主 CLI。

---

## 二、技術架構

### 2.1 現有程式碼分析

#### core/skill-discovery.js（322 行）

**主要函數**:
```javascript
export function searchSkills(query, limit = 10)    // 搜尋，帶緩存
export function installSkill(skillId)              // 安裝
export function listSkills()                       // 列出已安裝
export function isSkillCliAvailable()              // 環境檢查
export async function getSkillDetails(repo, skill) // GitHub SKILL.md 抓取
```

**實現特點**:
- 使用 `execSync` 調用 `npx skills find <query>`
- 本地快取：`~/.tool-calling/skills-cache.json`，TTL 1 小時
- 容錯設計：JSON 解析失敗 → fallback 文字解析
- 錯誤處理：API 超時返回空陣列而非拋出異常

> 註:原獨立包裝腳本 `scripts/find-skill.js`(search/install/list/check)已於
> 2026-08-16 v1.6 優化中移除,功能由 `cli.js` 的 `find-skill` / `install-skill`
> 命令提供(`core/skill-discovery.js` 為唯一核心模組)。

### 2.2 CLI 結構映射

當前 `cli.js` 命令結構：

```
cli.js
├── 工具管理命令
│   ├── list                    # 列出所有工具
│   ├── search <query> [-c cat] # 搜尋工具
│   ├── info <id>               # 查看詳情
│   ├── add <url>               # 新增工具
│   ├── batch-add <file>        # 批量新增
│   ├── remove <id>             # 移除工具
│   └── validate                # 驗證註冊庫
│
├── 執行命令
│   ├── install <id>            # 下載原始碼
│   ├── invoke <id> [args]      # 沙盒執行
│   └── cleanup                 # 清理臨時檔案
│
├── 分析命令
│   ├── plan <task>             # 多工具鏈規劃
│   ├── compare <query>         # 競品對比
│   ├── interview <query>       # 互動問答
│   └── verify-environment <id> # 環境預檢
│
└── ❌ 缺少：find-skill / install-skill / list-skills
```

---

## 三、整合方案詳細設計

### 方案 A：CLI 集成（P0，推薦優先）

#### 3.1.1 修改位置

**位置 1**: 頂部 import 區（約第 6 行）

```javascript
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { search, listAll, listByCategory, getById, planToolChain, extractQueryContext } from './core/search-engine.js';
import { scanMonorepo } from './scripts/scan-monorepo.js';
import { loadRegistry, saveRegistry, generateId } from './core/registry.js';
import { assessRegistryContract } from './core/registry-contract.js';

// ⬇️ 新增 import ⬇️
import { 
  searchSkills, 
  installSkill, 
  listSkills, 
  isSkillCliAvailable 
} from './core/skill-discovery.js';
```

**位置 2**: 命令處理函數區（在 `cmdHealthCheck` 後新增，約第 400 行）

```javascript
// ─── 命令：find-skill ────────────────────────────────────────────────────────

async function cmdFindSkill(query, options = {}) {
  if (!query) {
    error('請提供搜尋關鍵字。用法: node cli.js find-skill "pdf"');
    process.exit(1);
  }

  header(`🔍 搜尋 Skills: "${query}"`);

  if (!isSkillCliAvailable()) {
    warn('npx skills CLI 暫時不可用');
    console.log(`${c.dim}提示: 建議直接訪問 https://skills.sh 搜尋 Skills${c.reset}\n`);
    console.log(`${c.cyan}或者手動執行:${c.reset}`);
    console.log(`  ${c.yellow}npx skills find "${query}"${c.reset}`);
    return;
  }

  const results = await searchSkills(query, options.limit || 10);

  if (results.length === 0) {
    warn(`找不到與 "${query}" 相關的 Skills`);
    console.log(`${c.dim}提示: 嘗試其他關鍵字或直接在 https://skills.sh 瀏覽${c.reset}\n`);
    return;
  }

  console.log(`\n找到 ${results.length} 個結果:\n`);
  results.forEach((skill, i) => {
    console.log(`${c.bold}#${i + 1} ${c.cyan}${skill.name}${c.reset}`);
    console.log(`   ID: ${skill.id}`);
    console.log(`   URL: ${c.blue}${skill.url}${c.reset}`);
    console.log(`   來源: ${skill.source}`);
    console.log('');
  });

  console.log(`${c.dim}使用以下方式安裝:${c.reset}`);
  console.log(`  ${c.green}node cli.js install-skill ${results[0].id}${c.reset}`);
}

// ─── 命令：install-skill ─────────────────────────────────────────────────────

function cmdInstallSkill(skillId) {
  if (!skillId) {
    error('請提供要安裝的 Skill ID。用法: node cli.js install-skill owner/repo@skill-name');
    process.exit(1);
  }

  header(`📦 安裝 Skill: ${skillId}`);
  const result = installSkill(skillId);
  
  if (result.success) {
    success(result.message);
  } else {
    error(`安裝失敗: ${result.message}`);
    console.log(`${c.dim}提示: 檢查 Skill ID 是否正確，或稍後再試${c.reset}`);
  }
}

// ─── 命令：list-skills ───────────────────────────────────────────────────────

function cmdListSkills() {
  header('📋 已安裝的 Skills');
  const skills = listSkills();

  if (skills.length === 0) {
    info('目前沒有安裝任何 Skills');
    console.log(`${c.dim}使用 ${c.green}find-skill <關鍵字>${c.reset} ${c.dim}來發現新技能${c.reset}\n`);
    return;
  }

  console.log(`\n共 ${skills.length} 個已安裝 Skills:\n`);
  skills.forEach(s => {
    console.log(`  ${c.green}✓${c.reset} ${s}`);
  });
}
```

**位置 3**: main() switch 語句（約第 600 行）

```javascript
switch (command) {
  // ... 現有案例 ...
  
  case 'find-skill': {
    const query = args.join(' ');
    const limitMatch = args.find(a => a === '--limit' || a === '-n');
    let limit = 10;
    if (limitMatch) {
      const idx = args.indexOf(limitMatch);
      limit = parseInt(args[idx + 1]) || 10;
    }
    await cmdFindSkill(query, { limit });
    break;
  }
  case 'install-skill':
    cmdInstallSkill(args[0]);
    break;
  case 'list-skills':
    cmdListSkills();
    break;
    
  case 'help':
  case '--help':
  case '-h':
    showHelp();
    break;
  default:
    if (!command) {
      showHelp();
    } else {
      error(`未知命令: ${command}`);
      showHelp();
    }
}
```

**位置 4**: showHelp() 函數（約第 550 行）

```javascript
function showHelp() {
  console.log(`
${c.bgBlue}${c.white}${c.bold} Tool-Calling CLI ${c.reset}  ${c.dim}全自動工具調用效能外掛系統${c.reset}

${c.bold}用法:${c.reset}
  node cli.js <command> [args]

${c.bold}工具管理命令:${c.reset}
  ${c.cyan}list${c.reset}                    列出所有已註冊工具
  ${c.cyan}search${c.reset} <query> [-c category]  搜尋最適工具（支援自然語言與分類過濾）
  ${c.cyan}info${c.reset} <id>                查看工具詳細資訊
  ${c.cyan}add${c.reset} <github-url>         新增工具（自動解析類型：tool/resource/monorepo）
  ${c.cyan}batch-add${c.reset} <file>         從檔案批量新增
  ${c.cyan}remove${c.reset} <id|url>          移除工具
  ${c.cyan}validate${c.reset}                 驗證註冊庫格式
  ${c.cyan}health-check${c.reset}             檢查所有工具 URL

${c.bold}技能搜尋命令:${c.reset}  ${c.dim}// skills.sh 生態系${c.reset}
  ${c.cyan}find-skill${c.reset} <query> [-n limit]  搜尋 Agent Skills
  ${c.cyan}install-skill${c.reset} <id>             安裝 Agent Skill
  ${c.cyan}list-skills${c.reset}                   列出已安裝的 Skills

${c.bold}執行命令:${c.reset}
  ${c.cyan}install${c.reset} <id>             獲取工具原始碼到 .temp/ 臨時目錄
  ${c.cyan}invoke${c.reset} <id> [args...]      在 Docker 沙盒中安全執行工具
  ${c.cyan}cleanup${c.reset}                  移除所有臨時工具，復歸系統

${c.bold}分析命令:${c.reset}
  ${c.cyan}plan${c.reset} "<任務描述>"           多工具鏈自動規劃
  ${c.cyan}compare${c.reset} "<需求>"            相似工具競品選型對比
  ${c.cyan}interview${c.reset} "<需求>"           互動式需求釐清問答
  ${c.cyan}verify-environment${c.reset} <id>     沙盒環境預檢報告

${c.bold}觸發咒語:${c.reset}
  ${c.magenta}「啟動全自動工具調用模式」${c.reset} — AI Agent 自動識別 + 選擇 + 調用工具
`);
}
```

#### 3.1.2 完整修改統計

| 修改項目 | 行數 | 位置 |
|----------|------|------|
| Import 聲明 | +6 行 | 頂部 |
| cmdFindSkill 函數 | +40 行 | 命令區 |
| cmdInstallSkill 函數 | +15 行 | 命令區 |
| cmdListSkills 函數 | +15 行 | 命令區 |
| Switch case | +15 行 | main() |
| ShowHelp 更新 | +5 行 | help 區 |
| **總計** | **+96 行** | - |

---

### 方案 B：MCP Server 集成（P2，進階）

#### 3.2.1 修改 mcp-server.js

**步驟 1**: 在 tools 陣列中添加三個新工具定義

```javascript
const tools = [
  // ... 現有工具 ...
  
  {
    name: "find_skill",
    description: "Search for AI agent skills in the skills.sh ecosystem. Returns skill metadata including ID, URL, name, and source.",
    inputSchema: {
      type: "object",
      properties: {
        query: { 
          type: "string", 
          description: "Search keyword (e.g., 'pdf', 'typescript testing', 'ppt generation')" 
        },
        limit: { 
          type: "number", 
          default: 10,
          description: "Maximum number of results to return (1-50)" 
        }
      },
      required: ["query"]
    }
  },
  {
    name: "install_skill",
    description: "Install an AI agent skill from skills.sh to the local agent configuration directory.",
    inputSchema: {
      type: "object",
      properties: {
        skill_id: { 
          type: "string", 
          description: "Full skill identifier (e.g., 'vercel-labs/skills@find-skills' or 'anthropic/document-skills')" 
        },
        global: {
          type: "boolean",
          default: false,
          description: "Install globally (~/.gemini/skills/) instead of project-local (.agents/skills/)" 
        }
      },
      required: ["skill_id"]
    }
  },
  {
    name: "list_skills",
    description: "List all installed AI agent skills in the current project or globally.",
    inputSchema: {
      type: "object",
      properties: {
        global: {
          type: "boolean",
          default: false,
          description: "List global skills instead of project skills" 
        }
      }
    }
  }
];
```

**步驟 2**: 在 handleToolCall 函數中添加處理邏輯

```javascript
// 在 import 區添加
import { searchSkills, installSkill, listSkills } from './core/skill-discovery.js';

// 在 switch 語句中添加
case 'find_skill': {
  const { query, limit = 10 } = request.params.arguments;
  try {
    const skills = await searchSkills(query, Math.min(limit, 50));
    return {
      content: [{ 
        type: "text", 
        text: JSON.stringify({ success: true, count: skills.length, skills }, null, 2) 
      }]
    };
  } catch (err) {
    return {
      content: [{ 
        type: "text", 
        text: JSON.stringify({ success: false, error: err.message }) 
      }],
      isError: true
    };
  }
}
case 'install_skill': {
  const { skill_id, global = false } = request.params.arguments;
  const result = installSkill(skill_id);
  return {
    content: [{ 
      type: "text", 
      text: JSON.stringify(result) 
    }]
  };
}
case 'list_skills': {
  const { global = false } = request.params.arguments;
  const skills = listSkills();
  return {
    content: [{ 
      type: "text", 
      text: JSON.stringify({ success: true, skills, count: skills.length }, null, 2) 
    }]
  };
}
```

---

## 四、測試計劃

### 4.1 單元測試（test/find-skill.test.js）

```javascript
import { describe, it, expect, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { 
  searchSkills, 
  installSkill, 
  listSkills, 
  isSkillCliAvailable 
} from '../core/skill-discovery.js';

describe('Find Skill Integration Tests', () => {
  describe('isSkillCliAvailable', () => {
    it('should return true when skills CLI is installed', async () => {
      const available = isSkillCliAvailable();
      assert.equal(available, true); // 基於當前環境確認
    });
  });

  describe('searchSkills', () => {
    it('should return array of skill objects', async () => {
      const results = await searchSkills('pdf', 3);
      assert(Array.isArray(results));
      assert(results.length <= 3);
    });

    it('should return valid skill object structure', async () => {
      const results = await searchSkills('pdf', 1);
      if (results.length > 0) {
        const skill = results[0];
        assert.ok(skill.id, 'skill should have id');
        assert.ok(skill.name, 'skill should have name');
        assert.ok(skill.url, 'skill should have url');
      }
    });
  });

  describe('listSkills', () => {
    it('should return array (may be empty)', () => {
      const skills = listSkills();
      assert(Array.isArray(skills));
    });
  });
});
```

### 4.2 整合測試（手動驗證）

```bash
# 1. 基本搜尋測試
node cli.js find-skill "pdf"

# 預期輸出：
# ╔════════════════════════════════════╗
# ║ 🔍 搜尋 Skills: "pdf"              ║
# ╚════════════════════════════════════╝
# 
# 找到 X 個結果:
# 
# #1 document-skills
#    ID: anthropic/document-skills
#    URL: https://skills.sh/anthropic/document-skills
#    來源: skills.sh
# ...

# 2. 帶限制測試
node cli.js find-skill "typescript" -n 5

# 3. 安裝測試（可選，確認不會實際安裝）
node cli.js install-skill "test/test-skill"
# 預期：返回安裝失敗訊息（因假設的 ID 不存在）

# 4. 列表測試
node cli.js list-skills
# 預期：顯示已安裝的技能清單（可能為空）
```

---

## 五、風險與緩衝策略

### 5.1 已知風險

| 風險類別 | 嚴重程度 | 影響範圍 | 緩解措施 |
|----------|----------|----------|----------|
| skills.sh API 超時 | 🟡 中 | 搜尋功能 | 1 小時緩存 + 友好錯誤提示 |
| 無網路環境 | 🔴 高 | 所有功能 | 檢測並提示离线模式 |
| 技能品質參差 | 🟡 中 | 用戶體驗 | 顯示安裝數與來源 |
| CLI 版本差異 | 🟢 低 | 兼容性 | 版本檢測與提示 |

### 5.2 錯誤處理策略

```javascript
// 搜尋失敗處理
try {
  const results = await searchSkills(query, limit);
  // 成功處理
} catch (err) {
  // 不拋出異常，返回空結果 + 警告
  warn(`搜尋失敗: ${err.message}`);
  console.log(`${c.dim}提示: 可能是網路問題，請稍後再試${c.reset}`);
  return [];
}
```

---

## 六、後續優化方向

### 6.1 短期（1-2 週）
- [ ] 添加技能評分系統（基於安裝數、GitHub stars）
- [ ] 支援多個技能來源（skills.sh + ClawHub + HuggingFace）
- [ ] 離線緩存機制（預先下載熱門技能清單）

### 6.2 中期（1 個月）
- [ ] 技能標籤系統（技術棧、難度、適用場景）
- [ ] 社交功能（收藏、分享技能組合）
- [ ] 技能版本管理（追蹤更新歷史）

### 6.3 長期（3 個月+）
- [ ] 自建技能發佈平台（私有化部署）
- [ ] AI 輔助技能編寫助手
- [ ] 跨平台同步（跨設備技能配置同步）

---

## 七、決策檢查表

在開始整合前，請確認以下事項：

- [ ] **目標明確**: 知道為什麼需要這個功能（AI Agent 自動尋找技能？）
- [ ] **用戶確定**: 知道誰會使用這個功能（開發者？非技術用戶？）
- [ ] **範圍界定**: 明確只需要 skills.sh，還是多個來源
- [ ] **測試計画**: 準備好驗證用例
- [ ] **文檔更新**: 計劃同步更新 README.md

---

**文檔版本**: v1.0  
**最後更新**: 2026-08-12  
**作者**: Tool-Calling Project Team
