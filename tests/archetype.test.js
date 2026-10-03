import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { agentRetrieve } from '../core/agent-retrieval.js';

// ── matchArchetypes：純函式 ──────────────────────────────────────────────
test('matchArchetypes：中英 pattern 命中、多原型取聯集、無命中回空集', async () => {
  const { matchArchetypes } = await import('../core/archetype.js');
  const archetypes = [
    { id: 'a1', patterns: ['逐字稿', 'transcript'], tools: ['t-whisper', 't-yt'] },
    { id: 'a2', patterns: ['簡報'], tools: ['t-ppt'] },
    { id: 'a3', patterns: ['speech to text'], tools: ['t-whisper'] },
  ];
  const zh = matchArchetypes('我想把 YouTube 影片轉成逐字稿', archetypes);
  assert.deepEqual([...zh].sort(), ['t-whisper', 't-yt']);
  const multi = matchArchetypes('transcript 摘要簡報', archetypes);
  assert.deepEqual([...multi].sort(), ['t-ppt', 't-whisper', 't-yt']);
  assert.equal(matchArchetypes('完全無關的查詢', archetypes).size, 0);
});

test('matchArchetypes：畸形條目跳過不拋錯', async () => {
  const { matchArchetypes } = await import('../core/archetype.js');
  const archetypes = [
    { id: 'bad1', tools: ['x'] },                       // 沒有 patterns
    { id: 'bad2', patterns: 'not-an-array', tools: ['y'] },
    { id: 'ok', patterns: ['mark'], tools: ['z'] },
  ];
  const m = matchArchetypes('has mark inside', archetypes);
  assert.deepEqual([...m], ['z']);
});

// ── loadArchetypes：env 覆寫 + 損壞檔案停用 ─────────────────────────────
test('loadArchetypes：檔案不存在回 null（停用零回歸）', async () => {
  process.env.ARCHETYPE_FILE = path.join(tmpdir(), 'definitely-missing-archetypes.json');
  const { loadArchetypes } = await import('../core/archetype.js');
  assert.equal(loadArchetypes(), null);
  delete process.env.ARCHETYPE_FILE;
});

// ── 整合：原型命中把正解從同分群拉出（合成註冊表）───────────────────────
test('原型提升：兩支同分工具中，被原型映射者勝出', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'arch-'));
  const file = path.join(dir, 'archetypes.json');
  writeFileSync(file, JSON.stringify([
    { id: 'mark-arch', patterns: ['zzmark'], tools: ['tool-b'] },
  ]));
  process.env.ARCHETYPE_FILE = file;

  try {
    // 動態 import 延後到 env 設定後（module 層讀 env）
    const { agentRetrieve: freshRetrieve } = await import('../core/agent-retrieval.js');
    const mk = (id) => ({
      id,
      name: id,
      description: 'zzmark capable productivity tool for teams',
      useCase: 'zzmark workflows',
      category: '開發工具',
      triggers: ['zzmark'],
      capabilities: [],
      negativeConstraints: [],
    });
    const r = freshRetrieve([mk('tool-a'), mk('tool-b')], 'zzmark workflow', { topK: 2, wiki: false });
    assert.equal(r.topK.length, 2);
    assert.equal(r.topK[0].id, 'tool-b', `實際排序：${r.topK.map((x) => x.id).join(', ')}`);
    assert.ok(r.topK[0].reasons.some((s) => s.includes('意圖原型')), '應顯示原型命中原因');
  } finally {
    rmSync(dir, { recursive: true, force: true });
    delete process.env.ARCHETYPE_FILE;
  }
});

// ── 真實檔案健全性 ───────────────────────────────────────────────────────
test('真實 intent-archetypes.json 載入：26 家族', async () => {
  const { loadArchetypes } = await import('../core/archetype.js');
  const archetypes = loadArchetypes();
  assert.ok(archetypes, '真實原型檔應存在');
  assert.equal(archetypes.length, 26);
});
