/**
 * 同步 zh-translation-state.json 的快取與 tools.json 的現值。
 *
 * 為什麼需要：translate-to-zh.js 的 flush() 會把快取裡的譯文蓋回 tools.json。
 * 若 tools.json 已修正（例：知識中枢 → 知識中樞）但快取仍是舊值， // allow-simplified：引用簡體字形本身
 * 下次跑 translate 就會把修正「復活」成舊的簡體字（translate 腳本註解的已知陷阱）。
 */
import { readFileSync, writeFileSync } from 'node:fs';

const regPath = new URL('../registry/tools.json', import.meta.url);
const statePath = new URL('../registry/zh-translation-state.json', import.meta.url);

const reg = JSON.parse(readFileSync(regPath, 'utf8'));
const state = JSON.parse(readFileSync(statePath, 'utf8'));

const FIELDS = ['description_zh', 'useCase_zh', 'advantages_zh', 'negativeConstraints_zh'];
const toolMap = new Map(reg.tools.map((t) => [t.id, t]));

let synced = 0;
const details = [];
for (const [id, entry] of Object.entries(state.done || {})) {
  const t = toolMap.get(id);
  if (!t) continue;
  for (const f of FIELDS) {
    if (!entry[f]) continue;
    const toolVal = t[f];
    const a = JSON.stringify(entry[f]);
    const b = JSON.stringify(toolVal);
    if (a === b) continue;
    // 快取與工具庫不一致 → 以工具庫為準（工具庫是單一真理來源）
    entry[f] = toolVal;
    synced++;
    details.push({ id, field: f, from: a.slice(0, 70), to: b.slice(0, 70) });
  }
}

if (synced) {
  writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n', 'utf8');
}
console.log(`同步 ${synced} 個快取欄位（以 tools.json 為準）`);
details.slice(0, 12).forEach((d) => {
  console.log(`  ${d.id}.${d.field}`);
  console.log(`    舊快取: ${d.from}`);
  console.log(`    新快取: ${d.to}`);
});
