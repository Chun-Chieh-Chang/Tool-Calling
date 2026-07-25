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

  // Helper to get camera and target position
  const getCameraState = () => page.evaluate(() => {
    const c = graph3DInstance.camera();
    const t = graph3DInstance.controls().target;
    return {
      camPos: { x: c.position.x, y: c.position.y, z: c.position.z },
      targetPos: { x: t.x, y: t.y, z: t.z }
    };
  });

  console.log('Initial State:', await getCameraState());

  // Test 1: Right Click Drag (PAN)
  await page.mouse.move(960, 540);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(1160, 540, { steps: 10 });
  await page.mouse.up({ button: 'right' });
  await page.waitForTimeout(500);
  const stateRightDrag = await getCameraState();
  console.log('After Right Click Drag (PAN):', stateRightDrag);

  // Test 2: Shift + Left Click Drag
  // Reset camera position
  await page.evaluate(() => graph3DInstance.cameraPosition({ x: 0, y: 0, z: 480 }, { x: 0, y: 0, z: 0 }, 0));
  await page.waitForTimeout(500);

  const startStateShift = await getCameraState();
  console.log('Before Shift + Left Drag:', startStateShift);

  await page.keyboard.down('Shift');
  await page.mouse.move(960, 540);
  await page.mouse.down({ button: 'left' });
  await page.mouse.move(1160, 540, { steps: 10 });
  await page.mouse.up({ button: 'left' });
  await page.keyboard.up('Shift');
  await page.waitForTimeout(500);

  const endStateShift = await getCameraState();
  console.log('After Shift + Left Drag:', endStateShift);

  const targetMoved = Math.abs(endStateShift.targetPos.x - startStateShift.targetPos.x) > 5;
  console.log('Did Shift + Left Drag PAN (target moved)?', targetMoved ? 'YES (PAN)' : 'NO (ROTATE)');

  await browser.close();
})();
