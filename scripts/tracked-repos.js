/**
 * tracked-repos.js — 固定追蹤池管理模組
 * 
 * 用途：
 *   1. 匯入 tools.json 中的 GitHub repo
 *   2. 合併來自 star-snapshots.json 歷史快照的新增 repo
 *   3. 提供 getTrackedRepos() / saveTrackedRepos() 給其他腳本使用
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const TOOLS_PATH = join(ROOT, 'registry', 'tools.json');
const SNAPSHOTS_PATH = join(ROOT, 'registry', 'star-snapshots.json');
const TRACKED_PATH = join(ROOT, 'registry', 'tracked-repos.json');

// ──────────────────────────────────────────────
// 工具函式
// ──────────────────────────────────────────────

function parseGithubUrl(url) {
  if (!url || typeof url !== 'string') return null;
  const match = url.match(/github\.com\/([^\/]+)\/([^\/]+)/i);
  if (!match) return null;
  return { owner: match[1], repo: match[2].replace(/\.git$/i, '') };
}

function fullKey(owner, repo) {
  return `${owner}/${repo}`;
}

// ──────────────────────────────────────────────
// 讀取檔案 helper
// ──────────────────────────────────────────────

function readJSON(path) {
  if (!existsSync(path)) return null;
  try { return JSON.parse(readFileSync(path, 'utf8')); }
  catch { return null; }
}

function writeJSON(path, data) {
  writeFileSync(path, JSON.stringify(data, null, 2), 'utf8');
}

// ──────────────────────────────────────────────
// 溯源欄位合併（純函式，供測試直接呼叫）
// ──────────────────────────────────────────────

/**
 * 把舊追蹤檔的「溯源欄位」合併進本次掃描結果（原地修改 info 並回傳）。
 *
 * 追蹤池每週由 trending-weekly.js 重建，重建結果只含 tools.json 看得到的欄位。
 * note／initialStars／discoveredAt／sourceSnapshotWeek／addedAt 只存在於舊檔，
 * 不繼承就會被抹除：
 *   - initialStars 是漲星 delta 的基線，遺失等於把舊倉庫當從零起算的新倉庫
 *     （倉庫從「僅追蹤」升格為「已入庫」時最容易踩到）
 *   - discoveredAt 語意是「首次被發現」，但 Step 2 是先命中先贏，快照陣列一
 *     增加就會把舊值往後推（2026-09-25 實測 32 筆漂移 18 分鐘）→ 取較早者
 *   - addedAt 在來源不明時留 null，這裡繼承舊值，重建才會冪等
 *
 * @param {object} info 本次掃描出的 repo 條目（會被原地修改）
 * @param {object} existing tracked-repos.json 中同 key 的舊條目
 * @returns {object} info（便於串接與斷言）
 */
function mergeTrackedProvenance(info, existing) {
  if (!info || !existing) return info;
  if (existing.note) info.note = existing.note;
  if (existing.notes) info.notes = existing.notes;
  if (existing.category && !info.category) info.category = existing.category;
  for (const f of ['initialStars', 'sourceSnapshotWeek']) {
    if (info[f] === undefined && existing[f] !== undefined) info[f] = existing[f];
  }
  const prevDiscovered = existing.discoveredAt;
  if (prevDiscovered && (!info.discoveredAt || prevDiscovered < info.discoveredAt)) {
    info.discoveredAt = prevDiscovered;
  }
  if (!info.addedAt && existing.addedAt) info.addedAt = existing.addedAt;
  return info;
}

// ──────────────────────────────────────────────
// 建立追蹤池（從 tools.json + 歷史快照合併）
// ──────────────────────────────────────────────

