// 驗證 window.THREE 是否存在，以及 nodeThreeObject 回傳值
const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

  const htmlPath = path.resolve(__dirname, 'docs/knowledge-graph.html');
  const fileUrl = 'file:///' + htmlPath.replace(/\\/g, '/');
  await page.goto(fileUrl, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);

  // 點擊切換到 3D
  await page.click('#viewToggleBtn');
  await page.waitForTimeout(3000);

  // 在瀏覽器 context 中檢查 THREE 全域變數
  const result = await page.evaluate(() => {
    const checks = {
      windowTHREE: typeof window.THREE,
      globalTHREE: typeof THREE,
      graph3DInstance: typeof graph3DInstance,
      hasScene: !!(graph3DInstance && graph3DInstance.scene),
    };

    // 嘗試從 scene 中提取 THREE
    if (graph3DInstance && graph3DInstance.scene) {
      const scene = graph3DInstance.scene();
      checks.sceneType = scene ? scene.constructor.name : 'null';
      
      // 嘗試從 renderer 提取
      if (graph3DInstance.renderer) {
        const renderer = graph3DInstance.renderer();
        checks.rendererType = renderer ? renderer.constructor.name : 'null';
      }

      // 嘗試從 camera 提取
      if (graph3DInstance.camera) {
        const camera = graph3DInstance.camera();
        checks.cameraType = camera ? camera.constructor.name : 'null';
      }

      // 查找 scene children 裡有沒有 Sprite 類型
      if (scene && scene.children) {
        const spriteCount = scene.children.filter(c => c.type === 'Sprite').length;
        checks.spritesInScene = spriteCount;
        checks.totalChildren = scene.children.length;
        checks.childTypes = [...new Set(scene.children.map(c => c.type || c.constructor.name))];
      }
    }

    // 檢查 ForceGraph3D 暴露了什麼
    if (typeof ForceGraph3D !== 'undefined') {
      checks.forceGraph3DType = typeof ForceGraph3D;
    }

    return checks;
  });

  console.log('=== 3D 環境檢查結果 ===');
  console.log(JSON.stringify(result, null, 2));

  await browser.close();
})();
