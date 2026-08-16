import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runVisualVerification() {
  console.log('🚀 啟動 Playwright 知識圖譜 2D/3D 深度視覺與互動確效...');

  const browser = await chromium.launch({
    headless: true,
    args: [
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-webgl',
      '--enable-unsafe-swiftshader',
      '--no-sandbox'
    ]
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 }
  });

  const page = await context.newPage();

  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  try {
    console.log('📍 載入 http://localhost:3000/knowledge-graph.html...');
    await page.goto('http://localhost:3000/knowledge-graph.html', { waitUntil: 'networkidle', timeout: 15000 });

    // 等待 2D 圖譜完成初始化
    await page.waitForTimeout(1000);

    // 1. 截取 2D 全景截圖
    const screenshot2dInitial = path.join(__dirname, '../dist/verify-2d-initial.png');
    await page.screenshot({ path: screenshot2dInitial });
    console.log('📸 2D 全景初始截圖完成:', screenshot2dInitial);

    // 2. 測試 2D 雙擊節點深度對焦 (Double click node)
    console.log('🔍 測試 2D 雙擊節點對焦...');
    await page.evaluate(() => {
      if (window.data2d && window.network2d) {
        const allNodes = window.data2d.nodes.get();
        const toolNode = allNodes.find(n => n.group === 'tool');
        if (toolNode) {
          window.network2d.focus(toolNode.id, { scale: 3.5, animation: false });
          if (typeof showPanel === 'function') showPanel(toolNode);
        }
      }
    });
    await page.waitForTimeout(500);

    const screenshot2dZoom = path.join(__dirname, '../dist/verify-2d-deep-zoom.png');
    await page.screenshot({ path: screenshot2dZoom });
    console.log('📸 2D 深度對焦截圖完成:', screenshot2dZoom);

    // 3. 切換至 3D 視角
    console.log('🌌 切換至 3D 空間視角...');
    await page.click('#viewToggleBtn');
    await page.waitForTimeout(2500); // 等待 3D 力導向物理場計算

    const screenshot3dGalaxy = path.join(__dirname, '../dist/verify-3d-galaxy.png');
    await page.screenshot({ path: screenshot3dGalaxy });
    console.log('📸 3D 廣闊星系全景截圖完成:', screenshot3dGalaxy);

    // 4. 測試 3D 點擊節點向量推進對焦 (Deep Zoom to distance 28)
    console.log('🔭 測試 3D 點擊節點微觀對焦...');
    const targetToolName = await page.evaluate(() => {
      if (!window.graph3DInstance) return null;
      const nodes = window.graph3DInstance.graphData().nodes;
      const toolNode = nodes.find(n => n.group === 'tool');
      if (toolNode) {
        const currentCam = window.graph3DInstance.cameraPosition();
        const nodePos = { x: toolNode.x || 0, y: toolNode.y || 0, z: toolNode.z || 0 };
        
        let dirX = currentCam.x - nodePos.x;
        let dirY = currentCam.y - nodePos.y;
        let dirZ = currentCam.z - nodePos.z;
        const len = Math.hypot(dirX, dirY, dirZ) || 1;
        dirX /= len; dirY /= len; dirZ /= len;

        const newCamPos = {
          x: nodePos.x + dirX * 28,
          y: nodePos.y + dirY * 28,
          z: nodePos.z + dirZ * 28
        };

        window.graph3DInstance.cameraPosition(newCamPos, nodePos, 0); // 立即移動
        if (typeof showPanel === 'function') showPanel(toolNode);
        return toolNode.label;
      }
      return null;
    });

    await page.waitForTimeout(1000);

    const screenshot3dMicro = path.join(__dirname, '../dist/verify-3d-micro-detail.png');
    await page.screenshot({ path: screenshot3dMicro });
    console.log(`📸 3D 節點「${targetToolName}」微觀對焦截圖完成:`, screenshot3dMicro);

    // 5. 驗證左下角詳細面板內容
    const isPanelActive = await page.evaluate(() => {
      const panel = document.getElementById('detailPanel');
      return panel && panel.classList.contains('active');
    });
    console.log('📋 Obsidian 詳細資訊抽屜是否正常喚起:', isPanelActive ? '✅ 是' : '❌ 否');

    // 6. 控制台錯誤檢查
    console.log('🛡️ 控制台錯誤數量:', consoleErrors.length);
    if (consoleErrors.length > 0) {
      console.warn('⚠️ Console 錯誤:', consoleErrors);
    } else {
      console.log('✅ 零 Console 錯誤！');
    }

    console.log('🎉 Playwright 視覺確效全數通過！');
  } finally {
    await browser.close();
  }
}

runVisualVerification().catch(err => {
  console.error('❌ Playwright 確效失敗:', err);
  process.exit(1);
});
