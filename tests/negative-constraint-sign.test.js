import test from 'node:test';
import assert from 'node:assert/strict';
import { agentRetrieve } from '../core/agent-retrieval.js';

const mkTool = (id, negs) => ({
  id,
  name: id,
  description: 'convert video files to mp4',
  useCase: 'video conversion',
  category: '多媒體',
  triggers: ['video'],
  capabilities: [],
  negativeConstraints: negs,
});

test('查詢命中禁用場景的工具應被扣分、排到乾淨工具之後', () => {
  // 禁用文本刻意重用查詢的完整詞（batch/convert/video），確保重疊度
  // 穩定超過 0.25 門檻——測試驗的是「扣分機制存在」，不是閾值調校。
  const tools = [
    mkTool('tool-with-neg', ['Not designed for batch convert video workloads']),
    mkTool('tool-clean', []),
  ];
  const r = agentRetrieve(tools, 'batch convert video files', { topK: 2 });
  assert.equal(r.topK.length, 2);
  assert.equal(r.topK[0].id, 'tool-clean', `實際排序：${r.topK.map((x) => x.id).join(', ')}`);
  assert.equal(r.topK[1].id, 'tool-with-neg');
});
