// 斷詞沿用引擎那把尺（見 findSelfDefeatingFacets 的註解）：本檔原本是零依賴的，
// 但這道檢查若自己實作一套切詞規則，門禁看到的詞彙邊界會和實際打分的邊界不一致。
import { tokenize } from './tokenize.js';

const CONTRACT_VERSION = '2.0';

const REQUIRED_FIELDS = [
  'id',
  'name',
  'url',
  'description',
  'category',
  'language',
  'triggers',
  'status'
];

const WARNING_RULES = [
  {
    field: 'triggers',
    penalty: 15,
    check: (tool) => Array.isArray(tool.triggers) && tool.triggers.length >= 2,
    message: 'Add at least two trigger phrases so retrieval has enough matching surface.'
  },
  {
    field: 'description',
    penalty: 15,
    check: (tool) => typeof tool.description === 'string' && tool.description.trim().length >= 15,
    message: 'Expand the description to at least 15 characters.'
  },
  {
    field: 'useCase',
    penalty: 20,
    check: (tool) => typeof tool.useCase === 'string' && tool.useCase.trim().length > 0,
    message: 'Add a recommended use case.'
  },
  {
    field: 'negativeConstraints',
    penalty: 20,
    check: (tool) => Array.isArray(tool.negativeConstraints) && tool.negativeConstraints.length > 0,
    message: 'Add at least one negative constraint.'
  },
  {
    field: 'advantages',
    penalty: 15,
    check: (tool) => Array.isArray(tool.advantages) && tool.advantages.length > 0,
    message: 'Add at least one advantage.'
  }
];

// ── negativeFacets：結構化禁用約束（Batch 2，2026-10-03）────────────────
// 每筆 `[-+]<facet>:<value>`；`-` 排除（命中扣分）、`+` 要求（命中不扣分）。
// 極性在資料層消滅散文的雙重否定歧義（c61 教訓）。欄位 optional；
// 違反格式計 error——資料完整性問題不得靜默進檢索。
const FACET_WHITELIST = new Set([
  'platform', 'language', 'license', 'pricing', 'deployment',
  'ecosystem', 'format', 'scale', 'interface', 'integration',
]);
const FACET_ENTRY_RE = /^([-+])([a-z][a-z0-9-]*):([a-z0-9][a-z0-9 .+-]*)$/;
const FACET_MAX_ENTRIES = 6;
const FACET_MAX_VALUE_TOKENS = 3;

// ── 程度詞禁令（P1-b，2026-10-09）───────────────────────────────────────
// 實測根據（同一輪）：217 條 `-` 值去重 171 個，只有 9 個以拉丁原形出現在評測
// 集 267 題的查詢裡；高頻值反而是 production/simple/large/trivial 這類分級判斷。
// 分級詞沒有所指——使用者在任一種語言都不會用「trivial」描述需求，於是結構化
// 約束永遠點不燃（`-` 路徑在 257 題只產生 14 筆扣分事件）。留空比放一個查不
// 到的值誠實（同 advantages:[] 的取捨）。
//
// 收錄資格（詞級）：只有「沒有所指、純粹分級」的詞進清單。以下刻意**不進**，
// 因為它們指得出具體狀態／物件，使用者真的會說：
//   real-time（即時）、offline（離線）、managed-cloud（託管）、headless（無頭）、
//   enterprise（企業）、production（生產環境）、distributed、embedded、static、
//   streaming、proprietary、commercial、regulated、hipaa-compliance、low-level、
//   high-throughput、low-resource、security-critical、compliance-sensitive。
const FACET_VAGUE_TOKENS = new Set([
  'simple', 'trivial', 'quick', 'easy', 'basic', 'advanced', 'beginner',
  'comprehensive', 'niche', 'professional', 'performance', 'realistic',
  'premium', 'standalone', 'manual', 'customized', 'collaborative', 'complex',
  'large', 'small', 'tiny', 'huge', 'massive', 'single', 'lightweight',
  'robust', 'scalable', 'intuitive', 'fast', 'slow', 'general',
]);
// 複合值整段比對：拆詞後每塊都合法（ready／to／use），但合起來仍是分級判斷，
// 故以整值列入。
// ⚠️ 曾在這裡多塞了 low-level／high-throughput／low-resource／security-critical／
// compliance-sensitive 五個——它們與下方正例 real-time／offline 同類，指的是一個
// 使用者真的會說出口的狀態（底層、高吞吐、資源受限、安全關鍵、合規敏感），
// 依同一標準必須放行。判定標準只有一條：**有沒有所指**，不是詞長或語氣。
const FACET_VAGUE_VALUES = new Set([
  'ready-to-use', 'complete-history', 'neutral-design',
  'single-step', 'quick-reference', 'production-grade', 'end-user', 'high-quality',
]);

