/**
 * skill-discovery 整合測試（預設跳過）
 *
 * ⚠️ 本檔的每個案例都會真的呼叫 `npx skills`（外部 CLI），屬於整合測試。
 *    副作用與不穩定性說明見 tests/find-skill.test.js 的檔頭註解。
 *
 * 執行方式：`npm run test:integration`
 * 無外部依賴的單元測試請看 tests/skill-discovery-unit.test.js。
 *
 * 2026-09-12 清理：原本 4 個測試中有 2 組是完全相同的重複案例
 * （`listSkills returns array` 與 `isSkillCliAvailable returns boolean` 各出現兩次），
 * 已移除重複項。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const CACHE_FILE = join(homedir(), '.tool-calling', 'skills-cache', 'skills.json');

const SKIP_INTEGRATION = !(
  process.env.SKILLS_CLI_TEST === '1' ||
  process.env.npm_lifecycle_event === 'test:integration'
);
const INTEGRATION_SKIP_REASON =
  '整合測試：需外部 npx skills CLI 與網路，請用 npm run test:integration';

test('skill-discovery - listSkills returns array', { skip: SKIP_INTEGRATION ? INTEGRATION_SKIP_REASON : false }, async () => {
  const { listSkills } = await import('../core/skill-discovery.js');

  const skills = listSkills();
  assert.ok(Array.isArray(skills));
});

test('skill-discovery - isSkillCliAvailable returns boolean', { skip: SKIP_INTEGRATION ? INTEGRATION_SKIP_REASON : false }, async () => {
  const { isSkillCliAvailable } = await import('../core/skill-discovery.js');

  const available = isSkillCliAvailable();
  assert.ok(typeof available === 'boolean');
});

// 清理快取 —— 只在真的跑過整合測試時執行，否則不該動到使用者既有的快取
test.after(() => {
  if (SKIP_INTEGRATION) return;
  if (existsSync(CACHE_FILE)) {
    unlinkSync(CACHE_FILE);
  }
});
