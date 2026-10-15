/**
 * worker/index.js — 「加入工具庫」Cloudflare Worker（2026-10-15 裁決 Q1=B）
 *
 * 背景與分工
 * ──────────
 * GitHub Pages 只能託管靜態檔，沒有 server.js，寫入型端點（/api/tools/add）
 * 在 Pages 上不存在；而本機工作台的端點又刻意只允許 localhost（Host 頭雙閘門，
 * 見 web/server.js 的 isLocalRequest／isTrustedOrigin，2026-10-14 發佈決策）。
 *
 * Q1=B 的落地方式（裁決頁選定）：
 *   · 掃描＋LLM 補齊**在瀏覽器端完成**（web/add-pipeline.js）——使用者自備
 *     LLM API key，key 只存在該分頁記憶體，不經過本 Worker、不落地。
 *   · 本 Worker 只做三件事：驗證 payload → 合併進 tools.json → **開 PR**。
 *   · 直接 commit 到 main 是刻意不做的：2026-10-14 第五輪 Q5=B 裁決「維持 CI
 *     把關＋merge 模式」，PR 會跑完 npm test／validate／check-mece 才由人工合併。
 *
 * 安全設計
 * ────────
 *   · 端點公開（任何人都能提名），濫用防線=每 IP 每小時 5 次（best-effort，
 *     Workers 記憶體依 isolate 分佈，見 checkRateLimit 註解）＋payload 32KB 上限。
 *   · 可選 SUBMIT_TOKEN（環境變數）：設定後需帶 x-submit-token 標頭。
 *   · GITHUB_TOKEN 只存在 Worker secret，用 fine-grained PAT（contents:write）
 *     即可——只能操作這一個 repo，且產出是 PR 不是直接推送。
 *   · 不記錄、不轉送使用者的 LLM key（根本收不到）。
 *
 * 部署：見 worker/README.md（wrangler deploy + wrangler secret put）。
 */

// ─── 與 registry/schemas/tool.schema.json 同步的驗證常數 ────────────────────
// 🔴 這幾份 enum 是 schema 的鏡像。schema 是 SSOT，禁止在此「發明」新值；
//    tests/worker-tools-add.test.js 有守門測試逐項比對，schema 一改就紅燈。
const INSTALL_METHODS = [
  'npm', 'npx', 'pip', 'conda', 'cargo', 'composer', 'apt', 'docker', 'git',
  'git-clone', 'git-clone-sparse', 'curl', 'download', 'binary',
  'plugin-marketplace', 'none', 'manual',
];
const STATUS_VALUES = ['active', 'deprecated', 'experimental'];
const LANGUAGES = [
  'python', 'typescript', 'javascript', 'go', 'rust', 'java', 'kotlin', 'swift',
  'c', 'c++', 'c#', 'php', 'shell', 'powershell', 'html', 'css', 'less', 'vue',
  'markdown', 'mdx', 'jupyter notebook', 'clojure', 'other',
];
const REQUIRED_FIELDS = ['id', 'name', 'url', 'description', 'category', 'language', 'triggers', 'status'];

const MAX_BODY_BYTES = 32 * 1024;
const MAX_CAPABILITIES = 6;
const MAX_TRIGGERS = 8;
const RATE_POLICY = { max: 5, windowMs: 60 * 60 * 1000 };
const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const URL_RE = /^https:\/\/github\.com\/[^/\s]+\/[^/\s]+$/;

// 匯出供守門測試與 schema 比對（tests/worker-tools-add.test.js）
export const ENUMS = { INSTALL_METHODS, STATUS_VALUES, LANGUAGES, REQUIRED_FIELDS };

const json = (data, status = 200, extraHeaders = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...extraHeaders },
  });

// ─── 純函式（可測試；fetch handler 在檔案結尾） ─────────────────────────────

/**
 * 驗證單一工具條目（shape 層級；語意正確性由 CI 的 check-mece／validate 把關）
 * @returns {{ok: boolean, errors: string[], warnings: string[]}}
 */
