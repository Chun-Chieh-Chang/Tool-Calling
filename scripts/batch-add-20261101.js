/**
 * Batch ingest — 2026-11-01
 *
 * 來源：使用者提供 6 個 GitHub URL。盤點後的實際處置：
 *
 *   已在庫（略過，僅做拆解複查）
 *     github/awesome-copilot      → 開發工具，skills/ 有 448 個 skill（可再跑 index-subtools 做深層索引）
 *     cursor/plugins              → 開發工具，已內嵌 169 個 subTools（上輪完成）
 *     google-research/harness2    → AI 代理，單一 Python 套件（scripts/ 僅為 benchmark 腳本），不拆解
 *
 *   本輪新增（3 支）
 *     OpenBMB/VoxCPM              → 音訊      pip install voxcpm，30 語言、48kHz、Voice Design、聲音複製
 *     import-ai/omnibox           → 知識管理  跨平台 AI 知識中心，需 --recurse-submodules
 *     AirsupHQ/machine-skill      → 3D工程繪圖  Claude Code skill，產出互動式 3D 機構模擬 + 錄影
 *
 * 分類決策樹（見 docs/CLASSIFICATION.md）與規則引擎對照：
 *   - VoxCPM   → 音訊：scanner 以 topics 命中 tts／text-to-speech；D-T3 規則亦指向音訊，一致
 *   - Omnibox  → 知識管理：knowledge hub + 解析索引 + RAG 問答，D-T3 規則指向知識管理，一致
 *   - machine-skill → 3D工程繪圖：scanner 預設落到開發工具，但本工具的實質產出是
 *     依真實尺寸與物理求解器生成的 3D 機構剖面模擬（three.js），與 threejs／img2threejs／
 *     ingetrazo 同屬「3D 工程視覺化」語境；依 SKILL_PACK_DOMAINS（3d|cad|blender|mesh → 3D工程繪圖）
 *     的分類意旨改判 3D工程繪圖。錄影只是附加輸出，非主要價值。
 *
 * 本腳本只做「語意欄位校正」——scan + README 補齊已由 cli.js add 完成（description／useCase／
 * advantages 由 LLM 讀 README 產生），此處依 README 事實修正：
 *   1. triggers：scanner 只塞 GitHub topics，補上中文與領域詞彙（比對用的觸發面）
 *   2. capabilities：scanner 只回 topics，改為可檢索的能力標籤
 *   3. install：scanner 依封裝檔推導，命令改為 README 記載的實際安裝方式
 *   4. machine-skill 的 category 改判 3D工程繪圖
 *
 * 繁中欄位（description_zh／negativeConstraints_zh）與 status 升級交由 scripts/translate-to-zh.js
 * 處理——那是專案認定的譯文來源，且會一併呼叫 activateIfComplete 把 experimental 升為 active。
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const REGISTRY_PATH = join(ROOT, 'registry', 'tools.json');

const now = new Date().toISOString();

/**
 * 逐筆校正。只列要覆寫的欄位；未列出的欄位（useCase／advantages／negativeConstraints）
 * 維持 cli.js add 透過 README 補齊的內容，不二次改寫。
 */
