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

// 🔴 重要：靜態檔案的來源目錄。
//
// 預設（以及長久以來的唯一行為）是 `dist/`，但它有兩個陷阱：
//   1. `dist/` 在 .gitignore 內，不受版控，是 `npm run build` 的產物。
//   2. 因此**任何對 `web/` 的修改都必須先跑 `npm run build` 才會生效**——
//      2026-09-20 就是因為不知道這點，改了 `web/index.html` 與 `web/app.js`
//      卻一直看到舊畫面，白白繞了一大圈。
//
// `--dev` 現在會改為直接服務 `web/`，讓前端改動即時生效。
const DEV_MODE = process.argv.includes('--dev');
const distDir = DEV_MODE ? path.join(__dirname) : path.join(rootDir, 'dist');
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

/**
 * 背景補齊單一工具的「語意欄位」（加入流程的第二階段）
 *
 * 為什麼要分兩階段
 * ────────────────
 * `scan-tool.js`（第一階段）只能填機器可得的欄位：
 * description、language、topics→capabilities。但 useCase（真實使用情境）、
 * advantages（優勢）、`*_zh`（繁中）是**語意欄位**，規則做不到——
 * 掃描階段的 useCase 只是複製 description，advantages 一律留空。
 *
 * 為什麼要背景執行
 * ────────────────
 * 讀 README ＋ LLM 呼叫約需 2~10 秒。不該讓「加入」按鈕等這麼久，
 * 所以先回 201「已加入」，補齊完成後再寫回 registry。
 *
 * 失敗處理
 * ────────
 * 一律靜默：工具**已經加入成功**，只是欄位維持留白。
 * README 資訊不足時 enrichToolFromReadme 會回傳 null——
 * 這時寧可留白，也不要為了消 validate 警告而填推測內容。
 */