export function validateToolEntry(tool) {
  const errors = [];
  const warnings = [];
  if (!tool || typeof tool !== 'object' || Array.isArray(tool)) {
    return { ok: false, errors: ['tool 必須是物件'], warnings };
  }

  for (const k of Object.keys(tool)) {
    if (k.startsWith('__')) errors.push(`內部暫存鍵不得外洩: ${k}`);
  }

  for (const f of REQUIRED_FIELDS) {
    if (tool[f] === undefined || tool[f] === null || tool[f] === '') {
      errors.push(`缺少必填欄位: ${f}`);
    }
  }

  const str = (v, max, name) => {
    if (typeof v !== 'string') return;
    if (v.length > max) errors.push(`${name} 過長（>${max} 字元）`);
  };

  if (typeof tool.id === 'string' && tool.id && !ID_RE.test(tool.id)) {
    errors.push('id 必須是 kebab-case（小寫英數與連字號）');
  }
  str(tool.name, 100, 'name');
  if (typeof tool.url === 'string' && tool.url && !URL_RE.test(tool.url)) {
    errors.push('url 必須是 https://github.com/owner/repo 形式');
  }
  str(tool.description, 320, 'description');
  str(tool.category, 40, 'category');
  str(tool.language, 30, 'language');
  str(tool.useCase, 320, 'useCase');

  if (typeof tool.status === 'string' && !STATUS_VALUES.includes(tool.status)) {
    errors.push(`status 必須是 ${STATUS_VALUES.join('／')}`);
  }
  // 生命週期鐵律：Web 提名一律 experimental（isFullyEnriched 通過才升 active）
  if (tool.status !== undefined && tool.status !== 'experimental') {
    errors.push('Web 提名的 status 必須是 experimental');
  }
  if (typeof tool.language === 'string' && tool.language && !LANGUAGES.includes(tool.language)) {
    errors.push(`language 不在 schema enum（${tool.language}）`);
  }
  if (typeof tool.addedAt === 'string' && tool.addedAt && Number.isNaN(Date.parse(tool.addedAt))) {
    errors.push('addedAt 必須是 ISO 日期字串');
  }

  if (!Array.isArray(tool.triggers)) {
    if (tool.triggers !== undefined) errors.push('triggers 必須是陣列');
  } else if (tool.triggers.length > MAX_TRIGGERS) {
    errors.push(`triggers 過多（>${MAX_TRIGGERS}）`);
  }
  if (tool.capabilities !== undefined) {
    if (!Array.isArray(tool.capabilities)) errors.push('capabilities 必須是陣列');
    else if (tool.capabilities.length > MAX_CAPABILITIES) errors.push(`capabilities 過多（>${MAX_CAPABILITIES}）`);
  }
  for (const arr of ['advantages', 'negativeConstraints']) {
    if (tool[arr] !== undefined && !Array.isArray(tool[arr])) errors.push(`${arr} 必須是陣列`);
  }

  if (!tool.install || typeof tool.install !== 'object') {
    errors.push('install 必須是物件');
  } else {
    if (!INSTALL_METHODS.includes(tool.install.method)) {
      errors.push(`install.method 不在 schema enum（${tool.install.method}）`);
    }
    if (typeof tool.install.command !== 'string' || !tool.install.command) {
      errors.push('install.command 不可為空');
    }
  }

  if (Array.isArray(tool.categories)) {
    if (tool.categories[0] !== tool.category) {
      errors.push('categories[0] 必須等同於 category（schema 規則）');
    }
  }

  // ─── warnings：不擋提交，但提醒審核者（對應 HANDOFF 的品質鐵律） ───
  if (typeof tool.useCase === 'string' && tool.useCase && typeof tool.description === 'string'
    && tool.useCase.toLowerCase().slice(0, 60) === tool.description.toLowerCase().slice(0, 60)) {
    warnings.push('useCase 與 description 前 60 字元相同——可能是掃描階段的複製品，尚未經 LLM 補齊');
  }
  if (Array.isArray(tool.advantages) && tool.advantages.length === 0) {
    warnings.push('advantages 為空——尚未經 LLM 補齊或 README 資訊不足');
  }
  if (!tool.description_zh) {
    warnings.push('缺少 description_zh——合併後請跑 npm run translate:zh');
  }
  if (typeof tool.description === 'string' && /待補充/.test(tool.description)) {
    warnings.push('description 含「待補充」——掃描階段未取得有效描述');
  }

  return { ok: errors.length === 0, errors, warnings };
}

