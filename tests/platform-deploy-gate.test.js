/**
 * platform-deploy-gate.test.js — 發佈实例安全態勢守門測試（2026-10-14 Q3=A）
 *
 * 發佈（workbuddy sites）會注入 PORT。平台实例必須：
 *   · 遙測寫入 /api/telemetry 維持開放（發佈的目的）
 *   · 遙測匯出 /api/telemetry/export 無 token 不可見（真人語料是敏感資料）
 *   · 寫入型端點 tools/add、trending/refresh、shutdown 一律停用
 *     （公開訪客不該能改 sandbox registry、觸發背景任務或關閉服務）
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const PORT = 3987;
const BASE = `http://127.0.0.1:${PORT}`;

async function waitForServer(timeoutMs = 15000) {
  const t0 = Date.now();
  for (;;) {
    try {
      await fetch(`${BASE}/api/trending/status`, { signal: AbortSignal.timeout(2000) });
      return;
    } catch {
      if (Date.now() - t0 > timeoutMs) throw new Error('server did not start in time');
      await new Promise((r) => setTimeout(r, 300));
    }
  }
}

test('平台实例：寫入型端點停用、遙測端點行為正確', async (t) => {
  const child = spawn(process.execPath, ['web/server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT) },
    stdio: 'ignore',
  });
  try {
    await waitForServer();

    const shutdown = await fetch(`${BASE}/api/shutdown`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm: 'SHUTDOWN' }),
    });
    assert.equal(shutdown.status, 404, 'shutdown 在平台实例必須停用');

    const add = await fetch(`${BASE}/api/tools/add`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://github.com/owner/repo' }),
    });
    assert.equal(add.status, 404, 'tools/add 在平台实例必須停用');

    const refresh = await fetch(`${BASE}/api/trending/refresh`, { method: 'POST' });
    assert.equal(refresh.status, 404, 'trending/refresh 在平台实例必須停用');

    const exportNoToken = await fetch(`${BASE}/api/telemetry/export`);
    assert.equal(exportNoToken.status, 404, '匯出端點無 token 必須不可見');

    const tokenFile = join(ROOT, 'web', 'data', 'telemetry-export-token.txt');
    if (existsSync(tokenFile)) {
      const token = readFileSync(tokenFile, 'utf8').trim();
      const bad = await fetch(`${BASE}/api/telemetry/export?token=wrong`);
      assert.equal(bad.status, 403, '錯誤 token 必須 403');
      const ok = await fetch(`${BASE}/api/telemetry/export?token=${encodeURIComponent(token)}`);
      assert.equal(ok.status, 200, '正確 token 必須可取回');
      const body = await ok.json();
      assert.ok(Array.isArray(body.events), '匯出內容必須含 events 陣列');
    } else {
      t.diagnostic('token 檔不存在（新環境），跳過 403/200 路徑');
    }
  } finally {
    child.kill('SIGTERM');
  }
});
