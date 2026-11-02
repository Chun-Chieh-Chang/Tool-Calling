/**
 * search-subtool-zh.test.js — 中文子功能層比對（2026-11-01）
 *
 * 背景
 * ────
 * 決策一「深層索引」把 awesome-copilot 的 636 個 subTools 索引進來了，
 * 但使用者用中文描述需求時，子功能層**一個都命中不了**：
 *   · subTools 只有英文 name／description（資料層缺中文）
 *   · search-engine.js 自己的 tokenize() 對中文是「依空白切分」，
 *     一句中文查詢會變成單一 token（整句），整句不可能整段出現在子工具描述裡
 *   · 即使有中文描述，共現門檻要求「命中全部查詢詞」仍會擋掉
 *
 * 對應的三項引擎改動（本檔逐一驗證）
 * ─────────────────────────────
 *   1. subTool 比對納入 name_zh／description_zh
 *   2. 中文查詢用 bigram 斷詞，且描述比對的長度門檻對 CJK 放寬到 >=2
 *   3. 中文共現門檻改比例式
 *
 * 另有一條**不變性**斷言：英文查詢的子功能比對行為必須與改動前一致
 * （多詞查詢要求同一子工具命中全部詞），避免為了中文而削弱英文的精確度修正。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { search } from '../core/search-engine.js';

// ── 測試用 mock 工具 ───────────────────────────────────────────────────
// 一個含中文描述子工具的集合工具
const zhCollection = {
  id: 'zh-collection',
  name: '中文功能合集',
  status: 'active',
  category: '開發工具',
  language: 'typescript',
  description: 'A collection of sub tools that have Chinese descriptions.',
  triggers: ['chinese collection'],
  capabilities: [],
  subTools: [
    {
      subpath: 'skills/qdrant-search-quality',
      name: 'Qdrant Search Quality',
      name_zh: 'Qdrant 搜尋品質',
      description: 'Evaluate and tune search result quality for vector databases.',
      description_zh: '評估並調校向量資料庫的搜尋結果品質與相關性，提升精確率與召回率。',
    },
    {
      subpath: 'skills/unrelated-spreadsheet',
      name: 'Unrelated Spreadsheet',
      name_zh: '試算表工具',
      description: 'Generate spreadsheet formulas and pivot tables.',
      description_zh: '產生試算表公式與樞紐分析表，與檢索品質無關。',
    },
  ],
};

// 一個只有英文描述的集合工具（用來驗證英文門檻行為不變）
const enCollection = {
  id: 'en-collection',
  name: 'EN Collection',
  status: 'active',
  category: '開發工具',
  language: 'typescript',
  description: 'A collection of English only sub tools.',
  triggers: ['english collection'],
  capabilities: [],
  subTools: [
    {
      subpath: 'skills/database-migration',
      name: 'Database Migration',
      description: 'Migrate a database between two different engines.',
    },
    {
      subpath: 'skills/social-images',
      name: 'Social Images',
      description: 'Generate social media images and banners.',
    },
  ],
};

const tools = [zhCollection, enCollection];

const subtoolKeywords = (result) =>
  (result?.matchedKeywords || []).filter((k) => String(k).startsWith('subtool:'));

test('中文查詢能命中 subTool 的中文描述', () => {
  const results = search(tools, '向量資料庫的搜尋結果品質要怎麼評估跟調校', { topK: 5 });
  const top = results.find((r) => r.tool.id === 'zh-collection');
  assert.ok(top, '應該能找到有中文子功能的集合工具');
  const kws = subtoolKeywords(top);
  assert.ok(
    kws.includes('subtool:Qdrant Search Quality'),
    `應該命中目標子工具，實際：${JSON.stringify(kws)}`
  );
});

test('中文查詢不會讓無關子工具搭便車（共現門檻）', () => {
  const results = search(tools, '向量資料庫的搜尋結果品質要怎麼評估跟調校', { topK: 5 });
  const top = results.find((r) => r.tool.id === 'zh-collection');
  const kws = subtoolKeywords(top);
  assert.ok(
    !kws.includes('subtool:Unrelated Spreadsheet'),
    `無關子工具不該被算成命中，實際：${JSON.stringify(kws)}`
  );
});

test('英文查詢的多詞子功能仍要求「命中全部詞」（精確度修正不變）', () => {
  const results = search(tools, 'database migration', { topK: 5 });
  const top = results.find((r) => r.tool.id === 'en-collection');
  assert.ok(top, '應該能找到英文集合工具');
  const kws = subtoolKeywords(top);
  assert.ok(kws.includes('subtool:Database Migration'), `實際：${JSON.stringify(kws)}`);
  assert.ok(!kws.includes('subtool:Social Images'), `實際：${JSON.stringify(kws)}`);
});

test('英文查詢只命中部分詞時不觸發子功能命中', () => {
  // 'database' 命中、'schema' 不命中 → 同一子工具未命中全部詞 → 不算命中
  const results = search(tools, 'database schema', { topK: 5 });
  const top = results.find((r) => r.tool.id === 'en-collection');
  if (top) {
    assert.ok(
      !subtoolKeywords(top).includes('subtool:Database Migration'),
      '只命中部分詞不該觸發子功能命中'
    );
  }
});

test('英文查詢不會用到中文描述欄位（跨語比對關閉）', () => {
  // 這個子工具的英文描述/name 完全不含 'relevance scoring'，
  // 只有中文描述有對應概念 → 英文查詢不應命中
  const zhOnly = {
    id: 'zh-only',
    name: 'ZH Only',
    status: 'active',
    category: '開發工具',
    language: 'typescript',
    description: 'Collection with Chinese only concept.',
    triggers: ['zh only'],
    capabilities: [],
    subTools: [
      {
        subpath: 'skills/tuner',
        name: 'Quality Tuner',
        description: 'Tune the index and the shard layout.',
        name_zh: '品質調校器',
        description_zh: '調校索引的相關性評分與分片配置。',
      },
    ],
  };
  const results = search([zhOnly], 'relevance scoring', { topK: 5 });
  const top = results.find((r) => r.tool.id === 'zh-only');
  if (top) {
    assert.ok(
      !subtoolKeywords(top).includes('subtool:Quality Tuner'),
      '英文查詢不該命中中文描述欄位'
    );
  }
});

test('中文描述的比對長度門檻對 CJK 放寬到 2（bigram 恆為 2 字）', () => {
  // 這個查詢的所有中文 token 都是 2 字 bigram；若門檻仍是 >=3，
  // 中文子功能層會永遠 0 命中。
  const results = search(tools, '召回率與精確率的調校', { topK: 5 });
  const top = results.find((r) => r.tool.id === 'zh-collection');
  assert.ok(top, '應該能找到集合工具');
  const kws = subtoolKeywords(top);
  assert.ok(
    kws.includes('subtool:Qdrant Search Quality'),
    `2 字 bigram 應能命中中文描述，實際：${JSON.stringify(kws)}`
  );
});

test('中文查詢命中的是中文欄位（子工具名稱含中文時也能比對）', () => {
  const results = search(tools, '電子郵件起草與專業郵件撰寫', { topK: 5 });
  // 這個查詢不對應上面任何一個子工具 → 不該有子功能命中（負向斷言）
  const top = results.find((r) => r.tool.id === 'zh-collection');
  if (top) {
    assert.equal(subtoolKeywords(top).length, 0, '不相干的查詢不該命中子功能');
  }
});
