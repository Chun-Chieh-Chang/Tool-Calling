/**
 * platform-deploy-gate.test.js — 公開访客安全態勢守門測試（2026-10-14 Q3=A）
 *
 * 部署實測修正（2026-10-14）：平台不保證注入 PORT，改以 Host 頭判據。
 * 公開访客（Host／X-Forwarded-Host 非本機）必須：
 *   · 寫入型端點 tools/add、trending/refresh、shutdown 一律 404
 *   · 遙測匯出 /api/telemetry/export 無 token 不可見、錯 token 403
 * 遙測寫入（公開Origin + 相符的 X-Forwarded-Host＝信任）的端到端驗證
 * 在部署實例上用 curl 實測（見 DEV_LOG 2026-10-14），不在此檔落事件。
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
const PUBLIC_HOST = 'public.example.com';

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

test('公開访客：寫入型端點停用、遙測匯出 token 把關', async (t) => {
  const child = spawn(process.execPath, ['web/server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT) },
    stdio: 'ignore',
  });
  try {
    await waitForServer();

    const shutdown = await fetch(`${BASE}/api/shutdown`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Forwarded-Host': PUBLIC_HOST },
      body: JSON.stringify({ confirm: 'SHUTDOWN' }),
    });
    assert.equal(shutdown.status, 404, 'shutdown 對公開访客必須停用');

    const add = await fetch(`${BASE}/api/tools/add`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Forwarded-Host': PUBLIC_HOST },
      body: JSON.stringify({ url: 'https://github.com/owner/repo' }),
    });
    assert.equal(add.status, 404, 'tools/add 對公開访客必須停用');

    const refresh = await fetch(`${BASE}/api/trending/refresh`, {
      method: 'POST',
      headers: { 'X-Forwarded-Host': PUBLIC_HOST },
    });
    assert.equal(refresh.status, 404, 'trending/refresh 對公開访客必須停用');

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
