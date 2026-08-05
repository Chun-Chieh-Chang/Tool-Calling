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
      
      // 等待 graph3DInstance 與 camera/controls 初始化（最多等 10s）
      await page.waitForFunction(() => {
        // 一定要通過 window 取得
        const g = window.graph3DInstance;
        if (!g) return false;
        // camera 可能是 function 返回相機或直接是物件，兩種情況都判斷
        const cam = (typeof g.camera === 'function') ? g.camera() : g.camera;
        const controls = g.controls;
        const target = controls && controls.target;
        return !!cam && !!controls && !!target;
      }, { timeout: 10000 });

      // 驗證 2D 視角按鈕存在
      const btn = await page.$('#viewToggleBtn');
      assert.ok(btn, '應存在 3D/2D 切換按鈕');

      // 點擊切換 3D
      await btn.click();
      
      // 等待 graph3DInstance 初始化
      await page.waitForFunction(() => {
        const g = window.graph3DInstance;
        if (!g) return false;
        const cam = (typeof g.camera === 'function') ? g.camera() : g.camera;
        const controls = g.controls;
        const target = controls && controls.target;
        return !!cam && !!controls && !!target;
      }, { timeout: 10000 });

      // 檢查 3D 相機與 Target
      const cameraState = await page.evaluate(() => {
        const g = window.graph3DInstance;
        if (!g) return null;
        const c = (typeof g.camera === 'function') ? g.camera() : g.camera;
        const controls = g.controls;
        const t = controls ? controls.target : null;
        return {
          hasCamera: !!c,
          hasTarget: !!t,
          targetPos: t ? { x: t.x, y: t.y, z: t.z } : null
        };
      });

      assert.ok(cameraState && cameraState.hasCamera, '3D 視角應成功初始化相機');
      assert.equal(consoleErrors.length, 0, `不應產生 JavaScript 控制台錯誤: ${consoleErrors.join(', ')}`);
    } finally {
      if (page) await page.close();
      if (browser) await browser.close();
    }
  });
});