function buildTrackedRepos({ forceRegenerate = false } = {}) {
  const toolsData = readJSON(TOOLS_PATH);
  if (!toolsData || !Array.isArray(toolsData.tools)) {
    console.error('ERROR: registry/tools.json 無法讀取或格式錯誤');
    process.exit(1);
  }

  // Step 1: 從 tools.json 收集現有 repo
  const reposMap = new Map();
  for (const tool of toolsData.tools) {
    const parsed = parseGithubUrl(tool.url);
    if (!parsed) continue;
    const key = fullKey(parsed.owner, parsed.repo);
    // 保留現有 meta 資訊（category、addedAt 等）
    if (reposMap.has(key)) {
      const existing = reposMap.get(key);
      if (tool.category) existing.category = tool.category;
      if (!existing.addedAt && tool.addedAt) existing.addedAt = tool.addedAt;
    } else {
      reposMap.set(key, {
        fullName: key,
        owner: parsed.owner,
        repo: parsed.repo,
        category: tool.category || null,
        // 不可在重建時Stamp「現在」：舊工具沒有 addedAt 時，每次重建都會拿到
        // 新的時間戳，追蹤池因此永遠不冪等（2026-09-25 實測 38 筆被改寫）。
        // 沒有來源時間就留 null，由下面的合併從舊檔繼承。
        addedAt: tool.addedAt || null,
        status: 'tracking'
      });
    }
  }

  // Step 2: 從歷史快照中收集尚未在 tools.json 的熱門 repo
  const snapshotsData = readJSON(SNAPSHOTS_PATH);
  if (snapshotsData && Array.isArray(snapshotsData.snapshots)) {
    for (const snap of snapshotsData.snapshots) {
      if (!snap.repos || typeof snap.repos !== 'object') continue;
      for (const [key, stars] of Object.entries(snap.repos)) {
        if (reposMap.has(key)) continue;
        const parts = key.split('/');
        if (parts.length !== 2) continue;
        if (typeof stars !== 'number' || stars < 50) continue; // 太低的跳過
        reposMap.set(key, {
          fullName: key,
          owner: parts[0],
          repo: parts[1],
          initialStars: stars,
          discoveredAt: snap.timestamp || new Date().toISOString(),
          sourceSnapshotWeek: snap.week,
          category: null,
          addedAt: null,
          status: 'tracked_not_in_registry'
        });
      }
    }
  }

  // Step 3: 載入現有的 tracked-repos.json（保留額外註記）
  let existingTracked = {};
  if (existsSync(TRACKED_PATH)) {
    const loaded = readJSON(TRACKED_PATH);
    if (loaded && typeof loaded === 'object') {
      existingTracked = loaded;
      // 移除 _meta 和 lastGenerated，只保留 repo 數據
      delete existingTracked._meta;
      delete existingTracked.lastGenerated;
    }
  }

  // 合併：保留舊檔的註記與溯源欄位（規則見 mergeTrackedProvenance()）
  for (const [key, info] of reposMap.entries()) {
    if (existingTracked[key]) mergeTrackedProvenance(info, existingTracked[key]);
  }
  reposMap.forEach((v, k) => { existingTracked[k] = v; });

  // 只計「owner/repo」形狀的鍵。
  // 原本用 Object.values(existingTracked) 會把 `repos`（歷史遺留陣列）等中繼欄位
  // 也算成一筆 repo，導致 _meta.total 虛胖。
  const repoArray = Object.entries(existingTracked)
    .filter(([k]) => /^[\w.-]+\/[\w.-]+$/.test(k))
    .map(([, v]) => v);
  const _meta = {
    total: repoArray.length,
    // 以 status 判定「已入庫」——addedAt 不再是可靠訊號（來源不明的舊工具會留 null）
    inRegistry: repoArray.filter(r => r.status === 'tracking').length,
    trackedOnly: repoArray.filter(r => r.status === 'tracked_not_in_registry').length,
    lastGenerated: new Date().toISOString()
  };

  const output = { ...existingTracked, _meta, lastGenerated: _meta.lastGenerated };
  writeJSON(TRACKED_PATH, output);

  console.log(`[tracked-repos] 追蹤池共 ${_meta.total} 個 repos`);
  console.log(`  - 已在 registry: ${_meta.inRegistry}`);
  console.log(`  - 僅追蹤未入庫: ${_meta.trackedOnly}`);
  console.log(`  寫入: ${TRACKED_PATH}`);

  return output;
}

// ──────────────────────────────────────────────
// 讀取追蹤池
// ──────────────────────────────────────────────

function getTrackedRepos({ ensureExists = true } = {}) {
  if (!existsSync(TRACKED_PATH)) {
    if (ensureExists) {
      console.log('[tracked-repos] tracked-repos.json 不存在，自動重建...');
      buildTrackedRepos();
    } else {
      return { _meta: { total: 0 }, repos: [] };
    }
  }
  return readJSON(TRACKED_PATH) || { _meta: { total: 0 }, repos: [] };
}

function getTrackedRepoList() {
  const data = getTrackedRepos();
  return Object.values(data).filter(r => r.fullName && !r.fullName.startsWith('_'));
}

// ──────────────────────────────────────────────
// 加入新 repo 到追蹤池
// ──────────────────────────────────────────────

function addTrackedRepo(owner, repo, extra = {}) {
  const key = fullKey(owner, repo);
  const data = getTrackedRepos({ ensureExists: false });
  
  if (!data[key]) {
    data[key] = {
      fullName: key,
      owner,
      repo,
      initialStars: null,
      discoveredAt: new Date().toISOString(),
      category: null,
      addedAt: null,
      status: 'tracked_not_in_registry',
      ...extra
    };
    data.lastGenerated = new Date().toISOString();
    writeJSON(TRACKED_PATH, data);
    console.log(`  ✓ 加入追蹤池: ${key}`);
    return true;
  }
  return false;
}

// ──────────────────────────────────────────────
// CLI entry point
// ──────────────────────────────────────────────

if (process.argv[1] && fileURLToPath(import.meta.url).toLowerCase() === process.argv[1].toLowerCase()) {
  const force = process.argv.includes('--force');
  buildTrackedRepos({ forceRegenerate: force });
}

export {
  buildTrackedRepos,
  getTrackedRepos,
  getTrackedRepoList,
  addTrackedRepo,
  mergeTrackedProvenance,
  TRACKED_PATH
};
