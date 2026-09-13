#!/usr/bin/env node
/**
 * query-intent.js — 查詢意圖三元組抽取（純規則，唯讀）
 *
 * 設計目標（docs/agent-retrieval-design.md §5.2 / Option C）：
 * 從 agent 的自然語言查詢抽出「動作 + 物件 + 約束」三元組，
 * 讓 agent-retrieval 的四維評分可以「分路檢索」：
 *   物件 tokens → 加大 V2（capability）權重
 *   約束 tokens → 加大 V4（constraint）權重
 *   動作 tokens → V1/V2 通用
 *
 * 純規則、無外部模型，詞表可維護。
 */

// ── 詞表 ─────────────────────────────────────────────────────────────────
// 動作詞：agent 常用動詞，命中任一即標記 actionSignal
const ACTION_TERMS = new Set([
  // 資料處理
  'clean', 'dedupe', 'deduplicate', 'normalize', 'transform', 'convert',
  'extract', 'parse', 'import', 'export', 'merge', 'split', 'filter',
  'aggregate', 'summarize', 'summarise', 'rewrite', 'translate',
  // 開發
  'deploy', 'build', 'test', 'run', 'lint', 'format', 'migrate',
  'debug', 'profile', 'benchmark', 'compile', 'package', 'install',
  'publish', 'release', 'ship', 'scaffold', 'generate',
  // 文件
  'write', 'draft', 'compose', 'document', 'annotate', 'index',
  'search', 'find', 'lookup', 'retrieve', 'fetch', 'scrape',
  'crawl', 'monitor', 'track', 'alert', 'report',
  // 媒體
  'transcribe', 'caption', 'transcode', 'resize', 'compress', 'crop',
  'render', 'screenshot', 'record', 'stream', 'broadcast',
]);

// 物件詞：agent 常提及的資料／檔案／實體類型，命中任一即標記 objectSignal
const OBJECT_TERMS = new Set([
  // 檔案格式
  'pdf', 'csv', 'json', 'jsonl', 'xml', 'yaml', 'yml', 'html',
  'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'epub', 'md',
  'markdown', 'txt', 'tsv', 'parquet', 'sqlite', 'avro',
  // 媒體
  'video', 'audio', 'image', 'photo', 'picture', 'gif', 'svg',
  'mp4', 'wav', 'mp3', 'png', 'jpg', 'jpeg', 'pdf',
  // 實體
  'stock', 'ticker', 'chart', 'table', 'dashboard', 'report',
  'document', 'email', 'message', 'log', 'dataset', 'model',
  'api', 'service', 'cluster', 'pod', 'container', 'pipeline',
  'function', 'class', 'method', 'module', 'component',
]);

// 約束詞：技術部署／環境限制，命中任一即標記 constraintSignal
const CONSTRAINT_TERMS = new Set([
  // 語言／環境
  'node', 'python', 'java', 'rust', 'go', 'ruby', 'php', 'c',
  'kubernetes', 'k8s', 'docker', 'linux', 'macos', 'windows',
  'cloud', 'aws', 'gcp', 'azure', 'firebase', 'vercel',
  // 執行約束
  'headless', 'offline', 'local', 'serverless', 'edge',
  'realtime', 'batch', 'streaming', 'async', 'synchronous',
  'encrypted', 'signed', 'versioned', 'immutable',
  // 规模約束
  'large', 'small', 'fast', 'slow', 'low-latency', 'high-throughput',
  'real-time', 'memory-efficient',
]);

// 通用詞（語境詞，不能靠這類詞拉高任何維度）
// 與 agent-retrieval.js 的 GENERIC_TERMS 保持一致，避免兩邊詞表脫節。
const GENERIC_TERMS = new Set([
  'data', 'dataset', 'model', 'tool', 'agent', 'ai', 'api', 'cli',
  'web', 'app', 'service', 'plugin', 'engine', 'framework', 'library',
  'large', 'small', 'fast', 'quick', 'easy', 'simple', 'basic',
]);

