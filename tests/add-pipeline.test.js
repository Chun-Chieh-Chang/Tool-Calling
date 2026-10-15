import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildCandidate, resetPipelineReady } from '../pipeline/add-pipeline.js';
import { validateToolEntry } from '../worker/index.js';
import { pickEndpoint } from '../pipeline/add-tool-dialog.js';

// ─── 離線 stub：不打任何網路（npm test 必須離線可跑）────────────────────────
//
// buildCandidate 的呼叫鏈：
//   ensurePipelineReady → fetch('./registry/categories.json')   （讀真實檔案）
//   scan（scripts/scan-tool.js）
//     → api.github.com/repos/acme/widget            （repo 資訊）
//     → api.github.com/repos/acme/widget/contents/  （根目錄清單）
//     → raw.githubusercontent.com/.../package.json  （封裝證據）
//     → raw.githubusercontent.com/.../README.md     （GitHub 描述不可用時的後備）
//   enrichToolFromReadme（core/tool-enricher.js，僅傳入 apiKey 時）
//     → apihub.agnes-ai.com/v1/chat/completions     （LLM）
const REPO = 'https://github.com/acme/widget';

const LLM_REPLY = {
  choices: [{
    message: {
      content: JSON.stringify({
        useCase: 'When you need to scaffold a CLI widget quickly in CI.',
        advantages: ['Zero runtime dependencies', 'Ships prebuilt binaries'],
        capabilities: ['cli', 'scaffold'],
        negativeConstraints: [],
        // 模型照樣吐了 _zh——skipZh 必須把它們全部丟掉
        description_zh: '腳手架工具',
        useCase_zh: '当你需要在 CI 中快速搭建 CLI widget', // allow-simplified：fixture 模擬 LLM 輸出簡體（驗證轉換路徑，改繁體就測不到）
        advantages_zh: ['零运行时依赖'], // allow-simplified：同上
      }),
    },
  }],
};

function installFetchStub({ ghUsable = true } = {}) {
  const real = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.includes('categories.json')) {
      return {
        ok: true,
        json: async () => JSON.parse(readFileSync(new URL('../registry/categories.json', import.meta.url), 'utf8')),
      };
    }
    if (u.includes('chat/completions')) {
      return { ok: true, json: async () => LLM_REPLY };
    }
    if (u.includes('/contents/')) {
      return { ok: true, json: async () => [{ name: 'package.json', type: 'file' }, { name: 'README.md', type: 'file' }] };
    }
    if (u.includes('raw.githubusercontent.com') && u.endsWith('/package.json')) {
      return { ok: true, text: async () => JSON.stringify({ name: 'widget-cli', bin: { widget: './cli.js' } }) };
    }
    if (u.includes('raw.githubusercontent.com') && u.endsWith('/README.md')) {
      return { ok: true, text: async () => '# Widget\n\nA friendly CLI widget scaffolder for demos and CI pipelines.' };
    }
    if (u.endsWith('/repos/acme/widget')) {
      return {
        ok: true,
        json: async () => ({
          description: ghUsable
            ? 'A friendly CLI widget scaffolder for demos and CI pipelines.'
            : 'short',
          language: 'TypeScript',
          topics: ['cli', 'scaffold', 'widget-cli'],
        }),
      };
    }
    return { ok: false, status: 404, json: async () => null, text: async () => '' };
  };
  return () => { globalThis.fetch = real; };
}

test('buildCandidate（無 key）：掃描階段產出合法 experimental 條目', async () => {
  const restore = installFetchStub();
  try {
    const { tool, enriched } = await buildCandidate(REPO);
    assert.strictEqual(enriched, false);
    assert.strictEqual(tool.id, 'widget');
    assert.strictEqual(tool.status, 'experimental', '生命週期鐵律：一律 experimental');
    assert.strictEqual(tool.install.method, 'npx', 'package.json 有 bin → npx（封裝證據）');
    assert.strictEqual(tool.install.command, 'npx widget-cli');
    assert.ok(Array.isArray(tool.advantages) && tool.advantages.length === 0, '掃描階段 advantages 誠實留空');
    const verdict = validateToolEntry(tool);
    assert.strictEqual(verdict.ok, true, JSON.stringify(verdict.errors));
  } finally {
    restore();
    resetPipelineReady();
  }
});

test('buildCandidate（有 key）：LLM 補齊生效，且 *_zh 一律不產生（skipZh）', async () => {
  const restore = installFetchStub();
  try {
    const { tool, enriched } = await buildCandidate(REPO, 'test-key-123');
    assert.strictEqual(enriched, true);
    assert.ok(tool.useCase && tool.useCase !== tool.description, 'useCase 不可複製 description');
    assert.deepStrictEqual(tool.advantages, ['Zero runtime dependencies', 'Ships prebuilt binaries']);
    // 🔴 skipZh：中文欄位留白，交給合併後的 translate:zh——不可出現任何 *_zh 鍵
    const zhKeys = Object.keys(tool).filter((k) => k.endsWith('_zh'));
    assert.deepStrictEqual(zhKeys, [], '不得產生 *_zh 欄位');
    const verdict = validateToolEntry(tool);
    assert.strictEqual(verdict.ok, true, JSON.stringify(verdict.errors));
  } finally {
    restore();
    resetPipelineReady();
  }
});

test('buildCandidate：GitHub 描述不可用時回退 README 首段', async () => {
  const restore = installFetchStub({ ghUsable: false });
  try {
    const { tool } = await buildCandidate(REPO);
    assert.match(tool.description, /CLI widget scaffolder/);
    assert.ok(!tool.description.startsWith('#'), 'Markdown 標記必須清掉');
  } finally {
    restore();
    resetPipelineReady();
  }
});

test('buildCandidate：非 GitHub URL 拋出可讀錯誤', async () => {
  const restore = installFetchStub();
  try {
    await assert.rejects(() => buildCandidate('https://gitlab.com/acme/widget'), /GitHub/);
  } finally {
    restore();
    resetPipelineReady();
  }
});

// ─── 2026-10-15：提名端點來源優先序（meta 優先、JSON 檔後備）──────────────────
// 為什麼要守：web/data/ 在 .gitignore 內，設定檔到不了 CI 的 Pages 建置；
// 若哪天有人把「meta 優先」改掉（只剩 JSON 檔），Pages 上會靜默變成未設定。
test('pickEndpoint：meta 優先於 JSON 檔', () => {
  assert.equal(pickEndpoint('https://w.workers.dev', 'https://old.example.com'), 'https://w.workers.dev');
});

test('pickEndpoint：meta 空／只有空白時退回 JSON 檔', () => {
  assert.equal(pickEndpoint('', 'https://file.example.com'), 'https://file.example.com');
  assert.equal(pickEndpoint('   ', 'https://file.example.com'), 'https://file.example.com');
});

test('pickEndpoint：兩者皆空回空字串（＝未設定，對話框顯示說明不送請求）', () => {
  assert.equal(pickEndpoint('', ''), '');
  assert.equal(pickEndpoint(undefined, undefined), '');
});
