import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * wiki-lint.test.js — scripts/lint-wiki.js 的固定夾具測試
 *
 * 存在的理由：lint 的兩個新檢查（E1 來源漂移、E4 鑑別力腐化）在真實詞檔上
 * 都報 0。0 有兩種可能——「真的沒有」與「檢查永遠不會響」。本檔用夾具把兩者分開：
 * 每一項檢查都造一個**應該會響**的反例，再造一個**不該響**的對照。
 *
 * 三個設計決定
 * ────────────
 * 1. 基線由被測腳本自己產生（跑一次 --update-baseline），測試**不重算指紋**。
 *    若在測試裡複製一份指紋邏輯，斷言就變成「我寫的雜湊等於我寫的雜湊」——自證。
 * 2. 走真實腳本的路徑覆蓋參數（--registry/--wiki/--baseline），測的是真的會跑的那條路，
 *    而不是另一份「專供測試的簡化版」。
 * 3. 「改第 12 項 capabilities 不該報漂移」是核心一條：它守住 fingerprintSource 與
 *    compile-wiki.js:154-163 截斷長度的隱性耦合。兩邊不同步時這條會先紅。
 */

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = path.join(ROOT, 'scripts', 'lint-wiki.js');

// E4 用的「萬能詞句」：詞彙刻意與其他句子完全不重疊，只出現在 3 筆詞條裡。
// 詞條數 35 → maxDf = max(2, floor(35 × 0.06)) = 2，該句每個詞 df=3 > 2 → 整句失效。
const GENERIC_SENTENCE = '處理大型資料表彙總報表';

const DIRS = [];
after(() => { for (const d of DIRS) rmSync(d, { recursive: true, force: true }); });

function makeTool(id, extra = {}) {
  return {
    id,
    name: id,
    status: 'active',
    category: '開發工具',
    language: 'typescript',
    description: `description of ${id}`,
    useCase: `usecase of ${id}`,
    triggers: [`trigger-${id}`],
    // 12 項：前 10 項進 prompt，第 11、12 項不進——第 12 項是 E1 的反例開關
    capabilities: Array.from({ length: 12 }, (_, i) => `cap${i}-${id}`),
    advantages: [`advantage-${id}`],
    negativeConstraints: ['沒有特別限制'],
    stars: 1000,
    ...extra,
  };
}

// 唯一句：latin 獨有詞 zzzN 保證 df=1（CJK 部分 35 筆共用，df=35）
const uniqueIntent = (n) => `最佳化凸輪從動件 zzz${n}`;

/**
 * 建一份可預期的夾具：35 支工具 + 35 筆詞條，外加可控的反例開關。
 * @param {object} [opt]
 * @param {boolean} [opt.ghost]      多一筆「詞檔有、registry 沒有」的詞條（E2）
 * @param {boolean} [opt.missing]    多一支「registry 有、詞條沒有」的工具（E3）
 * @param {boolean} [opt.decay]      3 筆詞條共用萬能詞句（E4）
 * @param {boolean} [opt.doubleNeg]  兩支含「不適合非…」的工具，一支有 facets 一支沒有（E5）
 * @param {boolean} [opt.tier0]      把 tool-00 改成 Tier 0 詞條（指紋走另一個視圖）
 */
function buildFixture(opt = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'wiki-lint-'));
  DIRS.push(dir);
  const tools = [];
  const entries = {};
  for (let i = 0; i < 35; i++) {
    const id = `tool-${String(i).padStart(2, '0')}`;
    tools.push(makeTool(id));
    entries[id] = { intents: [uniqueIntent(i)], tier: 1, epistemic: 'S' };
  }
  if (opt.tier0) {
    // Tier 0 的來源欄位與 Tier 1 不同（compile-wiki.js:122-126：useCase／description／
    // triggers 前 6 個），所以 fingerprintSource 走另一個視圖。給 8 個 triggers 是為了
    // 讓「第 5 個該響、第 7 個不該響」兩條邊界都能被測到。
    const t0 = tools.find((t) => t.id === 'tool-00');
    t0.triggers = Array.from({ length: 8 }, (_, i) => `trig${i}-tool-00`);
    t0.description_zh = 'Tier 0 詞條收進去的那句中文描述';
    entries['tool-00'] = { intents: [uniqueIntent(0)], tier: 0, epistemic: 'V' };
  }
  if (opt.missing) tools.push(makeTool('tool-no-entry'));
  if (opt.doubleNeg) {
    // 無 facets → 散文仍會進 negativePenalty（高危）
    tools.push(makeTool('tool-dneg-high', { negativeConstraints: ['不適合非網頁環境使用'] }));
    entries['tool-dneg-high'] = { intents: [uniqueIntent(90)], tier: 1 };
    // 有 facets → agent-retrieval 一律以結構為準、忽略散文（低危）
    tools.push(makeTool('tool-dneg-low', {
      negativeConstraints: ['不適合非網頁環境使用'],
      negativeFacets: ['-platform:web'],
    }));
    entries['tool-dneg-low'] = { intents: [uniqueIntent(91)], tier: 1 };
  }
  if (opt.decay) {
    for (const i of [0, 1, 2]) {
      entries[`tool-${String(i).padStart(2, '0')}`].intents = [GENERIC_SENTENCE, uniqueIntent(500 + i)];
    }
  }
  if (opt.ghost) entries['tool-ghost'] = { intents: [uniqueIntent(999)], tier: 1 };

  const regPath = path.join(dir, 'tools.json');
  const wikiPath = path.join(dir, 'compiled-entries.json');
  const baselinePath = path.join(dir, 'wiki-lint-baseline.json');
  writeFileSync(regPath, JSON.stringify({ version: '1', lastUpdated: '2026-10-07T00:00:00.000Z', tools }, null, 2), 'utf8');
  writeFileSync(wikiPath, JSON.stringify({ version: '1.0.0', generatedAt: '2026-10-07T00:00:00.000Z', entries }, null, 2), 'utf8');
  return { dir, regPath, wikiPath, baselinePath };
}

