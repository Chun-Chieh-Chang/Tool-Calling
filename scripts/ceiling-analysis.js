import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const b = JSON.parse(readFileSync(path.join(ROOT, 'registry', 'eval-queries.json'), 'utf8'));
const reg = JSON.parse(readFileSync(path.join(ROOT, 'registry', 'tools.json'), 'utf8'));
const { agentRetrieve } = await import('../core/agent-retrieval.js');
const { extractIntent, weightsForIntent } = await import('../core/query-intent.js');
const tools = reg.tools.filter((t) => t.status === 'active' || t.status === 'experimental');

const stat = {};
for (const c of b.cases.filter((x) => x.type !== 'empty-set')) {
  const it = extractIntent(c.query);
  const top = agentRetrieve(tools, c.query, { topK: 50, intentWeights: weightsForIntent(it) }).topK.map((y) => y.id);
  let idx = -1;
  for (const e of c.expected) {
    const i = top.indexOf(e);
    if (i >= 0 && (idx < 0 || i < idx)) idx = i;
  }
  stat[c.type] = stat[c.type] || { n: 0, in50: 0, sumRank: 0, hit1: 0 };
  const s = stat[c.type];
  s.n += 1;
  if (idx >= 0) { s.in50 += 1; s.sumRank += idx + 1; if (idx === 0) s.hit1 += 1; } else { s.sumRank += 999; }
}

console.log('類型          筆數   天花板(top50)   平均排名   top1命中');
console.log('─'.repeat(60));
let tn = 0, ti = 0, th = 0;
for (const [k, v] of Object.entries(stat)) {
  console.log(
    '  ' + k.padEnd(13) + String(v.n).padStart(3) + '      ' + (v.in50 / v.n * 100).toFixed(1).padStart(5) + '%      ' +
    (v.sumRank / v.n).toFixed(1).padStart(6) + '      ' + (v.hit1 / v.n * 100).toFixed(1) + '%'
  );
  tn += v.n; ti += v.in50; th += v.hit1;
}
console.log('─'.repeat(60));
console.log('  合計        ' + String(tn).padStart(3) + '      ' + (ti / tn * 100).toFixed(1) + '%            ' + (th / tn * 100).toFixed(1) + '%');
console.log();
console.log('天花板 = 答案有無進 top-50（召回能力）');
console.log('平均排名 = 在 top-50 內排第幾（999 = 沒進）；top1 命中 = 答案是否排第一');
