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

  // Inject exact screen space pan algorithm for Shift + Left Click
  await page.evaluate(() => {
    const container3d = document.getElementById('network3d');
    container3d.addEventListener('contextmenu', e => e.preventDefault());

    let isShiftPanning = false;
    let lastMouseX = 0, lastMouseY = 0;

    container3d.addEventListener('pointerdown', function(e) {
      if (e.button === 0 && e.shiftKey) {
        isShiftPanning = true;
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
        try { container3d.setPointerCapture(e.pointerId); } catch(err) {}
        e.stopPropagation();
      }
    }, true);

    container3d.addEventListener('pointermove', function(e) {
      if (isShiftPanning && (e.buttons & 1)) {
        const dx = e.clientX - lastMouseX;
        const dy = e.clientY - lastMouseY;
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;

        const camera = graph3DInstance.camera();
        const controls = graph3DInstance.controls();
        if (camera && controls && controls.target) {
          const Vector3 = controls.target.constructor;
          const target = controls.target;
          
          const distance = camera.position.distanceTo(target);
          const fovRad = (camera.fov || 45) * Math.PI / 180;
          const factor = (distance * Math.tan(fovRad / 2) * 2) / (container3d.clientHeight || 1080);

          const vLeft = new Vector3(-dx * factor, 0, 0).applyQuaternion(camera.quaternion);
          const vUp = new Vector3(0, dy * factor, 0).applyQuaternion(camera.quaternion);

          const panOffset = new Vector3().addVectors(vLeft, vUp);
          
          camera.position.add(panOffset);
          target.add(panOffset);
          controls.update();
        }
        e.stopPropagation();
      }
    }, true);

    container3d.addEventListener('pointerup', function(e) {
      if (isShiftPanning) {
        isShiftPanning = false;
        try { container3d.releasePointerCapture(e.pointerId); } catch(err) {}
        e.stopPropagation();
      }
    }, true);
  });

  const getCameraState = () => page.evaluate(() => {
    const c = graph3DInstance.camera();
    const t = graph3DInstance.controls().target;
    return {
      camPos: { x: c.position.x, y: c.position.y, z: c.position.z },
      targetPos: { x: t.x, y: t.y, z: t.z }
    };
  });

  // Test Shift + Left Drag (Drag right by 200px)
  await page.keyboard.down('Shift');
  await page.mouse.move(960, 540);
  const startState = await getCameraState();
  
  await page.mouse.down({ button: 'left' });
  await page.mouse.move(1160, 540, { steps: 10 });
  await page.mouse.up({ button: 'left' });
  await page.keyboard.up('Shift');
  await page.waitForTimeout(500);

  const endStateShift = await getCameraState();
  console.log('Before Shift+Left:', startState);
  console.log('After Shift+Left:', endStateShift);

  const targetMoved = Math.hypot(endStateShift.targetPos.x - startState.targetPos.x, endStateShift.targetPos.y - startState.targetPos.y) > 5;
  console.log('Did Shift + Left Drag PAN (target & camPos moved together)?', targetMoved ? 'SUCCESS (PAN)' : 'FAILED');

  // Test Normal Left Drag (Drag right by 200px without Shift) -> should ROTATE camera around target!
  await page.evaluate(() => graph3DInstance.cameraPosition({ x: 0, y: 0, z: 480 }, { x: 0, y: 0, z: 0 }, 0));
  await page.waitForTimeout(500);
  const startNormal = await getCameraState();

  await page.mouse.move(960, 540);
  await page.mouse.down({ button: 'left' });
  await page.mouse.move(1160, 540, { steps: 10 });
  await page.mouse.up({ button: 'left' });
  await page.waitForTimeout(500);

  const endNormal = await getCameraState();
  console.log('Before Normal Left:', startNormal);
  console.log('After Normal Left:', endNormal);

  const camRotated = Math.abs(endNormal.camPos.x - startNormal.camPos.x) > 5 && Math.abs(endNormal.targetPos.x - startNormal.targetPos.x) < 1;
  console.log('Did Normal Left Drag ROTATE (camPos moved, target stayed)?', camRotated ? 'SUCCESS (ROTATE)' : 'FAILED');

  await browser.close();
})();
