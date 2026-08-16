import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { discoverTrendingTools } from '../scripts/trending-weekly.js';
import { getCurrentWorldWeek } from '../core/world-week.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');
const distDir = path.join(rootDir, 'dist');
const trendingJsonPath = path.join(rootDir, 'registry', 'weekly-trending.json');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf'
};

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// ─── 探勘狀態鎖 ──────────────────────────────────────────────────────────
let isTrendingScanning = false;
let lastScanError = null;
let lastScanCompletedAt = null;

/**
 * 將生成的最新 registry 檔案同步至 dist 目錄
 */
function syncRegistryToDist() {
  const filesToSync = [
    { src: path.join(rootDir, 'registry', 'weekly-trending.json'), dest: path.join(distDir, 'registry', 'weekly-trending.json') },
    { src: path.join(rootDir, 'registry', 'tools.json'), dest: path.join(distDir, 'registry', 'tools.json') }
  ];

  for (const { src, dest } of filesToSync) {
    if (fs.existsSync(src)) {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(src, dest);
    }
  }
}

/**
 * 執行探勘任務（含狀態鎖與自動同步）
 */
async function triggerTrendingScan(triggerReason = 'manual') {
  if (isTrendingScanning) {
    return { status: 'already_running', message: '探勘任務正在執行中，請稍候...' };
  }

  isTrendingScanning = true;
  lastScanError = null;
  console.log(`\n🔄 [自動更新] 觸發每週漲星探勘作業（觸發原因: ${triggerReason}）...`);

  try {
    await discoverTrendingTools();
    syncRegistryToDist();
    lastScanCompletedAt = new Date().toISOString();
    console.log(`✅ [自動更新] 每週漲星探勘已順利完成並同步至工作台！(${lastScanCompletedAt})\n`);
    return { status: 'completed', completedAt: lastScanCompletedAt };
  } catch (err) {
    lastScanError = err.message || String(err);
    console.error(`❌ [自動更新] 探勘作業發生錯誤:`, err);
    return { status: 'error', error: lastScanError };
  } finally {
    isTrendingScanning = false;
  }
}

/**
 * 檢查啟動日期是否需要自動更新
 */
function checkAndAutoUpdateOnStartup() {
  try {
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const currentWeekInfo = getCurrentWorldWeek(now);

    let needsUpdate = false;
    let reason = '';

    if (!fs.existsSync(trendingJsonPath)) {
      needsUpdate = true;
      reason = '未找到每週漲星快照檔案 (weekly-trending.json)';
    } else {
      const data = JSON.parse(fs.readFileSync(trendingJsonPath, 'utf8'));
      const lastAsOfDate = data.currentWeekToDate?.asOfDate || (data.lastUpdated ? data.lastUpdated.slice(0, 10) : null);
      const lastWeekStr = data.currentWeekToDate?.weekStr || data.worldWeek;

      if (!lastAsOfDate) {
        needsUpdate = true;
        reason = '現有快照缺少更新日期標記';
      } else if (lastWeekStr !== currentWeekInfo.weekStr) {
        needsUpdate = true;
        reason = `已跨入新的 World Week (${lastWeekStr} -> ${currentWeekInfo.weekStr})`;
      } else if (lastAsOfDate !== todayStr) {
        needsUpdate = true;
        reason = `已跨日 (${lastAsOfDate} -> 今日 ${todayStr})`;
      }
    }

    if (needsUpdate) {
      console.log(`📌 [啟動檢查] 偵測到數據需要更新: ${reason}`);
      // 背景非阻塞執行，不阻礙伺服器監聽啟動
      setImmediate(() => {
        triggerTrendingScan(`startup_auto_check: ${reason}`);
      });
    } else {
      console.log(`✨ [啟動檢查] 當日數據已為最新 (截至今日)，直接使用快取。`);
    }
  } catch (err) {
    console.warn(`⚠ [啟動檢查] 讀取狀態失敗，略過自動更新:`, err.message);
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const rawUrl = req.url.split('?')[0];
    let decodedUrl = decodeURIComponent(rawUrl);

    // ─── API 路由處理 ──────────────────────────────────────────────────
    if (decodedUrl === '/api/trending/status') {
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache'
      });
      res.end(JSON.stringify({
        isScanning: isTrendingScanning,
        lastCompletedAt: lastScanCompletedAt,
        lastError: lastScanError
      }));
      return;
    }

    if (decodedUrl === '/api/trending/refresh') {
      if (isTrendingScanning) {
        res.writeHead(409, {
          'Content-Type': 'application/json; charset=utf-8',
          'Access-Control-Allow-Origin': '*'
        });
        res.end(JSON.stringify({ status: 'busy', message: '探勘任務正在執行中' }));
        return;
      }

      // 非阻塞觸發背景探勘並立即回應用戶端
      triggerTrendingScan('api_request');
      res.writeHead(202, {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*'
      });
      res.end(JSON.stringify({ status: 'started', message: '已在背景啟動即時探勘作業' }));
      return;
    }

    // ─── 靜態資源處理 ──────────────────────────────────────────────────
    if (decodedUrl === '/') {
      decodedUrl = '/index.html';
    }

    let filePath = path.join(distDir, decodedUrl);

    // 安全檢查：防止路徑遍歷
    if (!filePath.startsWith(distDir)) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('Forbidden');
      return;
    }

    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }

    if (!fs.existsSync(filePath)) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    const content = fs.readFileSync(filePath);
    res.writeHead(200, {
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache'
    });
    res.end(content);
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end(`Internal Server Error: ${err.message}`);
  }
});

server.listen(PORT, () => {
  console.log(`\n==================================================`);
  console.log(`🚀 本地精密儀表與數據工作台伺服器已啟動！`);
  console.log(`🌐 存取網址: http://localhost:${PORT}`);
  console.log(`📊 互動式工具圖譜: http://localhost:${PORT}/knowledge-graph.html`);
  console.log(`==================================================\n`);

  // 伺服器啟動後執行自動檢查
  checkAndAutoUpdateOnStartup();
});
