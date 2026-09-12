/**
 * Tool-Calling 檢索引擎
 * 三層檢索架構：L1 精確匹配 → L2 關鍵字匹配 → L3 語義檢索
 * (此模組為 Pure JS，可用於 Node.js 與瀏覽器前端)
 */

// ─── 停用詞（語境詞）過濾 ─────────────────────────────────────────────
//
// 這些詞幾乎出现在所有 AI/開發工具的 trigger、description 裡，
// 對「這個工具能做什麼」的鑑別力接近 0。L2 的 token 比對與 L3 的
// TF-IDF 都應先剔除，避免「ai / tool / agent / code / 自動化」這類
// 語境詞把不相關工具推到前面（實測：k8s 部署查詢被 crm 偽命中）。
const GENERIC_STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'for', 'to', 'of', 'in', 'on', 'with', 'or', 'is', 'are',
  // 真·語境詞：出現在極多工具的 trigger/desc 中，鑑別力接近 0
  'ai', 'agent', 'agents', 'llm', 'llms', 'mcp', 'gpt',
  'open', 'open-source', 'open-source-project', 'free', '开源',
  'skill', 'skills', 'plugin', 'plugins', 'agent-skill',
]);

/**
 * 把 token 拆成中英子元：中文切 bigram、英文切單詞。
 * 用於 L2/L3 的 token 雙向比對，讓 `ppt` 能命中 `簡報`、`video` 能命中 `youtube`。
 * @param {string} token
 * @returns {string[]}
 */
