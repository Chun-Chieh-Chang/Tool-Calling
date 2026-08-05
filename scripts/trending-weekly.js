/**
 * trending-weekly.js — GitHub 每週漲星數 Top 10 自動探勘與入庫腳本
 *
 * 運作流程：
 *   1. 從 star-snapshots.json 讀取「上週結束時」的快照
 *   2. 搜尋過去 30 天內活躍的高星 repos
 *   3. 計算本週（W31）相對於上週（W30）的 star 漲幅
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

/**
 * 根據 ISO 8601 標準計算 ISO 週
 */
function getISOWeekString(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

/**
 * 回傳「最近一個完整的 ISO 週」（Mon 00:00 ~ Sun 23:59 UTC）
 * 例如：週二 → 上週一~上週日
 */
function getTargetWeek(now = new Date()) {
  const d = new Date(now);
  const isoDay = d.getUTCDay() || 7; // Mon=1 … Sun=7
  d.setUTCDate(d.getUTCDate() - (isoDay + 5)); // 回到上週一
  d.setUTCHours(0, 0, 0, 0);
  const monday = d;
  const sunday = new Date(monday);
  sunday.setUTCDate(sunday.getUTCDate() + 6); // 上週日
  const isoWeek = getISOWeekString(monday);
  return { monday, sunday, isoWeek };
}

/**
 * 回傳「上上週的日期範圍」（用於搜尋近期活躍 repo）
 */
function getLastWeekRange(now = new Date()) {
  const d = new Date(now);
  const isoDay = d.getUTCDay() || 7;
  // 回到上上週一
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

// ─── 搜尋主題清單 ─────────────────────────────────────────────────────

function getSearchQueries(targetMondayStr) {
  return [
    `ai agent stars:>1000 pushed:>${targetMondayStr}`,
    `llm framework stars:>1000 pushed:>${targetMondayStr}`,
    `developer tool stars:>2000 pushed:>${targetMondayStr}`,
    `automation workflow stars:>500 pushed:>${targetMondayStr}`,
    `data analysis stars:>1000 pushed:>${targetMondayStr}`,
    `machine learning stars:>2000 pushed:>${targetMondayStr}`,
    `generative ai stars:>1000 pushed:>${targetMondayStr}`,
    `devops infrastructure stars:>2000 pushed:>${targetMondayStr}`,
    `ui component design stars:>1000 pushed:>${targetMondayStr}`,
    `cli tool stars:>1000 pushed:>${targetMondayStr}`,
    `agent framework stars:>1000 pushed:>${targetMondayStr}`,
    `ai tool stars:>1000 pushed:>${targetMondayStr}`,
    `productivity tool stars:>1000 pushed:>${targetMondayStr}`,
  ];
}

// ─── 分類推斷 ─────────────────────────────────────────────────────────

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

// ─── GitHub Search API ────────────────────────────────────────────────

async function searchGitHub(query, retries = 3) {
  const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=100`;
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

  // 1. 計算目標週次（最近一個完整的 ISO 週）
  const { monday: targetMonday, sunday: targetSunday, isoWeek: targetWeek } = getTargetWeek(now);
  
  // 計算上週的範圍（用於比對歷史快照）
  const lastWeekRange = getLastWeekRange(now);

  const worldWeek = targetWeek;
  const targetMondayStr = targetMonday.toISOString().slice(0, 10);
  const targetSundayStr = targetSunday.toISOString().slice(0, 10);
  const lastMondayStr = lastWeekRange.monday.toISOString().slice(0, 10);
  const lastSundayStr = lastWeekRange.sunday.toISOString().slice(0, 10);

  // 格式化時間顯示
  const formatDate = (date) => date.toISOString().slice(0, 10);
  const formatDateTime = (date) => date.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';

  console.log(`\n\x1b[36m🔍 GitHub 每週漲星探勘 — ${worldWeek}\x1b[0m`);
  console.log(`   統計區間：${formatDate(targetMonday)} ~ ${formatDate(targetSunday)}`);
  console.log(`   統計時間：${formatDateTime(targetMonday)} ~ ${formatDateTime(targetSunday)}`);
  console.log(`   上週範圍：${lastMondayStr} ~ ${lastSundayStr}\n`);

  // 2. 讀取現有快照（上週結束時的星數）
  let prevSnapshot = {};
  let prevSnapshotTimestamp = null;
  
  if (existsSync(SNAPSHOTS_PATH)) {
    try {
      const snapshotData = JSON.parse(readFileSync(SNAPSHOTS_PATH, 'utf8'));
      
      // 新版結構：包含多個週次的快照（陣列格式）
      if (Array.isArray(snapshotData.snapshots)) {
        // 找上週的快照
        const lastWeekSnapshot = snapshotData.snapshots.find(s => s.week === getISOWeekString(lastWeekRange.monday));
        if (lastWeekSnapshot) {
          prevSnapshot = lastWeekSnapshot.repos;
          // 使用上週結束時間作為起點時間（而非執行時間）
          prevSnapshotTimestamp = lastWeekRange.sunday.toISOString();
          console.log(`  📊 找到上週 (${getISOWeekString(lastWeekRange.monday)}) 快照：${Object.keys(prevSnapshot).length} 個 repos (起點時間: ${formatDate(new Date(prevSnapshotTimestamp))})\n`);
        } else {
          // fallback: 使用最新的快照
          const latestSnapshot = snapshotData.snapshots[snapshotData.snapshots.length - 1];
          if (latestSnapshot) {
            prevSnapshot = latestSnapshot.repos;
            prevSnapshotTimestamp = latestSnapshot.timestamp;
            console.log(`  ⚠ 未找到上週快照，使用最新快照：${formatDate(new Date(latestSnapshot.timestamp))}\n`);
          }
        }
      } else {
        // 舊版結構（單一物件）
        prevSnapshot = snapshotData.snapshots || snapshotData;
        prevSnapshotTimestamp = snapshotData.lastUpdated || null;
        console.log(`  📊 歷史快照：${Object.keys(prevSnapshot).length} 個 repos (最後更新: ${prevSnapshotTimestamp ? formatDate(new Date(prevSnapshotTimestamp)) : '未知'})\n`);
      }
    } catch (err) {
      console.warn(`  ⚠ 讀取快照失敗：${err.message}`);
    }
  } else {
    console.log(`  ⚠ 找不到歷史快照檔案，將建立基準線\n`);
  }

  // 3. 搜尋多領域熱門 repos
  const MIN_STARS_THRESHOLD = 500;
  const SEARCH_QUERIES = getSearchQueries(lastMondayStr); // 使用上週一開始的日期
  const allRepos = new Map();
  let skippedForkCount = 0;
  let skippedLowStarCount = 0;

  console.log(`  🔎 開始搜尋活躍 repos...`);
  for (let i = 0; i < SEARCH_QUERIES.length; i++) {
    const q = SEARCH_QUERIES[i];
    console.log(`  [${i + 1}/${SEARCH_QUERIES.length}] ${q.slice(0, 50)}...`);
    const items = await searchGitHub(q);
    for (const repo of items) {
      if (!repo.full_name) continue;
      if (repo.fork) {
        skippedForkCount++;
        continue;
      }
      if ((repo.stargazers_count || 0) < MIN_STARS_THRESHOLD) {
        skippedLowStarCount++;
        continue;
      }
      if (!allRepos.has(repo.full_name)) {
        allRepos.set(repo.full_name, repo);
      }
    }
    if (i < SEARCH_QUERIES.length - 1) await delay(GITHUB_TOKEN ? 1000 : 3000);
  }

  console.log(`\n  📦 共探勘到 ${allRepos.size} 個符合門檻的 repos (已過濾: ${skippedForkCount} Fork, ${skippedLowStarCount} 低星)`);

  // 4. 計算每個 repo 的 star delta
  // 關鍵：delta = 本週結束星數 - 上週結束星數
  const rankedRepos = [];
  for (const [fullName, repo] of allRepos) {
    const currentStars = repo.stargazers_count || 0;
    // 上週結束時的星數（從歷史快照取得）
    const prevStars = prevSnapshot[fullName] || 0;
    const delta = prevStars > 0 ? (currentStars - prevStars) : 0;
    
    rankedRepos.push({ 
      ...repo, 
      currentStars, 
      prevStars, 
      delta,
      // 附加時間戳 - 對應統計區間的起訖時間
      startStarsAt: prevSnapshotTimestamp || lastWeekRange.sunday.toISOString(),
      endStarsAt: targetSunday.toISOString()
    });
  }

  // 5. 依 delta 降序排列，取前 10
  rankedRepos.sort((a, b) => b.delta - a.delta);
  const top10 = rankedRepos.slice(0, 10);

  console.log(`\n  🏆 本週漲星前 10 名：`);
  top10.forEach((r, i) => {
    const prevDisplay = r.prevStars > 0 ? r.prevStars.toLocaleString() : '首次';
    const currDisplay = r.currentStars.toLocaleString();
    const deltaStr = r.delta > 0 ? `+${r.delta.toLocaleString()}` : '首次快照';
    const startTime = formatDate(new Date(r.startStarsAt));
    const endTime = formatDate(new Date(r.endStarsAt));
    console.log(`     ${i + 1}. ${r.full_name}`);
    console.log(`        ⭐ ${currDisplay} (起: ${prevDisplay}@${startTime}, 終: ${currDisplay}@${endTime}, 漲: ${deltaStr})`);
  });

  // 6. 讀取現有 registry，自動入庫
  const registry = JSON.parse(readFileSync(REGISTRY_PATH, 'utf8'));
  const existingUrls = new Set(registry.tools.map(t => t.url?.toLowerCase()));
  const existingIds = new Set(registry.tools.map(t => t.id));

  let addedCount = 0;
  const addedTools = [];

  for (const repo of top10) {
    const repoUrl = repo.html_url;
    if (existingUrls.has(repoUrl?.toLowerCase())) continue;
    if (repo.fork || !repo.stargazers_count) continue;

    let toolId = repo.name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');
    if (existingIds.has(toolId)) toolId = `${toolId}-${repo.owner.login.toLowerCase().slice(0, 8)}`;
    if (existingIds.has(toolId)) continue;

    const category = inferCategory(repo);
    const topics = repo.topics || [];
    const triggers = [toolId, ...topics.slice(0, 5).filter(t => t.length > 2)];

    const newTool = {
      id: toolId,
      name: repo.name,
      url: repoUrl,
      description: (repo.description || 'No description provided.').slice(0, 200),
      category,
      language: (repo.language || 'unknown').toLowerCase(),
      triggers,
      install: { method: 'none', repoUrl },
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

  // 7. 更新 registry
  registry.lastUpdated = now.toISOString();
  writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2), 'utf8');
  console.log(`\n  ✅ 新增 ${addedCount} 個工具入庫（現有庫存：${registry.tools.length} 個）`);

  // 8. 更新快照（追加新週次的快照，保留歷史記錄）
  const newReposSnapshot = {};
  for (const [fullName, repo] of allRepos) {
    newReposSnapshot[fullName] = repo.stargazers_count || 0;
  }
  
  // 讀取現有快照檔案
  let snapshotFileData = { snapshots: [], lastUpdated: now.toISOString() };
  if (existsSync(SNAPSHOTS_PATH)) {
    try {
      snapshotFileData = JSON.parse(readFileSync(SNAPSHOTS_PATH, 'utf8'));
      if (!Array.isArray(snapshotFileData.snapshots)) {
        // 轉換舊格式為新格式
        snapshotFileData.snapshots = [{
          week: getISOWeekString(lastWeekRange.monday),
          dateRange: `${lastMondayStr} ~ ${lastSundayStr}`,
          timestamp: snapshotFileData.lastUpdated || now.toISOString(),
          repos: snapshotFileData.snapshots || snapshotFileData
        }];
      }
    } catch { /* ignore */ }
  }
  
  // 追加本週快照 - 使用統計區間結束時間作為 timestamp
  snapshotFileData.snapshots.push({
    week: worldWeek,
    dateRange: `${targetMondayStr} ~ ${targetSundayStr}`,
    // 關鍵修正：使用本週結束時間作為此快照的時間戳
    timestamp: targetSunday.toISOString(),
    repos: newReposSnapshot
  });
  
  snapshotFileData.lastUpdated = now.toISOString();
  writeFileSync(SNAPSHOTS_PATH, JSON.stringify(snapshotFileData, null, 2), 'utf8');
  console.log(`  📸 已更新歷史快照檔案：${SNAPSHOTS_PATH}`);

  // 9. 生成週報
  mkdirSync(REPORTS_DIR, { recursive: true });
  const reportPath = join(REPORTS_DIR, `${worldWeek}.md`);

  const reportLines = [
    `# 🏆 GitHub 每週漲星探勘報告 — ${worldWeek}`,
    '',
    `> **統計區間**：${formatDate(targetMonday)} ~ ${formatDate(targetSunday)}`,
    `> **統計時間**：${formatDateTime(targetMonday)} ~ ${formatDateTime(targetSunday)}`,
    `> **探勘時間**：${now.toISOString()}`,
    `> **探勘 repos 數量**：${allRepos.size}`,
    `> **新增入庫數量**：${addedCount}`,
    '',
    '## 🔥 本週漲星前 10 名',
    '',
    '| 排名 | 工具名稱 | GitHub Repo | 起點 Stars (時間) | 終點 Stars (時間) | 漲幅 | 分類 | 入庫狀態 |',
    '| :---: | :--- | :--- | ---: | ---: | ---: | :--- | :---: |',
  ];

  top10.forEach((r, i) => {
    const prevDisplay = r.prevStars > 0 ? r.prevStars.toLocaleString() : '首次';
    const currDisplay = r.currentStars.toLocaleString();
    const deltaStr = r.delta > 0 ? `+${r.delta.toLocaleString()}` : '首次快照';
    const startTime = formatDate(new Date(r.startStarsAt));
    const endTime = formatDate(new Date(r.endStarsAt));
    const inRegistry = existingUrls.has(r.html_url?.toLowerCase()) ? '✅ 已入庫' : '⏭ 已存在';
    const wasAdded = addedTools.some(at => at.url === r.html_url);
    const status = wasAdded ? '🆕 本週新增' : inRegistry;
    reportLines.push(
      `| ${i + 1} | **${r.name}** | [${r.full_name}](${r.html_url}) | ${prevDisplay} (${startTime}) | ${currDisplay} (${endTime}) | ${deltaStr} | ${inferCategory(r)} | ${status} |`
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

  writeFileSync(reportPath, reportLines.join('\n'), 'utf8');
  console.log(`  📝 週報已寫入：${reportPath}`);

  // 10. 生成 JSON 數據檔
  const jsonPath = join(ROOT, 'registry', 'weekly-trending.json');
  const trendingData = {
    worldWeek,
    lastUpdated: now.toISOString(),
    dateRange: `${formatDate(targetMonday)} ~ ${formatDate(targetSunday)}`,
    statPeriod: {
      start: targetMonday.toISOString(),
      end: targetSunday.toISOString()
    },
    scanTime: now.toISOString(),
    scannedReposCount: allRepos.size,
    newlyAddedCount: addedCount,
    top10: top10.map((r, i) => {
      const wasAdded = addedTools.some(at => at.url === r.html_url);
      return {
        rank: i + 1,
        name: r.name,
        fullName: r.full_name,
        url: r.html_url,
        currentStars: r.currentStars,
        prevStars: r.prevStars,
        delta: r.delta,
        category: inferCategory(r),
        isNewlyAdded: wasAdded,
        statusText: wasAdded ? '🆕 本週納入' : '✅ 已在工具箱',
        // 詳細時間戳記 - 對應統計區間的起訖時間
        startStarsAt: r.startStarsAt,
        endStarsAt: r.endStarsAt,
        startTime: formatDate(new Date(r.startStarsAt)),
        endTime: formatDate(new Date(r.endStarsAt))
      };
    }),
    addedTools: addedTools.map(t => ({
      id: t.id,
      name: t.name,
      url: t.url,
      description: t.description,
      category: t.category,
      language: t.language,
      stars: t.stars,
      delta: t.delta,
      useCase: t.useCase,
      negativeConstraints: t.negativeConstraints,
      advantages: t.advantages
    }))
  };

  writeFileSync(jsonPath, JSON.stringify(trendingData, null, 2), 'utf8');
  console.log(`  📊 JSON 數據已寫入：${jsonPath}`);

  console.log(`\n\x1b[32m[完成] ${worldWeek} 每週漲星探勘作業結束！\x1b[0m\n`);
}

main().catch((err) => {
  console.error('[Error] Trending weekly scan failed:', err);
  process.exit(1);
});
