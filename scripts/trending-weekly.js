/**
 * trending-weekly.js — GitHub 每週漲星數 Top 10 自動探勘與入庫腳本（v4 正確版）
 * 
 * 核心修正：
 *   - 不再用 pushed: 過濾，確保每週搜尋相同的 repos 集合
 *   - 增加搜尋範圍（stars:>500, stars:>200）以匹配歷史快照的覆盖率
 *   - 合併多週快照數據計算準確 delta
 *   - 限制單次搜尋結果數量，避免 API 限流
 * 
 * API 用量預估：~6 次 search 請求/週，完全不會觸發限流
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { buildTrackedRepos, getTrackedRepos } from './tracked-repos.js';

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

function getISOWeekString(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

function getTargetWeek(now = new Date()) {
  const d = new Date(now);
  const isoDay = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() - (isoDay + 5));
  d.setUTCHours(0, 0, 0, 0);
  const monday = d;
  const sunday = new Date(monday);
  sunday.setUTCDate(sunday.getUTCDate() + 6);
  return { monday, sunday, isoWeek: getISOWeekString(monday) };
}

function getLastWeekRange(now = new Date()) {
  const d = new Date(now);
  const isoDay = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() - (isoDay + 12));
  d.setUTCHours(0, 0, 0, 0);
  const lastMonday = d;
  const lastSunday = new Date(d);
  lastSunday.setUTCDate(lastSunday.getUTCDate() + 6);
  return {
    monday: lastMonday,
    sunday: lastSunday,
    mondayStr: lastMonday.toISOString().slice(0, 10),
    sundayStr: lastSunday.toISOString().slice(0, 10)
  };
}

function formatDate(date) { return date.toISOString().slice(0, 10); }
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
    // 合併所有週的 repo 數據
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
// 主流程
// ──────────────────────────────────────────────

export async function discoverTrendingTools() {
  const now = new Date();
  const { monday: targetMonday, sunday: targetSunday, isoWeek: targetWeek } = getTargetWeek(now);
  const lastWeekRange = getLastWeekRange(now);
  const lastWeekStr = getISOWeekString(lastWeekRange.monday);

  const targetMondayStr = targetMonday.toISOString().slice(0, 10);
  const targetSundayStr = targetSunday.toISOString().slice(0, 10);
  const lastMondayStr = lastWeekRange.monday.toISOString().slice(0, 10);
  const lastSundayStr = lastWeekRange.sunday.toISOString().slice(0, 10);

  console.log(`\n🔍 GitHub 每週漲星探勘 — ${targetWeek}`);
  console.log(`   本週區間：${targetMondayStr} ~ ${targetSundayStr}`);
  console.log(`   上週區間：${lastMondayStr} ~ ${lastSundayStr}\n`);

  // Step 1: 建立追蹤池
  console.log('📋 Step 1: 初始化追蹤池...');
  buildTrackedRepos();
  const trackedData = getTrackedRepos();
  const trackedCount = Object.keys(trackedData).filter(k => !k.startsWith('_')).length;

  // Step 2: 載入歷史快照（合併所有週）
  console.log('📊 Step 2: 載入歷史快照...');
  const snapshotData = loadAllSnapshotData();
  const allHistoricalRepos = snapshotData.allRepos || {};
  const lastWeekSnap = getSnapshotForWeek(lastWeekStr, snapshotData) || getLatestSnapshot(snapshotData);
  
  if (lastWeekSnap) {
    console.log(`   找到上週 (${lastWeekStr}) 快照，包含 ${Object.keys(lastWeekSnap.repos).length} 個 repos`);
  } else {
    console.log('   ⚠ 未找到上週快照，將使用最新可用快照');
  }
  console.log(`   歷史總計 ${Object.keys(allHistoricalRepos).length} 個 unique repos\n`);

  // Step 3: 搜尋熱門 repos（包含近期新建專案與活躍專案）
  console.log('🔎 Step 3: 搜尋熱門與新銳暴漲 repos...');
  
  const thirtyDaysAgo = new Date(targetMonday);
  thirtyDaysAgo.setUTCDate(thirtyDaysAgo.getUTCDate() - 30);
  const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().slice(0, 10);

  const SEARCH_QUERIES = [
    `created:>${thirtyDaysAgoStr} stars:>20`, // 近 30 天內新建暴爆新星
    `pushed:>${targetMondayStr} stars:>500`,   // 當週高活躍專案
    'stars:>50000',                            // 超熱門基線
    'stars:>20000',                            // 熱門基線
    'stars:>5000',                             // 中等熱門
    'stars:>2000'                              // 入門熱門
  ];

  const thisWeekRepos = new Map();
  
  for (let i = 0; i < SEARCH_QUERIES.length; i++) {
    const q = SEARCH_QUERIES[i];
    console.log(`  [${i + 1}/${SEARCH_QUERIES.length}] ${q}`);
    const items = await searchGitHub(q, 100);
    
    for (const repo of items) {
      if (!repo.full_name || repo.fork) continue;
      if (!thisWeekRepos.has(repo.full_name)) {
        thisWeekRepos.set(repo.full_name, repo);
      }
    }
    console.log(`    → 目前共 ${thisWeekRepos.size} 個唯一 repos`);
    
    if (i < SEARCH_QUERIES.length - 1) await delay(2000);
  }

  console.log(`\n   本週搜尋到熱門 repos: ${thisWeekRepos.size} 個\n`);

  // Step 4: 計算 star delta
  // 優先使用上週快照數據，若無則使用歷史數據
  console.log('📊 Step 4: 計算 star delta...');
  const prevSnapshot = lastWeekSnap?.repos || allHistoricalRepos;
  
  // 驗證數據一致性
  const commonRepos = Object.keys(prevSnapshot).filter(k => thisWeekRepos.has(k));
  console.log(`   兩週共 ${commonRepos.length} 個重疊 repos`);
  
  let validReposCount = 0;
  let filteredCount = 0;
  
  const rankedRepos = [];
  
  for (const [fullName, repo] of thisWeekRepos) {
    const currentStars = repo.stargazers_count || 0;
    let prevStars = prevSnapshot[fullName] || 0;
    
    // 如果前週沒有數據，檢查是否為近 30 天內創立之專案
    if (prevStars === 0) {
      const createdAt = repo.created_at ? new Date(repo.created_at) : null;
      if (createdAt && (targetSunday.getTime() - createdAt.getTime()) <= 30 * 86400 * 1000) {
        prevStars = 0; // 近期新建專案起點記為 0 星，計算完整漲幅
      } else {
        continue; // 創立已久的舊專案若無基線紀錄則跳過
      }
    }
    
    const delta = currentStars - prevStars;
    
    // 對非新專案 (prevStars > 0) 過濾異常大增長（> 80% 增率）
    if (prevStars > 0 && Math.abs(delta) > currentStars * 0.8) {
      filteredCount++;
      if (filteredCount <= 3) {
        console.warn(`   ⚠ 過濾異常 delta: ${fullName} (${prevStars.toLocaleString()} -> ${currentStars.toLocaleString()}, delta: ${delta > 0 ? '+' : ''}${delta.toLocaleString()})`);
      }
      continue;
    }
    
    validReposCount++;
    
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
      startStarsAt: lastSundayStr,
      endStarsAt: targetSundayStr
    });
  }

  // 按 delta 排序（取前 20）
  rankedRepos.sort((a, b) => b.delta - a.delta);
  const top20 = rankedRepos.slice(0, 20);

  console.log('\n🏆 本週漲星前 20 名：');
  if (top20.length === 0) {
    console.log('   （無正增長記錄）');
  } else {
    top20.forEach((r, i) => {
      const prevDisplay = r.prevStars > 0 ? r.prevStars.toLocaleString() : '首次';
      const currDisplay = r.currentStars.toLocaleString();
      const deltaStr = r.delta > 0 ? `+${r.delta.toLocaleString()}` : (r.delta < 0 ? r.delta.toLocaleString() : '持平');
      console.log(`  ${i + 1}. ${r.fullName}`);
      console.log(`     ⭐ ${currDisplay} (起: ${prevDisplay}, 漲: ${deltaStr})`);
    });
  }

  // Step 5: 自動入庫
  console.log('\n📦 Step 5: 自動入庫檢查...');
  const registry = JSON.parse(readFileSync(REGISTRY_PATH, 'utf8'));
  const existingUrls = new Set(registry.tools.map(t => t.url?.toLowerCase()));
  const existingIds = new Set(registry.tools.map(t => t.id));

  let addedCount = 0;
  const addedTools = [];

  // 優先入庫：top20中尚未入庫且delta>0的
  for (const repo of top20) {
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
      useCase: `${repo.description || repo.name} — 本週漲星 +${repo.delta} (${targetWeek} 自動探勘入庫)。`,
      advantages: [
        `GitHub ⭐ ${repo.currentStars.toLocaleString()} 星`,
        `本週漲星 +${repo.delta}`,
        `${targetWeek} 自動探勘入庫`
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
    addedTools.push({ ...newTool, delta: repo.delta });
    
    if (trackedData[repo.fullName]) {
      trackedData[repo.fullName].addedAt = now.toISOString();
      trackedData[repo.fullName].status = 'in_registry';
    }
  }

  registry.lastUpdated = now.toISOString();
  writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2), 'utf8');
  console.log(`   ✅ 新增 ${addedCount} 個工具入庫（現有庫存：${registry.tools.length} 個）\n`);

  // Step 6: 更新快照（合併當前數據到歷史）
  console.log('📸 Step 6: 更新歷史快照...');
  
  const currentSnapshot = {};
  for (const [fullName, repo] of thisWeekRepos) {
    currentSnapshot[fullName] = repo.stargazers_count || 0;
  }
  
  let snapshotFileData = { snapshots: [], lastUpdated: now.toISOString() };
  if (existsSync(SNAPSHOTS_PATH)) {
    try {
      snapshotFileData = JSON.parse(readFileSync(SNAPSHOTS_PATH, 'utf8'));
      if (!Array.isArray(snapshotFileData.snapshots)) {
        snapshotFileData.snapshots = [];
      }
    } catch { /* ignore */ }
  }
  
  // 去重：移除同週的舊快照
  snapshotFileData.snapshots = snapshotFileData.snapshots.filter(s => s.week !== targetWeek);
  
  // 使用合併後的數據（包含歷史所有 repos）
  const mergedSnapshot = { ...allHistoricalRepos, ...currentSnapshot };
  
  snapshotFileData.snapshots.push({
    week: targetWeek,
    dateRange: `${targetMondayStr} ~ ${targetSundayStr}`,
    timestamp: targetSunday.toISOString(),
    repos: mergedSnapshot
  });
  
  snapshotFileData.lastUpdated = now.toISOString();
  writeFileSync(SNAPSHOTS_PATH, JSON.stringify(snapshotFileData, null, 2), 'utf8');
  console.log(`   快照已更新（共 ${snapshotFileData.snapshots.length} 週歷史，當前 ${Object.keys(mergedSnapshot).length} 個 repos）\n`);

  // Step 7: 寫入追蹤池
  trackedData.lastGenerated = now.toISOString();
  writeFileSync(join(ROOT, 'registry', 'tracked-repos.json'), JSON.stringify(trackedData, null, 2), 'utf8');

  // Step 8: 生成週報
  console.log('📝 Step 7: 生成週報...');
  mkdirSync(REPORTS_DIR, { recursive: true });
  const reportPath = join(REPORTS_DIR, `${targetWeek}.md`);

  const reportLines = [
    `# 🏆 GitHub 每週漲星探勘報告 — ${targetWeek}`,
    '',
    `> **統計區間**：${targetMondayStr} ~ ${targetSundayStr}`,
    `> **統計時間**：${formatDateTime(targetMonday)} ~ ${formatDateTime(targetSunday)}`,
    `> **探勘時間**：${now.toISOString()}`,
    `> **追蹤池大小**：${trackedCount}`,
    `> **本週搜尋 repos 數**：${thisWeekRepos.size}`,
    `> **歷史快照覆盖率**：${Object.keys(mergedSnapshot).length} 個 repos`,
    `> **新增入庫數量**：${addedCount}`,
    '',
    '## 🔥 本週漲星前 10 名',
    '',
    '| 排名 | 工具名稱 | GitHub Repo | 起點 Stars | 終點 Stars | 漲幅 | 分類 | 入庫狀態 |',
    '| :---: | :--- | :--- | ---: | ---: | ---: | :--- | :---: |',
  ];

  top20.slice(0, 10).forEach((r, i) => {
    const prevDisplay = r.prevStars > 0 ? r.prevStars.toLocaleString() : '首次';
    const currDisplay = r.currentStars.toLocaleString();
    const deltaStr = r.delta > 0 ? `+${r.delta.toLocaleString()}` : (r.delta < 0 ? r.delta.toLocaleString() : '持平');
    const inRegistry = existingUrls.has(r.html_url?.toLowerCase()) ? '✅ 已入庫' : '⏭ 未入庫';
    const wasAdded = addedTools.some(at => at.url === r.html_url);
    const status = wasAdded ? '🆕 本週新增' : inRegistry;
    reportLines.push(
      `| ${i + 1} | **${r.name}** | [${r.fullName}](https://github.com/${r.fullName}) | ${prevDisplay} | ${currDisplay} | ${deltaStr} | ${r.category} | ${status} |`
    );
  });

  reportLines.push('', '---', `> 由 \`scripts/trending-weekly.js\` 自動生成（v5 重構版：涵蓋近期新建專案與動態熱度，並兼具雙欄位相容性）`);

  writeFileSync(reportPath, reportLines.join('\n'), 'utf8');
  console.log(`   週報已寫入：${reportPath}\n`);

  // Step 9: 生成JSON數據檔
  console.log('📊 Step 8: 生成JSON數據...');
  const jsonPath = join(ROOT, 'registry', 'weekly-trending.json');
  
  const formattedItems = top20.map((r, i) => {
    const wasAdded = addedTools.some(at => at.url === r.html_url);
    const inRegistry = existingUrls.has(r.html_url?.toLowerCase());
    return {
      rank: i + 1,
      name: r.name,
      fullName: r.fullName,
      url: r.html_url,
      currentStars: r.currentStars,
      prevStars: r.prevStars,
      delta: r.delta,
      category: r.category,
      isNewlyAdded: wasAdded,
      statusText: wasAdded ? '🆕 本週納入' : (inRegistry ? '✅ 已在工具箱' : '⏭ 首次記錄'),
      startStarsAt: r.startStarsAt,
      endStarsAt: r.endStarsAt
    };
  });

  const trendingData = {
    worldWeek: targetWeek,
    lastUpdated: now.toISOString(),
    dateRange: `${targetMondayStr} ~ ${targetSundayStr}`,
    statPeriod: { start: targetMonday.toISOString(), end: targetSunday.toISOString() },
    scanTime: now.toISOString(),
    trackedPoolSize: trackedCount,
    activeReposCount: thisWeekRepos.size,
    scannedReposCount: thisWeekRepos.size,
    historicalCoverage: Object.keys(mergedSnapshot).length,
    newlyAddedCount: addedCount,
    top10: formattedItems.slice(0, 10),
    top20: formattedItems
  };

  writeFileSync(jsonPath, JSON.stringify(trendingData, null, 2), 'utf8');
  console.log(`   JSON 數據已寫入：${jsonPath}\n`);

  console.log(`✅ [完成] ${targetWeek} 每週漲星探勘作業結束！（僅使用 ${SEARCH_QUERIES.length} 次 Search API 請求）\n`);
}

// 直接執行時自動啟動；被 cli.js 動態 import（discover-trending 命令）時僅提供函式，不觸發掃描
const isDirectRun = typeof process.argv[1] === 'string' && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
  discoverTrendingTools().catch((err) => {
    console.error('[Error] Trending weekly scan failed:', err);
    process.exit(1);
  });
}
