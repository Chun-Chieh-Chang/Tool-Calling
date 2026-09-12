/**
 * Batch ingest — 2026-09-12
 *
 * 來源：使用者提供 23 個 GitHub URL（其中 chatanywhere/GPT_API_free 重複 1 次，實際 22 個唯一）
 *
 * 處理策略：
 *   1. 以 GitHub API 取得權威 metadata（stars / description / topics / language）
 *   2. 以 url-resolver 判斷是否需要拆解（split）
 *   3. 既有工具 → 重新解析後比較，較優者取代舊資料
 *   4. 全新工具 → 依分類決策樹寫入
 *   5. 同步 tracked-repos.json 與 star-snapshots.json（當週 W37）
 *
 * 分類決策樹（見 docs/CLASSIFICATION.md）：
 *   學術研究/論文/文獻                     → 研究
 *   教程/課程/書籍/Awesome 清單（閱讀價值） → 學習資源
 *   可調用 API 端點目錄/網關/聚合器         → API 整合
 *   成品 Agent/agent harness/skill 集合     → AI 代理
 *   LLM SDK/模型本體/推理訓練框架/本地運行時 → AI 框架
 *   開發流程輔助（CLI/IDE/code review/proxy）→ 開發工具
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getCurrentWorldWeek } from '../core/world-week.js';

const ROOT = join(import.meta.dirname, '..');
const REGISTRY_PATH = join(ROOT, 'registry', 'tools.json');
const TRACKED_PATH = join(ROOT, 'registry', 'tracked-repos.json');
const SNAPSHOTS_PATH = join(ROOT, 'registry', 'star-snapshots.json');
const META_PATH = join(ROOT, 'registry', '_tmp-metadata.json');

const now = new Date().toISOString();

// ─── 語言正規化對照表（全庫套用）────────────────────────────────────────────
const LANG_ALIASES = {
  'python': 'python', 'Python': 'python',
  'typescript': 'typescript', 'TypeScript': 'typescript',
  'javascript': 'javascript', 'JavaScript': 'javascript',
  'c++': 'c++', 'C++': 'c++', 'cpp': 'c++',
  'c#': 'c#', 'C#': 'c#', 'csharp': 'c#',
  'go': 'go', 'Go': 'go',
  'markdown': 'markdown', 'Markdown': 'markdown',
  'jupyter notebook': 'jupyter notebook', 'Jupyter Notebook': 'jupyter notebook',
  'unknown': 'other', 'Unknown': 'other', '': 'other',
  'html': 'html', 'HTML': 'html',
  'vue': 'vue', 'Vue': 'vue',
  'shell': 'shell', 'Shell': 'shell',
  'php': 'php', 'PHP': 'php',
  'rust': 'rust', 'Rust': 'rust',
  'java': 'java', 'Java': 'java',
  'kotlin': 'kotlin', 'Kotlin': 'kotlin',
  'swift': 'swift', 'Swift': 'swift',
  'clojure': 'clojure', 'Clojure': 'clojure',
  'less': 'less', 'Less': 'less',
  'mdx': 'mdx', 'MDX': 'mdx',
  'powershell': 'powershell', 'PowerShell': 'powershell',
  'css': 'css', 'CSS': 'css',
  'c': 'c', 'C': 'c',
};

function normalizeLanguage(lang) {
  if (!lang) return 'other';
  const key = String(lang).trim();
  if (LANG_ALIASES[key]) return LANG_ALIASES[key];
  const lower = key.toLowerCase();
  return LANG_ALIASES[lower] || lower;
}

// ─── 新工具（13 個）────────────────────────────────────────────────────────
const newEntries = [
  {
    id: 'weread-hot-booklists',
    name: 'WeRead Hot Booklists (微信讀書熱門書單)',
    url: 'https://github.com/able8/weread-hot-booklists',
    description: 'Curated archive of WeRead (微信讀書) most-collected booklists and reader highlights, organised into ready-to-read Markdown notes with per-book like counts.',
    category: '學習資源',
    language: 'go',
    triggers: ['weread-hot-booklists', '微信读书', '热门书单', '读书笔记', 'weread', 'booklist', 'reading-notes', '書單', '閱讀筆記', '热门收藏'],
    capabilities: ['booklist-aggregation', 'reading-notes', 'markdown-export', 'wechat-reading'],
    install: {
      method: 'git-clone',
      command: 'git clone https://github.com/able8/weread-hot-booklists.git',
      repoUrl: 'https://github.com/able8/weread-hot-booklists'
    },
    useCase: '當需要中文優質書單、微信讀書熱門收藏與讀者劃線筆記作為選書或閱讀素材時使用。',
    advantages: [
      '書單以 Markdown 整理，每本書附熱度數據與讀者金句，可直接離線閱讀',
      '涵蓋大學生必讀、商業、心理等多個主題榜單，選書成本低',
      '以 Go 工具定期更新，榜單具時效性'
    ],
    negativeConstraints: [
      '僅為書單與筆記索引，不提供電子書全文下載',
      '內容以簡體中文書籍為主，非中文書籍覆蓋有限',
      '榜單反映微信讀書平台熱度，不代表專業書評意見'
    ],
    status: 'active',
    addedAt: now,
    stars: 762
  },
  {
    id: 'm3e-canvas',
    name: 'M3E Canvas',
    url: 'https://github.com/lnkiai/m3e-canvas',
    description: 'Browser-based sketching canvas for Material 3 Expressive screens — link screens, tap through a prototype, and export a structured prompt for your AI coding tool.',
    category: 'UI/UX設計',
    language: 'typescript',
    triggers: ['m3e-canvas', 'material-3', 'material-design', 'material3-expressive', 'ui-sketch', 'design-to-prompt', 'vibe-coding', '原型設計', '設計稿', '介面草圖'],
    capabilities: ['ui-sketching', 'material3-expressive', 'prototype-linking', 'prompt-generation', 'design-to-code'],
    install: {
      method: 'git-clone',
      command: 'git clone https://github.com/lnkiai/m3e-canvas.git',
      repoUrl: 'https://github.com/lnkiai/m3e-canvas'
    },
    useCase: '當需要快速繪製 Material 3 Expressive 介面草圖、串接多頁可點擊原型，並一鍵導出給 AI 編碼工具的結構化提示詞時使用。',
    advantages: [
      '瀏覽器內即開即用，另有官方線上 Demo，無需本地安裝',
      '內建 Material 3 Expressive 設計規範元件，草圖即符合規範',
      '可將原型直接轉為 AI 編碼提示詞，縮短設計到實作的落差'
    ],
    negativeConstraints: [
      '定位為草圖與原型工具，非高保真設計稿或設計交付工具',
      '僅支援 Material 3 設計語言，不適合其他設計系統',
      '不含多人協作與版本控管能力'
    ],
    status: 'active',
    addedAt: now,
    stars: 6184
  },
  {
    id: 'web-llm',
    name: 'WebLLM',
    url: 'https://github.com/mlc-ai/web-llm',
    description: 'High-performance in-browser LLM inference engine. Runs quantised models fully client-side on WebGPU with OpenAI-compatible streaming APIs and Web Worker support — no server required.',
    category: 'AI 框架',
    language: 'typescript',
    triggers: ['web-llm', 'webllm', 'in-browser-llm', 'webgpu', 'browser-inference', 'client-side-llm', 'tvm', 'local-llm', '瀏覽器推理', '本地模型', '邊緣推理'],
    capabilities: ['in-browser-inference', 'webgpu', 'openai-compatible-api', 'streaming', 'web-worker', 'quantization'],
    install: {
      method: 'npm',
      command: 'npm install @mlc-ai/web-llm',
      repoUrl: 'https://github.com/mlc-ai/web-llm'
    },
    useCase: '當需要在瀏覽器端以 WebGPU 完全離線運行 LLM（無需伺服器、推論資料不出本機）時使用，特別適合隱私敏感的邊緣推理與前端 AI 應用。',
    advantages: [
      'MLC-LLM / TVM 團隊維護，推論效能與量化支援業界領先',
      '完全客戶端執行，零伺服器成本且資料不外流',
      '提供 OpenAI 相容串流 API，既有程式碼幾乎無痛遷移'
    ],
    negativeConstraints: [
      '需使用者瀏覽器支援 WebGPU，舊版瀏覽器與部分行動裝置不支援',
      '受限於瀏覽器記憶體與算力，僅適合中小型量化模型',
      '首次載入需下載模型權重，冷啟動較慢'
    ],
    status: 'active',
    addedAt: now,
    stars: 19094
  },
  {
    id: 'free-api',
    name: 'Free API 中文免費接口大全',
    url: 'https://github.com/fangzesheng/free-api',
    description: 'Continuously updated Chinese-language directory of free public APIs — weather, typhoon tracks, string encryption, translation and more — with monthly changelog and online-callable endpoints.',
    category: 'API 整合',
    language: 'markdown',
    triggers: ['free-api', '免费api', '免费接口', '中文api', 'api大全', 'api-directory', '免費接口', '接口服务', '免费接口服务'],
    capabilities: ['api-directory', 'free-endpoints', 'chinese-apis', 'monthly-updates'],
    install: {
      method: 'none',
      command: 'No installation required — browse the README directory and call the listed endpoints directly.',
      repoUrl: 'https://github.com/fangzesheng/free-api'
    },
    useCase: '當需要尋找可免費調用的中文第三方 API（如颱風路徑、字串加密、翻譯等）並查看每月更新清單時使用。',
    advantages: [
      '中文語境整理，介面說明與範例對中文開發者友善',
      '每月定時更新並附變更紀錄，維護活躍度高',
      '部分介面提供線上直接調用，無需註冊即可試用'
    ],
    negativeConstraints: [
      '部分介面來自第三方，需自行至對方平台註冊取得金鑰',
      '第三方介面的穩定性與可用性無任何保證',
      '不適合需要 SLA 與商業授權的生產環境'
    ],
    status: 'active',
    addedAt: now,
    stars: 16245
  },
  {
    id: 'public-api-lists',
    name: 'Public API Lists',
    url: 'https://github.com/public-api-lists/public-api-lists',
    description: 'Curated, community-maintained list of free public APIs — searchable and beginner-friendly, and itself exposed through a free JSON API for programmatic lookup.',
    category: 'API 整合',
    language: 'markdown',
    triggers: ['public-api-lists', 'free-public-apis', 'api-list', 'awesome-apis', 'public-api', 'json-api', '免費api', 'api清單', '公開api'],
    capabilities: ['api-directory', 'json-api', 'searchable-catalog', 'community-maintained'],
    install: {
      method: 'none',
      command: 'No installation required — browse the list or query the free JSON API endpoint.',
      repoUrl: 'https://github.com/public-api-lists/public-api-lists'
    },
    useCase: '當需要以程式化方式（免費 JSON API）或人工瀏覽檢索公開免費 API 清單，為原型或系統整合挑選端點時使用。',
    advantages: [
      '本身即提供免費 JSON API，可用程式自動檢索而非人工翻閱',
      '標示新手友善（beginner-friendly）與認證需求，降低挑選門檻',
      '社群持續維護，條目經人工審核'
    ],
    negativeConstraints: [
      '僅為清單索引，不代管也不保證任何第三方端點可用性',
      '與 public-apis 條目高度重疊，需擇一使用避免重複研究',
      '不含付費或企業內部 API'
    ],
    status: 'active',
    addedAt: now,
    stars: 15791
  },
  {
    id: 'pr-agent',
    name: 'PR-Agent',
    url: 'https://github.com/The-PR-Agent/pr-agent',
    description: 'Open-source AI-powered pull-request reviewer. Generates PR descriptions, inline code suggestions, security and effort reviews, and answers questions about a diff — runs as a GitHub/GitLab/Bitbucket app, CLI or webhook with any LLM provider.',
    category: '開發工具',
    language: 'python',
    triggers: ['pr-agent', 'pr-reviewer', 'code-review', 'pull-request', 'ai-code-review', 'qodo', '代碼審查', 'PR審查', 'code-review-agent', '程式碼審查'],
    capabilities: ['pr-review', 'code-suggestions', 'pr-description', 'security-review', 'cli', 'webhook', 'multi-provider-llm'],
    install: {
      method: 'pip',
      command: 'pip install pr-agent',
      repoUrl: 'https://github.com/The-PR-Agent/pr-agent'
    },
    useCase: '當需要在 GitHub / GitLab / Bitbucket 上自動化 PR 審查、生成 PR 描述與行內改進建議時使用，可掛載為 CI 步驟或 webhook 服務。',
    advantages: [
      '支援 GitHub / GitLab / Bitbucket / Azure DevOps 與 CLI、webhook 多種掛載方式',
      '相容 OpenAI、Anthropic、Ollama 等多家 LLM，可自架自控成本',
      '功能模組化（描述、審查、改進、提問、安全審查），可按需啟用'
    ],
    negativeConstraints: [
      '為社群維護的 legacy 專案，非 Qodo 商業版，功能迭代較慢',
      '自動審查建議仍需人工覆核，不可取代人工 code review',
      '呼叫 LLM 會將 diff 內容送至所選供應商，敏感專案需評估'
    ],
    status: 'active',
    addedAt: now,
    stars: 12954
  },
  {
    id: 'youtube-automation-agent',
    name: 'YouTube Automation Agent',
    url: 'https://github.com/darkzOGx/youtube-automation-agent',
    description: 'Fully automated YouTube channel management with AI agents — ideates topics, writes scripts, generates thumbnails, optimises SEO metadata and uploads videos on a schedule, using a free Gemini API key or OpenAI with no coding required.',
    category: 'AI 代理',
    language: 'javascript',
    triggers: ['youtube-automation-agent', 'youtube-automation', 'youtube-bot', 'content-automation', 'seo-optimization', 'thumbnail-generator', '影片自動化', 'YouTube自動化', '自動上片', '頻道自動化'],
    capabilities: ['content-ideation', 'script-generation', 'thumbnail-generation', 'seo-optimization', 'scheduled-upload', 'youtube-api', 'gemini'],
    install: {
      method: 'git-clone',
      command: 'git clone https://github.com/darkzOGx/youtube-automation-agent.git',
      repoUrl: 'https://github.com/darkzOGx/youtube-automation-agent'
    },
    useCase: '當需要以 AI Agent 全自動經營 YouTube 頻道（選題、腳本、縮圖、SEO 到定時上傳）時使用，適合個人創作者與內容自動化實驗。',
    advantages: [
      '支援免費 Gemini API 金鑰即可運作，入門成本低',
      '涵蓋選題到上傳的完整流水線，非單點工具',
      '宣稱無需程式能力即可配置，Node.js 生態易於部署'
    ],
    negativeConstraints: [
      '自動上傳需自行申請 YouTube Data API 配額與 OAuth 憑證',
      '大量自動上傳可能觸發平台政策審查，須自行承擔風險',
      '產出內容品質仍需人工把關，不建議完全無人監督'
    ],
    status: 'active',
    addedAt: now,
    stars: 3336
  },
  {
    id: 'freecad-library',
    name: 'FreeCAD Parts Library',
    url: 'https://github.com/FreeCAD/FreeCAD-library',
    description: 'Community-maintained library of reusable FreeCAD parts, organised by family and shipped in .FcStd and .stp formats — the standard add-on parts repository for FreeCAD models.',
    category: '3D工程繪圖',
    language: 'other',
    triggers: ['freecad-library', 'freecad-parts', 'cad-parts', '3d-parts-library', 'step-parts', 'fcstd', '零件庫', '3D零件', '標準零件', '機械零件'],
    capabilities: ['cad-parts-library', 'fcstd', 'step', 'stl', 'parametric-parts'],
    install: {
      method: 'git-clone',
      command: 'git clone https://github.com/FreeCAD/FreeCAD-library.git',
      repoUrl: 'https://github.com/FreeCAD/FreeCAD-library'
    },
    useCase: '當需要在 FreeCAD 中重用標準機械零件（螺絲、軸承、型材等）作為組裝基礎，避免從零建模時使用。',
    advantages: [
      '由 FreeCAD 社群長期維護，零件以家族分類、命名規範統一',
      '同時提供 .FcStd 與 .stp 格式，兼顧原生編輯與跨 CAD 交換',
      '可直接透過 FreeCAD 附加元件管理員安裝'
    ],
    negativeConstraints: [
      '倉庫體積巨大（數 GB），下載與附加元件管理員可能長時間無回應',
      '非 FreeCAD 官方核心專案，零件品質由貢獻者自行負責',
      '零件為通用標準件，不含特定廠牌型號或客製設計'
    ],
    status: 'active',
    addedAt: now,
    stars: 1951
  },
  {
    id: 'freetube',
    name: 'FreeTube',
    url: 'https://github.com/FreeTubeApp/FreeTube',
    description: 'Open-source desktop YouTube client focused on privacy — no ads, no Google account required, with local subscriptions, playlists, SponsorBlock and optional Tor/SOCKS5 proxying.',
    category: '影片',
    language: 'vue',
    triggers: ['freetube', 'youtube-client', 'privacy-youtube', 'ad-free-youtube', 'desktop-youtube', 'sponsorblock', '無廣告YouTube', '隱私影片', '去廣告觀看'],
    capabilities: ['youtube-client', 'ad-blocking', 'local-subscriptions', 'sponsorblock', 'tor-proxy', 'cross-platform-desktop'],
    install: {
      method: 'download',
      command: 'Download the installer for your platform from https://freetubeapp.io/ or the GitHub Releases page.',
      repoUrl: 'https://github.com/FreeTubeApp/FreeTube'
    },
    useCase: '當需要在桌面端觀看 YouTube 但避免廣告與 Google 追蹤、並以本機儲存訂閱與播放清單時使用。',
    advantages: [
      '不需 Google 帳號即可訂閱與管理頻道，訂閱資料僅存本機',
      '內建 SponsorBlock 與廣告阻擋，觀看體驗乾淨',
      '支援 Tor / SOCKS5 代理，可進一步隱藏來源 IP'
    ],
    negativeConstraints: [
      '非官方客戶端，可能因 YouTube 介面變動而暫時失效',
      '不支援 Google 帳號同步、留言互動等登入後功能',
      '無法下載影片離線觀看（非下載工具）'
    ],
    status: 'active',
    addedAt: now,
    stars: 21901
  },
  {
    id: 'gpt4free',
    name: 'gpt4free (g4f)',
    url: 'https://github.com/xtekky/gpt4free',
    description: 'Python library and OpenAI-compatible endpoint that aggregates dozens of free or reverse-engineered LLM providers (GPT, DeepSeek, Gemini, Claude, Grok and more) behind a single unified interface.',
    category: 'API 整合',
    language: 'python',
    triggers: ['gpt4free', 'g4f', 'free-gpt', 'reverse-engineering', 'openai-compatible', 'multi-provider', 'free-llm', '免費gpt', '逆向接口', '多供應商聚合'],
    capabilities: ['multi-provider-aggregation', 'openai-compatible', 'image-generation', 'provider-pooling', 'python-library', 'web-ui'],
    install: {
      method: 'pip',
      command: 'pip install -U g4f[all]',
      repoUrl: 'https://github.com/xtekky/gpt4free'
    },
    useCase: '當需要以免費方式存取多家 LLM 供應商、並以統一 OpenAI 相容介面呼叫（含圖像生成）時使用，適合個人實驗與原型驗證。',
    advantages: [
      '單一介面聚合數十家供應商，供應商失效可快速切換',
      '提供 Python 套件與 Web UI 兩種使用方式',
      '社群規模大、更新頻繁，新模型支援速度快'
    ],
    negativeConstraints: [
      '多數上游為逆向或非官方端點，穩定性與合規性均無保證',
      '嚴禁用於生產環境、商業用途或任何需要合規稽核的場景',
      '可能違反上游供應商服務條款，使用風險須自行承擔'
    ],
    status: 'active',
    addedAt: now,
    stars: 66685
  },
  {
    id: 'freellmapi',
    name: 'FreeLLMAPI',
    url: 'https://github.com/tashfeenahmed/freellmapi',
    description: 'Self-hosted router that aggregates free tiers from 34 LLM providers and 635 model endpoints behind a single OpenAI-compatible /v1 API, with smart model routing, automatic failover, encrypted key storage and per-key usage tracking.',
    category: 'API 整合',
    language: 'typescript',
    triggers: ['freellmapi', 'llm-router', 'free-llm-api', 'api-aggregator', 'openai-compatible', 'failover', 'llm-gateway', '免費llm', '模型路由', '金鑰池'],
    capabilities: ['llm-routing', 'automatic-failover', 'openai-compatible', 'encrypted-keys', 'usage-tracking', 'docker-deploy'],
    install: {
      method: 'docker',
      command: 'docker run -p 3000:3000 ghcr.io/freellmapi/freellmapi',
      repoUrl: 'https://github.com/tashfeenahmed/freellmapi'
    },
    useCase: '當需要把數十家免費 LLM 供應商整合成單一 /v1 端點、並以智慧路由與自動容錯維持可用性時使用。',
    advantages: [
      '聚合 34 家供應商、635 個模型端點於單一 OpenAI 相容端點',
      '內建智慧路由、速率限制自動容錯與每把金鑰用量追蹤',
      '金鑰加密儲存，Docker 一鍵自架，資料自控'
    ],
    negativeConstraints: [
      '官方定位為個人實驗用途，不適合生產或商業服務',
      '實際可用額度受各上游免費方案限制，非穩定保證',
      '需自行管理多家供應商金鑰，維運成本不可忽略'
    ],
    status: 'active',
    addedAt: now,
    stars: 25587
  },
  {
    id: 'free-books',
    name: '互聯網上的免費書籍',
    url: 'https://github.com/ruanyf/free-books',
    description: '阮一峰整理的互聯網免費書籍索引，按語言與主題分類收錄可合法免費閱讀的技術與人文書目，並提供原文連結。',
    category: '學習資源',
    language: 'markdown',
    triggers: ['free-books', '免费书籍', '免费电子书', '互联网免费书籍', 'ebooks', 'free-ebooks', '免費書', '書單', '免費閱讀'],
    capabilities: ['ebook-index', 'free-books', 'curated-links', 'chinese-resources'],
    install: {
      method: 'none',
      command: 'No installation required — browse the curated index and follow the original links.',
      repoUrl: 'https://github.com/ruanyf/free-books'
    },
    useCase: '當需要尋找可合法免費閱讀的中英文技術／人文書籍資源時使用，適合作為自學與閱讀清單的起點。',
    advantages: [
      '由知名技術作者阮一峰整理，選書品質與可信度高',
      '以索引形式導向原始合法來源，不涉及侵權轉載',
      '涵蓋程式技術與人文社科，主題廣度大'
    ],
    negativeConstraints: [
      '僅為書目索引，不託管也不提供書籍檔案下載',
      '更新頻率低（最後一次推送為 2024 年），部分連結可能失效',
      '不保證所列書目的授權狀態，使用前仍須自行確認'
    ],
    status: 'active',
    addedAt: now,
    stars: 15998
  },
  {
    id: 'musicfree',
    name: 'MusicFree',
    url: 'https://github.com/maotoumao/MusicFree',
    description: 'Plugin-based, customisable and ad-free free music player for Android and desktop. Music sources are supplied as community plugins, so the player itself ships with no bundled content.',
    category: '音訊',
    language: 'typescript',
    triggers: ['musicfree', 'music-player', '免費音樂', '音樂播放器', 'plugin-music', 'ad-free-music', 'react-native', '插件化播放器', '無廣告音樂'],
    capabilities: ['music-playback', 'plugin-architecture', 'ad-free', 'cross-platform', 'react-native', 'customisable-ui'],
    install: {
      method: 'download',
      command: 'Download the Android APK or desktop build from the GitHub Releases page.',
      repoUrl: 'https://github.com/maotoumao/MusicFree'
    },
    useCase: '當需要一款可透過插件自訂音源、無廣告且跨平台的免費音樂播放器時使用。',
    advantages: [
      '插件化架構，音源可自行擴充與替換，不被單一平台綁定',
      '完全無廣告，介面與主題可高度自訂',
      '基於 React Native，同時支援 Android 與桌面端'
    ],
    negativeConstraints: [
      '播放器本體不含任何音樂內容，音源全由第三方插件提供',
      '使用第三方音源須自行確認來源合法性與著作權合規',
      '插件品質參差，穩定性取決於所選插件'
    ],
    status: 'active',
    addedAt: now,
    stars: 26794
  }
];

// ─── 既有工具升級（9 個）──────────────────────────────────────────────────
// 規則：重新解析後以較優者取代舊資料（保留原 addedAt）
const upgrades = [
  {
    id: 'public-apis',
    url: 'https://github.com/public-apis/public-apis',
    reason: 'install method 誤植為 pip（實際為清單型資源，無安裝指令）；triggers 含大量無鑑別度單字；stars 過期',
    patch: {
      name: 'Public APIs',
      description: 'Curated, community-maintained directory of free public APIs, categorised by domain (auth, finance, weather, healthcare…) with direct links to each vendor\'s documentation.',
      category: 'API 整合',
      language: 'python',
      triggers: ['public-apis', 'free-apis', 'api-directory', 'api-list', 'developer-tools', 'open-source', '免費api', 'api清單', '公開api'],
      capabilities: ['api-directory', 'free-apis', 'community-maintained', 'categorized-listing'],
      install: {
        method: 'none',
        command: 'No installation required — browse the README directory or consume the community-maintained dataset.',
        repoUrl: 'https://github.com/public-apis/public-apis'
      },
      useCase: '當開發者需要快速尋找並整合可靠的第三方 API 端點（用於原型或正式系統）時使用，可依領域分類檢索。',
      advantages: [
        'GitHub 上星數最高的 API 目錄，社群維護活躍、條目持續更新',
        '依認證方式、HTTPS 支援、CORS 等維度標註，挑選成本低',
        '每筆條目直接連結官方文件，便於評估整合可行性'
      ],
      negativeConstraints: [
        '僅為索引，不保證任何第三方 API 的可用性或服務水準',
        '不含付費、私有或企業內部 API',
        '不具備 API 閘道或治理功能，無法取代內部 API 管理'
      ],
      stars: 479098
    }
  },
  {
    id: 'gpt-api-free',
    url: 'https://github.com/chatanywhere/GPT_API_free',
    reason: '分類誤置於「AI 框架」；實際為可直接調用的免費 API 端點供應者，依決策樹應歸「API 整合」；stars 過期',
    patch: {
      category: 'API 整合',
      stars: 42348
    }
  },
  {
    id: 'awesome-free-llm-apis',
    url: 'https://github.com/mnfst/awesome-free-llm-apis',
    reason: '分類誤置於「AI 框架」；install method 誤植為 npm（實際為清單 + SKILL.md 資源）；stars 過期',
    patch: {
      category: 'API 整合',
      language: 'javascript',
      install: {
        method: 'none',
        command: 'No installation required — browse the curated list, or load the bundled SKILL.md into an agent for guided setup.',
        repoUrl: 'https://github.com/mnfst/awesome-free-llm-apis'
      },
      capabilities: ['free-llm-apis', 'api-keys', 'awesome-list', 'provider-discovery', 'agent-skill'],
      useCase: '當需要尋找可長期免費使用的 LLM API 供應商與金鑰申請途徑時使用；內附 SKILL.md 可讓 Agent 引導完成申請與設定。',
      advantages: [
        '彙整各家「永久免費」LLM API 額度，避免逐一摸索',
        '內建 Claude Skill（free-llm-apis/SKILL.md），可交由 Agent 自動引導設定',
        '同步提供 data.json，便於程式化取用'
      ],
      negativeConstraints: [
        '免費額度與政策隨時可能變動，清單不保證長期有效',
        '不適合高流量或需 SLA 的生產環境',
        '部分供應商需綁定信用卡或實名驗證'
      ],
      stars: 7528
    }
  },
  {
    id: 'freebuff',
    url: 'https://github.com/CodebuffAI/freebuff',
    reason: '分類誤置於「開發工具」；實為成品編碼 Agent，應歸「AI 代理」；metadata 為自動掃描殘留（capabilities 空、triggers 僅 2 個且含分類名、status experimental）；stars 過期',
    patch: {
      name: 'Freebuff',
      description: 'Free CLI coding agent from Codebuff — reads your codebase and writes code across multiple files from a natural-language request, powered by the Codebuff model-routing backend.',
      category: 'AI 代理',
      language: 'typescript',
      triggers: ['freebuff', 'coding-agent', 'cli-agent', 'codebuff', 'free-coding-agent', '免費編碼代理', '編碼agent', '終端機agent'],
      capabilities: ['coding-agent', 'cli', 'multi-file-edit', 'codebase-aware', 'natural-language'],
      install: {
        method: 'npm',
        command: 'npx freebuff',
        repoUrl: 'https://github.com/CodebuffAI/freebuff'
      },
      useCase: '當需要在終端機中以自然語言驅動一個免費編碼 Agent、讓它跨檔案讀寫程式碼時使用。',
      advantages: [
        'npx 一鍵啟動，無需複雜安裝與設定',
        '由 Codebuff 模型路由後端驅動，免費使用',
        'CLI 原生體驗，易於融入既有終端機工作流'
      ],
      negativeConstraints: [
        '免費額度與模型選擇受 Codebuff 服務政策限制',
        '僅提供 CLI 介面，無 IDE 整合或圖形化操作',
        '程式碼內容會送至雲端模型，敏感專案需評估'
      ],
      status: 'active',
      stars: 11963
    }
  },
  {
    id: 'awesome-llm-apps',
    url: 'https://github.com/Shubhamsaboo/awesome-llm-apps',
    reason: 'subTools 為掃描雜訊（10 筆中多筆 description 為 README 原始片段如 ">-"、"|"，subpath 指向 build 產物如 .agent/skills/...）；分類「AI 框架」不符決策樹，應歸「AI 代理」（agent/skill 集合）；stars 過期',
    patch: {
      name: 'Awesome LLM Apps',
      description: '100+ free and open-source AI agent, agent-skill and RAG application examples — starter to advanced multi-agent systems, always-on agents, MCP agents, voice agents and generative-UI agents.',
      category: 'AI 代理',
      language: 'python',
      triggers: ['awesome-llm-apps', 'llm-apps', 'ai-agents', 'rag', 'multi-agent', 'agent-skills', 'generative-ui-agents', 'llm範例', 'agent範例'],
      capabilities: ['agent-examples', 'rag-tutorials', 'multi-agent', 'mcp-agents', 'voice-agents', 'generative-ui', 'agent-skills'],
      install: {
        method: 'git-clone',
        command: 'git clone https://github.com/Shubhamsaboo/awesome-llm-apps.git',
        repoUrl: 'https://github.com/Shubhamsaboo/awesome-llm-apps'
      },
      subTools: [
        { name: 'Starter AI Agents', description: '入門級單一 Agent 範例，適合首次接觸 LLM Agent 開發者。', subpath: 'starter_ai_agents' },
        { name: 'Advanced AI Agents', description: '進階多 Agent 協作與複雜工作流範例（含 agent teams、news/podcast agents）。', subpath: 'advanced_ai_agents' },
        { name: 'Always-On Agents', description: '常駐型 Agent 範例，可持續運行並回應事件。', subpath: 'always_on_agents' },
        { name: 'MCP AI Agents', description: '以 Model Context Protocol 串接外部工具的 Agent 範例。', subpath: 'mcp_ai_agents' },
        { name: 'Voice AI Agents', description: '語音互動 Agent 範例，涵蓋 STT/TTS 整合。', subpath: 'voice_ai_agents' },
        { name: 'Generative UI Agents', description: '生成式 UI Agent 範例，含 dashboard、deep research 與 MCP app builder。', subpath: 'generative_ui_agents' },
        { name: 'Agent Skills', description: '可直接掛載的 Agent Skills 集合（advisor orchestrator、commit archaeologist 等）。', subpath: 'agent_skills' },
        { name: 'RAG Tutorials', description: '檢索增強生成（RAG）教學與實作範例。', subpath: 'rag_tutorials' },
        { name: 'Advanced LLM Apps', description: '進階 LLM 應用範例（多模態、影片時刻搜尋等）。', subpath: 'advanced_llm_apps' },
        { name: 'AI Agent Framework Crash Course', description: '主流 Agent 框架速成教材與對照範例。', subpath: 'ai_agent_framework_crash_course' }
      ],
      useCase: '當需要快速取得可運行的 Agent／RAG 範例作為專案起點或教學素材時使用，涵蓋入門到進階多 Agent 架構。',
      advantages: [
        '100+ 個可運行範例，涵蓋 starter 到 advanced multi-agent 完整梯度',
        '同時提供 Agent Skills 與 Generative UI 範例，緊跟 2026 年主流範式',
        '每個子專案皆可獨立 clone 運行，學習與複製成本低'
      ],
      negativeConstraints: [
        '為範例集而非產品，程式碼未經生產環境硬化',
        '各子專案依賴與版本各自獨立，無統一環境管理',
        '合規敏感場景須自行完成安全與隱私審查'
      ],
      stars: 137265
    }
  },
  {
    id: 'freecad',
    url: 'https://github.com/FreeCAD/FreeCAD',
    reason: 'stars 過期；補齊 triggers 與 capabilities（原 6 條觸發詞偏少，影響檢索召回）',
    patch: {
      language: 'c++',
      triggers: ['freecad', '3d-cad', 'parametric-modeling', 'mechanical-cad', 'engineering-drafting', 'bim', 'fem-analysis', 'step-stl-export', '開源cad', '參數化建模'],
      capabilities: ['parametric-3d-modeling', '2d-technical-drawing', 'bim-architecture', 'fem-analysis', 'cam-gcode', 'step-iges-conversion', 'python-scripting'],
      stars: 33438
    }
  },
  {
    id: 'free-for-dev',
    url: 'https://github.com/ripienaar/free-for-dev',
    reason: '分類誤置於「研究」；實為免費額度服務的 Awesome 清單，應歸「學習資源」；useCase/advantages/negativeConstraints 為探勘殘留（無實質內容）；install 缺 command；stars 過期',
    patch: {
      name: 'free-for-dev',
      description: 'A curated list of SaaS, PaaS and IaaS offerings that have free tiers useful for DevOps and infrastructure developers.',
      category: '學習資源',
      language: 'html',
      triggers: ['free-for-dev', 'free-tier', 'saas-free-tier', 'devops', 'awesome-list', 'free-for-developers', '免費資源', '免費額度', '雲端免費方案'],
      capabilities: ['free-tier-directory', 'saas-paas-iaas', 'devops-resources', 'awesome-list'],
      install: {
        method: 'none',
        command: 'No installation required — browse the list at https://free-for.dev/ or read the README.',
        repoUrl: 'https://github.com/ripienaar/free-for-dev'
      },
      useCase: '當需要為專案尋找具免費額度的 SaaS / PaaS / IaaS 服務（CI、託管、資料庫、監控、日誌等）時使用。',
      advantages: [
        '涵蓋 CI/CD、監控、日誌、資料庫、DNS 等完整 DevOps 工具鏈的免費方案',
        '每項標註免費額度細節與限制條件，評估成本快速',
        '社群維護活躍（13.7 萬星），並有 free-for.dev 網頁版可直接搜尋'
      ],
      negativeConstraints: [
        '僅為資訊彙整，免費方案條款與額度可能隨時變更',
        '不含付費方案比較，也不提供供應商推薦或背書',
        '不適合需要採購合約、SLA 或合規認證的企業選型流程'
      ],
      stars: 137157
    }
  },
  {
    id: 'free-claude-code',
    url: 'https://github.com/Alishahryar1/free-claude-code',
    reason: 'URL owner 大小寫未正規化；stars 過期',
    patch: {
      url: 'https://github.com/Alishahryar1/free-claude-code',
      install: {
        method: 'curl',
        command: 'curl -fsSL https://raw.githubusercontent.com/Alishahryar1/free-claude-code/main/scripts/install.sh | sh',
        repoUrl: 'https://github.com/Alishahryar1/free-claude-code'
      },
      stars: 54577
    }
  },
  {
    id: 'freetoken',
    url: 'https://github.com/FlashML-org/FreeToken',
    reason: 'useCase/advantages 文字殘留「開發工具」與「自動化掃描收錄」樣板，與實際 category（AI 框架）矛盾；capabilities 僅為 topics 複製；status experimental 過時；stars 過期',
    patch: {
      name: 'FreeToken',
      description: 'FreeToken brings datacenter-scale model serving to your desktop — run massive MoE models (Qwen, GLM, DeepSeek, MiniMax) locally, fast and efficiently.',
      category: 'AI 框架',
      language: 'python',
      triggers: ['freetoken', 'local-inference', 'moe-inference', 'desktop-serving', 'qwen', 'glm', 'deepseek', 'minimax', '本地推理', '模型服務', '本地部署'],
      capabilities: ['local-model-serving', 'moe-inference', 'desktop-runtime', 'high-throughput-inference', 'gpu-acceleration'],
      useCase: '當需要在個人電腦上高效運行大型 MoE 模型（如 Qwen、GLM、DeepSeek、MiniMax）並取得接近資料中心等級的推理吞吐時使用。',
      advantages: [
        '把資料中心等級的模型服務能力帶到桌機，無需昂貴硬體',
        '針對 MoE 架構最佳化，大型模型推理吞吐顯著提升',
        'Apache-2.0 授權，商業使用友善'
      ],
      negativeConstraints: [
        '仍需一定等級的本地 GPU 與記憶體，非一般筆電皆可運行',
        '專注本地推理服務，不含模型訓練或微調能力',
        '專案年輕、迭代快速，API 與相容性可能變動'
      ],
      status: 'active',
      stars: 12501
    }
  }
];

// ─── 主流程 ────────────────────────────────────────────────────────────────
function main() {
  const registry = JSON.parse(readFileSync(REGISTRY_PATH, 'utf-8'));
  const before = registry.tools.length;

  // Step 0: 語言正規化（全庫）
  let langFixed = 0;
  for (const tool of registry.tools) {
    const normalized = normalizeLanguage(tool.language);
    if (tool.language !== normalized) {
      tool.language = normalized;
      langFixed++;
    }
  }
  console.log(`[Lang] 正規化 ${langFixed} 筆語言欄位`);

  // Step 1: 升級既有工具
  let upgraded = 0;
  for (const up of upgrades) {
    const idx = registry.tools.findIndex(t => t.id === up.id);
    if (idx < 0) { console.log(`[WARN] 升級目標不存在: ${up.id}`); continue; }
    const existing = registry.tools[idx];
    const merged = { ...existing, ...up.patch };
    merged.addedAt = existing.addedAt; // 保留原始加入時間
    merged.status = up.patch.status || existing.status || 'active';
    registry.tools[idx] = merged;
    console.log(`[Upgrade] ${up.id}: ${existing.category} → ${merged.category} | stars ${existing.stars} → ${merged.stars}`);
    console.log(`          reason: ${up.reason}`);
    upgraded++;
  }

  // Step 2: 新增工具
  let added = 0;
  for (const entry of newEntries) {
    const dup = registry.tools.find(t => t.id === entry.id || t.url === entry.url);
    if (dup) { console.log(`[SKIP] 已存在: ${entry.id}`); continue; }
    registry.tools.push(entry);
    console.log(`[Add] ${entry.name} (${entry.id}) → ${entry.category} | ⭐${entry.stars}`);
    added++;
  }

  registry.lastUpdated = now;
  writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2) + '\n', 'utf-8');
  console.log(`\n✅ registry/tools.json: ${before} → ${registry.tools.length} (+${added} 新增, ${upgraded} 升級)`);

  // Step 3: tracked-repos.json
  const tracked = JSON.parse(readFileSync(TRACKED_PATH, 'utf-8'));
  const reposToTrack = [
    ...newEntries.map(e => e.url.replace('https://github.com/', '')),
    ...upgrades.map(u => u.patch.url ? u.patch.url.replace('https://github.com/', '') : null)
  ].filter(Boolean);
  let trackedAdded = 0;
  for (const fullName of reposToTrack) {
    if (tracked[fullName]) continue;
    const [owner, repo] = fullName.split('/');
    const entry = registry.tools.find(t => t.url.toLowerCase() === `https://github.com/${fullName}`.toLowerCase());
    tracked[fullName] = {
      fullName,
      owner,
      repo,
      category: entry ? entry.category : 'API 整合',
      addedAt: now,
      status: 'tracking'
    };
    trackedAdded++;
  }
  writeFileSync(TRACKED_PATH, JSON.stringify(tracked, null, 2) + '\n', 'utf-8');
  console.log(`✅ registry/tracked-repos.json: +${trackedAdded} (總計 ${Object.keys(tracked).length})`);

  // Step 4: star-snapshots.json（當週 W37）
  const snapshotsFile = JSON.parse(readFileSync(SNAPSHOTS_PATH, 'utf-8'));
  const ww = getCurrentWorldWeek();
  const allRepos = [...newEntries, ...upgrades.map(u => {
    const t = registry.tools.find(x => x.id === u.id);
    return t ? { url: t.url, stars: t.stars } : null;
  }).filter(Boolean)];
  let weekKey = Object.keys(snapshotsFile.snapshots).find(
    k => snapshotsFile.snapshots[k].week === ww.weekStr
  );
  if (!weekKey) {
    weekKey = String(Object.keys(snapshotsFile.snapshots).length);
    snapshotsFile.snapshots[weekKey] = {
      week: ww.weekStr,
      dateRange: ww.dateRange,
      timestamp: now,
      repos: {}
    };
  }
  const week = snapshotsFile.snapshots[weekKey];
  week.dateRange = ww.dateRange;
  let snapUpdated = 0;
  for (const e of allRepos) {
    const slug = e.url.replace('https://github.com/', '');
    // 以 registry 中的 canonical slug 為準，避免大小寫分歧
    const canonical = Object.keys(tracked).find(k => k.toLowerCase() === slug.toLowerCase()) || slug;
    if (week.repos[canonical] !== e.stars) {
      week.repos[canonical] = e.stars;
      snapUpdated++;
    }
  }
  snapshotsFile.lastUpdated = now;
  writeFileSync(SNAPSHOTS_PATH, JSON.stringify(snapshotsFile, null, 2) + '\n', 'utf-8');
  console.log(`✅ registry/star-snapshots.json: ${ww.weekStr} 更新 ${snapUpdated} 筆 (該週共 ${Object.keys(week.repos).length} repos)`);
}

main();
