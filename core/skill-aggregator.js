/**
 * @module skill-aggregator
 * Multi-source skill aggregation and unified skill discovery system.
 * 
 * Aggregates skills from multiple sources:
 * - skills.sh (primary, via npx skills CLI)
 * - GitHub Search (fallback for comprehensive coverage)
 * - Local cache (offline support)
 * 
 * Provides unified interface with common data model.
 */

import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

// ─── Constants ────────────────────────────────────────────────────────────────

const CACHE_DIR = join(homedir(), '.tool-calling', 'skills-cache');
const CACHE_FILE = join(CACHE_DIR, 'skills-aggregated.json');
const CACHE_TTL = 3600000; // 1 hour

// Skill source priorities
const SOURCE_PRIORITY = {
  'skills.sh': 100,
  'github': 80,
  'local': 50,
  'unknown': 10
};

// ─── Data Models ──────────────────────────────────────────────────────────────

/**
 * Unified Skill Model
 * Standardizes data structure across all sources
 */
export class Skill {
  /**
   * @param {Object} data
   * @param {string} data.id - Unique identifier (owner/repo@skill-name or full URL)
   * @param {string} data.name - Skill display name
   * @param {string} data.description - Brief description
   * @param {string} data.source - Source platform (skills.sh, github, etc.)
   * @param {string} data.url - Source URL
   * @param {number} data.installs - Installation count (for ranking)
   * @param {string[]} [data.tags] - Relevant tags/categories
   * @param {string} [data.language] - Primary language
   * @param {boolean} [data.isOfficial] - Whether from official source
   */
  constructor(data) {
    this.id = data.id;
    this.name = data.name;
    this.description = data.description || '';
    this.source = data.source;
    this.url = data.url;
    this.installs = data.installs || 0;
    this.tags = data.tags || [];
    this.language = data.language;
    this.isOfficial = data.isOfficial || false;
    this.score = this._calculateScore();
    this.createdAt = new Date().toISOString();
  }

  _calculateScore() {
    const baseScore = SOURCE_PRIORITY[this.source] || 50;
    const installBonus = Math.min(Math.log10(this.installs + 1) * 5, 30);
    const officialBonus = this.isOfficial ? 20 : 0;
    return baseScore + installBonus + officialBonus;
  }

  /**
   * Convert to plain object for serialization
   */
  toJSON() {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      source: this.source,
      url: this.url,
      installs: this.installs,
      tags: this.tags,
      language: this.language,
      isOfficial: this.isOfficial,
      score: this.score
    };
  }

  /**
   * Create Skill from raw data with type detection
   */
  static fromRaw(data, source) {
    const normalized = typeof data === 'string' ? { name: data } : data;
    
    // Auto-detect ID format
    let id = normalized.id;
    if (!id && normalized.name) {
      // Try to parse owner/repo@skill pattern
      const match = normalized.name.match(/^([^/]+)\/([^/@]+)(?:@([\w-]+))?$/);
      if (match) {
        id = `${match[1]}/${match[2]}${match[3] ? `@${match[3]}` : ''}`;
      } else {
        id = normalized.name;
      }
    }

    return new Skill({
      id,
      name: normalized.name || id,
      description: normalized.description || '',
      source,
      url: normalized.url || `https://skills.sh/${id}`,
      installs: normalized.installs || 0,
      tags: normalized.tags || [],
      language: normalized.language,
      isOfficial: normalized.isOfficial || false
    });
  }
}

// ─── Cache Management ─────────────────────────────────────────────────────────

/**
 * Load cached aggregated results
 */
function loadCache() {
  try {
    if (existsSync(CACHE_FILE)) {
      const data = JSON.parse(readFileSync(CACHE_FILE, 'utf8'));
      // Validate cache freshness
      if (Date.now() - data.timestamp < CACHE_TTL) {
        return data;
      }
    }
  } catch (err) {
    console.warn('[SkillAggregator] Cache load error:', err.message);
  }
  return null;
}

