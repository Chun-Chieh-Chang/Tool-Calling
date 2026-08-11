import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SNAPSHOTS_PATH = join(__dirname, '..', 'registry', 'star-snapshots.json');

export function loadSnapshot() {
  if (!existsSync(SNAPSHOTS_PATH)) return {};
  try { return JSON.parse(readFileSync(SNAPSHOTS_PATH, 'utf-8')); } catch { return {}; }
}

export function saveSnapshot(data) {
  writeFileSync(SNAPSHOTS_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

/** 從 GitHub URL 解析 owner/repo */
export function parseOwnerRepo(url) {
  if (!url || typeof url !== 'string') return null;
  const m = url.match(/github\.com\/([^\/]+)\/([^\/]+)/i);
  if (!m) return null;
  return { owner: m[1], repo: m[2].replace(/\.git$/i, '') };
}
