import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseAllowedOrigins,
  isTelemetryOrigin,
  telemetryCorsHeaders,
} from '../web/telemetry-origin.js';

// 2026-10-15 Q2=A：Pages 靜態站中繼遙測的來源把關守門測試。
// 安全立場與 web/telemetry-origin.js 檔頭一致：預設空 allowlist＝只有同源可寫。

test('parseAllowedOrigins：去空白、去尾斜線、丟空項', () => {
  assert.deepEqual(
    parseAllowedOrigins(' https://a.github.io/ , https://b.github.io ,, '),
    ['https://a.github.io', 'https://b.github.io']
  );
  assert.deepEqual(parseAllowedOrigins(''), []);
  assert.deepEqual(parseAllowedOrigins(undefined), []);
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