/**
 * 合併進 tools 陣列（不動原陣列）。
 * 🔴 重複判據同時看 id 與 url（大小寫不敏感）：兩者任一已存在即視為重複——
 *    記憶中踩過「同 repo 不同 subpath」與「id 碰撞」兩種重複形態。
 * @returns {{tools: Array, duplicate: null|{field: string, existing: object}}}
 */
export function mergeToolEntry(tools, tool) {
  const list = Array.isArray(tools) ? tools : [];
  const norm = (u) => String(u || '').replace(/\/$/, '').toLowerCase();
  const existing = list.find((t) => t.id === tool.id)
    || list.find((t) => norm(t.url) === norm(tool.url));
  if (existing) {
    return {
      tools: list,
      duplicate: { field: existing.id === tool.id ? 'id' : 'url', existing },
    };
  }
  return { tools: [...list, tool], duplicate: null };
}

/** 分支名：add/<id>；呼叫端負責處理 422（已存在）加後綴重試 */
export function buildBranchName(tool) {
  return `add/${tool.id}`;
}

export function buildCommitMessage(tool) {
  return `chore(registry): 新增工具 ${tool.id}（Web 提名）`;
}

/** PR 內文：把「審核者需要人工確認的點」寫成 checklist */
export function buildPrBody(tool, meta = {}) {
  const lines = [];
  lines.push('## Web 提名（GitHub Pages「加入工具庫」）');
  lines.push('');
  lines.push(`- 來源repo：${tool.url}`);
  lines.push(`- 分類：${tool.category}｜語言：${tool.language}`);
  lines.push(`- 安裝方式：${tool.install?.method} → ${tool.install?.command}`);
  lines.push(`- 描述來源：${meta.descriptionSource || 'unknown'}`);
  lines.push(`- LLM 補齊：${meta.enriched ? '是（useCase／advantages）' : '否（僅掃描階段欄位）'}`);
  lines.push(`- 提名時間：${meta.at || new Date().toISOString()}`);
  lines.push('');
  lines.push('### 合併前人工核對清單');
  lines.push('');
  lines.push('- [ ] description 與 useCase 是否同一主題（自動化只能保證有值，不能保證值是對的）');
  lines.push('- [ ] 安裝指令是否有封裝證據（npx／pip 需對應 package.json bin／pyproject）');
  lines.push('- [ ] 分類是否恰當（18 分類 MECE，無「其他」殘留）');
  lines.push('- [ ] 合併後跑 `npm run translate:zh` 補齊中文欄位');
  lines.push('');
  return lines.join('\n');
}

// ─── 簡易限流（best-effort） ────────────────────────────────────────────────
/**
 * Cloudflare Workers 的記憶體依 isolate 分佈：同一 IP 的請求不一定落到同一個
 * isolate，所以這是**降低濫用速度**的實用主義設計，不是嚴格配額。
 * store 由 fetch handler 以模組級 Map 傳入（測試可注入假 store）。
 */
export function checkRateLimit(store, key, now, policy = RATE_POLICY) {
  const rec = store.get(key);
  if (!rec || now >= rec.resetAt) {
    store.set(key, { count: 1, resetAt: now + policy.windowMs });
    return { allowed: true, retryAfter: 0 };
  }
  if (rec.count >= policy.max) {
    return { allowed: false, retryAfter: Math.ceil((rec.resetAt - now) / 1000) };
  }
  rec.count += 1;
  return { allowed: true, retryAfter: 0 };
}

// ─── GitHub API 編排（fetch 可注入，便於測試） ──────────────────────────────

const GH_API = 'https://api.github.com';

function ghHeaders(token) {
  return {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/vnd.github+json',
    'User-Agent': 'Tool-Calling-AddWorker/1.0',
    'Content-Type': 'application/json',
  };
}

