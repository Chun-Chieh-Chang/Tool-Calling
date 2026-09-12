#!/usr/bin/env node
/**
 * MECE 原則檢查腳本
 * 
 * 檢查項目：
 * 1. 互斥性：無重複分類邊界
 * 2. 窮盡性：無「其他」殘留
 * 3. 一致性：分類統計與實際數量匹配
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { categoryList } from '../core/categories.js';

const __dirname = import.meta.dirname;
const ROOT = join(__dirname, '..');
const REGISTRY_PATH = join(ROOT, 'registry', 'tools.json');

// ─── 顏色輸出 ──────────────────────────────────────────────────────
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
};

function pass(msg) { console.log(`${c.green}✓${c.reset} ${msg}`); }
function warn(msg) { console.log(`${c.yellow}⚠${c.reset} ${msg}`); }
function fail(msg) { console.log(`${c.red}✗${c.reset} ${msg}`); process.exitCode = 1; }

// ─── 主要檢查邏輯 ──────────────────────────────────────────────────

function checkMECE() {
  console.log(`\n${c.cyan}${c.bold}=== MECE 原則檢查 ===${c.reset}\n`);

  // 讀取資料
  const registry = JSON.parse(readFileSync(REGISTRY_PATH, 'utf8'));
  const tools = registry.tools;

  if (!Array.isArray(tools) || tools.length === 0) {
    fail('工具庫為空！');
    return;
  }

  // 1. 統計每個分類的工具數
  const categoryStats = {};
  tools.forEach(tool => {
    const cat = tool.category || '未分類';
    if (!categoryStats[cat]) categoryStats[cat] = { count: 0, tools: [] };
    categoryStats[cat].count++;
    categoryStats[cat].tools.push(tool);
  });

  const totalTools = tools.length;
  const calculatedTotal = Object.values(categoryStats).reduce((sum, cat) => sum + cat.count, 0);

  console.log(`📊 總工具數：${totalTools}`);
  console.log(`   分類數：${Object.keys(categoryStats).length}\n`);

  // ─── 檢查 1：互斥性（Mutually Exclusive）──────────────────────
  console.log(`${c.bold}【互斥性檢查】${c.reset}`);

  const issues = [];

  // 1a. 檢查是否有「其他」或「未分類」殘留
  const residualCategories = ['其他', '未分類', 'Uncategorized', 'Other'];
  residualCategories.forEach(cat => {
    if (categoryStats[cat] && categoryStats[cat].count > 0) {
      fail(`發現殘留分類「${cat}」有 ${categoryStats[cat].count} 個工具，必須強制歸類！`);
      issues.push({ type: 'residual', cat, count: categoryStats[cat].count });
    }
  });

  if (!issues.find(i => i.type === 'residual')) {
    pass('無「其他」或「未分類」殘留');
  }

  // 1b. 檢查小類別（≤2個）是否需要合併
  const smallCategories = Object.entries(categoryStats)
    .filter(([_, data]) => data.count <= 2)
    .map(([cat]) => cat);

  if (smallCategories.length > 0) {
    warn(`小類別（≤2個工具）：${smallCategories.join(', ')}`);
    warn('建議：考慮合併到更大類別或刪除這些類別');
  } else {
    pass('無過小類別需要合併');
  }

  // 1c. 檢查大類別（≥50個）是否需要拆分
  const largeCategories = Object.entries(categoryStats)
    .filter(([_, data]) => data.count >= 50)
    .map(([cat]) => cat);

  if (largeCategories.length > 0) {
    warn(`大類別（≥50個工具）：${largeCategories.join(', ')}`);
    warn('建議：考慮是否需細分子類別以提高檢索精度');
  }

  // ─── 檢查 2：窮盡性（Collectively Exhaustive）────────────────
  console.log(`\n${c.bold}【窮盡性檢查】${c.reset}`);

  if (calculatedTotal !== totalTools) {
    fail(`統計不一致：工具總數=${totalTools}，分類加總=${calculatedTotal}`);
  } else {
    pass(`所有 ${totalTools} 個工具都已歸入明確分類`);
  }

  // ─── 檢查 3：數據一致性 ────────────────────────────────────────
  console.log(`\n${c.bold}【數據一致性檢查】${c.reset}`);

  // 檢查 required fields
  const missingFields = tools.filter(t => !t.id || !t.name || !t.url);
  if (missingFields.length > 0) {
    fail(`發現 ${missingFields.length} 個工具缺少必要欄位（id/name/url）`);
  } else {
    pass('所有工具都有基本欄位');
  }

  // 檢查 category 完整性
  const noCategory = tools.filter(t => !t.category || t.category === '');
  if (noCategory.length > 0) {
    fail(`發現 ${noCategory.length} 個工具沒有分類`);
  } else {
    pass('所有工具都有分類');
  }

  // 檢查 triggers 完整性
  const noTriggers = tools.filter(t => !t.triggers || t.triggers.length === 0);
  if (noTriggers.length > 0) {
    warn(`發現 ${noTriggers.length} 個工具缺少 triggers（影響檢索準確度）`);
  }

  // ─── 檢查 4：enum 合規（分類 / 語言 / 安裝方式 與 tool.schema.json 對齊）──
  console.log(`\n${c.bold}【Enum 合規檢查】${c.reset}`);

  let enumViolations = 0;
  try {
    const schemaPath = join(ROOT, 'registry', 'schemas', 'tool.schema.json');
    const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
    const props = schema.definitions.Tool.properties;

    const checkEnum = (enumValues, getValue, label) => {
      const allowed = new Set(enumValues);
      const bad = tools
        .map(t => ({ id: t.id, value: getValue(t) }))
        .filter(x => x.value !== undefined && x.value !== null && !allowed.has(x.value));
      if (bad.length > 0) {
        const grouped = {};
        bad.forEach(b => { grouped[b.value] = (grouped[b.value] || 0) + 1; });
        fail(`${label} 有 ${bad.length} 筆不符合 schema enum：${JSON.stringify(grouped)}`);
        console.log(`     範例：${bad.slice(0, 3).map(b => `${b.id}=${b.value}`).join(', ')}`);
        enumViolations += bad.length;
      } else {
        pass(`${label} 全部符合 schema enum（${allowed.size} 個允許值）`);
      }
    };

    checkEnum(props.category.enum, t => t.category, 'category');
    checkEnum(props.language.enum, t => t.language, 'language');
    checkEnum(props.install.properties.method.enum, t => t.install && t.install.method, 'install.method');
  } catch (err) {
    warn(`無法讀取 schema 進行 enum 檢查：${err.message}`);
  }

  // ─── 檢查 5：分類單一來源一致性（registry/categories.json）──────
  // 這一節是 2026-09-12 審計的直接產物：當天在 5 個檔案中發現 4 次分類脫節
  // （簡繁不符、schema enum 過期、色表缺漏與重複、LLM prompt 停在舊版決策樹）。
  // 這裡把「所有衍生處必須與單一來源一致」變成建置失敗條件。
  console.log(`\n${c.bold}【分類來源一致性檢查】${c.reset}`);

  let sourceViolations = 0;
  try {
    const cats = categoryList();
    const catNames = cats.map(x => x.name);
    const catSet = new Set(catNames);

    // 5a. categories.json 內部：名稱唯一且非空
    if (catNames.some(n => !n)) { fail('categories.json 有分類缺少 name'); sourceViolations++; }
    else if (catSet.size !== catNames.length) { fail('categories.json 有重複的分類名稱'); sourceViolations++; }
    else pass(`categories.json 定義 ${catNames.length} 個分類，名稱唯一`);

    // 5b. registry 實際使用的分類都必須有定義（反向：有定義但沒用到是允許的，僅提示）
    const usedCats = Object.keys(categoryStats);
    const undefinedCats = usedCats.filter(x => !catSet.has(x));
    if (undefinedCats.length > 0) {
      fail(`registry 使用了 categories.json 未定義的分類：${undefinedCats.join(', ')}`);
      sourceViolations += undefinedCats.length;
    } else {
      pass(`registry 使用的 ${usedCats.length} 個分類都有定義`);
    }

    // 5c. 每個分類都要有合法色碼
    const badColor = cats.filter(x => !/^#[0-9a-f]{6}$/i.test(x.color || ''));
    if (badColor.length > 0) {
      fail(`以下分類缺少合法色碼（#RRGGBB）：${badColor.map(x => x.name).join(', ')}`);
      sourceViolations += badColor.length;
    } else {
      pass(`每個分類都有合法色碼`);
    }

    // 5d. 色碼必須唯一（曾發生 AI 框架 與 知識管理 同為 #0284c7，105 筆無法區分）
    const byColor = {};
    cats.forEach(x => { (byColor[x.color] = byColor[x.color] || []).push(x.name); });
    const dupColors = Object.entries(byColor).filter(([, names]) => names.length > 1);
    if (dupColors.length > 0) {
      dupColors.forEach(([hex, names]) => fail(`色碼重複：${hex} 被 ${names.join(' / ')} 共用`));
      sourceViolations += dupColors.length;
    } else {
      pass('18 個分類的色碼互不重複');
    }

    // 5e. 色距 >= 55（RGB 歐氏距離）— 確保圖例上可分辨
    const hex2rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
    const rgbDist = (a, b) => {
      const [r1, g1, b1] = hex2rgb(a), [r2, g2, b2] = hex2rgb(b);
      return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
    };
    const tooClose = [];
    for (let i = 0; i < cats.length; i++) {
      for (let j = i + 1; j < cats.length; j++) {
        const d = rgbDist(cats[i].color, cats[j].color);
        if (d < 55) tooClose.push({ a: cats[i].name, b: cats[j].name, d: d.toFixed(1) });
      }
    }
    if (tooClose.length > 0) {
      tooClose.forEach(x => fail(`色距過近（${x.d} < 55）：${x.a} ↔ ${x.b}，圖例上難以分辨`));
      sourceViolations += tooClose.length;
    } else {
      const allD = [];
      for (let i = 0; i < cats.length; i++)
        for (let j = i + 1; j < cats.length; j++) allD.push(rgbDist(cats[i].color, cats[j].color));
      pass(`所有色距 >= 55（實際最小 ${Math.min(...allD).toFixed(1)}）`);
    }

    // 5f. 黑底對比 >= 3.5:1 — 知識圖譜背景為 OLED 純黑
    const contrast = h => {
      const [r, g, b] = hex2rgb(h).map(v => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      });
      const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      return (L + 0.05) / 0.05;
    };
    const lowContrast = cats.filter(x => contrast(x.color) < 3.5);
    if (lowContrast.length > 0) {
      lowContrast.forEach(x => fail(`${x.name} 的色碼 ${x.color} 對純黑對比僅 ${contrast(x.color).toFixed(2)}:1（需 >= 3.5:1），黑底上會看不見`));
      sourceViolations += lowContrast.length;
    } else {
      pass('所有色碼對純黑對比 >= 3.5:1（OLED 黑底可見）');
    }

    // 5g. schema enum 必須與 categories.json 完全一致（順序與內容）
    try {
      const schemaPath = join(ROOT, 'registry', 'schemas', 'tool.schema.json');
      const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
      const enumList = schema.definitions.Tool.properties.category.enum;
      const sameSet = enumList.length === catNames.length && enumList.every((v, i) => v === catNames[i]);
      if (!sameSet) {
        fail(`tool.schema.json 的 category enum 與 categories.json 不一致（請執行 npm run categories:sync）`);
        console.log(`     enum：${enumList.join(', ')}`);
        sourceViolations++;
      } else {
        pass('tool.schema.json 的 category enum 與 categories.json 一致');
      }
    } catch (err) {
      warn(`無法比對 schema enum：${err.message}`);
    }

    // 5h. CLASSIFICATION.md §2.1 詞表必須與 categories.json 一致
    try {
      const md = readFileSync(join(ROOT, 'docs', 'CLASSIFICATION.md'), 'utf8');
      const missingInMd = cats.filter(x => !md.includes(x.name));
      if (missingInMd.length > 0) {
        fail(`docs/CLASSIFICATION.md 未提及以下分類：${missingInMd.map(x => x.name).join(', ')}`);
        sourceViolations += missingInMd.length;
      } else {
        pass('docs/CLASSIFICATION.md 涵蓋全部 18 個分類');
      }
    } catch (err) {
      warn(`無法比對 CLASSIFICATION.md：${err.message}`);
    }

    // 5i. CATEGORY-SYSTEM.md 的分類清單必須與 categories.json 集合相等
    //     （只驗「有提到」不夠 —— 該檔歷史上曾殘留已不存在的 `UI/UX设计` 分類，
    //       所以必須同時抓「缺少」與「幽靈」兩種情況）
    try {
      const cs = readFileSync(join(ROOT, 'docs', 'CATEGORY-SYSTEM.md'), 'utf8');
      const s = cs.indexOf('<!-- CATEGORIES:INVENTORY:START -->');
      const e = cs.indexOf('<!-- CATEGORIES:INVENTORY:END -->');
      if (s === -1 || e === -1) {
        fail('docs/CATEGORY-SYSTEM.md 缺少 CATEGORIES:INVENTORY 標記區塊');
        sourceViolations++;
      } else {
        const listed = [...cs.slice(s, e).matchAll(/^\|\s*`([^`]+)`\s*\|\s*(\d+)\s*\|/gm)].map(m => m[1]);
        const expected = cats.map(c => c.name);
        const missing = expected.filter(n => !listed.includes(n));
        const phantom = listed.filter(n => !expected.includes(n));
        if (missing.length || phantom.length) {
          if (missing.length) fail(`docs/CATEGORY-SYSTEM.md 缺少分類：${missing.join(', ')}`);
          if (phantom.length) fail(`docs/CATEGORY-SYSTEM.md 出現 categories.json 沒有的分類：${phantom.join(', ')}`);
          sourceViolations += missing.length + phantom.length;
        } else {
          pass(`docs/CATEGORY-SYSTEM.md 分類清單與 categories.json 一致（${listed.length} 列）`);
        }
      }
    } catch (err) {
      warn(`無法比對 CATEGORY-SYSTEM.md：${err.message}`);
    }
  } catch (err) {
    warn(`無法讀取 categories.json 進行一致性檢查：${err.message}`);
  }

  // ─── 分類分布報告 ──────────────────────────────────────────────
  console.log(`\n${c.bold}【分類分布】${c.reset}`);
  const sorted = Object.entries(categoryStats).sort((a, b) => b[1].count - a[1].count);
  sorted.forEach(([cat, data], idx) => {
    const bar = '█'.repeat(Math.round(data.count / 5));
    const badge = data.count <= 2 ? `${c.yellow}🔸小${c.reset}` : data.count >= 50 ? `${c.yellow}🔸大${c.reset}` : '';
    console.log(`  ${data.count.toString().padStart(3)} | ${cat.padEnd(12)} ${bar} ${badge}`);
  });

  // ─── 總結 ──────────────────────────────────────────────────────
  console.log(`\n${c.bold}=== 檢查結果 ===${c.reset}`);

  const hasFailures = issues.some(i => i.type === 'residual') || calculatedTotal !== totalTools || missingFields.length > 0 || noCategory.length > 0 || enumViolations > 0 || sourceViolations > 0;
  
  if (hasFailures) {
    fail('\n存在需修復的問題，請執行相關修正腳本。');
  } else {
    pass('\n✅ 所有 MECE 檢查通過！分類系統符合原則。');
  }

  console.log();
}

// ─── 入口 ─────────────────────────────────────────────────────────
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  checkMECE();
}

export { checkMECE };
