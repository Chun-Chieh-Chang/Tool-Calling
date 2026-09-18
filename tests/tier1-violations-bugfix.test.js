/**
 * tier1-violations-bugfix.test.js — Bug Condition Exploration Test
 *
 * **Validates: Requirements 1.1**
 *
 * PURPOSE (Bugfix Workflow — Task 1):
 *   This is a BUG CONDITION exploration test.
 *   It encodes the EXPECTED BEHAVIOR after the fix (bugfix.md §2.1):
 *
 *     runRescanCI'(registry).exitCode = 0  AND  tier1Violations = 0
 *
 *   On UNFIXED code, this test is EXPECTED TO FAIL — failure confirms the bug:
 *   `registry/tools.json` has 14 Tier 1 classification violations, causing
 *   `node scripts/rescan-classification.js --ci` to exit with code 1 instead of 0.
 *
 * BUG CONDITION (bugfix.md §Bug Condition Pseudocode):
 *   isBugCondition(registry) ≡ countTier1Violations(registry.tools) > 0
 *
 * KNOWN VIOLATIONS (14 tools):
 *   - superpowers        : AI 代理    → 開發工具
 *   - awesome-copilot    : AI 代理    → 開發工具
 *   - claude-skills      : AI 代理    → 開發工具
 *   - oh-my-pi           : AI 代理    → 開發工具
 *   - agent-orchestrator : AI 框架    → 開發工具
 *   - openclaw           : 開發工具   → AI 框架
 *   - jpeetz-hermes-studio: AI 代理   → AI 框架
 *   - nvidia-skills      : AI 代理    → AI 框架
 *   - deepseek-harness-desktop: AI 代理 → AI 框架
 *   - deepseek-work      : AI 代理    → AI 框架
 *   - openclaude         : AI 代理    → AI 框架
 *   - dsh-desktop-anywhere: 開發工具  → AI 框架
 *   - reader3            : 文件生產力  → 學習資源
 *   - awesome-systematic-trading: 金融與投資 → 學習資源
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');
const REGISTRY_PATH = join(ROOT, 'registry', 'tools.json');

/**
 * Run `node scripts/rescan-classification.js --ci` and return
 * { exitCode, stdout, stderr }.
 *
 * Uses spawnSync (not execFileSync) so we capture the non-zero exit code
 * instead of throwing.
 */
function runRescanCI() {
  const result = spawnSync(
    process.execPath,
    ['scripts/rescan-classification.js', '--ci'],
    { cwd: ROOT, encoding: 'utf8' }
  );
  return {
    exitCode: result.status ?? 1,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

/**
 * Property 1: Bug Condition — Tier 1 Classification Violations Block CI
 *
 * BUG CONDITION EXPLORATION TEST — EXPECTED TO FAIL ON UNFIXED CODE.
 *
 * Encodes Expected Behavior (bugfix.md §2.1):
 *   WHEN rescan-classification.js --ci runs with 0 Tier 1 violations
 *   THEN exitCode = 0 (CI gate passes)
 *
 * On unfixed code this assertion FAILS because:
 *   exitCode = 1  (not 0) — 14 Tier 1 violations detected
 *
 * Validates: Requirements 1.1
 */
test('Property 1 [Bug Exploration]: rescan --ci exits 0 when registry has no Tier 1 violations', () => {
  const { exitCode, stdout, stderr } = runRescanCI();

  // ── Assert Expected Behavior (bugfix.md §2.1) ──────────────────────────
  // After correctClassifications applied:
  //   runRescanCI'(registry).exitCode = 0
  //   tier1Violations = 0
  //
  // ON UNFIXED CODE THIS ASSERTION FAILS:
  //   actual exitCode = 1  (14 Tier 1 violations cause CI to block)
  assert.equal(
    exitCode,
    0,
    `Expected exit code 0 (CI gate pass, 0 Tier 1 violations), ` +
    `but got exit code ${exitCode}.\n` +
    `This confirms the bug: registry/tools.json has Tier 1 classification violations.\n` +
    `stdout:\n${stdout}\nstderr:\n${stderr}`
  );
});

/**
 * Property 1b: Zero Tier 1 Violations in stdout
 *
 * Additionally check that the output reports 0 Tier 1 violations.
 * On unfixed code this fails because stdout shows "Tier 1 明確違反 : 14".
 *
 * Validates: Requirements 1.1
 */
test('Property 1b [Bug Exploration]: rescan --ci stdout reports 0 Tier 1 violations', () => {
  const { exitCode, stdout, stderr } = runRescanCI();

  // Parse tier1 count from stdout line: "   Tier 1 明確違反 : N"
  const match = stdout.match(/Tier 1 明確違反\s*:\s*(\d+)/);
  const tier1Count = match ? parseInt(match[1], 10) : -1;

  // Assert Expected Behavior: 0 Tier 1 violations after fix
  assert.equal(
    tier1Count,
    0,
    `Expected 0 Tier 1 violations in stdout, but found ${tier1Count}.\n` +
    `Counterexample tools with known violations:\n` +
    `  - superpowers       : AI 代理    → 開發工具  (R2/R4/R5)\n` +
    `  - awesome-copilot   : AI 代理    → 開發工具\n` +
    `  - claude-skills     : AI 代理    → 開發工具\n` +
    `  - oh-my-pi          : AI 代理    → 開發工具\n` +
    `  - agent-orchestrator: AI 框架    → 開發工具\n` +
    `  - openclaw          : 開發工具   → AI 框架\n` +
    `  - jpeetz-hermes-studio: AI 代理  → AI 框架\n` +
    `  - nvidia-skills     : AI 代理    → AI 框架\n` +
    `  - deepseek-harness-desktop: AI 代理 → AI 框架\n` +
    `  - deepseek-work     : AI 代理    → AI 框架\n` +
    `  - openclaude        : AI 代理    → AI 框架\n` +
    `  - dsh-desktop-anywhere: 開發工具 → AI 框架\n` +
    `  - reader3           : 文件生產力  → 學習資源\n` +
    `  - awesome-systematic-trading: 金融與投資 → 學習資源\n` +
    `stdout:\n${stdout}\nstderr:\n${stderr}`
  );
});

/**
 * Baseline sanity check: Verify the registry loads and contains tools.
 * This test PASSES regardless of fix status — it confirms the registry
 * is readable and the bug condition can be evaluated.
 *
 * Validates: Requirements 1.1 (precondition)
 */
test('Baseline: registry/tools.json is readable and non-empty', () => {
  const registry = JSON.parse(readFileSync(REGISTRY_PATH, 'utf-8'));
  assert.ok(Array.isArray(registry.tools), 'registry.tools must be an array');
  assert.ok(registry.tools.length > 0, 'registry must contain tools');
});
