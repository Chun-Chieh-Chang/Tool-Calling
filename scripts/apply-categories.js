#!/usr/bin/env node
/**
 * apply-categories.js — 把多值身分落盤到 registry/tools.json 的 categories[]
 *
 * 設計原則（加性 + 語意相關性門，防污染）：
 *   1. **加性**：現行 `category`（primary）一律保留，`categories[0]` 必為現行。
 *      本腳本**從不修改 `category`**——改判是另一個人審流程（structural-review），
 *      不走此路徑。
 *   2. **語意相關性門**：只在「primary 身分（規則引擎推斷）與現行分類語意相關」時
 *      才把 primary 加進 `categories[]`。Tier-3 啟發命中若指向語意無關的分類
 *      （詞彙偽影，如 llama-index→知識管理、designmd→AI 代理），**一律不落**——
 *      因為詞彙近 ≠ 語意對，落了會污染檢索。
 *   3. **唯讀預設**：不帶 --apply 時只印出將落盤的清單，不改任何檔案。
 *
 * 落盤後驗證：check-mece、categories:check、validate、npm test、rescan --ci 全綠。
 *
 * 用法：
 *   node scripts/apply-categories.js             # 唯讀：列出將落盤的多身分
 *   node scripts/apply-categories.js --apply     # 正式落盤 categories[]
 *   node scripts/apply-categories.js --show-all  # 連偽影也列出（供人審）
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { inferPrimary } from '../core/classification-rules.js';

const ROOT = join(import.meta.dirname, '..');
const REGISTRY_PATH = join(ROOT, 'registry', 'tools.json');
const APPLY = process.argv.includes('--apply');
const SHOW_ALL = process.argv.includes('--show-all');

// ── 語意相關性門：與 structural-review 同源的分類邻接表 ──────────────────
// 只有落盤時「primary 身分（規則引擎推斷）」與「現行分類」在此表中相鄰（語意相關）
// 才允許多身分落盤。原則：只放「功能緊鄰」的分類對，不放「詞彙常共現但語意不同」的對。
// 例：langchain/dify/llama-index 的「知識管理」是 RAG 功能詞彙偽影（語意是 LLM 框架），
// 故 AI 框架 不鄰 知識管理；magnitude 是推理引擎非 agent，AI 框架 不鄰 AI 代理。
const RELATED = {
  '學習資源': ['研究'],                                   // 教材↔學術 同語意
  '研究': ['學習資源'],
  '金融與投資': ['數據分析', 'API 整合'],                  // 金融數據 真多身分
  '數據分析': ['金融與投資', '開發工具'],                   // 嵌入式分析 DB（duckdb）真多身分
  '測試與自動化': ['瀏覽器自動化', '開發工具'],               // playwright 真多身分
  '瀏覽器自動化': ['測試與自動化', '開發工具'],
  '文件生產力': ['知識管理', '學習資源'],                    // 文件處理↔知識
  '知識管理': ['文件生產力', 'API 整合'],
  '3D工程繪圖': ['多媒體生成', 'UI/UX設計'],
  '多媒體生成': ['影片', '音訊', 'UI/UX設計', '3D工程繪圖'],
  '影片': ['多媒體生成', '音訊'],
  '音訊': ['多媒體生成', '影片'],
  'UI/UX設計': ['多媒體生成', '3D工程繪圖']
};

function main() {
  const registry = JSON.parse(readFileSync(REGISTRY_PATH, 'utf-8'));
  const tools = registry.tools;

  const wouldApply = [];   // 通過語意門 → 落盤
  const pseudoEcho = [];   // 未過語意門 → 偽影，不落（供人審）
  let changed = 0;

  for (const tool of tools) {
    // 現行身分（保底，永為第一欄）
    const current = tool.category;
    const primary = inferPrimary(tool);
    if (!primary || !primary.required || primary.required === current) continue;

    const related = RELATED[current] && RELATED[current].includes(primary.required);

    if (related) {
      const catArr = Array.isArray(tool.categories) ? tool.categories : [current];
      if (!catArr.includes(primary.required)) catArr.push(primary.required);
      tool.categories = [current, ...catArr.filter((c) => c !== current)];
      wouldApply.push({ id: tool.id, current, add: primary.required, rule: primary.rule });
      if (tool.categories.length !== 2 || tool.categories[0] !== current) changed++; // sanity
    } else {
      // 詞彙偽影：不落盤，留人審
      pseudoEcho.push({ id: tool.id, current, rejected: primary.required, rule: primary.rule });
    }
  }

  if (APPLY) {
    registry.lastUpdated = new Date().toISOString();
    writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2) + '\n', 'utf-8');
  }

  console.log(`📋 categories[] 落盤（語意相關性門：只落盤語意明確的多身分）`);
  console.log(`   將落盤多身分：${wouldApply.length} 筆`);
  if (SHOW_ALL) console.log(`   偽影（不落）：${pseudoEcho.length} 筆`);

  console.log('\n=== 將落盤 ===');
  for (const a of wouldApply) {
    console.log(`  ${a.id.padEnd(34)} 現:${a.current} + ${a.add}（${a.rule}）`);
  }
  if (SHOW_ALL && pseudoEcho.length) {
    console.log('\n=== 偽影（語意無關，不落盤，供人審）===');
    for (const p of pseudoEcho) {
      console.log(`  ${p.id.padEnd(34)} 現:${p.current} ✗${p.rejected}（${p.rule}）`);
    }
  }

  if (APPLY) {
    console.log(`\n✅ 已落盤 ${wouldApply.length} 筆 categories[] 至 registry/tools.json`);
  } else {
    console.log(`\n（唯讀模式。加 --apply 正式落盤；加 --show-all 連偽影也列出）`);
  }
}

main();
