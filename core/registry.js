import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { generateKnowledgeGraph } from '../scripts/generate-knowledge-graph.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
export const REGISTRY_PATH = join(__dirname, '..', 'registry', 'tools.json');

export function loadRegistry() {
  return JSON.parse(readFileSync(REGISTRY_PATH, 'utf-8'));
}

export function saveRegistry(data) {
  data.lastUpdated = new Date().toISOString();
  writeFileSync(REGISTRY_PATH, JSON.stringify(data, null, 2), 'utf-8');
  try {
    generateKnowledgeGraph(data);
  } catch (err) {
    console.warn('[Warning] 自動更新知識圖譜時發生警告:', err.message);
  }
}

export function getToolById(toolId) {
  const data = loadRegistry();
  return data.tools.find((t) => t.id === toolId) || null;
}

/**
 * 顯示用文字：優先回傳繁體中文（台灣）譯文，沒有則回退原文。
 *
 * 譯文由 `scripts/translate-to-zh.js` 產生，存於 `*_zh` 欄位
 * （description_zh / useCase_zh / advantages_zh）。
 * ⚠️ 原文欄位**不可被覆寫**——它們同時是檢索索引與 rerank 提示的內容，
 * 覆寫會讓既有準確度量測作廢。顯示層一律走這個函式，不要直接讀原文。
 *
 * @param {object} tool
 * @param {'description'|'useCase'|'advantages'} field
 * @returns {string}
 */
export function displayText(tool, field) {
  if (!tool) return '';
  const zh = tool[`${field}_zh`];
  if (typeof zh === 'string' && zh.trim()) return zh;
  if (typeof tool[field] === 'string') return tool[field];
  return '';
}

export function generateId(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}
