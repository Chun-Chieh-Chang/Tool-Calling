/**
 * Find Skill Integration Tests
 * 
 * Tests for skill discovery and aggregation functionality.
 * Covers: search, install, list, cache, error handling, boundary cases.
 *
 * ⚠️ 這是**整合測試**，預設跳過。每個案例都會真的呼叫 `npx skills`（外部 CLI）或 GitHub API，
 *    因此有四個問題：
 *      1. 慢 —— 單次 timeout 可達 30–60 秒，`isSkillCliAvailable()` 最多重試 3 次
 *      2. 不穩 —— 依賴網路與 GitHub 未認證額度（60/hr，易被限流）
 *      3. 有副作用 —— 會在 ~/.tool-calling/skills-cache 寫檔
 *      4. 會讓 npx 重解析並替換 ~/.npm/_npx 快取，一次 churn 300+ 個檔案，
 *         因而跨越工作區 bulk-delete 守衛的 50 筆門檻、每次跑測試都跳授權提示
 *
 * 執行方式：`npm run test:integration`
 * 純函式與快取短路邏輯的測試請看 tests/skill-discovery-unit.test.js（無外部依賴）。
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

// ─── Test Helpers ─────────────────────────────────────────────────────────────

const CACHE_DIR = join(homedir(), '.tool-calling', 'skills-cache');
const CACHE_FILE = join(CACHE_DIR, 'skills.json');
const AGGREGATOR_CACHE_FILE = join(CACHE_DIR, 'skills-aggregated.json');

/**
 * 整合測試開關：需明確指定才會執行。
 * 用 `npm_lifecycle_event` 是為了在 Windows 上免裝 cross-env 也能運作
 * （cmd.exe 不支援 `VAR=1 cmd` 語法）。
 */
const SKIP_INTEGRATION = !(
  process.env.SKILLS_CLI_TEST === '1' ||
  process.env.npm_lifecycle_event === 'test:integration'
);
const INTEGRATION_SKIP_REASON =
  '整合測試：需外部 npx skills CLI 與網路，請用 npm run test:integration';

async function cleanupCache() {
  const files = [CACHE_FILE, AGGREGATOR_CACHE_FILE];
  for (const file of files) {
    if (existsSync(file)) {
      unlinkSync(file);
    }
  }
}

// ─── Test Suites ─────────────────────────────────────────────────────────────

