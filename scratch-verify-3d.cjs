// 3D 知識圖譜視覺確效腳本 — 使用 Playwright 截圖驗證
const { chromium } = require('playwright');
const path = require('path');

const artifactDir = 'C:/Users/3kids/.gemini/antigravity-ide/brain/d1b91800-9e1e-4ad6-a9ee-5601501c6d62';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

  // 收集 Console 輸出
  const consoleLogs = [];
  page.on('console', msg => consoleLogs.push({ type: msg.type(), text: msg.text() }));
  page.on('pageerror', err => consoleLogs.push({ type: 'error', text: err.message }));

  const htmlPath = path.resolve(__dirname, 'docs/knowledge-graph.html');
  const fileUrl = 'file:///' + htmlPath.replace(/\\/g, '/');
  console.log('[1] 載入頁面:', fileUrl);
  await page.goto(fileUrl, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);

  // 截圖 2D 視角
  const screenshot2D = path.join(artifactDir, 'verify_2d_view.png');
  await page.screenshot({ path: screenshot2D, fullPage: false });
  console.log('[2] 2D 視角截圖已儲存:', screenshot2D);

  // 點擊切換到 3D
  const btn = await page.$('#viewToggleBtn');
  if (btn) {
    await btn.click();
    console.log('[3] 已點擊 3D 切換按鈕');
  } else {
    console.error('[3] 找不到 3D 切換按鈕！');
  }

  // 等待 3D WebGL 場景渲染
  await page.waitForTimeout(5000);

  // 截圖 3D 視角
  const screenshot3D = path.join(artifactDir, 'verify_3d_view.png');
  await page.screenshot({ path: screenshot3D, fullPage: false });
  console.log('[4] 3D 視角截圖已儲存:', screenshot3D);

  // 輸出所有 Console Logs
  console.log('\n[5] Console 輸出彙總 (' + consoleLogs.length + ' 條):');
  const errors = consoleLogs.filter(l => l.type === 'error');
  const warnings = consoleLogs.filter(l => l.type === 'warning');
  if (errors.length === 0 && warnings.length === 0) {
    console.log('   ✅ 零 Error、零 Warning！');
  } else {
    errors.forEach(e => console.log('   ❌ ERROR:', e.text));
    warnings.forEach(w => console.log('   ⚠️ WARNING:', w.text));
  }

  await browser.close();
  console.log('\n[完成] Playwright 視覺確效結束。');
})();
