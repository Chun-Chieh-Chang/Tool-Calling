#!/usr/bin/env node

import { parseArgs } from 'node:util';
import { generateId } from '../core/registry.js';



/**
 * 根據描述與標籤猜測分類（使用 18 分類標準）
 */
const CATEGORY_RULES = [
  // 安全性
  { cat: '安全性', keywords: ['cybersec', 'osint', 'pentest', 'vulnerability', 'exploit', 'ctf'] },
  // 瀏覽器自動化
  { cat: '瀏覽器自動化', keywords: ['browser-automation', 'headless-browser', 'anti-detect', 'playwright', 'puppeteer', 'scraping'] },
  // 音訊
  { cat: '音訊', keywords: ['tts', 'text-to-speech', 'speech-to-text', 'podcast', 'audio-processing', 'music'] },
  // 影片
  { cat: '影片', keywords: ['youtube', 'transcript', 'lip-sync', 'video-generation', 'video-editing', 'ffmpeg'] },
  // 研究
  { cat: '研究', keywords: ['research', 'arxiv', 'sota', 'publication', 'literature-review', 'paper'] },
  // 文件生產力
  { cat: '文件生產力', keywords: ['powerpoint', 'presentation', 'spreadsheet', 'docx', 'xlsx', 'pdf', 'document'] },
  // 知識管理
  { cat: '知識管理', keywords: ['knowledge-graph', 'knowledge-base', 'memory', 'wiki', 'note-taking'] },
  // 測試與自動化
  { cat: '測試與自動化', keywords: ['e2e', 'playwright', 'testing', 'benchmark', 'qa', 'selenium', 'cypress'] },
  // API 整合
  { cat: 'API 整合', keywords: ['mcp-server', 'webhook', 'graphql', 'rest-api', 'sdk', 'api-gateway'] },
  // AI 代理
  { cat: 'AI 代理', keywords: ['agent-framework', 'agent-toolkit', 'agent harness', 'agentic', 'autonomous-agent', 'llm-app', 'ai-agent', 'cli-agent', 'code-assistant', 'gemini', 'gpt-proxy', 'openai-compatible'] },
  // 多媒體生成
  { cat: '多媒體生成', keywords: ['text-to-image', 'image-generation', 'generative-ai', 'ai-art', 'stable-diffusion'] },
  // 學習資源
  { cat: '學習資源', keywords: ['tutorial', 'awesome-list', 'reference-guide', 'type-challenges', 'curriculum', 'roadmap', 'api-directory', 'free-apis', 'public-apis', 'catalog', 'list-of', 'awesome-', 'handbook'] },
];

/**
 * 備用關鍵字（Phase 2 使用）
 */
const FALLBACK_KEYWORDS = [
  { cat: '安全性', keywords: ['security', 'vulnerability', 'pentest', 'osint', 'cybersec'] },
  { cat: '瀏覽器自動化', keywords: ['browser-automation', 'undetected', 'scraping'] },
  { cat: '音訊', keywords: ['audio', 'music', 'sound', 'speech', 'voice', 'podcast'] },
  { cat: '影片', keywords: ['video', 'youtube', 'transcript', 'animation', 'avatar'] },
  { cat: '研究', keywords: ['research', 'paper', 'arxiv', 'sota', 'publication', 'survey'] },
  { cat: '文件生產力', keywords: ['document', 'presentation', 'excel', 'word', 'pdf', 'spreadsheet', 'powerpoint'] },
  { cat: '數據分析', keywords: ['analytics', 'monitoring', 'telemetry', 'observability', 'dashboard'] },
  { cat: '知識管理', keywords: ['knowledge', 'memory', 'rag', 'vector-db'] },
  { cat: '測試與自動化', keywords: ['testing', 'test-driven', 'qa', 'lint', 'quality', 'audit', 'benchmark'] },
  { cat: 'API 整合', keywords: ['integration', 'mcp-server', 'webhook', 'graphql', 'rest-api', 'api-proxy'] },
];

/**
 * 檢查關鍵字是否以完整詞彙（word boundary）存在於 text 中
 */