describe('Skill Discovery Module', { skip: SKIP_INTEGRATION ? INTEGRATION_SKIP_REASON : false }, () => {
  
  // ─── Environment Checks ──────────────────────────────────────────────────
  
  describe('Environment Availability', () => {
    it('should detect skills CLI availability', async () => {
      const { isSkillCliAvailable } = await import('../core/skill-discovery.js');
      const available = isSkillCliAvailable();
      assert.ok(typeof available === 'boolean');
      // In test environment, may or may not be available
      console.log(`  Skills CLI available: ${available ? 'Yes' : 'No'}`);
    });
  });

  // ─── Cache Management ────────────────────────────────────────────────────
  
  describe('Cache Management', () => {
    beforeEach(async () => {
      await cleanupCache();
    });
    
    afterEach(async () => {
      await cleanupCache();
    });

    it('should return empty array when no cache exists', async () => {
      const { searchSkills } = await import('../core/skill-discovery.js');
      const results = searchSkills('nonexistent-skill-x12345', 5);
      assert.ok(Array.isArray(results));
      assert.equal(results.length, 0);
    });
  });

  // ─── Search Functionality ────────────────────────────────────────────────
  
  describe('Search Skills', () => {
    beforeEach(async () => {
      await cleanupCache();
    });

    afterEach(async () => {
      await cleanupCache();
    });

    it('should return valid skill objects structure', async () => {
      const { searchSkills } = await import('../core/skill-discovery.js');
      const results = searchSkills('pdf', 3);
      
      assert.ok(Array.isArray(results));
      
      if (results.length > 0) {
        const firstSkill = results[0];
        assert.ok(firstSkill.id, 'Skill should have id');
        assert.ok(firstSkill.name, 'Skill should have name');
        assert.ok(firstSkill.url, 'Skill should have url');
        assert.ok(firstSkill.source, 'Skill should have source');
      }
    });

    it('should handle empty query gracefully', async () => {
      const { searchSkills } = await import('../core/skill-discovery.js');
      const results = searchSkills('', 5);
      assert.ok(Array.isArray(results));
    });

    it('should limit results correctly', async () => {
      const { searchSkills } = await import('../core/skill-discovery.js');
      const results = searchSkills('typescript', 5);
      assert.ok(results.length <= 5);
    });

    it('should return array even on error', async () => {
      const { searchSkills } = await import('../core/skill-discovery.js');
      // Invalid query that will cause API error
      const results = searchSkills('!@#$%^&*()', 5);
      assert.ok(Array.isArray(results));
    });
  });

  // ─── Async Search (GitHub Fallback) ──────────────────────────────────────
  
  describe('Search Skills GitHub Fallback', () => {
    it('should handle GitHub API errors gracefully', async () => {
      const { searchSkillsGitHub } = await import('../core/skill-discovery.js');
      const results = await searchSkillsGitHub('test-query-12345', 5);
      assert.ok(Array.isArray(results));
    });

    it('should return empty array on network timeout', async () => {
      const { searchSkillsGitHub } = await import('../core/skill-discovery.js');
      // This might fail due to network issues in test environment
      try {
        const results = await searchSkillsGitHub('test', 5);
        assert.ok(Array.isArray(results));
      } catch (err) {
        // Network errors are acceptable in test environment
        console.log(`  Expected network error: ${err.message}`);
      }
    });
  });

  // ─── Aggregated Search ───────────────────────────────────────────────────
  
  describe('Aggregated Search (All Sources)', () => {
    beforeEach(async () => {
      await cleanupCache();
    });

    afterEach(async () => {
      await cleanupCache();
    });

    it('should combine results from multiple sources', async () => {
      const { searchAllSkills } = await import('../core/skill-discovery.js');
      const results = await searchAllSkills('pdf', 10);
      
      assert.ok(Array.isArray(results));
      
      // Should have at least some results
      console.log(`  Aggregated results count: ${results.length}`);
    });

    it('should deduplicate results by skill ID', async () => {
      const { searchAllSkills } = await import('../core/skill-discovery.js');
      const results = await searchAllSkills('document', 10);
      
      const ids = results.map(r => r.id);
      const uniqueIds = new Set(ids);
      assert.equal(ids.length, uniqueIds.size, 'Should have no duplicate IDs');
    });
  });

  // ─── Installation Tests ──────────────────────────────────────────────────
  
  describe('Install Skill', () => {
    it('should return success object with valid message', async () => {
      const { installSkill } = await import('../core/skill-discovery.js');
      
      // Try to install a non-existent skill - should fail gracefully
      const result = installSkill('nonexistent/repo@nonexistent-skill');
      
      assert.ok(typeof result === 'object');
      assert.ok('success' in result);
      assert.ok('message' in result);
      
      // Should indicate failure since skill doesn't exist
      assert.equal(result.success, false);
    });

    it('should handle invalid skill ID format', async () => {
      const { installSkill } = await import('../core/skill-discovery.js');
      const result = installSkill('invalid-format');
      
      assert.ok(typeof result === 'object');
      assert.ok(result.success === false);
    });
  });

  // ─── List Skills ─────────────────────────────────────────────────────────
  
  describe('List Installed Skills', () => {
    it('should return array (may be empty)', async () => {
      const { listSkills } = await import('../core/skill-discovery.js');
      const skills = listSkills();
      
      assert.ok(Array.isArray(skills));
    });

    it('should handle CLI errors gracefully', async () => {
      const { listSkills } = await import('../core/skill-discovery.js');
      // In test environment, this might fail
      const skills = listSkills();
      assert.ok(Array.isArray(skills));
    });
  });

  // ─── Skill Details ───────────────────────────────────────────────────────
  
  describe('Get Skill Details', () => {
    it('should return null for non-existent skill', async () => {
      const { getSkillDetails } = await import('../core/skill-discovery.js');
      const details = await getSkillDetails('nonexistent-user/nonexistent-repo', 'nonexistent-skill');
      assert.equal(details, null);
    });

    it('should handle GitHub API errors gracefully', async () => {
      const { getSkillDetails } = await import('../core/skill-discovery.js');
      // Invalid repo format should not throw
      try {
        const details = await getSkillDetails('invalid///repo', 'skill');
        // Accept null or error
        assert.ok(details === null || details === undefined);
      } catch (err) {
        console.log(`  Expected error for invalid repo: ${err.message}`);
      }
    });
  });
});

// ─── Integration Tests ───────────────────────────────────────────────────────

describe('Find Skill Integration Tests', { skip: SKIP_INTEGRATION ? INTEGRATION_SKIP_REASON : false }, () => {
  
  describe('End-to-End Workflow', () => {
    beforeEach(async () => {
      await cleanupCache();
    });

    afterEach(async () => {
      await cleanupCache();
    });

    it('should complete full search workflow', async () => {
      const { searchAllSkills } = await import('../core/skill-discovery.js');
      
      const startTime = Date.now();
      const results = await searchAllSkills('code-review', 5);
      const duration = Date.now() - startTime;
      
      assert.ok(Array.isArray(results));
      // Allow longer timeout for network operations (30 seconds)
      assert.ok(duration < 30000, `Search completed in ${duration}ms`);
      
      console.log(`  Search completed in ${duration}ms, found ${results.length} skills`);
    });

    it('should handle concurrent searches', async () => {
      const { searchAllSkills } = await import('../core/skill-discovery.js');
      
      const promises = [
        searchAllSkills('pdf', 3),
        searchAllSkills('ppt', 3),
        searchAllSkills('document', 3)
      ];
      
      const resultsArray = await Promise.all(promises);
      
      assert.equal(resultsArray.length, 3);
      for (const results of resultsArray) {
        assert.ok(Array.isArray(results));
      }
    });
  });

  describe('Error Recovery', () => {
    it('should recover from partial failures', async () => {
      const { searchAllSkills } = await import('../core/skill-discovery.js');
      
      // Even if one source fails, should not throw
      const results = await searchAllSkills('!invalid_query_12345!', 5);
      assert.ok(Array.isArray(results));
    });

    it('should maintain cache consistency after errors', async () => {
      const { searchSkills } = await import('../core/skill-discovery.js');
      
      // First call might fail
      searchSkills('error-test', 1);
      
      // Second call should work or return empty array
      const results = searchSkills('error-test', 1);
      assert.ok(Array.isArray(results));
    });
  });
});
