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
    // 會寫入 registry 或觸發背景任務的端點，必須先通過來源檢查。
    //
    // 背景：這些端點原本完全無認證，且回應帶 `Access-Control-Allow-Origin: *`。
    // 這代表任意網頁都能跨站呼叫 `/api/tools/add` 寫入你的工具庫，或反覆觸發
    // `/api/trending/refresh` 消耗 GitHub API 配額（相當於 DoS）。
    //
    // 這是本機工作台，不導入帳號體系；改以「來源必須是本機」作為防線：
    // 瀏覽器發出的跨站請求一定帶 Origin，因此惡意網域會被擋下；
    // curl 等無 Origin 的直接呼叫仍可用（這是本工具的使用方式）。
    const isTrustedOrigin = (req) => {
      const origin = req.headers.origin;
      if (!origin) return true;
      try {
        const { hostname } = new URL(origin);
        return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '[::1]';
      } catch {
        return false;
      }
    };

    // 只對信任來源回顯 Origin；不再無差別給 `*`
    const corsHeaders = (req) => {
      const origin = req.headers.origin;
      return isTrustedOrigin(req) && origin
        ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' }
        : {};
    };

    if (decodedUrl === '/api/trending/status') {
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        ...corsHeaders(req),
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
      if (!isTrustedOrigin(req)) {
        res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'Forbidden: untrusted origin' }));
        return;
      }

      if (isTrendingScanning) {
        res.writeHead(409, {
          'Content-Type': 'application/json; charset=utf-8',
          ...corsHeaders(req)
        });
        res.end(JSON.stringify({ status: 'busy', message: '探勘任務正在執行中' }));
        return;
      }

      // 非阻塞觸發背景探勘並立即回應用戶端
      triggerTrendingScan('api_request');
      res.writeHead(202, {
        'Content-Type': 'application/json; charset=utf-8',
        ...corsHeaders(req)
      });
      res.end(JSON.stringify({ status: 'started', message: '已在背景啟動即時探勘作業' }));
      return;
    }

    // ─── 檢索 API ──────────────────────────────────────────────────────
    // 前端原本自行實作 TF-IDF（search-worker.js）與 L2，與 core/ 的引擎
    // 不一致，導致檢索引擎的改進無法反映到網頁。此端點讓前端改走同一套
    // 引擎（agent 四維 + fusion 融合 + 可選 LLM rerank）。
    //
    // 為什麼放 server：agent-retrieval.js 依賴 node:fs 讀取 embeddings，
    // 本來就無法在瀏覽器執行；且 rerank 需要 API key，不應暴露到前端。
    if (decodedUrl === '/api/search' && req.method === 'POST') {
      const { query, topK = 30, category, rerank } = JSON.parse(req._body || '{}');
      if (!query || !String(query).trim()) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders(req) });
        res.end(JSON.stringify({ error: 'query 不可為空' }));
        return;
      }

      const t0 = Date.now();
      try {
        const { loadRegistry, displayText } = await import('../core/registry.js');
        const { retrieveWithRerank } = await import('../core/retrieval-fusion.js');
        const registry = loadRegistry();
        const r = await retrieveWithRerank(registry.tools, String(query).trim(), {
          topK: Math.min(Math.max(Number(topK) || 30, 1), 100),
          category: category || undefined,
          rerank,   // undefined = 有 key 就啟用
        });

        // 補上繁中譯文供前端顯示（譯文是顯示層關注點，不進檢索核心）。
        // 這裡用原文的**完整** registry 物件查表，故取得到 *_zh 欄位。
        const byId = new Map(registry.tools.map((t) => [t.id, t]));
        const results = r.results.map((x) => {
          const full = byId.get(x.id);
          return full
            ? { ...x, description_zh: displayText(full, 'description'), useCase_zh: displayText(full, 'useCase') }
            : x;
        });

        res.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          ...corsHeaders(req),
          'Cache-Control': 'no-cache',
        });
        res.end(JSON.stringify({
          query,
          decision: r.decision,
          confidence: r.confidence,
          rerank: r.rerank ?? null,
          elapsedMs: Date.now() - t0,
          results,
        }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders(req) });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    // ─── 新增工具 API ──────────────────────────────────────────────────
    if (decodedUrl === '/api/tools/add' && req.method === 'POST') {
      if (!isTrustedOrigin(req)) {
        res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'Forbidden: untrusted origin' }));
        return;
      }

      const { url: githubUrl } = JSON.parse(req._body || '{}');
      const githubRegex = /^https?:\/\/github\.com\/([^/]+)\/([^/]+)(?:\/(?:tree|blob)\/([^/]+)\/(.+))?\/?$/;
      const m = githubUrl?.match(githubRegex);
      if (!m) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders(req) });
        res.end(JSON.stringify({ error: '無效的 GitHub URL' }));
        return;
      }

      const [, owner, repo, , subpath] = m;
      try {
        const { loadRegistry, saveRegistry, generateId } = await import('../core/registry.js');
        const registry = loadRegistry();

        if (registry.tools.some(t => t.url && t.url.toLowerCase() === githubUrl.toLowerCase())) {
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders(req) });
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
          // category 為 null 代表「無法分類」（needsReview），不可覆寫既有分類
          if (llmResult.category && llmResult.category !== newTool.category && llmResult.confidence >= 0.7) {
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

        res.writeHead(201, { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders(req) });
        res.end(JSON.stringify({
          status: 'added',
          tool: { id: newTool.id, name: newTool.name, category: newTool.category, stars: newTool.stars || 0 },
          classification: classificationInfo
        }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders(req) });
        res.end(JSON.stringify({ error: `新增失敗: ${err.message}` }));
      }
      return;
    }

    // ─── 靜態資源處理 ──────────────────────────────────────────────────
    if (decodedUrl === '/') {
      decodedUrl = '/index.html';
    }

    // 安全檢查：防止路徑遍歷
    //
    // 原本用 filePath.startsWith(distDir) —— 那是**字串**前綴比對，不是路徑邊界比對。
    // 由於 path.join 會正規化 `..`，請求 `/../dist-evil/secret` 會得到 `/app/dist-evil/secret`，
    // 它仍以 `/app/dist` 開頭而通過檢查，實際卻讀到 dist 同層的另一個目錄。
    //
    // 正確做法：resolve 後要求「等於 distDir」或「以 distDir + 分隔符號」開頭。
    const resolvedPath = path.resolve(distDir, '.' + decodedUrl);
    const resolvedDist = path.resolve(distDir);
    if (resolvedPath !== resolvedDist && !resolvedPath.startsWith(resolvedDist + path.sep)) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('Forbidden');
      return;
    }
    let filePath = resolvedPath;

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
      ...corsHeaders(req),
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
