#!/usr/bin/env node
/**
 * clarifier.js — 需求收斂追問引擎（純函式，唯讀，不修改任何資料）
 *
 * 設計理念（承襲本專案的「誠實」原則）
 * ────────────────────────────────────
 * 1. **只在真的不確定時才追問**。
 *    `decision = high-confidence` → 直接給答案，不浪費使用者時間。
 *    `decision = low-confidence / no-match` → 才啟動追問。
 *    這與 rerank 的 NONE 棄權、fusion 的 no-match 是同一套哲學：
 *    知道就知道，不知道就說不知道（然後想辦法補齊資訊）。
 *
 * 2. **題目由候選集的差異動態產生，不是寫死題庫**。
 *    舊的 `interactive-approximator.js` 是寫死的三題（語言／爬蟲情境／防爬），
 *    對非爬蟲需求完全沒用。這裡改成：
 *      看 top-N 候選在**哪個維度上分歧最大**，就問那個維度。
 *    分歧程度用 entropy 量：候選在該維度的取值越平均，問了收斂越多。
 *
 * 3. **每一輪都是純函式**：`nextQuestion()` 給題、`applyAnswer()` 收斂，
 *    呼叫端（CLI / MCP / Web）自己決定怎麼呈現。
 *    → 可離線單元測試，不需要 API。
 *
 * 收斂流程
 * ────────
 *   clarify(query)
 *     → retrieve（五維引擎）
 *     → 高置信？→ 回傳答案
 *     → 否則 → nextQuestion() → 使用者回答 → applyAnswer()
 *     → 回到 retrieve 重算（答案會被併進查詢）→ 直到收斂或用完題數
 */

// ── 可追問的維度 ───────────────────────────────────────────────────────────
// 每個維度要能從 tool 物件取值。取值越分散（entropy 越高），問它越有用。
export const CLARIFY_DIMENSIONS = [
  {
    key: 'language',
    label: '程式語言 / 執行環境',
    question: '這個工具主要會在哪種語言或執行環境下使用？',
    get: (tool) => (tool.language ? [tool.language] : []),
  },
  {
    key: 'install',
    label: '安裝 / 使用方式',
    question: '你偏好哪一種安裝或使用方式？',
    get: (tool) => (tool.install?.method ? [tool.install.method] : []),
  },
  {
    key: 'category',
    label: '用途領域',
    question: '下列哪一個用途領域最接近你的需求？',
    get: (tool) => (tool.category ? [tool.category] : []),
  },
];

/** 「不限／都可以」選項的值 */
export const ANY_VALUE = '__any__';

function entropyOf(counts) {
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  if (total === 0) return 0;
  let h = 0;
  for (const c of counts.values()) {
    if (c <= 0) continue;
    const p = c / total;
    h -= p * Math.log2(p);
  }
  return h;
}

/**
 * 分析候選集在各維度上的分歧程度
 *
 * @param {object[]} candidates - retrieve() 的 results（含 id）
 * @param {object[]} tools - 完整工具註冊表
 * @param {{topN?: number, exclude?: string[], dimensions?: object[]}} [options]
 * @returns {Array<{key,label,question,coverage,entropy,gain,options:Array<{value,count}>}>}
 *          依 gain 由高到低排序
 */
export function analyzeAmbiguity(candidates, tools, options = {}) {
  const {
    topN = 5,
    exclude = [],
    dimensions = CLARIFY_DIMENSIONS,
  } = options;
  const byId = new Map(tools.map((t) => [t.id, t]));
  const top = candidates.slice(0, topN).map((c) => byId.get(c.id)).filter(Boolean);
  if (top.length < 2) return [];

  const out = [];
  for (const dim of dimensions) {
    if (exclude.includes(dim.key)) continue;

    const counts = new Map();
    let covered = 0;
    for (const tool of top) {
      const vals = dim.get(tool) || [];
      const uniq = [...new Set(vals.map((v) => String(v).trim()).filter(Boolean))];
      if (uniq.length === 0) continue;
      covered++;
      for (const v of uniq) counts.set(v, (counts.get(v) || 0) + 1);
    }
    if (covered < 2) continue; // 幾乎沒有資料可問

    const coverage = covered / top.length;
    const entropy = entropyOf(counts);
    // gain：覆蓋率 × 分歧度。只覆蓋一半、或大家答案都一樣（entropy≈0）都不值得問。
    const gain = coverage * entropy;
    const opts = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([value, count]) => ({ value, count }));

    out.push({ key: dim.key, label: dim.label, question: dim.question, coverage, entropy, gain, options: opts });
  }
  out.sort((a, b) => b.gain - a.gain);

  // prefer：呼叫端可指定優先維度。
  // 為什麼需要：decision = no-match 時候選其實是一堆垃圾，
  // 「它們在哪個維度分歧最大」沒有意義——問語言只是在垃圾裡做選擇。
  // 這時應該先問「用途領域」，把方向先定位出來。
  if (options.prefer) {
    const i = out.findIndex((d) => d.key === options.prefer);
    if (i > 0) { const [hit] = out.splice(i, 1); out.unshift(hit); }
  }
  return out;
}

