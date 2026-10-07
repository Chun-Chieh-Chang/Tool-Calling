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

export function validateNegativeFacets(value) {
  if (value === null || value === undefined) return [];
  if (!Array.isArray(value)) return ['negativeFacets 必須是字串陣列'];
  if (value.length > FACET_MAX_ENTRIES) return [`negativeFacets 不得超過 ${FACET_MAX_ENTRIES} 筆`];
  const errors = [];
  const seen = new Set();
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
    if (seen.has(entry)) {
      errors.push(`negativeFacets 重複條目：${entry}`);
      continue;
    }
    seen.add(entry);
  }
  return errors;
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
