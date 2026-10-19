import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BROWSER_ENTRIES,
  DIST_TO_SRC,
  collectRelativeDeps,
  copyBrowserModules,
} from '../scripts/browser-module-graph.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const toSource = (distRel) => DIST_TO_SRC[distRel] || distRel;

test('瀏覽器模組依賴圖：所有相對 import 都解析得到', () => {
  const { missing } = collectRelativeDeps(BROWSER_ENTRIES, { rootDir: ROOT, toSource });
  assert.deepEqual(missing, [], `解析不到的模組：${missing.join(', ')}`);
});

test('瀏覽器模組依賴圖：入口與 web/ 的 dist↔src 對應一致', () => {
  for (const [distRel, srcRel] of Object.entries(DIST_TO_SRC)) {
    assert.ok(statSync(join(ROOT, srcRel)).isFile(), `${srcRel} 不存在`);
    assert.ok(!distRel.startsWith('web/'), 'dist 路徑不可含 web/ 前綴');
  }
  assert.ok(BROWSER_ENTRIES.includes('app.js'));
});

test('回歸：core/query-normalize.js 必須被收進部署依賴', () => {
  // 2026-10-19 RCA：這支檔案沒進 dist，Pages 上 404，app.js 的 import 鏈
  // 整條失敗 → 工具庫顯示 0 筆。清單式複製漏過一次，這裡釘死。
  const { deps } = collectRelativeDeps(BROWSER_ENTRIES, { rootDir: ROOT, toSource });
  assert.ok(
    deps.includes('core/query-normalize.js'),
    `依賴清單缺少 core/query-normalize.js：\n${deps.join('\n')}`,
  );
});

test('動態 import 也被追蹤（提名對話框走動態載入）', () => {
  const { deps } = collectRelativeDeps(BROWSER_ENTRIES, { rootDir: ROOT, toSource });
  assert.ok(deps.includes('pipeline/add-tool-dialog.js'));
  assert.ok(deps.includes('pipeline/add-pipeline.js'));
});

test('copyBrowserModules：複製後每個模組的相對 import 在 dist 內都存在', () => {
  const distDir = mkdtempSync(join(tmpdir(), 'tc-dist-'));
  try {
    const { copied, deps } = copyBrowserModules({ rootDir: ROOT, distDir });
    assert.equal(copied, deps.length);

    for (const distRel of deps) {
      const abs = join(distDir, distRel);
      assert.ok(statSync(abs).isFile(), `${distRel} 未複製到 dist`);
    }

    // 逐檔重跑一次解析，確認「部署樹座標」自洽（瀏覽器會照這些路徑請求）
    const copiedDeps = collectRelativeDeps([...deps], { rootDir: distDir });
    assert.deepEqual(copiedDeps.missing, []);
    for (const dep of deps) assert.ok(copiedDeps.deps.includes(dep));
  } finally {
    rmSync(distDir, { recursive: true, force: true });
  }
});

test('部署樹不得殘留未追蹤的 .js（避免手動放檔繞過依賴圖）', () => {
  const distDir = mkdtempSync(join(tmpdir(), 'tc-dist-'));
  try {
    const { deps } = copyBrowserModules({ rootDir: ROOT, distDir });
    const walk = (dir) =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const full = join(dir, e.name);
        return e.isDirectory() ? walk(full) : [relative(distDir, full).replace(/\\/g, '/')];
      });
    const stray = walk(distDir).filter((f) => !deps.includes(f));
    assert.deepEqual(stray, [], `dist 出現未追蹤檔案：${stray.join(', ')}`);
  } finally {
    rmSync(distDir, { recursive: true, force: true });
  }
});