export function validateNegativeFacets(value) {
  if (value === null || value === undefined) return [];
  if (!Array.isArray(value)) return ['negativeFacets 必須是字串陣列'];
  if (value.length > FACET_MAX_ENTRIES) return [`negativeFacets 不得超過 ${FACET_MAX_ENTRIES} 筆`];
  const errors = [];
  const seen = new Set();
  const polarities = new Map();
  for (const entry of value) {
    if (typeof entry !== 'string') {
      errors.push(`negativeFacets 條目必須是字串：${JSON.stringify(entry)}`);
      continue;
    }
    const m = entry.match(FACET_ENTRY_RE);
    if (!m) {
      errors.push(`negativeFacets 條目格式不符（需 [-+]facet:value，value ≤${FACET_MAX_VALUE_TOKENS} token）：${entry}`);
      continue;
    }
    if (!FACET_WHITELIST.has(m[2])) {
      errors.push(`negativeFacets facet 不在白名單：${m[2]}（${entry}）`);
      continue;
    }
    if (m[3].trim().split(/\s+/).length > FACET_MAX_VALUE_TOKENS) {
      errors.push(`negativeFacets value 超過 ${FACET_MAX_VALUE_TOKENS} 個 token：${entry}`);
      continue;
    }
    if (/(^|[\s.\-])(?:non-|not|without)\b/i.test(m[3])) {
      // 極性歸 +/- 符號；「-ecosystem:not bootstrap」是雙重否定復活（c61 教訓的結構化變體）。
      // 實測兩種漏網寫法：獨立字 not、接在連字號後面的 -non-。
      errors.push(`negativeFacets value 不得含否定詞（non-/not/without）——極性請用 +/- 符號表達：${entry}`);
      continue;
    }
    // 程度詞禁令：見上方 FACET_VAGUE_TOKENS 的實測根據與收錄資格。
    const valueTokens = m[3].toLowerCase().split(/[\s.\-]+/).filter(Boolean);
    const vague = valueTokens.find((t) => FACET_VAGUE_TOKENS.has(t))
      || (FACET_VAGUE_VALUES.has(m[3].toLowerCase().trim()) ? m[3].trim() : '');
    if (vague) {
      errors.push(`negativeFacets value 是程度詞（無所指、任何語言都點不燃），請改寫成可比的對象或刪除該條：${entry}（程度詞：${vague}）`);
      continue;
    }
    const seenKey = m[3].trim().toLowerCase();
    const pairKey = `${m[2]}:${seenKey}`;
    const prior = polarities.get(pairKey);
    if (prior && prior !== m[1]) {
      // 同一個 facet:value 同時被排除與要求 = 零判斷空間的資料缺陷。
      // 實例（2026-10-09 掃全庫）：firecrawl-cli-skills 帶 `-interface:cli` 又帶 `+interface:cli`。
      errors.push(`negativeFacets 極性矛盾（同 ${pairKey} 同時出現 - 與 +）：${entry}`);
      continue;
    }
    polarities.set(pairKey, m[1]);
    if (seen.has(entry)) {
      errors.push(`negativeFacets 重複條目：${entry}`);
      continue;
    }
    seen.add(entry);
  }
  return errors;
}

/**
 * 自我拆台檢查：`-` 條目的值詞彙若**全部**出現在該工具自己的 id／name／triggers，
 * 代表「這個工具不適合它自己」——命中時照樣扣分，等於把正解壓下去。
 *
 * 實測根據（同一版掃全庫）：寬口徑（再加 capabilities／advantages／useCase／tags）
 * 抓 10 筆，其中 7 筆是合法的相鄰領域排除（storybook 排除 backend 等）；
 * 嚴口徑 3 筆全是真自指（seedance2-skill `-platform:seedance 1`、opencv
 * `-platform:deep-learning`、firecrawl-cli-skills `-interface:cli`）。
 * 因此：只用嚴口徑，且回 **warning**（不是 error）——誤判的代價是工程師關掉門禁。
 *
 * 斷詞刻意沿用 `core/tokenize.js`（引擎打分用的同一把尺），否則門禁與實際
 * 會扣分的詞彙邊界不一致，檢查就只是形似。
 */
