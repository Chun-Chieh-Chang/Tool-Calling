/**
 * add-tool-dialog.js — GitHub Pages 端「加入工具庫」對話框（2026-10-15 Q1=B）
 *
 * 本機工作台（localhost）走 web/server.js 的 /api/tools/add，背景補齊、直接入庫。
 * 非本機（GitHub Pages／公開實例）沒有後端，改用本對話框：
 *   1. 輸入 repo URL＋（選填）自備 LLM key
 *   2. buildCandidate() 在瀏覽器端掃描＋補齊 → 人工預覽（key 只在記憶體）
 *   3. 本地驗證（worker/index.js 的 validateToolEntry，同一份規則）
 *   4. POST 到 Cloudflare Worker → 開 PR → 回傳連結（CI 把關、人工合併）
 *
 * 端點設定（擇一，優先序高者先）：
 *   ① `web/index.html` 的 `<meta name="tools-add-endpoint" content="https://<worker>">`
 *      ——**版控可見**，push 後 CI 產出的 Pages 才拿得到（`web/data/` 在 .gitignore 內，
 *      放在那裡的設定永遠到不了 CI，故 meta 是正式路徑）。
 *   ② `web/data/tools-add-endpoint.json`（`{"url": "..."}`）——本機覆寫用，不進版控。
 * 兩者皆空時對話框顯示部署說明，不送請求（見 worker/README.md）。
 */

import { buildCandidate } from './add-pipeline.js';
import { validateToolEntry } from '../worker/index.js';

const ENDPOINT_CONFIG_URL = './data/tools-add-endpoint.json';
const ENDPOINT_META_NAME = 'tools-add-endpoint';
const STYLE_ID = 'atd-style';

/**
 * 端點來源擇一（純函式，供守門測試）：meta 優先、JSON 檔後備。
 * @param {string} metaValue - meta[name="tools-add-endpoint"] 的 content
 * @param {string} fileValue - tools-add-endpoint.json 的 url
 * @returns {string} 去空白後的非空值，都沒有則空字串
 */
export function pickEndpoint(metaValue, fileValue) {
  const meta = String(metaValue || '').trim();
  if (meta) return meta;
  return String(fileValue || '').trim();
}

const CSS = `
.atd-backdrop{position:fixed;inset:0;background:rgba(15,23,42,.45);display:flex;align-items:center;justify-content:center;z-index:9999;padding:16px}
.atd-modal{background:#fff;border-radius:14px;box-shadow:0 18px 50px rgba(15,23,42,.28);width:min(760px,96vw);max-height:92vh;overflow:auto;padding:22px 24px;font-family:system-ui,"Noto Sans TC","Microsoft JhengHei",sans-serif;color:#1e293b}
.atd-modal h3{margin:0 0 4px;font-size:1.1rem}
.atd-modal .atd-sub{color:#64748b;font-size:.82rem;margin-bottom:14px}
.atd-field{margin-bottom:12px}
.atd-field label{display:block;font-size:.8rem;font-weight:600;margin-bottom:4px;color:#334155}
.atd-field input{width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid #cbd5e1;border-radius:8px;font-size:.88rem;background:#f8fafc}
.atd-field input:focus{outline:2px solid #3564d4;outline-offset:1px}
.atd-hint{font-size:.74rem;color:#64748b;margin-top:3px}
.atd-row{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}
.atd-btn{border:none;border-radius:8px;padding:9px 16px;font-size:.86rem;font-weight:600;cursor:pointer}
.atd-btn.primary{background:#3564d4;color:#fff}
.atd-btn.primary:disabled{background:#94a3b8;cursor:not-allowed}
.atd-btn.ghost{background:#eef2f7;color:#334155;border:1px solid #cbd5e1}
.atd-btn:not(:disabled):hover{filter:brightness(1.06)}
.atd-status{font-size:.82rem;border-radius:8px;padding:9px 12px;margin:10px 0;display:none}
.atd-status.show{display:block}
.atd-status.info{background:#eff6ff;border:1px solid #bfdbfe;color:#1e40af}
.atd-status.warn{background:#fffbeb;border:1px solid #fde68a;color:#92400e}
.atd-status.error{background:#fef2f2;border:1px solid #fecaca;color:#991b1b}
.atd-status.ok{background:#f0fdf4;border:1px solid #bbf7d0;color:#166534}
.atd-preview{border:1px solid #e2e8f0;border-radius:10px;padding:12px 14px;margin:10px 0;display:none}
.atd-preview.show{display:block}
.atd-preview table{width:100%;border-collapse:collapse;font-size:.82rem}
.atd-preview th{text-align:left;color:#64748b;font-weight:600;padding:4px 8px 4px 0;vertical-align:top;white-space:nowrap;width:110px}
.atd-preview td{padding:4px 0;word-break:break-word}
.atd-preview details{margin-top:8px}
.atd-preview pre{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px;font-size:.74rem;max-height:220px;overflow:auto}
.atd-warn{font-size:.78rem;color:#92400e;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:8px 10px;margin-top:8px}
`;

