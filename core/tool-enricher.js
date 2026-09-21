#!/usr/bin/env node
/**
 * tool-enricher.js — 用 LLM 補齊「掃描階段填不出來」的語意欄位
 *
 * 為什麼需要它
 * ────────────
 * `scripts/scan-tool.js` 只能從 GitHub API 拿到「機器可得的」欄位：
 *   description（一行簡介）、language、topics（→ capabilities）
 * 但下面三個是**語意欄位**，規則做不到：
 *   - useCase    ：真實使用情境。掃描階段只是**複製 description**，等於沒有資訊。
 *   - advantages ：工具的優勢。掃描階段刻意留空（寧可空著也不要亂填）。
 *   - *_zh       ：繁體中文（顯示層需要）。
 *
 * 🔴 硬規則（違反就是資料污染）
 * ──────────────────────────────
 * 1. **必須基於 README 內容**，不可只憑名稱或 URL 猜測。
 *    專案規範明文禁止「憑名稱推測後填寫 metadata」——
 *    `scripts/enrich-registry.js` 的 prompt 就是反面教材（它明寫「依 Name 與 URL 猜測」）。
 * 2. **README 資訊不足時要誠實留白**，回傳空值而不是編一個看起來合理的答案。
 * 3. 繁體中文一律過 `toTraditional()`（LLM 常輸出簡體；而簡體永遠匹配不到繁體查詢）。
 * 4. `advantages` 必須是**陣列**（registry-contract 會檢查 `Array.isArray`）。
 *
 * 與 scan-tool 的分工
 * ──────────────────
 *   掃描階段（同步、毫秒、免 LLM）→ 讓工具「進得了工具庫」
 *   本階段（非同步、秒級、需 LLM）→ 讓工具「進得去又找得到」
 * 這與知識編譯器的 Tier 0 / Tier 1 是同一種分層。
 */

import { toTraditional } from '../scripts/fix-simplified.js';
// 金鑰池：支援環境變數與「UI 執行期注入」兩種來源，
// 並在 429 時自動隔離該把金鑰、下次重試換一把。
import { nextKey, reportSuccess, reportFailure } from './llm-keys.js';

const DEFAULT_API_BASE = 'https://apihub.agnes-ai.com/v1';
const DEFAULT_MODEL = 'agnes-3.0-flash';
const README_LIMIT = 6000;   // 餵給模型的 README 上限（保留開頭即可，重點都在前面）

/**
 * 抓取 repo 的 README 全文（給 enrich 用）
 *
 * @param {string} repoUrl - https://github.com/owner/repo
 * @returns {Promise<string|null>}
 */
export async function fetchReadmeText(repoUrl) {
  const m = String(repoUrl || '').match(/github\.com\/([^/]+)\/([^/]+)/);
  if (!m) return null;
  const [, owner, repo] = m;
  for (const file of ['README.md', 'readme.md', 'README.rst']) {
    try {
      const res = await fetch(`https://raw.githubusercontent.com/${owner}/${repo}/HEAD/${file}`, {
        headers: { 'User-Agent': 'Tool-Calling-Enricher/1.0' },
        signal: AbortSignal.timeout(12000),
      });
      if (!res.ok) continue;
      const text = await res.text();
      if (text && text.trim().length > 40) return text;
    } catch { /* 換下一個檔名 */ }
  }
  return null;
}

const SYS = `你是工具庫的 metadata 編譯器。我會給你一個開源專案的 README 與現有欄位，
請依**README 的實際內容**補齊下列欄位。只輸出 JSON，不要任何解釋。

- useCase（1 句）：一個**具體的使用情境**——「誰、在什麼情況下、拿它做什麼」。
  🔴 絕對不可以複製或改寫 description。description 說「這是什麼」，
     useCase 要說「什麼時候會用到它」。若 README 看不出使用情境，給空字串。
- advantages（2~4 條）：這個工具**相對其他選擇**的優勢。
  🔴 只寫 README 明確支持的事實（效能數字、獨特能力、授權、部署方式…）。
  🔴 不要寫「開源」「免費」這類所有工具都成立的廢話，也不要寫「支援 X 語言」（那是 install 的事）。
  若 README 沒有足以支撐的內容，給空陣列。
- capabilities（3~6 個）：kebab-case 的技術標籤，描述它「能做什麼」。
- description_zh / useCase_zh / advantages_zh：上面欄位的繁體中文（台灣）版本。

🔴 語言分工（不可搞混）：
  useCase / advantages / capabilities 一律用**英文**；
  只有 *_zh 三個欄位用繁體中文。實測模型會兩個都給中文，那是錯的。

台灣用語：檔案、程式碼、網路、影片、專案、軟體。
輸出格式：
{ "useCase": "", "advantages": [], "capabilities": [], "description_zh": "", "useCase_zh": "", "advantages_zh": [] }`;

