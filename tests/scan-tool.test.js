import test from 'node:test';
import assert from 'node:assert/strict';
import {
  detectInstall,
  stripMarkdown,
  isBoilerplateParagraph,
  parseRepoUrl,
  truncateAtWord,
} from '../scripts/scan-tool.js';

// ─── 測試替身：模擬 GitHub API，全程不打網路（npm test 必須離線可跑）─────────
//
// listRootFiles 打 `/contents/`，fetchRepoFile 打 raw.githubusercontent.com。
function mockFetch({ files = [], fileContents = {}, fail = false } = {}) {
  return async (url) => {
    if (fail) {
      return { ok: false, status: 403, json: async () => null, text: async () => '' };
    }
    if (url.includes('/contents/')) {
      return {
        ok: true,
        json: async () => files.map((name) => ({ name, type: 'file' })),
        text: async () => '',
      };
    }
    const hit = Object.keys(fileContents).find((k) => url.endsWith(`/${k}`));
    if (hit) return { ok: true, json: async () => null, text: async () => fileContents[hit] };
    return { ok: false, status: 404, json: async () => null, text: async () => '' };
  };
}

const REPO = 'https://github.com/acme/widget';
const noTopics = [];

// ─── parseRepoUrl ───────────────────────────────────────────────────────────

test('parseRepoUrl: 解析 owner/repo', () => {
  assert.deepEqual(parseRepoUrl(REPO), { owner: 'acme', repo: 'widget' });
});

test('parseRepoUrl: 子路徑或非 GitHub URL 回傳 null', () => {
  assert.equal(parseRepoUrl('https://github.com/acme/widget/tree/main/sub'), null);
  assert.equal(parseRepoUrl('https://gitlab.com/acme/widget'), null);
  assert.equal(parseRepoUrl(''), null);
});

// ─── stripMarkdown：ATX 標題必須整行移除 ────────────────────────────────────

test('stripMarkdown: 移除黏在段首的 H1 標題（Z-Anatomy 實例）', () => {
  // README 用「行尾兩個空白」軟換行，H1 與內文在 split('\n\n') 眼中是同一段
  const raw = '# Z-Anatomy\nThis repository contains the Blender template of the Z-Anatomy Project.';
  const out = stripMarkdown(raw);
  assert.ok(!out.includes('Z-Anatomy\n'), '標題行應被移除');
  assert.ok(out.startsWith('This repository contains'), `實際: ${out}`);
});

test('stripMarkdown: 多層級標題與行尾空白都要清掉', () => {
  assert.equal(stripMarkdown('## Installation\n\nRun npm install'), 'Run npm install');
});

test('stripMarkdown: "#1 工具" 不是標題，不可誤刪', () => {
  // 標題規則要求「# + 空白」，`#1` 不符 → 必須保留
  assert.equal(stripMarkdown('#1 tool for JSON'), '#1 tool for JSON');
});

test('stripMarkdown: 移除粗體、行內程式碼、連結與圖片', () => {
  const out = stripMarkdown('A **fast** `cli` [link](https://x.com) ![img](https://y.png) tool');
  assert.equal(out, 'A fast cli link tool');
});

test('stripMarkdown: 清掉空文字連結徽章（Z-Anatomy 曾中招）', () => {
  assert.equal(stripMarkdown('[](https://youtube.com/watch?v=x)'), '');
});

// ─── isBoilerplateParagraph：只擋明確的公告式開頭 ───────────────────────────

test('isBoilerplateParagraph: 更新公告與授權聲明視為樣板文', () => {
  assert.equal(isBoilerplateParagraph('The repository has been restructured to simplify cloning.'), true);
  assert.equal(isBoilerplateParagraph('Note: this project is in beta.'), true);
  assert.equal(isBoilerplateParagraph('This project is licensed under MIT.'), true);
  assert.equal(isBoilerplateParagraph('Contributions are welcome!'), true);
});

test('isBoilerplateParagraph: 有效的功能說明不可被誤殺', () => {
  // 迴歸：Z-Anatomy 的首段以 "This repository contains" 開頭，是有效描述
  assert.equal(
    isBoilerplateParagraph('This repository contains the Blender template of the Z-Anatomy Project.'),
    false,
  );
  assert.equal(isBoilerplateParagraph('Open-source 3D anatomy explorer with 2,234 meshes.'), false);
});

test('isBoilerplateParagraph: 空字串視為樣板文（無資訊量）', () => {
  assert.equal(isBoilerplateParagraph(''), true);
  assert.equal(isBoilerplateParagraph('   '), true);
});

// ─── truncateAtWord：不可把詞切一半 ────────────────────────────────────────

test('truncateAtWord: 不超過上限時原樣回傳', () => {
  assert.equal(truncateAtWord('short text', 200), 'short text');
});

test('truncateAtWord: 在詞邊界截斷並補省略號（Z-Anatomy 實例）', () => {
  const s = "This repository contains the Blender template of the Z-Anatomy Project. It includes models derived from 'BodyParts3D' and definitions that heavily rely on Wikipedia. It was made by Gauthier Kervyn (design, 3D, anatomy) and Marcin Zielinski (Python script).";
  const out = truncateAtWord(s, 200);
  assert.ok(out.length <= 200, `長度 ${out.length} 應 <= 200`);
  assert.ok(out.endsWith('…'), '應以省略號標示截斷');
  assert.ok(!out.includes('(de…'), '不可留下切一半的詞');
  assert.ok(out.includes('Wikipedia'), '應保留完整句子');
});

test('truncateAtWord: 清掉截斷處殘留的標點與左括號', () => {
  assert.equal(truncateAtWord('alpha beta gamma (delta epsilon', 20), 'alpha beta gamma…');
});

