#!/usr/bin/env node
/**
 * Batch check existing tools and prepare batch-add file
 */

import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const urls = [
  'https://github.com/NirDiamant/genai_agents',
  'https://github.com/moonshine-ai/moonshine',
  'https://github.com/laravel/wayfinder',
  'https://github.com/strands-agents/harness-sdk',
  'https://github.com/crewAIInc/crewAI',
  'https://github.com/langchain-ai/langgraph',
  'https://github.com/microsoft/autogen',
  'https://github.com/huggingface/smolagents',
  'https://github.com/huggingface/agents-course',
  'https://github.com/jlcodes99/cockpit-tools',
  'https://github.com/langgenius/dify',
  'https://github.com/datawhalechina/hello-agents',
  'https://github.com/ashishpatel26/500-AI-Agents-Projects',
  'https://github.com/cloudflare/computer',
  'https://github.com/tree-sitter/tree-sitter',
  'https://github.com/sqlite/sqlite',
  'https://github.com/rtk-ai/rtk',
  'https://github.com/mrdoob/three.js',
  'https://github.com/Volkanmolla42/imgtothree',
  'https://github.com/blender/blender',
  'https://github.com/TryGhost/Ghost',
  'https://github.com/FujiwaraChoki/MoneyPrinterV2',
  'https://github.com/wasp-lang/open-saas',
  'https://github.com/engineerapart/TheRemoteFreelancer',
  'https://github.com/lukasz-madon/awesome-remote-job',
  'https://github.com/223egoist/best-deals-bot',
  'https://github.com/microsoft/qlib',
];

// Get existing IDs
const registryData = JSON.parse(readFileSync('D:/Self-developed_Apps/Tool-Calling/registry/tools.json', 'utf8'));
const existingIds = new Set(registryData.tools.map(t => t.id.toLowerCase()));
console.log('已存在的 ID 數量:', existingIds.size);

// Extract repo names and check existence
const pendingUrls = [];
const existingUrls = [];

for (const url of urls) {
  const parts = url.split('/');
  const repoName = parts[parts.length - 1].toLowerCase().replace(/\.git$/, '');
  
  if (existingIds.has(repoName)) {
    console.log(`⚠️  已存在: ${repoName} (${url})`);
    existingUrls.push(url);
  } else {
    console.log(`➕ 新增: ${repoName}`);
    pendingUrls.push(url);
  }
}

console.log('\n--- 摘要 ---');
console.log(`將新增: ${pendingUrls.length} 個`);
console.log(`已存在: ${existingUrls.length} 個`);

// Write pending URLs to temp file for batch-add
import { writeFileSync } from 'node:fs';
writeFileSync('D:/Self-developed_Apps/Tool-Calling/scripts/temp-batch-add.txt', 
  pendingUrls.join('\n'), 'utf8');
console.log('\n待新增列表已寫入 scripts/temp-batch-add.txt');
