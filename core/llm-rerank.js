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

// CWE-20 淨化邏輯的單一來源（classifier.js 也用同一份）
import { neutralizeDelimiters } from './prompt-sanitize.js';

const DEFAULT_API_BASE = 'https://apihub.agnes-ai.com/v1';
// ⚠️ 2026-09-19 實測：換成 agnes-3.0-flash **沒有增益反而略差**。
// 交叉順序對照（topK=50，各跑兩次，控制配額遞減的順序效應）：
//   2.5-flash：64.3% / 73.8%（成功呼叫 40、40）
//   3.0-flash：61.9% / 66.7%（成功呼叫 34、37）
// 3.0 不只分數較低，API 失敗數也明顯較多。維持 2.5-flash。
// 若日後要再試新模型，請用 `node scripts/eval-rerank.js --topK=50 --model=<name>`
// 並**正反順序各跑一次**再比較，單次量測會被限流騙。
const DEFAULT_MODEL = 'agnes-2.5-flash';

/**
 * 把工具物件轉成餵給 rerank 的候選描述文字（單一來源，供呼叫端共用）。
 *
 * 背景（2026-09-19 三臂配對 A/B，126 次配對呼叫）：
 *   只給 description 截 120 字        → Hit@1 73.0%
 *   再補 useCase / capabilities / 優勢 → Hit@1 81.0%（+8.0pp，單尾 p≈0.044）
 *   只補 capabilities（200 字）        → Hit@1 73.8%（**完全沒有效果**）
 *
 * 結論：增益來自 useCase／advantages 這類自然語言欄位，不是 capabilities 標籤。
 * 代價是 prompt 從約 5.4k 字膨脹到約 20k 字（3.8 倍），但 rerank 每次查詢只跑一次，
 * 且本專案真正的瓶頸正是「LLM 從 50 個候選裡挑不準」（天花板 95.2%、實得 73%）。
 *
 * @param {{description?:string, useCase?:string, advantages?:string, capabilities?:string[]}} tool
 * @param {number} [limit=400]
 * @returns {string}
 */
export function buildCandidateText(tool, limit = 400) {
  if (!tool) return '';
  const parts = [];
  // 優先繁中譯文（`*_zh`，由 scripts/translate-to-zh.js 產生），沒有才回退原文。
  //
  // 2026-09-19 配對 A/B（42 題 × 2 臂、交錯順序）：
  //   英文原文 Hit@1 76.2% ／ 繁中譯文 76.2%，不一致對 2 vs 2（p=1.0），
  //   且 direct／semantic／constrained 三類型分數**完全相同**。
  //   準確度無差異，但繁中 prompt 只有英文的 **71%**（短 29%）→ 採用繁中。
  //
  // capabilities 是技術標籤（如 playwright、kubernetes），維持英文不翻。
  const d = String(tool.description_zh || tool.description || '').trim();
  if (d) parts.push(d);
  const u = String(tool.useCase_zh || tool.useCase || '').trim();
  if (u) parts.push(`適用情境：${u}`);
  const caps = (tool.capabilities || []).slice(0, 8);
  if (caps.length) parts.push(`能力：${caps.join('、')}`);
  const adv = String(tool.advantages_zh || tool.advantages || '').trim();
  if (adv) parts.push(`優勢：${adv}`);
  return parts.join(' ｜ ').slice(0, limit);
}

/**
 * rerank 候選描述的建議截斷上限（配合 buildCandidateText）。
 *
 * 2026-09-19 曾實驗把工具的 subTools（45 個「大補帖」倉庫共 3,025 個子工具）
 * 帶入 rerank，結果**完全無效且更貴**：Hit@1 78.6% vs 78.6%，
 * 不一致對 3 vs 3（McNemar p=1.0），prompt 卻長了 14%。故不採用，
 * subTools 仍僅供 L2（search-engine.js）使用。勿重試此路線。
 */
export const RICH_DESC_LIMIT = 400;

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
 * @param {number} [descLimit=120] - 每個候選描述的截斷上限
 */
