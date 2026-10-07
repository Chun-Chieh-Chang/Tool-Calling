import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * v5-ablate-wiki-flag.test.js — `--wiki=` 覆蓋參數的防「假開關」測試
 *
 * 存在的理由：v5-ablate.js 的 `run()` 原本**沒有把載入的詞檔傳進 agentRetrieve**，
 * 只拿它印標題。在那種狀態下加 `--wiki=`，標題會顯示對照詞檔、實際打分的卻是
 * registry 預設檔——數字看著像量測，其實是靜默假測量。兩條測試各堵一個洞：
 *
 * 1. 路徑由旗標決定：指向不存在的檔案 → exit 1，且錯誤訊息要顯示**那個路徑**
 *    （不顯示就分不清「旗標沒讀到」與「檔真的不見」）。
 * 2. 內容進了打分：給一份「把每題的 query 原文掛到**別題的 expected**」的錯掛詞檔，
 *    V5 啟用列的 top1 必須**低於**同一次的 V5 停用基線列（實測 21.0% < 50.6%）。
 *    這個斷言是自我對照的，不需要任何寫死的歷史數字；若 `--wiki=` 是假開關，
 *    腳本會用預設詞檔量出 58.0% > 50.6%，斷言立刻轉紅（已用注銷測試驗證）。
 *
 * 成本：一次 3 列的量測（含 261 筆錯掛詞檔的圖建立）實測 30.7 秒——它是整套 `npm test` 最貴的一支。
 */

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = path.join(ROOT, 'scripts', 'v5-ablate.js');
const REAL_WIKI = path.join(ROOT, 'registry', 'compiled-entries.json');
const EVAL = path.join(ROOT, 'registry', 'eval-queries.json');

const DIRS = [];
after(() => { for (const d of DIRS) rmSync(d, { recursive: true, force: true }); });

function ablate(extraArgs) {
  const res = spawnSync(process.execPath, [SCRIPT, '--weights=0.20', ...extraArgs], { encoding: 'utf8' });
  if (res.status !== 0 && res.status !== 1) {
    assert.fail(`腳本非預期退出（code ${res.status}）：${res.stderr.slice(0, 200)}`);
  }
  return res;
}

/** 從輸出表格取某一列的（天花板／平均排名／top1）。 */
function row(out, label) {
  const line = out.split('\n').find((l) => l.trim().startsWith(label));
  assert.ok(line, `找不到「${label}」那列：\n${out.slice(0, 400)}`);
  const m = line.match(/(\d+\.\d)%\s+(\d+\.\d)\s+(\d+\.\d)%/);
  assert.ok(m, `該列前三個數字解析失敗：${line}`);
  return { ceiling: Number(m[1]), rank: Number(m[2]), top1: Number(m[3]) };
}

/** 錯掛詞檔：第 i 題的 query 原文變成第 i+1 題 expected 的 intent。只留用得到的 261 筆。 */
function buildMisattributed(dir) {
  const wiki = JSON.parse(readFileSync(REAL_WIKI, 'utf8'));
  const ev = JSON.parse(readFileSync(EVAL, 'utf8'));
  const cases = ev.cases.filter((c) => c.type !== 'empty-set');
  const entries = {};
  for (let i = 0; i < cases.length; i++) {
    for (const wrong of cases[(i + 1) % cases.length].expected) {
      if (!wiki.entries[wrong]) continue;
      entries[wrong] = entries[wrong] || { ...wiki.entries[wrong], intents: [] };
      if (!entries[wrong].intents.includes(cases[i].query)) entries[wrong].intents.push(cases[i].query);
    }
  }
  const p = path.join(dir, 'misattributed.json');
  writeFileSync(p, JSON.stringify({ version: wiki.version, generatedAt: wiki.generatedAt, entries }), 'utf8');
  return { p, count: Object.keys(entries).length };
}

test('--wiki= 指向不存在的路徑 → exit 1，且錯誤訊息顯示被覆蓋的路徑', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'v5-ablate-wiki-'));
  DIRS.push(dir);
  const res = ablate([`--wiki=${path.join(dir, 'no-such-corpus.json')}`]);
  assert.equal(res.status, 1, '詞檔載入失敗應該中止，而不是退回預設檔繼續量');
  assert.ok(res.stderr.includes('no-such-corpus.json'),
    `錯誤訊息要顯示實際嘗試的路徑：${res.stderr}`);
});

test('--wiki= 的詞檔內容真的進了 V5 打分（錯掛詞檔會讓 V5 變成傷害）', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'v5-ablate-wiki-'));
  DIRS.push(dir);
  const { p, count } = buildMisattributed(dir);
  assert.ok(count >= 100, `對照詞檔應該有足夠條目，實際 ${count}`);

  const res = ablate([`--wiki=${p}`]);
  assert.ok(res.stdout.includes('misattributed.json'), '來源列要顯示覆蓋後的檔案');
  assert.ok(res.stdout.includes(`詞檔：${count} 筆`), '筆數要跟著變，否則載入的不是對照檔');

  const off = row(res.stdout, 'V5 停用（基線）');
  const on = row(res.stdout, 'w=0.2 + 圖譜');
  assert.ok(on.top1 < off.top1,
    `錯掛詞檔下 V5 啟用必須比停用更差（實測 on=${on.top1}% off=${off.top1}%）；`
    + '若兩者的相對關係回到預設詞檔的「啟用比較好」，代表 --wiki= 沒進到打分，是假開關');
});