/**
 * Save aggregated results to cache
 */
function saveCache(data) {
  try {
    ensureCacheDir();
    writeFileSync(CACHE_FILE, JSON.stringify({
      ...data,
      timestamp: Date.now(),
      cachedAt: new Date().toISOString()
    }, null, 2), 'utf8');
  } catch (err) {
    console.warn('[SkillAggregator] Cache save error:', err.message);
  }
}

/**
 * Ensure cache directory exists
 */
function ensureCacheDir() {
  if (!existsSync(CACHE_DIR)) {
    mkdirSync(CACHE_DIR, { recursive: true });
  }
}

// ─── Source: Skills.sh (Primary) ──────────────────────────────────────────────

/**
 * Search skills via npx skills CLI
 * Returns array of Skill objects
 */
export async function searchFromSkillsSh(query, limit = 10) {
  try {
    // Check if CLI is available
    if (!isSkillCliAvailable()) {
      throw new Error('npx skills CLI not available');
    }

    // Execute search with timeout
    const output = execSync(
      `npx skills find "${query}" --limit ${limit} --json 2>/dev/null || npx skills find "${query}" --limit ${limit}`,
      { encoding: 'utf8', timeout: 30000 }
    );

    // Parse JSON output first
    let rawResults = [];
    try {
      rawResults = JSON.parse(output);
      if (Array.isArray(rawResults)) {
        return rawResults.map(r => Skill.fromRaw(r, 'skills.sh'));
      }
    } catch {
      // Fall back to parsing human-readable output
      rawResults = parseSkillsShOutput(output);
    }

    return rawResults.map(r => Skill.fromRaw(r, 'skills.sh'));
  } catch (err) {
    console.warn(`[SkillAggregator] skills.sh search failed for "${query}":`, err.message);
    return [];
  }
}

/**
 * Parse human-readable skills.sh output
 */
function parseSkillsShOutput(output) {
  const lines = output.split('\n').filter(line => line.trim() && !line.includes('[Agnes]'));
  const results = [];

  for (const line of lines) {
    // Match patterns like "owner/repo@skill-name  X installs"
    const match = line.match(/(\w+\/\w+@[\w-]+)\s+(\d+(?:\.\d+)?(?:M|K)?)\s*(installs?|downloads?)?/i);
    if (match) {
      const id = match[1];
      const installsStr = match[2] || '0';
      const installs = parseInstallCount(installsStr);
      
      results.push({
        id,
        name: id.split('@')[1] || id.split('/').pop(),
        description: line.replace(id, '').trim(),
        installs
      });
    }
  }

  return results;
}

/**
 * Parse installation count string (e.g., "2.9M", "829.5K")
 */
export function parseInstallCount(str) {
  if (!str) return 0;
  str = str.toUpperCase().trim();
  
  const multipliers = {
    'M': 1000000,
    'K': 1000
  };
  
  for (const [suffix, multiplier] of Object.entries(multipliers)) {
    if (str.endsWith(suffix)) {
      const num = parseFloat(str.slice(0, -1));
      return isNaN(num) ? 0 : Math.round(num * multiplier);
    }
  }
  
  return parseInt(str, 10) || 0;
}

/**
 * Get skill details from skills.sh
 */
export async function getSkillDetailsFromSkillsSh(skillId) {
  try {
    const output = execSync(
      `npx skills info ${skillId} 2>/dev/null || echo ""`,
      { encoding: 'utf8', timeout: 10000 }
    );
    
    // Parse basic info
    return {
      id: skillId,
      rawOutput: output,
      success: output.length > 0
    };
  } catch (err) {
    return { id: skillId, success: false, error: err.message };
  }
}

// ─── Source: GitHub Search (Fallback) ────────────────────────────────────────

/**
 * Search skills via GitHub API
 * Looks for SKILL.md files in repositories
 */
