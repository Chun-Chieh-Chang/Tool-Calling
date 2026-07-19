#!/usr/bin/env node

/**
 * Tool-Calling Scanner
 * 解析 GitHub URL，自動提取專案資訊並生成工具註冊條目格式
 */

import { parseArgs } from 'node:util';

// ─── 輔助函式 ─────────────────────────────────────────────────────────────

/**
 * 根據名稱生成 kebab-case ID
 */
function generateId(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * 簡易 HTML 標籤提取器
 */
function extractMeta(html) {
  const result = {
    title: '',
    description: '',
    about: '',
    language: 'other',
    topics: [],
  };

  // 提取 title
  const titleMatch = html.match(/<title>([^<]*)<\/title>/i);
  if (titleMatch) {
    result.title = titleMatch[1].replace('GitHub - ', '').split(':')[0].trim();
  }

  // 提取 meta description
  const descMatch = html.match(/<meta\s+name="description"\s+content="([^"]*)"/i);
  if (descMatch) {
    result.description = descMatch[1].replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
  }

  // 提取 repo description (About)
  const aboutMatch = html.match(/<p class="f4 my-3">([^<]*)<\/p>/i) || html.match(/<p class="f4 mb-3">([^<]*)<\/p>/i);
  if (aboutMatch) {
    result.about = aboutMatch[1].trim();
  }

  // 提取語言
  const langMatch = html.match(/<span class="color-fg-default text-bold mr-1">([^<]*)<\/span>/i);
  if (langMatch) {
    result.language = langMatch[1].toLowerCase().trim();
  }

  // 提取 topics
  const topicRegex = /<a[^>]*class="[^"]*topic-tag[^"]*"[^>]*>([^<]*)<\/a>/gi;
  let tMatch;
  while ((tMatch = topicRegex.exec(html)) !== null) {
    result.topics.push(tMatch[1].trim().toLowerCase());
  }

  return result;
}

/**
 * 根據描述與標籤猜測分類
 */
function guessCategory(desc, topics) {
  const text = (desc + ' ' + topics.join(' ')).toLowerCase();
  if (text.includes('security') || text.includes('vulnerability') || text.includes('pentest')) return '安全性';
  if (text.includes('image') || text.includes('video') || text.includes('animation') || text.includes('generative')) return '多媒體生成';
  if (text.includes('test') || text.includes('e2e') || text.includes('playwright') || text.includes('automation')) return '測試與自動化';
  if (text.includes('learn') || text.includes('tutorial') || text.includes('course') || text.includes('skills')) return '學習資源';
  if (text.includes('ai') || text.includes('llm') || text.includes('agent')) return 'AI 框架';
  if (text.includes('graph') || text.includes('knowledge')) return '知識管理';
  if (text.includes('file') || text.includes('storage') || text.includes('system')) return '基礎設施';
  if (text.includes('document') || text.includes('ppt') || text.includes('presentation')) return '文件生產力';
  return '其他';
}

/**
 * 根據 URL 與語言猜測安裝方式
 */
function guessInstall(url, language) {
  if (language === 'python') return { method: 'pip', command: `pip install git+${url}.git` };
  if (language === 'typescript' || language === 'javascript') return { method: 'npm', command: `npm install ${url}` };
  if (language === 'php') return { method: 'composer', command: `composer require ...` };
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
    const res = await fetch(rootUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      }
    });

    if (!res.ok) {
      throw new Error(`HTTP 錯誤: ${res.status} ${res.statusText}`);
    }

    const html = await res.text();
    const meta = extractMeta(html);

    let description = meta.about || meta.description;

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

export { scan };
