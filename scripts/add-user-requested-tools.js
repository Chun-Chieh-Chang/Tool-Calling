import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const REGISTRY_PATH = join(ROOT, 'registry', 'tools.json');
const TRACKED_PATH = join(ROOT, 'registry', 'tracked-repos.json');
const SNAPSHOTS_PATH = join(ROOT, 'registry', 'star-snapshots.json');

const now = new Date().toISOString();

const newEntries = [
  // 1. HumanLayer Skills (Monorepo 主條目)
  {
    id: "humanlayer-skills",
    name: "HumanLayer Skills",
    url: "https://github.com/humanlayer/skills",
    description: "Official Claude Code skills collection from HumanLayer featuring CLAUDE.md optimizer, iterated agentic loop builder, control loop designer, React prop types refactoring, and visual explanation artifacts.",
    category: "AI 代理",
    language: "typescript",
    triggers: [
      "humanlayer-skills",
      "humanlayer",
      "claude-code-skills",
      "agentic-loop",
      "control-loop",
      "claudemd-optimizer",
      "react-props-narrowing",
      "claude外掛",
      "claude技能庫"
    ],
    capabilities: [
      "claude-code",
      "agent-skills",
      "claudemd",
      "control-loop",
      "react",
      "html-artifacts"
    ],
    install: {
      method: "npx",
      command: "npx skills add humanlayer/skills --skill <skill-name>",
      repoUrl: "https://github.com/humanlayer/skills"
    },
    subTools: [
      {
        id: "improve-claude-md",
        name: "Improve Claude MD",
        description: "Rewrites CLAUDE.md files using <important if> conditional blocks to improve instruction adherence.",
        subpath: "plugins/improve-claude-md"
      },
      {
        id: "build-iterated-agentic-loop",
        name: "Build Iterated Agentic Loop",
        description: "Builds a repo-local skill and installs matching iterated coding-agent GitHub Actions workflows.",
        subpath: "plugins/build-iterated-agentic-loop"
      },
      {
        id: "design-control-loop",
        name: "Design Control Loop",
        description: "Interviews developers to design tailored agentic control loops and scheduled workflows.",
        subpath: "plugins/design-control-loop"
      },
      {
        id: "narrow-react-prop-types",
        name: "Narrow React Prop Types",
        description: "Narrows React component prop types to match real live code paths instead of mock states.",
        subpath: "plugins/narrow-react-prop-types"
      },
      {
        id: "show-me",
        name: "Show Me",
        description: "Generates concise visual explanations, pseudocode sketches, and interactive HTML artifacts.",
        subpath: "plugins/show-me"
      }
    ],
    useCase: "適用於在 Claude Code 與 AI Agent 開發環境中一鍵安裝並調用 HumanLayer 官方設計的高階外掛技能（包含 CLAUDE.md 最佳化、Agent 閉環工作流、控制理論迴路與視覺化展示）的場景。",
    advantages: [
      "官方精心調校的 Claude Code 外掛生態，原生支援 npx skills 一鍵安裝與自動更新",
      "涵蓋提示詞架構優化、反思迭代工作流與前端型別精簡等多維度工程實踐",
      "提供結構化感測器-控制器-致動器模型，輔助工程師建立高可靠性的 Agent 自動化系統"
    ],
    negativeConstraints: [
      "不適用於非 Claude Code 或不支援 skills.sh 外掛規範的純獨立封閉環境",
      "若僅需單純代碼補齊而不需要 Agent 流程控制與架構迭代則效益有限"
    ],
    status: "active",
    addedAt: now,
    stars: 612
  },

  // 2. 子工具 1: improve-claude-md
  {
    id: "improve-claude-md",
    name: "Improve Claude MD",
    url: "https://github.com/humanlayer/skills/tree/main/plugins/improve-claude-md",
    description: "Rewrites CLAUDE.md files using <important if> conditional constraint blocks to dramatically improve instruction adherence and eliminate context drift in Claude Code.",
    category: "AI 代理",
    language: "markdown",
    triggers: [
      "improve-claude-md",
      "claudemd",
      "claude-code",
      "prompt-engineering",
      "system-prompt-optimization",
      "instruction-adherence",
      "claudemd優化",
      "提示詞遵循",
      "claude指令調優"
    ],
    capabilities: [
      "claude-code",
      "prompt-engineering",
      "claudemd",
      "guidelines-optimizer"
    ],
    install: {
      method: "npx",
      command: "npx skills add humanlayer/skills --skill improve-claude-md",
      repoUrl: "https://github.com/humanlayer/skills",
      subpath: "plugins/improve-claude-md"
    },
    useCase: "適用於重構與優化專案 CLAUDE.md，透過 <important if> 條件區塊提高 Claude Code 對特定情境指令遵循度與上下文利用率的場景。",
    advantages: [
      "精確遵循 Claude Code 提示詞架構最佳實踐，大幅減少系統提示干擾與偏航",
      "採用 <important if> 條件約束機制，只在滿足特定觸發條件時強制執行相應規則",
      "支援指令清晰度與冗餘消除，提升模型響應速度與精確度"
    ],
    negativeConstraints: [
      "不適用於無自訂規範需求且無 CLAUDE.md 的極小型臨時專案",
      "避免在非 Claude Code 體系之專案中強行導入未支援的標籤語法"
    ],
    status: "active",
    addedAt: now,
    stars: 612
  },

  // 3. 子工具 2: build-iterated-agentic-loop
  {
    id: "build-iterated-agentic-loop",
    name: "Build Iterated Agentic Loop",
    url: "https://github.com/humanlayer/skills/tree/main/plugins/build-iterated-agentic-loop",
    description: "Builds a repo-local skill and installs a matching iterated coding-agent GitHub Actions workflow, prompt, memory file, and reference templates.",
    category: "AI 代理",
    language: "typescript",
    triggers: [
      "build-iterated-agentic-loop",
      "agentic-loop",
      "iterated-agent",
      "coding-agent-workflow",
      "github-actions-agent",
      "agent-ci-cd",
      "agent閉環",
      "迭代agent工作流"
    ],
    capabilities: [
      "agent-loop",
      "github-actions",
      "workflow-automation",
      "agent-memory",
      "claude-code"
    ],
    install: {
      method: "npx",
      command: "npx skills add humanlayer/skills --skill build-iterated-agentic-loop",
      repoUrl: "https://github.com/humanlayer/skills",
      subpath: "plugins/build-iterated-agentic-loop"
    },
    useCase: "適用於將重複性編碼任務轉化為本地可執行 Agent 閉環，並自動部署 GitHub Actions 排程與持續維護工作流的場景。",
    advantages: [
      "一鍵生成完整的 Agent 記憶體、模板與 GitHub Actions CI/CD 自動化工作流",
      "支援排程、手動或即時觸發等多種閉環模式，兼顧自動化與人機協同",
      "提供標準化的任務收斂與狀態維護機制，避免 Agent 無限迴圈"
    ],
    negativeConstraints: [
      "不適用於一次性、不可自動化的探勘性除錯任務",
      "避免在缺乏 CI/CD 環境的本地封閉系統中依賴遠端工作流"
    ],
    status: "active",
    addedAt: now,
    stars: 612
  },

  // 4. 子工具 3: design-control-loop
  {
    id: "design-control-loop",
    name: "Design Control Loop",
    url: "https://github.com/humanlayer/skills/tree/main/plugins/design-control-loop",
    description: "Interviews developers to design tailored agentic control loops (sensor, controller, actuator under disturbances) and builds runnable components plus scheduled workflows.",
    category: "AI 代理",
    language: "typescript",
    triggers: [
      "design-control-loop",
      "control-loop",
      "cybernetics-agent",
      "codebase-controller",
      "sensor-actuator",
      "feedback-loop",
      "控制迴路",
      "agent控制設計",
      "代碼反饋控制"
    ],
    capabilities: [
      "control-theory",
      "feedback-loop",
      "code-quality",
      "agentic-controller",
      "claude-code"
    ],
    install: {
      method: "npx",
      command: "npx skills add humanlayer/skills --skill design-control-loop",
      repoUrl: "https://github.com/humanlayer/skills",
      subpath: "plugins/design-control-loop"
    },
    useCase: "適用於需要針對程式庫長期維持特定架構約束或品質指標，設計閉環感測與修正控制器的場景。",
    advantages: [
      "引入控制理論中的感測器-控制器-致動器模型管理代碼庫質量與技術債",
      "支援漸進式、低風險的自動化代碼收斂，防止大刀闊斧重構導致系統崩潰",
      "內建反向訪談機制，自動梳理出最適合專案環境的控制迴路參數"
    ],
    negativeConstraints: [
      "不適用於無明確可量化收斂目標的模糊業務開發",
      "避免在架構極度不穩定的初期專案中過度設計控制迴路"
    ],
    status: "active",
    addedAt: now,
    stars: 612
  },

  // 5. 子工具 4: narrow-react-prop-types
  {
    id: "narrow-react-prop-types",
    name: "Narrow React Prop Types",
    url: "https://github.com/humanlayer/skills/tree/main/plugins/narrow-react-prop-types",
    description: "Narrows React component prop types to match real live code paths instead of Storybook, mock-only, or test-expanded states.",
    category: "UI/UX設計",
    language: "typescript",
    triggers: [
      "narrow-react-prop-types",
      "react-types",
      "prop-types-narrowing",
      "typescript-react",
      "component-refactoring",
      "clean-props",
      "react屬性縮窄",
      "props精簡",
      "前端型別重構"
    ],
    capabilities: [
      "react",
      "typescript",
      "component-design",
      "prop-types",
      "code-refactoring"
    ],
    install: {
      method: "npx",
      command: "npx skills add humanlayer/skills --skill narrow-react-prop-types",
      repoUrl: "https://github.com/humanlayer/skills",
      subpath: "plugins/narrow-react-prop-types"
    },
    useCase: "適用於大型 React 前端專案重構中，清理因 Storybook 或 Mock 測試而過度放寬的 Component Prop 類型，精確還原真實運行路徑契約的場景。",
    advantages: [
      "精確匹配代碼實際執行路徑，大幅提升前端型別安全性與 IDE 自動補齊精準度",
      "杜絕 Storybook/Mock 造成的虛胖與不可能狀態 (impossible states)",
      "自動化識別冗餘可選參數，提升前端組件的可維護性與重構信心"
    ],
    negativeConstraints: [
      "不適用於非 React 或無 TypeScript/PropTypes 型別系統之專案",
      "避免在需要動態開放多型傳參的通用無障礙容器組件中強制縮窄"
    ],
    status: "active",
    addedAt: now,
    stars: 612
  },

  // 6. 子工具 5: show-me
  {
    id: "show-me",
    name: "Show Me",
    url: "https://github.com/humanlayer/skills/tree/main/plugins/show-me",
    description: "Generates concise visual explanations, pseudocode logic flows, architecture sketches, and standalone interactive HTML artifacts to minimize cognitive load.",
    category: "文件生產力",
    language: "markdown",
    triggers: [
      "show-me",
      "visual-explanation",
      "architecture-diagrams",
      "pseudocode-sketch",
      "html-artifacts",
      "concept-visualization",
      "可視化解說",
      "架構草圖",
      "html展示生成"
    ],
    capabilities: [
      "visualization",
      "html-artifacts",
      "diagramming",
      "pseudocode",
      "cognitive-simplification"
    ],
    install: {
      method: "npx",
      command: "npx skills add humanlayer/skills --skill show-me",
      repoUrl: "https://github.com/humanlayer/skills",
      subpath: "plugins/show-me"
    },
    useCase: "適用於 AI 助理需要以最小認知負擔向使用者視覺化展示算法邏輯、架構草圖或可互動 HTML 頁面的場景。",
    advantages: [
      "跳過冗長套話，直接生成極簡視覺化骨架、虛擬碼與架構圖表",
      "支援即時生成可獨立預覽的 HTML 互動展示成果，便於跨端分享與檢驗",
      "專注於概念傳遞的最簡形式，極大化人機溝通效率"
    ],
    negativeConstraints: [
      "不適用於需要純文字終端簡短輸出的批次腳本任務",
      "避免在僅需單純代碼補齊的行內編輯場景中過度生成視覺內容"
    ],
    status: "active",
    addedAt: now,
    stars: 612
  },

  // 7. Free Claude Code (權威版本：alishahryar1/free-claude-code，全盤檢討分類為「開發工具」，取代舊版/分支)
  {
    id: "free-claude-code",
    name: "Free Claude Code",
    url: "https://github.com/alishahryar1/free-claude-code",
    description: "Local high-performance proxy connecting coding agents (Claude Code, Codex, Pi, OpenCode, OpenClaw) to OpenAI-compatible AI providers with 1.3B+ free tokens and voice support.",
    category: "開發工具",
    language: "python",
    triggers: [
      "free-claude-code",
      "claude-code-proxy",
      "free-claude",
      "anthropic-proxy",
      "openai-compatible-proxy",
      "nvidia-nim-proxy",
      "coding-agent-proxy",
      "fcc-server",
      "免費claude",
      "免費claude-code",
      "免金鑰claude",
      "免api-key",
      "claude代理"
    ],
    capabilities: [
      "claude-code",
      "codex",
      "opencode",
      "openclaw",
      "openai-compatible",
      "nvidia-nim",
      "local-proxy",
      "voice-support",
      "admin-ui"
    ],
    install: {
      method: "curl",
      command: "curl -fsSL https://raw.githubusercontent.com/Alishahryar1/free-claude-code/main/scripts/install.sh | sh",
      repoUrl: "https://github.com/alishahryar1/free-claude-code"
    },
    useCase: "適用於希望在終端機、IDE (VSCode) 或手機端免 Anthropic 官方付費 API Key 免費調用 Claude Code, Codex, OpenCode 等編程 Agent，透過本地 Proxy 橋接至 NVIDIA NIM 或其他 OpenAI 相容免費模型的場景。",
    advantages: [
      "超過 5.1 萬星社群驗證與成熟架構 (v5.17.2)，全面涵蓋並超越早期 NVIDIA NIM 單一代理分支",
      "原生支援 1.3B+ 免費 token，提供直觀 Web Admin 管理面板與系統托盤圖示",
      "全面橋接 Claude Code, Codex, Pi, OpenCode, OpenClaw 等多種主流 Agent，具備語音輸入與 HTTP 413 容錯機制"
    ],
    negativeConstraints: [
      "不適用於需要官方 Claude 3.7 Sonnet 獨家私有端點且嚴格依賴 Anthropic 官方商業 SLA 之企業生產環境",
      "本地需常駐代理伺服器 (fcc-server) 並佔用特定本地埠號"
    ],
    status: "active",
    addedAt: now,
    stars: 51497
  }
];

