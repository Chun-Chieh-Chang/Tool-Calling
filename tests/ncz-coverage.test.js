/**
 * negativeConstraints_zh 覆蓋閘門（C1，第十輪）
 *
 * 這條閘門的由來是一場**誤報自查**：我用 `/[A-Za-z]/` 量出「6 支缺 NCZ」，
 * 但翻譯器 `scripts/translate-to-zh.js` 的判準是「完全沒中文，或中文裡夾著 ≥2 個
 * 連續拉丁字母」。那 6 支的 NC 本來就是中文散文，只含 `C++`／`A股`／`3D` 這類
 * 單字母技術詞——留空是正確行為，不是欠債。兩把尺不同源才會誤報，所以這裡把判準
 * 抽成 `negativeConstraintsZhGap`，閘門與翻譯器**共用同一支函式**，並由最後一條鎖
 * 盯著那個共用關係。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  isNcEntryNeedingZh,
  negativeConstraintsZhGap,
  validateToolContract,
} from '../core/registry-contract.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const registry = JSON.parse(readFileSync(join(ROOT, 'registry', 'tools.json'), 'utf8'));
const inScope = registry.tools.filter((t) => t.status === 'active' || t.status === 'experimental');

const base = {
  id: 'ncz-fixture',
  name: 'NCZ Fixture',
  url: 'https://github.com/example/ncz-fixture',
  description: 'A synthetic tool used only to stake the negativeConstraints_zh coverage gate.',
  category: '開發工具',
  language: 'python',
  triggers: ['ncz gate', 'coverage fixture', 'contract warning'],
  status: 'active',
  useCase: 'Use when checking that English negative constraints require a Traditional Chinese counterpart.',
  advantages: ['Deterministic fixture for the contract gate.'],
};

test('綠色鎖：現量 active／experimental 全庫都不得被這條擋（缺口 0）', () => {
  const flagged = inScope.filter((t) => negativeConstraintsZhGap(t) !== null);
  assert.equal(flagged.length, 0, `不該有缺口，實得：${flagged.map((t) => t.id).join(', ')}`);
});

test('打樁：英文 NC 沒有 NCZ 時必須出現 warning，且扣 15 分', () => {
  const tool = { ...base, negativeConstraints: ['Not suitable for offline-only pipelines.'] };
  const before = validateToolContract({ ...tool, negativeConstraints_zh: ['不適合只能離線的管線。'] });
  const after = validateToolContract(tool);
  const hit = after.warnings.filter((w) => w.field === 'negativeConstraints_zh');
  assert.equal(hit.length, 1, `應該正好一筆欠債 warning：${JSON.stringify(after.warnings.map((w) => w.field))}`);
  assert.equal(after.qualityScore, before.qualityScore - 15, '欠一條 NCZ 要扣 15 分');
  assert.equal(after.errors.length, 0, '這是 warning 不是 error：新工具常在批次裡先有英文 NC，做成 error 會天天紅');
});

test('不誤報：中文散文含單字母技術詞（C++／A股／3D）不算缺口——那 6 支實例', () => {
  const samples = [
    '需要C++編譯環境',
    '僅支援A股',
    '不適合需要 3D 骨骼動畫或生物力學數據的研究',
    '主要使用C#開發',
  ];
  for (const s of samples) assert.equal(isNcEntryNeedingZh(s), false, `不應要求譯文：${s}`);
  for (const id of ['exercises-dataset', 'fincept-terminal', 'lean', 'tradingagents-cn', 'tradingagents-astock', 'fmt']) {
    const t = registry.tools.find((x) => x.id === id);
    assert.ok(t, `庫裡應該有 ${id}`);
    assert.equal(negativeConstraintsZhGap(t), null, `${id} 的 NC 已是中文散文，留空是正確行為`);
  }
});

test('範圍與翻譯器一致：deprecated／archived 的英文 NC 不得被擋（3 支實例）', () => {
  const cases = [
    ['kimi-k3-code-free-desktop-ai', 'deprecated'],
    ['figma-sharp', 'archived'],
    ['figma-api-demo', 'archived'],
  ];
  for (const [id, status] of cases) {
    const t = registry.tools.find((x) => x.id === id);
    assert.equal(t.status, status, `${id} 的 status 應該還是 ${status}`);
    assert.ok(t.negativeConstraints?.length >= 1 && !t.negativeConstraints_zh?.length, `${id} 應是英文 NC 無 NCZ`);
    assert.equal(negativeConstraintsZhGap(t), null, '非 active／experimental 不翻是刻意行為，不是欠債');
  }
});

test('尺同源：翻譯器必須 import 同一支 negativeConstraintsZhGap（防止兩把尺分開長）', () => {
  const src = readFileSync(join(ROOT, 'scripts', 'translate-to-zh.js'), 'utf8');
  assert.ok(
    /import\s*\{[^}]*negativeConstraintsZhGap[^}]*\}\s*from\s*'\.\.\/core\/registry-contract\.js'/.test(src),
    'translate-to-zh.js 需從 core/registry-contract.js import 那把共用的尺',
  );
  assert.ok(
    !/const isMixed = \/\[一-鿿\]\/\.test\(v\)/.test(src),
    '翻譯器內不可再留一份自行實作的 NC 判準（那正是這次誤報的來源）',
  );
});