function matchWord(text, kw) {
  const idx = text.indexOf(kw);
  if (idx === -1) return false;
  const before = idx === 0 || text[idx - 1] === ' ' || text[idx - 1] === '-' || text[idx - 1] === '_';
  const after = idx + kw.length >= text.length || text[idx + kw.length] === ' ' || text[idx + kw.length] === '-' || text[idx + kw.length] === '_';
  return before && after;
}

function guessCategory(desc, topics) {
  const text = (desc + ' ' + topics.join(' ')).toLowerCase();

  // Phase 1: 精準比對 — 複合關鍵字 + word boundary
  for (const { cat, keywords } of CATEGORY_RULES) {
    if (keywords.some(k => matchWord(text, k))) return cat;
  }

  // Phase 2: 一般比對 — 也使用 word boundary
  for (const { cat, keywords } of FALLBACK_KEYWORDS) {
    if (keywords.some(k => matchWord(text, k))) return cat;
  }

  // Phase 3: 從 URL 推測
  if (text.includes('ai') || text.includes('llm')) return 'AI 代理';
  if (text.includes('agent') || text.includes('skill')) return '開發工具';
  if (text.includes('cli') || text.includes('command')) return '開發工具';
  if (text.includes('automation')) return '測試與自動化';
  // MECE 原則：禁止產生「其他」殘留分類（docs/CATEGORY-SYSTEM.md 預設規則）
  return '開發工具';
}

/** GitHub API 共用標頭 */
const GH_HEADERS = {
  'User-Agent': 'Tool-Calling-Scanner/1.0',
  'Accept': 'application/vnd.github.v3+json',
};

/**
 * 非可安裝資源的訊號：目錄、清單、教學類 repo 沒有安裝指令。
 */
const RESOURCE_SIGNALS = [
  'awesome-list', 'public-apis', 'free-api', 'api-directory', 'catalog',
  'list of', 'curated', 'directory', 'resource-list', 'cheatsheet',
  'roadmap', 'tutorial', 'learning-path', 'handbook', 'reference-guide'
];

/** 從 `https://github.com/owner/repo` 取出 owner / repo；失敗回傳 null。 */
function parseRepoUrl(repoUrl) {
  const m = String(repoUrl || '').match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)$/);
  return m ? { owner: m[1], repo: m[2] } : null;
}

/**
 * 列出 repo 根目錄的檔名集合。取不到（限流／網路問題／非目錄）回傳 null，
 * 讓呼叫端能區分「確定沒有封裝檔」與「查不到」。
 */
async function listRootFiles(repoUrl, fetchImpl = fetch) {
  const p = parseRepoUrl(repoUrl);
  if (!p) return null;
  try {
    const res = await fetchImpl(
      `https://api.github.com/repos/${p.owner}/${p.repo}/contents/`,
      { headers: GH_HEADERS },
    );
    if (!res.ok) return null;
    const arr = await res.json();
    if (!Array.isArray(arr)) return null;
    return new Set(arr.map((f) => f.name));
  } catch {
    return null;
  }
}

