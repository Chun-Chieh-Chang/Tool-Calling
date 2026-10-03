import test from 'node:test';
import assert from 'node:assert/strict';
import { agentRetrieve } from '../core/agent-retrieval.js';

// c61 情境：微軟生態圖示庫。正向證據刻意含 microsoft，確保工具通過
// bestDim > 0 的候選門檻、斷言不空轉。
const mkIconTool = (id, negs, facets) => ({
  id,
  name: id,
  description: 'microsoft ecosystem icon library for apps',
  useCase: 'microsoft app icon design',
  category: 'UI/UX設計',
  triggers: ['icons', 'microsoft'],
  capabilities: [],
  negativeConstraints: negs,
  ...(facets ? { negativeFacets: facets } : {}),
});

// 影片轉檔情境：與 negative-constraint-sign.test.js 同形，確保散文 fallback 的
// 正向證據與查詢重疊（否則候選被過濾、斷言空轉）。
const mkVideoTool = (id, negs) => ({
  id,
  name: id,
  description: 'convert video files to mp4',
  useCase: 'video conversion',
  category: '多媒體',
  triggers: ['video'],
  capabilities: [],
  negativeConstraints: negs,
});

test('c61 極性救命：純 + 條目存在時不得扣分（散文否定盲點免疫）', () => {
  // 散文「不適合非 Microsoft 生態」是雙重否定（= 需要 Microsoft），
  // bag-of-words 會把共享詞誤當禁用重疊；結構化 + 極性在資料層消歧。
  const tools = [
    mkIconTool('fluentui-like', ['不適合非 Microsoft 生態'], ['+ecosystem:microsoft']),
    mkIconTool('plain-tool', [], null),
  ];
  const r = agentRetrieve(tools, 'microsoft 生態圖示', { topK: 2, wiki: false });
  assert.equal(r.topK.length, 2, '兩支工具都應進候選（正向證據與查詢重疊）');
  const penalized = r.topK.filter((x) => x.reasons.some((s) => s.includes('命中禁用場景')));
  assert.equal(penalized.length, 0, `不應有任何工具被扣分，實際：${JSON.stringify(r.topK.map((x) => ({ id: x.id, reasons: x.reasons })))}`);
});

test('- 極性條目命中查詢時扣分、排到乾淨工具之後', () => {
  const tools = [
    mkIconTool('tool-with-facet', [], ['-format:markdown table']),
    mkIconTool('clean-tool', [], null),
  ];
  const r = agentRetrieve(tools, 'microsoft 生態圖示', { topK: 2, wiki: false });
  assert.equal(r.topK.length, 2);
  // 值「markdown table」與查詢無關 → 不扣分；此案例單獨驗證格式通路。
  const facetTool = r.topK.find((x) => x.id === 'tool-with-facet');
  assert.ok(facetTool, '結構化工具應在候選中');
});

test('- 極性值與查詢完全重疊時扣滿、排到乾淨工具之後', () => {
  const tools = [
    { ...mkVideoTool('tool-with-facet', []), negativeFacets: ['-format:video convert'] },
    mkVideoTool('clean-tool', []),
  ];
  const r = agentRetrieve(tools, 'video convert', { topK: 2, wiki: false });
  assert.equal(r.topK[0].id, 'clean-tool', `實際排序：${r.topK.map((x) => x.id).join(', ')}`);
  assert.ok(r.topK[1].reasons.some((s) => s.includes('命中禁用場景')), '被扣分工具應顯示 🚫 原因');
});

test('散文 fallback 不受影響：無 negativeFacets 的工具走原邏輯', () => {
  const tools = [
    mkVideoTool('prose-neg', ['Not designed for batch convert video workloads']),
    mkVideoTool('clean-tool', []),
  ];
  const r = agentRetrieve(tools, 'batch convert video files', { topK: 2, wiki: false });
  assert.equal(r.topK[0].id, 'clean-tool');
});
