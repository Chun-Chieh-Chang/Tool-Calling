import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeCases, formatTable, formatFailures } from '../core/ceiling.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const b = JSON.parse(readFileSync(path.join(ROOT, 'registry', 'eval-queries.json'), 'utf8'));
const reg = JSON.parse(readFileSync(path.join(ROOT, 'registry', 'tools.json'), 'utf8'));
const tools = reg.tools.filter((t) => t.status === 'active' || t.status === 'experimental');

// ─── 2026-10-15 Q5=A：新增 --failures 系列旗標 ──────────────────────────────
// 天花板分析原本只印聚合數字，看不到「哪一題壞、壞在哪」。詞檔調校需要
// 逐題清單，且必須能分辨兩種失敗（MEMORY §2：多數失敗是排序問題不是召回問題）：
//   · recall-miss：正解根本沒進 top-50（真正的召回缺口）
//   · rank-loss ：正解在 top-50 內但排名 > 5（排序問題，rerank／權重的活）
// 預設輸出不變（向下相容）；新增旗標才多印清單。
const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const argVal = (f, d) => {
  const i = argv.indexOf(f);
  return i >= 0 && argv[i + 1] ? Number(argv[i + 1]) : d;
};
const TOPK = argVal('--topK', 50);
const RANK_THRESHOLD = argVal('--rank-threshold', 5);
const { stat, records } = analyzeCases(b.cases, tools, TOPK);

if (has('--json')) {
  // 機器可讀（給 docs 產生器／後續分析用），不印人眼表格
  console.log(JSON.stringify({ topK: TOPK, rankThreshold: RANK_THRESHOLD, stat, records }, null, 2));
} else {
  console.log(formatTable(stat));
}

if (has('--failures') && !has('--json')) {
  const only = has('--recall-miss') ? 'recall' : has('--rank-loss') ? 'rank' : null;
  console.log(formatFailures(records, {
    topK: TOPK,
    rankThreshold: RANK_THRESHOLD,
    limit: argVal('--limit', 40),
    only,
  }));
}