/** 取 main 分支上的 registry/tools.json（authenticated contents API） */
async function fetchCurrentRegistry(fetchImpl, env) {
  const { owner, repo } = env;
  const res = await fetchImpl(
    `${GH_API}/repos/${owner}/${repo}/contents/registry/tools.json?ref=main`,
    { headers: ghHeaders(env.GITHUB_TOKEN) },
  );
  if (!res.ok) throw new Error(`讀取 tools.json 失敗: HTTP ${res.status}`);
  const j = await res.json();
  // GitHub 回傳的是 UTF-8 位元組的 base64；atob 只給位元串（latin1），
  // 必須再經 TextDecoder 轉回 UTF-8，否則中文欄位會亂碼／JSON.parse 失敗。
  const bin = atob(j.content.replace(/\n/g, ''));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  const text = new TextDecoder().decode(bytes);
  return JSON.parse(text);
}

/** Git Data API：blob → tree → commit → ref → PR（大檔正路，Contents API 不適用 2.9MB） */
async function commitViaGitData(fetchImpl, env, branch, content, message) {
  const { owner, repo } = env;
  const H = ghHeaders(env.GITHUB_TOKEN);
  const gh = async (path, init) => {
    const res = await fetchImpl(`${GH_API}/repos/${owner}/${repo}${path}`, { headers: H, ...init });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`GitHub ${init?.method || 'GET'} ${path} 失敗: HTTP ${res.status} ${detail.slice(0, 200)}`);
    }
    return res.json();
  };

  const mainRef = await gh('/git/ref/heads/main');
  const baseSha = mainRef.object.sha;
  const baseCommit = await gh(`/git/commits/${baseSha}`);

  // 分支已存在（同一工具重複提名）→ 加數字後綴重試，最多 3 次
  let refName = `refs/heads/${branch}`;
  for (let attempt = 2; attempt <= 4; attempt++) {
    try {
      await gh('/git/refs', { method: 'POST', body: JSON.stringify({ ref: refName, sha: baseSha }) });
      break;
    } catch (err) {
      if (attempt > 3 || !/422/.test(err.message)) throw err;
      refName = `refs/heads/${branch}-${attempt}`;
    }
  }

  const blob = await gh('/git/blobs', {
    method: 'POST',
    body: JSON.stringify({ content: btoa(unescape(encodeURIComponent(content))), encoding: 'base64' }),
  });
  const tree = await gh('/git/trees', {
    method: 'POST',
    body: JSON.stringify({
      base_tree: baseCommit.tree.sha,
      tree: [{ path: 'registry/tools.json', mode: '100644', type: 'blob', sha: blob.sha }],
    }),
  });
  const commit = await gh('/git/commits', {
    method: 'POST',
    body: JSON.stringify({ message, tree: tree.sha, parents: [baseSha] }),
  });
  await gh(refName.replace('refs/heads/', '/git/refs/heads/'), {
    method: 'PATCH',
    body: JSON.stringify({ sha: commit.sha, force: false }),
  });
  return refName.replace('refs/heads/', '');
}

