import fs from 'node:fs';
import path from 'node:path';

/**
 * scripts/browser-module-graph.js — 瀏覽器端模組依賴圖（建置用，Node-only）
 *
 * 為什麼需要（2026-10-19 RCA）
 * ────────────────────────────
 * `scripts/build-web.js` 原本用**手寫清單**把 `core/`、`scripts/` 的檔案複製進
 * `dist/`。2026-10-15 Q4=A 讓 `core/search-engine.js` 新增
 * `import { normalizeQuery } from './query-normalize.js'`，清單沒有同步，
 * 於是 GitHub Pages 上 `core/query-normalize.js` 回 404 → `app.js` 的靜態
 * import 鏈整條失敗 → 頁面完全沒有初始化（KPI 顯示 `--`、0 筆工具）。
 *
 * 本機看不出來：`npm start` 由 `web/server.js` 直接從 repo 根目錄供應檔案，
 * 不經過 `dist/`。只有部署後的靜態站會壞。
 *
 * 解法：不要維護清單。從真正的瀏覽器入口出發，沿相對 import 遞迴展開，
 * 原樣複製。任何相對 import 解析不到就**讓 build 失敗**——寧可 CI 紅燈，
 * 也不要部署一個白畫面。
 */

/**
 * 部署樹（dist/）相對路徑 → 原始碼樹相對路徑。
 * `web/` 底下的檔案在 dist 是**根目錄**檔案（其 `./core/...` import 以部署樹
 * 根為基準），因此讀檔時要換算回 repo 內的實際位置。
 */
export const DIST_TO_SRC = {
  'app.js': 'web/app.js',
  'persist-cache.js': 'web/persist-cache.js',
  'behavior-tracker.js': 'web/behavior-tracker.js',
};

/** 瀏覽器端入口（dist 相對路徑）。 */
export const BROWSER_ENTRIES = [
  'app.js',
  'pipeline/add-tool-dialog.js',
  'worker/index.js',
];

// 靜態 import／export-from／動態 import('...')。動態 import 也要收：
// 例如 app.js 以 './pipeline/add-tool-dialog.js' 動態載入提名對話框。
const SPECIFIER_RE =
  /(?:^|[\s;{}()])(?:import|export)\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

const toPosix = (p) => p.replace(/\\/g, '/');

/**
 * 收集從 entries 出發、經相對路徑可達的所有模組。
 * 非相對（`node:fs`、`opencc-js`）一律忽略：由執行環境／CDN 提供。
 *
 * @param {string[]} entries 部署樹相對入口
 * @param {{rootDir: string, toSource?: (distRel: string) => string}} options
 * @returns {{deps: string[], sources: Map<string,string>, missing: string[]}}
 *   deps 為部署樹相對路徑（可直接複製到 dist/）；sources 為 distRel → srcRel
 */
export function collectRelativeDeps(entries, { rootDir, toSource = (x) => x }) {
  const sources = new Map();
  const missing = new Set();
  const queue = entries.map(toPosix);

  while (queue.length) {
    const distRel = queue.shift();
    if (sources.has(distRel)) continue;
    const srcRel = toSource(distRel);
    sources.set(distRel, srcRel);

    const abs = path.join(rootDir, srcRel);
    if (!fs.existsSync(abs)) {
      missing.add(srcRel);
      continue;
    }

    const source = fs.readFileSync(abs, 'utf8');
    for (const m of source.matchAll(SPECIFIER_RE)) {
      const spec = m[1] || m[2];
      if (!spec || !spec.startsWith('.')) continue;
      // 以部署樹座標解析：瀏覽器實際請求的就是這個路徑。
      queue.push(toPosix(path.normalize(path.join(path.dirname(distRel), spec))));
    }
  }

  return {
    deps: [...sources.keys()].sort(),
    sources,
    missing: [...missing].sort(),
  };
}

/**
 * 把入口與其相對依賴複製到 dist（保留部署樹相對路徑）。
 * 解析不到任何一支就丟錯：部署白畫面比建置失敗更難查。
 *
 * @param {{rootDir: string, distDir: string}} options
 * @returns {{copied: number, deps: string[]}}
 */
export function copyBrowserModules({ rootDir, distDir }) {
  const { deps, sources, missing } = collectRelativeDeps(BROWSER_ENTRIES, {
    rootDir,
    toSource: (distRel) => DIST_TO_SRC[distRel] || distRel,
  });
  if (missing.length > 0) {
    throw new Error(
      `瀏覽器模組依賴解析失敗，dist/ 會是白畫面，中止建置：\n  ${missing.join('\n  ')}`,
    );
  }
  for (const distRel of deps) {
    const target = path.join(distDir, distRel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(rootDir, sources.get(distRel)), target);
  }
  return { copied: deps.length, deps };
}
