import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadWiki,
  buildWikiIndex,
  getWikiIndex,
  wikiScore,
  wikiGraphStats,
  __resetWikiCache,
} from '../core/wiki-matcher.js';
import { tokenize, bagOf } from '../core/tokenize.js';
import { agentRetrieve, DIM_WEIGHTS } from '../core/agent-retrieval.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const MISSING = path.join(ROOT, 'registry', '__definitely-not-here__.json');

// ── 小詞檔 ─────────────────────────────────────────────────────────────────
const SMALL_WIKI = {
  version: '1.0.0',
  entries: {
    cadquery: {
      intents: ['齒輪的齒數改了整組尺寸要自動跟著變', '用程式碼畫出可以改參數的 3D 零件'],
      objects: ['3D 模型', 'STEP', 'STL'],
      actions: ['建模', '參數化'],
      constraints: ['Python'],
      negative: [],
    },
    stirling: {
      intents: ['把 PDF 合併成一份', 'PDF 要轉成 Word 才能編輯'],
      objects: ['PDF', 'Word'],
      actions: ['合併', '轉換'],
      constraints: ['Docker'],
      negative: [],
    },
    unrelated: {
      intents: ['想知道這個週末哪裡有大型演唱會'],
      objects: ['演唱會'],
      actions: ['查詢'],
      constraints: [],
      negative: [],
    },
  },
};

// ── 詞檔載入 ───────────────────────────────────────────────────────────────

test('wiki-matcher: 詞檔不存在時回傳 null（V5 停用，不是拋錯）', () => {
  assert.equal(loadWiki(MISSING), null);
});

