#!/usr/bin/env node

import { parseArgs } from 'node:util';
import { generateId } from '../core/registry.js';



/**
 * 根據描述與標籤猜測分類
 */
const CATEGORY_RULES = [
  // 安全性
  { cat: '安全性', keywords: ['cybersec', 'osint', 'pentest', 'vulnerability', 'exploit', 'ctf'] },
  // 瀏覽器自動化
  { cat: '瀏覽器自動化', keywords: ['browser-automation', 'headless-browser', 'anti-detect', 'playwright'] },
  // 資料庫
  { cat: '資料庫', keywords: ['database', 'nosql', 'postgres', 'mongodb', 'sql-schema', 'azure-storage'] },
  // 行銷
  { cat: '行銷', keywords: ['marketing', 'copywriting', 'copy-editing', 'advertising', 'cro'] },
  // 設計
  { cat: '設計', keywords: ['typography', 'frontend-design', 'graphic design', 'figma'] },
  // 音訊
  { cat: '音訊', keywords: ['tts', 'text-to-speech', 'speech-to-text', 'podcast'] },
  // 影片
  { cat: '影片', keywords: ['youtube', 'transcript', 'lip-sync', 'video-generation'] },
  // 研究
  { cat: '研究', keywords: ['research', 'arxiv', 'sota', 'publication'] },
  // 文件生產力
  { cat: '文件生產力', keywords: ['powerpoint', 'presentation', 'spreadsheet', 'docx', 'xlsx'] },
  // 知識管理
  { cat: '知識管理', keywords: ['knowledge-graph', 'knowledge-base', 'memory'] },
  // 基礎設施
  { cat: '基礎設施', keywords: ['infrastructure', 'devops', 'kubernetes', 'docker', 'deploy'] },
  // 測試與自動化
  { cat: '測試與自動化', keywords: ['e2e', 'playwright', 'testing', 'benchmark', 'qa'] },
  // API 整合
  { cat: 'API 整合', keywords: ['mcp-server', 'webhook', 'graphql', 'rest-api', 'sdk'] },
  // AI 代理
  { cat: 'AI 代理', keywords: ['agent-framework', 'agent-toolkit', 'agent harness', 'agentic'] },
  // 多媒體生成
  { cat: '多媒體生成', keywords: ['text-to-image', 'image-generation', 'generative-ai', 'ai-art'] },
  // 學習資源
  { cat: '學習資源', keywords: ['tutorial', 'awesome-list', 'reference-guide', 'type-challenges'] },
];

/**
 * 檢查關鍵字是否以完整詞彙（word boundary）存在於 text 中
 */
function matchWord(text, kw) {
  const idx = text.indexOf(kw);
  if (idx === -1) return false;
  const before = idx === 0 || text[idx - 1] === ' ' || text[idx - 1] === '-' || text[idx - 1] === '_';
  const after = idx + kw.length >= text.length || text[idx + kw.length] === ' ' || text[idx + kw.length] === '-' || text[idx + kw.length] === '_';
  return before && after;
}

