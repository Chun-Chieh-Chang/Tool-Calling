import { readFileSync, writeFileSync } from 'fs';
import { resolve } from './url-resolver.js';
import { scan } from './scan-tool.js';
import { loadRegistry, saveRegistry } from '../core/registry.js';

const targetUrls = [
  'https://github.com/cathrynlavery/diagram-design',
  'https://github.com/semantica-agi/semantica',
  'https://github.com/msitarzewski/agency-agents',
  'https://github.com/shiyu-coder/Kronos',
  'https://github.com/NanmiCoder/MediaCrawler',
  'https://github.com/hugohe3/ppt-master',
  'https://github.com/infiniflow/ragflow',
  'https://github.com/ZuodaoTech/everyone-can-use-english'
];

// 精確定義這 8 個工具的完整高品質詮釋資料 (經過重新解析與優化)
const enrichedMetadata = {
  'diagram-design': {
    id: 'diagram-design',
    name: 'Diagram Design',
    url: 'https://github.com/cathrynlavery/diagram-design',
    description: '29 editorial diagram types for Claude Code & Codex using self-contained HTML + SVG without Mermaid limitations.',
    category: 'UI/UX設計',
    language: 'html',
    triggers: ['diagram-design', 'diagram', 'design', 'claude-diagram', 'svg-diagram', 'editorial-diagram', 'chart-design'],
    install: { method: 'git-clone', command: 'git clone https://github.com/cathrynlavery/diagram-design.git', repoUrl: 'https://github.com/cathrynlavery/diagram-design' },
    useCase: 'Creating clean, publication-ready editorial SVG diagrams directly inside Claude Code or Codex for technical documentation and reports.',
    advantages: [
      'Provides 29 pre-designed editorial diagram templates',
      'Uses clean, self-contained HTML + SVG rendering without external chart dependencies',
      'Integrates seamlessly as a plugin/skill for Claude Code and Codex'
    ],
    negativeConstraints: [
      'Not suitable for real-time interactive dashboards or data stream visualizers',
      'Not designed for complex 3D graphic rendering'
    ],
    status: 'active'
  },
  'semantica': {
    id: 'semantica',
    name: 'Semantica',
    url: 'https://github.com/semantica-agi/semantica',
    description: 'Graph-native infrastructure for context-aware, accountable AI systems with persistent memory and governance.',
    category: '知識管理',
    language: 'python',
    triggers: ['semantica', 'agent-memory', 'ai-governance', 'context-graphs', 'ai-infrastructure', 'graph-rag', 'knowledge-graph'],
    install: { method: 'pip', command: 'pip install git+https://github.com/semantica-agi/semantica.git', repoUrl: 'https://github.com/semantica-agi/semantica' },
    useCase: 'Enabling multi-agent AI systems to maintain persistent, queryable context and decision provenance across sessions.',
    advantages: [
      'Graph-native architecture for explicit context representation',
      'Built-in governance and decision auditability for enterprise AI',
      'Native integration with multi-agent memory frameworks'
    ],
    negativeConstraints: [
      'Not suitable for stateless single-turn LLM applications',
      'Avoid for latency-critical micro-tasks where graph traversal overhead is unnecessary'
    ],
    status: 'active'
  },
  'agency-agents': {
    id: 'agency-agents',
    name: 'Agency Agents',
    url: 'https://github.com/msitarzewski/agency-agents',
    description: 'Specialized AI agency toolkit containing expert persona prompts and workflows for engineering, design, marketing, and sales.',
    category: 'AI 代理',
    language: 'shell',
    triggers: ['agency-agents', 'agency', 'agents', 'ai-agents', 'specialized-agents', 'multi-agent-framework', 'ai-agency'],
    install: { method: 'git-clone', command: 'git clone https://github.com/msitarzewski/agency-agents.git', repoUrl: 'https://github.com/msitarzewski/agency-agents' },
    useCase: 'Orchestrating end-to-end product launches by delegating subtasks to specialized personas (frontend, copywriter, growth hacker).',
    advantages: [
      'Comprehensive collection of 50+ specialized expert agent personas',
      'Structured operational processes and proven deliverable templates',
      'Easy to drop into any LLM harness or prompt runner'
    ],
    negativeConstraints: [
      'Not designed as a standalone standalone executable binary; requires an LLM runtime',
      'Avoid for single simple prompts that do not require multi-role collaboration'
    ],
    status: 'active'
  },
  'kronos': {
    id: 'kronos',
    name: 'Kronos',
    url: 'https://github.com/shiyu-coder/Kronos',
    description: 'Foundation model for the language of financial markets, supporting financial time series forecasting and quantitative analysis.',
    category: '數據分析',
    language: 'python',
    triggers: ['kronos', 'financial-ai', 'market-foundation-model', 'quant-analysis', 'financial-forecasting', 'time-series'],
    install: { method: 'pip', command: 'pip install git+https://github.com/shiyu-coder/Kronos.git', repoUrl: 'https://github.com/shiyu-coder/Kronos' },
    useCase: 'Predicting financial time series data and analyzing market trends using a specialized domain-trained foundation model.',
    advantages: [
      'Pre-trained specifically on large-scale financial market data',
      'Supports fine-tuning on custom CSV financial datasets',
      'Includes WebUI and quantitative evaluation scripts'
    ],
    negativeConstraints: [
      'Not suitable for general non-financial natural language processing tasks',
      'Do not rely solely on predictions for real-money automated trading without risk guardrails'
    ],
    status: 'active'
  },
  'mediacrawler': {
    id: 'mediacrawler',
    name: 'MediaCrawler',
    url: 'https://github.com/NanmiCoder/MediaCrawler',
    description: 'Multi-platform social media scraper for Xiaohongshu, Douyin, Kuaishou, Bilibili, Weibo, Tieba, and Zhihu.',
    category: '瀏覽器自動化',
    language: 'python',
    triggers: ['mediacrawler', 'xiaohongshu-scraper', 'douyin-crawler', 'bilibili-scraper', 'weibo-crawler', 'social-media-scraper', 'zhihu-scraper'],
    install: { method: 'git-clone', command: 'git clone https://github.com/NanmiCoder/MediaCrawler.git', repoUrl: 'https://github.com/NanmiCoder/MediaCrawler' },
    useCase: 'Collecting public posts, video metrics, and user comments from major Chinese social media platforms for market analysis.',
    advantages: [
      'Supports 7 major Chinese social media platforms in a single codebase',
      'Built-in anti-scraping mechanisms and login session storage',
      'Exports clean structured data to MySQL, Postgres, CSV, or JSON'
    ],
    negativeConstraints: [
      'Do not use for scraping personal private data without user consent',
      'Avoid high-frequency scraping that violates platform Terms of Service'
    ],
    status: 'active'
  },
  'ppt-master': {
    id: 'ppt-master',
    name: 'PPT Master',
    url: 'https://github.com/hugohe3/ppt-master',
    description: 'AI 簡報生成工具：AI turns documents or topics into native PowerPoint decks with animations, charts, and narrations.',
    category: '文件生產力',
    language: 'python',
    triggers: ['ppt-master', 'ppt', '簡報', '做簡報', 'powerpoint', 'slides'],
    capabilities: ['ppt', '簡報', 'powerpoint'],
    install: { method: 'pip', command: 'pip install git+https://github.com/hugohe3/ppt-master.git', repoUrl: 'https://github.com/hugohe3/ppt-master' },
    useCase: 'Automatically generating professional PowerPoint decks with native vector shapes and speaker notes from raw markdown reports.',
    advantages: [
      'Generates native editable PPTX shapes instead of rasterized images',
      'Supports custom template files and data-driven chart embedding',
      'Adds voice narration directly into slide speaker notes'
    ],
    negativeConstraints: [
      'Not designed for building web-based interactive slideshows',
      'Avoid using for vector graphic illustration drawing'
    ],
    status: 'active'
  },
  'ragflow': {
    id: 'ragflow',
    name: 'RAGFlow',
    url: 'https://github.com/infiniflow/ragflow',
    description: 'Open-source Retrieval-Augmented Generation (RAG) engine fusing advanced RAG with Agent capabilities for LLM context management.',
    category: '知識管理',
    language: 'go',
    triggers: ['ragflow', 'rag-engine', 'retrieval-augmented-generation', 'context-engine', 'agentic-rag', 'knowledge-base'],
    install: { method: 'git-clone', command: 'git clone https://github.com/infiniflow/ragflow.git', repoUrl: 'https://github.com/infiniflow/ragflow' },
    useCase: 'Deploying an enterprise-grade RAG pipeline with deep document parsing and multi-agent workflow orchestrations.',
    advantages: [
      'Deep document understanding for complex layout PDFs, tables, and images',
      'Combines traditional RAG with agentic retrieval workflows',
      'Out-of-the-box support for hybrid search and multi-tenant access control'
    ],
    negativeConstraints: [
      'Requires substantial system resources (Docker / Vector DB) for full deployment',
      'Not recommended for lightweight browser-only environments'
    ],
    status: 'active'
  },
  'everyone-can-use-english': {
    id: 'everyone-can-use-english',
    name: 'Everyone Can Use English',
    url: 'https://github.com/ZuodaoTech/everyone-can-use-english',
    description: 'Open-source English learning curriculum and methodology handbook for self-learners.',
    category: '學習資源',
    language: 'typescript',
    triggers: ['everyone-can-use-english', 'english-learning', 'learning-resource', 'language-curriculum', 'education'],
    install: { method: 'none', command: 'https://github.com/ZuodaoTech/everyone-can-use-english', repoUrl: 'https://github.com/ZuodaoTech/everyone-can-use-english' },
    useCase: 'Guiding self-learners through a structured 1,000-hour English proficiency learning roadmap.',
    advantages: [
      'Systematic curriculum covering pronunciation, reading, and active usage',
      '100% open-source content with interactive web portal tools',
      'Proven self-study methodology with community study tracking'
    ],
    negativeConstraints: [
      'Not an automated software library or API service',
      'Requires active human study rather than automated execution'
    ],
    status: 'active'
  }
};

