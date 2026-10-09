/**
 * rescan-classification --ci 的本地等價入口（C4）
 *
 * 這道分類閘門過去**只在 CI 跑**（.github/workflows/deploy-pages.yml），本地 npm test 沒有一條
 * 對應的鎖，於是「本地全綠、推上去被 CI 擋」變成常態。本檔鎖三件事：
 *   1. npm 有對應的 script，而且**已接進 npm test 鏈**（只在 CI 的閘門等于沒閘門）。
 *   2. 現行 registry 跑 --ci 是綠的（這條是綠色鎖：哪天新工具帶進 Tier 1 違反，它先紅）。
 *   3. 打樁：把一支 Tier 1 合規工具的分類改錯，--ci 必須 exit 1 並點名該工具。
 *      沒有第 3 條，第 2 條的綠可能只是「腳本根本沒在擋」（--registry 就是為了這條而存在）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fields, ruleApplies, RULES_BY_PASS } from '../core/classification-rules.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = path.join(ROOT, 'scripts', 'rescan-classification.js');
const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

function runCi(registryPath) {
  const args = [SCRIPT, '--ci'];
  if (registryPath) args.push('--registry', registryPath);
  try {
    return {
      code: 0,
      out: execFileSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }),
    };
  } catch (e) {
    return { code: e.status, out: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
}

/** 從正式庫裡找一支「命中 Tier 1 規則且現行分類正確」的工具——它是最好的違規素材。 */
function pickTier1Compliant() {
  const tools = JSON.parse(readFileSync(path.join(ROOT, 'registry', 'tools.json'), 'utf8')).tools;
  for (const t of tools) {
    const f = fields(t);
    let hit = null, required = null;
    for (const passRules of RULES_BY_PASS) {
      for (const rule of passRules) {
        const r = ruleApplies(rule, f);
        if (r.ok) { hit = rule; required = r.required || rule.required; break; }
      }
      if (hit) break;
    }
    if (hit && hit.tier === 1 && t.category === required) return { tool: t, required };
  }
  return null;
}

test('npm 有 check:classification，且已接進 npm test（不再只在 CI 跑）', () => {
  assert.equal(pkg.scripts['check:classification'], 'node scripts/rescan-classification.js --ci');
  assert.ok(
    pkg.scripts.test.includes('node scripts/rescan-classification.js --ci'),
    'npm test 鏈必須含這條，否則本地永遠比 CI 鬆',
  );
});

test('綠色鎖：現行 registry 跑 --ci 必須 exit 0（Tier 1 明確違反 = 0）', () => {
  const { code, out } = runCi();
  assert.match(out, /Tier 1 明確違反 : (\d+)/);
  assert.ok(out.includes('Tier 1 明確違反 : 0'), `應該全綠，實際輸出：\n${out}`);
  assert.equal(code, 0, 'exit code 必須是 0（不是被包裝的假綠）');
});

test('打樁：改錯一支 Tier 1 工具的分類，--ci 必須 exit 1 並點名它', () => {
  const pick = pickTier1Compliant();
  assert.ok(pick, '找不到 Tier 1 合規工具當素材（規則集可能變了，需更新本鎖）');
  const wrong = '開發工具' === pick.required ? '文件生產力' : '開發工具';
  assert.notEqual(wrong, pick.required, 'fixture 的目標分類必須與規則要求不同，否則樁打空');

  const dir = mkdtempSync(path.join(tmpdir(), 'rescan-ci-'));
  const fixture = path.join(dir, 'tools.json');
  try {
    writeFileSync(fixture, JSON.stringify({ tools: [{ ...pick.tool, category: wrong }] }), 'utf-8');
    const { code, out } = runCi(fixture);
    assert.ok(out.includes(`掃描 1 個工具`), `fixture 只該掃 1 支：\n${out}`);
    assert.ok(out.includes('Tier 1 明確違反 : 1'), `應該抓到 1 筆違反：\n${out}`);
    assert.equal(code, 1, '有 Tier 1 違反時 --ci 必須 exit 1');
    assert.ok(out.includes('CI 檢查失敗'), `stderr 要有明確的失敗訊息：\n${out}`);
    assert.ok(out.includes(pick.tool.id), `應該點名被改錯的工具 id：\n${out}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('開關真的有用：同一份違規 fixture 不加 --ci 時不得 exit 1', () => {
  // 「加了開關輸出相同＝開關沒作用」是踩過的坑，這裡反向鎖住：唯讀模式把違規當待辦，不擋。
  const pick = pickTier1Compliant();
  assert.ok(pick, '找不到素材');
  const wrong = '開發工具' === pick.required ? '文件生產力' : '開發工具';
  const dir = mkdtempSync(path.join(tmpdir(), 'rescan-noci-'));
  const fixture = path.join(dir, 'tools.json');
  try {
    writeFileSync(fixture, JSON.stringify({ tools: [{ ...pick.tool, category: wrong }] }), 'utf-8');
    // 不給 --ci 在預設情形會寫報告檔，但 --registry 已把這次跑成診斷模式（唯讀），
    // 所以正檔 docs／registry 不會被這份 1 支工具的 fixture 覆蓋。
    const out = execFileSync(
      process.execPath,
      [SCRIPT, '--registry', fixture],
      { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
    assert.match(out, /Tier 1 明確違反 : 1/, '唯讀模式仍要回報違規計數（只是不擋）');
    assert.match(out, /唯讀模式：未寫入報告檔/, '診斷模式必須自報唯讀，否則就是悄悄覆蓋正檔');
  } catch (e) {
    assert.fail(`無 --ci 時不該非零退出：status=${e.status}\n${e.stdout ?? ''}${e.stderr ?? ''}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
