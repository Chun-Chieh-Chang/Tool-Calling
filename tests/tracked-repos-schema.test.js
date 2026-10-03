import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_SHAPE = /^[\w.-]+\/[\w.-]+$/;
const META_KEYS = new Set(['_meta', 'lastGenerated']);

test('tracked-repos.json schema：頂層只允許 owner/repo 鍵與中繼欄位，不得有混種異類', () => {
  // 歷史教訓：add-user-requested-tools 舊版寫入的平行 repos 陣列混在 2,583 個
  // repo 鍵之間，任何 Object.keys() 迭代都會把它當成一個 repo 名
  //（2026-10-03 schema 統一移除，本測試防復發）。
  const data = JSON.parse(readFileSync(path.join(__dirname, '..', 'registry', 'tracked-repos.json'), 'utf8'));
  const offenders = Object.entries(data)
    .filter(([k, v]) => !REPO_SHAPE.test(k) && !META_KEYS.has(k))
    .map(([k]) => `${k}(${Array.isArray(v) ? 'array' : typeof v})`);
  assert.deepEqual(offenders, [], `頂層存在不合法的鍵：${offenders.join(', ')}`);
});

test('tracked-repos.json schema：每個 repo 條目都是物件且帶 fullName', () => {
  const data = JSON.parse(readFileSync(path.join(__dirname, '..', 'registry', 'tracked-repos.json'), 'utf8'));
  const bad = Object.entries(data)
    .filter(([k, v]) => REPO_SHAPE.test(k) && (typeof v !== 'object' || v === null || Array.isArray(v) || typeof v.fullName !== 'string'))
    .map(([k]) => k);
  assert.deepEqual(bad, [], `以下鍵的條目不是合法 repo 物件：${bad.join(', ')}`);
});

test('scripts/tracked-repos.js：重建時防禦性清除 repos 陣列與中繼欄位', async () => {
  const src = readFileSync(path.join(__dirname, '..', 'scripts', 'tracked-repos.js'), 'utf8');
  assert.ok(src.includes('delete existingTracked.repos'), 'buildTrackedRepos 應清除歷史遺留的 repos 陣列');
  assert.ok(src.includes('delete existingTracked._meta'), 'buildTrackedRepos 應清除 _meta');
  assert.ok(!/repos: \[\]/.test(src), 'getTrackedRepos 的 fallback 不得再帶 repos 陣列鍵');
});