function main() {
  const registry = loadRegistry();
  const summary = {
    replaced: [],
    added: [],
    totalProcessed: targetUrls.length
  };

  for (const url of targetUrls) {
    const key = Object.keys(enrichedMetadata).find(k => enrichedMetadata[k].url.toLowerCase() === url.toLowerCase());
    if (!key) continue;

    const newItem = enrichedMetadata[key];
    newItem.addedAt = new Date().toISOString();

    const existingIdx = registry.tools.findIndex(t => 
      (t.url && t.url.toLowerCase() === url.toLowerCase()) || 
      t.id === newItem.id
    );

    if (existingIdx !== -1) {
      const oldItem = registry.tools[existingIdx];
      console.log(`[REPLACE] 舊工具 ${oldItem.id} (${oldItem.category}) -> 新優化條目 ${newItem.id} (${newItem.category})`);
      registry.tools[existingIdx] = newItem;
      summary.replaced.push({ id: newItem.id, oldCat: oldItem.category, newCat: newItem.category });
    } else {
      console.log(`[ADD] 新增工具 ${newItem.id} (${newItem.category})`);
      registry.tools.push(newItem);
      summary.added.push({ id: newItem.id, cat: newItem.category });
    }
  }

  saveRegistry(registry);
  console.log('\n===== 處理結果總結 =====');
  console.log(`總處理網址數: ${summary.totalProcessed}`);
  console.log(`取代/優化既有工具: ${summary.replaced.length} 個 (${summary.replaced.map(r => r.id).join(', ')})`);
  console.log(`新增工具: ${summary.added.length} 個 (${summary.added.map(a => a.id).join(', ')})`);
}

main();
