import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const REGISTRY_PATH = join(ROOT, 'registry', 'tools.json');
const TRACKED_PATH = join(ROOT, 'registry', 'tracked-repos.json');
const SNAPSHOTS_PATH = join(ROOT, 'registry', 'star-snapshots.json');

const now = new Date().toISOString();

// ─── 新增工具清單 ───────────────────────────────────────────────────────────
// 分類邏輯全盤檢討：
//   • OpenViking       → 知識管理（context database for AI agents）
//   • HKUDS/nanobot    → AI 代理（成品個人 AI agent framework）
//   • obot/nanobot     → AI 框架（MCP 建構框架，非成品 agent）
//   • abi/screenshot→  → UI/UX設計（UI 原型→code 轉換）
//   • emilwallner/     → 多媒體生成（純 neural network 舊版，技術研究）
//   • plasticityai/    → AI 框架（向量嵌入工具庫，舊版 Python 包）
//   • gods-eye-view    → 3D工程繪圖（3D globe + 空間視覺化）
//   • luyao618/study   → 學習資源（Claude Code 源碼深度教程）
//   • carlvellotti/course → 學習資源（免費 Claude Code 課程）
// ────────────────────────────────────────────────────────────────────────────

const newEntries = [
  // 1. OpenViking — 知識管理（Agent Context Database）
  {
    id: "openviking",
    name: "OpenViking",
    url: "https://github.com/volcengine/OpenViking",
    description: "Self-evolving Context Database for AI Agents. Unifies agent memory, knowledge RAG and skills under a single virtual filesystem via the viking:// protocol, so agents browse their own context with ls, tree, and find.",
    category: "知識管理",
    language: "python",
    triggers: [
      "openviking",
      "context-database",
      "agent-memory",
      "viking-protocol",
      "agent-knowledge-base",
      "rag-storage",
      "agent-memory",
      "agent-knowledge"
    ],
    capabilities: [
      "context-database",
      "agent-memory",
      "knowledge-rag",
      "viking-protocol",
      "skill-storage"
    ],
    install: {
      method: "pip",
      command: "pip install openviking",
      repoUrl: "https://github.com/volcengine/OpenViking"
    },
    useCase: "當 AI Agent 需要統一管理記憶、知識檢索與技能資源，並透過 viking:// 虛擬檔案系統讓 Agent 以 ls/tree/find 方式瀏覽自身上下文時使用。",
    advantages: [
      "將記憶、RAG 知識庫與技能整合為單一虛擬檔案系統，消除分散式儲存複雜性",
      "支援自我進化（self-evolving），Agent 可持續優化自身上下文",
      "火山引擎企業級開源，有穩定維護與持續迭代"
    ],
    negativeConstraints: [
      "需要 Python 運行環境與 viking:// 協議支援",
      "不適用於非 Agent 場景的傳統知識庫管理",
      "自架維護需要一定基礎設施成本"
    ],
    status: "active",
    addedAt: now,
    stars: 34857
  },

  // 2. HKUDS/nanobot — AI 代理（成品個人 AI agent）
  {
    id: "hkuds-nanobot",
    name: "nanobot (HKUDS)",
    url: "https://github.com/HKUDS/nanobot",
    description: "Ultra-lightweight, open-source, self-hosted personal AI agent framework in Python with WebUI, tools, memory, MCP, multi-agent workflows, automation, and chat apps.",
    category: "AI 代理",
    language: "python",
    triggers: [
      "hkuds-nanobot",
      "nanobot",
      "personal-ai-agent",
      "self-hosted-agent",
      "agent-framework",
      "multi-agent-workflow",
      "agent-webui",
      "agentic"
    ],
    capabilities: [
      "personal-ai-agent",
      "webui",
      "mcp",
      "multi-agent",
      "automation",
      "memory",
      "tools"
    ],
    install: {
      method: "pip",
      command: "pip install nanobot",
      repoUrl: "https://github.com/HKUDS/nanobot"
    },
    useCase: "適用於需要在本地自建輕量級個人 AI Agent，整合 WebUI、MCP 工具、記憶系統與多 Agent 協作工作流的場景。",
    advantages: [
      "超輕量架構，Python 原生實現，部署簡單",
      "內建 WebUI、記憶系統與 MCP 支援，开箱即用",
      "支援多 Agent 協作與自動化工作流，適合進階自訂"
    ],
    negativeConstraints: [
      "需自行架設維護，不適合雲端託管需求",
      "Python 技術棧限制跨語言整合場景",
      "WebUI 功能仍需持續完善"
    ],
    status: "active",
    addedAt: now,
    stars: 47538
  },

  // 3. obot-platform/nanobot — AI 框架（MCP 建構框架）
  {
    id: "obot-nanobot",
    name: "Nanobot (obot)",
    url: "https://github.com/obot-platform/nanobot",
    description: "Build MCP Agents — an open-source Go-based MCP host that enables building agents with MCP and MCP-UI, deployable standalone unlike built-in MCP hosts in VSCode, Claude, or ChatGPT.",
    category: "AI 框架",
    language: "go",
    triggers: [
      "obot-nanobot",
      "build-mcp-agents",
      "mcp-host",
      "mcp-framework",
      "mcp-server",
      "model-context-protocol",
      "mcp-agent"
    ],
    capabilities: [
      "mcp-host",
      "mcp-agent",
      "mcp-ui",
      "go-based",
      "standalone-deploy"
    ],
    install: {
      method: "git-clone",
      command: "git clone https://github.com/obot-platform/nanobot.git",
      repoUrl: "https://github.com/obot-platform/nanobot"
    },
    useCase: "適用於需要獨立部署 MCP 宿主環境、以 Go 語言構建可擴展 MCP Agent 的場景，適合非 VSCode/Claude 封閉生態的自訂需求。",
    advantages: [
      "Go 語言實現，效能優異，適合高併發 MCP 服務",
      "獨立部署能力，不依賴 VSCode/Claude/ChatGPT 等封閉環境",
      "支援 MCP-UI 互動介面，降低 Agent 開發門檻"
    ],
    negativeConstraints: [
      "Go 語言生態相對 Python 較小，社群資源較少",
      "初期項目規模較小，功能穩定性需時間驗證",
      "不適合需要 Python AI 模型直接整合的場景"
    ],
    status: "active",
    addedAt: now,
    stars: 1335
  },

  // 4. abi/screenshot-to-code — UI/UX設計（主流版，76k stars）
  {
    id: "screenshot-to-code",
    name: "Screenshot to Code",
    url: "https://github.com/abi/screenshot-to-code",
    description: "Drop in a screenshot and convert it to clean code (HTML/Tailwind/React/Vue). Uses GPT-4 Vision and DALL-E 3 to transform designs into functional frontend code.",
    category: "UI/UX設計",
    language: "typescript",
    triggers: [
      "screenshot-to-code",
      "screenshot",
      "figma-to-code",
      "design-to-code",
      "ui-to-code",
      "html-generator",
      "tailwind",
      "react",
      "vue",
      "截圖轉碼"
    ],
    capabilities: [
      "screenshot-to-code",
      "figma-to-code",
      "design-to-code",
      "html-generation",
      "tailwind",
      "react",
      "vue"
    ],
    install: {
      method: "npm",
      command: "npx screenshot-to-code",
      repoUrl: "https://github.com/abi/screenshot-to-code"
    },
    useCase: "適用於將 UI 設計稿、Figma 原型或瀏覽器截圖一鍵轉換為 HTML/Tailwind/React/Vue 程式碼，加速前端開發流程。",
    advantages: [
      "76k+ stars 社群驗證，最主流的截圖轉代碼工具",
      "支援 GPT-4 Vision 與 DALL-E 3，轉換品質高",
      "輸出乾淨的 HTML/Tailwind/React/Vue 代碼，可直接使用"
    ],
    negativeConstraints: [
      "需要 OpenAI API Key，非完全離線可用",
      "免費版有使用限制，重度使用者需付費",
      "不適合需要複雜互動邏輯的動態應用程式"
    ],
    status: "active",
    addedAt: now,
    stars: 76086
  },

  // 5. emilwallner/Screenshot-to-code — 多媒體生成（早期 neural network 版本，技術研究）
  {
    id: "emilwallner-screenshot-to-code",
    name: "Screenshot to Code (Neural)",
    url: "https://github.com/emilwallner/Screenshot-to-code",
    description: "A neural network that transforms a design mock-up into a static website using CNN, LSTM, and seq2seq architecture. Early research project (2018) — superseded by ABI version with GPT-4.",
    category: "多媒體生成",
    language: "python",
    triggers: [
      "emilwallner-screenshot-to-code",
      "screenshot-neural",
      "cnn-keras",
      "seq2seq",
      "deep-learning",
      "design-to-website",
      "neural-network"
    ],
    capabilities: [
      "neural-screenshot-to-code",
      "cnn-keras",
      "seq2seq",
      "deep-learning-research"
    ],
    install: {
      method: "git-clone",
      command: "git clone https://github.com/emilwallner/Screenshot-to-code.git",
      repoUrl: "https://github.com/emilwallner/Screenshot-to-code"
    },
    useCase: "適用於研究早期神經網路截圖轉碼技術、CNN-LSTM seq2seq 架構的學習與參考，適合 AI 視覺研究與技術演進理解。",
    advantages: [
      "16.5k stars 研究級項目，歷史影響力大",
      "完整實現 CNN+LSTM+seq2seq 端到端神經網路架構",
      "適合學習早期 AI 視覺轉碼技術原理"
    ],
    negativeConstraints: [
      "2018 年舊版，技術已過時，不建議用於生產環境",
      "需 Keras/TensorFlow 環境，依賴沉重",
      "僅支援靜態網站，無動態功能生成"
    ],
    status: "active",
    addedAt: now,
    stars: 16505
  },

  // 6. plasticityai/magnitude — AI 框架（向量嵌入工具庫）
  {
    id: "plasticityai-magnitude",
    name: "Magnitude",
    url: "https://github.com/plasticityai/magnitude",
    description: "A fast, efficient universal vector embedding utility package. The Magnitude file format for vector embeddings enables efficient consumption of large vector space models, serving as a simpler/faster alternative to Gensim.",
    category: "AI 框架",
    language: "python",
    triggers: [
      "plasticityai-magnitude",
      "magnitude-embeddings",
      "vector-embedding",
      "fasttext",
      "gensim-alternative",
      "nlp-embeddings",
      "word-embeddings",
      "similarity-search"
    ],
    capabilities: [
      "vector-embeddings",
      "fast-text",
      "word2vec",
      "similarity-search",
      "nlp-utility"
    ],
    install: {
      method: "pip",
      command: "pip install magnitude",
      repoUrl: "https://github.com/plasticityai/magnitude"
    },
    useCase: "適用於需要高效向量嵌入處理的 NLP 項目，作為 Gensim 的輕量快速替代方案，支援 FastText、Word2Vec 等 embedding 模型。",
    advantages: [
      "比 Gensim 更快更輕量，記憶體效率優異",
      "支援多種 embedding 格式，相容性強",
      "MIT 開源協議，商業友好"
    ],
    negativeConstraints: [
      "項目維護較慢，新功能更新有限",
      "主要用於靜態 embedding 研究，非現代 LLM 嵌入",
      "不適合需要最新 Transformer 嵌入模型的場景"
    ],
    status: "active",
    addedAt: now,
    stars: 1665
  },

  // 7. gods-eye-view — 3D工程繪圖（3D 地球儀 + 空間視覺化）
  {
    id: "gods-eye-view",
    name: "God's Eye View",
    url: "https://github.com/bilawalsidhu/gods-eye-view",
    description: "A spy satellite simulator in your browser, except the data is real. Live open source spatial intelligence on a photorealistic 3D globe tracking aircraft, ships, satellites, earthquakes, and public cameras.",
    category: "3D工程繪圖",
    language: "javascript",
    triggers: [
      "gods-eye-view",
      "spy-satellite",
      "3d-globe",
      "spatial-intelligence",
      "live-tracking",
      "gis-visualization",
      "earthquake-tracking",
      "ship-tracking"
    ],
    capabilities: [
      "3d-globe",
      "spatial-visualization",
      "live-tracking",
      "earthquake-monitoring",
      "ship-tracking",
      "aircraft-tracking",
      "satellite-tracking"
    ],
    install: {
      method: "git-clone",
      command: "git clone https://github.com/bilawalsidhu/gods-eye-view.git",
      repoUrl: "https://github.com/bilawalsidhu/gods-eye-view"
    },
    useCase: "適用於需要 3D 地球儀視覺化、即時追蹤飛機/船舶/地震/衛星等空間數據的場景，適合 GIS 應用與空間情報展示。",
    advantages: [
      "12k+ stars 熱門項目，社群活躍",
      "真實數據驅動，非模擬資料",
      "瀏覽器內運行，無需安裝，跨平台友好"
    ],
    negativeConstraints: [
      "主要為視覺化展示，非專業 GIS 分析工具",
      "數據來源依賴公開信號，精度有限",
      "不適合需要商業級 GIS 功能的企業場景"
    ],
    status: "active",
    addedAt: now,
    stars: 12928
  },

  // 8. luyao618/Claude-Code-Source-Study — 學習資源（源碼深度教程）
  {
    id: "claude-code-source-study",
    name: "Claude Code 源碼研究",
    url: "https://github.com/luyao618/Claude-Code-Source-Study",
    description: "Deep dive into Claude Code's source code — learn from the best agent implementation. 25 篇深度文章拆解約 1900 個源碼文件，涵蓋 System Prompt 工程、多 Agent 編排、工具系統、權限安全、終端 UI。",
    category: "學習資源",
    language: "markdown",
    triggers: [
      "claude-code-source-study",
      "claude-code-source",
      "claude-source-code",
      "agent-architecture",
      "prompt-engineering",
      "claude-study",
      "學習 Claude"
    ],
    capabilities: [
      "source-code-analysis",
      "agent-architecture",
      "prompt-engineering",
      "multi-agent",
      "security-review",
      "terminal-ui"
    ],
    install: {
      method: "none",
      command: "https://github.com/luyao618/Claude-Code-Source-Study",
      repoUrl: "https://github.com/luyao618/Claude-Code-Source-Study"
    },
    useCase: "適用於想要深入理解 Claude Code 源碼架構、學習生產級 AI Agent 設計模式的開發者，特別適合想從源碼角度理解 Agent 實現的研究者。",
    advantages: [
      "25 篇結構化教程，由淺入深",
      "中文撰寫，技術術語保留英文原文",
      "覆蓋 System Prompt、多 Agent、工具系統、安全等核心主題"
    ],
    negativeConstraints: [
      "為學習資源而非可執行工具，無安裝指令",
      "內容基於特定版本 Claude Code，可能隨更新過時",
      "需搭配實際 Claude Code 源碼閱讀體驗"
    ],
    status: "active",
    addedAt: now,
    stars: 1544
  },

  // 9. carlvellotti/claude-code-everyone-course — 學習資源（免費課程）
  {
    id: "claude-code-everyone-course",
    name: "Claude Code for Everyone",
    url: "https://github.com/carlvellotti/claude-code-everyone-course",
    description: "The only course taught INSIDE Claude Code. Free Claude Code tutorial with no coding experience required — learn AI by actually doing it, module by module, interactive lessons.",
    category: "學習資源",
    language: "typescript",
    triggers: [
      "claude-code-everyone-course",
      "claude-code-course",
      "learn-claude-code",
      "claude-tutorial",
      "cc-for-everyone",
      "免費課程",
      "claude 入門"
    ],
    capabilities: [
      "course-materials",
      "interactive-lessons",
      "claude-tutorial",
      "ai-learning"
    ],
    install: {
      method: "git-clone",
      command: "git clone https://github.com/carlvellotti/claude-code-everyone-course.git",
      repoUrl: "https://github.com/carlvellotti/claude-code-everyone-course"
    },
    useCase: "適用於零基礎學習者想要系統性掌握 Claude Code 使用技巧，透過在 Claude Code 內部教學的互動式課程快速上手。",
    advantages: [
      "完全免費，100+ 課時系統性課程",
      "在 Claude Code 內部教學，邊學邊練",
      "無需編碼經驗，適合各背景學習者"
    ],
    negativeConstraints: [
      "課程內容更新較慢，可能落後最新功能",
      "需要本地安裝 Claude Code 才能完整體驗",
      "部分進階模組可能需要付費功能支援"
    ],
    status: "active",
    addedAt: now,
    stars: 561
  }
];

