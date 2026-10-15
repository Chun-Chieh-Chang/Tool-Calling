import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import {
  validateToolEntry,
  mergeToolEntry,
  buildBranchName,
  buildCommitMessage,
  buildPrBody,
  checkRateLimit,
  ENUMS,
} from '../worker/index.js';

// ─── 測試資料：一筆「合法候選人」（通過全部驗證、只帶 description_zh 警告） ───
function candidate(overrides = {}) {
  return {
    id: 'demo-tool',
    name: 'Demo Tool',
    url: 'https://github.com/demo/demo-tool',
    description: 'A demo tool for testing the nomination pipeline end to end.',
    category: '開發工具',
    language: 'typescript',
    triggers: ['demo', 'tool', 'testing'],
    install: { method: 'npx', command: 'npx demo-tool', repoUrl: 'https://github.com/demo/demo-tool' },
    capabilities: ['cli', 'testing'],
    useCase: 'When you need to test the nomination pipeline end to end.',
    advantages: ['Deterministic', 'Zero-dependency'],
    negativeConstraints: [],
    addedAt: '2026-10-15T00:00:00.000Z',
    status: 'experimental',
    ...overrides,
  };
}

// ─── validateToolEntry ────────────────────────────────────────────────────

test('validate：合法 candidate 通過，僅警告缺 description_zh', () => {
  const v = validateToolEntry(candidate());
  assert.strictEqual(v.ok, true, JSON.stringify(v.errors));
  assert.ok(v.warnings.some((w) => w.includes('description_zh')));
});

test('validate：缺必填欄位逐一列出', () => {
  const t = candidate();
  delete t.url;
  delete t.triggers;
  const v = validateToolEntry(t);
  assert.strictEqual(v.ok, false);
  assert.ok(v.errors.some((e) => e.includes('url')));
  assert.ok(v.errors.some((e) => e.includes('triggers')));
});

test('validate：生命週期鐵律——Web 提名必須 experimental', () => {
  const v = validateToolEntry(candidate({ status: 'active' }));
  assert.strictEqual(v.ok, false);
  assert.ok(v.errors.some((e) => e.includes('experimental')));
});

test('validate：install.method 不在 schema enum 被擋', () => {
  const v = validateToolEntry(candidate({ install: { method: 'teleport', command: 'x' } }));
  assert.strictEqual(v.ok, false);
  assert.ok(v.errors.some((e) => e.includes('install.method')));
});

test('validate：id 必須 kebab-case；url 必須 https github', () => {
  assert.strictEqual(validateToolEntry(candidate({ id: 'Demo_Tool' })).ok, false);
  assert.strictEqual(validateToolEntry(candidate({ url: 'http://github.com/demo/demo-tool' })).ok, false);
  assert.strictEqual(validateToolEntry(candidate({ url: 'https://gitlab.com/demo/demo-tool' })).ok, false);
});

test('validate：categories[0] 必須等同 category', () => {
  const ok = validateToolEntry(candidate({ categories: ['開發工具', 'AI 代理'] }));
  assert.strictEqual(ok.ok, true);
  const bad = validateToolEntry(candidate({ categories: ['AI 代理'] }));
  assert.strictEqual(bad.ok, false);
});

test('validate：useCase 複製 description 出警告（掃描階段複製品）', () => {
  const t = candidate();
  t.useCase = t.description;
  const v = validateToolEntry(t);
  assert.strictEqual(v.ok, true, '只警告不擋提交');
  assert.ok(v.warnings.some((w) => w.includes('useCase')));
});

test('validate：__ 內部暫存鍵外洩被擋', () => {
  const t = candidate();
  t.__readmeTextForVerify = 'leak';
  assert.strictEqual(validateToolEntry(t).ok, false);
});

test('validate：language 不在 enum 被擋；capabilities/triggers 超量被擋', () => {
  assert.strictEqual(validateToolEntry(candidate({ language: 'cobol' })).ok, false);
  assert.strictEqual(validateToolEntry(candidate({ capabilities: Array(7).fill('x') })).ok, false);
  assert.strictEqual(validateToolEntry(candidate({ triggers: Array(9).fill('x') })).ok, false);
});

// ─── mergeToolEntry ────────────────────────────────────────────────────────

test('merge：新工具附加到尾端，不動原陣列', () => {
  const original = [{ id: 'old', url: 'https://github.com/o/old' }];
  const { tools, duplicate } = mergeToolEntry(original, candidate());
  assert.strictEqual(duplicate, null);
  assert.strictEqual(tools.length, 2);
  assert.strictEqual(tools[1].id, 'demo-tool');
  assert.strictEqual(original.length, 1, '原陣列不可被改動');
});

test('merge：id 重複視為 duplicate', () => {
  const { duplicate } = mergeToolEntry([candidate()], candidate({ url: 'https://github.com/other/x' }));
  assert.ok(duplicate);
  assert.strictEqual(duplicate.field, 'id');
});

test('merge：url 重複（斜線／大小寫）視為 duplicate', () => {
  const existing = [{ id: 'existing-id', url: 'https://github.com/Demo/Demo-Tool/' }];
  const { duplicate } = mergeToolEntry(existing, candidate());
  assert.ok(duplicate);
  assert.strictEqual(duplicate.field, 'url');
});

// ─── 訊息與分支 ────────────────────────────────────────────────────────────

test('分支名與 commit 訊息符合 Conventional Commits', () => {
  assert.strictEqual(buildBranchName(candidate()), 'add/demo-tool');
  const msg = buildCommitMessage(candidate());
  assert.ok(msg.startsWith('chore(registry): 新增工具 demo-tool'), msg);
});

test('PR 內文含人工核對清單與來源資訊', () => {
  const body = buildPrBody(candidate(), { descriptionSource: 'github-description-or-readme', enriched: true });
  assert.match(body, /Web 提名/);
  assert.match(body, /description 與 useCase 是否同一主題/);
  assert.match(body, /npm run translate:zh/);
  assert.match(body, /LLM 補齊：是/);
});

// ─── 限流 ─────────────────────────────────────────────────────────────────

test('限流：第 5 次放行、第 6 次擋下', () => {
  const store = new Map();
  const now = 1_000_000;
  let last;
  for (let i = 0; i < 5; i++) last = checkRateLimit(store, '1.2.3.4', now);
  assert.strictEqual(last.allowed, true);
  const blocked = checkRateLimit(store, '1.2.3.4', now);
  assert.strictEqual(blocked.allowed, false);
  assert.ok(blocked.retryAfter > 0);
  // 窗口過後重置
  assert.strictEqual(checkRateLimit(store, '1.2.3.4', now + 3600_001).allowed, true);
});

// ─── 守門：enum 常數必須與 schema 一致 ────────────────────────────────────

test('守門：Worker enum 常數逐項等於 tool.schema.json', () => {
  const schema = JSON.parse(readFileSync(new URL('../registry/schemas/tool.schema.json', import.meta.url), 'utf8'));
  const toolDef = Object.values(schema.definitions).find((d) => d.properties && d.properties.install);
  const installEnum = toolDef.properties.install.properties.method.enum;
  assert.deepStrictEqual([...ENUMS.INSTALL_METHODS].sort(), [...installEnum].sort());
  assert.deepStrictEqual([...ENUMS.STATUS_VALUES].sort(), [...toolDef.properties.status.enum].sort());
  assert.deepStrictEqual([...ENUMS.LANGUAGES].sort(), [...toolDef.properties.language.enum].sort());
  for (const f of ENUMS.REQUIRED_FIELDS) {
    assert.ok(toolDef.required.includes(f), `schema.required 缺少 ${f}`);
  }
});
