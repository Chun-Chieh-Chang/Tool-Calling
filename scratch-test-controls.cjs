const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

  const htmlPath = path.resolve(__dirname, 'docs/knowledge-graph.html');
  const fileUrl = 'file:///' + htmlPath.replace(/\\/g, '/');
  await page.goto(fileUrl, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // Switch to 3D
  await page.click('#viewToggleBtn');
  await page.waitForTimeout(3000);

  // Evaluate controls state in browser
  const info = await page.evaluate(() => {
    const controls = graph3DInstance.controls();
    return {
      enablePan: controls.enablePan,
      screenSpacePanning: controls.screenSpacePanning,
      mouseButtons: controls.mouseButtons,
      domElement: controls.domElement ? controls.domElement.tagName : null
    };
  });
  console.log('Controls Info:', info);

  await browser.close();
})();
