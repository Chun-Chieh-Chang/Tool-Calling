/**
 * @module skill-discovery
 * Search and install agent skills from multiple sources.
 * Wraps npx skills CLI with local caching and fallback.
 */

import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const CACHE_DIR = join(homedir(), '.tool-calling', 'skills-cache');
const CACHE_FILE = join(CACHE_DIR, 'skills.json');

/**
 * Ensure cache directory exists
 */
function ensureCacheDir() {
  if (!existsSync(CACHE_DIR)) {
    mkdirSync(CACHE_DIR, { recursive: true });
  }
}

/**
 * Load cached results
 */
function loadCache() {
  try {
    return JSON.parse(readFileSync(CACHE_FILE, 'utf8'));
  } catch {
    return {};
  }
}

/**
 * Save results to cache
 */
function saveCache(data) {
  ensureCacheDir();
  writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2), 'utf8');
}

/**
 * Search skills using npx skills find
 * Returns array of skill objects with metadata
 */
export function searchSkills(query, limit = 10) {
  const cache = loadCache();
  const cacheKey = `${query}_${limit}`;
  
  // Check cache (valid for 1 hour)
  if (cache[cacheKey] && Date.now() - cache[cacheKey].timestamp < 3600000) {
    return cache[cacheKey].results;
  }
  
  try {
    // Use non-interactive mode for better parsing
    const output = execSync(
      `npx skills find "${query}" --limit ${limit} --json 2>/dev/null || npx skills find "${query}" --limit ${limit}`,
      { encoding: 'utf8', timeout: 30000 }
    );
    
    // Try to parse as JSON first
    let results = [];
    try {
      results = JSON.parse(output);
    } catch {
      // Fall back to parsing human-readable output
      results = parseSkillOutput(output, query);
    }
    
    // Cache results
    cache[cacheKey] = { results, timestamp: Date.now() };
    saveCache(cache);
    
    return results;
  } catch (error) {
    console.error(`Skill search failed for "${query}":`, error.message);
    return [];
  }
}

/**
 * Parse human-readable skill output
 */
function parseSkillOutput(output, query) {
  const lines = output.split('\n').filter(Boolean);
  const results = [];
  
  for (const line of lines) {
    // Match patterns like "owner/repo@skill-name" or "owner/repo/skill-name"
    const match = line.match(/(\w+\/\w+@[\w-]+)|(\w+\/\w+\/[\w-]+)/);
    if (match) {
      const id = match[1] || match[2];
      results.push({
        id,
        name: id.split('@')[1] || id.split('/').pop(),
        source: id.includes('skills.sh') ? 'skills.sh' : 'github',
        url: `https://skills.sh/${id}`,
        description: line.replace(id, '').trim(),
      });
    }
  }
  
  return results.slice(0, parseInt(process.env.SKILL_LIMIT || '10'));
}

/**
 * Install a skill using npx skills add
 */
export function installSkill(skillId) {
  try {
    const command = `npx skills add ${skillId} --yes`;
    execSync(command, { stdio: 'inherit', timeout: 60000 });
    return { success: true, message: `Installed ${skillId}` };
  } catch (error) {
    return { success: false, message: error.message };
  }
}

/**
 * List installed skills
 */
export function listSkills() {
  try {
    const output = execSync('npx skills list', { encoding: 'utf8' });
    return output.split('\n').filter(line => line.trim() && !line.startsWith('Project'));
  } catch (error) {
    return [];
  }
}

/**
 * Check if skills CLI is available
 */
export function isSkillCliAvailable() {
  try {
    execSync('npx skills --version', { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get skill details from GitHub
 */
export async function getSkillDetails(repo, skillName) {
  try {
    // Fetch SKILL.md from GitHub
    const response = await fetch(
      `https://raw.githubusercontent.com/${repo}/main/skills/${skillName}/SKILL.md`,
      { signal: AbortSignal.timeout(5000) }
    );
    
    if (!response.ok) {
      // Try default branch variations
      const branches = ['main', 'master', 'dev'];
      for (const branch of branches) {
        const altResponse = await fetch(
          `https://raw.githubusercontent.com/${repo}/${branch}/skills/${skillName}/SKILL.md`,
          { signal: AbortSignal.timeout(3000) }
        );
        if (altResponse.ok) {
          return { content: await altResponse.text(), branch };
        }
      }
      return null;
    }
    
    const content = await response.text();
    return { content, branch: 'main' };
  } catch (error) {
    return null;
  }
}
