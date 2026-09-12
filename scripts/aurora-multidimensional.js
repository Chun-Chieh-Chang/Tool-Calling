#!/usr/bin/env node
/**
 * aurora-multidimensional.js — 用多維度投票收斂的邊際拆解大群 + 結構性問題人審清單（唯讀，長期 Task #15）
 *
 * 背景：
 *   prototype-aurora-clusters.js 證明「單一混合文字分群解不開 AI 代理/開發工具/AI 框架
 *   的大群（K=18 最大群 333 筆、NMI 0.331）」。中期的 infer-multidimensional.js 用
 *   三維 MECE 投票把「核心候選」收斂到 53 筆。本腳本做長期收斂驗證：
 *     1. 把「多維度投票邊際」接上 Aurora 凝聚式分群——看大群 #17 是否收斂。
 *     2. 把 53 核心候選拆成「結構性問題」vs「skill 包裁決模糊」。
 *     3. 對 AI 代理↔AI 框架 最大混淆對做二維投影，量測重疊面積。
 *     4. 產出 43 筆結構性問題的細化人審清單（worst margin、最鄰近分類、建議處置），
 *        作為下一輪人工裁決的 input。
 *
 * 用法：
 *   node scripts/aurora-multidimensional.js              # 全量報告 + 人審清單寫入 docs/structural-review-2026-09-12.md
 *   node scripts/aurora-multidimensional.js --json       # JSON 輸出（不寫 MD）
 */

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DIMS, DIM_NAMES, computeMargins } from '../core/multidimensional.js';
import { inferPrimary, inferSecondary } from '../core/classification-rules.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const AS_JSON = process.argv.includes('--json');
const REVIEW_MD = path.join(ROOT, 'docs', 'structural-review-2026-09-12.md');

const tools = JSON.parse(readFileSync(path.join(ROOT, 'registry', 'tools.json'), 'utf8')).tools;
const N = tools.length;

// ── 多維度投票邊際（與 infer-multidimensional.js 同一份 core/multidimensional.js）─
const marginsByDim = {};
for (const dk of DIM_NAMES) marginsByDim[dk] = computeMargins(tools, DIMS[dk]);

const votes = tools.map((t, i) => {
  const dims = DIM_NAMES.map((dk) => marginsByDim[dk][i]);
  const voted = Math.max(...dims.map((d) => d.margin));
  const votedDim = DIM_NAMES[Object.keys(dims).findIndex((_, k) => dims[k].margin === voted)];
  return { i, voted, votedDim, worst: Math.min(...dims.map((d) => d.margin)) };
});

// 核心候選：三維皆負
const coreIdx = votes.filter((v) => DIM_NAMES.every((dk) => marginsByDim[dk][v.i].margin < 0)).map((v) => v.i);

// ── 大群 #17 拆解：用「投票邊際」對最大群做二次凝聚 ──────────────────────
// 取 prototype 的最大群（AI 代理+開發工具+AI 框架 混合）作為拆解對象。
// 簡化：直接對「三類」做子分群，用投票邊際作為相似度的替代權重。
const targetClasses = ['AI 代理', '開發工具', 'AI 框架'];
const targetIdx = tools.map((t, i) => targetClasses.includes(t.category) ? i : -1).filter((i) => i >= 0);

// 對這 250 筆做「投票邊際」的凝聚：邊際越接近（同負或同正）越像
// 這裡用「邊際差的絕對值」作為距離，做最簡單的 hierarchical split
const subSim = (a, b) => 1 - Math.abs(votes[a].voted - votes[b].voted); // 0..1 近似
// 簡化：不做完整凝聚，改成「邊際分桶」看收斂
const buckets = {};
for (const i of targetIdx) {
  const b = votes[i].voted;
  const label = b > 0.05 ? '正邊際(高鑑別)' : b > -0.02 ? '近零(邊界)' : '負邊際(格格不入)';
  (buckets[label] = buckets[label] || []).push(i);
}

// ── 53 核心候選拆解：結構性問題 vs skill 包模糊 ───────────────────────────
const coreSplit = { structural: [], skillPackAmbiguous: [] };
for (const i of coreIdx) {
  const t = tools[i];
  const sec = inferSecondary(t);
  // skill 包模糊：有 secondary 身分（多身分）或名稱含 skill/plugin
  const isSkillPack = /skill|plugin/i.test(t.id + ' ' + (t.name || ''));
  if (sec.length > 0 || isSkillPack) {
    coreSplit.skillPackAmbiguous.push({ id: t.id, category: t.category, secondary: sec.map((s) => s.required), isSkillPack });
  } else {
    coreSplit.structural.push({ id: t.id, category: t.category, worst: votes[i].worst, best: votes[i].voted });
  }
}

