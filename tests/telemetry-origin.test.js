import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  parseAllowedOrigins,
  isTelemetryOrigin,
  telemetryCorsHeaders,
} from '../web/telemetry-origin.js';

// 2026-10-15 Q2=A：Pages 靜態站中繼遙測的來源把關守門測試。
// 安全立場與 web/telemetry-origin.js 檔頭一致：預設空 allowlist＝只有同源可寫。
//
// 第七輪追加：allowlist 多了「版控檔案」後備（web/telemetry-allowlist.txt），
// 因為發佈平台無法設定任意環境變數。最後一則測試對該檔上鎖——
// 它空掉、掉字或被塞入萬用字元時必須失敗，否則 F2 會靜默失效。

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

test('parseAllowedOrigins：去空白、去尾斜線、丟空項', () => {
  assert.deepEqual(
    parseAllowedOrigins(' https://a.github.io/ , https://b.github.io ,, '),
    ['https://a.github.io', 'https://b.github.io']
  );
  assert.deepEqual(parseAllowedOrigins(''), []);
  assert.deepEqual(parseAllowedOrigins(undefined), []);
});

test('parseAllowedOrigins：吃換行與 # 註解（allowlist 檔的格式）', () => {
  const raw = [
    '# 整行註解',
    'https://a.github.io   # 行尾註解',
    '',
    '   ',
    '  https://b.github.io/  ',
  ].join('\n');
  assert.deepEqual(parseAllowedOrigins(raw), ['https://a.github.io', 'https://b.github.io']);
});

test('isTelemetryOrigin：無 Origin 的直連（curl）維持開放', () => {
  assert.equal(isTelemetryOrigin(undefined, {}), true);
});

test('isTelemetryOrigin：本機 host 一律信任', () => {
  for (const o of ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://[::1]:3000']) {
    assert.equal(isTelemetryOrigin(o, {}), true, o);
  }
});

test('isTelemetryOrigin：同源（Host 或 X-Forwarded-Host 比對）信任', () => {
  assert.equal(isTelemetryOrigin('https://live.example.run', {
    hostHeader: 'live.example.run',
  }), true);
  assert.equal(isTelemetryOrigin('https://live.example.run', {
    hostHeader: 'rewritten.proxy',
    xForwardedHost: 'live.example.run',
  }), true);
  assert.equal(isTelemetryOrigin('https://evil.example.com', {
    hostHeader: 'live.example.run',
  }), false);
});

test('isTelemetryOrigin：allowlist 成員信任（完整 origin 或 bare host）', () => {
  const allowed = parseAllowedOrigins('https://chun-chieh-chang.github.io');
  assert.equal(isTelemetryOrigin('https://chun-chieh-chang.github.io', { allowedOrigins: allowed }), true);
  assert.equal(isTelemetryOrigin('https://chun-chieh-chang.github.io/Tool-Calling/', { allowedOrigins: allowed }), true);
  assert.equal(isTelemetryOrigin('https://evil.github.io', { allowedOrigins: allowed }), false);
  // 空 allowlist（預設）不信任任何跨域
  assert.equal(isTelemetryOrigin('https://chun-chieh-chang.github.io', {}), false);
});

test('isTelemetryOrigin：畸形 Origin 拒絕', () => {
  assert.equal(isTelemetryOrigin('not-a-url', { allowedOrigins: [] }), false);
});

test('telemetryCorsHeaders：只對 allowlist 跨域來源給 ACAO', () => {
  const allowed = parseAllowedOrigins('https://chun-chieh-chang.github.io');
  const cors = telemetryCorsHeaders('https://chun-chieh-chang.github.io', allowed);
  assert.equal(cors['Access-Control-Allow-Origin'], 'https://chun-chieh-chang.github.io');
  assert.equal(cors['Access-Control-Allow-Methods'], 'POST');
  assert.equal(cors['Access-Control-Allow-Headers'], 'Content-Type');
  assert.equal(cors.Vary, 'Origin');
});

test('telemetryCorsHeaders：同源／本機／陌生來源都不給 CORS 標頭', () => {
  const allowed = parseAllowedOrigins('https://chun-chieh-chang.github.io');
  // 同源：瀏覽器自然放行，不需要 ACAO
  assert.deepEqual(telemetryCorsHeaders('https://live.example.run', allowed), {});
  // 本機
  assert.deepEqual(telemetryCorsHeaders('http://localhost:3000', allowed), {});
  // 陌生跨域
  assert.deepEqual(telemetryCorsHeaders('https://evil.example.com', allowed), {});
  // 無 Origin
  assert.deepEqual(telemetryCorsHeaders(undefined, allowed), {});
  // 畸形 Origin
  assert.deepEqual(telemetryCorsHeaders('::::', allowed), {});
});

// ── 部署設定上鎖（2026-10-15 第七輪）──────────────────────────────────────
// web/telemetry-allowlist.txt 是「平台上唯一能生效」的 allowlist 來源
// （env 無法在部署環境設定）。它若被清空、掉字或被塞萬用字元，
// F2 會靜默失效且沒有任何徵兆，所以在這裡對它上鎖。
test('web/telemetry-allowlist.txt：內容可解析、含 Pages 來源、且不含萬用字元', () => {
  const raw = readFileSync(join(repoRoot, 'web', 'telemetry-allowlist.txt'), 'utf-8');
  const allowed = parseAllowedOrigins(raw);

  assert.ok(allowed.length > 0, 'allowlist 不可為空——空了 Pages 中繼就會靜默失效');
  assert.ok(
    allowed.includes('https://chun-chieh-chang.github.io'),
    '必須包含 GitHub Pages 來源（README.md 線上版對照表的網址）'
  );
  for (const o of allowed) {
    assert.ok(!o.includes('*'), `allowlist 不接受萬用字元：${o}`);
  }

  // 有牙：這個來源真的會被信任，而鄰近的陌生 github.io 不會
  assert.equal(isTelemetryOrigin('https://chun-chieh-chang.github.io', { allowedOrigins: allowed }), true);
  assert.equal(isTelemetryOrigin('https://evil.github.io', { allowedOrigins: allowed }), false);
});
