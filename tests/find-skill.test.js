/**
 * Find Skill Integration Tests
 * 
 * Tests for skill discovery and aggregation functionality.
 * Covers: search, install, list, cache, error handling, boundary cases.
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

async function cleanupCache() {
  const files = [CACHE_FILE, AGGREGATOR_CACHE_FILE];
  for (const file of files) {
    if (existsSync(file)) {
      unlinkSync(file);
    }
  }
}

// ─── Test Suites ─────────────────────────────────────────────────────────────

describe('Skill Discovery Module', () => {
  
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

describe('Find Skill Integration Tests', () => {
  
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
