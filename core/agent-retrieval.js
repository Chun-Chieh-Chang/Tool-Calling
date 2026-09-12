#!/usr/bin/env node
/**
 * agent-retrieval.js — Agent 導向的多維度工具檢索引擎（唯讀，不修改任何資料）
 *
 * 設計原則
 * ─────────
 * 1. 分類的目的是「讓 agent 自動選工具」，固定 18 分類是設計殘留、不是資料最優。
 * 2. 詞彙空間（TF-IDF）聚類結構極弱（silhouette < 0.016），加更多詞彙維度無效。
 * 3. 真正有鑑別力的維度是**結構性的**：identity / capability / scenario / constraint
 *    四個資訊獨立維度（Pearson r < 0.5，MECE）。
 * 4. 每一維度獨立評分 → 跨維度加權融合 → confidence 決策 → 誠實回傳「無高置信度工具」。
 * 5. 不依賴語意 embedding（需要外部模型），完全用現行 696 筆資料 + 規則。
 *
 * 維度定義（與 core/multidimensional.js 的 D1/D2/D3 收斂，但改以「檢索」為目標）
 * ─────────────────────────────────────────────────────
 * V1  identity      triggers + name + id（身分欄位；命中一次即成立）
 * V2  capability    capabilities 陣列 + description（功能欄位；需 ≥2 個不同信號）
 * V3  scenario      useCase + category + negativeConstraints（情境欄位）
 * V4  constraint    install.method + language + negativeConstraints（部署欄位）
 *
 * 每個維度對 (query, tool) 回傳 0~1 的評分；融合時採用「取最佳維度」策略
 * （類比 classify 端的投票取最佳，把邊界工具拖回正區），再加權平均作為
 * confidence。若 confidence 低于閾值，誠實回傳「無高置信度工具」，
 * 而非偽裝一個 top-1。
 *
 * 輸出
 * ───
 * {
 *   query,
 *   topK: [{ tool, score, perDimension, reasons, confidence }],
 *   decision: "high-confidence" | "low-confidence" | "no-match",
 *   fallbackHint: string  (低置信度時給 agent 的下一步建議)
 * }
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

// ── Tokeniser（中英混合，與 measure-multidimensional.js 一致）────────────
const STOP = new Set(['the', 'and', 'for', 'with', 'that', 'this', 'from', 'are', 'you', 'can', 'use', 'using', 'your', 'not', 'all', 'any', 'has', 'have', 'was', 'were', 'its', 'to', 'of', 'in', 'on', 'a', 'an', 'is', 'as', 'by', 'or', 'be', 'at', 'we', 'no', 'do', 'if', 'so', 'up', 'out', 'new', 'one', 'two', 'via', 'per', 'etc', 'based', 'into', 'over', 'more', 'than', 'other']);
function tokenize(text) {
  const t = String(text || '').toLowerCase();
  const out = [];
  for (const m of t.matchAll(/[a-z][a-z0-9+.#_-]{1,}/g)) if (!STOP.has(m[0])) out.push(m[0]);
  for (const run of t.match(/[\u4e00-\u9fff]+/g) || []) {
    if (run.length === 1) out.push(run);
    else for (let i = 0; i < run.length - 1; i++) out.push(run.slice(i, i + 2));
  }
  return out;
}
function bagOf(tokens) {
  const b = new Map();
  for (const t of tokens) b.set(t, (b.get(t) || 0) + 1);
  return b;
}
// IDF 加權 bag：把「所有工具都有」的詞（如 ai、tool、agent、markdown）壓低，
// 讓罕見詞（如 playwright、kubernetes、stock）有更高鑑別力。
// 回傳 (idfMap) 讓評分端可用 idf 加權。
function buildIdf(tools) {
  // 身分欄位（triggers + name + id）的 IDF：用於 V1
  const dfId = new Map();
  for (const t of tools) {
    const text = [t.id, t.name, ...(t.triggers || [])].join(' ');
    for (const tok of new Set(tokenize(text))) dfId.set(tok, (dfId.get(tok) || 0) + 1);
  }
  const N = tools.length;
  const idf = (df) => {
    const m = new Map();
    for (const [tok, d] of df) m.set(tok, Math.log((N + 1) / (d + 1)) + 1);
    return m;
  };
  return { idfIdentity: idf(dfId) };
}
// 加權 bag 相似度：sum(idf[共詞] * wA * wB) / (sqrt(sum(idf^2 * wA^2)) * sqrt(sum(idf^2 * wB^2)))
// w 預設 1；身分欄位可用更高權重放大 token 命中。
function weightedSim(a, b, idfMap, { weightA = 1, weightB = 1 } = {}) {
  if (a.size === 0 || b.size === 0) return 0;
  let dot = 0;
  const [small, big] = a.size <= b.size ? [a, b] : [b, a];
  for (const k of small.keys()) {
    if (big.has(k)) {
      const w = idfMap.get(k) || 1;
      dot += w * w * weightA * weightB;
    }
  }
  if (dot === 0) return 0;
  let na = 0, nb = 0;
  for (const k of a.keys()) { const w = idfMap.get(k) || 1; na += w * w * weightA; }
  for (const k of b.keys()) { const w = idfMap.get(k) || 1; nb += w * w * weightB; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
// 身分欄位的「完整 trigger 命中」：query 內的某 trigger 整段出現 → 強信號
// 這是 V1 的核心：agent 寫 query 時常直接包含 trigger 字串。
function triggerHit(queryBag, tool) {
  const triggers = (tool.triggers || []).map((s) => String(s).toLowerCase());
  const qText = [...queryBag.keys()].join(' ');
  for (const trig of triggers) {
    if (trig.length >= 4 && qText.includes(trig)) return trig;
  }
  return null;
}

// ── 查詢前處理 ────────────────────────────────────────────────────────────
function extractQuery(query) {
  const norm = String(query || '').toLowerCase().trim();
  const tokens = tokenize(norm);
  const bag = bagOf(tokens);
  return { norm, tokens, bag };
}

// 四個獨立維度：identity / capability / scenario / constraint
// 對 (query, tool) 回傳 0~1 的評分。

// V1 身分：trigger 完整命中（IDF 加權）+ id/name/token 重疊。
// trigger 命中不再給固定 0.9 —— 改為依 IDF：罕見 trigger（如 kubernetes）
// 命中給 0.95，常見 trigger（如 markdown、node、data）命中只給 ~0.4。
// 這是因為 agent 寫 query 時包含「markdown」很可能只是語境詞，不是身分。
function scoreV1Identity(q, tool, idf) {
  const trigHit = triggerHit(q.bag, tool);
  let hitScore = 0;
  if (trigHit) {
    // trigger 本身作為單詞的 IDF：出現在越多工具越少，命中越有意義
    const trigTokens = tokenize(trigHit);
    const trigIdf = trigTokens.length > 0
      ? trigTokens.reduce((s, t) => s + (idf.idfIdentity.get(t) || 1), 0) / trigTokens.length
      : 1;
    // 全庫平均 IDF ≈ log(N) ≈ 6.5；常見詞 ~2，罕見詞 ~8
    const normIdf = Math.max(0, Math.min(1, (trigIdf - 1.5) / 6.0)); // 1.5→0, 7.5→1
    hitScore = 0.3 + 0.65 * normIdf; // 常見 ~0.3-0.5，罕見 0.95
  }
  const identityTokens = [tool.id, tool.name, ...(tool.triggers || [])].filter(Boolean);
  const toolBag = bagOf(identityTokens.flatMap((s) => tokenize(s)));
  const idfScore = weightedSim(q.bag, toolBag, idf.idfIdentity, { weightA: 1.5, weightB: 1 });
  return { value: Math.max(hitScore, idfScore), trigHit };
}

// V2 功能：capabilities 陣列 + description；IDF 加權。
function scoreV2Capability(q, tool, idf) {
  const capText = [
    ...(tool.capabilities || []),
    tool.description || '',
  ].join(' ');
  const toolBag = bagOf(tokenize(capText));
  return { value: weightedSim(q.bag, toolBag, idf.idfIdentity, { weightA: 1, weightB: 1 }) };
}

// V3 情境：useCase + category + negativeConstraints。
function scoreV3Scenario(q, tool, idf) {
  const scenarioText = [
    tool.useCase || '',
    tool.category || '',
    ...(tool.negativeConstraints || []),
  ].join(' ');
  const toolBag = bagOf(tokenize(scenarioText));
  return { value: weightedSim(q.bag, toolBag, idf.idfIdentity, { weightA: 1, weightB: 1 }) };
}

// V4 部署：install.method + language + negativeConstraints。
function scoreV4Constraint(q, tool, idf) {
  const constraintText = [
    tool.install?.method || '',
    tool.language || '',
    ...(tool.negativeConstraints || []),
  ].join(' ');
  const toolBag = bagOf(tokenize(constraintText));
  return { value: weightedSim(q.bag, toolBag, idf.idfIdentity, { weightA: 1, weightB: 1 }) };
}

// ── 融合策略 ─────────────────────────────────────────────────────────────
// 取最佳維度（max）作為 confidence，再加權平均作為排序分數。
// 若最佳維度 < 0.15 → 「no-match」（誠實回傳）
// 若 0.15 ~ 0.35     → 「low-confidence」（回傳 top-K 但標記 fallbackHint）
// 若 ≥ 0.35           → 「high-confidence」

const BEST_DIM_THRESHOLD = 0.35;
const NO_MATCH_THRESHOLD = 0.15;
const DIM_WEIGHTS = { V1: 0.30, V2: 0.35, V3: 0.20, V4: 0.15 };
// V2 capability 權重最高：對 agent 選工具而言「能做什麼」比「怎麼裝」重要。

function fuse(q, tool, idf) {
  const s1 = scoreV1Identity(q, tool, idf);
  const s2 = scoreV2Capability(q, tool, idf);
  const s3 = scoreV3Scenario(q, tool, idf);
  const s4 = scoreV4Constraint(q, tool, idf);
  const per = { V1: s1.value, V2: s2.value, V3: s3.value, V4: s4.value };
  const bestDim = Math.max(per.V1, per.V2, per.V3, per.V4);
  const weighted = per.V1 * DIM_WEIGHTS.V1 + per.V2 * DIM_WEIGHTS.V2 +
                   per.V3 * DIM_WEIGHTS.V3 + per.V4 * DIM_WEIGHTS.V4;
  const topDimKey = Object.keys(per).reduce((a, b) => (per[a] >= per[b] ? a : b));
  return { per, bestDim, weighted, topDimKey, trigHit: s1.trigHit };
}

function reasons(q, tool, fuseResult) {
  const r = [];
  if (fuseResult.trigHit) r.push(`✓ Trigger 命中：「${fuseResult.trigHit}」`);
  else if (fuseResult.per.V1 >= 0.4) r.push(`✓ 身分相似：${(tool.triggers || []).slice(0, 3).join(' / ')}`);
  if (fuseResult.per.V2 >= 0.4) r.push(`✓ 功能吻合：${(tool.capabilities || []).slice(0, 4).join(' / ')}`);
  if (fuseResult.per.V3 >= 0.4) r.push(`✓ 情境吻合：${tool.useCase?.slice(0, 80)}`);
  if (fuseResult.per.V4 >= 0.4) r.push(`✓ 部署吻合：${tool.install?.method} / ${tool.language}`);
  if (fuseResult.bestDim < NO_MATCH_THRESHOLD) r.push('⚠ 所有維度皆無有效信號');
  return r;
}

// ── 對外 API ─────────────────────────────────────────────────────────────
export function agentRetrieve(tools, query, { topK = 5 } = {}) {
  const q = extractQuery(query);
  const idf = buildIdf(tools);
  const scored = tools.map((tool) => ({
    tool,
    ...fuse(q, tool, idf),
  })).filter((x) => x.bestDim > 0);

  // 按 weighted 分數排序
  scored.sort((a, b) => b.weighted - a.weighted);
  const top = scored.slice(0, topK).map((x) => ({
    id: x.tool.id,
    name: x.tool.name,
    category: x.tool.category,
    perDimension: x.per,
    topDim: x.topDimKey,
    score: Number(x.weighted.toFixed(4)),
    confidence: Number(x.bestDim.toFixed(4)),
    triggerHit: x.trigHit,
    reasons: reasons(q, x.tool, x),
  }));

  // 決策
  const top1 = top[0];
  let decision = 'no-match';
  let fallbackHint = '';
  if (top1 && top1.confidence >= BEST_DIM_THRESHOLD) {
    decision = 'high-confidence';
  } else if (top1 && top1.confidence >= NO_MATCH_THRESHOLD) {
    decision = 'low-confidence';
    fallbackHint = `最佳匹配置信度 ${(top1.confidence * 100).toFixed(0)}% 未達 ${BEST_DIM_THRESHOLD * 100}% 閾值。` +
      `建議：(a) 重新描述需求，加入更具體的技術詞；(b) 用 list_tools 依分類翻找；(c) 若屬「無家可歸」需求，` +
      `可能是工具庫缺該類工具（參考 dynamic-k 報告）。`;
  } else if (top1) {
    decision = 'no-match';
    fallbackHint = '所有候選在四維度上皆無有效信號。建議改用 list_tools 依分類翻找，或重新描述需求。';
  }

  return {
    query,
    totalCandidates: tools.length,
    matched: scored.length,
    decision,
    fallbackHint,
    topK: top,
  };
}

// ── CLI 入口（僅在直接執行時）────────────────────────────────────────────
const isDirect = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirect) {
  const j = JSON.parse(readFileSync(path.join(ROOT, 'registry', 'tools.json'), 'utf8'));
  const tools = j.tools.filter((t) => t.status === 'active' || t.status === 'experimental');
  const args = process.argv.slice(2);
  if (args.length === 0) {
    // 預設 smoke test
    const samples = [
      'I need to convert a PDF report to markdown for RAG',
      'scrape a JS-rendered dashboard and extract tables',
      'generate a weekly PPT from a doc',
      'pull stock prices for AAPL and save to csv',
      'clean and dedupe a large jsonl dataset',
      'run e2e browser tests in headless mode',
      'deploy a node.js service to a kubernetes cluster',
      'summarize a 2-hour video into markdown notes',
    ];
    for (const q of samples) {
      const r = agentRetrieve(tools, q, { topK: 3 });
      console.log('QUERY:', q);
      console.log(`  decision=${r.decision} matched=${r.matched}/${r.totalCandidates}`);
      r.topK.forEach((x, i) => {
        console.log(`  ${i + 1}. ${x.id.padEnd(36)} conf=${(x.confidence * 100).toFixed(0)}% ` +
          `[V1=${(x.perDimension.V1 * 100).toFixed(0)} V2=${(x.perDimension.V2 * 100).toFixed(0)} ` +
          `V3=${(x.perDimension.V3 * 100).toFixed(0)} V4=${(x.perDimension.V4 * 100).toFixed(0)}]`);
        if (x.reasons[0]) console.log(`     ${x.reasons[0]}`);
      });
      if (r.fallbackHint) console.log(`  HINT: ${r.fallbackHint.slice(0, 120)}`);
      console.log();
    }
  } else {
    const r = agentRetrieve(tools, args.join(' '), { topK: 10 });
    console.log(JSON.stringify(r, null, 2));
  }
}
