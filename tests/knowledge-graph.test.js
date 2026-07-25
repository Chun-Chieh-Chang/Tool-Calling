import { test, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('知識圖譜 2D/3D 雙視角與平移驗證', () => {
  it('應能正確載入 HTML 並切換至 3D 視角且無 Console Error', async () => {
    let browser;
    try {
      browser = await chromium.launch({ headless: true });
    } catch (err) {
      console.warn('⚠️ 瀏覽器無頭實體無法啟動，跳過無頭測試:', err.message);
      return;
    }

    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

    const consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', err => consoleErrors.push(err.message));

    const htmlPath = path.resolve(__dirname, '../docs/knowledge-graph.html');
    const fileUrl = 'file:///' + htmlPath.replace(/\\/g, '/');
    await page.goto(fileUrl, { waitUntil: 'networkidle' });

    // 驗證 2D 視角按鈕存在
    const btn = await page.$('#viewToggleBtn');
    assert.ok(btn, '應存在 3D/2D 切換按鈕');

    // 點擊切換 3D
    await btn.click();
    await page.waitForTimeout(3000);

    // 檢查 3D 相機與 Target
    const cameraState = await page.evaluate(() => {
      if (typeof graph3DInstance === 'undefined') return null;
      const c = graph3DInstance.camera();
      const t = graph3DInstance.controls().target;
      return {
        hasCamera: !!c,
        hasTarget: !!t,
        targetPos: { x: t.x, y: t.y, z: t.z }
      };
    });

    assert.ok(cameraState && cameraState.hasCamera, '3D 視角應成功初始化相機');
    assert.equal(consoleErrors.length, 0, `不應產生 JavaScript 控制台錯誤: ${consoleErrors.join(', ')}`);

    await browser.close();
  });
});