test('truncateAtWord: 沒有空白可切時仍要回傳非空字串', () => {
  const out = truncateAtWord('a'.repeat(50), 10);
  assert.ok(out.length > 0);
  assert.ok(out.length <= 11);
});

// ─── detectInstall：必須有封裝證據才給套件指令 ──────────────────────────────

test('detectInstall: 資源清單類 repo 不給安裝指令', async () => {
  const inst = await detectInstall(
    REPO, 'markdown',
    'A curated list of awesome things for developers', ['awesome-list'],
    mockFetch(),
  );
  assert.equal(inst.method, 'none');
});

test('detectInstall: package.json 有 bin 且非 private → npx', async () => {
  const inst = await detectInstall(
    REPO, 'typescript', 'A CLI that does something useful for developers', noTopics,
    mockFetch({
      files: ['package.json', 'README.md'],
      fileContents: { 'package.json': JSON.stringify({ name: 'widget-cli', bin: { widget: './cli.js' } }) },
    }),
  );
  assert.equal(inst.method, 'npx');
  assert.equal(inst.command, 'npx widget-cli');
});

test('detectInstall: package.json 為 private 應用程式 → git-clone（anatomy 迴歸）', async () => {
  // 迴歸：thebuggeddev/anatomy 是 Next.js 應用程式，舊版會產生 `npx anatomy`
  const inst = await detectInstall(
    REPO, 'typescript', 'An interactive 3D human anatomy explorer built with three.js', noTopics,
    mockFetch({
      files: ['package.json', 'app', 'next.config.ts'],
      fileContents: { 'package.json': JSON.stringify({ name: 'site-creator-vinext-starter', private: true }) },
    }),
  );
  assert.equal(inst.method, 'git-clone');
  assert.ok(!inst.command.includes('npx'), '不可產生不存在的套件指令');
});

test('detectInstall: package.json 沒有 bin → git-clone（非 CLI 套件）', async () => {
  const inst = await detectInstall(
    REPO, 'javascript', 'A library that renders charts in the browser for apps', noTopics,
    mockFetch({
      files: ['package.json'],
      fileContents: { 'package.json': JSON.stringify({ name: 'chart-lib' }) },
    }),
  );
  assert.equal(inst.method, 'git-clone');
});

test('detectInstall: pyproject.toml → pip', async () => {
  const inst = await detectInstall(
    REPO, 'python', 'A differentiable human body mesh model written in PyTorch', noTopics,
    mockFetch({ files: ['pyproject.toml', 'README.md'] }),
  );
  assert.equal(inst.method, 'pip');
  assert.equal(inst.command, `pip install git+${REPO}.git`);
});

test('detectInstall: setup.py → pip', async () => {
  const inst = await detectInstall(
    REPO, 'python', 'A utility library for processing data files quickly', noTopics,
    mockFetch({ files: ['setup.py'] }),
  );
  assert.equal(inst.method, 'pip');
});

test('detectInstall: python 但沒有封裝檔 → git-clone（Z-Anatomy 迴歸）', async () => {
  // 迴歸：Z-Anatomy 是 Blender 範本（只有 .py 腳本），舊版會產生 pip install
  const inst = await detectInstall(
    REPO, 'python', 'Blender template of the Z-Anatomy Project with anatomy models', noTopics,
    mockFetch({ files: ['Anatomy-shortcuts.py', 'Readme.md', 'Z-Anatomy.zip'] }),
  );
  assert.equal(inst.method, 'git-clone');
  assert.ok(!inst.command.includes('pip'), '不可產生裝不起來的 pip 指令');
});

test('detectInstall: Cargo.toml → cargo', async () => {
  const inst = await detectInstall(
    REPO, 'rust', 'A CLI proxy that cuts token usage for dev commands', noTopics,
    mockFetch({ files: ['Cargo.toml', 'src'] }),
  );
  assert.equal(inst.method, 'cargo');
});

test('detectInstall: composer.json → composer', async () => {
  const inst = await detectInstall(
    REPO, 'php', 'A PHP package for handling payments in web applications', noTopics,
    mockFetch({ files: ['composer.json'] }),
  );
  assert.equal(inst.method, 'composer');
  assert.equal(inst.command, 'composer require acme/widget');
});

test('detectInstall: 查不到檔案清單（限流）→ git-clone，不猜套件管理器', async () => {
  const inst = await detectInstall(
    REPO, 'python', 'A tool that processes large datasets in parallel', noTopics,
    mockFetch({ fail: true }),
  );
  assert.equal(inst.method, 'git-clone');
});

test('detectInstall: package.json 內容壞掉 → git-clone，不拋錯', async () => {
  const inst = await detectInstall(
    REPO, 'typescript', 'A tool that helps developers automate their workflow', noTopics,
    mockFetch({ files: ['package.json'], fileContents: { 'package.json': '{ not json' } }),
  );
  assert.equal(inst.method, 'git-clone');
});

test('detectInstall: 任何情況都必須回傳可用的 repoUrl', async () => {
  const cases = [
    mockFetch(),
    mockFetch({ fail: true }),
    mockFetch({ files: ['pyproject.toml'] }),
    mockFetch({ files: ['package.json'], fileContents: { 'package.json': '{"bin":"./x.js"}' } }),
  ];
  for (const f of cases) {
    const inst = await detectInstall(REPO, 'python', 'A tool that does something useful here', noTopics, f);
    assert.equal(inst.repoUrl, REPO);
    assert.equal(typeof inst.command, 'string');
    assert.ok(inst.command.length > 0);
  }
});