function runLint(f, extraArgs = []) {
  return spawnSync(process.execPath, [
    SCRIPT,
    `--registry=${f.regPath}`,
    `--wiki=${f.wikiPath}`,
    `--baseline=${f.baselinePath}`,
    ...extraArgs,
  ], { encoding: 'utf8' });
}

/** 以 --json 跑：該模式下 stdout 只有 JSON（阻斷級那行被 !JSON_OUT 守住）。 */
function lint(f, extraArgs = []) {
  const res = runLint(f, ['--json', ...extraArgs]);
  if (res.status !== 0 && res.status !== 1) {
    assert.fail(`腳本非預期退出（code ${res.status}）：${res.stderr}`);
  }
  return { code: res.status, ...JSON.parse(res.stdout) };
}

/** 先讓被測腳本自己建基線，回傳指紋表。 */
function withBaseline(f) {
  runLint(f, ['--update-baseline']);
  const fps = JSON.parse(readFileSync(f.baselinePath, 'utf8')).fingerprints;
  assert.ok(Object.keys(fps).length > 0, '基線應該被寫出來');
  return fps;
}

function mutate(f, fn) {
  const reg = JSON.parse(readFileSync(f.regPath, 'utf8'));
  fn(reg.tools);
  writeFileSync(f.regPath, JSON.stringify(reg, null, 2), 'utf8');
}

// ── E1 來源漂移 ───────────────────────────────────────────────────────────

test('E1 會響：改 useCase（有進 prompt）→ 該工具被報為漂移', () => {
  const f = buildFixture();
  withBaseline(f);
  mutate(f, (tools) => { tools[3].useCase = '被人改過的用途說明，詞條已經描述不了它'; });

  const out = lint(f);
  assert.deepEqual(out.drift, ['tool-03']);
  assert.equal(out.code, 1, 'E1 屬阻斷級 → exit 1');
});

test('E1 不誤報：只改第 12 項 capabilities（沒進 prompt）→ drift 為空', () => {
  const f = buildFixture();
  withBaseline(f);
  mutate(f, (tools) => { tools[4].capabilities[11] = 'cap11-tool-04-改了但根本沒進 prompt'; });

  const out = lint(f);
  assert.deepEqual(out.drift, [], '第 11/12 項在 compile-wiki 的 slice(0,10) 之外，不該算漂移');
});

test('E1 不誤報：只改 stars（cron 每晚動的那個欄位）→ drift 為空', () => {
  const f = buildFixture();
  withBaseline(f);
  mutate(f, (tools) => { for (const t of tools) t.stars = (t.stars || 0) + 7; });

  const out = lint(f);
  assert.deepEqual(out.drift, [], 'stars 不在指紋視圖內 → nightly cron 不該製造漂移');
});

// Tier 0 的指紋視圖與 Tier 1 不同：compileOffline() 讀 description_zh 與 triggers
// 前 6 個，而視圖原本兩者都不蓋（description 完全缺、triggers 只到 4）→ 實測 7/12 支
// Tier 0 詞條的 intents 有 description 句，那些改了不會報，E1 對 Tier 0 是假綠。
test('E1 會響（Tier 0 視圖）：改 description_zh → 該詞條被報為漂移', () => {
  const f = buildFixture({ tier0: true });
  withBaseline(f);
  mutate(f, (tools) => { tools[0].description_zh = '改了中文描述，詞條收進去的那句已經過期'; });

  const out = lint(f);
  assert.deepEqual(out.drift, ['tool-00'], 'Tier 0 的 description 是 intents 來源，改了必須報');
});