function subTokensOf(token) {
  const t = String(token || '').toLowerCase();
  const out = new Set();
  // 英文：整 token + 去掉常见後綴
  out.add(t);
  for (const m of t.matchAll(/[a-z][a-z0-9+.#_-]{2,}/g)) out.add(m[0]);
  // 中文：bigram
  for (const run of t.match(/[\u4e00-\u9fff]+/g) || []) {
    if (run.length === 1) out.add(run);
    else for (let i = 0; i < run.length - 1; i++) out.add(run.slice(i, i + 2));
  }
  return [...out].filter((x) => x.length >= 1);
}

/**
 * 判斷 token 是否為語境停用詞。
 * 多字 trigger（如 `open-source-project`）整段命中也當作停用。
 * @param {string} token
 * @returns {boolean}
 */
function isGenericStopword(token) {
  const t = String(token || '').toLowerCase().trim();
  if (!t) return true;
  if (GENERIC_STOPWORDS.has(t)) return true;
  // 中文通用詞（簡短）
  if (/^(自動化|工具|模型|代理|程式|程式碼|開放原始碼|免費|套件)$/.test(t)) return true;
  return false;
}

/**
 * 文字正規化：轉小寫 + 去除多餘空白
 * @param {string} text
 * @returns {string}
 */
function normalize(text) {
  if (Array.isArray(text)) {
    return text.map(t => normalize(t)).join(' ');
  }
  if (typeof text !== 'string') {
    return (text || '').toString().toLowerCase().trim().replace(/\s+/g, ' ');
  }
  return text.toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * 中英文分詞（簡易版，按空白 + 常見標點切分）
 * @param {string} text
 * @returns {string[]}
 */
function tokenize(text) {
  const normalized = normalize(text);
  const rawTokens = normalized
    .split(/[\s,，。、；;：:!！?？\-_/\\]+/)
    .filter(t => t.length > 0);

  const finalTokens = new Set(rawTokens);
  const subKeywords = ['網頁', '爬蟲', '動態', '簡報', '股票', '語音', '影片', '圖片', '文件', '測試', '數據', '資料', '自動化', '量化', '視覺'];
  for (const token of rawTokens) {
    for (const kw of subKeywords) {
      if (token.includes(kw)) {
        finalTokens.add(kw);
      }
    }
  }
  // 把含連字號的 token 拆成子 token，讓 `js-rendered` 能匹配單詞 `js`
  for (const token of rawTokens) {
    const parts = token.split(/[-_]+/).filter((p) => p.length >= 2);
    for (const p of parts) finalTokens.add(p);
  }
  return Array.from(finalTokens);
}

// ─── 觸發詞正規化快取（triggerNormCache）────────────────────────────
//
// 問題：每次 keywordMatch() 都會對所有工具的 triggers 重複執行 normalize()，
// 造成明顯的重複運算。以 trigger 字串為 key 記憶化，整個程序生命週期內只
// 計算一次。預期 L2 匹配速度提升 40-60%。
const triggerNormCache = new Map();

function getTriggerNorm(trigger) {
  if (!triggerNormCache.has(trigger)) {
    triggerNormCache.set(trigger, normalize(trigger));
  }
  return triggerNormCache.get(trigger);
}

// 子工具（subTool）正規化字串快取。部分「monorepo / skills 合集」工具帶有
// 數百個 subTools（實測最多達 817 個），若每次 keywordMatch() 呼叫（也就是
// 每次按鍵搜尋）都重新對每一個 subTool 的 name/description 做
// toLowerCase/trim/replace，會是明顯的重複運算。以 subTool 物件本身
// （而非外層 tools 陣列參照）為 key 做記憶化，可讓這些正規化字串在整個
// 程序生命週期內只計算一次。
const subToolNormCache = new WeakMap();

function getSubToolNorm(subTool) {
  let entry = subToolNormCache.get(subTool);
  if (!entry) {
    entry = { name: normalize(subTool.name), desc: normalize(subTool.description) };
    subToolNormCache.set(subTool, entry);
  }
  return entry;
}

// ─── 查詢結果快取（searchResultCache）─────────────────────────────────
//
// 問題：相同查詢每次都重新計算。
// 解決方案：以查詢字串 + 過濾條件為 key，TTL 5 分鐘，重複查詢 <1ms。
const searchResultCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 分鐘

export function getRegistryCacheFingerprint(tools = []) {
  if (!Array.isArray(tools)) return 'invalid-registry';

  let hash = 2166136261;
  for (const tool of tools) {
    const text = [
      tool?.id,
      tool?.name,
      tool?.status,
      tool?.category,
      tool?.language,
      tool?.description,
      Array.isArray(tool?.triggers) ? tool.triggers.join(',') : tool?.triggers,
      tool?.useCase
    ].join('|');

    for (let i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
  }

  return `${tools.length}:${(hash >>> 0).toString(36)}`;
}

/**
 * 產生查詢快取鍵
 */
function buildCacheKey(query, category, language, registryVersion = 'default-registry') {
  return `${registryVersion}|${query}|${category || ''}|${language || ''}`;
}

/**
 * 取得快取結果（若存在且未過期）
 */
export function getCachedSearch(query, category, language, registryVersion) {
  const key = buildCacheKey(query, category, language, registryVersion);
  const cached = searchResultCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.results;
  }
  return null;
}

/**
 * 儲存搜尋結果到快取
 */
export function cacheSearchResults(query, category, language, results, registryVersion) {
  const key = buildCacheKey(query, category, language, registryVersion);
  searchResultCache.set(key, {
    results,
    timestamp: Date.now()
  });
  
  // 限制快取大小，避免記憶體洩漏
  if (searchResultCache.size > 1000) {
    const firstKey = searchResultCache.keys().next().value;
    searchResultCache.delete(firstKey);
  }
}

// ─── L1：精確匹配 ────────────────────────────────────────────────────────

/**
 * L1 精確匹配：按工具 ID 或名稱完全匹配
 * @param {object[]} tools - 工具列表
 * @param {string} query - 查詢字串
 * @returns {object[]} 匹配結果（含分數）
 */
function exactMatch(tools, query) {
  const q = normalize(query);
  return tools
    .filter(tool => {
      const id = normalize(tool.id);
      const name = normalize(tool.name);
      return id === q || name === q;
    })
    .map(tool => ({
      tool,
      score: 1.0,
      matchLevel: 'L1-exact',
      matchedOn: 'id/name',
    }));
}

// ─── L2：關鍵字匹配 ──────────────────────────────────────────────────────

// ── Trigger IDF 快取 ─────────────────────────────────────────────────────
// 把 trigger 詞頻換成 IDF：罕見 trigger（如 kubernetes、js-rendered）分數高，
// 通用 trigger（如 ai、agent、data、automation）分數低。這是修正「通用
// trigger 偽命中」的根本方法。以 trigger 正規化字串為 key 做整程序快取。
const triggerIdfCache = new Map();   // normTrigger → idfScore
let triggerIdfBuilt = false;
let triggerIdfMax = 0;              // 全庫最大 IDF，首次建置時填入

/**
 * 建立 / 回傳 trigger IDF 表（首次呼叫時建置，之後快取）。
 * @param {object[]} tools
 * @returns {Map<string, number>} normTrigger → idf
 */
function getTriggerIdf(tools) {
  if (triggerIdfBuilt) return triggerIdfCache;
  // 以 token 為單位統計 df：把每個 trigger 拆成子 token，每個 token 出現於幾個工具
  const df = new Map();
  for (const t of tools) {
    const seenTokens = new Set();
    for (const trig of (t.triggers || [])) {
      const norm = String(trig).toLowerCase().trim();
      if (!norm) continue;
      // 整串 trigger 也當一個 token（讓查詢整串命中時可查到）
      seenTokens.add(norm);
      for (const sub of norm.split(/[-\s]+/).filter((s) => s.length >= 2)) {
        seenTokens.add(sub);
      }
    }
    for (const tok of seenTokens) df.set(tok, (df.get(tok) || 0) + 1);
  }
  const N = tools.length;
  const maxRaw = Math.log((N + 1) / 1) + 1; // df=0 時的 IDF（最大可能值）
  for (const [tok, count] of df) {
    // 平滑 IDF：df 越大分越低。N=693 時：
    //   df=1 → 7.25（罕見）；df=10 → 4.26；df=50 → 2.62；df=200 → 1.70；df=693 → 1.01（極常見）
    const idf = Math.log((N + 1) / (count + 1)) + 1;
    triggerIdfCache.set(tok, idf);
  }
  triggerIdfMax = maxRaw; // 填正則化常數
  triggerIdfBuilt = true;
  return triggerIdfCache;
}

/**
 * 取得某 trigger 的「鑑別分數」（0~1）：IDF 正規化 + 停用詞過濾。
 * 停用詞過濾採「全 token 皆通用才視為停用」：
 *  - 單字 trigger `ai` → 停用（ai 是語境詞）
 *  - 複合 trigger `youtube-transcript` → 非停用（youtube/transcript 皆有意義）
 *  - 複合 trigger `open-source` → 停用（open/source 皆語境詞）
 * @param {string} trigger
 * @param {Map<string, number>} idfMap
 * @returns {number}
 */
function triggerDiscriminativeScore(trigger, idfMap) {
  const norm = String(trigger).toLowerCase().trim();
  if (!norm) return 0;
  const tokens = norm.split(/[-\s]+/).filter(Boolean);
  const meaningful = tokens.filter((t) => !isGenericStopword(t));
  if (meaningful.length === 0) return 0; // 全 token 皆停用
  // 取該 trigger 各有意義 token 中 IDF 最低者（最保守），避免被高 IDF 子詞拉高
  let raw = Infinity;
  for (const t of meaningful) {
    const v = idfMap.get(t);
    if (v != null && v < raw) raw = v;
  }
  if (!Number.isFinite(raw)) raw = 0.5 * triggerIdfMax; // 全未見過 → 中階
  // 相對正規化：除以全庫最大 IDF（≈7.54），df=0 → 1.0，df=693 → ~0.13
  return Math.max(0, Math.min(1.0, raw / triggerIdfMax));
}

// ── 查詢 token 鑑別分數快取 ──────────────────────────────────────────────
// 對查詢中的每個 token，回傳 0~1 的「資訊量分數」。
// 常見停用詞（ai/doc/data）→ 0；罕見詞（kubernetes/js-rendered）→ 1。
const queryTokenDiscrimCache = new Map();

/**
 * 取得查詢 token 的「鑑別分數」（0~1）：依該 token 在全庫 trigger 的出現頻率。
 * token 出現越多分越低（越像語境詞）；罕見 token 分高。
 * @param {string} token
 * @param {Map<string, number>} idfMap
 * @returns {number}
 */
function tokenDiscriminativeScore(token, idfMap) {
  const t = String(token || '').toLowerCase().trim();
  if (!t) return 0;
  if (isGenericStopword(t)) return 0;
  const cached = queryTokenDiscrimCache.get(t);
  if (cached !== undefined) return cached;
  const raw = idfMap.get(t);
  let v;
  if (raw == null) {
    // 未在 trigger 出現過：罕見詞，給高鑑別分
    v = 0.95;
  } else {
    // 相對正規化：df=0 → ~1.0，df=693 → ~0.13
    v = Math.max(0, Math.min(1.0, raw / triggerIdfMax));
  }
  queryTokenDiscrimCache.set(t, v);
  return v;
}

/**
 * L2 關鍵字匹配：查詢字串與工具觸發關鍵字 + 分類 + 描述 交叉匹配
 * @param {object[]} tools - 工具列表
 * @param {string} query - 查詢字串
 * @returns {object[]} 匹配結果（含分數，按分數降序）
 */
function keywordMatch(tools, query) {
  const allQueryTokens = tokenize(query);
  if (allQueryTokens.length === 0) return [];
  const normQuery = normalize(query); // 提到迴圈外，避免對每個 tool 的每個 trigger 重複正規化同一個查詢字串

  // 剔除語境停用詞，只保留有鑑別力的 token 參與比對
  const queryTokens = allQueryTokens.filter((t) => !isGenericStopword(t));

  // 取得 trigger IDF 表（首次建置，之後快取）
  const idfMap = getTriggerIdf(tools);

  const results = [];

  for (const tool of tools) {
    let score = 0;
    const matchedKeywords = [];

    // 觸發關鍵字匹配（IDF 加權 + token 雙向比對：罕見 trigger 分高、通用 trigger 分低/不計分）
    // 關鍵改進：對多字 trigger（如 `youtube-transcript`、`js-rendered`）拆成 token 雙向比對，
    // 讓查詢單詞能命中 trigger 的子 token（video ↔ youtube-transcript 的 transcript 不匹配，
    // 但 video-to-text 的 video 會匹配）。
    for (const trigger of tool.triggers) {
      const triggerNorm = getTriggerNorm(trigger);
      const discrim = triggerDiscriminativeScore(trigger, idfMap);
      if (discrim === 0) continue; // 停用 trigger 完全不加權

      // 強命中：查詢字串整段包含 trigger（如查 `ppt-master`）
      if (normQuery.includes(triggerNorm)) {
        score += 3 * discrim;
        if (!matchedKeywords.includes(trigger)) matchedKeywords.push(trigger);
        continue;
      }

      // token 雙向比對：拆 trigger 成 token，與查詢 token 交叉
      // 單字元 token（`c`、`a`）與 2 字元易偽命中 token（`mp4` 除外）一律不參與
      const triggerTokens = triggerNorm.split(/[-\s]+/).filter((t) => t.length >= 3);
      let triggerHitCount = 0;
      for (const trigTok of triggerTokens) {
        if (isGenericStopword(trigTok)) continue;
        // (a) trigger token 整段出現在查詢字串 → 強命中
        if (normQuery.includes(trigTok)) {
          triggerHitCount++;
          continue;
        }
        // (b) 查詢 token 與 trigger token 互相包含 → 弱命中
        for (const token of queryTokens) {
          if (token.length < 3) continue;
          if (trigTok.includes(token) || (token.includes(trigTok))) {
            triggerHitCount++;
            break;
          }
        }
      }
      if (triggerHitCount > 0) {
        // 強命中的 token 數 × 鑑別分數；上限 = 基礎分 3
        const hitScore = Math.min(3, 1.5 * triggerHitCount) * discrim;
        score += hitScore;
        if (!matchedKeywords.includes(trigger)) matchedKeywords.push(trigger);
      }
    }

    // 分類匹配（IDF 加權 + 只比有意義 token）
    const categoryNorm = normalize(tool.category);
    for (const token of queryTokens) {
      if (token.length < 3) continue;
      if (categoryNorm.includes(token)) {
        const tokDiscrim = tokenDiscriminativeScore(token, idfMap);
        score += 2 * tokDiscrim;
        if (!matchedKeywords.includes(`[category:${tool.category}]`)) matchedKeywords.push(`[category:${tool.category}]`);
      }
    }

    // 描述匹配（IDF 加權 + 只比有意義 token）
    const descNorm = normalize(tool.description);
    for (const token of queryTokens) {
      if (token.length < 3) continue;
      if (descNorm.includes(token)) {
        const tokDiscrim = tokenDiscriminativeScore(token, idfMap);
        score += 1 * tokDiscrim;
      }
    }

    // 能力標籤匹配（IDF 加權 + token 雙向）
    if (tool.capabilities) {
      for (const cap of tool.capabilities) {
        const capNorm = normalize(cap);
        const capTokens = capNorm.split(/[-\s]+/).filter((t) => t.length >= 3);
        let capHitCount = 0;
        if (normQuery.includes(capNorm)) capHitCount = 2;
        else {
          for (const capTok of capTokens) {
            if (isGenericStopword(capTok)) continue;
            if (normQuery.includes(capTok)) { capHitCount++; continue; }
            for (const token of queryTokens) {
              if (token.length < 3) continue;
              if (capTok.includes(token) || token.includes(capTok)) { capHitCount++; break; }
            }
          }
        }
        if (capHitCount > 0) {
          const capDiscrim = Math.max(0, Math.min(1.0, 1 / Math.max(1, tool.capabilities.length)));
          score += Math.min(3, 1.5 * capHitCount) * Math.max(capDiscrim, 0.3);
          if (!matchedKeywords.includes(cap)) matchedKeywords.push(cap);
        }
      }
    }

    // 子工具匹配 (權重中：每個匹配 +1.5)
    //
    // 精確度修正：對於帶有數百個 subTools 的「monorepo / skills 合集」工具
    // （實測 anthropic-cybersecurity-skills 有 817 個 subTools），若各自
    // 獨立比對查詢的每個詞、任一子工具命中任一詞就加分，會導致查詢中的
    // 不同詞語「分別」巧合命中完全不相關的子工具而拉高分數。例如查詢
    // 「database migration」在該工具的 817 個子工具中，"database" 命中了
    // 4 個跟資料庫遷移無關的憑證竊取/機密管理子工具，"migration" 又命中了
    // 1 個後量子加密遷移的子工具——湊在一起讓整個工具被誤判為高相關。
    // 修正做法：多詞查詢時，要求同一個子工具「同時」命中所有查詢詞
    // （詞語共現），才視為真正相关；單詞查詢則維持原本行為。
    if (tool.subTools) {
      let subToolScore = 0;
      for (const subTool of tool.subTools) {
        const { name: subName, desc: subDesc } = getSubToolNorm(subTool);

        const nameMatchedTokens = queryTokens.filter(t => t.length >= 2 && subName.includes(t));
        const descMatchedTokens = queryTokens.filter(t => t.length >= 3 && subDesc.includes(t));
        const matchedTokenCount = new Set([...nameMatchedTokens, ...descMatchedTokens]).size;

        // 多詞查詢要求同一子工具內詞語共現；單詞查詢只需命中該詞
        const requiredCount = queryTokens.length > 1 ? queryTokens.length : 1;
        if (matchedTokenCount < requiredCount) continue;

        subToolScore += nameMatchedTokens.length * 1.5 + descMatchedTokens.length * 1.0;
        if (!matchedKeywords.includes(`subtool:${subTool.name}`)) {
          matchedKeywords.push(`subtool:${subTool.name}`);
        }
      }
      // 限制子工具的加分上限，避免包含上百個工具的 Monorepo 霸榜
      score += Math.min(subToolScore, 6);
    }

    // 場景與優勢匹配（IDF 加權：只對有鑑別力的 token 加分，避免 `doc`/`data` 白拿分）
    if (tool.useCase) {
      const useCaseNorm = normalize(tool.useCase);
      for (const token of queryTokens) {
        if (useCaseNorm.includes(token) && token.length >= 2) {
          const tokDiscrim = tokenDiscriminativeScore(token, idfMap);
          score += 2 * tokDiscrim;
          if (!matchedKeywords.includes(`場景匹配`)) matchedKeywords.push(`場景匹配`);
        }
      }
    }
    
    if (tool.advantages) {
      for (const adv of tool.advantages) {
        const advNorm = normalize(adv);
        for (const token of queryTokens) {
          if (advNorm.includes(token) && token.length >= 2) {
            const tokDiscrim = tokenDiscriminativeScore(token, idfMap);
            score += 2 * tokDiscrim;
            if (!matchedKeywords.includes(`優勢匹配`)) matchedKeywords.push(`優勢匹配`);
          }
        }
      }
    }

    // 負樣本約束匹配 (Hard Negative)
    let isNegativeMatch = false;
    if (tool.negativeConstraints) {
      for (const neg of tool.negativeConstraints) {
        const negNorm = normalize(neg);
        if (negNorm.length >= 2 && normQuery.includes(negNorm)) {
          isNegativeMatch = true;
          break;
        }
      }
    }

    if (score > 0 || isNegativeMatch) {
      if (isNegativeMatch) {
        if (!matchedKeywords.includes(`🚫 禁用場景`)) matchedKeywords.push(`🚫 禁用場景`);
      }
      
      // 正規化分數到 0~1 範圍
      const maxPossible = tool.triggers.length * 4.5 + 2 + 5 + (tool.capabilities?.length || 0) * 2 + (tool.subTools ? 6 : 0);
      // 如果命中負樣本，強制給予極低分數 (0.01)
      const normalizedScore = isNegativeMatch ? 0.01 : Math.min(score / maxPossible, 0.99);
      results.push({
        tool,
        score: Math.round(normalizedScore * 100) / 100,
        matchLevel: 'L2-keyword',
        matchedKeywords,
      });
    }
  }

  return results.sort((a, b) => b.score - a.score);
}

// ─── Fuzzy Matching（模糊匹配）───────────────────────────────────────
//
// 問題：拼字錯誤或 variant 無法匹配（例如 "pyton" vs "python"）
// 解決方案：引入 Levenshtein distance 進行模糊匹配，僅對短 token (<4 chars) 啟用
const LEVENSHTEIN_THRESHOLD = 0.85; // 相似度閾值（越高越嚴格）

/**
 * 計算 Levenshtein distance
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function levenshteinDistance(a, b) {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix = [];
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * 計算字串相似度
 * @param {string} a
 * @param {string} b
 * @returns {number} 0~1，越高越相似
 */
function stringSimilarity(a, b) {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshteinDistance(a, b) / maxLen;
}

/**
 * 模糊匹配：檢查 queryToken 是否與 triggerNorm 相似
 * @param {string} triggerNorm
 * @param {string} queryToken
 * @returns {boolean}
 */
function fuzzyMatch(triggerNorm, queryToken) {
  if (triggerNorm === queryToken) return true;
  
  // 僅對短 token 啟用模糊匹配（避免誤判長詞）
  if (queryToken.length < 4 || triggerNorm.length < 4) {
    const sim = stringSimilarity(triggerNorm, queryToken);
    return sim >= LEVENSHTEIN_THRESHOLD;
  }
  
  return false;
}

// ─── L3：語義檢索（TF-IDF + N-gram + 同義詞擴展）──────────────────────

// 同義詞詞典改為 build 時從 registry 既有的中英雙語 triggers 自動挖掘產生
// （見 scripts/mine-synonyms.js），並在此直接 import 產出的靜態檔案。
// 只要 registry/tools.json 更新，重新執行 `node scripts/mine-synonyms.js`
// （或跑 `npm run build:web`，會自動先重新挖掘一次）即可讓詞典跟著變新，
// 不需要再手動維護一份固定字典。
import { SYNONYM_MAP } from './synonyms.generated.js';

/**
 * 同義詞擴展：將查詢字串中的詞擴展為同義詞集合
 * @param {string[]} tokens - 原始查詢 tokens
 * @returns {string[]} 擴展後的 tokens（去重）
 */
function expandSynonyms(tokens) {
  const expanded = new Set(tokens);
  for (const token of tokens) {
    const synonyms = SYNONYM_MAP[token];
    if (synonyms) {
      for (const syn of synonyms) {
        expanded.add(normalize(syn));
      }
    }
  }
  return [...expanded];
}

/**
 * 字元級 N-gram 生成（對中文特別有效，無需分詞）
 * @param {string} text - 輸入文字
 * @param {number} n - N-gram 大小（預設 2，即 bigram）
 * @returns {string[]} N-gram 陣列
 */
function charNgrams(text, n = 2) {
  const normalized = normalize(text).replace(/\s+/g, '');
  if (normalized.length < n) return [normalized];
  const ngrams = [];
  for (let i = 0; i <= normalized.length - n; i++) {
    ngrams.push(normalized.slice(i, i + n));
  }
  return ngrams;
}

// 單一工具文字表示的長度上限。少數「monorepo / skills 合集」工具帶有
// 數百個 subTools（實測 claude-skills 798 個、anthropic-cybersecurity-skills
// 817 個，未截斷前文字長度分別達 195,689 與 96,521 字元，相較其餘工具
// 平均 ~2,500 字元高出 2 個數量級）。若不設上限，這些工具會因為詞彙
// 覆蓋面極廣，在 TF-IDF／N-gram 計算中對「任何」查詢都容易產生偶然重疊，
// 導致霸榜（精確度下降），同時也是每次查詢中 charNgrams 耗時的主要來源
// （效能下降）。優先保留名稱/觸發詞/描述/分類/場景等高權重欄位，
// 子工具內容只在預算內納入。
const MAX_TOOL_TEXT_LENGTH = 3000;

/**
 * 建立工具的多層文字表示（用於 TF-IDF 計算）
 * 觸發詞和名稱重複加入以提升權重
 * @param {object} tool
 * @returns {string}
 */
function buildToolText(tool) {
  const parts = [
    // 名稱 ×3 （最高權重）
    tool.name, tool.name, tool.name,
    // 觸發詞 ×2
    ...(tool.triggers || []), ...(tool.triggers || []),
    // 描述 ×1
    tool.description,
    // 分類 ×2
    tool.category, tool.category,
    // 能力標籤 ×1
    ...(tool.capabilities || []).map(c => c.replace(/-/g, ' ')),
    // 場景與優勢
    tool.useCase || '',
    ...(tool.advantages || []),
    // 子工具（有長度預算保護，避免 monorepo 霸榜，見 MAX_TOOL_TEXT_LENGTH）
    ...(tool.subTools || []).map(st => `${st.name} ${st.description}`)
  ];
  const text = parts.join(' ');
  return text.length > MAX_TOOL_TEXT_LENGTH ? text.slice(0, MAX_TOOL_TEXT_LENGTH) : text;
}

/**
 * TF (詞頻) 計算
 * @param {string[]} tokens
 * @returns {Map<string, number>} token → 詞頻
 */
function computeTF(tokens) {
  const tf = new Map();
  for (const token of tokens) {
    tf.set(token, (tf.get(token) || 0) + 1);
  }
  // 正規化
  const max = Math.max(...tf.values(), 1);
  for (const [key, val] of tf) {
    tf.set(key, val / max);
  }
  return tf;
}

/**
 * IDF (逆文檔頻率) 計算
 * @param {string[][]} allDocTokens - 所有文檔的 token 陣列
 * @returns {Map<string, number>} token → IDF 值
 */
function computeIDF(allDocTokens) {
  const N = allDocTokens.length;
  const df = new Map(); // 文檔頻率
  for (const docTokens of allDocTokens) {
    const unique = new Set(docTokens);
    for (const token of unique) {
      df.set(token, (df.get(token) || 0) + 1);
    }
  }
  const idf = new Map();
  for (const [token, count] of df) {
    idf.set(token, Math.log((N + 1) / (count + 1)) + 1); // 平滑 IDF
  }
  return idf;
}

/**
 * 計算 TF-IDF 向量的餘弦相似度
 * @param {Map<string, number>} vecA
 * @param {Map<string, number>} vecB
 * @returns {number} 0~1
 */
function cosineSimilarity(vecA, vecB) {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (const [key, valA] of vecA) {
    const valB = vecB.get(key) || 0;
    dotProduct += valA * valB;
    normA += valA * valA;
  }
  for (const [, valB] of vecB) {
    normB += valB * valB;
  }

  normA = Math.sqrt(normA);
  normB = Math.sqrt(normB);

  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (normA * normB);
}

/**
 * 計算 N-gram 重疊度（Dice 係數）
 * @param {Set<string>} set1
 * @param {Set<string>} set2
 * @returns {number} 0~1
 */
function ngramSetOverlap(set1, set2) {
  if (set1.size === 0 || set2.size === 0) return 0;
  // 用較小的集合去查較大的集合，交集運算次數最少
  const [small, large] = set1.size <= set2.size ? [set1, set2] : [set2, set1];
  let intersectionSize = 0;
  for (const x of small) {
    if (large.has(x)) intersectionSize++;
  }
  return (2 * intersectionSize) / (set1.size + set2.size);
}

// ─── 每個工具的檢索用資料快取 ────────────────────────────────────────────
//
// 效能問題根因：舊版 semanticSearch 每次呼叫（也就是每次 debounce 後的
// 按鍵輸入）都會對「全部工具」重新執行 buildToolText → tokenize →
// charNgrams → computeTF，即使 registry 內容完全沒變。實測 279 個工具下，
// 光是 charNgrams 一項就要 ~130ms，整體 search() 平均要價 230~500ms —
// 對「即時搜尋」的體驗來說太慢。
//
// 這裡改用 WeakMap 以「工具物件本身」為 key 做記憶化（而非以陣列參照
// 為 key）。這樣不管 search() 內部怎麼 filter 出不同的子陣列（依
// status／category／language），只要是同一個工具物件，文字/分詞/
// TF/N-gram 集合都只會計算一次、之後永久複用，直到程序重啟。
const toolIndexCache = new WeakMap();

function getToolIndex(tool) {
  let entry = toolIndexCache.get(tool);
  if (!entry) {
    const text = buildToolText(tool);
    const tokens = tokenize(text);
    entry = {
      tokens,
      tf: computeTF(tokens),
      ngramSet: new Set(charNgrams(text)),
    };
    toolIndexCache.set(tool, entry);
  }
  return entry;
}

/**
 * 預先建立（warm up）搜尋索引快取。建議在載入 registry 後立即呼叫一次
 * （例如網頁端 fetch 完 tools.json 後），把 buildToolText/tokenize/
 * charNgrams 的成本挪到「使用者打字之前」，避免第一次搜尋卡頓。
 * 之後才輸入的查詢就只需要做查詢端的輕量運算。
 * @param {object[]} tools - 工具列表（通常是完整 registry）
 */
export function warmSearchIndex(tools) {
  for (const tool of tools) {
    getToolIndex(tool);
  }
}

/**
 * L3 語義檢索：TF-IDF 餘弦相似度 + N-gram 重疊度 + 同義詞擴展
 * @param {object[]} tools - 工具列表
 * @param {string} query - 查詢字串
 * @param {number} threshold - 最低相似度閾值（預設 0.03）
 * @returns {object[]} 匹配結果
 */
function semanticSearch(tools, query, threshold = 0.03) {
  // Step 1: 查詢同義詞擴展
  const rawQueryTokens = tokenize(query);
  const expandedQueryTokens = expandSynonyms(rawQueryTokens);
  const queryNgramSet = new Set(charNgrams(query));

  // Step 2: 取得（或建立並快取）每個工具的分詞結果
  const toolIndexes = tools.map(getToolIndex);

  // Step 3: 計算 IDF（僅對已快取好的 tokens 做文檔頻率統計，不含查詢本身，
  // 也不重新做任何字串前處理，成本遠低於原本版本）
  const idf = computeIDF(toolIndexes.map(idx => idx.tokens));

  // Step 4: 計算查詢的 TF-IDF 向量
  const queryTF = computeTF(expandedQueryTokens);
  const queryVec = new Map();
  for (const [token, tf] of queryTF) {
    queryVec.set(token, tf * (idf.get(token) || 1));
  }

  // Step 5: 對每個工具計算相似度
  const results = [];

  for (let i = 0; i < tools.length; i++) {
    const tool = tools[i];
    const { tf: docTF, ngramSet: toolNgramSet } = toolIndexes[i];

    // TF-IDF 餘弦相似度（權重 0.6）
    const docVec = new Map();
    for (const [token, tf] of docTF) {
      docVec.set(token, tf * (idf.get(token) || 1));
    }
    const tfidfScore = cosineSimilarity(queryVec, docVec);

    // N-gram 重疊度（權重 0.4）— 對中文子字串匹配特別有效
    const ngramScore = ngramSetOverlap(queryNgramSet, toolNgramSet);

    // 加權融合
    const combinedScore = tfidfScore * 0.6 + ngramScore * 0.4;

    if (combinedScore >= threshold) {
      results.push({
        tool,
        score: Math.round(combinedScore * 100) / 100,
        matchLevel: 'L3-semantic',
        matchedKeywords: [],
        _detail: {
          tfidf: Math.round(tfidfScore * 100) / 100,
          ngram: Math.round(ngramScore * 100) / 100,
          expanded: expandedQueryTokens.length > rawQueryTokens.length,
        },
      });
    }
  }

  return results.sort((a, b) => b.score - a.score);
}

// ─── 統一搜尋入口 ────────────────────────────────────────────────────────

/**
 * 統一搜尋：按 L1 → L2 → L3 順序檢索，自動融合結果
 * @param {object[]} registryTools - 完整的工具註冊表 (registry.tools)
 * @param {string} query - 搜尋查詢
 * @param {object} options - 選項
 * @param {number} [options.topK=5] - 返回前 K 個結果
 * @param {string} [options.category] - 限定分類
 * @param {string} [options.language] - 限定語言
 * @returns {object[]} 搜尋結果
 */

/** 套用 Telemetry 動態權重（成功/失敗軌跡調整 score） */
function applyTelemetryWeights(results, telemetryStats) {
  if (!telemetryStats) return;
  for (const result of results) {
    const stats = telemetryStats[result.tool.id];
    if (stats && stats.total >= 2) {
      if (stats.successRate <= 0.3) {
        result.score = result.score * 0.1;
        if (!result.matchedKeywords) result.matchedKeywords = [];
        result.matchedKeywords.push('⚠️ 軌跡警告: 成功率極低');
      } else if (stats.successRate >= 0.8) {
        result.score = Math.min(result.score * 1.2, 0.99);
        if (!result.matchedKeywords) result.matchedKeywords = [];
        result.matchedKeywords.push('🌟 軌跡推薦: 高成功率');
      }
    }
  }
}

export function search(registryTools, query, options = {}) {
  const { topK = 5, category, language } = options;
  const registryVersion = options.registryVersion || getRegistryCacheFingerprint(registryTools);
  
  // 檢查快取
  const cached = getCachedSearch(query, category, language, registryVersion);
  if (cached) {
    return cached;
  }
  
  let tools = registryTools.filter(t => t.status === 'active' || t.status === 'experimental');

  // 處理自然語言口語字眼前綴 (例如: "我想做簡報" -> "做簡報", "請幫我 scan" -> "scan")
  let targetQuery = (query || '').trim();
  const intentPrefixRegex = /^(我想|請幫我|幫我|我要|我想要|如何|要如何|可以用|我需要|要怎麼|怎麼)\s*/i;
  if (intentPrefixRegex.test(targetQuery)) {
    const stripped = targetQuery.replace(intentPrefixRegex, '').trim();
    if (stripped.length > 0) {
      targetQuery = stripped;
    }
  }

  // 前置過濾
  if (category) {
    const normCategory = normalize(category);
    tools = tools.filter(t => {
      if (!t || !t.category) return false;
      const cats = Array.isArray(t.category) ? t.category : [t.category];
      return cats.some(c => normalize(c) === normCategory);
    });
  }
  if (language) {
    tools = tools.filter(t => normalize(t.language) === normalize(language));
  }

  // L1 精確匹配
  const l1Results = exactMatch(tools, targetQuery);
  if (l1Results.length > 0) {
    let finalL1 = l1Results.slice(0, topK);
    applyTelemetryWeights(finalL1, options.telemetryStats);
    if (options.telemetryStats) finalL1.sort((a, b) => b.score - a.score);
    
    cacheSearchResults(query, category, language, finalL1, registryVersion);
    return finalL1;
  }

  // ── L1.5：trigger 整串精確命中（新增）─────────────────────────────
  // L1 只比 id/name 整串，漏掉「查詢含某 trigger 整串」的強信號。
  // 例如查詢 `summarize a 2-hour video` 應命中 trigger `summarize`。
  // 條件（保守，避免 ffmpeg/tree-sitter 的 `c` 偽命中）：
  //  - trigger 整串字元 >= 4（排除 1~3 字的單字 trigger 如 `c`、`ppt`、`h3`）
  //  - 查詢字串整段「包含」trigger（不做 token 共現，單字 trigger 易偽命中）
  //  - trigger 非停用（全 token 皆語境詞的不計）
  const triggerExactHits = [];
  {
    const qNorm = normalize(targetQuery);
    const idfMap = getTriggerIdf(tools);
    for (const tool of tools) {
      for (const trig of (tool.triggers || [])) {
        const tNorm = getTriggerNorm(trig);
        if (tNorm.length < 4) continue;           // 太短的 trigger 不參與精確命中
        if (!qNorm.includes(tNorm)) continue;      // 查詢必須整段包含 trigger
        const discrim = triggerDiscriminativeScore(trig, idfMap);
        if (discrim <= 0) continue;               // 停用 trigger 不計
        triggerExactHits.push({
          tool,
          score: Math.round((3 * discrim) * 100) / 100,
          matchLevel: 'L1.5-trigger-exact',
          matchedKeywords: [trig],
        });
        break; // 一個工具只算一次
      }
    }
    if (triggerExactHits.length > 0) {
      triggerExactHits.sort((a, b) => b.score - a.score);
      let finalHits = triggerExactHits.slice(0, topK);
      applyTelemetryWeights(finalHits, options.telemetryStats);
      if (options.telemetryStats) finalHits.sort((a, b) => b.score - a.score);
      cacheSearchResults(query, category, language, finalHits, registryVersion);
      return finalHits;
    }
  }

  // L2 關鍵字匹配
  const l2Results = keywordMatch(tools, targetQuery);

  // L3 語義檢索（作為補充）
  const l3Results = semanticSearch(tools, targetQuery);

  // 融合：L2 優先，L3 補充未出現的工具
  const seen = new Set();
  const merged = [];

  for (const r of l2Results) {
    seen.add(r.tool.id);
    merged.push(r);
  }

  for (const r of l3Results) {
    if (!seen.has(r.tool.id)) {
      seen.add(r.tool.id);
      // L3 分數降權（乘 0.5）以確保 L2 優先
      merged.push({ ...r, score: Math.round(r.score * 0.5 * 100) / 100 });
    }
  }

  // 套用 Telemetry 動態權重
  applyTelemetryWeights(merged, options.telemetryStats);

  merged.sort((a, b) => b.score - a.score);
  
  // 套用五維度競品重排矩陣 (5D Disambiguation Reranker)
  const context = extractQueryContext(targetQuery);
  const reranked = rerankCandidates(merged, context, options);
  
  const finalResults = reranked.slice(0, topK);
  
  // 儲存到快取
  cacheSearchResults(query, category, language, finalResults, registryVersion);
  
  return finalResults;
}

/**
 * 提取查詢意圖與上下文特徵 (Language, Scenario, Feature Requirements)
 * @param {string} query 
 * @returns {object}
 */
export function extractQueryContext(query) {
  const norm = normalize(query);
  
  // 1. 程式語言偏好
  let targetLang = null;
  if (/\b(python|py)\b/i.test(norm)) targetLang = 'python';
  else if (/\b(typescript|ts)\b/i.test(norm)) targetLang = 'typescript';
  else if (/\b(javascript|js|node|nodejs)\b/i.test(norm)) targetLang = 'javascript';
  else if (/\b(java)\b/i.test(norm)) targetLang = 'java';
  else if (/\b(golang|go)\b/i.test(norm)) targetLang = 'go';
  else if (/\b(rust)\b/i.test(norm)) targetLang = 'rust';

  // 2. 下游場景意圖
  const scenarios = [];
  if (/rag|llm|markdown|知識庫|向量/i.test(norm)) scenarios.push('rag');
  if (/testing|test|e2e|單元測試|端對端/i.test(norm)) scenarios.push('testing');
  if (/pipeline|大數據|併發|批量|高併發/i.test(norm)) scenarios.push('pipeline');
  if (/dom|xml|標籤/i.test(norm)) scenarios.push('dom');
  if (/ppt|簡報|powerpoint|slide/i.test(norm)) scenarios.push('presentation');

  // 3. 特性/約束需求
  const features = [];
  if (/動態|spa|js|javascript|渲染/i.test(norm)) features.push('dynamic_rendering');
  if (/防封鎖|代理|proxy|header|輪換/i.test(norm)) features.push('anti_blocking');

  return {
    originalQuery: query,
    targetLang,
    scenarios,
    features
  };
}

/**
 * 五維度競品重排矩陣 (5D Disambiguation Reranker)
 * 對初篩候選工具進行語言匹配、下游意圖適配、禁用場景強硬扣分與健康度重排
 * @param {object[]} candidates - [{ tool, score, ... }]
 * @param {object} context - extractQueryContext() 的回傳值
 * @param {object} [options] - 其他選項 (如 telemetryStats)
 * @returns {object[]} 重排後帶有 disambiguationReasons 的候選工具清單
 */
export function rerankCandidates(candidates, context, options = {}) {
  if (!candidates || candidates.length === 0) return [];

  const { targetLang, scenarios, features } = context;

  const reranked = candidates.map(item => {
    const tool = item.tool;
    let newScore = item.score;
    const reasons = [];

    // 維度 A: 語言偏好對齊
    if (targetLang && tool.language) {
      const toolLang = normalize(tool.language);
      if (toolLang.includes(targetLang) || (targetLang === 'javascript' && toolLang.includes('typescript'))) {
        newScore += 0.25;
        reasons.push(`💡 程式語言強吻合 (${tool.language})`);
      } else {
        newScore -= 0.35;
        reasons.push(`⚠️ 程式語言不匹配 (${tool.language} vs 需要 ${targetLang})`);
      }
    }

    // 維度 B: 下游場景意圖匹配
    if (scenarios.length > 0) {
      const toolUseCase = (tool.useCase || '').toLowerCase();
      const toolDesc = (tool.description || '').toLowerCase();
      const toolCategory = (tool.category || '').toLowerCase();

      for (const sc of scenarios) {
        if (sc === 'rag' && (toolUseCase.includes('rag') || toolUseCase.includes('markdown') || toolDesc.includes('llm'))) {
          newScore += 0.30;
          reasons.push('🌟 原生支援 LLM / RAG 資料清洗與 Markdown 轉譯');
        } else if (sc === 'testing' && (toolCategory.includes('測試') || toolUseCase.includes('測試') || toolUseCase.includes('e2e'))) {
          newScore += 0.30;
          reasons.push('🌟 原生專注端對端 (E2E) UI 自動化測試');
        } else if (sc === 'pipeline' && (toolUseCase.includes('併發') || toolUseCase.includes('管道') || toolDesc.includes('async'))) {
          newScore += 0.25;
          reasons.push('🌟 支援大數據非同步 Pipeline 與高併發處理');
        }
      }
    }

    // 維度 C: 禁用場景強硬扣分 (Negative Constraints Filter)
    if (features.includes('dynamic_rendering') && tool.negativeConstraints) {
      const hasNegative = tool.negativeConstraints.some(c => 
        /不支援動態|不支援 javascript|需搭配|不內建/i.test(c)
      );
      if (hasNegative) {
        newScore -= 0.60; // 重罰
        reasons.push('🚫 觸發禁用場景門禁: 缺少動態 JavaScript 渲染能力');
      }
    }

    // 維度 D: GitHub Stars 加權
    if (tool.stars && tool.stars > 1000) {
      const starBonus = Math.min(Math.log10(tool.stars) * 0.05, 0.20);
      newScore += starBonus;
    }

    return {
      ...item,
      score: Math.max(0.01, Math.round(newScore * 100) / 100),
      disambiguationReasons: reasons
    };
  });

  return reranked.sort((a, b) => b.score - a.score);
}

/**
 * 按分類列出所有工具
 * @param {object[]} registryTools 
 * @returns {Map<string, object[]>} 分類 → 工具列表
 */
export function listByCategory(registryTools) {
  const map = new Map();

  for (const tool of registryTools) {
    if (!map.has(tool.category)) {
      map.set(tool.category, []);
    }
    map.get(tool.category).push(tool);
  }

  return map;
}

/**
 * 取得所有工具
 * @param {object[]} registryTools 
 * @returns {object[]}
 */
export function listAll(registryTools) {
  return registryTools;
}

/**
 * 按 ID 取得工具
 * @param {object[]} registryTools 
 * @param {string} id
 * @returns {object|null}
 */
export function getById(registryTools, id) {
  return registryTools.find(t => t.id === id) || null;
}

/**
 * 複雜任務多工具鏈自動規劃器 (Tool Chain Planner)
 * 剖析長任務 Prompt，拆解步驟並為每個步驟配對最適工具與資料傳遞介面
 * @param {object[]} registryTools 
 * @param {string} taskDescription 
 * @returns {object} 包含 steps, asciiPipeline, summary
 */
export function planToolChain(registryTools, taskDescription) {
  if (!taskDescription || typeof taskDescription !== 'string') {
    return { steps: [], asciiPipeline: '', summary: '無效的任務描述' };
  }

  // 按常見連接詞/標點切分多步驟子任務
  const rawSegments = taskDescription
    .split(/(?:然後|接著|轉成|發送|生成|產出|步驟\d+[:：]?|->|=>|；|;|\n|與此同時|，|,)+/i)
    .map(s => s.trim().replace(/^[\s,，。、；;：:!！?？\-_/\\]+/g, '').replace(/[\s,，。、；;：:!！?？\-_/\\]+$/g, '').replace(/^(並|並且|且|與|或|接著|然後)+/g, '').replace(/(並|並且|且|與|或)+$/g, '').trim())
    .filter(s => s.length > 0);

  const segments = rawSegments.length > 0 ? rawSegments : [taskDescription];
  const steps = [];

  segments.forEach((seg, idx) => {
    // 扣除常見動詞前綴以提升關鍵字命中率
    const cleanedSeg = seg.replace(/^(抓取|爬取|下載|解析|提取|生成|製作|發送|處理|分析|建立)\s*/i, '').trim();
    let matches = search(registryTools, cleanedSeg.length > 0 ? cleanedSeg : seg, { topK: 3 });
    if (matches.length === 0) {
      matches = search(registryTools, seg, { topK: 3 });
    }
    const primary = matches[0] ? matches[0].tool : null;
    const alternatives = matches.slice(1).map(m => m.tool);

    let inputFormat = '原始數據 / 指令 Prompt';
    let outputFormat = '結構化資料 / 檔案';

    if (primary) {
      const cat = (primary.category || '').toLowerCase();
      if (cat.includes('瀏覽器') || cat.includes('爬蟲')) {
        inputFormat = 'URL / 網址清單';
        outputFormat = 'HTML / Markdown / Cleaned Text';
      } else if (cat.includes('ai 代理') || cat.includes('框架')) {
        inputFormat = 'Markdown / Context Prompt';
        outputFormat = 'LLM 回應 / 結構化 JSON';
      } else if (cat.includes('文件') || cat.includes('簡報') || cat.includes('多媒體')) {
        inputFormat = 'Markdown / JSON Data';
        outputFormat = 'PPTX / PDF / 多媒體檔案';
      } else if (cat.includes('測試') || cat.includes('自動化')) {
        inputFormat = '測試腳本 / 自動化指令';
        outputFormat = '測試報告 / Console Log';
      }
    }

    steps.push({
      stepIndex: idx + 1,
      action: seg,
      recommendedTool: primary ? {
        id: primary.id,
        name: primary.name,
        category: primary.category,
        install: primary.install,
        useCase: primary.useCase || primary.description
      } : null,
      inputFormat,
      outputFormat,
      alternatives: alternatives.map(a => ({ id: a.id, name: a.name }))
    });
  });

  // 建構 ASCII 流程圖
  const flowNodes = steps.map(s => `[Step ${s.stepIndex}: ${s.recommendedTool ? s.recommendedTool.name : '未知工具'}]`);
  const asciiPipeline = flowNodes.join(' ──(Data Flow)──> ');

  return {
    task: taskDescription,
    totalSteps: steps.length,
    steps,
    asciiPipeline,
    summary: `成功為任務「${taskDescription}」規劃 ${steps.length} 步驟工具鏈`
  };
}
