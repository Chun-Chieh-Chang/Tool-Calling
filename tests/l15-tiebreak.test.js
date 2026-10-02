import test from 'node:test';
import assert from 'node:assert/strict';
import { search } from '../core/search-engine.js';

const mk = (id, name) => ({
  id,
  name,
  description: 'test tool',
  category: '測試',
  status: 'active', // search() 僅接受 active/experimental，缺 status 會被前置過濾
  triggers: ['youtube'],
  capabilities: [],
});

test('L1.5 同分破解：id 含 trigger 的工具應排在純 context 命中之前', () => {
  const tools = [
    mk('alpha-tool', 'Alpha Tool'),
    mk('youtube-helper', 'YouTube Helper'),
    mk('gamma-tool', 'Gamma Tool'),
  ];
  const r = search(tools, 'youtube 影片處理', { topK: 5 });
  assert.equal(r.length, 3);
  assert.equal(r[0].tool.id, 'youtube-helper', `實際排序：${r.map((x) => x.tool.id).join(', ')}`);
});
