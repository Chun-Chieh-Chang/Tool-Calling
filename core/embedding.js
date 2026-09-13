#!/usr/bin/env node
/**
 * embedding.js — 語意 embedding 模組（Option B）
 *
 * 雙用途：
 *   1. 工具端：embed-build.js 用它對 696 筆工具預計算向量（需 API key）。
 *   2. 查詢端：agent-retrieval 用它把查詢文字算成向量，與預計算的工具向量
 *      做 cosine（完全離線，不需 API）。
 *
 * 離線安全
 * ─────────
 * 本模組**不自己呼叫任何 API**。它只封裝「如何把文字送出去換向量」的
 * 邏輯，實際 HTTP 呼叫由 embed-build.js（工具端）透過 callEmbeddingAPI 完成。
 * 查詢端向量同樣需要 API；為了讓 agent-retrieval 在離線時也能跑，
 * V0 維度只在「已預計算 vectors.json 存在 且 查詢向量可用」時啟用，
 * 否則 V0 = 0，完全退化成原來的四維引擎（V1~V4）。
 *
 * 向量存取
 * ─────────
 * loadVectors()：讀 registry/embeddings/vectors.json，回傳
 *   { model, dimensions, tools: { "<id>": [float] }, generatedAt } 或 null。
 * 不存在 → 回傳 null，agent-retrieval 看到 null 就跳過 V0。
 */

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const VECTORS_FILE = path.join(ROOT, 'registry', 'embeddings', 'vectors.json');

// 把工具欄位拼接成 embedding 文字（與 embed-build.js 的 embedText 一致）
export function toolEmbedText(tool) {
  const parts = [
    tool.name || '',
    tool.description || '',
    tool.useCase || '',
    (tool.triggers || []).join(' '),
  ].filter(Boolean);
  return parts.join('\n').slice(0, 8000);
}

// 查詢文字：直接取原始查詢（不做欄位拼接）
export function queryEmbedText(query) {
  return String(query || '').slice(0, 8000);
}

// 讀預計算的工具向量；不存在時回傳 null（離線安全）
export function loadVectors() {
  if (!existsSync(VECTORS_FILE)) return null;
  try {
    const j = JSON.parse(readFileSync(VECTORS_FILE, 'utf8'));
    if (!j || typeof j.tools !== 'object') return null;
    return j;
  } catch {
    return null;
  }
}

// cosine 相似度：a、b 皆為 number[]；任一為 null/非陣列/長度不符 → 0
export function cosine(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || a.length === 0) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i] || 0, y = b[i] || 0;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  if (denom === 0) return 0;
  // 標準 cosine ∈ [-1, 1]；嵌入向量同向時 > 0，反向 < 0。
  // 取 max(0, cos) 讓「無相關 / 反向」落到 0，不污染 confidence。
  return Math.max(0, dot / denom);
}
