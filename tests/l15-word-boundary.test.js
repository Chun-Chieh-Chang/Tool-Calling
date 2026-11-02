/**
 * l15-word-boundary.test.js — L1.5 的 trigger 命中必須對齊「完整詞」（2026-11-02）
 *
 * 問題
 * ────
 * L1.5（trigger 整串精確命中）原本用純子字串包含判定，沒有詞邊界檢查 →
 * 長詞的片段會偽命中：
 *   'wasp' ⊂ 'owasp'、'free' ⊂ 'freecad'、'java' ⊂ 'javascript'、
 *   'code' ⊂ 'codex'、'postgres' ⊂ 'postgresql'
 *
 * 為什麼這件事嚴重：L1.5 命中會**提前 return**，整條 L2／L3 管線都被跳過。
 * 實測 287 題中有 14 筆命中屬這類偽命中（影響 7 題），
 * 其中 m20「AI 代理的行為要符合 OWASP 的安全要求」被 `open-saas` 搶走
 * （因為 'wasp' 是 'owasp' 的子字串）。
 *
 * 修法：ASCII trigger 改比對「詞序列」——trigger 拆出的詞必須是查詢詞序列中
 * **連續**的一段。中文 trigger 維持原規則（中文無空白分詞，詞邊界不明確）。
 *
 * 本檔鎖住三件事：偽命中被擋、完整詞命中不被誤傷、中文 trigger 行為不變。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { search } from '../core/search-engine.js';

const mk = (id, triggers) => ({
  id,
  name: id,
  description: 'test tool',
  category: '測試',
  status: 'active',
  triggers,
  capabilities: [],
});

/** 這個查詢走了 L1.5 路徑嗎？（matchLevel 會記錄） */
const l15Ids = (tools, query) =>
  search(tools, query, { topK: 5 }).filter((r) => r.matchLevel === 'L1.5-trigger-exact').map((r) => r.tool.id);

test('L1.5：trigger 是長詞的片段時不應命中（java ⊂ javascript）', () => {
  const tools = [
    mk('stirling-pdf', ['java']),
    mk('js-helper', ['javascript']),
  ];
  const hits = l15Ids(tools, '抓一個用 JavaScript 動態產生內容的網頁');
  assert.ok(!hits.includes('stirling-pdf'), `'java' 不該命中 'javascript'，實際命中：${hits.join(', ')}`);
  assert.ok(hits.includes('js-helper'), `'javascript' 應該命中，實際命中：${hits.join(', ')}`);
});

test('L1.5：wasp 不該命中 owasp', () => {
  const tools = [mk('open-saas', ['wasp'])];
  const hits = l15Ids(tools, 'AI 代理的行為要符合 OWASP 的安全要求');
  assert.ok(!hits.includes('open-saas'), `'wasp' 不該命中 'owasp'，實際命中：${hits.join(', ')}`);
});

test('L1.5：free 不該命中 freecad，但 freecad 本身要能命中', () => {
  const tools = [
    mk('free-llm-api', ['free']),
    mk('freecad', ['freecad']),
  ];
  const hits = l15Ids(tools, '用 FreeCAD 的腳本做 3D 模型');
  assert.ok(!hits.includes('free-llm-api'), `'free' 不該命中 'freecad'，實際命中：${hits.join(', ')}`);
  assert.ok(hits.includes('freecad'), `'freecad' 應該命中，實際命中：${hits.join(', ')}`);
});

test('L1.5：多詞 trigger 的詞必須在查詢中依序相鄰出現', () => {
  const tools = [mk('open-source-project-tool', ['open source project'])];
  assert.equal(l15Ids(tools, 'open source project 工具').length, 1, '依序相鄰應命中');
  assert.equal(l15Ids(tools, 'source open project').length, 0, '順序不對不應命中');
  assert.equal(l15Ids(tools, 'open deep source project').length, 0, '中間夾其他英文詞不應命中');
});

test('L1.5：中文夾在英文詞之間不影響命中（中文句子里夾英文術語很常見）', () => {
  // 詞的切分只看 ASCII 詞序，中文不參與相鄰性判定 → 'openai api' 仍能命中
  // 「用 OpenAI 串接 API 服務」。這是刻意的：套用嚴格相鄰反而會誤傷。
  const tools = [mk('openai-api-tool', ['openai api'])];
  assert.equal(l15Ids(tools, '用 OpenAI 串接 API 服務').length, 1);
});

test('L1.5：中文 trigger 維持原本的子字串規則（不套詞邊界）', () => {
  // 中文沒有空白分詞，套詞邊界反而會誤傷：
  // trigger「向量資料庫」出現在「向量資料庫的搜尋結果品質」是合理的
  const tools = [mk('warp', ['向量資料庫'])];
  const hits = l15Ids(tools, '向量資料庫的搜尋結果品質要怎麼評估跟調校');
  assert.ok(hits.includes('warp'), `中文 trigger 應維持子字串命中，實際命中：${hits.join(', ')}`);
});

test('L1.5：詞邊界修正後，L1.5 命中數量不會暴增', () => {
  // 同一個查詢裡，'code' 這種短片段不該讓整個 code 生態的工具都進來
  const tools = [
    mk('claude-code', ['code']),
    mk('qwen-code', ['code']),
    mk('codex-router', ['codex']),
  ];
  const hits = l15Ids(tools, '我們團隊現在用著 Codex，但想讓它可以彈性切換其他模型');
  assert.ok(!hits.includes('claude-code'), `'code' 不該命中 'Codex'，實際命中：${hits.join(', ')}`);
  assert.ok(!hits.includes('qwen-code'), `'code' 不該命中 'Codex'，實際命中：${hits.join(', ')}`);
  assert.ok(hits.includes('codex-router'), `'codex' 應該命中，實際命中：${hits.join(', ')}`);
});
