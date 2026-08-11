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
