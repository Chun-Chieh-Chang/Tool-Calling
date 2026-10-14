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
 *
 * 2026-10-14（Q4 實驗 Round 1）：補上中文詞表（繁簡並列、CJK 子字串匹配）。
 * 實測動機：評測集 267 筆全為中文查詢，此前 hasIntent 僅 16/267 觸發。
 * 效果與去留以此檔末的實驗記錄為準（DEV_LOG）。
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
  // 規模約束
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

// ─── 中文詞表（2026-10-14 Q4 實驗 Round 1） ───────────────────────────────
// 動機（實測）：registry/eval-queries.json v1.3.0 的 267 筆全是中文查詢，
// 而本檔原本只有英文詞表 → hasIntent 僅 16/267（6%）觸發，
// 意圖加權（weightsForIntent）在實戰中從未生效。
// 詞表策展來源：267 筆真實查詢的 CJK n-gram df 分佈（top bigram／trigram），
// 非憑空編造；高 df 非領域詞（幫我／系統／資料／程式…）進 GENERIC_ZH。
// 匹配規則：CJK token 用子字串包含（term 長度 ≥ 2，中文無空格需包容前後綴），
// 繁簡並列（opencc 不可無條件套用，見 MEMORY §4）。
// ⚠️ 只有 object／constraint 訊號會實際改變維度權重；action 訊號只影響
//    hasIntent（動作表主要供 CLI 診斷與未來擴充）。

const ACTION_TERMS_ZH = new Set([
  // 轉換／處理
  '轉換', '轉成', '轉檔', '翻譯', '擷取', '抽取', '解析', '清理', '去重',
  '產生', '生成', '製作', '壓縮', '轉寫',
  // 開發／維運
  '部署', '打包', '安裝', '發布', '發佈', '測試', '除錯', '偵錯', '遷移',
  // 檢索／監控
  '搜尋', '查詢', '尋找', '監控', '監測', '追蹤', '提醒',
  // 產出
  '摘要', '總結', '整理', '抓取', '爬蟲', '撰寫', '渲染', '繪圖', '截圖',
  '分析', '預測', '模擬', '同步', '備份', '視覺化', '評估', '整合', '自動化',
]);

const OBJECT_TERMS_ZH = new Set([
  '程式碼', '網頁', '網站', '瀏覽器', '檔案', '文件', '表格', '試算表',
  '簡報', '筆記', '資料庫', '資料集', '圖片', '照片', '影片', '音訊',
  '音樂', '字幕', '文字', '流程圖', '圖表', '儀表板', '架構圖', '心智圖',
  '圖形', '郵件', '電子郵件', '訊息', '日誌', '紀錄', '股票', '股價',
  '財務', '財報', '報告', '提示詞', '助手', '專案', '介面', '伺服器',
  '腳本', '函式', '函數', '元件', '模組', '外掛', '動畫', '漫畫', '插畫',
  // 簡體變體（繁簡不同的高頻項）
  '网页', '浏览器', '视频', '图片', '代码', '服务器', '数据库', '电子邮件',
  '图表', '仪表板', '流程图', '财报',
]);

const CONSTRAINT_TERMS_ZH = new Set([
  '開源', '安全', '資安', '手動', '快速', '即時', '批次', '串流',
  '本機', '本地', '離線', '雲端', '私有', '跨平台', '輕量', '大規模',
  '小規模', '繁體', '簡體', '中文', '英文', '加密', '簽章', '版本控制',
  '容器化', '微服務', '無頭', '高效能', '低延遲',
  // 簡體變體
  '实时', '离线', '云端', '简体', '轻量', '大规模', '微服务',
]);

// 中文通用詞（高 df 非領域詞；與英文 GENERIC_TERMS 同角色）
const GENERIC_TERMS_ZH = new Set([
  '工具', '軟體', '程式', '系統', '資料', '內容', '功能', '模型', '框架',
  '東西', '方式', '免費', '應用', '平台', '服務',
  '幫我', '我想', '我想要', '需要', '可以', '能不能', '有沒有', '沒有',
  '不用', '直接', '同時', '自己', '希望', '操作',
]);

// CJK 子字串匹配：token 包含任一 term（長度 ≥ 2）即回傳全部命中
function matchZhTerms(terms, token) {
  const hits = [];
  for (const t of terms) {
    if (t.length >= 2 && token.includes(t)) hits.push(t);
  }
  return hits;
}

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
    if (GENERIC_TERMS.has(clean) || GENERIC_TERMS_ZH.has(clean)) continue; // 通用詞不計入任何維度
    if (ACTION_TERMS.has(clean)) {
      if (!actionTerms.includes(clean)) actionTerms.push(clean);
    }
    if (OBJECT_TERMS.has(clean)) {
      if (!objectTerms.includes(clean)) objectTerms.push(clean);
    }
    if (CONSTRAINT_TERMS.has(clean)) {
      if (!constraintTerms.includes(clean)) constraintTerms.push(clean);
    }
    // 中文 token：子字串匹配（中文無空格，term 可能只是 token 的一部分）
    if (/[\u3400-\u9fff]/.test(clean)) {
      for (const t of matchZhTerms(ACTION_TERMS_ZH, clean)) {
        if (!actionTerms.includes(t)) actionTerms.push(t);
      }
      for (const t of matchZhTerms(OBJECT_TERMS_ZH, clean)) {
        if (!objectTerms.includes(t)) objectTerms.push(t);
      }
      for (const t of matchZhTerms(CONSTRAINT_TERMS_ZH, clean)) {
        if (!constraintTerms.includes(t)) constraintTerms.push(t);
      }
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
// 🔴 2026-10-14 實測裁決（Q4=A 實驗，詳 DEV_LOG 2026-10-14）：加權實際觸發後全面無益。
//   評測集 267 筆中文查詢，補中文詞表後 hasIntent 觸發率 6%→82%，随後 A/B＋消融：
//   · object 訊號開啟：semantic Hit@1 49.6%→44.2%（−5.4pp），agent Hit@1 −2.0pp
//   · constraint 訊號開啟：完全中性（無增益）
//   · 兩者皆關（保留抽取）：agent Hit@1 58.0%、fusion 57.2%、semantic 49.6%（最佳觀測）
//   停損裁決＝**預設停用加權**，抽取保留供診斷（CLI／未來實驗）。
//   重啟開關：QI_ENABLE_WEIGHTS=1（僅供未來有依據的實驗，勿預設開啟）。
const INTENT_WEIGHTS_ENABLED = process.env.QI_ENABLE_WEIGHTS === '1';
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
  if (!intent?.hasIntent || !INTENT_WEIGHTS_ENABLED) return w;

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

export { extractIntent, weightsForIntent, ACTION_TERMS, OBJECT_TERMS, CONSTRAINT_TERMS, GENERIC_TERMS, BASE_WEIGHTS, ACTION_TERMS_ZH, OBJECT_TERMS_ZH, CONSTRAINT_TERMS_ZH, GENERIC_TERMS_ZH };

// CLI 入口
if (process.argv[1] && process.argv[1].endsWith('query-intent.js')) {
  const q = process.argv.slice(2).join(' ') || 'scrape a JS-rendered dashboard and extract tables';
  const intent = extractIntent(q);
  const weights = weightsForIntent(intent);
  console.log(JSON.stringify({ query: q, intent, weights }, null, 2));
}
