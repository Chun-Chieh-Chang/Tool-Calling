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
import { saveRegistry } from '../core/registry.js';
import { syncRegistryToDist } from './dist-sync.js';

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

/**
 * 🔴 依「時間戳語意」挑選週界錨點（2026-10-13 修 off-by-one 時新增，純函式可測）。
 *
 * 背景：快照的 `week` 標籤只代表「該次執行落在哪一週」，**不代表邊界狀態**；
 * 真正決定語意的是 `timestamp`。Step 6 寫入端把 snapshot{W}.repos 定義為
 * 「W 週初基準」（本週首次執行寫入、後續執行不覆寫 repos），因此：
 *   ・週 N 的「起點值」= snapshot{N}.repos（N 週初的量測）
 *   ・週 N 的「終點值」= timestamp ≥ N.sunday 的最早快照（N 結束後第一次量測；
 *       在每週一 02:00 UTC 的設計節刊下就是本週快照，漂移以小時計）
 *
 * 舊碼把 snapshot{N} 當「上週末快照」、snapshot{N-1} 當基準 → 算出的其實是
 * N-1 那週的成長，卻掛上 N 的標籤；起訖日期還直接顯示兩次臨時執行的牆上時間
 * （實測汙染：2026-W41 報告顯示 起 10-03 → 終 10-05，與 W41＝10-05~10-11 完全無關）。
 *
 * @param {{snapshots?: Array<{week?:string, timestamp:string, repos?:Object}>}} snapshotData
 * @param {{weekStr:string, mondayStr:string, sundayStr:string}} weekInfo - 要報導的週（N）
 * @returns {{
 *   startSnap: object|null,   // 起點錨（優先 N 自身快照，否則 N 開始前最後一次量測）
 *   endSnap: object|null,     // 終點錨（N 結束後最早一次量測；沒有則現有最新筆）
 *   startFromFallback: boolean, // 起點非 N 自身快照（基準退化，漲幅可能跨週）
 *   endFromStale: boolean       // 終點早於 N 結束（上週結束後還沒有任何量測）
 * }}
 */
