#!/usr/bin/env node
/**
 * 樣板黑名單門禁：registry/tools.json 的敘述欄位不得出現已知樣板句。
 *
 * 🔴 為什麼需要（2026-09-27 污染事件，DEV_LOG 有完整記錄）：
 *   兩個不同的產生器（scan-tool.js、trending-weekly.js）各自寫入了
 *   「初次收錄建議人工審查…」「由自動化探勘入庫，建議人工審查…」等
 *   萬用句，共污染 108 支工具，且 metadata quality 當時給了滿分——
 *   品質分數測不出樣板。本門禁補上這個洞。
 *
 *   教訓：「同一個缺陷類別可能有多個寫入點」，所以這裡掃全欄位，
 *   不針對特定產生器的輸出欄位。新增產生器時，把它的樣板句加進 BOILERPLATE。
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REGISTRY = path.join(__dirname, '..', 'registry', 'tools.json');

// 已知的萬用句（2026-09-27 清理的 108 支來自前兩條）。
// 判準：對任何工具都成立的話 = 假文字；發現新的就加進來。
const BOILERPLATE = [
  '初次收錄建議人工審查',
  '由自動化探勘入庫，建議人工審查',
  '詳細安裝指令需依官方 README 為準',
];

const FIELDS = ['description', 'useCase', 'advantages', 'negativeConstraints'];

const registry = JSON.parse(readFileSync(REGISTRY, 'utf8'));
const failures = [];
for (const tool of registry.tools) {
  for (const field of FIELDS) {
    const values = Array.isArray(tool[field]) ? tool[field] : [tool[field]];
    for (const v of values) {
      if (typeof v !== 'string') continue;
      for (const bp of BOILERPLATE) {
        if (v.includes(bp)) {
          failures.push(`${tool.id} .${field}: 含樣板「${bp}…」`);
        }
      }
    }
  }
}

if (failures.length > 0) {
  console.error(`❌ [Template Guard] ${failures.length} 筆欄位含萬用樣板句（假文字不得進檢索向量）：`);
  for (const f of failures.slice(0, 20)) console.error(`  · ${f}`);
  if (failures.length > 20) console.error(`  · …共 ${failures.length} 筆`);
  process.exit(1);
}
console.log(`✅ [Template Guard] ${registry.tools.length} 筆工具無樣板句污染`);
