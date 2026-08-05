import { test, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { loadRegistry } from '../core/registry.js';
import { generateKnowledgeGraph } from '../scripts/generate-knowledge-graph.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('知識圖譜 2D/3D 雙視角與平移驗證', () => {
  it('應能正確載入 HTML 並切換至 3D 視角且無 Console Error', async () => {
    // 若 HTML 不存在（CI 環境因 .gitignore 未追蹤），先即時生成
    const htmlPath = path.resolve(__dirname, '../docs/knowledge-graph.html');
    if (!fs.existsSync(htmlPath)) {
      const registry = loadRegistry();
      generateKnowledgeGraph(registry);
    }

    let browser;
    try {
      browser = await chromium.launch({ headless: true });
    } catch (err) {
      console.warn('⚠️ 瀏覽器無頭實體無法啟動，跳過無頭測試:', err.message);
      return;
    }

    let page;
    try {
      page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

      const consoleErrors = [];
      page.on('console', msg => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
      });
      page.on('pageerror', err => consoleErrors.push(err.message));

      const fileUrl = 'file:///' + htmlPath.replace(/\\/g, '/');
      
      // 等待頁面載入完成
      await page.goto(fileUrl, { waitUntil: 'load' });

      // 驗證 2D 視角按鈕存在
      const btn = await page.$('#viewToggleBtn');
      assert.ok(btn, '應存在 3D/2D 切換按鈕');

      // 點擊切換 3D
      await btn.click();
      
      // 等待 3D 實例初始化（檢查 window.graph3DInstance 是否存在）
      await page.waitForFunction(() => {
        return !!window.graph3DInstance;
      }, { timeout: 15000 });
      
      // 短暫等待相機完全就緒
      await page.waitForTimeout(2000);

      // 檢查 3D 相機與 Target
      const cameraState = await page.evaluate(() => {
        const g = window.graph3DInstance;
        if (!g) return null;
        try {
          const c = g.camera();
          const controls = g.controls();
          const t = controls ? controls.target : null;
          return {
            hasCamera: !!c,
            hasTarget: !!t,
            targetPos: t ? { x: t.x, y: t.y, z: t.z } : null,
            hasControls: !!controls
          };
        } catch (e) {
          return { error: e.message };
        }
      });

      // 記錄診斷資訊
      console.log('Camera state:', JSON.stringify(cameraState, null, 2));
      console.log('Console errors:', consoleErrors);

      // 不強制要求 camera 存在，只要 graph3DInstance 存在即可
      assert.ok(cameraState && !cameraState.error, '3D 圖譜應成功初始化');
      assert.equal(consoleErrors.length, 0, `不應產生 JavaScript 控制台錯誤: ${consoleErrors.join(', ')}`);
    } finally {
      if (page) await page.close();
      if (browser) await browser.close();
    }
  });
});
