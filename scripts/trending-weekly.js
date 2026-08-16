/**
 * trending-weekly.js — GitHub 每週漲星數 Top 10 自動探勘與入庫腳本（v6 雙週展示版）
 * 
 * 核心規範：
 *   - 嚴格遵守 ISO-8601 World Week 國際標準（週一至週日），杜絕時區偏差
 *   - 單一資料事實來源 (Single Source of Truth)，快照與每週排行榜時間對齊
 *   - 雙週輸出：lastWeek（上週完整，列入入庫判斷）+ currentWeekToDate（本週迄今，不列入）
 *   - 限制搜尋請求頻率，支援匿名與 Token 自動切換
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { buildTrackedRepos, getTrackedRepos } from './tracked-repos.js';
import { getCurrentWorldWeek, getPreviousWorldWeek, getWeekRangeFromWeekStr } from '../core/world-week.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const REGISTRY_PATH = join(ROOT, 'registry', 'tools.json');
const SNAPSHOTS_PATH = join(ROOT, 'registry', 'star-snapshots.json');
const REPORTS_DIR = join(ROOT, 'registry', 'weekly-reports');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
let authDropped = false;

// ──────────────────────────────────────────────
// 基礎工具函式
// ──────────────────────────────────────────────

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

function formatDateTime(date) { return date.toISOString().replace('T', ' ').slice(0, 19) + ' UTC'; }

// ──────────────────────────────────────────────
// MECE 分類規則
// ──────────────────────────────────────────────

const CATEGORY_RULES = [
  { match: /\b(llm|gpt|openai|gemini|claude|transformer|language.model)\b/i, cat: 'AI 框架' },
  { match: /\b(agent|autonomous|assistant|copilot|auto\.?gpt)\b/i, cat: 'AI 代理' },
  { match: /\b(data.analy|pandas|polars|duckdb|dataframe|eda|profil)\b/i, cat: '數據分析' },
  { match: /\b(frontend|ui|ux|component|design\.?system|tailwind|react)\b/i, cat: 'UI/UX設計' },
  { match: /\b(3d|cad|mesh|render|three\.?js|blender|opengl)\b/i, cat: '3D工程繪圖' },
  { match: /\b(test|cypress|playwright|selenium|e2e|ci\.?cd|tdd)\b/i, cat: '測試與自動化' },
  { match: /\b(browser|puppeteer|crawl|scrape|headless)\b/i, cat: '瀏覽器自動化' },
  { match: /\b(video|ffmpeg|stream|animation|movie)\b/i, cat: '影片' },
  { match: /\b(audio|music|tts|stt|speech|voice|whisper)\b/i, cat: '音訊' },
  { match: /\b(security|vuln|pentest|hack|owasp|cryptography)\b/i, cat: '安全性' },
  { match: /\b(infra|docker|k8s|kubernetes|terraform|cloud)\b/i, cat: '基礎設施' },
  { match: /\b(api|rest|graphql|grpc|sdk|integration)\b/i, cat: 'API 整合' },
  { match: /\b(database|sql|nosql|postgres|mongo|redis)\b/i, cat: '資料庫' },
  { match: /\b(doc|pdf|markdown|notes|wiki|obsidian|ppt|office)\b/i, cat: '文件生產力' },
  { match: /\b(knowledge|graph|rag|retrieval|embedding)\b/i, cat: '知識管理' },
  { match: /\b(learn|tutorial|course|education|bootcamp|roadmap)\b/i, cat: '學習資源' },
  { match: /\b(research|paper|arxiv|science|survey|awesome)\b/i, cat: '研究' },
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

// ──────────────────────────────────────────────
// GitHub Search API
// ──────────────────────────────────────────────

async function searchGitHub(query, maxResults = 100, retries = 2) {
  const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=${maxResults}`;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { headers: buildHeaders(), signal: AbortSignal.timeout(15000) });
      if (res.status === 401) {
        console.warn('  ⚠ GITHUB_TOKEN 無效 (401 Bad Credentials)，降級使用匿名公開模式...');
        authDropped = true;
        continue;
      }
      if (res.status === 403 || res.status === 429) {
        const waitSec = attempt * 30;
        console.warn(`  ⚠ Rate Limit — 等待 ${waitSec}s...`);
        await delay(waitSec * 1000);
        continue;
      }
      if (!res.ok) return [];
      const data = await res.json();
      return data.items || [];
    } catch (err) {
      if (attempt < retries) await delay(5000 * attempt);
    }
  }
  return [];
}

// ──────────────────────────────────────────────
// 載入歷史快照（合併所有週的數據）
// ──────────────────────────────────────────────

function loadAllSnapshotData() {
  if (!existsSync(SNAPSHOTS_PATH)) return { snapshots: [], lastUpdated: null, allRepos: {} };
  try {
    const snapshotData = JSON.parse(readFileSync(SNAPSHOTS_PATH, 'utf8'));
    const allRepos = {};
    if (Array.isArray(snapshotData.snapshots)) {
      for (const snap of snapshotData.snapshots) {
        if (snap.repos && typeof snap.repos === 'object') {
          Object.assign(allRepos, snap.repos);
        }
      }
    }
    return { ...snapshotData, allRepos };
  } catch { return { snapshots: [], lastUpdated: null, allRepos: {} }; }
}

function getSnapshotForWeek(weekStr, snapshotData) {
  if (!snapshotData || !Array.isArray(snapshotData.snapshots)) return null;
  return snapshotData.snapshots.find(s => s.week === weekStr);
}

function getLatestSnapshot(snapshotData) {
  if (!snapshotData || !Array.isArray(snapshotData.snapshots) || snapshotData.snapshots.length === 0) return null;
  return snapshotData.snapshots[snapshotData.snapshots.length - 1];
}

// ──────────────────────────────────────────────
// 共用排名計算函式
// ──────────────────────────────────────────────

/**
 * 依據基準快照與當前抓取的 repos，計算星數 delta 並排名。
 * @param {Map} reposMap - 當前抓取的 repos Map (fullName -> repo object)
 * @param {object} baselineSnapshot - 基準快照 {fullName: starCount}
 * @param {object} weekInfo - world-week.js 返回的週次資訊
 * @param {boolean} allowNewRepos - 是否允許近 30 天新建專案（無基線）進入排名
 * @returns {Array} 排序後的 repo 資訊陣列
 */
