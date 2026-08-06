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
        addedAt: tool.addedAt || new Date().toISOString(),
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

  // 合併：保留已存在的註解
  for (const [key, info] of reposMap.entries()) {
    if (existingTracked[key]) {
      // 保留原有註解
      if (existingTracked[key].note) info.note = existingTracked[key].note;
      if (existingTracked[key].notes) info.notes = existingTracked[key].notes;
      if (existingTracked[key].category && !info.category) info.category = existingTracked[key].category;
    }
  }
  reposMap.forEach((v, k) => { existingTracked[k] = v; });

  const repoArray = Object.values(existingTracked);
  const _meta = {
    total: repoArray.length,
    inRegistry: repoArray.filter(r => r.addedAt).length,
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

if (import.meta.url === `file://${process.argv[1]}`) {
  const force = process.argv.includes('--force');
  buildTrackedRepos({ forceRegenerate: force });
}

export { buildTrackedRepos, getTrackedRepos, getTrackedRepoList, addTrackedRepo, TRACKED_PATH };
