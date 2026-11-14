#!/usr/bin/env node
/**
 * subtool-index.js — 集合工具的「子功能能力索引」（給 agent 引擎用，純唯讀）
 *
 * 為什麼需要這個模組
 * ────────────────────
 * agent 引擎（core/agent-retrieval.js）原本只看得到工具層的 metadata
 * （triggers／capabilities／description／useCase／install／language）。
 * 集合工具（awesome-copilot、claude-skills…）底下有數百個 subTool，
 * **每個都是一個真實能力**，但在 agent 端完全不存在 →
 * 「我要評估向量資料庫的搜尋品質」這種查詢，agent 只會看到一堆無關的
 * 專用工具，集合永遠選不到。
 *
 * 為什麼不用餘弦相似度（實測被否決）
 * ────────────────────────────────────
 * agent 端既有的相似度是「短能力描述 vs 短查詢」的餘弦。subTool 的中文描述
 * 很長（50~150 個 bigram），改成「長文件 vs 短查詢」後餘弦天生偏低：
 * 實測 54 題目標組的最佳 subTool 餘弦最高只有 0.37，中位數 0.16 →
 * 達不到 fusion 規則 3b 要求的 0.35 門檻，整個機制不會生效。
 *
 * 改用「覆蓋率」（coverage）
 * ──────────────────────────
 *   coverage(查詢, 文件) = Σ idf²(查詢∩文件) / Σ idf²(查詢)
 *
 * 分母是「查詢」，與文件長度無關 → 集合的長 subTool 描述與專用工具的短描述
 * 可以直接比較。這正是這個場景需要的量：「這份文件涵蓋了使用者多少需求」。
 *
 * IDF 空間是統一的：所有工具的能力文件 ＋ 所有 subTool 的文件一起算 df，
 * 否則「只在 subTool 描述裡出現過」的中文詞會拿到最低權重，覆蓋率會失真。
 *
 * 集合的「有效覆蓋率」要扣掉專用工具基準
 * ──────────────────────────────────────
 * 集合有數百個 subTool → 取最大值等於「抽籤抽到最好的那個」→ 覆蓋率會系統性
 * 被灌高，連不相干的集合都可能贏過正解（實測：257 題非集合題目中有 82 題
 * 有集合的覆蓋率 ≥ 0.35）。
 * 因此集合的有效分數要扣掉「專用工具已經能覆蓋多少」：
 *   effective = max(0, 集合最佳覆蓋率 − 專用工具最佳覆蓋率)
 * 語意：「這個集合能做的，比專用工具已經能做的還多什麼？」
 * 這與尺子「有更專門的工具覆蓋同一需求 → 專用工具才是期望」的規則一致。
 */

import { documentFrequency, idfFromDf } from './tokenize.js';

// ── 中文功能詞 bigram 過濾 ───────────────────────────────────────────────
//
// 「的X」「X的」「是什」「麼幫」這類不可能命中子工具描述，卻會灌大分母。
// 與 core/search-engine.js 的 CJK_FUNCTION_CHARS 同一份定義（同步維護）。
//
// ⚠️ 「對」刻意不列入功能字：「對手」（競爭對手）是實詞。
// ⚠️ 「項目」不列入：台灣用法「清理項目／工作項目」都是 item，不是大陸的「專案」。
const CJK_FUNCTION_CHARS = new Set(
  '的了是在和與或也都就而但這那我你他她它們要能可會把被給從到用之其所以於更最很太再又才只已未不沒別嗎呢吧啊呀麼怎樣什'
);

const isFunctionBigram = (b) => CJK_FUNCTION_CHARS.has(b[0]) || CJK_FUNCTION_CHARS.has(b[1]);

/**
 * subTool 通道專用斷詞
 *
 * 中文：切成 2 字滑動窗（bigram），單字中文不進（比對時用不上，只會稀釋分母）；
 *       功能詞 bigram 直接丟棄。
 * 英文：整段取出後依連字號拆細（`oracle-to-postgres` 的 subTool 名稱是空格分寫的，
 *       整串比對必然落空）。
 *
 * @param {string} text
 * @returns {string[]} token 陣列（不重複）
 */
