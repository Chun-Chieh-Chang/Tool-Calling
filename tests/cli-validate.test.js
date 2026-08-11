import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('CLI validate prints Registry Contract v2 quality summary', () => {
  const result = spawnSync(process.execPath, ['cli.js', 'validate'], {
    encoding: 'utf8'
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /Registry Contract v2/);
  assert.match(result.stdout, /Average metadata quality/);
  assert.match(result.stdout, /Low quality tools/);
});
