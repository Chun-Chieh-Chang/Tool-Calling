import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const registryPath = join(__dirname, '..', 'registry', 'tools.json');

const registry = JSON.parse(readFileSync(registryPath, 'utf-8'));

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const headers = {
  'User-Agent': 'Tool-Calling-Star-Sync-Agent',
  'Accept': 'application/vnd.github.v3+json'
};
if (GITHUB_TOKEN) {
  headers['Authorization'] = `token ${GITHUB_TOKEN}`;
}

const delay = (ms) => new Promise((res) => setTimeout(res, ms));

function parseGithubUrl(url) {
  if (!url || typeof url !== 'string') return null;
  const match = url.match(/github\.com\/([^\/]+)\/([^\/]+)/i);
  if (!match) return null;
  return {
    owner: match[1],
    repo: match[2].replace(/\.git$/i, '')
  };
}

async function fetchStars(owner, repo) {
  try {
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}`;
    const res = await fetch(apiUrl, { headers, signal: AbortSignal.timeout(6000) });
    if (!res.ok) {
      if (res.status === 403 || res.status === 429) {
        console.warn(`[Rate Limit] API rate limit hit for ${owner}/${repo}`);
        return null;
      }
      return null;
    }
    const data = await res.json();
    return typeof data.stargazers_count === 'number' ? data.stargazers_count : null;
  } catch (err) {
    return null;
  }
}

async function main() {
  console.log('\x1b[36m開始自動同步 GitHub Star 數量...\x1b[0m');
  let updatedCount = 0;
  let skippedCount = 0;

  const CONCURRENCY = 5;
  const tools = registry.tools;

  for (let i = 0; i < tools.length; i += CONCURRENCY) {
    const chunk = tools.slice(i, i + CONCURRENCY);
    console.log(`處理批次 ${Math.floor(i / CONCURRENCY) + 1} / ${Math.ceil(tools.length / CONCURRENCY)}...`);

    const results = await Promise.all(
      chunk.map(async (tool) => {
        const parsed = parseGithubUrl(tool.url);
        if (!parsed) {
          skippedCount++;
          return false;
        }
        const liveStars = await fetchStars(parsed.owner, parsed.repo);
        if (liveStars !== null) {
          const oldStars = tool.stars;
          tool.stars = liveStars;
          if (oldStars !== liveStars) {
            console.log(`  ✓ ${tool.name}: ${oldStars} -> \x1b[32m${liveStars}\x1b[0m stars`);
            return true;
          }
        }
        return false;
      })
    );

    updatedCount += results.filter(Boolean).length;
    if (i + CONCURRENCY < tools.length) {
      await delay(1000);
    }
  }

  registry.lastUpdated = new Date().toISOString();
  writeFileSync(registryPath, JSON.stringify(registry, null, 2), 'utf-8');
  console.log(`\n\x1b[32m[同步完成] 成功更新 ${updatedCount} 個工具的 Star 數！\x1b[0m`);
}

main().catch((err) => {
  console.error('[Error] Star sync failed:', err);
  process.exit(1);
});
