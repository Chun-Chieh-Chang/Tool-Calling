/**
 * @module skill-discovery
 * Search and install agent skills from multiple sources.
 * Wraps npx skills CLI with local caching and GitHub API fallback.
 */

import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const CACHE_DIR = join(homedir(), '.tool-calling', 'skills-cache');
const CACHE_FILE = join(CACHE_DIR, 'skills.json');

// ─── Cache Management ────────────────────────────────────────────────────────

function ensureCacheDir() {
  if (!existsSync(CACHE_DIR)) {
    mkdirSync(CACHE_DIR, { recursive: true });
  }
}

function loadCache() {
  try {
    return JSON.parse(readFileSync(CACHE_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function saveCache(data) {
  ensureCacheDir();
  writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2), 'utf8');
}

// ─── Primary Source: Skills.sh CLI ───────────────────────────────────────────

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
    const output = execSync(
      `npx skills find "${query}" --limit ${limit} --json 2>/dev/null || npx skills find "${query}" --limit ${limit}`,
      { encoding: 'utf8', timeout: 30000 }
    );
    
    let results = [];
    try {
      results = JSON.parse(output);
    } catch {
      results = parseSkillOutput(output);
    }
    
    cache[cacheKey] = { results, timestamp: Date.now() };
    saveCache(cache);
    
    return results;
  } catch (error) {
    console.error(`Skill search failed for "${query}":`, error.message);
    return [];
  }
}

function parseSkillOutput(output) {
  const lines = output.split('\n').filter(Boolean);
  const results = [];
  
  for (const line of lines) {
    const match = line.match(/(\w+\/\w+@[\w-]+)\s+\d+\s+installs?/);
    if (match) {
      const id = match[1];
      results.push({
        id,
        name: id.split('@')[1] || id.split('/').pop(),
        source: 'skills.sh',
        url: `https://skills.sh/${id}`,
        description: line.replace(id, '').trim(),
      });
    }
  }
  
  return results.slice(0, parseInt(process.env.SKILL_LIMIT || '10'));
}

// ─── Secondary Source: GitHub Search ─────────────────────────────────────────

/**
 * Search skills via GitHub API (fallback)
 */
export async function searchSkillsGitHub(query, limit = 10) {
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
      const pathParts = item.path.split('/');
      const orgName = pathParts[1];
      const repoName = pathParts[2];
      const skillName = item.name.replace('.md', '');
      
      results.push({
        id: `${orgName}/${repoName}@${skillName}`,
        name: skillName,
        description: item.repository?.description || `Skill: ${skillName}`,
        url: item.html_url,
        source: 'github',
        installs: 0,
        tags: item.repository?.topics || []
      });
    }

    return results;
  } catch (err) {
    console.warn('[skill-discovery] GitHub search failed:', err.message);
    return [];
  }
}

// ─── Aggregated Search ───────────────────────────────────────────────────────

/**
 * Search skills from all available sources
 * Combines results from skills.sh CLI and GitHub API
 */
export async function searchAllSkills(query, limit = 10) {
  const allResults = new Map();
  
  // Try primary source first
  const primaryResults = searchSkills(query, limit);
  for (const skill of primaryResults) {
    allResults.set(skill.id, skill);
  }
  
  // Fallback to GitHub if few results
  if (allResults.size < limit / 2) {
    const githubResults = await searchSkillsGitHub(query, limit);
    for (const skill of githubResults) {
      allResults.set(skill.id, skill);
    }
  }
  
  return Array.from(allResults.values());
}

// ─── Skill Installation ──────────────────────────────────────────────────────

export function installSkill(skillId) {
  try {
    const command = `npx skills add ${skillId} --yes`;
    execSync(command, { stdio: 'inherit', timeout: 60000 });
    return { success: true, message: `Installed ${skillId}` };
  } catch (error) {
    return { success: false, message: error.message };
  }
}

export function listSkills() {
  try {
    const output = execSync('npx skills list', { encoding: 'utf8' });
    return output.split('\n').filter(line => line.trim() && !line.startsWith('Project'));
  } catch (error) {
    return [];
  }
}

export function isSkillCliAvailable() {
  try {
    // Method 1: Try direct npx call with full timeout
    try {
      execSync('npx skills --version', { 
        timeout: 45000, 
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true
      });
      return true;
    } catch (e1) {
      // Method 2: Check if npx exists first
      try {
        execSync('npx --version', { timeout: 5000, stdio: 'pipe' });
        // npx exists, try skills again with longer timeout
        try {
          execSync('npx skills --version', { 
            timeout: 60000, 
            stdio: ['pipe', 'pipe', 'pipe'],
            windowsHide: true
          });
          return true;
        } catch (e2) {
          // Skills CLI not available yet, but npx works
          console.warn('[skill-discovery] npx available but skills CLI not responding. Will attempt on first use.');
          return true; // Assume available, will download on first use
        }
      } catch (e3) {
        // Method 3: Check for skills in common locations
        const paths = [
          'node_modules/.bin/skills',
          './node_modules/.bin/skills',
          'C:\\Users\\' + process.env.USERNAME + '\\AppData\\Roaming\\npm\\skills.cmd',
          'C:\\Program Files\\nodejs\\npx.cmd'
        ];
        
        for (const p of paths) {
          try {
            execSync(`"${p}" --version`, { timeout: 5000, stdio: 'pipe' });
            return true;
          } catch {}
        }
        
        return false;
      }
    }
  } catch {
    return false;
  }
}

// ─── Skill Details ───────────────────────────────────────────────────────────

export async function getSkillDetails(repo, skillName) {
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
          return { content, branch };
        }
      } catch (err) {
        continue;
      }
    }
    
    return null;
  } catch (error) {
    return null;
  }
}