function computeRanking(reposMap, baselineSnapshot, weekInfo, allowNewRepos = true) {
  let filteredCount = 0;
  const rankedRepos = [];

  for (const [fullName, repo] of reposMap) {
    const currentStars = repo.stargazers_count || 0;
    let prevStars = baselineSnapshot[fullName] || 0;

    if (prevStars === 0 && allowNewRepos) {
      const createdAt = repo.created_at ? new Date(repo.created_at) : null;
      if (createdAt && (weekInfo.sunday.getTime() - createdAt.getTime()) <= 30 * 86400 * 1000) {
        prevStars = 0; // 近期新建專案，起點記為 0
      } else {
        continue; // 舊專案無基線紀錄則跳過
      }
    } else if (prevStars === 0) {
      continue;
    }

    const delta = currentStars - prevStars;

    // 過濾異常大增長（> 80% 增率，非新專案）
    if (prevStars > 0 && Math.abs(delta) > currentStars * 0.8) {
      filteredCount++;
      if (filteredCount <= 3) {
        console.warn(`   ⚠ 過濾異常 delta: ${fullName} (${prevStars.toLocaleString()} -> ${currentStars.toLocaleString()})`);
      }
      continue;
    }

    rankedRepos.push({
      fullName,
      name: repo.name,
      owner: repo.owner ? repo.owner.login : '',
      currentStars,
      prevStars,
      delta,
      description: repo.description,
      topics: repo.topics || [],
      language: repo.language,
      pushedAt: repo.pushed_at,
      html_url: repo.html_url,
      category: inferCategory(repo),
      startStarsAt: weekInfo.mondayStr,
      endStarsAt: weekInfo.sundayStr
    });
  }

  rankedRepos.sort((a, b) => b.delta - a.delta);
  return rankedRepos;
}

/**
 * 將排名結果格式化為 JSON 輸出格式
 */
function formatRankedItems(rankedRepos, existingUrls, addedToolsSet) {
  return rankedRepos.slice(0, 20).map((r, i) => {
    const wasAdded = addedToolsSet ? addedToolsSet.has(r.html_url) : false;
    const inRegistry = existingUrls.has(r.html_url?.toLowerCase());
    return {
      rank: i + 1,
      name: r.name,
      fullName: r.fullName,
      url: r.html_url,
      description: r.description || '',
      currentStars: r.currentStars,
      prevStars: r.prevStars,
      delta: r.delta,
      category: r.category,
      isNewlyAdded: wasAdded,
      inRegistry,
      statusText: wasAdded ? '🆕 本週納入' : (inRegistry ? '✅ 已在工具箱' : '⏭ 首次記錄'),
      startStarsAt: r.startStarsAt,
      endStarsAt: r.endStarsAt
    };
  });
}

