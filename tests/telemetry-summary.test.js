import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SUMMARY_FILE = join(__dirname, '..', 'registry', 'telemetry-summary.json');

// Cleanup before and after tests
if (existsSync(SUMMARY_FILE)) {
  unlinkSync(SUMMARY_FILE);
}
test.after(() => {
  if (existsSync(SUMMARY_FILE)) {
    unlinkSync(SUMMARY_FILE);
  }
});

test('telemetry-summary - buildSummary creates file', async () => {
  const { buildSummary } = await import('../core/telemetry-summary.js');
  
  const summary = buildSummary();
  
  assert.equal(summary.version, '1.0');
  assert.ok(typeof summary.generated_at === 'string');
  assert.ok(typeof summary.total_traces === 'number');
  assert.ok(typeof summary.tools === 'object');
  assert.ok(existsSync(SUMMARY_FILE));
});

test('telemetry-summary - loadSummary reads existing file', async () => {
  const { buildSummary, loadSummary } = await import('../core/telemetry-summary.js');
  
  buildSummary();
  const loaded = loadSummary();
  
  assert.equal(loaded.version, '1.0');
  assert.ok(typeof loaded.total_traces === 'number');
});

test('telemetry-summary - getSearchStats returns object', async () => {
  const { buildSummary, getSearchStats } = await import('../core/telemetry-summary.js');
  
  buildSummary();
  const stats = getSearchStats();
  
  assert.ok(typeof stats === 'object');
});

test('telemetry-summary - invalidateCache removes file', async () => {
  const { buildSummary, invalidateCache } = await import('../core/telemetry-summary.js');
  
  buildSummary();
  assert.ok(existsSync(SUMMARY_FILE));
  
  invalidateCache();
  assert.ok(!existsSync(SUMMARY_FILE));
});

test('telemetry-summary - stale cache triggers rebuild', async () => {
  const { buildSummary, loadSummary } = await import('../core/telemetry-summary.js');
  const fs = await import('node:fs');
  
  // Create stale summary (2 hours old)
  buildSummary();
  const summaryData = JSON.parse(fs.readFileSync(SUMMARY_FILE, 'utf8'));
  summaryData.generated_at = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  fs.writeFileSync(SUMMARY_FILE, JSON.stringify(summaryData));
  
  // Load should trigger rebuild
  const loaded = loadSummary();
  const ageMs = Date.now() - new Date(loaded.generated_at).getTime();
  assert.ok(ageMs < 60 * 1000, 'Should have rebuilt within last minute');
});