async function enrichToolInBackground(toolId) {
  try {
    const { getKeyStatus } = await import('../core/llm-keys.js');
    // 金鑰可能來自環境變數，也可能是使用者剛在 UI 上輸入的（執行期注入）
    if (!getKeyStatus().configured) {
      console.log(`[AddTool] 未設定 API 金鑰，${toolId} 維持 experimental（僅完成第一階段）`);
      return;
    }

    const { loadRegistry, saveRegistry } = await import('../core/registry.js');
    const { enrichToolFromReadme } = await import('../core/tool-enricher.js');
    const tool = loadRegistry().tools.find((t) => t.id === toolId);
    if (!tool) return;

    const patch = await enrichToolFromReadme(tool);
    if (!patch) {
      console.log(`[AddTool] README 資訊不足，${toolId} 維持 experimental（不填推測內容）`);
      return;
    }

    // 寫回前重讀：期間可能已被其他程序（sync-daemon、trending）更新
    const fresh = loadRegistry();
    const t2 = fresh.tools.find((t) => t.id === toolId);
    if (!t2) return;
    const mergedKeys = [];
    for (const [k, v] of Object.entries(patch)) {
      // useCase 例外：掃描階段的複製品要換掉
      if (k === 'useCase' && t2.useCase === t2.description) { t2[k] = v; mergedKeys.push(k); }
      else if (!t2[k] || (Array.isArray(t2[k]) && t2[k].length === 0)) { t2[k] = v; mergedKeys.push(k); }
    }
    if (mergedKeys.length === 0) return;

    // ── 生命週期：補齊完成才升級 ──────────────────────────────────
    // 掃描階段一律進 experimental；只有語意欄位真的齊了才升 active。
    // 轉換與完整度判準都收在 core/tool-lifecycle.js，
    // 與 CLI、批次腳本共用同一份定義（勿在此內聯判準）。
    const { activateIfComplete } = await import('../core/tool-lifecycle.js');
    const upgraded = activateIfComplete(t2);
    if (upgraded) console.log(`[AddTool] ${toolId} 語意欄位補齊完成 → 升級為 active`);

    saveRegistry(fresh);
    try { syncRegistryToDist(); } catch {}
    console.log(`[AddTool] 背景補齊完成: ${toolId} → ${mergedKeys.join(', ')}${upgraded ? '（status → active）' : '（仍為 experimental）'}`);
  } catch (err) {
    console.warn(`[AddTool] 背景補齊失敗（工具已加入，欄位維持留白）: ${err.message}`);
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

    // ─── 多工具鏈規劃 API ──────────────────────────────────────────────
    // 專案型需求通常不是單一工具能解決（例：「抓網頁資料然後做成簡報」）。
    // 這個端點把任務拆成步驟，每步給主力工具 + 備選，並標出資料怎麼接力。
    if (decodedUrl === '/api/chain' && req.method === 'POST') {
      const { task, topK = 3 } = JSON.parse(req._body || '{}');
      if (!task || !String(task).trim()) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders(req) });
        res.end(JSON.stringify({ error: 'task 不可為空' }));
        return;
      }
      try {
        const { loadRegistry, displayText } = await import('../core/registry.js');
        const { planToolSet } = await import('../core/tool-chain.js');
        const registry = loadRegistry();
        const plan = planToolSet(registry.tools, String(task).trim(), { topK: Math.min(Number(topK) || 3, 10) });
        const byId = new Map(registry.tools.map((t) => [t.id, t]));
        const steps = plan.steps.map((s) => ({
          ...s,
          recommendedTool: s.recommendedTool ? {
            ...s.recommendedTool,
            description_zh: displayText(byId.get(s.recommendedTool.id), 'description'),
          } : null,
        }));
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders(req) });
        res.end(JSON.stringify({ task: plan.task, totalSteps: plan.totalSteps, engine: plan.engine, asciiPipeline: plan.asciiPipeline, steps, summary: plan.summary }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders(req) });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    // ─── 擷取管線 API ──────────────────────────────────────────────────
    // LLM Wiki 的 Capture 層：把「素材 → 可用筆記」拆成步驟。
    // 這正是 The LLM Wiki Blueprint 警告的「輸入瓶頸」——
    // 多數人只做創作與檢索，卻忽略了資料怎麼進來。
    if (decodedUrl === '/api/ingest' && req.method === 'POST') {
      const { source, topK = 2 } = JSON.parse(req._body || '{}');
      if (!source || !String(source).trim()) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders(req) });
        res.end(JSON.stringify({ error: 'source 不可為空' }));
        return;
      }
      try {
        const { loadRegistry, displayText } = await import('../core/registry.js');
        const { planIngestion } = await import('../core/ingestion.js');
        const registry = loadRegistry();
        const plan = planIngestion(registry.tools, String(source).trim(), { topK: Math.min(Number(topK) || 2, 10) });
        if (!plan) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders(req) });
          res.end(JSON.stringify({ error: `不支援的素材來源：${source}` }));
          return;
        }
        const byId = new Map(registry.tools.map((t) => [t.id, t]));
        const stages = plan.stages.map((s) => ({
          ...s,
          recommendedTool: s.recommendedTool ? {
            ...s.recommendedTool,
            description_zh: displayText(byId.get(s.recommendedTool.id), 'description'),
          } : null,
        }));
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders(req) });
        res.end(JSON.stringify({ ...plan, stages }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders(req) });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    // ─── 需求收斂追問 API ──────────────────────────────────────────────
    // 只在系統不確定時才提問（decision 不是 adopt、或置信度不足）。
    // 題目由候選集的實際差異動態產生，不是寫死的題庫。
    if (decodedUrl === '/api/clarify' && req.method === 'POST') {
      const { query, answers = {}, topK = 5 } = JSON.parse(req._body || '{}');
      if (!query || !String(query).trim()) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders(req) });
        res.end(JSON.stringify({ error: 'query 不可為空' }));
        return;
      }
      try {
        const { loadRegistry, displayText } = await import('../core/registry.js');
        const { retrieve } = await import('../core/retrieval-fusion.js');
        const { planClarification, applyAnswer, CLARIFY_DIMENSIONS } = await import('../core/clarifier.js');
        const registry = loadRegistry();
        const tools = registry.tools;
        const byId = new Map(tools.map((t) => [t.id, t]));

        // 已回答的維度值併進查詢，讓檢索本身也吃到約束
        const suffix = Object.values(answers).filter((v) => v && v !== '__any__').join(' ');
        const effectiveQuery = suffix ? `${String(query).trim()} ${suffix}` : String(query).trim();
        const r = retrieve(tools, effectiveQuery, { topK: Math.min(Number(topK) || 5, 20) });

        let candidates = r.results;
        const applied = [];
        for (const [dim, val] of Object.entries(answers)) {
          if (!CLARIFY_DIMENSIONS.some((d) => d.key === dim)) continue;
          const out = applyAnswer(candidates, tools, dim, val);
          candidates = out.candidates;
          applied.push({ dimension: dim, value: val, dropped: out.dropped });
        }

        const confident = r.decision === 'adopt' && (r.confidence ?? 0) >= 0.35;
        const plan = planClarification(candidates, tools, {
          asked: Object.keys(answers), topN: Math.min(Number(topK) || 5, 20), decision: r.decision,
        });

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders(req) });
        res.end(JSON.stringify({
          query: String(query).trim(),
          effectiveQuery,
          decision: r.decision,
          confidence: r.confidence,
          shouldAsk: !confident && plan.shouldAsk,
          skipReason: confident ? '已達高置信度，直接給答案' : plan.reason,
          question: (!confident && plan.shouldAsk) ? {
            dimension: plan.question.key,
            label: plan.question.label,
            prompt: plan.question.question,
            options: plan.question.options.map((o) => o.value),
          } : null,
          appliedAnswers: applied,
          candidates: candidates.slice(0, Math.min(Number(topK) || 5, 20)).map((x) => ({
            id: x.id,
            name: byId.get(x.id)?.name || x.name,
            category: x.category,
            description_zh: displayText(byId.get(x.id), 'description'),
            score: x.score,
          })),
        }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders(req) });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    // ─── API 金鑰管理（背景補齊語意欄位用）─────────────────────────────
    // 為什麼需要這個端點：使用者不一定會在啟動伺服器時就設好 AGNES_API_KEY，
    // 但「加入工具後背景補齊語意欄位」（core/tool-enricher.js）需要 LLM。
    // 與其要他們重啟伺服器，不如在 UI 上提示輸入。
    //
    // 🔒 安全設計：
    //   - 金鑰**只存在伺服器記憶體**，不寫入磁碟、不進版控、不寫 log
    //   - 狀態查詢只回「遮罩後的標籤」，不回完整金鑰
    //   - 寫入端點受 isTrustedOrigin 保護（與 /api/tools/add 同等級）
    //   - 重啟即失效；要持久化請設環境變數（伺服器啟動時讀取）
    if (decodedUrl === '/api/keys/status' && req.method === 'GET') {
      const { getKeyStatus } = await import('../core/llm-keys.js');
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders(req), 'Cache-Control': 'no-cache' });
      res.end(JSON.stringify(getKeyStatus()));
      return;
    }

    if (decodedUrl === '/api/keys' && req.method === 'POST') {
      if (!isTrustedOrigin(req)) {
        res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders(req) });
        res.end(JSON.stringify({ error: 'Forbidden: untrusted origin' }));
        return;
      }
      const { keys } = JSON.parse(req._body || '{}');
      if (!keys || !String(keys).trim()) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders(req) });
        res.end(JSON.stringify({ error: 'keys 不可為空' }));
        return;
      }
      try {
        const { setRuntimeKeys, getKeyStatus } = await import('../core/llm-keys.js');
        const r = setRuntimeKeys(String(keys));
        // ⚠️ 只記數量，不記金鑰內容
        console.log(`[Keys] UI 注入 ${r.added} 把金鑰（目前共 ${r.total} 把，僅存記憶體）`);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders(req) });
        res.end(JSON.stringify({ ok: true, added: r.added, ...getKeyStatus() }));
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

        // 更新 star snapshot（stars 必須在 push 之前寫進 newTool：
        // 下面只有一次無條件存檔，事後補的欄位不會落盤）
        const { attachStarsToTool } = await import('../core/stars.js');
        await attachStarsToTool(newTool, githubUrl);

        registry.tools.push(newTool);
        saveRegistry(registry);

        // 同步到 dist
        try { syncRegistryToDist(); } catch {}

        // LLM 分類優化（使用 AGNES_API_KEY 時觸發）
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
          console.warn('[AddTool] LLM 分類失敗，保留規則分類:', err.message);
        }

        // 觸發 hook-reclassify dry-run，提示是否需要人工覆核
        try {
          const { main: runHook } = await import('../scripts/hook-reclassify.js');
          const hookResult = await runHook({ dryRun: true });
          if (hookResult.recommendations?.length > 0) {
            console.log('[AddTool] hook-reclassify 建議:', JSON.stringify(hookResult.recommendations.slice(0, 3)));
          }
        } catch (err) {
          console.warn('[AddTool] hook-reclassify 未執行:', err.message);
        }

        // 第二階段：背景補齊語意欄位（useCase／advantages／*_zh）。
        // 不 await——使用者立刻看到「已加入」，補齊在背景完成。
        setImmediate(() => enrichToolInBackground(newTool.id));

        res.writeHead(201, { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders(req) });
        res.end(JSON.stringify({
          status: 'added',
          tool: { id: newTool.id, name: newTool.name, category: newTool.category, stars: newTool.stars || 0 },
          classification: classificationInfo,
          enriching: Boolean(process.env.AGNES_API_KEY),
        }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders(req) });
        res.end(JSON.stringify({ error: `新增失敗: ${err.message}` }));
      }
      return;
    }

    // ─── 關閉系統 API ──────────────────────────────────────────────────
    // 前端「關閉系統」按鈕呼叫此端點：回應先送回瀏覽器，再於下一個
    // event loop tick 優雅關閉 HTTP server 並結束程序。
    // 僅允許本機來源 + 需帶確認字串，避免任意網頁或 curl 誤關。
    if (decodedUrl === '/api/shutdown' && req.method === 'POST') {
      if (!isTrustedOrigin(req)) {
        res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'Forbidden: untrusted origin' }));
        return;
      }
      let payload = {};
      try { payload = JSON.parse(req._body || '{}'); } catch { payload = {}; }
      if (payload.confirm !== 'SHUTDOWN') {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders(req) });
        res.end(JSON.stringify({ error: '確認字串不符' }));
        return;
      }

      console.log('⏹ 收到關閉系統請求，伺服器即將結束...');
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        ...corsHeaders(req),
        'Cache-Control': 'no-cache'
      });
      res.end(JSON.stringify({ status: 'shutting_down' }));

      // 讓回應先 flush 出去，再關閉監聽並退出
      setTimeout(() => {
        server.close(() => process.exit(0));
        // 安全網：3 秒內若有連線未斷，強制退出
        setTimeout(() => process.exit(0), 3000).unref();
      }, 200);
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
    //
    // 例外：`/registry/*` 一律改從專案根的 `registry/` 讀取。
    // `dist/registry/` 只是建置時的副本，會過期（2026-09-20 就因此讓前端
    // 讀到少 10 筆譯文的舊 tools.json）。資料目錄不應該走建置副本。
    const ROOT_PREFIXES = [['/registry/', 'registry']];
    if (DEV_MODE) {
      // dev 模式直接服務 web/，但 web/core/ 不存在——那是 build 時才複製進去的。
      // app.js 第 1 行 `import './core/search-engine.js'` 因此 404，整支 app.js 載入失敗
      // （2026-09-20 的空白畫面事故）。dev 模式改從專案根的 core/ 讀原始模組。
      ROOT_PREFIXES.push(['/core/', 'core']);
      ROOT_PREFIXES.push(['/docs/', 'docs']);
    }
    // 檔案層級對應：build-web.js 會把 docs/*.html 複製到 **dist/ 根目錄**
    // （不是 dist/docs/），所以正式網址是 `/pipeline-workflow.html`。
    // dev 模式沒有這層複製，需直接指回 docs/——否則全鏈路流程圖與知識圖譜 404
    // （2026-09-20：「流程圖被修沒了」）。
    const FILE_MAP = DEV_MODE ? {
      '/pipeline-workflow.html': path.join(rootDir, 'docs', 'pipeline-workflow.html'),
      '/knowledge-graph.html': path.join(rootDir, 'docs', 'knowledge-graph.html'),
    } : {};
    let serveBase = distDir;
    let relUrl = decodedUrl;
    // 需在 serveBase / relUrl 宣告之後才指派
    if (FILE_MAP[decodedUrl]) {
      const target = FILE_MAP[decodedUrl];
      serveBase = path.dirname(target);
      relUrl = '/' + path.basename(target);
    }
    for (const [prefix, dir] of ROOT_PREFIXES) {
      if (relUrl.startsWith(prefix)) {
        serveBase = path.join(rootDir, dir);
        relUrl = relUrl.slice(prefix.length - 1) || '/';
        break;
      }
    }

    const resolvedPath = path.resolve(serveBase, '.' + relUrl);
    const resolvedDist = path.resolve(serveBase);
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