const corrections = {
  voxcpm: {
    triggers: [
      'voxcpm',
      'voxcpm2',
      'tts',
      'text-to-speech',
      'voice-cloning',
      'voice-design',
      'speech-synthesis',
      'multilingual-speech',
      'minicpm',
      'diffusion-autoregressive',
      '文字轉語音',
      '語音合成',
      '聲音複製',
      '音色設計',
      '多語言語音'
    ],
    capabilities: [
      'tokenizer-free-tts',
      'diffusion-autoregressive',
      'multilingual-synthesis',
      'voice-cloning',
      'voice-design',
      'controllable-style-guidance',
      '48khz-studio-output',
      'edge-deployment'
    ],
    install: {
      method: 'pip',
      command: 'pip install voxcpm',
      repoUrl: 'https://github.com/OpenBMB/VoxCPM'
    }
  },

  omnibox: {
    description:
      'Cross-platform all-in-one AI knowledge hub (OmniBox / 小黑): collect web pages, PDFs, Word/PPT/MP3 files via browser extension, iOS Flash capture or WeChat bot, then parse, index and query them with RAG plus rich Markdown editing.',
    triggers: [
      'omnibox',
      'ai-knowledge-hub',
      'rag',
      'knowledge-base',
      'note-taking',
      'ai-search',
      'wechat-bot',
      'markdown-editor',
      'knowledge-hub',
      '知識庫',
      '知識管理',
      '第二大腦',
      '筆記系統',
      '微信機器人',
      '文件問答'
    ],
    capabilities: [
      'web-capture',
      'document-parsing-indexing',
      'rag-qa',
      'markdown-rendering',
      'flash-capture',
      'wechat-bot',
      'multi-tenant-workspace'
    ],
    install: {
      method: 'git-clone',
      command: 'git clone --recurse-submodules https://github.com/import-ai/omnibox.git',
      repoUrl: 'https://github.com/import-ai/omnibox'
    }
  },

  'machine-skill': {
    category: '3D工程繪圖',
    triggers: [
      'machine-skill',
      'machine-simulation',
      '3d-machine-simulation',
      'cutaway-view',
      'engineering-visualization',
      'physics-simulation',
      'threejs',
      'claude-code-skill',
      '機械模擬',
      '3D機構模擬',
      '剖面圖',
      '工程視覺化',
      '物理模擬'
    ],
    capabilities: [
      'interactive-3d-simulation',
      'real-dimension-modeling',
      'cutaway-exploded-view',
      'physics-solver',
      'single-html-delivery',
      'video-recording',
      'claude-code-skill'
    ],
    install: {
      method: 'npx',
      command: 'npx skills add AirsupHQ/machine-skill -g -a claude-code',
      repoUrl: 'https://github.com/AirsupHQ/machine-skill'
    }
  }
};

const reg = JSON.parse(readFileSync(REGISTRY_PATH, 'utf8'));
const touched = [];

for (const [id, patch] of Object.entries(corrections)) {
  const tool = reg.tools.find((t) => t.id === id);
  if (!tool) {
    console.error(`✗ 找不到工具: ${id}`);
    process.exitCode = 1;
    continue;
  }
  const before = { category: tool.category, triggers: tool.triggers.length, install: tool.install?.command };
  Object.assign(tool, patch);
  tool.lastEnrichedAt = now;
  touched.push(id);
  console.log(
    `✓ ${id}：分類 ${before.category} → ${tool.category}｜triggers ${before.triggers} → ${tool.triggers.length}｜install: ${tool.install.command}`
  );
}

// ─── 繁體殘留修正（translate-to-zh 的模型輸出偶爾夾帶簡體字）──────────────────
// 專案守門模組 findSimplified 用內建對照表，會漏判部分字（如「中枢」）。 // allow-simplified：引用簡體字形本身
// 這裡以 opencc cn→tw 為尺人工複核後，把確認的簡體字換成繁體。
// 只換「字形簡繁」，不做台灣用語替換——工具庫既有主流是 台／文件／腳本／系統／循環
// （opencc 的 twp 會把這些改成 臺／檔案／指令碼／繫統／迴圈，與全庫慣例相反）。
const zhFixups = [
  { id: 'omnibox', field: 'description_zh', from: '知識中枢', to: '知識中樞' } // allow-simplified：引用簡體字形本身
];

for (const fix of zhFixups) {
  const tool = reg.tools.find((t) => t.id === fix.id);
  if (!tool) continue;
  const raw = tool[fix.field];
  const arr = Array.isArray(raw) ? raw : [raw];
  const next = arr.map((s) => (typeof s === 'string' ? s.split(fix.from).join(fix.to) : s));
  if (JSON.stringify(next) === JSON.stringify(arr)) continue;
  tool[fix.field] = Array.isArray(raw) ? next : next[0];
  console.log(`✓ ${fix.id}.${fix.field}：${fix.from} → ${fix.to}`);
}

reg.lastUpdated = now;
writeFileSync(REGISTRY_PATH, JSON.stringify(reg, null, 2) + '\n');
console.log(`\n已更新 ${touched.length} 筆工具欄位（${touched.join(', ')}）。`);
console.log('下一步：node scripts/translate-to-zh.js --ids=' + touched.join(','));
