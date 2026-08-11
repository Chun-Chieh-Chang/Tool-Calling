import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  assessRegistryContract,
  scoreToolMetadata,
  validateToolContract
} from '../core/registry-contract.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REGISTRY_PATH = join(__dirname, '..', 'registry', 'tools.json');
const registry = JSON.parse(readFileSync(REGISTRY_PATH, 'utf-8'));

const completeTool = {
  id: 'example-tool',
  name: 'Example Tool',
  url: 'https://github.com/example/example-tool',
  description: 'A complete example tool used to validate registry contract quality scoring.',
  category: '開發工具',
  language: 'typescript',
  triggers: ['contract validation', 'metadata scoring', 'registry quality'],
  status: 'active',
  useCase: 'Use when validating that a tool registry entry has enough metadata to support reliable retrieval.',
  negativeConstraints: ['Do not use as a real production tool.'],
  advantages: ['Complete metadata for deterministic tests.'],
  capabilities: ['validate metadata'],
  install: {
    method: 'git-clone',
    command: 'git clone https://github.com/example/example-tool'
  }
};

test('Registry Contract v2 - complete tool receives full metadata score', () => {
  const result = validateToolContract(completeTool);

  assert.equal(result.contractVersion, '2.0');
  assert.equal(result.qualityScore, 100);
  assert.equal(result.grade, 'A');
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.warnings, []);
});

test('Registry Contract v2 - weak metadata reports actionable warnings', () => {
  const weakTool = {
    ...completeTool,
    id: 'weak-tool',
    description: 'Too short',
    triggers: ['metadata'],
    useCase: '',
    negativeConstraints: [],
    advantages: []
  };

  const result = validateToolContract(weakTool);

  assert.equal(result.errors.length, 0);
  assert.ok(result.warnings.some((warning) => warning.field === 'triggers'));
  assert.ok(result.warnings.some((warning) => warning.field === 'description'));
  assert.ok(result.warnings.some((warning) => warning.field === 'useCase'));
  assert.ok(result.warnings.some((warning) => warning.field === 'negativeConstraints'));
  assert.ok(result.warnings.some((warning) => warning.field === 'advantages'));
  assert.equal(result.qualityScore, scoreToolMetadata(weakTool).qualityScore);
  assert.ok(result.qualityScore < 70);
});

test('Registry Contract v2 - current registry can be summarized without mutation', () => {
  const summary = assessRegistryContract(registry);

  assert.equal(summary.contractVersion, '2.0');
  assert.equal(summary.totalTools, registry.tools.length);
  assert.equal(summary.errors.length, 0);
  assert.ok(summary.warningCount <= 60); // Allow up to 60 warnings for new tools
  assert.ok(summary.averageQualityScore >= 95); // Allow some new tools with lower scores
  assert.ok(summary.averageQualityScore <= 100);
  assert.ok(Array.isArray(summary.lowQualityTools));
});