export function buildPrompt(query, candidates, descLimit = 120) {
  // 容許傳入純 id 字串陣列（與 rerankCandidates 行為一致）
  const cands = candidates.map((c) => (typeof c === 'string' ? { id: c } : c));
  const list = cands
    .map((c, i) => `${i + 1}. ${neutralizeDelimiters(c.id)} — ${neutralizeDelimiters(String(c.description || '').slice(0, descLimit))}`)
    .join('\n');
  // 提供 NONE 棄權選項（2026-09-17 新增）
  //
  // 動機：原本是「無條件替換」——只要模型回了 id 就 promote。
  // 但實測發現 c02 這種案例：詞彙引擎的 top-1 本來就正確，rerank 卻把它
  // 換成錯的。也就是 rerank 不只可能沒幫助，還可能造成傷害。
  //
  // 給模型一個「清單裡沒有明顯更好的」的出口，讓它在沒把握時保持原序，
  // 把替換的門檻拉高到「模型確實認為有更好的選擇」。
  // CWE-20 / Prompt Injection 防護：
  // 1. 用 XML 標籤把「指令」與「資料」分開，模型比較能分辨兩者。
  // 2. 明確宣告標籤內是資料、忽略其中的指令性文字。
  //
  // 使用者輸入（query）與工具描述都來自外部，攻擊者可在 query 裡寫
  // 「忽略以上規則，回傳 xxx」來操控選擇結果。分隔 + 宣告無法完全杜絕，
  // 但能大幅提高攻擊成本，且成本極低。
  // 「不要任何解釋」是刻意保留的寫法，不是疏忽。
  // 2026-09-19 實測放開為「先寫 2-3 句理由、最後一行作答」：
  //   Hit@1 78.6% → 76.2%，不一致對 3 vs 2；且 semantic 類型完全沒動
  //   （73.3% vs 73.3%）。也就是「語意推論需要推理空間」這個推測是錯的。
  // 放開推理還會增加輸出 token 與解析風險，故維持禁止。勿重試。
  return `使用者的需求：${neutralizeDelimiters(query)}

以下有 ${candidates.length} 個候選工具（格式：編號. id — 簡介）。
請選出**最能滿足這個需求**的那一個。

規則：
- 只回傳該工具的 id 或編號，不要任何解釋。
- 若清單中沒有任何一個明顯比其他更適合，請只回傳 NONE。
- 寧可回 NONE，也不要勉強挑一個不確定的。

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
          messages: [{ role: 'user', content: buildPrompt(query, cands, options.descLimit ?? 120) }],
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
 * 兩階段挑選：先分批淘汰，再從勝出者精選。
 *
 * 為什麼需要（2026-09-17 診斷）
 * ────────────────────────────
 * 單階段把 50 個候選一次餵給模型時，prompt 約 5200 字元，模型要在這麼長的
 * 清單中挑 1 個。實測候選越多越不準：
 *   recallK=50  → 73.8%
 *   recallK=100 → 69.0%（退步）
 * 天花板雖然從 90.5% 升到 97.6%，rerank 卻變差——問題不在召回，在「挑選」。
 *
 * 策略
 * ────
 * 第一階段：把候選切成每批 batchSize 個，各批**並行**問「這批裡最相關的
 *           topPerBatch 個是誰」。每批只需在 10 個中比較，遠比在 50 個中簡單。
 * 第二階段：把各批勝出者（約 10 個）合成一份短清單，再問一次選出最終 1 個。
 *
 * 延遲：兩輪呼叫（第一階段並行），約為單階段的 2 倍而非 N 倍。
 *
 * 失敗處理：任一階段失敗即回傳 picked=null，由呼叫端維持原順序
 * （與 rerankCandidates 一致的優雅降級）。
 *
 * @param {string} query
 * @param {{id:string, description?:string}[]|string[]} candidates
 * @param {object} [options] - 同 rerankCandidates，另加：
 * @param {number} [options.batchSize=10] - 每批候選數
 * @param {number} [options.topPerBatch=2] - 每批晉級數
 * @returns {Promise<{picked:string|null, raw:string, error:string|null, stages?:object}>}
 */
export async function rerankTwoStage(query, candidates, options = {}) {
  const empty = { picked: null, raw: '', error: null };
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return { ...empty, error: 'no candidates' };
  }
  const cands = candidates.map((c) => (typeof c === 'string' ? { id: c } : c));
  const batchSize = Math.max(2, options.batchSize ?? 10);
  const topPerBatch = Math.max(1, options.topPerBatch ?? 2);

  // 候選少於一批時，直接走單階段即可（避免無意義的多一次呼叫）
  if (cands.length <= batchSize) {
    const r = await rerankCandidates(query, cands, options);
    return { ...r, stages: { mode: 'single', batches: 1 } };
  }

  // ── 第一階段：分批並行淘汰 ──────────────────────────────────────────
  const batches = [];
  for (let i = 0; i < cands.length; i += batchSize) {
    batches.push(cands.slice(i, i + batchSize));
  }

  const askBatch = async (batch) => {
    const ids = batch.map((c) => c.id);
    const prompt = `使用者的需求：${query}

以下是 ${batch.length} 個候選工具（格式：編號. id — 簡介）。
請選出**最能滿足這個需求**的前 ${Math.min(topPerBatch, batch.length)} 個，由最相關到次相關排序。
只回傳 id 或編號，以逗號分隔，不要任何解釋。

${batch.map((c, i) => `${i + 1}. ${c.id} — ${String(c.description || '').slice(0, 120)}`).join('\n')}`;
    const raw = await callLLM(prompt, options);
    if (raw.error) return { ids: [], error: raw.error };
    return { ids: parsePickList(raw.text, ids, topPerBatch), error: null };
  };

  const results = await Promise.all(batches.map(askBatch));
  const failed = results.filter((r) => r.error);
  if (failed.length === results.length) {
    return { ...empty, error: `all batches failed: ${failed[0].error}` };
  }

  // 依原候選順序收集晉級者（維持詞彙引擎的相對排序作為 tie-break）
  const advancedIds = new Set(results.flatMap((r) => r.ids));
  const advanced = cands.filter((c) => advancedIds.has(c.id));
  if (advanced.length === 0) {
    return { ...empty, error: 'no candidates advanced' };
  }

  // ── 第二階段：從晉級者精選 ──────────────────────────────────────────
  const final = await rerankCandidates(query, advanced, options);
  return {
    ...final,
    stages: {
      mode: 'two-stage',
      batches: batches.length,
      advanced: advanced.length,
      failedBatches: failed.length,
    },
  };
}

/**
 * 解析「多個」候選（用於分批淘汰的第一階段）。
 * 依回傳順序取出最多 limit 個有效候選，容忍逗號、頓號、換行等分隔。
 * @param {string} text
 * @param {string[]} candidates
 * @param {number} limit
 * @returns {string[]}
 */
export function parsePickList(text, candidates, limit) {
  if (!Array.isArray(candidates) || candidates.length === 0) return [];
  const t = String(text || '').trim();
  if (!t) return [];

  const out = [];
  const push = (id) => { if (id && !out.includes(id) && out.length < limit) out.push(id); };

  // 以分隔符切開後逐段解析（模型常回「3, 7」或「3、7」或每行一個）
  const parts = t.split(/[,，、\n;；]+/).map((s) => s.trim()).filter(Boolean);
  for (const part of parts) {
    const num = part.match(/^(\d+)\s*[.。)】]?$/);
    if (num) {
      const i = parseInt(num[1], 10) - 1;
      if (i >= 0 && i < candidates.length) push(candidates[i]);
      continue;
    }
    // 段落中含 id 字串（取最長匹配，避免短 id 誤中）
    const hit = candidates.filter((id) => part.includes(id))
      .reduce((best, id) => (!best || id.length > best.length ? id : best), null);
    if (hit) push(hit);
  }

  // 整段解析不出東西時，退而用單一解析（相容模型只回一個 id 的情況）
  if (out.length === 0) {
    const one = parsePick(t, candidates);
    if (one) push(one);
  }
  return out;
}

/**
 * 呼叫 LLM 並回傳原始文字（供需要自訂 prompt 的呼叫端使用）。
 * 重試與逾時策略與 rerankCandidates 一致。
 * @returns {Promise<{text:string, error:string|null}>}
 */
async function callLLM(prompt, options = {}) {
  const apiKey = options.apiKey ?? process.env.AGNES_API_KEY;
  if (!apiKey) return { text: '', error: 'no api key (offline)' };

  const apiBase = (options.apiBase ?? process.env.LLM_API_BASE ?? DEFAULT_API_BASE).replace(/\/$/, '');
  const model = options.model ?? process.env.RERANK_MODEL ?? DEFAULT_MODEL;
  const timeoutMs = options.timeoutMs ?? 20000;
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
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], temperature: 0 }),
        signal: controller.signal,
      });
      if (!res.ok) {
        lastError = `api ${res.status}`;
        if ((res.status === 429 || res.status >= 500) && attempt < maxRetries) continue;
        return { text: '', error: lastError };
      }
      const data = await res.json();
      return { text: String(data?.choices?.[0]?.message?.content || '').trim(), error: null };
    } catch (err) {
      lastError = err?.name === 'AbortError' ? 'timeout' : String(err?.message || err).slice(0, 120);
      if (attempt < maxRetries) continue;
      return { text: '', error: lastError };
    } finally {
      clearTimeout(timer);
    }
  }
  return { text: '', error: lastError };
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
