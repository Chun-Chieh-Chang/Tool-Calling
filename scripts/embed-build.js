#!/usr/bin/env node
/**
 * embed-build.js — 預計算 696 筆工具的語意 embedding（Option B）
 *
 * 用途：把 registry/tools.json 每筆工具算成一個向量，寫入
 *       registry/embeddings/vectors.json，供 agent-retrieval 的
 *       V0（語意維度）離線查詢 cosine 相似度。
 *
 * 設計原則
 * ─────────
 * 1. 離線安全：無 EMBED_API_KEY 時本腳本只是「說明用法」，不會跑
 *    任何 API、不會改動任何檔案。`npm test` 永不觸及本腳本。
 * 2. 增量：已有 vectors.json 且 hashes 吻合的工具不再重算。
 * 3. 批次 + 延遲：比照 enrich-registry.js 的 CONCURRENCY/delay 慣例，
 *    避免打爆 API 額度。
 * 4. 端點可覆寫：預設走 OpenAI 相容 embedding API；可用
 *    EMBED_API_BASE / EMBED_MODEL / EMBED_DIMENSIONS 換任何供應商。
 *
 * 用法（Windows PowerShell）：
 *   $env:EMBED_API_KEY="sk-..."; node scripts/embed-build.js
 *
 * 環境變數：
 *   EMBED_API_KEY        （必填）Bearer token
 *   EMBED_API_BASE       （選填）預設 https://api.openai.com/v1
 *   EMBED_MODEL          （選填）預設 text-embedding-3-small
 *   EMBED_DIMENSIONS     （選填）向量維度，預設 1024
 *   EMBED_CONCURRENCY    （選填）批次並行數，預設 5
 *   EMBED_DELAY_MS       （選填）批次間延遲，預設 2000
 *   EMBED_DRY_RUN        （選填）=1 時只算 hash、不實際呼叫 API
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { toolEmbedText } from '../core/embedding.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const REGISTRY = path.join(ROOT, 'registry', 'tools.json');
const OUT_DIR = path.join(ROOT, 'registry', 'embeddings');
const OUT_FILE = path.join(OUT_DIR, 'vectors.json');

const CONCURRENCY = parseInt(process.env.EMBED_CONCURRENCY || '5', 10);
const DELAY_MS = parseInt(process.env.EMBED_DELAY_MS || '2000', 10);
const DIMENSIONS = parseInt(process.env.EMBED_DIMENSIONS || '1024', 10);
const MODEL = process.env.EMBED_MODEL || 'text-embedding-3-small';
const API_BASE = (process.env.EMBED_API_BASE || 'https://api.openai.com/v1').replace(/\/$/, '');
const API_KEY = process.env.EMBED_API_KEY;
const DRY_RUN = process.env.EMBED_DRY_RUN === '1';

// 預計算 text（與 core/embedding.js 的 toolEmbedText 一致）
function embedText(tool) {
  return toolEmbedText(tool);
}

// 文字 hash：用來做增量（texts 改動才重算）
function textHash(text) {
  return crypto.createHash('sha256').update(text).digest('hex').slice(0, 16);
}

async function callEmbeddingAPI(texts, apiBase, model, dimensions, key) {
  const res = await fetch(`${apiBase}/embeddings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      input: texts,
      ...(dimensions ? { dimensions } : {}),
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Embedding API Error ${res.status}: ${errText}`);
  }
  const data = await res.json();
  // 依 input 順序回傳向量（OpenAI 相容端點皆帶 index 欄位，依序取出）
  const byIndex = new Map(data.data.map((d) => [d.index, d.embedding]));
  return texts.map((_, i) => byIndex.get(i));
}

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  if (!API_KEY && !DRY_RUN) {
    console.error('Error: EMBED_API_KEY environment variable is missing.');
    console.error('Usage: $env:EMBED_API_KEY="sk-..."; node scripts/embed-build.js');
    console.error('Optional: EMBED_API_BASE / EMBED_MODEL / EMBED_DIMENSIONS / EMBED_CONCURRENCY / EMBED_DELAY_MS');
    console.error('Dry run (no API): EMBED_DRY_RUN=1 node scripts/embed-build.js');
    process.exit(1);
  }

  const j = JSON.parse(readFileSync(REGISTRY, 'utf8'));
  const tools = j.tools.filter((t) => t.status === 'active' || t.status === 'experimental');
  console.log(`\x1b[36mEmbedding build — ${tools.length} tools, model=${MODEL}, dims=${DIMENSIONS}\x1b[0m`);

  // 讀既有 vectors.json（增量）
  const existing = existsSync(OUT_FILE)
    ? JSON.parse(readFileSync(OUT_FILE, 'utf8'))
    : { model: MODEL, dimensions: DIMENSIONS, generatedAt: new Date().toISOString(), tools: {} };

  // 計算 texts + hashes
  const pending = [];
  for (const tool of tools) {
    const text = embedText(tool);
    const hash = textHash(text);
    existing.tools[tool.id] ??= {};
    const cached = existing.tools[tool.id];
    if (cached?.hash === hash && Array.isArray(cached?.vector) && cached.vector.length > 0) {
      continue; // 已快取且吻合 → 跳過
    }
    pending.push({ id: tool.id, text, hash });
  }

  console.log(`\x1b[33mAlready cached: ${tools.length - pending.length} / ${tools.length}; pending: ${pending.length}\x1b[0m`);

  if (DRY_RUN) {
    console.log(`\x1b[32mDry run：會重算 ${pending.length} 筆，不實際呼叫 API。取消 dry-run 加 EMBED_API_KEY。\x1b[0m`);
    return;
  }

  // 批次呼叫
  let ok = 0, fail = 0;
  for (let i = 0; i < pending.length; i += CONCURRENCY) {
    const chunk = pending.slice(i, i + CONCURRENCY);
    process.stdout.write(`batch ${Math.floor(i / CONCURRENCY) + 1}/${Math.ceil(pending.length / CONCURRENCY)} … `);
    const texts = chunk.map((c) => c.text);
    try {
      const vectors = await callEmbeddingAPI(texts, API_BASE, MODEL, DIMENSIONS, API_KEY);
      chunk.forEach((c, idx) => {
        existing.tools[c.id] = { hash: c.hash, vector: vectors[idx] };
      });
      ok += chunk.length;
    } catch (err) {
      fail += chunk.length;
      console.error(`\x1b[31m[batch ${i / CONCURRENCY + 1} failed]\x1b[0m ${err.message}`);
      // 失敗不寫入，保留既有快取；可重跑續算
    }
    if (i + CONCURRENCY < pending.length) await delay(DELAY_MS);
  }

// 寫回（只在有成功時）
  if (ok > 0) {
    existing.model = MODEL;
    existing.dimensions = DIMENSIONS;
    existing.generatedAt = new Date().toISOString();
    existing.count = tools.length;
    mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(OUT_FILE, JSON.stringify(existing, null, 2), 'utf8');
    const n = Object.values(existing.tools || {}).filter((t) => Array.isArray(t?.vector) && t.vector.length > 0).length;
    console.log(`\x1b[32mWrote ${n} tool vectors → registry/embeddings/vectors.json\x1b[0m`);
  }
  if (fail > 0) {
    console.error(`\x1b[33m${fail} tools failed (API errors); 重跑本腳本可續算。\x1b[0m`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('\x1b[31m[Fatal]\x1b[0m', err);
  process.exit(1);
});
