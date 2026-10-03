import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRecipes, matchRecipe } from '../core/recipes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── 真實配方庫的資料完整性 ───────────────────────────────────────────────
test('真實 recipes.json：3 條配方、全部 validated、每個 step.toolId 都存在於 registry', () => {
  const recipes = loadRecipes();
  assert.ok(recipes, '配方庫應可載入');
  assert.equal(recipes.length, 3);
  for (const r of recipes) {
    assert.equal(r.validated, true, `${r.id} 必須是人工驗證配方`);
    for (const s of r.steps) {
      assert.ok(s.toolId, `${r.id} 的步驟缺 toolId`);
    }
  }
  // toolId 存在性對 registry 驗證
  const reg = JSON.parse(readFileSync(path.join(__dirname, '..', 'registry', 'tools.json'), 'utf8'));
  const ids = new Set(reg.tools.map((t) => t.id));
  for (const r of recipes) {
    for (const s of r.steps) {
      assert.ok(ids.has(s.toolId), `${r.id} 引用了不存在的工具：${s.toolId}`);
    }
  }
});

// ── 匹配行為 ─────────────────────────────────────────────────────────────
test('matchRecipe：複合意圖查詢命中對應配方', () => {
  const recipes = loadRecipes();
  const r1 = matchRecipe('把這部影片的內容轉成逐字稿，然後幫我做重點摘要', recipes);
  assert.equal(r1.id, 'video-transcript-summary');
  const r2 = matchRecipe('抓取這個網站的所有文件，建立一個可以問答的 rag 知識庫', recipes);
  assert.equal(r2.id, 'scrape-to-rag');
  const r3 = matchRecipe('把這份年度報告轉成簡報', recipes);
  assert.equal(r3.id, 'markdown-to-slides');
});

test('matchRecipe：無命中回 null', () => {
  const recipes = loadRecipes();
  assert.equal(matchRecipe('幫我寫一首詩', recipes), null);
  assert.equal(matchRecipe('', recipes), null);
});

// ── 載入防禦 ─────────────────────────────────────────────────────────────
test('loadRecipes：檔案不存在回 null', async () => {
  process.env.RECIPES_FILE = path.join(tmpdir(), 'definitely-missing-recipes.json');
  try {
    assert.equal(loadRecipes(), null);
  } finally {
    delete process.env.RECIPES_FILE;
  }
});

test('loadRecipes：未驗證（validated !== true）的配方不上線；非法 regex 該條丟棄', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'recipes-'));
  const file = path.join(dir, 'recipes.json');
  writeFileSync(file, JSON.stringify({
    recipes: [
      { id: 'unvalidated', patterns: ['zzq'], steps: [{ order: 1, toolId: 'x' }] },
      { id: 'badregex', validated: true, patterns: ['[unclosed'], steps: [{ order: 1, toolId: 'x' }] },
      { id: 'ok', validated: true, patterns: ['zzok', '[unclosed'], steps: [{ order: 1, toolId: 'x' }] },
    ],
  }));
  process.env.RECIPES_FILE = file;
  try {
    const recipes = loadRecipes();
    assert.deepEqual(recipes.map((r) => r.id), ['ok'], '只應剩下驗證過且 pattern 合法的配方');
    assert.deepEqual(recipes[0].patterns, ['zzok']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    delete process.env.RECIPES_FILE;
  }
});
