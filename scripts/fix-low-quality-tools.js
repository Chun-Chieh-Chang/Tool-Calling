#!/usr/bin/env node
/**
 * Fix low-quality tools in registry by adding missing triggers and advantages.
 * Run: node scripts/fix-low-quality-tools.js
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const registryPath = join(__dirname, '..', 'registry', 'tools.json');

const data = JSON.parse(readFileSync(registryPath, 'utf8'));
const tools = data.tools;

// Mapping of tool_id -> { triggers: string[], advantages: string[] }
const fixes = {
  // Missing triggers (only has own id as trigger)
  'labs-oo-agents': {
    triggers: ['labs-oo-agents', 'nvidia agents', 'pythonic agents', 'ai agent framework'],
    advantages: ['GitHub ⭐ 1,340 星', 'Pythonic OO design for AI agents', 'NVIDIA backed project']
  },
  'dashi-taskboard': {
    triggers: ['dashi-taskboard', 'task board', 'project management', 'kanban board'],
    advantages: ['GitHub ⭐ 1,298 星', 'Lightweight task board for teams', 'Self-hosted option available']
  },
  'nativ': {
    triggers: ['nativ', 'mlx models', 'macos ai', 'local llm'],
    advantages: ['GitHub ⭐ 1,177 星', 'Native Mac AI experience', 'Chat, serve, and monitor MLX models locally']
  },
  'story-to-handdrawn-video': {
    triggers: ['story-to-handdrawn-video', 'handdrawn video', 'animation', 'story to video'],
    advantages: ['GitHub ⭐ 1,166 星', 'Convert stories to hand-drawn animation', 'Agent-based pipeline']
  },
  'findphone': {
    triggers: ['findphone', 'bluetooth tracker', 'locate device', 'macos bluetooth'],
    advantages: ['GitHub ⭐ 1,125 星', 'Find nearby Bluetooth devices via CLI', 'Signal strength based localization']
  },
  'openreply': {
    triggers: ['openreply', 'manychat alternative', 'instagram automation', 'dm automation'],
    advantages: ['GitHub ⭐ 1,122 星', 'Open-source ManyChat alternative', 'Comment-DM automation + analytics']
  },
  'openmouse': {
    triggers: ['openmouse', 'automation', 'rpa', 'ui automation'],
    advantages: ['GitHub ⭐ 1,112 星', 'Open-source RPA tool', 'UI automation for desktop apps']
  },
  'axisagentic': {
    triggers: ['axisagentic', 'agent trajectory', 'rlhf', 'data collection'],
    advantages: ['GitHub ⭐ 1,103 星', 'Extensible runtime for agent trajectories', 'Trajectory collection framework for RLHF']
  },
  'cue': {
    triggers: ['cue', 'macos copilot', 'ai overlay', 'meeting assistant'],
    advantages: ['GitHub ⭐ 1,076 星', 'Floating AI copilot for macOS', 'Sees/hears your meetings in real-time']
  },
  'mediacrawler': {
    triggers: ['mediacrawler', 'xiaohongshu scraper', 'douyin crawler', 'bilibili scraper', 'weibo crawler'],
    advantages: ['Multi-platform social media crawler', 'Supports Xiaohongshu, Douyin, Kuaishou, Bilibili, Weibo, Tieba']
  },
  'paperclip': {
    triggers: ['paperclip', 'agent management', 'workspace agent', 'ai workspace'],
    advantages: ['Open-source agent management app', 'Manage multiple AI agents in one workspace']
  },
  'dopamine': {
    triggers: ['dopamine', 'ios jailbreak', 'unc0ver alternative', 'semi-tethered jailbreak'],
    advantages: ['Semi-untethered jailbreak for iOS 15-26', 'Alternative to unc0ver and checkm8 tools']
  },
  'firstmate': {
    triggers: ['firstmate', 'crew agents', 'ship faster', 'team ai'],
    advantages: ['Talk to one agent, ship with a crew', 'Multi-agent collaboration for faster shipping']
  },

  // Missing advantages (has triggers but no advantages)
  'diagram-design': {
    triggers: ['diagram-design', 'flowchart', 'diagram', 'visualization'],
    advantages: ['Professional diagramming tool', 'Support for flowcharts, wireframes, and architecture diagrams']
  },
  'semantica': {
    triggers: ['semantica', 'semantic search', 'vector search', 'embedding'],
    advantages: ['Semantic search engine', 'Vector-based similarity search with embeddings']
  },
  'lifeos': {
    triggers: ['lifeos', 'personal dashboard', 'life management', 'productivity'],
    advantages: ['Personal OS for life management', 'Track habits, goals, and daily metrics']
  },
  'weathernext': {
    triggers: ['weathernext', 'weather api', 'forecast', 'weather app'],
    advantages: ['Accurate weather forecasting API', 'Real-time weather data with detailed forecasts']
  },
  'code-graph-rag': {
    triggers: ['code-graph-rag', 'code search', 'rag', 'knowledge graph'],
    advantages: ['RAG system for codebases', 'Knowledge graph + retrieval for code understanding']
  },
  'comfyui-mcp': {
    triggers: ['comfyui-mcp', 'comfyui', 'stable diffusion', 'image generation'],
    advantages: ['MCP server for ComfyUI', 'Control Stable Diffusion workflows via MCP protocol']
  },
  'codex-autorunner': {
    triggers: ['codex-autorunner', 'autocodex', 'github copilot', 'automated coding'],
    advantages: ['Auto-run Codex CLI tasks', 'Streamline AI-assisted development workflows']
  },
  'plannotator': {
    triggers: ['plannotator', 'planning', 'project planning', 'roadmap'],
    advantages: ['AI-powered project planner', 'Generate roadmaps and task plans automatically']
  },
  'delegate-skills': {
    triggers: ['delegate-skills', 'subagent', 'delegation', 'multi-agent'],
    advantages: ['Skill delegation framework', 'Delegate tasks to sub-agents with specialized skills']
  },
  'rapid-mlx': {
    triggers: ['rapid-mlx', 'mlx', 'rapid inference', 'apple silicon'],
    advantages: ['Fast MLX inference toolkit', 'Optimized for Apple Silicon performance']
  },
  'yfinance': {
    triggers: ['yfinance', 'stock data', 'financial data', 'yahoo finance'],
    advantages: ['Unofficial Yahoo Finance API', 'Download historical stock market data']
  },
};

let updated = 0;
let skipped = 0;

for (const tool of tools) {
  const fix = fixes[tool.id];
  if (!fix) continue;

  let needsUpdate = false;

  // Fix triggers
  if (!tool.triggers || tool.triggers.length < 2) {
    tool.triggers = fix.triggers;
    needsUpdate = true;
  }

  // Fix advantages
  if (!tool.advantages || tool.advantages.length === 0) {
    tool.advantages = fix.advantages;
    needsUpdate = true;
  }

  if (needsUpdate) {
    console.log(`✓ Updated ${tool.id}`);
    updated++;
  } else {
    console.log(`  Skipped ${tool.id} (already has sufficient data)`);
    skipped++;
  }
}

writeFileSync(registryPath, JSON.stringify(data, null, 2), 'utf8');
console.log(`\nSummary: ${updated} tools updated, ${skipped} skipped`);
console.log(`Total tools in registry: ${tools.length}`);