const FALLBACK_KEYWORDS = [
  { cat: '安全性', keywords: ['security', 'vulnerability', 'pentest', 'osint', 'cybersec'] },
  { cat: '瀏覽器自動化', keywords: ['browser-automation', 'undetected'] },
  { cat: '資料庫', keywords: ['database', 'nosql', 'postgres', 'mysql', 'mongodb', 'convex'] },
  { cat: '行銷', keywords: ['marketing', 'copywriting', 'copy-editing', 'advertising'] },
  { cat: '設計', keywords: ['design', 'figma', 'typography'] },
  { cat: '音訊', keywords: ['audio', 'music', 'sound', 'speech', 'voice', 'podcast'] },
  { cat: '影片', keywords: ['video', 'youtube', 'transcript', 'animation', 'avatar'] },
  { cat: '研究', keywords: ['research', 'paper', 'arxiv', 'sota', 'publication', 'survey'] },
  { cat: '文件生產力', keywords: ['document', 'presentation', 'excel', 'word', 'pdf', 'spreadsheet', 'powerpoint'] },
  { cat: '數據分析', keywords: ['analytics', 'monitoring', 'telemetry', 'observability'] },
  { cat: '知識管理', keywords: ['knowledge', 'memory', 'rag'] },
  { cat: '基礎設施', keywords: ['infrastructure', 'devops', 'kubernetes', 'docker', 'cloud', 'deploy', 'hosting'] },
  { cat: '測試與自動化', keywords: ['testing', 'test-driven', 'qa', 'lint', 'quality', 'audit', 'benchmark'] },
  { cat: 'API 整合', keywords: ['integration', 'mcp-server', 'webhook', 'graphql', 'sdk'] },
  { cat: 'AI 代理', keywords: ['agent-framework', 'agent-toolkit', 'autonomous', 'agentic'] },
  { cat: '多媒體生成', keywords: ['image', 'generative', 'creative'] },
  { cat: '學習資源', keywords: ['tutorial', 'course', 'guide', 'handbook', 'curated'] },
];

function guessCategory(desc, topics) {
  const text = (desc + ' ' + topics.join(' ')).toLowerCase();

  // Phase 1: 精準比對 — 複合關鍵字 + word boundary
  for (const { cat, keywords } of CATEGORY_RULES) {
    if (keywords.some(k => matchWord(text, k))) return cat;
  }

  // Phase 2: 一般比對 — 也使用 word boundary
  for (const { cat, keywords } of FALLBACK_KEYWORDS) {
    if (keywords.some(k => matchWord(text, k))) return cat;
  }

  // Phase 3: 從 URL 推測
  if (text.includes('microsoft') || text.includes('azure')) return '基礎設施';
  if (text.includes('aws') || text.includes('google-cloud')) return '基礎設施';

  if (text.includes('ai') || text.includes('llm')) return 'AI 代理';
  if (text.includes('agent') || text.includes('skill')) return '開發工具';
  if (text.includes('cli') || text.includes('command')) return '開發工具';
  if (text.includes('automation')) return '測試與自動化';
  return '其他';
}

/**
 * 根據 URL 與語言猜測安裝方式
 */
function guessInstall(url, language) {
  if (language === 'python') return { method: 'pip', command: `pip install git+${url}.git` };
  if (language === 'typescript' || language === 'javascript') return { method: 'npm', command: `npm install ${url}` };
  if (language === 'php') {
    const parts = url.split('/');
    const repo = parts[parts.length - 1];
    const owner = parts[parts.length - 2];
    return { method: 'composer', command: `composer require ${owner}/${repo}` };
  }
  if (language === 'rust') return { method: 'cargo', command: `cargo install --git ${url}` };
  return { method: 'git-clone', command: `git clone ${url}.git` };
}

// ─── 主程式 ─────────────────────────────────────────────────────────────────