test('wiki-matcher: 詞檔損壞時回傳 null', async () => {
  const { writeFileSync, unlinkSync, mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const dir = mkdtempSync(path.join(tmpdir(), 'wiki-bad-'));
  const p = path.join(dir, 'bad.json');
  writeFileSync(p, '{ this is not json');
  assert.equal(loadWiki(p), null);
  try { unlinkSync(p); } catch { /* 清理失敗不影響測試結果 */ }
});

test('wiki-matcher: 空詞檔回傳 null', () => {
  assert.equal(loadWiki(path.join(ROOT, 'package.json')), null); // 有內容但沒有 entries
});

// ── 索引 ───────────────────────────────────────────────────────────────────

test('wiki-matcher: buildWikiIndex 對每筆詞條建立詞袋', () => {
  const idx = buildWikiIndex(SMALL_WIKI);
  assert.ok(idx);
  assert.equal(idx.ids.length, 3);
  assert.ok(idx.intentBags.get('cadquery').size > 0);
  assert.equal(idx.intentBags.get('unrelated').size > 0, true);
});

test('wiki-matcher: index 為 null 時 wikiScore 回傳 null', () => {
  assert.equal(wikiScore('齒輪', null), null);
});

test('wiki-matcher: 空查詢回傳 null', () => {
  const idx = buildWikiIndex(SMALL_WIKI);
  assert.equal(wikiScore('', idx), null);
});

// ── 配對邏輯 ───────────────────────────────────────────────────────────────

test('wiki-matcher: 查詢命中詞條時該工具 V5 高於無關工具', () => {
  const idx = buildWikiIndex(SMALL_WIKI);
  const r = wikiScore('齒輪的齒數改了尺寸要跟著變', idx);
  assert.ok(r.get('cadquery').V5 > r.get('unrelated').V5,
    `cadquery=${r.get('cadquery').V5} 應 > unrelated=${r.get('unrelated').V5}`);
  assert.ok(r.get('cadquery').V5 > 0);
});

test('wiki-matcher: 命中時回傳 matched intent 供 UI 顯示理由', () => {
  const idx = buildWikiIndex(SMALL_WIKI);
  const r = wikiScore('齒輪的齒數改了尺寸要跟著變', idx);
  assert.ok(r.get('cadquery').intent.length > 0, '應回傳命中的 intent 文字');
});

test('wiki-matcher: 完全不同的查詢不應產生 V5 訊號', () => {
  const idx = buildWikiIndex(SMALL_WIKI);
  const r = wikiScore('zzzz qqqq xxxx', idx);
  for (const v of r.values()) assert.equal(v.V5, 0);
});

// ── 知識圖譜一階擴散 ───────────────────────────────────────────────────────
//
// 圖譜門檻是 MIN_COOC=3 且 df 上限 = 6% × N，所以小詞檔無法觸發擴散。
// 這裡程式化產生 70 筆詞條；其中 3 筆同時含「齒輪」與「參數」，
// 另一筆（target）只含「參數」。查詢只說「齒輪」，
// 直接比對 target = 0，走圖譜擴散後 > 0。
function buildGraphFixture() {
  const entries = {};
  for (let i = 0; i < 3; i++) {
    entries[`co${i}`] = { intents: ['齒輪 參數 設計'], objects: [], actions: [] };
  }
  entries.target = { intents: ['參數 模型 尺寸'], objects: [], actions: [] };
  for (let i = 0; i < 66; i++) {
    entries[`fill${i}`] = { intents: [`填充詞 ${i} 天氣 預報`], objects: [], actions: [] };
  }
  return { version: '1.0.0', entries };
}

test('wiki-matcher: 知識圖譜擴散能橋接「字面沒出現」的詞彙', () => {
  const idx = buildWikiIndex(buildGraphFixture());
  assert.equal(idx.ids.length, 70);

  const direct = wikiScore('齒輪', idx, { enableGraph: false });
  const viaGraph = wikiScore('齒輪', idx, { enableGraph: true });

  assert.equal(direct.get('target').V5, 0, '停用圖譜時 target 不該有分數（字面無重疊）');
  assert.ok(viaGraph.get('target').V5 > 0, '啟用圖譜後 target 應透過「齒輪→參數」邊拿到分數');
});

test('wiki-matcher: 圖譜統計可回報節點與邊數', () => {
  const idx = buildWikiIndex(buildGraphFixture());
  const g = wikiGraphStats(idx);
  assert.ok(g.nodes > 0, `節點數應 > 0，實際 ${g.nodes}`);
  assert.ok(g.edges > 0, `邊數應 > 0，實際 ${g.edges}`);
  assert.equal(g.entries, 70);
});

test('wiki-matcher: 萬用詞不做擴散（df 超過門檻）', () => {
  // 所有 70 筆都含「資料」→ df=70，遠超 6% × 70 = 4 的門檻，不應被擴散
  const entries = {};
  for (let i = 0; i < 70; i++) {
    entries[`t${i}`] = { intents: [`資料 處理 ${i}`], objects: [], actions: [] };
  }
  const idx = buildWikiIndex({ version: '1.0.0', entries });
  const r = wikiScore('資料', idx, { enableGraph: true });
  // 「資料」本身 df 過高 → 不擴散；但直接比對仍會命中（這是對的行為）
  assert.ok(r.get('t0').V5 > 0, '直接命中仍應有分數');
  assert.ok(idx.cooc.size === 0 || !idx.cooc.has('資料'), '萬用詞不應出現在圖譜擴散表裡');
});

// ── 與四維引擎的整合 ───────────────────────────────────────────────────────

const TOOLS = [
  { id: 'cadquery', name: 'cadquery', category: '3D工程繪圖', status: 'active',
    description: 'Parametric 3D CAD scripting framework',
    description_zh: '參數化 3D CAD 腳本框架',
    triggers: ['3d 建模', '參數化建模'], capabilities: ['3d-modeling'],
    install: { method: 'pip' }, language: 'Python' },
  { id: 'stirling', name: 'stirling-pdf', category: '文件處理', status: 'active',
    description: 'PDF manipulation toolkit',
    description_zh: 'PDF 處理工具箱',
    triggers: ['pdf 合併', 'pdf 轉換'], capabilities: ['pdf'],
    install: { method: 'docker' }, language: 'Java' },
  { id: 'playwright', name: 'playwright', category: '開發工具', status: 'active',
    description: 'Browser automation for end-to-end tests',
    description_zh: '瀏覽器自動化端到端測試框架',
    triggers: ['e2e 測試', '瀏覽器自動化'], capabilities: ['browser-automation'],
    install: { method: 'npm' }, language: 'JavaScript' },
];

test('V5：詞條命中時能改變排序（新維度真的有作用）', () => {
  const q = '齒輪的齒數跟模數一改整組尺寸自動跟著變';
  // 沒進候選（被 bestDim > 0 過濾掉）視為最差，給一個大數
  const rankOf = (r) => { const i = r.topK.findIndex((x) => x.id === 'cadquery'); return i < 0 ? 999 : i; };
  const without = agentRetrieve(TOOLS, q, { topK: 3, wiki: null });
  const withWiki = agentRetrieve(TOOLS, q, { topK: 3, wiki: SMALL_WIKI });

  const cad = withWiki.topK.find((x) => x.id === 'cadquery');
  assert.ok(cad, 'cadquery 應在候選內');
  assert.ok(cad.perDimension.V5 > 0,
    `cadquery 應因詞條命中而得到 V5 分數，實際 ${JSON.stringify(cad.perDimension)}`);
  assert.ok(rankOf(withWiki) < rankOf(without),
    `啟用詞檔後 cadquery 排名應前移（${rankOf(without)} → ${rankOf(withWiki)}）`);
  assert.equal(without.topK[0].perDimension.V5, undefined, '停用時不該出現 V5 欄位');
});

test('V5：詞檔存在但全部無關時，排序與無詞檔完全一致（零回歸保證）', () => {
  const irrelevant = {
    version: '1.0.0',
    entries: {
      // 故意放一個與所有查詢都無關的詞條
      noise: { intents: ['想知道這個週末哪裡有大型演唱會'], objects: ['演唱會'], actions: ['查詢'] },
    },
  };
  for (const q of [
    '把 PDF 合併成一份',
    '跑瀏覽器端到端測試',
    '用程式碼做參數化 3D 建模',
    'scrape a JS-rendered dashboard and extract tables',
  ]) {
    const a = agentRetrieve(TOOLS, q, { topK: 3, wiki: null }).topK.map((x) => x.id);
    const b = agentRetrieve(TOOLS, q, { topK: 3, wiki: irrelevant }).topK.map((x) => x.id);
    assert.deepEqual(b, a, `查詢「${q}」在詞檔無關時排序不該改變`);
  }
});

test('V5：五維權重加總 = 1，且 V1~V4 維持原始相對比例（零回歸的前提）', () => {
  const sum = DIM_WEIGHTS.V1 + DIM_WEIGHTS.V2 + DIM_WEIGHTS.V3 + DIM_WEIGHTS.V4 + DIM_WEIGHTS.V5;
  assert.ok(Math.abs(sum - 1) < 1e-9, `五維權重加總應 = 1，實際 ${sum}`);
  // V1~V4 必須是原比例 0.30 : 0.35 : 0.20 : 0.15 的等比縮放，
  // 否則「V5 = 0」時排序也會跟著變，就不是零回歸了。
  const scale = 1 - DIM_WEIGHTS.V5;
  for (const [k, base] of [['V1', 0.30], ['V2', 0.35], ['V3', 0.20], ['V4', 0.15]]) {
    assert.ok(Math.abs(DIM_WEIGHTS[k] - base * scale) < 1e-9,
      `${k} 應 = ${base} × ${scale}，實際 ${DIM_WEIGHTS[k]}`);
  }
});

test('V5：無詞檔時不產生 matchedIntent', () => {
  const r = agentRetrieve(TOOLS, '把 PDF 合併成一份', { topK: 3, wiki: null });
  assert.equal(r.topK[0].matchedIntent, undefined);
});

// ── 共用斷詞（兩引擎必須同源）──────────────────────────────────────────────

test('tokenize：中英混合斷詞規則（bigram + 停用詞）', () => {
  assert.deepEqual(tokenize('瀏覽器'), ['瀏覽', '覽器']);
  const t = tokenize('convert a PDF to markdown');
  assert.ok(t.includes('convert'));
  assert.ok(t.includes('pdf'));
  assert.ok(!t.includes('to'), '停用詞 to 不該出現');
  assert.deepEqual(tokenize(''), []);
});

test('tokenize：bagOf 計數正確', () => {
  const b = bagOf(['a', 'a', 'b']);
  assert.equal(b.get('a'), 2);
  assert.equal(b.get('b'), 1);
});

// ── 快取 ───────────────────────────────────────────────────────────────────

test('wiki-matcher: getWikiIndex 對同一詞檔回傳同一份索引（有快取）', () => {
  __resetWikiCache();
  const a = getWikiIndex(SMALL_WIKI, MISSING); // 檔案不存在 → 走 inmemory key
  const b = getWikiIndex(SMALL_WIKI, MISSING);
  assert.equal(a, b, '同一份詞檔不該重建索引');
  __resetWikiCache();
});

// ── 認識論標記（Epistemic Markers）─────────────────────────────────────────
// 來自 LLM Wiki Blueprint 第 10 頁「建立信任層」：AI 會產生幽靈連結，
// 所以要標記內容是「直接取自來源」還是「AI 推論」，讓下游知道可信度。
test('wiki-matcher: 比對結果帶出認識論標記（V=Sourced／S=Synthesized）', () => {
  const wiki = {
    version: '1.0.0',
    entries: {
      sourced: { intents: ['把 PDF 轉成 Markdown'], objects: [], actions: [], epistemic: 'V' },
      synth: { intents: ['把 PDF 轉成 Markdown'], objects: [], actions: [], epistemic: 'S' },
      unmarked: { intents: ['把 PDF 轉成 Markdown'], objects: [], actions: [] },
    },
  };
  __resetWikiCache();
  const r = wikiScore('把 PDF 轉成 Markdown', buildWikiIndex(wiki), { enableGraph: false });
  assert.equal(r.get('sourced').epistemic, 'V', '取自 metadata 者應標 V');
  assert.equal(r.get('synth').epistemic, 'S', 'LLM 推論者應標 S');
  assert.equal(r.get('unmarked').epistemic, '', '未標記者應回傳空字串而非 undefined');
  __resetWikiCache();
});
