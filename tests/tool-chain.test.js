import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { planToolChain } from '../core/search-engine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REGISTRY_PATH = join(__dirname, '..', 'registry', 'tools.json');
const registry = JSON.parse(readFileSync(REGISTRY_PATH, 'utf-8'));

test('多工具鏈自動規劃 - 多步驟任務分解與工具配對', () => {
  const task = '抓取動態網頁內容並轉成簡報';
  const plan = planToolChain(registry.tools, task);

  assert.equal(plan.task, task);
  assert.ok(plan.steps.length >= 2, '應至少拆解出 2 個步驟');
  assert.ok(plan.asciiPipeline.includes('Step 1'), '應包含步驟標籤');
  assert.ok(plan.steps[0].recommendedTool, '步驟 1 應有推薦工具');
});