// ─── 更新函數 ───────────────────────────────────────────────────────────────
function applyUpdates() {
  const registry = JSON.parse(readFileSync(REGISTRY_PATH, 'utf-8'));
  let addedCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;
  const skipped = [];

  for (const entry of newEntries) {
    const existingIndex = registry.tools.findIndex(
      t => t.id === entry.id || t.url === entry.url
    );
    if (existingIndex >= 0) {
      // 檢查是否需要更新
      const existing = registry.tools[existingIndex];
      const needsUpdate = 
        existing.stars !== entry.stars || 
        existing.category !== entry.category ||
        existing.name !== entry.name;
      
      if (needsUpdate) {
        registry.tools[existingIndex] = { ...existing, ...entry };
        console.log(`[Update] ${entry.name} (${entry.id}) → ${entry.category}`);
        updatedCount++;
      } else {
        console.log(`[Skip] ${entry.name} (${entry.id}) — 已是最新`);
        skippedCount++;
        skipped.push(entry.id);
      }
    } else {
      registry.tools.push(entry);
      console.log(`[Add] ${entry.name} (${entry.id}) → ${entry.category}`);
      addedCount++;
    }
  }

  registry.lastUpdated = now.split('T')[0];
  writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2) + '\n', 'utf-8');
  console.log(`\n✅ Registry updated: +${addedCount} added, ${updatedCount} updated, ${skippedCount} skipped.`);
  console.log(`   Total tools: ${registry.tools.length}`);

  if (skipped.length > 0) {
    console.log(`   Skipped IDs: ${skipped.join(', ')}`);
  }

  // 更新 tracked-repos.json
  const tracked = JSON.parse(readFileSync(TRACKED_PATH, 'utf-8'));
  const trackedList = Array.isArray(tracked) ? tracked : (tracked.repos || []);
  const newRepos = [
    'volcengine/OpenViking',
    'HKUDS/nanobot',
    'obot-platform/nanobot',
    'abi/screenshot-to-code',
    'emilwallner/Screenshot-to-code',
    'plasticityai/magnitude',
    'bilawalsidhu/gods-eye-view',
    'luyao618/Claude-Code-Source-Study',
    'carlvellotti/claude-code-everyone-course'
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
  console.log(`✅ Tracked repos updated: +${trackedAdded}`);

  // 更新 star-snapshots.json
  const snapshots = JSON.parse(readFileSync(SNAPSHOTS_PATH, 'utf-8'));
  snapshots['volcengine/OpenViking'] = 34857;
  snapshots['HKUDS/nanobot'] = 47538;
  snapshots['obot-platform/nanobot'] = 1335;
  snapshots['abi/screenshot-to-code'] = 76086;
  snapshots['emilwallner/Screenshot-to-code'] = 16505;
  snapshots['plasticityai/magnitude'] = 1665;
  snapshots['bilawalsidhu/gods-eye-view'] = 12928;
  snapshots['luyao618/Claude-Code-Source-Study'] = 1544;
  snapshots['carlvellotti/claude-code-everyone-course'] = 561;
  writeFileSync(SNAPSHOTS_PATH, JSON.stringify(snapshots, null, 2) + '\n', 'utf-8');
  console.log('✅ Star snapshots updated.');
}

applyUpdates();