export function pickWeekBoundaryAnchors(snapshotData, weekInfo) {
  const snaps = (snapshotData?.snapshots || [])
    .filter(s => s && s.timestamp)
    .slice()
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  const weekStartMs = new Date(`${weekInfo.mondayStr}T00:00:00.000Z`).getTime();
  const weekEndMs = new Date(`${weekInfo.sundayStr}T23:59:59.999Z`).getTime();

  // 起點：本週自身的「週初基準」；該週從未執行 → 退到週開始前最後一次量測
  const ownSnap = snaps.find(s => s.week === weekInfo.weekStr);
  const beforeStart = snaps.filter(s => new Date(s.timestamp).getTime() <= weekStartMs);
  const startSnap = ownSnap || beforeStart[beforeStart.length - 1] || null;

  // 終點：週結束後最早的一次量測；整段歷史都沒有 → 用現有最新筆（呼叫端標記降級）
  const afterEnd = snaps.filter(s => new Date(s.timestamp).getTime() >= weekEndMs);
  const endSnap = afterEnd[0] || snaps[snaps.length - 1] || null;

  return {
    startSnap,
    endSnap,
    startFromFallback: !ownSnap && !!startSnap,
    endFromStale: afterEnd.length === 0 && !!endSnap
  };
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
function computeRanking(reposMap, baselineSnapshot, weekInfo, allowNewRepos = true, startDateStr = null, endDateStr = null) {
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
      startStarsAt: startDateStr || weekInfo.mondayStr,
      endStarsAt: endDateStr || weekInfo.sundayStr
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
  // 只計「owner/repo」形狀的鍵——`_meta` / `lastGenerated` 等中繼欄位不得計入
  //（generate-agents-md.js 有同款過濾；歷史上曾因此虛報 2435 vs 實際 2433）
  const trackedCount = Object.keys(trackedData).filter(k => /^[\w.-]+\/[\w.-]+$/.test(k)).length;

  // Step 2: 載入歷史快照（合併所有週）
  console.log('📊 Step 2: 載入歷史快照...');
  const snapshotData = loadAllSnapshotData();
  const allHistoricalRepos = snapshotData.allRepos || {};
  // 🔴 2026-10-13：舊碼在此用 snapshot{上上週} 當「上週基準」，前提是快照語意為
  //    「週末快照」；但 Step 6 寫入端其實把它定義為「週初基準」。兩半對語意不一致
  //    → 上週漲幅整體錯一週。錨點挑選改到 Step 4a 依 timestamp 語意處理（見
  //    pickWeekBoundaryAnchors）；本週「週初基準」仍用本週首次執行的快照。
  const currentWeekBaselineSnap = getSnapshotForWeek(currentWeekStr, snapshotData);

  console.log(`   歷史總計 ${Object.keys(allHistoricalRepos).length} 個 unique repos`);
  console.log(`   本週基準快照 (${currentWeekStr})：${currentWeekBaselineSnap ? currentWeekBaselineSnap.timestamp : '（本週首次執行，將建立）'}\n`);

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

  // 本週「週初基準」：優先取本週自身快照（首次執行後即被保留，作為本週迄今比對基準）；
  // 本週首次執行時尚無本週快照，則以即時值為基準（本週迄今 delta ≈ 0，正確反映週初狀態）
  const liveReposBaseline = Object.fromEntries([...liveRepos].map(([k, v]) => [k, v.stargazers_count || 0]));
  const baselineForCurrentWeek =
    currentWeekBaselineSnap?.repos ||
    liveReposBaseline ||
    getSnapshotForWeek(prevWeekStr, snapshotData)?.repos ||
    getLatestSnapshot(snapshotData)?.repos ||
    allHistoricalRepos;
  console.log(`   本週基準 (${currentWeekStr})：${Object.keys(baselineForCurrentWeek).length} 個 repos`);

  // Step 4a: 計算「上週完整數據」排名（起點＝上週週初基準，終點＝上週結束後首次量測）
  // 🔴 2026-10-13 off-by-one 修正：舊碼用 snapshot{上週} 當「上週末快照」、
  //    snapshot{上上週} 當基準，算出的其實是「上上週」的成長卻掛上「上週」標籤；
  //    起訖日期還直接顯示快照的牆上執行時間（臨時執行 → 每次看的日期都不一樣）。
  //    新碼依 timestamp 語意取錨（pickWeekBoundaryAnchors），起訖一律用 ISO 週界。
  console.log('📊 Step 4a: 計算上週完整數據排名（正式，列入入庫判斷）...');
  const anchors = pickWeekBoundaryAnchors(snapshotData, prevWeekInfo);
  const lastWeekStartRepos = anchors.startSnap?.repos
    || getLatestSnapshot(snapshotData)?.repos
    || allHistoricalRepos;
  const lastWeekEndIsLive = !anchors.endSnap; // 上週結束後完全沒有量測 → 退化用即時值
  const lastWeekEndRepos = anchors.endSnap?.repos || liveReposBaseline;
  // 起訖日期 = 世界週的真相（ISO 週界），永不洩漏臨時執行的牆上時間
  const lastWeekStartStr = prevWeekInfo.mondayStr;
  const lastWeekEndStr = prevWeekInfo.sundayStr;
  const lastWeekAnchorNotes = [
    anchors.startFromFallback ? `起點非上週自身快照（改用 ${anchors.startSnap?.timestamp || '無'}），漲幅可能跨週` : null,
    lastWeekEndIsLive ? '終點無「上週結束後」量測，改用即時值（含上週結束後天數）' : null,
    anchors.endFromStale ? `終點早於上週結束（${anchors.endSnap?.timestamp || '無'}），上週結束後尚未量測` : null
  ].filter(Boolean);

  let lastWeekRanked;
  if (!lastWeekEndIsLive) {
    const lastWeekReposMap = new Map(
      Object.entries(lastWeekEndRepos).map(([name, stars]) => [
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
    lastWeekRanked = computeRanking(lastWeekReposMap, lastWeekStartRepos, prevWeekInfo, true, lastWeekStartStr, lastWeekEndStr);
    console.log(`   起點：${anchors.startSnap?.timestamp || '—'}（上週週初基準）→ 終點：${anchors.endSnap?.timestamp || '—'}（上週結束後首次量測）`);
  } else {
    // 退化路徑：上週結束後完全沒有量測，終點用即時數據（含上週結束後的天數）
    lastWeekRanked = computeRanking(liveRepos, lastWeekStartRepos, prevWeekInfo, true, lastWeekStartStr, lastWeekEndStr);
    console.log('   ⚠ 上週結束後尚無量測，終點改用即時數據估算（漲幅含上週結束後天數）');
  }
  if (lastWeekAnchorNotes.length > 0) console.log(`   ⚠ ${lastWeekAnchorNotes.join('；')}`);
  const lastWeekTop20 = lastWeekRanked.slice(0, 20);
  console.log(`   上週排名計算完成，共 ${lastWeekRanked.length} 個有效 repos\n`);

  // Step 4b: 計算「本週迄今」排名（起點＝本週週初基準快照，終點＝今日即時星數，不列入入庫）
  console.log('📊 Step 4b: 計算本週迄今數據排名（進行中，不列入入庫判斷）...');
  // 起點顯示基準快照的「量測日」（該快照的 repos 是週初值；Step 6 不再刷新其
  // timestamp，所以這個日期穩定＝真正的資料起點，不會隨臨時執行飄移）
  const currentWeekStartStr = (currentWeekBaselineSnap?.timestamp || '').slice(0, 10) || currentWeekInfo.mondayStr;
  const currentWeekRanked = computeRanking(liveRepos, baselineForCurrentWeek, currentWeekInfo, true, currentWeekStartStr, todayStr);
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
      // ⚠️ useCase 是「語意欄位」——描述這個工具適合什麼任務。
      // 探勘 provenance(漲星數、入庫週次)不屬於語意內容,改記錄於 _provenance。
      useCase: repo.description || repo.name,
      // ⚠️ advantages 是「語意欄位」——描述這個工具相對其他選擇的優勢。
      // 星數不是工具的優勢,而是受歡迎程度的客觀指標,應存於 stars 欄位。
      // 無法從 GitHub metadata 推得真正的優勢,故留空待人工/後續豐富化補齊,
      // 空陣列會觸發 registry-contract 的警告(penalty 15)—— 這是誠實的訊號,
      // 提醒這一筆尚未完成解析。先前填入星數只是為了消警告,反而污染了語意。
      advantages: [],
      // 同 advantages：佔位樣板會一路餵進檢索的 V3／V4／D1 維度
      // （core/agent-retrieval.js、core/multidimensional.js），
      // 等於用對任何工具都成立的話污染排序向量。
      // 留空 → 由 enrich 管線依 README 補真實內容。
      negativeConstraints: [],
      stars: repo.currentStars,
      addedAt: now.toISOString(),
      status: 'active',
      // 入庫 provenance 集中於此,不污染語意欄位
      _provenance: {
        source: 'trending-weekly',
        week: prevWeekStr,
        starsAtIngest: repo.currentStars,
        weeklyDelta: repo.delta,
        ingestedAt: now.toISOString()
      }
    };

    registry.tools.push(newTool);
    existingIds.add(toolId);
    existingUrls.add(repoUrl.toLowerCase());
    addedCount++;
    addedToolUrls.add(repoUrl);

    if (trackedData[repo.fullName]) {
      trackedData[repo.fullName].addedAt = now.toISOString();
      trackedData[repo.fullName].status = 'in_registry';
    }
  }

  // 2026-10-02 寫入路徑收斂：lastUpdated 由 saveRegistry() 統一設定
  saveRegistry(registry);
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

  // 保留「週初基準」：本週快照的 repos 僅在首次執行時寫入，後續執行一律不覆寫，
  // 且 **timestamp 也不刷新**——它代表「基準量測時間」，是「本週迄今」起點的真相。
  // 🔴 舊碼會在重跑時把 timestamp 刷成最近執行時間 → 起點日期每次看都不一樣，
  //    與「起訖日期不正確」直接相關（2026-10-13 修）。
  // mergedSnapshot 只供「歷史覆蓋率」統計用（不參與錨點挑選）
  const mergedSnapshot = { ...allHistoricalRepos, ...currentSnapshot };
  const existingCurrentSnap = snapshotFileData.snapshots.find(s => s.week === currentWeekStr);
  if (existingCurrentSnap) {
    // 只把 dateRange 收斂到「基準量測當日」，不再宣稱覆蓋到今天（repos 停在週初）
    const baselineDay = String(existingCurrentSnap.timestamp).slice(0, 10);
    existingCurrentSnap.dateRange = `${baselineDay} ~ ${baselineDay}`;
    // existingCurrentSnap.repos / timestamp 刻意不動（週初基準）
  } else {
    snapshotFileData.snapshots.push({
      week: currentWeekStr,
      dateRange: `${todayStr} ~ ${todayStr}`,
      timestamp: now.toISOString(),
      isWeekStart: true,
      repos: currentSnapshot
    });
  }

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
    // 起訖值誠實標註「實際量測時間」：ISO 週界是統計區間，錨點快照才是量測點
    `> **起點量測**：${anchors.startSnap?.timestamp || '—'}（上週週初基準）`,
    `> **終點量測**：${anchors.endSnap?.timestamp || '—'}（上週結束後首次量測）`,
    lastWeekAnchorNotes.length > 0 ? `> **⚠ 降級說明**：${lastWeekAnchorNotes.join('；')}` : null,
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

  writeFileSync(reportPath, reportLines.filter(l => l !== null).join('\n'), 'utf8');
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
      note: lastWeekAnchorNotes.length > 0
        ? `⚠ 降級：${lastWeekAnchorNotes.join('；')}`
        : '上週完整數據（起點=上週週初基準，終點=上週結束後首次量測），列入工具箱納入判斷',
      measuredAt: {
        start: anchors.startSnap?.timestamp || null,
        end: anchors.endSnap?.timestamp || null
      },
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

  // 同步至 dist/registry/，確保工作台實際服務的資料與 registry 一致
  try {
    syncRegistryToDist();
    console.log(`   📦 已同步 registry → dist/registry/（weekly-trending.json, tools.json）`);
  } catch (e) {
    console.warn(`   ⚠ 同步至 dist 失敗（不影響 registry 資料）：${e.message || e}`);
  }

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
