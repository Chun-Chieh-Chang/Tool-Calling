import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * wiki-compile-offline.test.js — scripts/compile-wiki.js 的 Tier 0（規則式）形態測試
 *
 * 存在的理由：2026-10-07 要補 12 支缺詞條前實測發現，`compileOffline()` 把 `triggers`
 * 原詞直接塞進 intents，12 筆帶入 47 句、其中 33 句（70.2%）是工具 id 自我重複與裸觸發詞，
 * 而既有 732 筆 2636 句此類為 0。鑑別力守門只按文件頻率剔除，df 低的裸詞全部存活，
 * 於是「E3 歸零」是用「把非需求語句灌進 V5 索引」換來的。該函數此前**零測試覆蓋**。
 *
 * 設計決定（沿用 wiki-lint.test.js 的慣例）：
 *   1. 走真實腳本的路徑覆蓋參數（--registry=／--out=），測真的會跑的那條路，不複製邏輯。
 *   2. 每句都帶一個獨特 latin 詞（zzzN）保證 df=1，避免鑑別力守門把斷言要看的句子先剔除。
 *   3. 斷言「不該進的沒進」與「該進的有進」兩邊，只斷言數量會被反向蒙混。
 */

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = path.join(ROOT, 'scripts', 'compile-wiki.js');
const REAL_WIKI = path.join(ROOT, 'registry', 'compiled-entries.json');

const DIRS = [];
after(() => {
  for (const d of DIRS) rmSync(d, { recursive: true, force: true });
});

function makeTool(id, extra = {}) {
  return {
    id,
    name: id,
    status: 'active',
    category: '開發工具',
    language: 'typescript',
    install: { method: 'npx' },
    description: `plain english description of ${id}`,
    useCase: '',
    triggers: [],
    capabilities: [`cap-${id}`],
    negativeConstraints: [`不要用於 ${id} 的示範 zzz${id}`],
    ...extra,
  };
}

/** 跑一次 Tier 0 編譯，回傳寫進 --out 的 entries。 */
function compile(tools, { seedEntries = null } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'g2-compile-'));
  DIRS.push(dir);
  const regPath = path.join(dir, 'tools.json');
  const outPath = path.join(dir, 'out.json');
  writeFileSync(regPath, JSON.stringify({ tools }, null, 2));
  if (seedEntries) {
    writeFileSync(outPath, JSON.stringify({ version: '0.0.0', entries: seedEntries }, null, 2));
  }
  const r = spawnSync(
    process.execPath,
    [SCRIPT, '--offline', `--registry=${regPath}`, `--out=${outPath}`, `--ids=${tools.map((t) => t.id).join(',')}`],
    { cwd: ROOT, encoding: 'utf8' },
  );
  assert.equal(r.status, 0, `腳本應 exit 0，實際 ${r.status}\n${r.stderr}`);
  return { entries: JSON.parse(readFileSync(outPath, 'utf8')).entries, stdout: r.stdout };
}

const hasCJK = (s) => /[㐀-䶿一-鿿]/.test(s);
const isPureAscii = (s) => !hasCJK(s) && /^[\x20-\x7e]+$/.test(s);

test('T1 裸 ASCII triggers 不進 intents；含中文且 ≥8 字的觸發詞短句仍收', () => {
  const { entries } = compile([
    makeTool('t1', {
      useCase_zh: `在本地以自然語言產生短影片並匯出成 mp4 檔案 zzz1`,
      triggers: ['cam-shell', 'ffmpeg-gui', '移除圖', `以圖搜圖做出現貨比價的場合 zzz1b`],
    }),
  ]);
  const intents = entries.t1.intents;
  assert.ok(intents.every(hasCJK), `不該有純 ASCII 句：${JSON.stringify(intents)}`);
  assert.ok(intents.includes('以圖搜圖做出現貨比價的場合 zzz1b'), '中文短語應保留');
  assert.ok(!intents.includes('移除圖'), '<8 字的不算整句');
  assert.ok(!intents.some((s) => s === 'cam-shell' || s === 'ffmpeg-gui'));
});