/** 讀取 repo 根目錄某個檔案的原文；失敗回傳 null。 */
async function fetchRepoFile(repoUrl, relPath, fetchImpl = fetch) {
  const p = parseRepoUrl(repoUrl);
  if (!p) return null;
  try {
    const res = await fetchImpl(
      `https://raw.githubusercontent.com/${p.owner}/${p.repo}/HEAD/${relPath}`,
    );
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

/**
 * 依 repo 的**實際封裝檔案**判斷安裝方式。
 *
 * 🔴 為何不能只看 language（2026-09-21 修正）：
 *   舊版 `guessInstall()` 只憑 GitHub 偵測到的語言就直接生成指令——
 *   typescript → `npx <repo>`、python → `pip install git+<url>`。
 *   但「語言」不等於「可安裝套件」，於是產生了一批**照著做必定失敗**的指令：
 *     · thebuggeddev/anatomy（Next.js 應用程式，package.json 是 "private": true）
 *       → 舊版給 `npx anatomy`，npm 上根本沒有這個套件。
 *     · Z-Anatomy/Models-of-human-anatomy（Blender 範本，無 setup.py／pyproject.toml）
 *       → 舊版給 `pip install git+...`，裝不起來。
 *   給錯的指令比留白更糟——使用者會直接踩雷。改為「有封裝證據才給套件指令」，
 *   其餘一律 `git clone`（對任何 GitHub repo 都成立，是誠實的下界）。
 *
 * 判定順序（有根目錄檔案清單時）：
 *   package.json 有 bin 且非 private → npx
 *   package.json 其他（應用程式／樣板）→ git-clone
 *   pyproject.toml / setup.py → pip
 *   Cargo.toml → cargo
 *   composer.json → composer
 *   其他（只有原始碼）→ git-clone
 *
 * 查不到檔案清單時（例如 API 限流）→ 直接 git-clone，不猜套件管理器。
 */
async function detectInstall(url, language, description, topics, fetchImpl = fetch) {
  const text = ((description || '') + ' ' + (topics || []).join(' ')).toLowerCase();
  if (
    RESOURCE_SIGNALS.some((s) => text.includes(s))
    || (topics || []).some((t) => t.startsWith('awesome-') || t === 'public-apis' || t === 'free-apis')
  ) {
    return { method: 'none', command: url, repoUrl: url };
  }

  const clone = { method: 'git-clone', command: `git clone ${url}.git`, repoUrl: url };
  const files = await listRootFiles(url, fetchImpl);
  if (!files) return clone; // 查不到就別猜

  if (files.has('package.json')) {
    const raw = await fetchRepoFile(url, 'package.json', fetchImpl);
    let pkg = null;
    try { pkg = raw ? JSON.parse(raw) : null; } catch { pkg = null; }
    const name = (pkg && typeof pkg.name === 'string' && pkg.name)
      || (parseRepoUrl(url) || {}).repo
      || url.split('/').pop();
    const hasBin = Boolean(pkg && pkg.bin
      && ((typeof pkg.bin === 'string') || Object.keys(pkg.bin || {}).length > 0));
    if (hasBin && !pkg.private) {
      return { method: 'npx', command: `npx ${name}`, repoUrl: url };
    }
    // 應用程式／樣板：沒有可安裝的 CLI 進入點
    return clone;
  }

  if (files.has('pyproject.toml') || files.has('setup.py')) {
    return { method: 'pip', command: `pip install git+${url}.git`, repoUrl: url };
  }
  if (files.has('Cargo.toml')) {
    return { method: 'cargo', command: `cargo install --git ${url}`, repoUrl: url };
  }
  if (files.has('composer.json')) {
    const p = parseRepoUrl(url) || {};
    return { method: 'composer', command: `composer require ${p.owner}/${p.repo}`, repoUrl: url };
  }
  return clone;
}

/**
 * 去掉 Markdown 標記，讓描述能直接顯示。
 *
 * README 的首段常含 `**粗體**`、`[連結](url)`、`` `程式碼` `` 等標記，
 * 直接寫進 registry 會讓工具卡片顯示出一堆星號與網址。
 * 純字串操作，不用正則回溯風險高的寫法。
 */
function stripMarkdown(text) {
  let s = String(text || '');
  // ATX 標題整行移除（需「# + 空白」才成立，避免把 "#1 工具" 這類描述誤刪）。
  //
  // 🔴 為何要處理標題（2026-09-21 修正）：README 常見寫法是
  //     `# Z-Anatomy` 之後用「行尾兩個空白」接續內文，這種軟換行
  //     在 `split('\n\n')` 眼中仍是**同一段**，於是 H1 標題會跟內文
  //     黏在一起變成 description（實際踩到的就是 Z-Anatomy）。
  //     標題是「這是什麼專案」而非「這能做什麼」，且專案名已在 name 欄位，
  //     留著只會污染描述。
  s = s.replace(/^#{1,6}\s[^\n]*\n?/gm, '');
  s = s.replace(/\*\*(.+?)\*\*/g, '$1');   // 粗體
  s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1$2'); // 斜體
  s = s.replace(/`([^`]+)`/g, '$1');        // 行內程式碼
  s = s.replace(/!\[[^\]]*\]\([^)]*\)/g, ''); // 圖片
  // 連結 → 只留文字。`[^\]]*`（可為空）是刻意的：README 開頭的徽章常寫成
  // `[](https://...)`（空文字連結），若要求 `+` 就清不掉，會整串留在描述裡。
  // 用 `'$1'` 同時滿足兩種情況：有文字 → 留文字；空文字 → 整串消失。
  s = s.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
  s = s.replace(/<[^>]+>/g, '');            // HTML 標籤
  s = s.replace(/\s+/g, ' ');               // 壓縮空白（含換行）
  return s.trim();
}

/**
 * 在**詞邊界**截斷，並補上省略號。
 *
 * 🔴 為何不能直接 `slice(0, 200)`（2026-09-21 修正）：
 *   硬切會把字切一半，實際踩到的例子是 Z-Anatomy 的描述尾巴變成
 *   「...It was made by Gauthier Kervyn (de」——中文譯文也跟著變成
 *   「由 Gauthier Kervyn (de」，看起來像資料損毀而不是截斷。
 *   寧可少幾個字，也不要留下半個詞。
 */
function truncateAtWord(text, max) {
  const s = String(text || '').trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  // 找不到空白（或空白太靠前，截掉太多）就維持硬切，避免截出過短的殘句
  const head = (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trim();
  return `${head.replace(/[,;:.!?\-–—([{]+$/, '').trim()}…`;
}

/**
 * README 首段是不是「公告／樣板文」而非功能說明。
 *
 * 🔴 為何需要（2026-09-21 修正）：README 的第一段經常不是「這個工具能做什麼」，
 *    而是更新公告、授權聲明、貢獻指南。把它當 description 會讓工具卡顯示
 *    毫無資訊量的內容，且 useCase 只能複製它。實例：
 *      oracle/fusion-ai-studio → 首段是「The repository has been restructured
 *        to simplify cloning...」（更新公告）
 *      thebuggeddev/anatomy    → 首段是「A clean full-stack starter running on
 *        vinext...」（上游樣板文，與本專案無關）
 *
 * ⚠️ 清單刻意**只收明確的公告式開頭**，不做模糊比對：
 *    精度優先——誤殺一段好的功能說明，比漏放一段公告更糟。
 *    例如不可用裸的 `this repository` 規則，否則會誤殺
 *    Z-Anatomy 的「This repository contains the Blender template...」（有效描述）。
 */
const BOILERPLATE_OPENERS = [
  /^the repository has been\b/i,
  /^this repository has been\b/i,
  /^this repo has been\b/i,
  /^note[:\s]/i,
  /^notice[:\s]/i,
  /^(important|warning)[:\s]/i,
  /^deprecat(ed|ion)\b/i,
  /^we('| ha)?ve moved\b/i,
  /^this (project|repository|repo) is licensed\b/i,
  /^contributions? (are|is)\b/i,
  /^please (read|refer to|see|check)\b/i,
  /^license\b/i,
  /^changelog\b/i,
];

function isBoilerplateParagraph(text) {
  const s = String(text || '').trim();
  if (!s) return true;
  return BOILERPLATE_OPENERS.some((re) => re.test(s));
}

// ─── 主程式 ─────────────────────────────────────────────────────────────────

async function scan(url, options = {}) {
  const { silent } = options;

  if (!silent) console.log(`\x1b[36m掃描 URL:\x1b[0m ${url}`);

  // 驗證 URL (支援 Monorepo 子目錄)
  const githubRegex = /^https?:\/\/github\.com\/([^/]+)\/([^/]+)(?:\/(?:tree|blob)\/([^/]+)\/(.+))?\/?$/;
  const match = url.match(githubRegex);
  if (!match) {
    throw new Error('僅支援 GitHub 倉庫 URL (格式: https://github.com/owner/repo 或 https://github.com/owner/repo/tree/main/subpath)');
  }

  const [, owner, repo, branch, subpath] = match;

  try {
    // 取得基礎 repo 資訊
    const rootUrl = `https://github.com/${owner}/${repo}`;
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}`;
    const res = await fetch(apiUrl, {
      headers: {
        'User-Agent': 'Tool-Calling-Scanner/1.0',
        'Accept': 'application/vnd.github.v3+json',
      }
    });

    if (!res.ok) {
      throw new Error(`HTTP 錯誤: ${res.status} ${res.statusText}`);
    }

    const repoData = await res.json();
    const meta = {
      description: repoData.description || '',
      language: (repoData.language || 'other').toLowerCase(),
      topics: repoData.topics || [],
    };

    // 🔴 描述優先序（2026-09-21 修正）：
    //   1. GitHub 的 description —— 由維護者撰寫、精準描述「這是什麼」
    //   2. 只有在 GitHub 描述「不可用」時，才退而用 README 首段
    //
    // 為什麼要改：先前**一律**用 README 首段覆寫 GitHub 描述，但 README 的
    // 第一段常常不是功能說明，而是模板樣板文、更新公告或行銷文案。
    // 實例：
    //   thebuggeddev/anatomy → README 首段是 "A clean full-stack starter
    //     running on vinext..."（樣板文），把 GitHub 上正確的
    //     "An interactive 3D human anatomy explorer..." 蓋掉了。
    //   oracle/fusion-ai-studio → 首段是 "The repository has been
    //     restructured to simplify cloning..."（更新公告）。
    // 這種情況寧可保留 GitHub 的一行簡介——短但正確，勝過長而錯誤。
    const ghDesc = stripMarkdown(meta.description || '').trim();
    const ghUsable = ghDesc.length >= 40 && !/待補充|No description provided/i.test(ghDesc);
    let description = ghDesc;

    // 抓 README／SKILL.md 作為 GitHub 描述不可用時的後備。
    //
    // 🔴 2026-09-21 修正：原本**只在有 subpath 時**才抓，
    //    導致一般 repo（絕大多數）的 description 永遠只有 GitHub 那一行
    //    ——那通常是行銷標語而非功能說明，於是 useCase 也只能複製它。
    //    現在兩種情況都會嘗試：
    //      有 subpath → 先試 subpath 下的 SKILL.md，再試 README.md
    //      無 subpath → 試根目錄 README.md
    //    ref 用 `HEAD`：raw.githubusercontent 支援，可避開 main/master 猜測。
    const ref = branch || 'HEAD';
    // 檔名大小寫在 GitHub 上真的不一致（實例：Z-Anatomy 用的是 `Readme.md`），
    // 只試全大寫會漏掉。子目錄優先試 SKILL.md。
    const readmeCandidates = subpath
      ? [`${subpath}/SKILL.md`, `${subpath}/README.md`, `${subpath}/Readme.md`]
      : ['README.md', 'Readme.md', 'readme.md'];
    for (const relPath of (ghUsable ? [] : readmeCandidates)) {
      const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${relPath}`;
      const rawRes = await fetch(rawUrl);
      if (!rawRes.ok) continue;
      const readmeText = await rawRes.text();
      let content = readmeText;
      // YAML frontmatter 的 description 優先（SKILL.md 常用這種格式）
      if (content.startsWith('---')) {
        const endIdx = content.indexOf('---', 3);
        if (endIdx > -1) {
          const fm = content.substring(3, endIdx);
          const descMatch = fm.match(/description:\s*(.+)/);
          if (descMatch) {
            description = descMatch[1].trim().replace(/^['"]|['"]$/g, '');
            break;
          }
          content = content.substring(endIdx + 3).trim();
        }
      }
      // 取第一段「實質內容」。
      //
      // 🔴 順序很重要：**先清 Markdown 再判斷長度**。
      //    先前是先判斷原始段落（只排除 #/!/</- 開頭）再清標記，
      //    結果 `[](https://youtube.com/...)` 這種「空文字的連結／徽章」
      //    會被選中，清完變成空字串（Z-Anatomy 就是這樣中招）。
      const firstP = content
        .split('\n\n')
        .map((p) => stripMarkdown(p))
        .find((s) => s.length >= 40
          && !/^https?:\/\//.test(s)
          && !isBoilerplateParagraph(s));
      if (firstP) {
        description = truncateAtWord(firstP, 200);
        break;
      }
    }

    // 移除 GitHub 自動生成的 boilerplate 描述 (使用字串操作避免 regex injection)
    const boilerplate = `Contribute to ${owner}/${repo}`;
    const descLower = description.toLowerCase();
    const bpIdx = descLower.indexOf(boilerplate.toLowerCase());
    if (bpIdx !== -1) {
      const ghIdx = descLower.indexOf('github', bpIdx + boilerplate.length);
      if (ghIdx !== -1) {
        let endIdx = ghIdx + 6; // "GitHub".length
        if (description[endIdx] === '.') endIdx++;
        description = (description.slice(0, bpIdx) + description.slice(endIdx)).trim();
      }
    }
    if (!description) {
      description = `${owner}/${repo}${subpath ? '/' + subpath : ''} - 待補充描述`;
    }

    const category = guessCategory(description, meta.topics);
    // 處理基礎網址與安裝方式（需讀 repo 封裝檔，故為 async）
    const install = await detectInstall(rootUrl, meta.language, description, meta.topics);
    install.repoUrl = rootUrl;
    
    if (subpath) {
      install.method = 'git-clone-sparse';
      install.branch = branch;
      install.subpath = subpath;
    }

    // 決定名稱與 ID
    const baseName = subpath ? subpath.split('/').pop() : repo;

    const triggers = new Set([
      baseName.toLowerCase(),
      ...baseName.toLowerCase().split('-').filter(w => w.length > 2),
      ...(subpath ? [] : repo.toLowerCase().split('-').filter(w => w.length > 2)),
      ...meta.topics
    ]);

    const triggerList = Array.from(triggers).slice(0, 8);
    if (triggerList.length < 2) {
      triggerList.push(category.toLowerCase());
    }

    const toolEntry = {
      id: generateId(baseName),
      name: baseName.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      url: url.replace(/\/$/, ''),
      description,
      category,
      language: meta.language || 'other',
      triggers: triggerList,
      install,
      capabilities: meta.topics.slice(0, 5),
      useCase: truncateAtWord(description, 200),
      // ⚠️ advantages 是「語意欄位」——描述這個工具相對其他選擇的優勢。
      // 「歸入某領域」不是工具的優勢,「支援某語言」也不是(那是 install 的事)。
      // 先前填入這些只是為了消 validate 警告,反而污染了語意。
      // 留空 → 誠實地表示「此工具的優勢尚未查證」。
      advantages: [],
      negativeConstraints: [
        '初次收錄建議人工審查其最新版本文檔與依賴環境',
        '非通用型工具，請確認專案環境符合需求'
      ],
      addedAt: new Date().toISOString(),
      status: 'experimental'
    };

    if (!silent) {
      console.log(`\x1b[32m✓ 掃描成功\x1b[0m`);
      console.log(JSON.stringify(toolEntry, null, 2));
    }

    return toolEntry;
  } catch (err) {
    if (!silent) console.error(`\x1b[31m✗ 掃描失敗:\x1b[0m ${err.message}`);
    throw err;
  }
}

// 判斷是否直接執行
if (import.meta.url === `file://${process.argv[1]}`) {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    options: {
      json: { type: 'boolean', short: 'j' },
    },
    allowPositionals: true,
  });

  const url = positionals[0];
  if (!url) {
    console.error('用法: node scripts/scan-tool.js <github-url> [--json]');
    process.exit(1);
  }

  scan(url, { silent: values.json })
    .then(result => {
      if (values.json) {
        console.log(JSON.stringify(result, null, 2));
      }
    })
    .catch(() => process.exit(1));
}

export { scan, detectInstall, listRootFiles, parseRepoUrl, stripMarkdown, isBoilerplateParagraph, truncateAtWord };