/**
 * 選出下一個最該問的問題
 *
 * @returns {{key,label,question,options:Array<{value,count}>,coverage,entropy,gain}|null}
 *          null = 沒有值得問的（候選已經夠集中，或資料不足）
 */
export function nextQuestion(candidates, tools, options = {}) {
  const { minGain = 0.35 } = options;
  const ranked = analyzeAmbiguity(candidates, tools, options);
  const best = ranked[0];
  if (!best || best.gain < minGain) return null;
  return {
    ...best,
    // 永遠附上「不限」，讓使用者可以跳過
    options: [...best.options, { value: ANY_VALUE, count: 0 }],
  };
}

/**
 * 套用使用者的回答，收斂候選集
 *
 * @param {object[]} candidates - retrieve() 的 results
 * @param {object[]} tools - 完整工具註冊表
 * @param {string} dimensionKey - 維度 key（language / install / category）
 * @param {string} value - 使用者選的值；ANY_VALUE 表示不限
 * @returns {{candidates: object[], matched: number, dropped: number}}
 */
export function applyAnswer(candidates, tools, dimensionKey, value) {
  const dim = CLARIFY_DIMENSIONS.find((d) => d.key === dimensionKey);
  if (!dim) return { candidates, matched: 0, dropped: 0 };
  if (value === ANY_VALUE || !value) return { candidates, matched: candidates.length, dropped: 0 };

  const byId = new Map(tools.map((t) => [t.id, t]));
  const wanted = String(value).trim().toLowerCase();
  const kept = [];
  let matched = 0;
  for (const c of candidates) {
    const tool = byId.get(c.id);
    const vals = (tool ? dim.get(tool) : []).map((v) => String(v).trim().toLowerCase());
    if (vals.includes(wanted)) { kept.push(c); matched++; }
  }
  // 若篩完剩下太少（<2），代表這個答案過度收斂，保留原清單但把命中項往前排
  if (kept.length < 2) {
    const reorder = [...candidates].sort((a, b) => {
      const av = (byId.get(a.id) ? dim.get(byId.get(a.id)) : []).map((v) => String(v).toLowerCase());
      const bv = (byId.get(b.id) ? dim.get(byId.get(b.id)) : []).map((v) => String(v).toLowerCase());
      return Number(bv.includes(wanted)) - Number(av.includes(wanted));
    });
    return { candidates: reorder, matched, dropped: 0 };
  }
  return { candidates: kept, matched, dropped: candidates.length - kept.length };
}

/**
 * 產生給使用者的追問腳本（純函式，不需要檢索）
 *
 * @param {object[]} candidates
 * @param {object[]} tools
 * @param {{asked?: string[]}} [options] - 已經問過的維度
 * @returns {{shouldAsk: boolean, reason: string, question?: object}}
 */
export function planClarification(candidates, tools, options = {}) {
  const { asked = [] } = options;
  // no-match 時優先問「用途領域」：先定位方向，再談語言或安裝方式。
  const prefer = options.prefer
    || (options.decision === 'no-match' ? 'category' : undefined);
  const q = nextQuestion(candidates, tools, { ...options, exclude: asked, prefer });
  if (!q) {
    return {
      shouldAsk: false,
      reason: candidates.length < 2
        ? '候選不足，無從收斂'
        : '候選在各維度上已夠集中，追問的資訊增益太低',
    };
  }
  return { shouldAsk: true, reason: `候選在「${q.label}」上分歧最大（entropy ${q.entropy.toFixed(2)}）`, question: q };
}