test('E1 會響（Tier 0 視圖）：改第 5 個 trigger（在 slice(0,6) 內）→ 報漂移', () => {
  const f = buildFixture({ tier0: true });
  withBaseline(f);
  mutate(f, (tools) => { tools[0].triggers[4] = 'trig4-tool-00-改了'; });

  const out = lint(f);
  assert.deepEqual(out.drift, ['tool-00']);
});

test('E1 不誤報（Tier 0 視圖）：改第 7 個 trigger（超出 slice(0,6)）→ drift 為空', () => {
  const f = buildFixture({ tier0: true });
  withBaseline(f);
  mutate(f, (tools) => { tools[0].triggers[6] = 'trig6-tool-00-沒進來源'; });

  const out = lint(f);
  assert.deepEqual(out.drift, [], '第 7、8 個 trigger 不在 compileOffline 的來源內，不該算漂移');
});

test('E1 沒基線時不宣稱「沒有漂移」，而是標記 baselineExists=false', () => {
  const out = lint(buildFixture());
  assert.equal(out.summary.baselineExists, false);
  assert.equal(out.summary.drift, 0);
});

test('幽靈詞條不寫進基線（基線筆數 = 詞條數 - 幽靈數）', () => {
  const f = buildFixture({ ghost: true });
  const fps = withBaseline(f);
  assert.equal(Object.keys(fps).length, 35);
  assert.ok(!('tool-ghost' in fps));
});

// ── E2／E3 存在性 ─────────────────────────────────────────────────────────

test('E2 會響：詞檔有、registry 沒有 → ghosts 列出且 exit 1', () => {
  const out = lint(buildFixture({ ghost: true }));
  assert.deepEqual(out.ghosts, ['tool-ghost']);
  assert.equal(out.code, 1);
});

test('E3 會響：工具在庫上但沒詞條 → missing 列出（警告級，exit 0）', () => {
  const out = lint(buildFixture({ missing: true }));
  assert.deepEqual(out.missing, ['tool-no-entry']);
  assert.equal(out.summary.entries, 35);
  assert.equal(out.code, 0, 'E3 屬警告級，不該讓門禁紅');
});

// ── E4 鑑別力腐化 ─────────────────────────────────────────────────────────

test('E4 會響：三筆詞條共用同一句萬能詞 → 該句被判定失去鑑別力', () => {
  const out = lint(buildFixture({ decay: true }));
  assert.equal(out.decayed.length, 3, `應有 3 筆腐化，實際 ${JSON.stringify(out.decayed)}`);
  for (const h of out.decayed) {
    assert.equal(h.dropped, 1, '只該掉萬能詞那一句');
    assert.equal(h.kept, 1, '唯一句要留著');
  }
  assert.equal(out.summary.deadEntries, 0, '每筆還剩一句有效 intent，不該整筆失效');
});

test('E4 不誤報：其餘 32 筆詞條沒有腐化', () => {
  const out = lint(buildFixture());
  assert.equal(out.decayed.length, 0);
});

// ── E5 雙重否定分級 ───────────────────────────────────────────────────────

test('E5 分級：同一句「不適合非…」，無 facets 進高危、有 facets 進低危', () => {
  const out = lint(buildFixture({ doubleNeg: true }));
  assert.deepEqual(out.doubleNegHigh.map((h) => h.id), ['tool-dneg-high']);
  assert.deepEqual(out.doubleNegLow.map((h) => h.id), ['tool-dneg-low']);
});

test('E5 不誤報：乾淨夾具裡兩級都是空', () => {
  const out = lint(buildFixture());
  assert.deepEqual(out.doubleNegHigh, []);
  assert.deepEqual(out.doubleNegLow, []);
});

// 活資料實測到的誤報（freetube：「無法下載影片離線觀看（非下載工具）」）：
// 「非」後面直接接到「下載」的「下」， Regex 若容許裸「下」就會把它當雙重否定。
// 同時斷言「非 … 情況下」這種真的寫法仍要被抓到——避免修誤報時把檢查修成靜默綠。
test('E5 誤報防線：「（非下載工具）」不響，但「非…的情況下」仍要響', () => {
  const f = buildFixture();
  mutate(f, (tools) => {
    tools[5].negativeConstraints = ['無法下載影片離線觀看（非下載工具）'];
    tools[6].negativeConstraints = ['在非 Windows 生態的情況下不建議使用'];
  });

  const out = lint(f);
  assert.deepEqual(out.doubleNegHigh.map((h) => h.id), ['tool-06'],
    `只該報真正的雙重否定，實際 ${JSON.stringify(out.doubleNegHigh)}`);
  assert.deepEqual(out.doubleNegLow, []);
});