async function createPullRequest(fetchImpl, env, tool, branch, meta) {
  const { owner, repo } = env;
  const res = await fetchImpl(`${GH_API}/repos/${owner}/${repo}/pulls`, {
    method: 'POST',
    headers: ghHeaders(env.GITHUB_TOKEN),
    body: JSON.stringify({
      title: `chore(registry): 新增工具 ${tool.id}（Web 提名）`,
      head: branch,
      base: 'main',
      body: buildPrBody(tool, meta),
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`建立 PR 失敗: HTTP ${res.status} ${detail.slice(0, 300)}`);
  }
  return (await res.json()).html_url;
}

/**
 * 完整流程：讀檔 → 合併 → 開分支 → commit → PR
 * @returns {Promise<{status: 'pr'|'duplicate', pr?: string, branch?: string, duplicate?: object}>}
 */
export async function nominateTool(fetchImpl, env, tool, meta = {}) {
  const registry = await fetchCurrentRegistry(fetchImpl, env);
  const { tools, duplicate } = mergeToolEntry(registry.tools, tool);
  if (duplicate) {
    return { status: 'duplicate', duplicate: { field: duplicate.field, existing: duplicate.existing.id } };
  }
  const branch = buildBranchName(tool);
  registry.tools = tools;
  registry.lastUpdated = new Date().toISOString();
  await commitViaGitData(fetchImpl, env, branch, `${JSON.stringify(registry, null, 2)}\n`, buildCommitMessage(tool));
  const pr = await createPullRequest(fetchImpl, env, tool, branch, meta);
  return { status: 'pr', pr, branch };
}

// ─── CORS ──────────────────────────────────────────────────────────────────

function allowedOrigins(env) {
  return String(env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
}

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin');
  const allow = allowedOrigins(env);
  if (!origin) return {};
  if (allow.length === 0) return { 'Access-Control-Allow-Origin': '*' };
  if (allow.includes(origin)) return { 'Access-Control-Allow-Origin': origin, 'Vary': 'Origin' };
  return {};
}

// ─── Worker 進入點 ─────────────────────────────────────────────────────────

const rateStore = new Map();

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      const cors = corsHeaders(request, env);
      return new Response(null, {
        status: 204,
        headers: {
          ...cors,
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, x-submit-token',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    if (url.pathname === '/health') {
      return json({ ok: true, service: 'tools-add-worker' });
    }

    if (url.pathname !== '/api/tools/add' || request.method !== 'POST') {
      return json({ error: 'not found' }, 404);
    }

    // 來源檢查：有 Origin 且不在白名單 → 403（無 ALLOWED_ORIGINS 時暫不擋，見 README）
    const cors = corsHeaders(request, env);
    if (request.headers.get('Origin') && Object.keys(cors).length === 0) {
      return json({ error: 'origin not allowed' }, 403, cors);
    }

    // 選配分享式令牌
    if (env.SUBMIT_TOKEN && request.headers.get('x-submit-token') !== env.SUBMIT_TOKEN) {
      return json({ error: 'invalid submit token' }, 401, cors);
    }

    // 限流（best-effort，見 checkRateLimit 註解）
    const ip = request.headers.get('CF-Connecting-IP') || 'anon';
    const rl = checkRateLimit(rateStore, ip, Date.now());
    if (!rl.allowed) {
      return json({ error: 'rate limited', retryAfter: rl.retryAfter }, 429, {
        ...cors, 'Retry-After': String(rl.retryAfter),
      });
    }

    // payload 大小上限
    const cl = Number(request.headers.get('Content-Length') || 0);
    if (cl > MAX_BODY_BYTES) {
      return json({ error: 'payload too large' }, 413, cors);
    }

    let payload;
    try {
      payload = await request.json();
    } catch {
      return json({ error: 'invalid json' }, 400, cors);
    }

    const tool = payload?.tool;
    const verdict = validateToolEntry(tool);
    if (!verdict.ok) {
      return json({ error: 'validation failed', errors: verdict.errors }, 400, cors);
    }

    if (!env.GITHUB_TOKEN || !env.REPO_OWNER || !env.REPO_NAME) {
      // 設定不全屬於部署疏漏，不是使用者錯誤；回 500 並在 log 明說
      return json({ error: 'worker not configured', hint: '請設定 GITHUB_TOKEN／REPO_OWNER／REPO_NAME' }, 500, cors);
    }

    try {
      const result = await nominateTool(fetch, env, tool, payload?.meta || {});
      if (result.status === 'duplicate') {
        return json({
          status: 'duplicate',
          message: `此工具已在工具庫中（${result.duplicate.field} 重複）`,
          existing: result.duplicate.existing,
        }, 200, cors);
      }
      return json({
        status: 'pr',
        pr: result.pr,
        branch: result.branch,
        warnings: verdict.warnings,
      }, 200, cors);
    } catch (err) {
      return json({ error: 'github api failed', detail: String(err.message).slice(0, 300) }, 502, cors);
    }
  },
};