let endpointCache = null;

async function getEndpoint() {
  if (endpointCache !== null) return endpointCache;
  // ① meta（版控可見，Pages 生效的正式路徑）
  let metaValue = '';
  try {
    metaValue = document.querySelector(`meta[name="${ENDPOINT_META_NAME}"]`)?.content || '';
  } catch { /* 非瀏覽器環境 */ }
  // ② JSON 檔（本機覆寫；不存在或讀不到一律靜默，不影響 meta 路徑）
  let fileValue = '';
  try {
    const res = await fetch(ENDPOINT_CONFIG_URL, { cache: 'no-cache' });
    if (res.ok) fileValue = String((await res.json()).url || '');
  } catch { /* 沒有這個檔案是正常狀態 */ }
  endpointCache = pickEndpoint(metaValue, fileValue);
  return endpointCache;
}

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent = CSS;
  document.head.appendChild(el);
}

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

/**
 * 開啟對話框。
 * @param {object} [seed] - 預填（如排行榜按鈕帶的 repo URL）
 */
export async function openAddToolDialog(seed = {}) {
  injectStyles();

  const backdrop = el('div', 'atd-backdrop');
  const modal = el('div', 'atd-modal');
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');

  modal.appendChild(el('h3', null, '＋ 加入工具庫（Web 提名）'));
  modal.appendChild(el('div', 'atd-sub',
    '掃描與 LLM 補齊在瀏覽器端完成；確認預覽後開 PR，CI 通過再由維護者合併。'));

  // URL
  const urlField = el('div', 'atd-field');
  urlField.appendChild(el('label', null, 'GitHub 倉庫網址'));
  const urlInput = el('input');
  urlInput.type = 'text';
  urlInput.placeholder = 'https://github.com/owner/repo';
  urlInput.value = seed.url || '';
  urlField.appendChild(urlInput);
  urlField.appendChild(el('div', 'atd-hint', '支援子目錄：https://github.com/owner/repo/tree/main/subpath'));
  modal.appendChild(urlField);

  // Key
  const keyField = el('div', 'atd-field');
  keyField.appendChild(el('label', null, 'LLM API KEY（選填，自備）'));
  const keyInput = el('input');
  keyInput.type = 'password';
  keyInput.placeholder = 'sk-…（留空則只做掃描階段，不含 useCase／advantages）';
  keyField.appendChild(keyInput);
  keyField.appendChild(el('div', 'atd-hint',
    '僅存在此分頁記憶體，不寫 localStorage、不經過提名伺服器、重新整理即消失。'));
  modal.appendChild(keyField);

  // 按鈕列
  const row = el('div', 'atd-row');
  const analyzeBtn = el('button', 'atd-btn primary', '🔍 解析預覽');
  const submitBtn = el('button', 'atd-btn primary', '📨 提交 PR');
  submitBtn.disabled = true;
  const cancelBtn = el('button', 'atd-btn ghost', '取消');
  row.append(analyzeBtn, submitBtn, cancelBtn);
  modal.appendChild(row);

  const status = el('div', 'atd-status');
  modal.appendChild(status);

  const preview = el('div', 'atd-preview');
  modal.appendChild(preview);

  backdrop.appendChild(modal);
  document.body.appendChild(backdrop);

  let currentTool = null;
  let currentMeta = null;

  const setStatus = (kind, text) => {
    status.className = `atd-status show ${kind}`;
    status.textContent = text;
  };
  const close = () => backdrop.remove();
  cancelBtn.addEventListener('click', close);
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
  document.addEventListener('keydown', function esc(e) {
    if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); }
  });

  analyzeBtn.addEventListener('click', async () => {
    submitBtn.disabled = true;
    preview.className = 'atd-preview';
    const url = urlInput.value.trim();
    if (!url) { setStatus('error', '請先輸入 GitHub 倉庫網址'); return; }
    analyzeBtn.disabled = true;
    setStatus('info', '⏳ 掃描中（讀取 repo 資訊與 README）…');
    try {
      const result = await buildCandidate(url, keyInput.value.trim());
      currentTool = result.tool;
      currentMeta = {
        descriptionSource: result.descriptionSource,
        enriched: result.enriched,
        at: new Date().toISOString(),
      };
      renderPreview(preview, result.tool);
      preview.className = 'atd-preview show';
      submitBtn.disabled = false;
      setStatus('ok', result.enriched
        ? '✅ 掃描＋LLM 補齊完成，請核對預覽內容'
        : '✅ 掃描完成（未提供 key，useCase／advantages 待合併後補齊）');
    } catch (err) {
      setStatus('error', `❌ 掃描失敗：${err.message}`);
    } finally {
      analyzeBtn.disabled = false;
    }
  });

  submitBtn.addEventListener('click', async () => {
    if (!currentTool) return;
    const verdict = validateToolEntry(currentTool);
    if (!verdict.ok) {
      setStatus('error', `❌ 本地驗證未通過：${verdict.errors.join('；')}`);
      return;
    }
    const endpoint = await getEndpoint();
    if (!endpoint) {
      setStatus('warn', '尚未設定提名端點：請在 web/index.html 的 <meta name="tools-add-endpoint"> 填入 Worker 網址（部署步驟見 worker/README.md）後重新部署。');
      return;
    }
    submitBtn.disabled = true;
    setStatus('info', '⏳ 開 PR 中（合併進 tools.json → 新分支 → Pull Request）…');
    try {
      const res = await fetch(`${endpoint.replace(/\/$/, '')}/api/tools/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool: currentTool, meta: currentMeta }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok && j.status === 'pr') {
        setStatus('ok', `✅ PR 已開立：${j.pr}　（CI 通過後由維護者合併；中文欄位於合併後由 translate:zh 補齊）`);
        submitBtn.disabled = true;
      } else if (res.ok && j.status === 'duplicate') {
        setStatus('warn', `⚠️ 已在工具庫中（${j.existing}），不需要重複提名。`);
        submitBtn.disabled = true;
      } else {
        const detail = j.errors ? j.errors.join('；') : (j.detail || j.error || `HTTP ${res.status}`);
        setStatus('error', `❌ 提名失敗：${detail}`);
        submitBtn.disabled = false;
      }
    } catch (err) {
      setStatus('error', `❌ 網路錯誤：${err.message}`);
      submitBtn.disabled = false;
    }
  });

  urlInput.focus();
}

function renderPreview(host, tool) {
  host.innerHTML = '';
  const table = el('table');
  const rows = [
    ['id', tool.id],
    ['name', tool.name],
    ['url', tool.url],
    ['category', tool.category + (Array.isArray(tool.categories) ? `（多值：${tool.categories.join('、')}）` : '')],
    ['language', tool.language],
    ['description', tool.description],
    ['install', `${tool.install?.method} → ${tool.install?.command}`],
    ['capabilities', (tool.capabilities || []).join('、') || '（空）'],
    ['useCase', tool.useCase || '（待補齊）'],
    ['advantages', (tool.advantages || []).join('；') || '（空，待補齊）'],
    ['status', tool.status],
  ];
  for (const [k, v] of rows) {
    const tr = document.createElement('tr');
    tr.appendChild(el('th', null, k));
    tr.appendChild(el('td', null, String(v ?? '')));
    table.appendChild(tr);
  }
  host.appendChild(table);

  const zh = el('div', 'atd-hint');
  zh.textContent = '中文欄位（description_zh／useCase_zh 等）刻意不在此產生——合併後由 npm run translate:zh 統一補齊，避免中英不一致。';
  host.appendChild(zh);

  const { warnings } = validateToolEntry(tool);
  if (warnings.length) {
    const w = el('div', 'atd-warn');
    w.textContent = '提醒：' + warnings.join('／');
    host.appendChild(w);
  }

  const details = el('details');
  details.appendChild(el('summary', null, '檢視原始 JSON'));
  const pre = el('pre');
  pre.textContent = JSON.stringify(tool, null, 2);
  details.appendChild(pre);
  host.appendChild(details);
}
