import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { verifyToolEnvironment, checkSystemEnvironment } from '../core/sandbox-validator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REGISTRY_PATH = join(__dirname, '..', 'registry', 'tools.json');
const registry = JSON.parse(readFileSync(REGISTRY_PATH, 'utf-8'));

test('沙盒環境預檢 - 系統環境掃描與工具相依性測試', () => {
  const env = checkSystemEnvironment();
  assert.ok(typeof env.node === 'boolean', '應檢測 node 可用性');

  const tool = registry.tools[0];
  const report = verifyToolEnvironment(tool);

  assert.equal(report.toolId, tool.id);
  assert.ok(typeof report.isEnvironmentReady === 'boolean', '應回傳環境預檢結果');
});