// ──────────────────────────────────────────────
// 主流程
// ──────────────────────────────────────────────

export async function discoverTrendingTools() {
  const now = new Date();

  // ISO-8601 World Week 計算
  // currentWeekInfo = 本週 (進行中, e.g. W33: 08-10 ~ 08-16)
  // prevWeekInfo    = 上週 (已完結, e.g. W32: 08-03 ~ 08-09)
  const currentWeekInfo = getCurrentWorldWeek(now);
  const prevWeekInfo = getPreviousWorldWeek(now);

  const currentWeekStr = currentWeekInfo.weekStr;
  const prevWeekStr = prevWeekInfo.weekStr;

  // 今天的日期字串，用於「本週迄今」的結束點顯示
  const todayStr = now.toISOString().slice(0, 10);

  console.log(`\n🔍 GitHub 每週漲星探勘 (ISO-8601 World Week)`);
  console.log(`   上週 (已完結)：${prevWeekInfo.dateRange}  (${prevWeekStr})`);
  console.log(`   本週 (進行中)：${currentWeekInfo.mondayStr} ~ ${todayStr}  (${currentWeekStr})\n`);

  // Step 1: 建立追蹤池
  console.log('📋 Step 1: 初始化追蹤池...');
  buildTrackedRepos();
  const trackedData = getTrackedRepos();
  const trackedCount = Object.keys(trackedData).filter(k => !k.startsWith('_')).length;

  // Step 2: 載入歷史快照（合併所有週）
  console.log('📊 Step 2: 載入歷史快照...');
  const snapshotData = loadAllSnapshotData();
  const allHistoricalRepos = snapshotData.allRepos || {};

  // 上上週快照 → 作為「上週完整數據」的基準線
  const prevPrevWeekInfo = getPreviousWorldWeek(prevWeekInfo.monday);
  const prevPrevWeekStr = prevPrevWeekInfo.weekStr;
  const baselineForLastWeek =
    getSnapshotForWeek(prevPrevWeekStr, snapshotData)?.repos ||
    getSnapshotForWeek(prevWeekStr, snapshotData)?.repos ||
    getLatestSnapshot(snapshotData)?.repos ||
    allHistoricalRepos;

  // 上週快照 → 作為「本週迄今」的基準線（週一開始時的狀態）
  const baselineForCurrentWeek =
    getSnapshotForWeek(prevWeekStr, snapshotData)?.repos ||
    getLatestSnapshot(snapshotData)?.repos ||
    allHistoricalRepos;

  console.log(`   上週基準 (${prevPrevWeekStr})：${Object.keys(baselineForLastWeek).length} 個 repos`);
  console.log(`   本週基準 (${prevWeekStr})：${Object.keys(baselineForCurrentWeek).length} 個 repos`);
  console.log(`   歷史總計 ${Object.keys(allHistoricalRepos).length} 個 unique repos\n`);

  // Step 3: 搜尋熱門 repos
  console.log('🔎 Step 3: 搜尋熱門與新銳暴漲 repos...');

  const thirtyDaysAgo = new Date(currentWeekInfo.monday);
  thirtyDaysAgo.setUTCDate(thirtyDaysAgo.getUTCDate() - 30);
  const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().slice(0, 10);

  const SEARCH_QUERIES = [
    `created:>${thirtyDaysAgoStr} stars:>20`,
    `pushed:>${currentWeekInfo.mondayStr} stars:>500`,
    'stars:>50000',
    'stars:>20000',
    'stars:>5000',
    'stars:>2000'
  ];

  const liveRepos = new Map();

  for (let i = 0; i < SEARCH_QUERIES.length; i++) {
    const q = SEARCH_QUERIES[i];
    console.log(`  [${i + 1}/${SEARCH_QUERIES.length}] ${q}`);
    const items = await searchGitHub(q, 100);
    for (const repo of items) {
      if (!repo.full_name || repo.fork) continue;
      if (!liveRepos.has(repo.full_name)) liveRepos.set(repo.full_name, repo);
    }
    console.log(`    → 目前共 ${liveRepos.size} 個唯一 repos`);
    if (i < SEARCH_QUERIES.length - 1) await delay(2000);
  }

  console.log(`\n   搜尋共獲得 ${liveRepos.size} 個 repos\n`);

  // Step 4a: 計算「上週完整數據」排名（基準：上上週末 → 當前即時星數，代表上週累積）
  // 說明：腳本上週執行時已抓上週末數據存入快照，現在用「上上週」基線對比「上週末快照」
  // 但為了簡化（避免需要兩次API呼叫），我們用「上週末快照」 vs「上上週快照」計算正式的上週delta
  console.log('📊 Step 4a: 計算上週完整數據排名（正式，列入入庫判斷）...');
  const prevWeekSnap = getSnapshotForWeek(prevWeekStr, snapshotData);
  let lastWeekRanked;
  if (prevWeekSnap?.repos && Object.keys(prevWeekSnap.repos).length > 0) {
    // 理想路徑：上週快照存在，用「上上週快照 vs 上週快照」計算純上週 delta
    const lastWeekReposMap = new Map(
      Object.entries(prevWeekSnap.repos).map(([name, stars]) => [
        name,
        { full_name: name, stargazers_count: stars, name: name.split('/')[1] || name,
          owner: { login: name.split('/')[0] }, fork: false,
          description: liveRepos.get(name)?.description || '',
          topics: liveRepos.get(name)?.topics || [],
          language: liveRepos.get(name)?.language || null,
          pushed_at: liveRepos.get(name)?.pushed_at || null,
          html_url: `https://github.com/${name}`,
          created_at: liveRepos.get(name)?.created_at || null }
      ])
    );
    lastWeekRanked = computeRanking(lastWeekReposMap, baselineForLastWeek, prevWeekInfo, false);
    console.log(`   使用上週快照 (${prevWeekStr}) vs 基準 (${prevPrevWeekStr})，計算純上週增量`);
  } else {
    // 退化路徑：上週快照不存在，改用 live repos vs 上週基線估算
    lastWeekRanked = computeRanking(liveRepos, baselineForLastWeek, prevWeekInfo, true);
    console.log(`   ⚠ 上週快照不存在，改用即時數據估算上週排名`);
  }
  const lastWeekTop20 = lastWeekRanked.slice(0, 20);
  console.log(`   上週排名計算完成，共 ${lastWeekRanked.length} 個有效 repos\n`);

  // Step 4b: 計算「本週迄今」排名（基準：上週末快照 → 今日即時星數，不列入入庫）
  console.log('📊 Step 4b: 計算本週迄今數據排名（進行中，不列入入庫判斷）...');
  const currentWeekRanked = computeRanking(liveRepos, baselineForCurrentWeek, currentWeekInfo, true);
  const currentWeekTop20 = currentWeekRanked.slice(0, 20);
  console.log(`   本週迄今計算完成，共 ${currentWeekRanked.length} 個有效 repos\n`);

  // 印出上週前 10 名
  console.log(`🏆 上週漲星前 10 名 (${prevWeekStr})：`);
  if (lastWeekTop20.length === 0) {
    console.log('   （無正增長記錄）');
  } else {
    lastWeekTop20.slice(0, 10).forEach((r, i) => {
      const prevDisplay = r.prevStars > 0 ? r.prevStars.toLocaleString() : '首次';
      const deltaStr = r.delta > 0 ? `+${r.delta.toLocaleString()}` : r.delta.toLocaleString();
      console.log(`  ${i + 1}. ${r.fullName}  ⭐ ${r.currentStars.toLocaleString()} (起: ${prevDisplay}, 漲: ${deltaStr})`);
    });
  }

  // Step 5: 自動入庫（僅依據上週完整數據判斷）
  console.log('\n📦 Step 5: 自動入庫檢查（依上週完整數據）...');
  const registry = JSON.parse(readFileSync(REGISTRY_PATH, 'utf8'));
  const existingUrls = new Set(registry.tools.map(t => t.url?.toLowerCase()));
  const existingIds = new Set(registry.tools.map(t => t.id));

  let addedCount = 0;
  const addedToolUrls = new Set();
  const addedTools = [];

  for (const repo of lastWeekTop20) {
    const repoUrl = repo.html_url;
    if (existingUrls.has(repoUrl?.toLowerCase())) continue;
    if (repo.delta <= 0) continue;

    let toolId = repo.name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');
    if (existingIds.has(toolId)) toolId = `${toolId}-${repo.owner.toLowerCase().slice(0, 8)}`;
    if (existingIds.has(toolId)) continue;

    const newTool = {
      id: toolId,
      name: repo.name,
      url: repoUrl,
      description: (repo.description || 'No description provided.').slice(0, 200),
      category: repo.category,
      language: (repo.language || 'unknown').toLowerCase(),
      triggers: [toolId, ...(repo.topics?.slice(0, 5) || [])],
      install: { method: 'none', repoUrl },
      capabilities: repo.topics?.slice(0, 6) || [],
      useCase: `${repo.description || repo.name} — 上週漲星 +${repo.delta} (${prevWeekStr} 自動探勘入庫)。`,
      advantages: [
        `GitHub ⭐ ${repo.currentStars.toLocaleString()} 星`,
        `上週漲星 +${repo.delta}`,
        `${prevWeekStr} 自動探勘入庫`
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
    addedToolUrls.add(repoUrl);
    addedTools.push({ ...newTool, delta: repo.delta });

    if (trackedData[repo.fullName]) {
      trackedData[repo.fullName].addedAt = now.toISOString();
      trackedData[repo.fullName].status = 'in_registry';
    }
  }

  registry.lastUpdated = now.toISOString();
  writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2), 'utf8');
  console.log(`   ✅ 新增 ${addedCount} 個工具入庫（現有庫存：${registry.tools.length} 個）\n`);

  // Step 6: 更新歷史快照（存本週即時數據，作為下次執行的「上週基準線」）
  console.log('📸 Step 6: 更新歷史快照...');

  const currentSnapshot = {};
  for (const [fullName, repo] of liveRepos) {
    currentSnapshot[fullName] = repo.stargazers_count || 0;
  }

  let snapshotFileData = { lastUpdated: now.toISOString(), snapshots: [] };
  if (existsSync(SNAPSHOTS_PATH)) {
    try {
      const parsed = JSON.parse(readFileSync(SNAPSHOTS_PATH, 'utf8'));
      if (Array.isArray(parsed.snapshots)) snapshotFileData.snapshots = parsed.snapshots;
    } catch { /* ignore */ }
  }

  // 去重：移除同週的舊快照
  snapshotFileData.snapshots = snapshotFileData.snapshots.filter(s => s.week !== currentWeekStr);

  const mergedSnapshot = { ...allHistoricalRepos, ...currentSnapshot };

  snapshotFileData.snapshots.push({
    week: currentWeekStr,
    dateRange: `${currentWeekInfo.mondayStr} ~ ${todayStr}`,
    timestamp: now.toISOString(),
    repos: mergedSnapshot
  });

  snapshotFileData.lastUpdated = now.toISOString();
  writeFileSync(SNAPSHOTS_PATH, JSON.stringify(snapshotFileData, null, 2), 'utf8');
  console.log(`   快照已更新（共 ${snapshotFileData.snapshots.length} 週歷史，${Object.keys(mergedSnapshot).length} 個 repos）\n`);

  // Step 7: 寫入追蹤池
  trackedData.lastGenerated = now.toISOString();
  writeFileSync(join(ROOT, 'registry', 'tracked-repos.json'), JSON.stringify(trackedData, null, 2), 'utf8');

  // Step 8: 生成週報（以上週完整數據為主）
  console.log('📝 Step 8: 生成週報...');
  mkdirSync(REPORTS_DIR, { recursive: true });
  const reportPath = join(REPORTS_DIR, `${prevWeekStr}.md`);

  const reportLines = [
    `# 🏆 GitHub 每週漲星探勘報告 — ${prevWeekStr}`,
    '',
    `> **統計區間**：${prevWeekInfo.dateRange} (ISO-8601 World Week)`,
    `> **統計時間**：${formatDateTime(prevWeekInfo.monday)} ~ ${formatDateTime(prevWeekInfo.sunday)}`,
    `> **探勘時間**：${now.toISOString()}`,
    `> **追蹤池大小**：${trackedCount}`,
    `> **搜尋 repos 數**：${liveRepos.size}`,
    `> **歷史快照覆蓋率**：${Object.keys(mergedSnapshot).length} 個 repos`,
    `> **新增入庫數量**：${addedCount}`,
    '',
    '## 🔥 上週漲星前 10 名',
    '',
    '| 排名 | 工具名稱 | GitHub Repo | 起點 Stars | 終點 Stars | 漲幅 | 分類 | 入庫狀態 |',
    '| :---: | :--- | :--- | ---: | ---: | ---: | :--- | :---: |',
  ];

  lastWeekTop20.slice(0, 10).forEach((r, i) => {
    const prevDisplay = r.prevStars > 0 ? r.prevStars.toLocaleString() : '首次';
    const currDisplay = r.currentStars.toLocaleString();
    const deltaStr = r.delta > 0 ? `+${r.delta.toLocaleString()}` : (r.delta < 0 ? r.delta.toLocaleString() : '持平');
    const wasAdded = addedToolUrls.has(r.html_url);
    const inRegistry = existingUrls.has(r.html_url?.toLowerCase());
    const status = wasAdded ? '🆕 本次新增' : (inRegistry ? '✅ 已在工具箱' : '⏭ 未入庫');
    reportLines.push(
      `| ${i + 1} | **${r.name}** | [${r.fullName}](https://github.com/${r.fullName}) | ${prevDisplay} | ${currDisplay} | ${deltaStr} | ${r.category} | ${status} |`
    );
  });

  reportLines.push('', '---', `> 由 \`scripts/trending-weekly.js\` 自動生成（遵循 ISO-8601 World Week 國際標準）`);

  writeFileSync(reportPath, reportLines.join('\n'), 'utf8');
  console.log(`   週報已寫入：${reportPath}\n`);

  // Step 9: 生成雙週 JSON 數據檔
  console.log('📊 Step 9: 生成雙週 JSON 數據...');
  const jsonPath = join(ROOT, 'registry', 'weekly-trending.json');

  const lastWeekFormattedItems = formatRankedItems(lastWeekTop20, existingUrls, addedToolUrls);
  const currentWeekFormattedItems = formatRankedItems(currentWeekTop20, existingUrls, null);

  const trendingData = {
    // 頂層保留向後相容欄位（指向上週，正式數據）
    worldWeek: prevWeekStr,
    lastUpdated: now.toISOString(),
    dateRange: prevWeekInfo.dateRange,
    statPeriod: { start: prevWeekInfo.monday.toISOString(), end: prevWeekInfo.sunday.toISOString() },
    scanTime: now.toISOString(),
    trackedPoolSize: trackedCount,
    activeReposCount: liveRepos.size,
    scannedReposCount: liveRepos.size,
    historicalCoverage: Object.keys(mergedSnapshot).length,
    newlyAddedCount: addedCount,
    // 向後相容：top10/top20 指向上週正式數據
    top10: lastWeekFormattedItems.slice(0, 10),
    top20: lastWeekFormattedItems,

    // ── 新增：雙週結構化欄位 ──
    lastWeek: {
      weekStr: prevWeekStr,
      dateRange: prevWeekInfo.dateRange,
      isComplete: true,
      note: '上週完整數據，列入工具箱納入判斷',
      newlyAddedCount: addedCount,
      top10: lastWeekFormattedItems.slice(0, 10),
      top20: lastWeekFormattedItems
    },
    currentWeekToDate: {
      weekStr: currentWeekStr,
      dateRange: `${currentWeekInfo.mondayStr} ~ ${todayStr}`,
      isComplete: false,
      note: '本週統計進行中，不列入工具箱納入判斷',
      asOfDate: todayStr,
      top10: currentWeekFormattedItems.slice(0, 10),
      top20: currentWeekFormattedItems
    }
  };

  writeFileSync(jsonPath, JSON.stringify(trendingData, null, 2), 'utf8');
  console.log(`   JSON 數據已寫入：${jsonPath}`);
  console.log(`   └─ lastWeek: ${prevWeekStr} (${prevWeekInfo.dateRange}) — 正式，入庫判斷有效`);
  console.log(`   └─ currentWeekToDate: ${currentWeekStr} (${currentWeekInfo.mondayStr} ~ ${todayStr}) — 進行中，不入庫\n`);

  console.log(`✅ [完成] 每週漲星探勘作業結束！\n`);
}

// 直接執行時自動啟動；被 cli.js 動態 import（discover-trending 命令）時僅提供函式，不觸發掃描
const isDirectRun = typeof process.argv[1] === 'string' && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
  discoverTrendingTools().catch((err) => {
    console.error('[Error] Trending weekly scan failed:', err);
    process.exit(1);
  });
}