/**
 * 用 LLM 從 README 產生語意欄位
 *
 * @param {object} tool - registry 中的工具物件
 * @param {object} [options]
 * @param {string} [options.readme] - 已取得的 README；未提供則自行抓取
 * @param {string} [options.apiKey]
 * @param {string} [options.model]
 * @returns {Promise<object|null>} 可直接合併進 tool 的欄位；失敗回傳 null
 */
export async function enrichToolFromReadme(tool, options = {}) {
  // 金鑰來源：明確傳入 > 金鑰池（環境變數 + UI 執行期注入）
  if (!options.apiKey && !nextKey()) return null;

  const repoUrl = tool.install?.repoUrl || tool.url;
  const readme = options.readme ?? await fetchReadmeText(repoUrl);
  if (!readme) return null;   // 沒有 README 就不猜

  const apiBase = (options.apiBase ?? process.env.LLM_API_BASE ?? DEFAULT_API_BASE).replace(/\/$/, '');
  const model = options.model ?? DEFAULT_MODEL;

  const payload = {
    id: tool.id,
    name: tool.name,
    githubDescription: tool.description || '',
    language: tool.language || '',
    topics: tool.capabilities || [],
    readme: readme.slice(0, README_LIMIT),
  };

  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 1500 * 2 ** (attempt - 1)));
    // 每次嘗試重新取一把，讓重試有機會換到沒被限流的那把
    const apiKey = options.apiKey ?? nextKey();
    if (!apiKey) return null;
    try {
      const res = await fetch(`${apiBase}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: SYS },
            { role: 'user', content: JSON.stringify(payload) },
          ],
          temperature: 0.2,
        }),
        signal: AbortSignal.timeout(60000),
      });
      if (!res.ok) { reportFailure(apiKey, res.status); continue; }
      reportSuccess(apiKey);
      const j = await res.json();
      const raw = String(j?.choices?.[0]?.message?.content || '').trim();
      const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
      const out = JSON.parse(cleaned);
      return normalize(out, tool);
    } catch { /* 重試 */ }
  }
  return null;
}

/** 去掉 Markdown 標記（模型常把 README 的 `` `code` ``、`**粗體**` 一起帶進來） */
function stripMd(s) {
  return String(s ?? '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 判斷工具是否已「補齊完成」——這是 experimental → active 的升級判準
 *
 * 定義（與 `scripts/enrich-new-tools.js` 的 needsEnrich() 互補）：
 *   - useCase 存在，且**不是** description 的複製品（複製品等於沒資訊）
 *   - advantages 非空陣列
 *   - description_zh 與 useCase_zh 都在（顯示層需要）
 *
 * ⚠️ 刻意**不要求** capabilities：全庫有 195 支沒有 capabilities
 *    （因為它們的 GitHub repo 沒設 topics），那些工具仍然是 active。
 *    把 capabilities 列入判準會讓大量既有工具被誤判為未完成。
 *
 * @param {object} tool
 * @returns {boolean}
 */
export function isFullyEnriched(tool) {
  return Boolean(
    tool
    && tool.useCase && tool.useCase !== tool.description
    && Array.isArray(tool.advantages) && tool.advantages.length > 0
    && tool.description_zh && tool.useCase_zh,
  );
}

/** 正規化：去 Markdown、限制長度、簡轉繁、確保 advantages 是陣列 */
function normalize(out, tool) {
  const zh = (v) => toTraditional(stripMd(v));
  const en = (v) => stripMd(v);
  const arr = (v, max, conv) => (Array.isArray(v) ? v : [])
    .map((x) => conv(String(x ?? '')))
    .filter(Boolean)
    .slice(0, max);

  const useCase = en(out?.useCase);
  // 防呆：模型有時會直接複製 description——那等於沒有資訊，寧可留空
  const isCopy = useCase && tool.description &&
    useCase.toLowerCase().slice(0, 60) === String(tool.description).toLowerCase().slice(0, 60);

  const rec = {};
  if (useCase && !isCopy) {
    rec.useCase = useCase.slice(0, 300);
    const uzh = zh(out?.useCase_zh);
    if (uzh) rec.useCase_zh = uzh.slice(0, 300);
  }
  const adv = arr(out?.advantages, 4, en);
  if (adv.length) {
    rec.advantages = adv;
    const advZh = arr(out?.advantages_zh, 4, zh);
    if (advZh.length) rec.advantages_zh = advZh;
  }
  const caps = arr(out?.capabilities, 6, en).map((c) => c.toLowerCase().replace(/\s+/g, '-'));
  if (caps.length && (!tool.capabilities || tool.capabilities.length === 0)) {
    rec.capabilities = caps;   // 只在原本是空的時候補，不覆蓋 GitHub topics
  }
  const dzh = zh(out?.description_zh);
  if (dzh && !tool.description_zh) rec.description_zh = dzh.slice(0, 300);

  return Object.keys(rec).length ? rec : null;
}
