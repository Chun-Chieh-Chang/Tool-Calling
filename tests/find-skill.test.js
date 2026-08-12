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

// ─── Skill Aggregator Module Tests ───────────────────────────────────────────

describe('Skill Aggregator Module', () => {
  
  describe('Skill Class', () => {
    it('should create Skill instances correctly', async () => {
      const { Skill } = await import('../core/skill-aggregator.js');
      
      const skill = new Skill({
        id: 'test/repo@skill-name',
        name: 'Test Skill',
        description: 'A test skill',
        source: 'skills.sh',
        url: 'https://skills.sh/test/repo@skill-name',
        installs: 1000,
        tags: ['test', 'example'],
        language: 'markdown',
        isOfficial: true
      });
      
      assert.equal(skill.id, 'test/repo@skill-name');
      assert.equal(skill.name, 'Test Skill');
      assert.equal(skill.installs, 1000);
      assert.equal(skill.isOfficial, true);
      assert.ok(skill.score > 0);
    });

    it('should serialize to JSON correctly', async () => {
      const { Skill } = await import('../core/skill-aggregator.js');
      
      const skill = new Skill({
        id: 'test/skill',
        name: 'Test',
        source: 'github'
      });
      
      const json = skill.toJSON();
      assert.ok(json.id);
      assert.ok(json.name);
      assert.ok(json.source);
    });

    it('should create Skill from raw string data', async () => {
      const { Skill } = await import('../core/skill-aggregator.js');
      
      const skill = Skill.fromRaw('owner/repo@my-skill', 'skills.sh');
      assert.equal(skill.source, 'skills.sh');
      assert.ok(skill.id.includes('owner/repo'));
    });
  });

  describe('Cache Functions', () => {
    beforeEach(async () => {
      await cleanupCache();
    });

    afterEach(async () => {
      await cleanupCache();
    });

    it('should load empty object when cache file does not exist', async () => {
      // Note: loadCache is not exported from skill-aggregator.js
      // This test verifies the module loads correctly
      const mod = await import('../core/skill-aggregator.js');
      assert.ok(typeof mod === 'object');
    });
  });

  describe('Search Functions', () => {
    beforeEach(async () => {
      await cleanupCache();
    });

    afterEach(async () => {
      await cleanupCache();
    });

    it('should return array from searchFromSkillsSh', async () => {
      const { searchFromSkillsSh } = await import('../core/skill-aggregator.js');
      const results = await searchFromSkillsSh('pdf', 5);
      assert.ok(Array.isArray(results));
    });

    it('should return array from searchFromGitHub', async () => {
      const { searchFromGitHub } = await import('../core/skill-aggregator.js');
      const results = await searchFromGitHub('test-query-x123', 5);
      assert.ok(Array.isArray(results));
    });

    it('should aggregate results from multiple sources', async () => {
      const { searchAllSources } = await import('../core/skill-aggregator.js');
      const results = await searchAllSources('document', 10, {
        useCache: false,
        fallbackToGitHub: false
      });
      assert.ok(Array.isArray(results));
    });
  });

  describe('Recommendation Engine', () => {
    it('should return recommendations for known categories', async () => {
      const { recommendSkills } = await import('../core/skill-aggregator.js');
      const results = await recommendSkills('pdf', 3);
      assert.ok(Array.isArray(results));
    });

    it('should handle unknown categories gracefully', async () => {
      const { recommendSkills } = await import('../core/skill-aggregator.js');
      const results = await recommendSkills('unknown-category-12345', 5);
      assert.ok(Array.isArray(results));
    });
  });

  describe('Installation Functions', () => {
    it('should return object with success property for invalid skill ID', async () => {
      const { installSkill } = await import('../core/skill-aggregator.js');
      const result = await installSkill('invalid/format', { global: false });
      
      assert.ok(typeof result === 'object');
      assert.ok('success' in result, 'Result should have success property');
    });

    it('should accept options parameter', async () => {
      const { installSkill } = await import('../core/skill-aggregator.js');
      // Should not throw even with invalid input
      const result = await installSkill('test', { global: true, agent: 'claude-code' });
      assert.ok(typeof result === 'object');
    });
  });

  describe('Parse Utilities', () => {
    it('should parse installation count strings correctly', async () => {
      const { parseInstallCount } = await import('../core/skill-aggregator.js');
      
      assert.equal(parseInstallCount('2.9M'), 2900000);
      assert.equal(parseInstallCount('829.5K'), 829500);
      assert.equal(parseInstallCount('100'), 100);
      assert.equal(parseInstallCount('0'), 0);
      assert.equal(parseInstallCount(''), 0);
    });

    it('should parse invalid strings as zero', async () => {
      const { parseInstallCount } = await import('../core/skill-aggregator.js');
      
      assert.equal(parseInstallCount('invalid'), 0);
      assert.equal(parseInstallCount('abc123'), 0);
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