test('T2 英文 description 不收，中文 description 作為第二句來源', () => {
  const { entries } = compile([
    makeTool('t2en', { useCase_zh: `開發人員在 macOS 本機啟動開放權重模型 zzz2` }),
    makeTool('t2zh', {
      useCase_zh: `把即時航班追蹤與地震數據整合成 GPU 加速儀表板 zzz3`,
      description_zh: `開源全球情報平台，供分析師做態勢感知用 zzz4`,
    }),
  ]);
  assert.deepEqual(entries.t2en.intents, [`開發人員在 macOS 本機啟動開放權重模型 zzz2`]);
  assert.equal(entries.t2zh.intents.length, 2, 'useCase＋中文 description 應有兩句');
  assert.ok(!entries.t2en.intents.some((s) => s.includes('plain english')));
});

test('T3 前 24 字相同的近似重複只收一句，不重複計數', () => {
  const head = `在本地環境用自然語言生成短影片並匯出成檔案`;
  const { entries } = compile([
    makeTool('t3', {
      useCase_zh: `${head} zzz5`,
      description_zh: `${head} zzz6 的進階說明`,
    }),
  ]);
  assert.equal(entries.t3.intents.length, 1, `近似重複應只留一句：${JSON.stringify(entries.t3.intents)}`);
});

test('T4 無整句來源就不寫入該 id，避免用空詞條把 E3 假性歸零', () => {
  const { entries, stdout } = compile([
    makeTool('t4', {
      description: 'only english description, no chinese at all',
      triggers: ['bare-token', 'another-token'],
    }),
  ]);
  assert.ok(!('t4' in entries), '不該產生空 intents 的詞條');
  assert.match(stdout, /跳過 1 筆無整句來源/);
});

test('T5 intents 上限 4 句（既有語料最多 5 句，Tier 0 不超過 4）', () => {
  const { entries } = compile([
    makeTool('t5', {
      useCase_zh: `在編輯器裡直接把選取程式碼轉成重構提案 zzz7`,
      description_zh: `支援多語言的自動化重構代理服務 zzz8`,
      triggers: [
        '幫我把這個函式拆成兩個小函式 zzz9',
        '批次重新命名專案裡的變數符號 zzz10',
        '掃描整個倉庫找出重複程式碼 zzz11',
        '依測試失敗自動修正原始碼錯誤 zzz12',
        '多一句不會被收的冗長描述 zzz13',
      ],
    }),
  ]);
  assert.equal(entries.t5.intents.length, 4);
});

test('T6 既有詞條不被覆蓋，其他 id 原封保留', () => {
  const existing = {
    keep: {
      tier: 1,
      epistemic: 'S',
      intents: [`這張既有的 LLM 句子保持不動 zzz14`],
      objects: ['原有物件'],
      actions: [],
      constraints: [],
      negative: [],
    },
  };
  const { entries } = compile(
    [makeTool('t6', { useCase_zh: `把 markdown 報告轉成可編輯的簡報檔案 zzz15` })],
    { seedEntries: existing },
  );
  assert.deepEqual(entries.keep, existing.keep, '非目標詞條必須 byte-level 不變');
  assert.equal(entries.t6.tier, 0);
  assert.equal(entries.t6.epistemic, 'V');
});

test('T7 用 --out 預覽時，正式版詞檔完全不動', () => {
  const before = createHash('sha256').update(readFileSync(REAL_WIKI)).digest('hex');
  compile([makeTool('t7', { useCase_zh: `把銷售數據轉成互動式長條圖並匯出 zzz16` })]);
  const after = createHash('sha256').update(readFileSync(REAL_WIKI)).digest('hex');
  assert.equal(after, before, '測試不得寫入 registry/compiled-entries.json');
});

test('T8 只有 intents 被改：objects／constraints／negative 仍照原樣帶過來', () => {
  const { entries } = compile([
    makeTool('t8', {
      useCase_zh: `在終端機一鍵部署本地模型服務 zzz17`,
      capabilities: ['本機推論', 'CLI 介面'],
      category: 'AI 框架',
      negativeConstraints: [`不要用於 t8 的示範 zzz18`],
    }),
  ]);
  const e = entries.t8;
  assert.deepEqual(e.objects, ['本機推論', 'CLI 介面', 'AI 框架']);
  assert.deepEqual(e.constraints, ['npx', 'typescript']);
  assert.deepEqual(e.negative, [`不要用於 t8 的示範 zzz18`]);
  assert.deepEqual(e.actions, []);
});
