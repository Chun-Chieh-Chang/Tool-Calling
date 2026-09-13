#!/usr/bin/env node
/**
 * eval-agent-retrieval.js — 對照「L2 關鍵字」與「agent-retrieval」在
 * agent 風格查詢上的命中準確度（唯讀）。
 *
 * 評測方法：
 * - 8 筆 agent 風格查詢，每筆人工標註「正確工具 id 集合」（可能為空）
 * - 對照兩套引擎的 top-1 是否在正確集合內（Hit@1）
 * - 同時記錄 top-3 命中率（Hit@3）
 * - 若正確集合為空（即「工具庫沒有對應工具」），記錄引擎是否誠實
 *   回傳 low-confidence / no-match（誠實率）
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const tools = JSON.parse(readFileSync(path.join(ROOT, 'registry', 'tools.json'), 'utf8'))
  .tools.filter((t) => t.status === 'active' || t.status === 'experimental');

const { search } = await import(pathToFileURL(path.join(ROOT, 'core', 'search-engine.js')).href);
const { agentRetrieve } = await import(pathToFileURL(path.join(ROOT, 'core', 'agent-retrieval.js')).href);
const { retrieve } = await import(pathToFileURL(path.join(ROOT, 'core', 'retrieval-fusion.js')).href);

// 人工標註的评测集（8 筆）
const EVAL_SET = [
  {
    q: 'I need to convert a PDF report to markdown for RAG',
    correct: new Set(['markitdown', 'anydoc', 'pdf2md', 'pandoc']),
  },
  {
    q: 'scrape a JS-rendered dashboard and extract tables',
    correct: new Set(['playwright', 'browser-use', 'puppeteer', 'crawlee']),
  },
  {
    q: 'generate a weekly PPT from a doc',
    correct: new Set(['ppt-master', 'slidev', 'guizang-ppt-skill', 'minimax-ppt-skills']),
  },
  {
    q: 'pull stock prices for AAPL and save to csv',
    correct: new Set(['yfinance', 'tradingagents-astock', 'go-stock', 'akshare']),
  },
  {
    q: 'clean and dedupe a large jsonl dataset',
    correct: new Set(), // 工具庫沒有專門的資料清洗工具
  },
  {
    q: 'run e2e browser tests in headless mode',
    correct: new Set(['playwright', 'openai-playwright-automation-skill', 'ego-lite']),
  },
  {
    q: 'deploy a node.js service to a kubernetes cluster',
    correct: new Set(), // 工具庫沒有 k8s 部署工具
  },
  {
    q: 'summarize a 2-hour video into markdown notes',
    correct: new Set(['summarize']),
  },
];

function normalizeItem(item) {
  // L2 items: { tool: {...}, score, matchLevel }
  // agent-retrieval items: { id, name, category, perDimension, score, confidence, ... }
  if (item.tool) return { id: item.tool.id, score: item.score };
  return { id: item.id, score: item.score };
}

function runEngine(engineFn, topK, getItems) {
  const rows = [];
  for (const { q, correct } of EVAL_SET) {
    const items = getItems(engineFn(tools, q, { topK }));
    const norm = items.map(normalizeItem);
    const top1 = norm[0]?.id;
    const top3 = norm.slice(0, 3).map((r) => r.id);
    const hit1 = correct.size > 0 ? correct.has(top1) : null; // null = 無法命中
    const hit3 = correct.size > 0 ? top3.some((id) => correct.has(id)) : null;
    rows.push({ q, top1, top3, hit1, hit3 });
  }
  return rows;
}

function summarize(rows, label) {
  const withCorrect = rows.filter((r) => r.hit1 !== null);
  const withoutCorrect = rows.filter((r) => r.hit1 === null);
  const hit1 = withCorrect.filter((r) => r.hit1).length;
  const hit3 = withCorrect.filter((r) => r.hit3).length;
  console.log(`\n══ ${label} ══`);
  for (const r of rows) {
    const mark = r.hit1 === null ? '(空集)' : r.hit1 ? 'HIT@1' : 'MISS';
    console.log(`  ${mark.padEnd(8)} top1=${r.top1?.padEnd(28) || '(無)'}  ${r.q}`);
  }
  console.log(`  Hit@1: ${hit1}/${withCorrect.length}  Hit@3: ${hit3}/${withCorrect.length}` +
    `  (空集查詢 ${withoutCorrect.length} 筆，引擎需誠實回傳低置信度)`);
}

const l2 = runEngine((t, q, o) => search(t, q, o), 5, (res) => res);
const ag = runEngine((t, q, o) => agentRetrieve(t, q, o), 5, (res) => res.topK);
const fus = runEngine((t, q, o) => retrieve(t, q, o), 5, (res) => res.results);

summarize(l2, 'L2 關鍵字（現行 search-engine.js）');
summarize(ag, 'agent-retrieval.js（四維度引擎）');
summarize(fus, 'retrieval-fusion.js（L2 + agent 融合）');

// 誠實率檢查：空集查詢時，引擎是否回傳 low-confidence / no-match
console.log('\n══ 誠實率（空集查詢） ══');
for (const { q, correct } of EVAL_SET) {
  if (correct.size > 0) continue;
  const r = agentRetrieve(tools, q, { topK: 5 });
  const l2res = search(tools, q, { topK: 5 });
  const fusRes = retrieve(tools, q, { topK: 5 });
  const l2Top1Score = l2res[0]?.score || 0;
  console.log(`  ${q}`);
  console.log(`    L2:             top1.score=${l2Top1Score} (無誠實訊號，一律回傳結果)`);
  console.log(`    agent-retrieval: decision=${r.decision} top1.conf=${(r.topK[0]?.confidence * 100).toFixed(0)}%`);
  console.log(`    fusion:        decision=${fusRes.decision} source=${fusRes.source} consistent=${fusRes.agentConsistentCount} l2Leads=${fusRes.l2Leads}`);
  if (fusRes.fallbackHint) console.log(`                 hint=${fusRes.fallbackHint.slice(0, 90)}`);
}
