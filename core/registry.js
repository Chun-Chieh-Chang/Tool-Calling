import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
export const REGISTRY_PATH = join(__dirname, '..', 'registry', 'tools.json');

export function loadRegistry() {
  return JSON.parse(readFileSync(REGISTRY_PATH, 'utf-8'));
}

export function saveRegistry(data) {
  data.lastUpdated = new Date().toISOString();
  writeFileSync(REGISTRY_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

export function getToolById(toolId) {
  const data = loadRegistry();
  return data.tools.find((t) => t.id === toolId) || null;
}

export function generateId(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}