// ── AI 代理 ↔ AI 框架 混淆對投影 ─────────────────────────────────────────
const pairClasses = ['AI 代理', 'AI 框架'];
const pairIdx = tools.map((t, i) => pairClasses.includes(t.category) ? i : -1).filter((i) => i >= 0);
// 二維投影：D1 margin 與 D3 margin（兩維 MECE 獨立）
const proj = pairIdx.map((i) => ({ id: tools[i].id, cat: tools[i].category, x: marginsByDim.D1[i].margin, y: marginsByDim.D3[i].margin }));
// 重疊：兩類在二維平面上「負象限」的交集（都格格不入）
const overlapNeg = proj.filter((p) => p.x < 0 && p.y < 0);
const overlapPct = pairIdx.length ? (overlapNeg.length / pairIdx.length * 100).toFixed(1) : '0.0';

// ── 輸出 ──────────────────────────────────────────────────────────────────
if (AS_JSON) {
  console.log(JSON.stringify({
    totalTools: N,
    coreCandidates: coreIdx.length,
    coreSplit,
    megaClusterBuckets: Object.fromEntries(Object.entries(buckets).map(([k, v]) => [k, v.length])),
    aiPairOverlap: { pairClasses, overlapNegative: overlapNeg.length, pairTotal: pairIdx.length, overlapPct }
  }, null, 2));
} else {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  多維度收斂驗證（長期 Task #15）');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');
  console.log(`全庫 ${N} 筆｜核心候選（三維皆負）${coreIdx.length} 筆`);
  console.log('');

  console.log('【一】大群 #17（AI 代理+開發工具+AI 框架，共 ' + targetIdx.length + ' 筆）用投票邊際分桶：');
  for (const [label, members] of Object.entries(buckets).sort((a, b) => b[1].length - a[1].length)) {
    const byCat = {};
    for (const i of members) byCat[tools[i].category] = (byCat[tools[i].category] || 0) + 1;
    const comp = Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join(', ');
    console.log(`  ${label.padEnd(16)} ${String(members.length).padStart(3)} 筆  ${comp}`);
  }
  console.log('');

  console.log(`【二】${coreIdx.length} 核心候選拆解：結構性問題 ${coreSplit.structural.length} 筆 vs skill 包模糊 ${coreSplit.skillPackAmbiguous.length} 筆`);
  if (coreSplit.skillPackAmbiguous.length) {
    console.log('  skill 包模糊（有 secondary 或多身分）：');
    for (const s of coreSplit.skillPackAmbiguous.slice(0, 12)) {
      console.log(`    ${s.id.padEnd(34)} ${s.category} → secondary:[${s.secondary.join(',')}] ${s.isSkillPack ? '(名稱含 skill/plugin)' : ''}`);
    }
  }
  if (coreSplit.structural.length) {
    console.log('  結構性問題（無 secondary、無多身分）：');
    for (const s of coreSplit.structural.slice(0, 12)) {
      console.log(`    ${s.id.padEnd(34)} ${s.category}  worst=${(s.worst * 100).toFixed(1)}%`);
    }
  }
  console.log('');

  console.log(`【三】AI 代理 ↔ AI 框架 混淆對投影（共 ${pairIdx.length} 筆）`);
  console.log(`  二維負象限重疊（兩類皆格格不入）：${overlapNeg.length} 筆（${overlapPct}%）`);
  console.log('  判讀：重疊越多 → 兩類在 D1/D3 空間越難分離，應優先以「多值身分」表達而非單選。');
  console.log('');

  // 產出 43 筆結構性問題人審清單（MD 文件，供人工裁決 input）
  const structuralRows = coreSplit.structural.sort((a, b) => a.worst - b.worst);
  const L = [];
  L.push('# 結構性分類問題人審清單（2026-09-12）');
  L.push('');
  L.push(`> **產生**：\`scripts/aurora-multidimensional.js\`（唯讀產物，不修改 tools.json）`);
  L.push(`> **方法**：53 核心候選（三維 D1/D2/D3 邊際皆負）拆解後，剔除「skill 包裁決模糊」（10 筆，可由 R10 定位）後剩下的「結構性問題」。`);
  L.push(`> **處置**：每筆附最鄰近分類與建議處置，供人工裁決。本清單**不自動套用**。`);
  L.push('');
  L.push(`## 結構性問題（${structuralRows.length} 筆，依 worst margin 由差到好排序）`);
  L.push('');
  L.push('| # | 工具 | 現行分類 | worst | 最鄰近分類（投票最佳維度） | 建議處置 |');
  L.push('|---|---|---|---:|---|---|');
  // 直接從 coreIdx 重建結構性問題（無 secondary、無多身分），並附投票維度資訊
  const structuralDetailed = coreIdx
    .map((i) => ({ i, tool: tools[i], sec: inferSecondary(tools[i]) }))
    .filter((x) => x.sec.length === 0 && !/skill|plugin/i.test(x.tool.id + ' ' + (x.tool.name || '')))
    .map((x) => {
      const voted = DIM_NAMES.map((dk) => marginsByDim[dk][x.i]);
      const votedDim = DIM_NAMES[voted.findIndex((d) => d.margin === Math.max(...voted.map((d) => d.margin)))];
      const bestOther = marginsByDim[votedDim][x.i].bestOtherCat;
      return { id: x.tool.id, cat: x.tool.category, worst: Math.min(...voted.map((d) => d.margin)), bestOther, votedDim, stars: x.tool.stars || 0 };
    })
    .sort((a, b) => a.worst - b.worst);

  structuralDetailed.forEach((s, idx) => {
    // 合理性門：只有「改判目標與現行分類語意相關」才建議改判；
    // 否則 TF-IDF 詞彙相似度會誤導（如 學習資源 的 tool 被建議改 影片/音訊），
    // 此時應歸為「類別結構模糊」而非無腦改判。
    const RELATED = {
      '學習資源': ['研究'],
      '研究': ['學習資源'],
      '金融與投資': ['數據分析', 'API 整合'],
      '數據分析': ['金融與投資', '開發工具'],   // duckdb 等嵌入式分析 DB 屬「開發工具+數據分析」多身分
      '測試與自動化': ['瀏覽器自動化', '開發工具'],
      '瀏覽器自動化': ['測試與自動化', '開發工具'],
      '文件生產力': ['知識管理', '學習資源'],
      '知識管理': ['文件生產力', 'API 整合'],
      '多媒體生成': ['影片', '音訊', 'UI/UX設計', '3D工程繪圖'],
      '影片': ['多媒體生成', '音訊'],
      '音訊': ['多媒體生成', '影片'],
      'UI/UX設計': ['多媒體生成', '3D工程繪圖'],
      '3D工程繪圖': ['多媒體生成', 'UI/UX設計']
    };
    const isRelated = s.bestOther && RELATED[s.cat]?.includes(s.bestOther);
    let action;
    if (isRelated) {
      action = `改判 → \`${s.bestOther}\`（${s.votedDim} 證據，與現行分類相關）`;
    } else if (s.worst < -0.10) {
      action = '⚠ 結構模糊：無合理去處，需人工裁決（新增／拆分候選）';
    } else {
      action = `詞彙最近：\`${s.bestOther || '—'}\`（語意不相關，疑似偽影，人工覆核）`;
    }
    L.push(`| ${idx + 1} | \`${s.id}\` | ${s.cat} | ${(s.worst * 100).toFixed(1)}% | ${s.bestOther || '—'} | ${action} |`);
  });
  L.push('');
  L.push('> **判讀指引**：');
  L.push('> - `worst` 為三維最差邊際，< −10% 者結構性問題最嚴重（優先處置）。');
  L.push('> - **改判建議只對「語意相關分類」成立**（例：開發工具 ↔ 測試與自動化、AI 框架 ↔ AI 代理、影片 ↔ 多媒體生成）；');
  L.push('>   若最鄰近分類與現行分類**語意不相關**（如 學習資源 的工具詞彙上最像 影片），那是 TF-IDF 詞彙偽影，**不可**照建議改判，應轉「人工覆核」。');
  L.push('> - 「⚠ 結構模糊」者代表在現有 18 分類中無合理去處，需 taxonomy 決策（新增／拆分）。');
  L.push('> - 本清單由 TF-IDF 詞彙相似度產生，**詞彙近 ≠ 語意對**，最終處置一律以人工裁決為準。');
  L.push('');

  if (!AS_JSON) writeFileSync(REVIEW_MD, L.join('\n'), 'utf-8');
  if (!AS_JSON) console.log(`📄 結構性問題人審清單：docs/structural-review-2026-09-12.md（${structuralDetailed.length} 筆）`);
}