function applyUpdates() {
  const registry = JSON.parse(readFileSync(REGISTRY_PATH, 'utf-8'));
  let addedCount = 0;
  let updatedCount = 0;

  for (const entry of newEntries) {
    const existingIndex = registry.tools.findIndex(t => t.id === entry.id || t.url === entry.url);
    if (existingIndex >= 0) {
      registry.tools[existingIndex] = entry;
      console.log(`[Update] ${entry.name} (${entry.id})`);
      updatedCount++;
    } else {
      registry.tools.push(entry);
      console.log(`[Add] ${entry.name} (${entry.id})`);
      addedCount++;
    }
  }

  registry.lastUpdated = now.split('T')[0];
  writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2) + '\n', 'utf-8');
  console.log(`\nRegistry updated: ${addedCount} added, ${updatedCount} updated. Total: ${registry.tools.length}`);

  // 更新 tracked-repos.json
  const tracked = JSON.parse(readFileSync(TRACKED_PATH, 'utf-8'));
  const trackedList = Array.isArray(tracked) ? tracked : (tracked.repos || []);
  const newRepos = [
    'humanlayer/skills',
    'alishahryar1/free-claude-code'
  ];
  let trackedAdded = 0;
  for (const repo of newRepos) {
    if (!trackedList.includes(repo)) {
      trackedList.push(repo);
      trackedAdded++;
    }
  }
  if (Array.isArray(tracked)) {
    writeFileSync(TRACKED_PATH, JSON.stringify(trackedList, null, 2) + '\n', 'utf-8');
  } else {
    tracked.repos = trackedList;
    writeFileSync(TRACKED_PATH, JSON.stringify(tracked, null, 2) + '\n', 'utf-8');
  }
  console.log(`Tracked repos updated: +${trackedAdded}`);

  // 更新 star-snapshots.json
  const snapshots = JSON.parse(readFileSync(SNAPSHOTS_PATH, 'utf-8'));
  snapshots['humanlayer/skills'] = 612;
  snapshots['alishahryar1/free-claude-code'] = 51497;
  writeFileSync(SNAPSHOTS_PATH, JSON.stringify(snapshots, null, 2) + '\n', 'utf-8');
  console.log('Star snapshots updated.');
}

applyUpdates();
