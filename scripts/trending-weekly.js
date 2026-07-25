/**
 * trending-weekly.js — GitHub 每週漲星數 Top 10 自動探勘與入庫腳本
 *
 * 運作流程：
 *   1. 從 star-snapshots.json 讀取上週快照
 *   2. 透過 GitHub Search API 搜尋多領域高星數 repos
 *   3. 批次取得即時 star 數並計算 delta (本週漲幅)
 *   4. 篩選前 10 名漲幅最大的工具
 *   5. 自動入庫至 registry/tools.json（去重）
 *   6. 寫入 registry/weekly-reports/YYYY-WXX.md 作為週報存查
 *   7. 更新 star-snapshots.json 供下次比對
 *
 * 使用：npm run trending   或   node scripts/trending-weekly.js
 * 環境變數：GITHUB_TOKEN（可選但強烈推薦，提升 API 限額至 30 req/min）
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// ─── 路徑常量 ──────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');
const REGISTRY_PATH = join(ROOT, 'registry', 'tools.json');
const SNAPSHOTS_PATH = join(ROOT, 'registry', 'star-snapshots.json');
const REPORTS_DIR = join(ROOT, 'registry', 'weekly-reports');

// ─── GitHub API 設定 ───────────────────────────────────────────────────

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
let authDropped = false;

function buildHeaders() {
  const h = {
    'User-Agent': 'Tool-Calling-Trending-Agent',
    'Accept': 'application/vnd.github.v3+json'
  };
  if (!authDropped && GITHUB_TOKEN && GITHUB_TOKEN.length > 10) {
    h['Authorization'] = `token ${GITHUB_TOKEN}`;
  }
  return h;
}

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── ISO 週次工具函式 (World Week: YYYY-WXX) ──────────────────────────

function getISOWeekString(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

// ─── 搜尋主題清單（覆蓋本工具庫的全部領域） ──────────────────────────

const SEARCH_QUERIES = [
  'ai agent stars:>1000 pushed:>WEEK_AGO',
  'llm framework stars:>1000 pushed:>WEEK_AGO',
  'developer tool stars:>2000 pushed:>WEEK_AGO',
  'automation workflow stars:>2000 pushed:>WEEK_AGO',
  'data analysis stars:>1000 pushed:>WEEK_AGO',
  'machine learning stars:>5000 pushed:>WEEK_AGO',
  'generative ai stars:>1000 pushed:>WEEK_AGO',
  'devops infrastructure stars:>3000 pushed:>WEEK_AGO',
  'ui component design stars:>3000 pushed:>WEEK_AGO',
  'cli tool stars:>2000 pushed:>WEEK_AGO',
];

// ─── 分類推斷（基於 topics / language / 描述進行規則推導） ────────────

const CATEGORY_RULES = [
  { match: /\b(llm|gpt|openai|gemini|claude|transformer|language.model)\b/i, cat: 'AI 代理' },
  { match: /\b(agent|autonomous|assistant|copilot|auto.gpt)\b/i, cat: 'AI 代理' },
  { match: /\b(data.analy|pandas|polars|duckdb|dataframe|eda|profil)\b/i, cat: '數據分析' },
  { match: /\b(frontend|ui|ux|component|design.system|tailwind|react)\b/i, cat: 'UI/UX設計' },
  { match: /\b(3d|cad|mesh|render|three\.?js|blender|opengl)\b/i, cat: '3D工程繪圖' },
  { match: /\b(test|cypress|playwright|selenium|e2e|ci.cd)\b/i, cat: '測試與自動化' },
  { match: /\b(browser|puppeteer|crawl|scrape|headless)\b/i, cat: '瀏覽器自動化' },
  { match: /\b(video|ffmpeg|stream|animation|movie)\b/i, cat: '影片' },
  { match: /\b(audio|music|tts|stt|speech|voice)\b/i, cat: '音訊' },
  { match: /\b(security|vuln|pentest|hack|owasp)\b/i, cat: '安全性' },
  { match: /\b(infra|docker|k8s|kubernetes|terraform|cloud)\b/i, cat: '基礎設施' },
  { match: /\b(api|rest|graphql|grpc|sdk|integration)\b/i, cat: 'API 整合' },
  { match: /\b(database|sql|nosql|postgres|mongo|redis)\b/i, cat: '資料庫' },
  { match: /\b(doc|pdf|markdown|notes|wiki|obsidian)\b/i, cat: '文件生產力' },
  { match: /\b(knowledge|graph|rag|retrieval|embedding)\b/i, cat: '知識管理' },
  { match: /\b(learn|tutorial|course|education|bootcamp)\b/i, cat: '學習資源' },
  { match: /\b(research|paper|arxiv|science|survey)\b/i, cat: '研究' },
  { match: /\b(image|diffusion|stablediffusion|midjourney|dalle|generation)\b/i, cat: '多媒體生成' },
  { match: /\b(market|seo|analytics|adverti)\b/i, cat: '行銷' },
];

function inferCategory(repo) {
  const text = `${repo.description || ''} ${(repo.topics || []).join(' ')} ${repo.name}`;
  for (const rule of CATEGORY_RULES) {
    if (rule.match.test(text)) return rule.cat;
  }
  return '開發工具';
}

// ─── GitHub Search API (含重試與退避策略) ─────────────────────────────

async function searchGitHub(query, retries = 3) {
  const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=50`;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { headers: buildHeaders(), signal: AbortSignal.timeout(15000) });
      if (res.status === 401) {
        if (!authDropped) {
          console.warn(`  ⚠ Token 無效 (401)，自動降級為無認證模式...`);
          authDropped = true;
          continue;
        }
        return [];
      }
      if (res.status === 403 || res.status === 429) {
        const waitSec = attempt * 30;
        console.warn(`  ⚠ Rate Limit (attempt ${attempt}/${retries}) — 等待 ${waitSec}s 後重試...`);
        await delay(waitSec * 1000);
        continue;
      }
      if (!res.ok) {
        console.warn(`  ⚠ HTTP ${res.status} for query, skipping.`);
        return [];
      }
      const data = await res.json();
      return data.items || [];
    } catch (err) {
      if (attempt < retries) {
        console.warn(`  ⚠ Network error (attempt ${attempt}/${retries}): ${err.message}`);
        await delay(5000 * attempt);
      }
    }
  }
  return [];
}

// ─── 主程式 ───────────────────────────────────────────────────────────

async function main() {
  const now = new Date();
  const worldWeek = getISOWeekString(now);
  const weekAgo = new Date(now.getTime() - 7 * 86400000);
  const weekAgoStr = weekAgo.toISOString().slice(0, 10);

  console.log(`\n\x1b[36m🔍 GitHub 每週漲星探勘 — ${worldWeek}\x1b[0m`);
  console.log(`   時間範圍：${weekAgoStr} ~ ${now.toISOString().slice(0, 10)}\n`);

  // 1. 讀取上週快照
  let prevSnapshot = {};
  if (existsSync(SNAPSHOTS_PATH)) {
    try {
      prevSnapshot = JSON.parse(readFileSync(SNAPSHOTS_PATH, 'utf-8'));
    } catch { /* ignore */ }
  }
  const hasPrevData = Object.keys(prevSnapshot).length > 0;

  // 2. 搜尋多領域熱門 repos（應用防禦門檻：排除 fork 與 stars < 5000）
  const MIN_STARS_THRESHOLD = 5000;
  const allRepos = new Map(); // fullName -> repo object
  let skippedForkCount = 0;
  let skippedLowStarCount = 0;

  for (let i = 0; i < SEARCH_QUERIES.length; i++) {
    const q = SEARCH_QUERIES[i].replace(/WEEK_AGO/g, weekAgoStr);
    console.log(`  [${i + 1}/${SEARCH_QUERIES.length}] 搜尋：${q.slice(0, 60)}...`);
    const items = await searchGitHub(q);
    for (const repo of items) {
      if (!repo.full_name) continue;
      // 防禦門檻 1: 排除 Fork 的 repository
      if (repo.fork) {
        skippedForkCount++;
        continue;
      }
      // 防禦門檻 2: 絕對 Star 門檻 >= 5000 (防止低品質或短時間刷星項目)
      if ((repo.stargazers_count || 0) < MIN_STARS_THRESHOLD) {
        skippedLowStarCount++;
        continue;
      }
      if (!allRepos.has(repo.full_name)) {
        allRepos.set(repo.full_name, repo);
      }
    }
    if (i < SEARCH_QUERIES.length - 1) await delay(GITHUB_TOKEN ? 2000 : 6000);
  }

  console.log(`\n  📦 共探勘到 ${allRepos.size} 個符合防禦門檻 (非 Fork 且 Stars ≥ 5,000) 的 repos (已過濾: ${skippedForkCount} 個 Fork, ${skippedLowStarCount} 個低於 5,000⭐)`);

  // 3. 計算每個 repo 的 star delta
  const rankedRepos = [];
  for (const [fullName, repo] of allRepos) {
    const currentStars = repo.stargazers_count || 0;
    const prevStars = prevSnapshot[fullName] || 0;
    const delta = hasPrevData ? (currentStars - prevStars) : currentStars;
    rankedRepos.push({ ...repo, currentStars, prevStars, delta });
  }

  // 4. 依 delta 降序排列，取前 10
  rankedRepos.sort((a, b) => b.delta - a.delta);
  const top10 = rankedRepos.slice(0, 10);

  console.log(`\n  🏆 本週漲星前 10 名：`);
  top10.forEach((r, i) => {
    const deltaStr = hasPrevData ? `+${r.delta.toLocaleString()}` : `${r.currentStars.toLocaleString()} (首次快照)`;
    console.log(`     ${i + 1}. ${r.full_name} — ⭐ ${r.currentStars.toLocaleString()} (${deltaStr})`);
  });

  // 5. 讀取現有 registry，自動入庫
  const registry = JSON.parse(readFileSync(REGISTRY_PATH, 'utf-8'));
  const existingUrls = new Set(registry.tools.map(t => t.url?.toLowerCase()));
  const existingIds = new Set(registry.tools.map(t => t.id));

  let addedCount = 0;
  const addedTools = [];

  for (const repo of top10) {
    const repoUrl = repo.html_url;
    if (existingUrls.has(repoUrl?.toLowerCase())) continue;

    // 二次硬防禦確認
    if (repo.fork || (repo.stargazers_count || 0) < MIN_STARS_THRESHOLD) continue;

    // 產生唯一 ID
    let toolId = repo.name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');
    if (existingIds.has(toolId)) toolId = `${toolId}-${repo.owner.login.toLowerCase().slice(0, 8)}`;
    if (existingIds.has(toolId)) continue;

    const category = inferCategory(repo);
    const topics = repo.topics || [];
    const triggers = [
      toolId,
      ...topics.slice(0, 5).filter(t => t.length > 2)
    ];

    const newTool = {
      id: toolId,
      name: repo.name,
      url: repoUrl,
      description: (repo.description || 'No description provided.').slice(0, 200),
      category,
      language: (repo.language || 'unknown').toLowerCase(),
      triggers,
      install: {
        method: 'none',
        repoUrl
      },
      capabilities: topics.slice(0, 6),
      useCase: `${repo.description || repo.name} — 本週漲星 +${repo.delta || repo.currentStars} (${worldWeek} 自動探勘入庫)。`,
      advantages: [
        `GitHub ⭐ ${repo.currentStars.toLocaleString()} 星，社群高度活躍`,
        `近期頻繁更新維護 (最後推送 ${repo.pushed_at?.slice(0, 10) || 'N/A'})`,
        `${worldWeek} 漲星探勘自動入庫`
      ],
      negativeConstraints: [
        '由自動化探勘入庫，建議人工審查確認適用場景後再正式啟用',
        '詳細安裝指令需依官方 README 為準'
      ],
      stars: repo.currentStars,
      addedAt: now.toISOString(),
      status: 'active'
    };

    registry.tools.push(newTool);
    existingIds.add(toolId);
    existingUrls.add(repoUrl.toLowerCase());
    addedCount++;
    addedTools.push({ rank: addedTools.length + 1, ...newTool, delta: repo.delta });
  }

  // 6. 更新 registry
  registry.lastUpdated = now.toISOString();
  writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2), 'utf-8');
  console.log(`\n  ✅ 新增 ${addedCount} 個工具入庫（現有庫存：${registry.tools.length} 個）`);

  // 7. 更新快照供下週比對
  const newSnapshot = {};
  for (const [fullName, repo] of allRepos) {
    newSnapshot[fullName] = repo.stargazers_count || 0;
  }
  // 保留舊快照中未被本次搜尋涵蓋的 repos（避免資料流失）
  for (const [k, v] of Object.entries(prevSnapshot)) {
    if (!newSnapshot[k]) newSnapshot[k] = v;
  }
  writeFileSync(SNAPSHOTS_PATH, JSON.stringify(newSnapshot, null, 2), 'utf-8');

  // 8. 生成週報 (World Week Format: YYYY-WXX)
  mkdirSync(REPORTS_DIR, { recursive: true });
  const reportPath = join(REPORTS_DIR, `${worldWeek}.md`);

  const reportLines = [
    `# 🏆 GitHub 每週漲星探勘報告 — ${worldWeek}`,
    '',
    `> 探勘時間：${now.toISOString()}`,
    `> 搜尋範圍：${weekAgoStr} ~ ${now.toISOString().slice(0, 10)}`,
    `> 探勘 repos 數量：${allRepos.size}`,
    `> 新增入庫數量：${addedCount}`,
    '',
    '## 🔥 本週漲星前 10 名',
    '',
    '| 排名 | 工具名稱 | GitHub Repo | 當前 Stars | 漲幅 | 分類 | 入庫狀態 |',
    '| :---: | :--- | :--- | ---: | ---: | :--- | :---: |',
  ];

  top10.forEach((r, i) => {
    const deltaStr = hasPrevData ? `+${r.delta.toLocaleString()}` : `首次快照`;
    const inRegistry = existingUrls.has(r.html_url?.toLowerCase()) ? '✅ 已入庫' : '⏭ 已存在';
    const wasAdded = addedTools.some(at => at.url === r.html_url);
    const status = wasAdded ? '🆕 本週新增' : inRegistry;
    reportLines.push(
      `| ${i + 1} | **${r.name}** | [${r.full_name}](${r.html_url}) | ${r.currentStars.toLocaleString()} | ${deltaStr} | ${inferCategory(r)} | ${status} |`
    );
  });

  if (addedTools.length > 0) {
    reportLines.push('', '## 🆕 本週新增入庫工具詳情', '');
    for (const t of addedTools) {
      reportLines.push(
        `### ${t.name}`,
        `- **ID**: \`${t.id}\``,
        `- **URL**: ${t.url}`,
        `- **分類**: ${t.category}`,
        `- **語言**: ${t.language}`,
        `- **Stars**: ⭐ ${t.stars.toLocaleString()}`,
        `- **推薦場景**: ${t.useCase}`,
        `- **禁用場景**: ${t.negativeConstraints.join(' / ')}`,
        ''
      );
    }
  }

  reportLines.push('', '---', `> 由 \`scripts/trending-weekly.js\` 自動生成`);

  writeFileSync(reportPath, reportLines.join('\n'), 'utf-8');
  console.log(`  📝 週報已寫入：${reportPath}`);
  console.log(`\n\x1b[32m[完成] ${worldWeek} 每週漲星探勘作業結束！\x1b[0m\n`);
}

main().catch((err) => {
  console.error('[Error] Trending weekly scan failed:', err);
  process.exit(1);
});
