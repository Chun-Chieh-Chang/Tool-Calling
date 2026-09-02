import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { discoverTrendingTools } from '../scripts/trending-weekly.js';
import { getCurrentWorldWeek } from '../core/world-week.js';
import { syncRegistryToDist } from '../scripts/dist-sync.js';
import { classifyTool } from '../core/classifier.js';

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

    // ─── POST 請求 body 讀取 ────────────────────────────────────────────
    if (req.method === 'POST') {
      let body = '';
      for await (const chunk of req) body += chunk;
      req._body = body;
    }

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

    // ─── 新增工具 API ──────────────────────────────────────────────────
    if (decodedUrl === '/api/tools/add' && req.method === 'POST') {
      const { url: githubUrl } = JSON.parse(req._body || '{}');
      const githubRegex = /^https?:\/\/github\.com\/([^/]+)\/([^/]+)(?:\/(?:tree|blob)\/([^/]+)\/(.+))?\/?$/;
      const m = githubUrl?.match(githubRegex);
      if (!m) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ error: '無效的 GitHub URL' }));
        return;
      }

      const [, owner, repo, , subpath] = m;
      try {
        const { loadRegistry, saveRegistry, generateId } = await import('../core/registry.js');
        const registry = loadRegistry();

        if (registry.tools.some(t => t.url && t.url.toLowerCase() === githubUrl.toLowerCase())) {
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({ status: 'exists', message: '工具已存在於工具庫' }));
          return;
        }

        const { scan } = await import('../scripts/scan-tool.js');
        const newTool = await scan(githubUrl, { silent: true });

        let id = newTool.id;
        if (registry.tools.some(t => t.id === id)) id = generateId(`${owner}-${subpath ? subpath.split('/').pop() : repo}`);
        if (registry.tools.some(t => t.id === id)) id = `${id}-${owner}`;
        newTool.id = id;

        registry.tools.push(newTool);
        saveRegistry(registry);

        // 更新 star snapshot
        try {
          const { loadSnapshot, saveSnapshot, parseOwnerRepo } = await import('../core/snapshot.js');
          const snap = loadSnapshot();
          const parsed = parseOwnerRepo(githubUrl);
          if (parsed) {
            const apiUrl = `https://api.github.com/repos/${parsed.owner}/${parsed.repo}`;
            const res2 = await fetch(apiUrl, { headers: { 'User-Agent': 'Tool-Calling-Add-Agent' }, signal: AbortSignal.timeout(5000) });
            if (res2.ok) {
              const data = await res2.json();
              if (typeof data.stargazers_count === 'number') {
                snap[`${parsed.owner}/${parsed.repo}`] = data.stargazers_count;
                newTool.stars = data.stargazers_count;
                saveSnapshot(snap);
              }
            }
          }
        } catch { /* snapshot 非必要 */ }

        // 同步到 dist
        try { syncRegistryToDist(); } catch {}

        // LLM 分类优化（使用 AGNES_API_KEY 时触发）
        let classificationInfo = { source: 'rule', confidence: 0.6 };
        try {
          const llmResult = await classifyTool(newTool.name, newTool.description || '', newTool.topics || []);
          if (llmResult.category !== newTool.category && llmResult.confidence >= 0.7) {
            newTool.category = llmResult.category;
            registry.tools[registry.tools.length - 1] = newTool;
            saveRegistry(registry);
            classificationInfo = llmResult;
          }
        } catch (err) {
          console.warn('[AddTool] LLM 分类失败，保留规则分类:', err.message);
        }

        // 触发 hook-reclassify dry-run，提示是否需要人工覆核
        try {
          const { main: runHook } = await import('../scripts/hook-reclassify.js');
          const hookResult = await runHook({ dryRun: true });
          if (hookResult.recommendations?.length > 0) {
            console.log('[AddTool] hook-reclassify 建议:', JSON.stringify(hookResult.recommendations.slice(0, 3)));
          }
        } catch (err) {
          console.warn('[AddTool] hook-reclassify 未执行:', err.message);
        }

        res.writeHead(201, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({
          status: 'added',
          tool: { id: newTool.id, name: newTool.name, category: newTool.category, stars: newTool.stars || 0 },
          classification: classificationInfo
        }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ error: `新增失敗: ${err.message}` }));
      }
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

  // 週期性自動更新：每 30 分鐘檢查跨日/跨週，保持「本週迄今」即時並於週初捕獲基準
  setInterval(() => {
    try { checkAndAutoUpdateOnStartup(); } catch { /* 忽略暫態錯誤 */ }
  }, 30 * 60 * 1000);
});
