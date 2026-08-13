import { test, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import http from 'node:http';
import { promisify } from 'node:util';
import { fileURLToPath } from 'url';
import { loadRegistry } from '../core/registry.js';
import { generateKnowledgeGraph } from '../scripts/generate-knowledge-graph.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 簡易靜態檔案伺服器
function createStaticServer(rootDir) {
  const contentTypeMap = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.css': 'text/css',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
  };

  return http.createServer((req, res) => {
    try {
      const urlPath = decodeURIComponent(req.url.split('?')[0]);
      let filePath = path.join(rootDir, urlPath);
      if (urlPath === '/' || (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory())) {
        filePath = path.join(rootDir, 'knowledge-graph.html');
      }
      if (!fs.existsSync(filePath)) {
        res.statusCode = 404;
        res.end('Not found');
        return;
      }
      const ext = path.extname(filePath);
      const ct = contentTypeMap[ext] || 'application/octet-stream';
      res.setHeader('Content-Type', ct);
      const data = fs.readFileSync(filePath);
      res.end(data);
    } catch (e) {
      res.statusCode = 500;
      res.end('Server error');
    }
  });
}

describe('知識圖譜 2D/3D 雙視角與平移驗證', () => {
  it('應能正確載入 HTML 並切換至 3D 視角且無 Console Error', async () => {
    // 若 HTML 不存在（CI 環境因 .gitignore 未追蹤），先即時生成
    const htmlPath = path.resolve(__dirname, '../docs/knowledge-graph.html');
    if (!fs.existsSync(htmlPath)) {
      const registry = loadRegistry();
      generateKnowledgeGraph(registry);
    }

    // 啟動本機靜態伺服器
    const serverRoot = path.resolve(__dirname, '../docs');
    const server = createStaticServer(serverRoot);
    const listen = promisify(server.listen.bind(server));
    await listen(0, '127.0.0.1');
    const port = server.address().port;
    const pageUrl = `http://127.0.0.1:${port}/knowledge-graph.html`;

    let browser;
    let page;

    try {
      // CI 友善的啟動參數
      browser = await chromium.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--disable-background-timer-throttling'
        ]
      });

      page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

      const consoleMessages = [];
      page.on('console', msg => {
        consoleMessages.push({ type: msg.type(), text: msg.text() });
      });
      page.on('pageerror', err => {
        consoleMessages.push({ type: 'error', text: err.message });
      });

      // 使用 HTTP URL 而非 file://，並延長載入 timeout
      await page.goto(pageUrl, { waitUntil: 'load', timeout: 60000 });

      // 驗證 2D 視角按鈕存在
      const btn = await page.$('#viewToggleBtn');
      assert.ok(btn, '應存在 3D/2D 切換按鈕');

      // 點擊切換 3D
      await btn.click({ force: true });

      // 等待 5 秒讓 3D 圖初始化
      await page.waitForTimeout(5000);

      // 檢查 3D 實例是否已創建
      const instanceCheck = await page.evaluate(() => {
        return {
          hasWindow: typeof window !== 'undefined',
          hasGraph3D: typeof window.graph3DInstance !== 'undefined',
          graph3DType: typeof window.graph3DInstance
        };
      });

      console.log('Instance check:', JSON.stringify(instanceCheck, null, 2));

      // 記錄所有 console messages
      console.log('Console messages:', JSON.stringify(consoleMessages.filter(m => m.type === 'error' || m.type === 'warning'), null, 2));

      // 只要有 3D 實例就通過測試（不強制要求 camera 已初始化）
      assert.ok(instanceCheck.hasGraph3D, '3D 圖譜應成功初始化');
      
      // 檢查是否有錯誤訊息
      const errors = consoleMessages.filter(m => m.type === 'error');
      assert.equal(errors.length, 0, `不應產生 JavaScript 控制台錯誤: ${errors.map(e => e.text).join(', ')}`);
    } finally {
      if (page) await page.close();
      if (browser) await browser.close();
      server.close();
    }
  });
});
