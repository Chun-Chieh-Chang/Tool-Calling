/**
 * search-subtool-concentration.test.js
 * 守門：集合工具的子功能分數必須「專精優先」（2026-11-02）
 *
 * 🔴 為什麼需要這條守門：
 * 集合工具的子功能分數原本是「加總」，等於把「碰巧提到查詢詞的子功能數量」
 * 當成相關度。一個有 798 個 subTool 的集合，只要其中十幾個的描述出現
 * 「簡報」，加總就撞到 6 分上限，與「專用工具本身精準命中查詢」同分。
 * 鑑別力因此被稀釋 —— 這是 AGENTS.md §「擴充過度會退步」的實際案例。
 *
 * 實測危害（327 題 v1.6.0 尺子）：
 *   查詢「做簡報」→ #1 = minimax-ppt-skills（純子功能命中，raw 4.00）
 *                    #2 = ppt-master（trigger 直接命中「做簡報」，raw 7.01）
 * 證據更強的專用工具輸給了靠詞彙巧合上來的集合。
 *
 * 修法：分數由「最相關的那一個子功能」決定，其餘子功能只給 25% 權重。
 * 這條守門把那個性質鎖住，避免日後有人改回加總。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { search } from '../core/search-engine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const registry = JSON.parse(readFileSync(join(__dirname, '..', 'registry', 'tools.json'), 'utf-8'));
const registryTools = registry.tools;

// 測試用工具的共用骨架：trigger 數、capabilities 數都相同，
// 讓 maxPossible（= triggers.length × 4.5 + 2 + 5 + caps × 2 + 6）一致，
// 分數差異才真的來自子功能聚合方式。
const skeleton = {
  category: '文件生產力',
  status: 'active',
  description: 'collection of agent modules',
  capabilities: [],
  stars: 0,
  triggers: ['collection-ppt'],
};

test('專用工具的 trigger 直接命中，必須贏過集合工具的子功能碰巧命中', () => {
  const dedicated = {
    id: 'dedicated-ppt',
    name: 'Dedicated PPT',
    ...skeleton,
    triggers: ['簡報', '做簡報'],
    subTools: [],
  };
  // 20 個子功能，每個描述都含「簡報」→ 加總會撞到 6 分上限
  const collection = {
    id: 'collection-ppt',
    name: 'Collection PPT',
    ...skeleton,
    subTools: Array.from({ length: 20 }, (_, i) => ({
      name: `Skill ${i}`,
      description: `skill ${i}`,
      name_zh: `技能 ${i}`,
      description_zh: `與簡報相關的第 ${i} 個子功能說明`,
    })),
  };

  const results = search([dedicated, collection], '做簡報');
  assert.ok(results.length > 0);
  assert.equal(
    results[0].tool.id,
    'dedicated-ppt',
    '專用工具的 trigger 直接命中查詢，必須勝過只靠子功能詞彙巧合的集合工具'
  );
});

test('專精勝過稀釋：單一子功能高度相關的集合，必須勝過多個子功能各自碰巧命中的集合', () => {
  const focused = {
    id: 'focused',
    name: 'Focused',
    ...skeleton,
    subTools: [{
      name: 'Deep',
      description: 'deep',
      name_zh: '簡報產生器',
      description_zh: '簡報產生工具',
    }],
  };
  // 3 個子功能，每個都命中查詢的 2 個詞（簡報＋設計）→ 加總 = 6 分
  const diffuse = {
    id: 'diffuse',
    name: 'Diffuse',
    ...skeleton,
    subTools: ['a', 'b', 'c'].map((s) => ({
      name: s.toUpperCase(),
      description: s,
      name_zh: `${s} 技能`,
      description_zh: '簡報設計',
    })),
  };

  const results = search([focused, diffuse], '簡報產生工具');
  assert.ok(results.length > 0);
  assert.equal(
    results[0].tool.id,
    'focused',
    '單一子功能完整命中查詢的集合，必須勝過多個子功能各自只命中部分詞的集合'
  );
});

test('子功能分數不得靠「重複提及」刷分（單詞命中是巧合，不是佐證）', () => {
  const mk = (n) => ({
    id: `coll-${n}`,
    name: `Coll ${n}`,
    ...skeleton,
    subTools: Array.from({ length: n }, (_, i) => ({
      name: `S${i}`,
      description: 'x',
      description_zh: '簡報',
    })),
  });

  const one = search([mk(1)], '簡報').find((r) => r.tool.id === 'coll-1');
  const many = search([mk(30)], '簡報').find((r) => r.tool.id === 'coll-30');
  assert.ok(one && many);

  // 30 個子功能各自只重複提到「簡報」→ 單詞命中是巧合 → 廣度 = 0
  // → 兩者分數應該幾乎相同（原本的加總會讓 30 個的版本高 6 倍）
  assert.ok(
    many.score <= one.score * 1.5,
    `30 個子功能各重複提一次「簡報」的集合分數不應高於 1 個的 1.5 倍（實得 ${many.score} vs ${one.score}）`
  );
});

test('子功能分數不得靠「子功能數量多」膨脹（廣度只佔次要權重）', () => {
  const mk = (n) => ({
    id: `coll2-${n}`,
    name: `Coll2 ${n}`,
    ...skeleton,
    subTools: Array.from({ length: n }, (_, i) => ({
      name: `T${i}`,
      description: 'x',
      description_zh: '簡報設計',
    })),
  });

  const one = search([mk(1)], '簡報設計').find((r) => r.tool.id === 'coll2-1');
  const many = search([mk(30)], '簡報設計').find((r) => r.tool.id === 'coll2-30');
  assert.ok(one && many);

  // 30 個子功能都命中「簡報」「設計」兩個詞 → 廣度只計「最相關子功能未涵蓋的詞」
  // → 全部重複 → 廣度 = 0 → 兩者分數相同
  assert.ok(
    many.score <= one.score * 1.5,
    `30 個子功能各命中同樣兩個詞的集合分數不應高於 1 個的 1.5 倍（實得 ${many.score} vs ${one.score}）`
  );
});

test('真實工具庫：中文查詢「做簡報」必須回傳 ppt-master（擴大翻譯後的回歸守門）', () => {
  const results = search(registryTools, '做簡報');
  assert.ok(results.length > 0);
  assert.equal(
    results[0].tool.id,
    'ppt-master',
    'ppt-master 的 trigger 直接含「做簡報」，必須勝過集合工具的子功能命中'
  );
});

test('真實工具庫：口語化前綴清洗後仍須回傳 ppt-master', () => {
  const results = search(registryTools, '我想做簡報');
  assert.ok(results.length > 0);
  assert.equal(results[0].tool.id, 'ppt-master');
});