export async function searchFromGitHub(query, limit = 10) {
  try {
    const encodedQuery = encodeURIComponent(query);
    const apiUrl = `https://api.github.com/search/code?q=${encodedQuery}+filename:SKILL.md&per_page=${limit}`;
    
    const response = await fetch(apiUrl, {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Tool-Calling-Skill-Aggregator'
      },
      signal: AbortSignal.timeout(8000)
    });

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status}`);
    }

    const data = await response.json();
    const results = [];

    for (const item of data.items || []) {
      // Extract owner/repo from path
      const pathParts = item.path.split('/');
      const repoName = pathParts[0];
      const orgName = pathParts[1];
      const skillName = item.name.replace('.md', '');
      
      results.push({
        id: `${orgName}/${repoName}@${skillName}`,
        name: skillName,
        description: item.repository?.description || `Skill: ${skillName}`,
        url: item.html_url,
        installs: 0, // GitHub API doesn't provide install count
        tags: item.repository?.topics || [],
        isOfficial: false
      });
    }

    return results.map(r => Skill.fromRaw(r, 'github'));
  } catch (err) {
    console.warn('[SkillAggregator] GitHub search failed:', err.message);
    return [];
  }
}

/**
 * Get skill content directly from GitHub
 */
export async function getSkillDetailsFromGitHub(repo, skillName) {
  try {
    const branches = ['main', 'master', 'dev'];
    
    for (const branch of branches) {
      try {
        const response = await fetch(
          `https://raw.githubusercontent.com/${repo}/${branch}/skills/${skillName}/SKILL.md`,
          { signal: AbortSignal.timeout(5000) }
        );
        
        if (response.ok) {
          const content = await response.text();
          return { content, branch, repo, skillName };
        }
      } catch (err) {
        continue; // Try next branch
      }
    }
    
    return null;
  } catch (err) {
    return null;
  }
}

// ─── Source: Local Cache (Offline Support) ────────────────────────────────────

/**
 * Get locally cached skills
 */
export function getLocalCachedSkills() {
  const cache = loadCache();
  if (!cache || !cache.skills) {
    return [];
  }
  
  return cache.skills.map(s => new Skill(s));
}

/**
 * Update local cache with new results
 */
export function updateLocalCache(results) {
  ensureCacheDir();
  const existing = loadCache();
  const cachedSkills = existing?.skills || [];
  
  // Merge and deduplicate by ID
  const skillMap = new Map();
  
  // Add existing skills
  for (const skill of cachedSkills) {
    if (skill instanceof Skill) {
      skillMap.set(skill.id, skill);
    } else {
      skillMap.set(skill.id, new Skill(skill));
    }
  }
  
  // Add new skills (overwrite existing)
  for (const skill of results) {
    if (skill instanceof Skill) {
      skillMap.set(skill.id, skill);
    } else {
      skillMap.set(skill.id, new Skill(skill));
    }
  }
  
  saveCache({
    skills: Array.from(skillMap.values()),
    lastUpdated: new Date().toISOString()
  });
  
  return Array.from(skillMap.values());
}

// ─── Aggregation Engine ───────────────────────────────────────────────────────

/**
 * Main search function with multi-source aggregation
 * 
 * @param {string} query - Search query
 * @param {number} limit - Maximum results
 * @param {Object} options - Search options
 * @param {boolean} options.useCache - Use local cache (default: true)
 * @param {boolean} options.fallbackToGitHub - Use GitHub as fallback (default: true)
 * @param {'all'|'popular'|'recent'} options.sort - Result sorting method
 * @returns {Promise<Skill[]>} Sorted array of unique skills
 */
