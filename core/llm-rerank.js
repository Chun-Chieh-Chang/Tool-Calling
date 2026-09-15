#!/usr/bin/env node
/**
 * llm-rerank.js — 以 LLM 對候選工具做語意重排（純後處理，可離線停用）
 *
 * 用途
 * ─────
 * 詞彙引擎（L2 / agent-retrieval）對「需要語意跳躍」的查詢無能為力
 * （評測集 semantic 類型 Hit@1 = 0%）。本模組在詞彙召回 top-K 之後，
 * 用 LLM 從候選中選出最符合需求的那一個，作為後處理步驟。
 *
 * 實測（registry/eval-queries.json v1.0.0，42 筆可命中查詢）
 * ─────────────────────────────────────────────────────────
 *   詞彙 agent top-1        : 11.9%
 *   正確答案在 top-20 內    : 54.8%   ← rerank 的天花板
 *   LLM rerank 後           : 45.2%   （達天花板 82%）
 *
 * 設計原則
 * ─────────
 * 1. **離線安全**：無 API key 時回傳 null，呼叫端維持原順序。
 *    `npm test` 永不觸及本模組的網路呼叫。
 * 2. **優雅降級**：API 失敗、逾時、回傳無法解析 → 一律回傳 null，不拋出。
 *    檢索系統不能因為 rerank 掛掉就整個不可用。
 * 3. **不修改資料**：只回傳選中的 id，重排由呼叫端決定。
 *
 * ⚠️ 解析教訓（2026-09-14）
 * ──────────────────────────
 * 即使 prompt 寫明「只回傳 id」，LLM 仍常回傳**編號**（如 "5"）而非 id。
 * 第一版只有「找 id 字串」的解析，導致 42 筆全部解析失敗，
 * 跑出「rerank 後反而更差」的**錯誤結論**。
 * → parsePick() 必須同時處理：編號 / id 字串 / 寬鬆數字。
 * → 新增模型或改 prompt 時，**務必先印 raw 回傳驗證格式**再批次跑。
 */

const DEFAULT_API_BASE = 'https://apihub.agnes-ai.com/v1';
const DEFAULT_MODEL = 'agnes-2.5-flash';

/**
 * 解析 LLM 回傳，取出被選中的候選。
 * 同時處理三種常見回傳格式（見上方「解析教訓」）。
 * @param {string} text - LLM 原始回傳
 * @param {string[]} candidates - 候選 id 陣列（順序即 prompt 中的編號順序）
 * @returns {string|null} 選中的 id，無法解析時回傳 null
 */
export function parsePick(text, candidates) {
  if (!Array.isArray(candidates) || candidates.length === 0) return null;
  const t = String(text || '').trim();
  if (!t) return null;

  // 1. 純數字（可能帶句點、括號）→ 視為 1-based 編號
  const pureNum = t.match(/^(\d+)\s*[.。)】]?\s*$/);
  if (pureNum) {
    const i = parseInt(pureNum[1], 10) - 1;
    if (i >= 0 && i < candidates.length) return candidates[i];
  }

  // 2. 回傳文字包含候選 id。
  //    若同時有多個候選命中（常見於短 id 是長 id 的子字串，例如候選含
  //    'a' 與 'gamma'、回傳 'gamma'），**取最長的那個**，
  //    否則 'a' 會因為子字串關係誤勝出。
  const matched = candidates.filter((id) => t.includes(id));
  if (matched.length > 0) {
    return matched.reduce((best, id) => (id.length > best.length ? id : best));
  }

  // 3. 寬鬆：取文字中出現的第一個數字當編號
  const anyNum = t.match(/(\d+)/);
  if (anyNum) {
    const i = parseInt(anyNum[1], 10) - 1;
    if (i >= 0 && i < candidates.length) return candidates[i];
  }

  return null;
}

/**
 * 組合給 LLM 的 prompt。
 * @param {string} query - 使用者需求
 * @param {{id:string, description?:string}[]} candidates
 */
