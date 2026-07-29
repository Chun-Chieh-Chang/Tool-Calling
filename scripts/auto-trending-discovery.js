import { loadRegistry } from '../core/registry.js';
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CANDIDATES_PATH = join(__dirname, '..', 'registry', 'trending-candidates.json');

/**
 * 雲端 Auto-Trending 自動探勘管道
 * 搜尋 GitHub 熱門 AI / Tool 專案，比對本地工具庫去重，產出推薦探勘清單
 */
export async function discoverTrendingTools() {
  console.log('\x1b[36m🔍 開始執行 GitHub Trending & 熱門 AI 工具自動探勘...\x1b[0m');
  const registry = loadRegistry();
  const existingUrls = new Set(registry.tools.map(t => (t.url || '').toLowerCase().replace(/\/$/, '')));

  // GitHub Search API Query
  const searchQueries = [
    'topic:ai-agent stars:>500 pushed:>2026-06-01',
    'topic:web-scraping stars:>1000 pushed:>2026-06-01',
    'topic:mcp-server stars:>200 pushed:>2026-06-01'
  ];

  const candidateList = [];

  for (const q of searchQueries) {
    try {
      const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=10`;
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Tool-Calling-Auto-Discovery/1.0',
          'Accept': 'application/vnd.github.v3+json'
        }
      });

      if (!res.ok) {
        console.warn(`[API Warning] GitHub Search Query "${q}" returned status ${res.status}`);
        continue;
      }

      const data = await res.json();
      if (data.items && Array.isArray(data.items)) {
        data.items.forEach(repo => {
          const repoUrl = (repo.html_url || '').toLowerCase().replace(/\/$/, '');
          if (!existingUrls.has(repoUrl)) {
            candidateList.push({
              name: repo.name,
              full_name: repo.full_name,
              url: repo.html_url,
              description: repo.description || '無描述',
              stars: repo.stargazers_count,
              language: repo.language || 'Unknown',
              updatedAt: repo.pushed_at,
              topics: repo.topics || []
            });
          }
        });
      }
    } catch (err) {
      console.error(`[Error] 探勘查詢 "${q}" 失敗:`, err.message);
    }
  }

  // 去重 (By URL)
  const uniqueCandidates = Array.from(new Map(candidateList.map(item => [item.url, item])).values());

  const outputData = {
    lastUpdated: new Date().toISOString(),
    totalCandidates: uniqueCandidates.length,
    candidates: uniqueCandidates
  };

  writeFileSync(CANDIDATES_PATH, JSON.stringify(outputData, null, 2), 'utf-8');
  console.log(`\x1b[32m✓ 探勘完成！共挖掘出 \x1b[1m${uniqueCandidates.length}\x1b[0m\x1b[32m 個優質未入庫熱門專案，已儲存至 registry/trending-candidates.json\x1b[0m`);
  
  return outputData;
}