export async function searchAllSources(query, limit = 10, options = {}) {
  const {
    useCache = true,
    fallbackToGitHub = true,
    sort = 'all'
  } = options;

  const allResults = new Map(); // Deduplicate by ID

  // Try primary source first (skills.sh)
  try {
    const primaryResults = await searchFromSkillsSh(query, limit);
    for (const skill of primaryResults) {
      allResults.set(skill.id, skill);
    }
  } catch (err) {
    console.warn('[SkillAggregator] Primary source failed, trying fallbacks:', err.message);
  }

  // If no results and fallback enabled, try GitHub
  if (allResults.size === 0 && fallbackToGitHub) {
    try {
      const githubResults = await searchFromGitHub(query, limit);
      for (const skill of githubResults) {
        allResults.set(skill.id, skill);
      }
    } catch (err) {
      console.warn('[SkillAggregator] GitHub fallback also failed:', err.message);
    }
  }

  // Try cache if enabled
  if (useCache && allResults.size < limit) {
    const cachedSkills = getLocalCachedSkills();
    for (const skill of cachedSkills) {
      if (!allResults.has(skill.id)) {
        allResults.set(skill.id, skill);
      }
    }
  }

  // Convert to array and sort
  let results = Array.from(allResults.values());

  // Apply sorting
  switch (sort) {
    case 'popular':
      results.sort((a, b) => b.installs - a.installs);
      break;
    case 'recent':
      results.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      break;
    case 'score':
    default:
      results.sort((a, b) => b.score - a.score);
      break;
  }

  // Limit results
  results = results.slice(0, limit);

  // Update cache
  if (results.length > 0) {
    updateLocalCache(results);
  }

  return results;
}

/**
 * List all installed skills (from skills CLI)
 */
export function listAllInstalledSkills() {
  try {
    const output = execSync('npx skills list', { 
      encoding: 'utf8',
      timeout: 10000 
    });
    
    const lines = output.split('\n')
      .filter(line => line.trim() && !line.startsWith('Project') && !line.includes('[Agnes]'))
      .map(line => line.trim());
    
    return lines;
  } catch (err) {
    console.warn('[SkillAggregator] Failed to list installed skills:', err.message);
    return [];
  }
}

/**
 * Install a skill (delegates to skills.sh CLI)
 */
export async function installSkill(skillId, options = {}) {
  const { global = false, agent = null } = options;
  
  try {
    let command = `npx skills add ${skillId} --yes`;
    
    if (global) {
      command += ' -g';
    }
    
    if (agent) {
      command += ` -a ${agent}`;
    }
    
    const output = execSync(command, {
      encoding: 'utf8',
      stdio: 'pipe',
      timeout: 60000
    });
    
    return {
      success: true,
      message: `Successfully installed ${skillId}`,
      output
    };
  } catch (err) {
    return {
      success: false,
      message: err.message,
      error: err.stderr || err.message
    };
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
 * Get skill recommendations based on category
 */
export async function recommendSkills(category, limit = 5) {
  const categoryQueries = {
    'pdf': ['pdf', 'document', 'reader'],
    'ppt': ['powerpoint', 'slides', 'presentation', 'pptx'],
    'code-review': ['code-review', 'review', 'linting'],
    'testing': ['test', 'jest', 'pytest', 'tdd'],
    'web-design': ['frontend', 'ui', 'ux', 'design'],
    'ai-agent': ['agent', 'assistant', 'automation']
  };
  
  const queries = categoryQueries[category.toLowerCase()] || [category];
  const allSkills = new Map();
  
  for (const query of queries) {
    const results = await searchAllSources(query, limit * 2);
    for (const skill of results) {
      if (!allSkills.has(skill.id)) {
        allSkills.set(skill.id, skill);
      }
    }
  }
  
  // Sort by score and limit
  return Array.from(allSkills.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

// ─── Re-export for backward compatibility ─────────────────────────────────────

// Keep old exports working
export { 
  searchSkills as searchSkillsLegacy,
  installSkill as installSkillLegacy,
  listSkills as listSkillsLegacy,
  isSkillCliAvailable as isSkillCliAvailableLegacy,
  getSkillDetails as getSkillDetailsLegacy
} from './skill-discovery.js';