export function buildPrompt(query, candidates) {
  // 容許傳入純 id 字串陣列（與 rerankCandidates 行為一致）
  const cands = candidates.map((c) => (typeof c === 'string' ? { id: c } : c));
  const list = cands
    .map((c, i) => `${i + 1}. ${c.id} — ${String(c.description || '').slice(0, 120)}`)
    .join('\n');
  return `使用者的需求：${query}

以下有 ${candidates.length} 個候選工具（格式：編號. id — 簡介）。
請選出**最能滿足這個需求**的那一個。只回傳該工具的 id 或編號，不要任何解釋。

${list}`;
}

/**
 * 以 LLM 從候選中選出最佳工具。
 *
 * @param {string} query - 使用者需求
 * @param {{id:string, description?:string}[]|string[]} candidates - 候選工具
 * @param {object} [options]
 * @param {string} [options.apiKey] - 預設讀 process.env.AGNES_API_KEY
 * @param {string} [options.apiBase]
 * @param {string} [options.model]
 * @param {number} [options.timeoutMs=20000]
 * @returns {Promise<{picked: string|null, raw: string, error: string|null}>}
 *          失敗一律回傳 picked=null 並附 error，不拋出例外
 */
export async function rerankCandidates(query, candidates, options = {}) {
  const empty = { picked: null, raw: '', error: null };
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return { ...empty, error: 'no candidates' };
  }

  // 容許傳入純 id 字串陣列
  const cands = candidates.map((c) => (typeof c === 'string' ? { id: c } : c));

  const apiKey = options.apiKey ?? process.env.AGNES_API_KEY;
  if (!apiKey) {
    return { ...empty, error: 'no api key (offline)' };
  }

  const apiBase = (options.apiBase ?? process.env.LLM_API_BASE ?? DEFAULT_API_BASE).replace(/\/$/, '');
  const model = options.model ?? process.env.RERANK_MODEL ?? DEFAULT_MODEL;
  const timeoutMs = options.timeoutMs ?? 20000;
  // 實測：連續呼叫時約有 3 成機率遇到暫時性失敗（限流／網路抖動），
  // 未加重試時同一份評測集可分數從 47.6% 掉到 31.0%（成功呼叫 42 → 29）。
  // 因此預設重試 2 次（共 3 次嘗試），指數退避 1s → 2s。
  const maxRetries = options.maxRetries ?? 2;
  const baseBackoffMs = options.backoffMs ?? 1000;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let lastError = 'unknown';

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) await sleep(baseBackoffMs * 2 ** (attempt - 1));

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${apiBase}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: buildPrompt(query, cands) }],
          temperature: 0,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errText = await res.text();
        lastError = `api ${res.status}: ${errText.slice(0, 120)}`;
        // 429（限流）與 5xx 屬暫時性，值得重試；4xx 認證／參數錯誤不重試
        const retryable = res.status === 429 || res.status >= 500;
        if (retryable && attempt < maxRetries) continue;
        return { ...empty, error: lastError };
      }

      const data = await res.json();
      const raw = String(data?.choices?.[0]?.message?.content || '').trim();
      const picked = parsePick(raw, cands.map((c) => c.id));
      if (picked) return { picked, raw: raw.slice(0, 200), error: null };
      // 解析失敗多半是模型這次回傳格式跑掉，重試通常能拿到可解析內容
      lastError = 'unparseable';
      if (attempt < maxRetries) continue;
      return { ...empty, raw: raw.slice(0, 200), error: lastError };
    } catch (err) {
      lastError = err?.name === 'AbortError' ? 'timeout' : String(err?.message || err).slice(0, 120);
      if (attempt < maxRetries) continue;
      return { ...empty, error: lastError };
    } finally {
      clearTimeout(timer);
    }
  }
  return { ...empty, error: lastError };
}

/**
 * 把被選中的工具移到列表最前面，其餘維持原順序。
 * 這是呼叫端最常需要的行為：rerank 只決定 top-1，不動其他排名。
 * @template T
 * @param {T[]} items - 元素需含 id 欄位（或本身即 id 字串）
 * @param {string|null} picked
 * @returns {T[]} 新陣列，不修改原陣列
 */
export function promote(items, picked) {
  if (!picked || !Array.isArray(items)) return items ?? [];
  const i = items.findIndex((x) => (typeof x === 'string' ? x : x?.id) === picked);
  if (i <= 0) return items;
  const out = items.slice();
  const [hit] = out.splice(i, 1);
  out.unshift(hit);
  return out;
}