/**
 * 抽取查詢意圖三元組
 * @param {string} query - 原始查詢（不區分大小寫）
 * @returns {{
 *   action: boolean, object: boolean, constraint: boolean,
 *   actionTerms: string[], objectTerms: string[], constraintTerms: string[],
 *   tokens: string[],
 *   hasIntent: boolean,  // 至少命中一個非通用詞才視為「有意圖」
 * }}
 */
function extractIntent(query) {
  const norm = String(query || '').toLowerCase().trim();
  const tokens = norm.split(/[\s,;:()[\]{}'"`|/\\]+/).filter(Boolean);

  const actionTerms = [];
  const objectTerms = [];
  const constraintTerms = [];

  for (const tok of tokens) {
    const clean = tok.replace(/[.!?]+$/, ''); // 去標點
    if (!clean) continue;
    if (GENERIC_TERMS.has(clean)) continue; // 通用詞不計入任何維度
    if (ACTION_TERMS.has(clean)) {
      if (!actionTerms.includes(clean)) actionTerms.push(clean);
    }
    if (OBJECT_TERMS.has(clean)) {
      if (!objectTerms.includes(clean)) objectTerms.push(clean);
    }
    if (CONSTRAINT_TERMS.has(clean)) {
      if (!constraintTerms.includes(clean)) constraintTerms.push(clean);
    }
  }

  const hasIntent = actionTerms.length > 0 || objectTerms.length > 0 || constraintTerms.length > 0;

  return {
    action: actionTerms.length > 0,
    object: objectTerms.length > 0,
    constraint: constraintTerms.length > 0,
    actionTerms,
    objectTerms,
    constraintTerms,
    tokens,
    hasIntent,
  };
}

// ── 對外的意圖驅動權重調整 ─────────────────────────────────────────────────
// 基準權重（與 agent-retrieval.js 的 DIM_WEIGHTS 一致）：
//   V1=0.30, V2=0.35, V3=0.20, V4=0.15
//
// 意圖調整邏輯：
//   命中物件詞（object）→ V2 加權（功能端接），V1 不變
//   命中約束詞（constraint）→ V4 加權（部署端接），V2 微減
//   只有動作詞（action）  → V1/V2 等比，無特殊調整
//   無命中 → 回傳基準權重
//
// 調整幅度限制在 ±0.10 以內，避免意圖訊號過強壓過其他維度。
const BASE_WEIGHTS = { V1: 0.30, V2: 0.35, V3: 0.20, V4: 0.15 };

/**
 * 依意圖三元組計算調整後的維度權重
 * @param {ReturnType<typeof extractIntent>} intent
 * @returns {{ V1:number, V2:number, V3:number, V4:number }}
 */
function weightsForIntent(intent) {
  const w = { ...BASE_WEIGHTS };
  if (!intent?.hasIntent) return w;

  // 物件訊號：V2 加權，V3 微減（物件屬功能側）
  if (intent.object) {
    w.V2 += 0.10;
    w.V3 -= 0.05;
  }
  // 約束訊號：V4 加權，V2 微減（約束屬部署側）
  if (intent.constraint) {
    w.V4 += 0.10;
    w.V2 -= 0.05;
  }
  // 正常化：加總必須 = 1.0
  const sum = w.V1 + w.V2 + w.V3 + w.V4;
  for (const k of Object.keys(w)) w[k] = w[k] / sum;
  return w;
}

export { extractIntent, weightsForIntent, ACTION_TERMS, OBJECT_TERMS, CONSTRAINT_TERMS, GENERIC_TERMS, BASE_WEIGHTS };

// CLI 入口
if (process.argv[1] && process.argv[1].endsWith('query-intent.js')) {
  const q = process.argv.slice(2).join(' ') || 'scrape a JS-rendered dashboard and extract tables';
  const intent = extractIntent(q);
  const weights = weightsForIntent(intent);
  console.log(JSON.stringify({ query: q, intent, weights }, null, 2));
}
