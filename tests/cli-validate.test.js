import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('CLI validate prints Registry Contract v2 quality summary', () => {
  const result = spawnSync(process.execPath, ['cli.js', 'validate'], {
    encoding: 'utf8'
  });

  // 結束碼必須與 CLI 本體的錯誤數一致（曾經永遠 exit 0，見 tier1-preservation Property 2c）。
  // 2026-09-27 佔位樣板清理後，誠實留空的負邊界以 error 計數，
  // 全綠前這個斷言要看「一致」而非「一定是 0」。
  const cliLine = String(result.stdout || '').split('\n').find((l) => /[0-9]+ 個錯誤/.test(l)) || '';
  const errorCount = Number((cliLine.match(/([0-9]+) 個錯誤/) || [])[1] ?? NaN);
  assert.ok(Number.isInteger(errorCount), 'validate 應印出「N 個錯誤」摘要行');
  assert.equal(result.status === 0, errorCount === 0, '結束碼必須與錯誤數一致');
  assert.match(result.stdout, /Registry Contract v2/);
  assert.match(result.stdout, /Average metadata quality/);
  assert.match(result.stdout, /Low quality tools/);
});