export function subToolTokenize(text) {
  const t = String(text || '').toLowerCase();
  const out = new Set();
  for (const run of t.match(/[a-z][a-z0-9+.#_-]{1,}/g) || []) {
    out.add(run);
    for (const p of run.split(/[-_]+/)) if (p.length >= 2) out.add(p);
  }
  for (const run of t.match(/[\u4e00-\u9fff]+/g) || []) {
    if (run.length < 2) continue;
    for (let i = 0; i < run.length - 1; i++) {
      const bg = run.slice(i, i + 2);
      if (isFunctionBigram(bg)) continue;
      out.add(bg);
    }
  }
  return [...out];
}

/**
 * 建立子功能能力索引
 *
 * @param {object[]} tools - 工具註冊表
 * @returns {object} index
 */
export function buildSubToolIndex(tools) {
  // ── 文件集 ──
  // 每支工具一份「能力文件」＋ 每個 subTool 一份文件。
  // 統一放進同一個 IDF 空間，否則只在 subTool 描述出現過的詞會拿到最低權重。
  const docs = [];
  const owner = [];
  const isSubDoc = [];
  for (const t of tools) {
    docs.push([
      ...(t.capabilities || []),
      t.description || '',
      t.description_zh || '',
    ].join(' '));
    owner.push(t.id);
    isSubDoc.push(false);
    for (const st of t.subTools || []) {
      docs.push([
        st.name || '',
        st.description || '',
        st.name_zh || '',
        st.description_zh || '',
      ].join(' '));
      owner.push(t.id);
      isSubDoc.push(true);
    }
  }

  const df = documentFrequency(docs);
  const idf = idfFromDf(df, docs.length);
  const bags = docs.map((d) => new Set(subToolTokenize(d)));

  // 每支工具 → 其文件詞袋清單（專用工具只有自己那份，集合則是全部 subTool）
  const byTool = new Map();
  for (let i = 0; i < docs.length; i++) {
    let entry = byTool.get(owner[i]);
    if (!entry) {
      entry = { bags: [], hasSubTools: false };
      byTool.set(owner[i], entry);
    }
    entry.bags.push(bags[i]);
    if (isSubDoc[i]) entry.hasSubTools = true;
  }

  // 查詢 token 與其 IDF² 總和（分母）
  const prepareQuery = (query) => {
    const tokens = subToolTokenize(query);
    const norm = tokens.reduce((s, t) => s + (idf.get(t) || 1) ** 2, 0);
    return { tokens, norm };
  };

  const coverageOf = (toolId, tokens, qNorm, minHits = 1) => {
    const entry = byTool.get(toolId);
    if (!entry || !qNorm) return 0;
    let best = 0;
    for (const bag of entry.bags) {
      let dot = 0;
      let hits = 0;
      for (const t of tokens) {
        if (bag.has(t)) {
          dot += (idf.get(t) || 1) ** 2;
          hits++;
        }
      }
      if (hits < minHits) continue;
      const c = dot / qNorm;
      if (c > best) best = c;
    }
    return best;
  };

  // 專用工具（非集合）的最佳覆蓋率 —— 集合分數要扣掉這個基準
  const bestDedicatedCoverage = (tokens, qNorm) => {
    if (!qNorm) return 0;
    let best = 0;
    for (const [toolId, entry] of byTool) {
      if (entry.hasSubTools) continue;
      const c = coverageOf(toolId, tokens, qNorm);
      if (c > best) best = c;
    }
    return best;
  };

  return {
    idf,
    byTool,
    documentCount: docs.length,
    subToolDocumentCount: docs.length - tools.length,
    prepareQuery,
    coverageOf,
    bestDedicatedCoverage,
    hasSubTools: (toolId) => byTool.get(toolId)?.hasSubTools === true,
  };
}

// 以「工具庫陣列的身分」快取（同一份 registry 只建一次）。
// 理由：索引建置要對 4,600+ 份文件做斷詞與 df 統計，不能每次查詢重做。
const indexCache = new WeakMap();

/**
 * 取得（並記憶化）某份工具庫的子功能索引
 * @param {object[]} tools
 * @returns {object} index
 */
export function getSubToolIndex(tools) {
  if (!Array.isArray(tools)) return null;
  let idx = indexCache.get(tools);
  if (!idx) {
    idx = buildSubToolIndex(tools);
    indexCache.set(tools, idx);
  }
  return idx;
}