export function findSelfDefeatingFacets(tool) {
  const facets = Array.isArray(tool?.negativeFacets) ? tool.negativeFacets : [];
  if (facets.length === 0) return [];
  const identity = new Set(tokenize([tool.id, tool.name, ...(tool.triggers || [])].join(' ').toLowerCase()));
  const hits = [];
  for (const entry of facets) {
    if (typeof entry !== 'string' || entry.charCodeAt(0) !== 45 /* - */) continue;
    const colon = entry.indexOf(':');
    if (colon === -1) continue;
    const valueTokens = [...new Set(tokenize(entry.slice(colon + 1)))];
    if (valueTokens.length === 0) continue;   // 斷詞後為空（如純數字值）→ 交給格式規則，不在這裡誤報
    if (valueTokens.every((t) => identity.has(t))) hits.push({ entry, valueTokens });
  }
  return hits;
}

function hasValue(value) {
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'string') return value.trim().length > 0;
  return value !== null && value !== undefined;
}

function gradeFromScore(score) {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

function issue(field, message, severity = 'warning') {
  return { field, message, severity };
}

export function scoreToolMetadata(tool) {
  const validation = validateToolContract(tool);
  return {
    contractVersion: validation.contractVersion,
    qualityScore: validation.qualityScore,
    grade: validation.grade
  };
}

export function validateToolContract(tool = {}) {
  const errors = [];
  const warnings = [];
  let score = 100;

  for (const field of REQUIRED_FIELDS) {
    if (!hasValue(tool[field])) {
      errors.push(issue(field, `Missing required field: ${field}`, 'error'));
      score -= 25;
    }
  }

  for (const rule of WARNING_RULES) {
    if (!rule.check(tool)) {
      warnings.push(issue(rule.field, rule.message));
      score -= rule.penalty;
    }
  }

  for (const msg of validateNegativeFacets(tool.negativeFacets)) {
    errors.push(issue('negativeFacets', msg, 'error'));
    score -= 25;
  }

  for (const hit of findSelfDefeatingFacets(tool)) {
    warnings.push(issue('negativeFacets',
      `疑似自我拆台：${hit.entry} 的值詞彙（${hit.valueTokens.join(', ')}）全部出現在本工具的 id／name／triggers，等於「不適合自己」。請改寫成被排除的具體對象或刪除該條`));
    score -= 5;
  }

  const qualityScore = Math.max(0, Math.min(100, score));

  return {
    contractVersion: CONTRACT_VERSION,
    qualityScore,
    grade: gradeFromScore(qualityScore),
    errors,
    warnings
  };
}

export function assessRegistryContract(registry, options = {}) {
  const tools = Array.isArray(registry?.tools) ? registry.tools : [];
  const lowQualityThreshold = options.lowQualityThreshold ?? 70;
  const results = tools.map((tool) => ({
    tool,
    validation: validateToolContract(tool)
  }));

  const errors = results.flatMap(({ tool, validation }) =>
    validation.errors.map((error) => ({
      toolId: tool?.id ?? tool?.name ?? 'unknown',
      ...error
    }))
  );

  const warnings = results.flatMap(({ tool, validation }) =>
    validation.warnings.map((warning) => ({
      toolId: tool?.id ?? tool?.name ?? 'unknown',
      ...warning
    }))
  );

  const lowQualityTools = results
    .filter(({ validation }) => validation.qualityScore < lowQualityThreshold)
    .map(({ tool, validation }) => ({
      id: tool?.id ?? 'unknown',
      name: tool?.name ?? 'Unknown Tool',
      qualityScore: validation.qualityScore,
      grade: validation.grade,
      warnings: validation.warnings.map((warning) => warning.field)
    }))
    .sort((a, b) => a.qualityScore - b.qualityScore || a.id.localeCompare(b.id));

  const scoreTotal = results.reduce((sum, { validation }) => sum + validation.qualityScore, 0);
  const averageQualityScore = tools.length === 0 ? 0 : Number((scoreTotal / tools.length).toFixed(1));

  return {
    contractVersion: CONTRACT_VERSION,
    totalTools: tools.length,
    averageQualityScore,
    errorCount: errors.length,
    warningCount: warnings.length,
    errors,
    warnings,
    lowQualityTools
  };
}