async function scan(url, options = {}) {
  const { silent } = options;

  if (!silent) console.log(`\x1b[36m掃描 URL:\x1b[0m ${url}`);

  // 驗證 URL (支援 Monorepo 子目錄)
  const githubRegex = /^https?:\/\/github\.com\/([^/]+)\/([^/]+)(?:\/(?:tree|blob)\/([^/]+)\/(.+))?\/?$/;
  const match = url.match(githubRegex);
  if (!match) {
    throw new Error('僅支援 GitHub 倉庫 URL (格式: https://github.com/owner/repo 或 https://github.com/owner/repo/tree/main/subpath)');
  }

  const [, owner, repo, branch, subpath] = match;

  try {
    // 取得基礎 repo 資訊
    const rootUrl = `https://github.com/${owner}/${repo}`;
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}`;
    const res = await fetch(apiUrl, {
      headers: {
        'User-Agent': 'Tool-Calling-Scanner/1.0',
        'Accept': 'application/vnd.github.v3+json',
      }
    });

    if (!res.ok) {
      throw new Error(`HTTP 錯誤: ${res.status} ${res.statusText}`);
    }

    const repoData = await res.json();
    const meta = {
      description: repoData.description || '',
      language: (repoData.language || 'other').toLowerCase(),
      topics: repoData.topics || [],
    };

    let description = meta.description;

    // 若有子目錄，嘗試抓取其專屬 README.md 或 SKILL.md
    if (subpath) {
      const candidates = ['SKILL.md', 'README.md'];
      for (const file of candidates) {
        const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${subpath}/${file}`;
        const rawRes = await fetch(rawUrl);
        if (rawRes.ok) {
          const readmeText = await rawRes.text();
          let content = readmeText;
          if (content.startsWith('---')) {
            const endIdx = content.indexOf('---', 3);
            if (endIdx > -1) {
              const fm = content.substring(3, endIdx);
              const descMatch = fm.match(/description:\s*(.+)/);
              if (descMatch) {
                description = descMatch[1].trim().replace(/^['"]|['"]$/g, '');
                break;
              }
              content = content.substring(endIdx + 3).trim();
            }
          }

          // 抓取第一段非標題段落
          const paragraphs = content.split('\n\n');
          const firstP = paragraphs.find(p => p.trim() && !p.startsWith('#') && !p.startsWith('!') && !p.startsWith('<') && !p.startsWith('-'));
          if (firstP) {
            description = firstP.replace(/\n/g, ' ').trim().slice(0, 200);
            break;
          }
        }
      }
    }

    description = description.replace(new RegExp(`Contribute to ${owner}/${repo}.*?GitHub\\.?`, 'i'), '').trim();
    if (!description) {
      description = `${owner}/${repo}${subpath ? '/' + subpath : ''} - 待補充描述`;
    }

    const category = guessCategory(description, meta.topics);
    // 處理基礎網址與安裝方式
    const install = guessInstall(rootUrl, meta.language);
    install.repoUrl = rootUrl;
    
    if (subpath) {
      install.method = 'git-clone-sparse';
      install.branch = branch;
      install.subpath = subpath;
    }

    // 決定名稱與 ID
    const baseName = subpath ? subpath.split('/').pop() : repo;

    const triggers = new Set([
      baseName.toLowerCase(),
      ...baseName.toLowerCase().split('-').filter(w => w.length > 2),
      ...(subpath ? [] : repo.toLowerCase().split('-').filter(w => w.length > 2)),
      ...meta.topics
    ]);

    const toolEntry = {
      id: generateId(baseName),
      name: baseName.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      url: url.replace(/\/$/, ''),
      description,
      category,
      language: meta.language || 'other',
      triggers: Array.from(triggers).slice(0, 8),
      install,
      capabilities: meta.topics.slice(0, 5),
      addedAt: new Date().toISOString(),
      status: 'experimental'
    };

    if (!silent) {
      console.log(`\x1b[32m✓ 掃描成功\x1b[0m`);
      console.log(JSON.stringify(toolEntry, null, 2));
    }

    return toolEntry;
  } catch (err) {
    if (!silent) console.error(`\x1b[31m✗ 掃描失敗:\x1b[0m ${err.message}`);
    throw err;
  }
}

// 判斷是否直接執行
if (import.meta.url === `file://${process.argv[1]}`) {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    options: {
      json: { type: 'boolean', short: 'j' },
    },
    allowPositionals: true,
  });

  const url = positionals[0];
  if (!url) {
    console.error('用法: node scripts/scan-tool.js <github-url> [--json]');
    process.exit(1);
  }

  scan(url, { silent: values.json })
    .then(result => {
      if (values.json) {
        console.log(JSON.stringify(result, null, 2));
      }
    })
    .catch(() => process.exit(1));
}

export { scan, guessCategory };
