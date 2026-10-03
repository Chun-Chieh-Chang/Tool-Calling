#!/usr/bin/env node
/**
 * derive-archetypes.js — 意圖原型表衍生（一次性工具，可重跑）
 *
 * patterns 是人工策展的任務家族詞彙（中英並列）；tools 由 registry 元資料
 * （triggers/name/description/useCase）匹配產生候選、stars 排序取前 3。
 * **刻意不從評測題反推**——原型層的衍生源頭是工具側，評測集保持乾淨考卷。
 *
 * 產出：registry/intent-archetypes.json 草稿（人工核對後定稿）。
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const registry = JSON.parse(readFileSync(path.join(ROOT, 'registry', 'tools.json'), 'utf8'));
const actives = registry.tools.filter((t) => t.status === 'active' || t.status === 'experimental');

// 任務家族策展（2026-10-03，源自對 registry 任務家族的通盤認識；中英並列）
const FAMILIES = [
  ['transcribe', '語音/影片轉逐字稿', ['逐字稿', 'transcript', 'speech to text', '語音轉文字', '字幕']],
  ['summarize', '內容摘要', ['摘要', 'summarize', 'tldr', '重點整理']],
  ['slides', '簡報生成', ['簡報', 'ppt', 'slides', 'presentation', '投影片']],
  ['office-docs', '辦公文件自動化', ['word', 'excel', '文件自動化', 'spreadsheet', '試算表']],
  ['web-scrape', '網頁爬蟲', ['爬蟲', 'scrape', 'crawl', '抓取網頁', 'crawler']],
  ['pdf', 'PDF 處理', ['pdf']],
  ['image-gen', '圖像生成', ['生圖', 'image generation', '文生圖', 'text-to-image', '繪圖']],
  ['video-gen', '影片生成', ['影片生成', 'video generation', 'text-to-video']],
  ['tts', '語音合成', ['語音合成', 'text to speech', 'tts', '配音']],
  ['ocr', 'OCR 文字辨識', ['ocr', '文字辨識', '圖片轉文字']],
  ['code-review', '程式碼審查', ['code review', '代碼審查', '程式碼審查']],
  ['e2e-test', '端對端測試', ['e2e', '端對端測試', 'browser testing', '瀏覽器測試', '自動化測試']],
  ['data-clean', '資料清理', ['資料清理', 'dedupe', '清洗', 'data cleaning', '去重']],
  ['dashboard', '儀表板與資料視覺化', ['dashboard', '儀表板', '資料視覺化', 'data visualization']],
  ['seo', 'SEO', ['seo', '搜尋引擎優化', 'keyword research']],
  ['screenshot', '截圖', ['截圖', 'screenshot', '網頁快照']],
  ['translate', '翻譯', ['翻譯', 'translate', 'translation']],
  ['workflow-automation', '工作流自動化', ['工作流自動化', 'workflow automation', '自動化工作流']],
  ['rag', 'RAG 知識庫', ['rag', '知識庫', '向量檢索', 'retrieval augmented']],
  ['chatbot', '聊天機器人', ['聊天機器人', 'chatbot', '客服機器人']],
  ['mcp', 'MCP 伺服器', ['mcp 伺服器', 'mcp server', 'model context protocol']],
  ['agent-framework', 'Agent 框架', ['agent 框架', 'multi-agent', 'ai agent framework']],
  ['mindmap', '心智圖', ['心智圖', 'mindmap', 'mind map']],
  ['diagram', '圖表與流程圖', ['流程圖', 'diagram', 'mermaid', '圖表']],
  ['email', '郵件自動化', ['email', '郵件', '信件自動化']],
  ['finance', '金融與交易', ['股票', '量化', '交易', 'trading', 'stock']],
  ['deploy-devops', '部署與 DevOps', ['部署', 'deploy', 'devops', 'ci/cd']],
  ['security', '資安掃描', ['密碼', 'security scanning', '弱點', 'vulnerability']],
  ['social-media', '社群媒體', ['社群媒體', 'social media', '發文']],
  ['note-km', '筆記與知識管理', ['筆記', 'notes', '知識管理', 'knowledge management', 'obsidian']],
];

const norm = (s) => String(s || '').toLowerCase();
const tokenText = (t) => norm([t.name, t.description, t.useCase, ...(t.triggers || []), ...(t.capabilities || [])].join(' '));

const out = [];
for (const [id, name, patterns] of FAMILIES) {
  const scored = [];
  for (const t of actives) {
    const text = tokenText(t);
    let hits = 0;
    for (const p of patterns) if (text.includes(norm(p))) hits++;
    if (hits > 0) scored.push({ id: t.id, hits, stars: t.stars || 0 });
  }
  scored.sort((a, b) => b.hits - a.hits || b.stars - a.stars);
  out.push({ id, name, patterns, tools: scored.slice(0, 3).map((s) => s.id), candidates: scored.length });
}

const OUT = path.join(ROOT, 'registry', 'intent-archetypes.json');
if (!existsSync(OUT)) {
  writeFileSync(OUT, JSON.stringify(out.filter((o) => o.tools.length > 0), null, 2) + '\n', 'utf-8');
  console.log(`✅ 草稿寫入 ${OUT}（${out.filter((o) => o.tools.length > 0).length}/${FAMILIES.length} 個家族有候選）`);
} else {
  console.log('⚠️ registry/intent-archetypes.json 已存在，草稿改印到 stdout 供比對');
  console.log(JSON.stringify(out.filter((o) => o.tools.length > 0), null, 2));
}
for (const o of out) {
  console.log(`${o.tools.length > 0 ? '✓' : '✗'} ${o.id} (${o.candidates} 候選): ${o.tools.join(', ') || '—'}`);
}
