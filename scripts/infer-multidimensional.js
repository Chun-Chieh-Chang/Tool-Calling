/**
 * infer-multidimensional.js — 多維度（MECE）分類身分推斷引擎（唯讀）
 *
 * 使用者定調（2026-09-12）：
 *   「先區分層級再區分維度，層級與維度都遵循 MECE 原則。」
 *
 * 兩層 MECE 結構：
 *
 *   ┌─ 第一層「身分」（hierarchy / identity）─────────────────────────
 *   │   primary   ：規則引擎（core/classification-rules.js）依 pass 分層
 *   │               「先命中者勝」推斷，是現行單一 `category` 的替代。
 *   │   secondary ：掃描**所有** pass-1 Tier-1 規則，回傳其他身分候選
 *   │               → 多重身分的量化（一個工具可同時是 API 又是 agent 用的）。
 *   │   MECE 校驗：primary 必唯一；secondary 候選互不重複（同類只留第一條）。
 *   │
 *   └─ 第二層「維度」（dimensions，core/multidimensional.js）───────
 *       D1 語意敘述 / D2 詞彙標籤 / D3 名稱身分，三維資訊獨立（r < 0.5）。
 *       每維各算一個 leave-one-out TF-IDF 邊際，投票取最佳維度作為該工具的
 *       正式邊際 → 比單一維度更能救回被單一維度拖垮的多身分工具。
 *
 * 輸出：registry/category-proposals.json（**供人工核准**，不改寫 tools.json）
 *   每筆工具含 primary / secondary / dimMargins / votedMargin /
 *   coreCandidate（三維邊際皆負 → 結構性問題）/ proposedCategories。
 *
 * 這是唯讀推斷：只產出提案，人工核准後才落盤為 schema 的 `categories[]`。
 *
 * 用法：
 *   node scripts/infer-multidimensional.js            # 產出 registry/category-proposals.json
 *   node scripts/infer-multidimensional.js --show     # 另印前 30 筆多身分／核心候選
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { inferPrimary, inferSecondary } from '../core/classification-rules.js';
import { DIMS, DIM_NAMES, computeMargins } from '../core/multidimensional.js';
import { categoryNames } from '../core/categories.js';

const ROOT = join(import.meta.dirname, '..');
const REGISTRY_PATH = join(ROOT, 'registry', 'tools.json');
const OUT_PATH = join(ROOT, 'registry', 'category-proposals.json');
const SHOW = process.argv.includes('--show');

function main() {
  const registry = JSON.parse(readFileSync(REGISTRY_PATH, 'utf-8'));
  const tools = registry.tools;
  const N = tools.length;

  // 第二層：三維邊際（純函式，與 measure-multidimensional-v2.js 同一份實作）
  const marginsByDim = {};
  for (const dk of DIM_NAMES) marginsByDim[dk] = computeMargins(tools, DIMS[dk]);

  const proposals = [];
  let multiIdentity = 0;
  let coreCandidates = 0;
  let rescuedByVoting = 0;
  const coreByCategory = {};

  for (let i = 0; i < N; i++) {
    const tool = tools[i];

    // 第一層：身分（primary + secondary）
    const primary = inferPrimary(tool);
    const secondary = inferSecondary(tool);

    // 第二層：維度投票（取最佳維度邊際）
    const dimMargins = {};
    for (const dk of DIM_NAMES) dimMargins[dk] = marginsByDim[dk][i];
    const voted = Math.max(...DIM_NAMES.map((dk) => dimMargins[dk].margin));
    const votedDim = DIM_NAMES.find((dk) => dimMargins[dk].margin === voted);
    const worst = Math.min(...DIM_NAMES.map((dk) => dimMargins[dk].margin));

    if (secondary.length > 0) multiIdentity++;

    // 核心候選：三維邊際皆負（結構性問題，需人工裁決或新增／拆分類別）
    const isCore = DIM_NAMES.every((dk) => dimMargins[dk].margin < 0);
    if (isCore) {
      coreCandidates++;
      coreByCategory[tool.category] = (coreByCategory[tool.category] || 0) + 1;
    }
    if (worst < 0 && voted >= 0) rescuedByVoting++;

    // proposedCategories：primary（若與現行不同）+ 現行 category + secondary，去重
    const proposedCategories = [];
    const add = (c) => { if (c && !proposedCategories.includes(c)) proposedCategories.push(c); };
    if (primary && primary.required !== tool.category) add(primary.required);
    add(tool.category);
    for (const s of secondary) add(s.required);

    proposals.push({
      id: tool.id,
      name: tool.name,
      current: tool.category,
      primary,
      secondary,
      dimMargins,
      votedMargin: voted,
      votedDim,
      worstMargin: worst,
      coreCandidate: isCore,
      proposedCategories,
      multiIdentity: secondary.length > 0
    });
  }

  const result = {
    generatedAt: new Date().toISOString(),
    method: 'hierarchy-first (primary+secondary identity), then MECE dimensions (D1/D2/D3 voting); both layers MECE-conformant',
    totalTools: N,
    dimensions: DIM_NAMES,
    summary: {
      multiIdentity,
      coreCandidates,
      rescuedByVoting,
      primaryInferred: proposals.filter((p) => p.primary).length,
      primaryByCategory: (function () {
        const m = {};
        for (const p of proposals) if (p.primary) m[p.primary.required] = (m[p.primary.required] || 0) + 1;
        return m;
      })(),
      coreByCategory: coreByCategory
    },
    proposals: proposals.sort((a, b) => {
      if (a.coreCandidate !== b.coreCandidate) return a.coreCandidate ? -1 : 1;
      if (a.multiIdentity !== b.multiIdentity) return b.multiIdentity - a.multiIdentity;
      return a.worstMargin - b.worstMargin;
    })
  };

  writeFileSync(OUT_PATH, JSON.stringify(result, null, 2) + '\n', 'utf-8');

  console.log(`📐 多維度身分推斷完成（${N} 筆）`);
  console.log(`   多重身分（有 secondary）: ${multiIdentity}`);
  console.log(`   核心候選（三維皆負）   : ${coreCandidates}`);
  console.log(`   投票救回（負→正）       : ${rescuedByVoting}`);
  console.log(`   primary 規則命中        : ${result.summary.primaryInferred}`);
  console.log(`\n核心候選按分類：`);
  for (const [c, n] of Object.entries(coreByCategory).sort((a, b) => b[1] - a[1])) {
    const total = tools.filter((t) => t.category === c).length;
    console.log(`   ${c}  ${n}/${total} (${((n / total) * 100).toFixed(0)}%)`);
  }
  console.log(`\n📄 提案：registry/category-proposals.json`);

  if (SHOW) {
    console.log('\n=== 前 30 筆（coreCandidate 優先，再按 multiIdentity / worstMargin）===');
    for (const p of result.proposals.slice(0, 30)) {
      const tag = p.coreCandidate ? '[CORE]' : p.multiIdentity ? '[MULTI]' : '[----]';
      const id = p.id.padEnd(34, ' ');
      const pm = p.primary ? p.primary.required : '—';
      const sec = p.secondary.map((s) => s.required).join(',') || '—';
      const mc = p.dimMargins;
      const ml = DIM_NAMES.map((dk) => `${dk.slice(0, 2)}=${(mc[dk].margin * 100).toFixed(0)}`).join(' ');
      console.log(`${tag} ${id} 現:${p.current} primary:${pm} sec:[${sec}] | ${ml}`);
    }
  }
}

main();
