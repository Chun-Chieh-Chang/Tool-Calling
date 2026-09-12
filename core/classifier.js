/**
 * 工具分類器模組 - LLM + 規則引擎混合方案
 *
 * 分類策略：
 * - 高置信度（≥0.8）：直接採用 LLM 分類
 * - 中置信度（0.5-0.8）：LLM 建議 + 規則校驗，需人工覆核
 * - 低置信度（<0.5）：回退到規則引擎
 * - 規則引擎也無匹配 → category: null + needsReview: true（**不再靜默預設分類**）
 *
 * 分類定義的單一來源：registry/categories.json（經 core/categories.js 存取）
 *
 * 使用方式：
 * - 設定 AGNES_API_KEY 時啟用 LLM 分類
 * - 否則僅使用規則引擎
 */

import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { categoryNames, promptCategoryBlock, promptDecisionTree } from './categories.js';

const __dirname = import.meta.dirname;
const ROOT = join(__dirname, '..');
const HOOK_LOG_PATH = join(ROOT, '.agnes', 'hooks', 'classifier-log.json');

// 18 個正規分類 — 單一來源：registry/categories.json
// 不可在此硬編碼清單。歷史上這裡曾寫成簡體中文（'开发工具'）而 registry 用繁體（'開發工具'），
// 導致 LLM 回傳的分類因驗證失敗被靜默丟棄、悄悄退回規則引擎 —— 是隱形故障。
const VALID_CATEGORIES = categoryNames();

/**
 * 调用 LLM 进行分类
 */
async function classifyWithLLM(name, description, topics) {
  const apiKey = process.env.AGNES_API_KEY;
  if (!apiKey) return null;

  // Prompt 由 registry/categories.json 產生，確保與決策樹永遠一致。
  // 歷史上這裡是手寫的簡體中文清單，且停在舊版 6 步決策樹 —— 與 CLASSIFICATION.md 脫節。
  const prompt = `你是一個專業的工具分類專家。請根據以下資訊將工具歸類到最合適的分類中。

工具名稱：${name}
工具描述：${description}
相關標籤：${topics ? topics.join(', ') : '無'}

可選分類（共 ${VALID_CATEGORIES.length} 個）：
${promptCategoryBlock()}

分類優先序（衝突時依序套用，先命中者勝）：
${promptDecisionTree()}

請依以下格式輸出 JSON：
{"category": "分類名稱", "confidence": 0.xx, "reason": "分類理由"}

注意：
1. confidence 必須在 0 到 1 之間
2. category 必須是上述 ${VALID_CATEGORIES.length} 個分類之一，且使用繁體中文原名
3. reason 簡要說明分類依據`;

  try {
    const res = await fetch('https://apihub.agnes-ai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'agnes-2.0-flash',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2
      }),
      signal: AbortSignal.timeout(10000)
    });

    if (!res.ok) {
      console.warn('[Classifier] LLM API 错误:', res.status);
      return null;
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content || '';

    // 解析JSON响应
    const match = content.match(/\{[^}]+\}/);
    if (!match) return null;

    const result = JSON.parse(match[0]);
    const category = result.category;
    const confidence = parseFloat(result.confidence) || 0.5;

    // 验证分类是否合法
    if (!VALID_CATEGORIES.includes(category)) {
      console.warn('[Classifier] 无效分类:', category, '回退到规则引擎');
      return null;
    }

    return { category, confidence, reason: result.reason };
  } catch (err) {
    console.warn('[Classifier] LLM 调用失败:', err.message);
    return null;
  }
}

/**
 * 规则引擎分类（兜底方案）
 */
function classifyByRules(name, description, topics) {
  const text = `${name} ${description} ${topics ? topics.join(' ') : ''}`.toLowerCase();

  // 按优先级匹配规则
  const rules = [
    { pattern: /\b(autonomous-agent|assistant\.?bot|copilot)\b/i, cat: 'AI 代理', weight: 100 },
    { pattern: /\b(agent|mcp-server)\b/i, cat: 'AI 代理', weight: 90 },
    { pattern: /\b(llm|language.model|transformer|gpt|claude|gemini|huggingface|diffusion|stable.?diffusion|midjourney|dalle)\b/i, cat: 'AI 框架', weight: 100 },
    { pattern: /\b(shadcn-ui|storybook|tldraw|chakra-ui|ant-design|material-ui|radix-ui|tailwind|next\.?js)\b/i, cat: 'UI/UX設計', weight: 100 },
    // 圖標庫 / SVG 資源：registry 無獨立「圖文資源」分類，依決策樹歸入 UI/UX設計
    { pattern: /\b(lucide|heroicons|font-awesome|tabler-icons|iconify|simple-icons|remix-icon|iconoir)\b/i, cat: 'UI/UX設計', weight: 100 },
    { pattern: /\b(rag|retrieval|embedding|knowledge.?graph|second.?brain|persistent.?memory)\b/i, cat: '知識管理', weight: 95 },
    { pattern: /\b(tutorial|course|education|bootcamp|roadmap|awesome-list|awesome|curriculum|handbook|interview|面试|booklist|free-books|ebook)\b/i, cat: '學習資源', weight: 90 },
    { pattern: /\b(research|paper|arxiv|science|survey)\b/i, cat: '研究', weight: 80 },
    { pattern: /\b(security|vuln|pentest|hack|owasp|cryptography)\b/i, cat: '安全性', weight: 90 },
    { pattern: /\b(trading|stock|quant|portfolio|backtest|financial market|finance)\b/i, cat: '金融與投資', weight: 85 },
    { pattern: /\b(cad|freecad|openscad|blender|bim|text-to-cad|cadquery|parametric 3d|3d model|mesh|geometry|opengl)\b/i, cat: '3D工程繪圖', weight: 85 },
    { pattern: /\b(crawl|scrape|scraper|crawler|spider|puppeteer|headless-browser)\b/i, cat: '瀏覽器自動化', weight: 100 },
    // API 網關 / 聚合器 / 可直接調用的 API 端點目錄
    { pattern: /\b(api gateway|api integration|rest api|graphql api|openapi|mcp connector|api.?directory|api.?list|free api|llm.?router|api.?aggregator|failover)\b/i, cat: 'API 整合', weight: 85 },
    { pattern: /\b(data-analy|pandas|polars|duckdb|dataframe|eda)\b/i, cat: '數據分析', weight: 90 },
    { pattern: /\b(generative-ai|img2video|text2video|text2img|image-generation|diffusion-model)\b/i, cat: '多媒體生成', weight: 100 },
    { pattern: /\b(video|animation|movie|ffmpeg|streaming)\b/i, cat: '影片', weight: 90 },
    { pattern: /\b(audio|music|speech|voice|whisper|tts|stt)\b/i, cat: '音訊', weight: 90 },
    { pattern: /\b(ppt|powerpoint|slide|presentation|office|docx|xlsx|pdf|markdown)\b/i, cat: '文件生產力', weight: 90 },
    { pattern: /\b(testing|test-runner|ci\/cd|playwright|cypress|vitest|jest)\b/i, cat: '測試與自動化', weight: 85 },
    { pattern: /\b(skill|prompt|cli-tool|code-editor|ide|code.?review|linter|proxy)\b/i, cat: '開發工具', weight: 80 },
  ];

  let bestMatch = { cat: null, weight: 0 };
  for (const rule of rules) {
    if (rule.pattern.test(text)) {
      if (rule.weight > bestMatch.weight) {
        bestMatch = { cat: rule.cat, weight: rule.weight };
      }
    }
  }

  // 無匹配時回傳 null（明確的「無法分類」），不再靜默塞進「開發工具」。
  //
  // 為什麼改：MECE 要求「不得有殘留分類」，但靜默預設只是把「其他」改名成「開發工具」——
  // 表面上通過檢查，實際上讓分類失敗完全不可見。開發工具因此膨脹到 91 筆（13%），
  // 且無法判斷其中有多少其實是分類失敗的殘留。
  // 現在改為顯式回報，呼叫端可據此標記待覆核。
  return bestMatch.cat;
}

/**
 * 主分类函数 - LLM + 规则引擎混合
 * @param {string} name - 工具名称
 * @param {string} description - 工具描述
 * @param {string[]} topics - 相关标签
 * @returns {{ category: string, confidence: number, source: string }}
 */
export async function classifyTool(name, description, topics = []) {
  // 尝试 LLM 分类
  const llmResult = await classifyWithLLM(name, description, topics);

  if (llmResult && llmResult.confidence >= 0.5) {
    // 记录分类结果
    const logEntry = {
      timestamp: new Date().toISOString(),
      tool: name,
      source: llmResult.confidence >= 0.8 ? 'llm' : 'llm_low_conf',
      category: llmResult.category,
      confidence: llmResult.confidence,
      reason: llmResult.reason
    };

    // 确保目录存在
    const hooksDir = join(ROOT, '.agnes', 'hooks');
    if (!existsSync(hooksDir)) {
      mkdirSync(hooksDir, { recursive: true });
    }
    try {
      import('node:fs').then(({ writeFileSync }) => {
        writeFileSync(HOOK_LOG_PATH, JSON.stringify(logEntry, null, 2), 'utf8');
      });
    } catch {}

    console.log(`[Classifier] LLM分类: ${name} → ${llmResult.category} (confidence: ${llmResult.confidence.toFixed(2)})`);
    return { category: llmResult.category, confidence: llmResult.confidence, source: 'llm' };
  }

  // 回退到規則引擎
  const ruleCategory = classifyByRules(name, description, topics);

  if (!ruleCategory) {
    // 規則引擎無匹配 → 顯式回報「無法分類」，交由呼叫端標記待人工覆核。
    // 不再回傳一個假的低信心分類，避免污染 registry。
    console.warn(`[Classifier] ⚠️ 無法分類: ${name} — LLM 與規則引擎皆無結論，需人工覆核`);
    return { category: null, confidence: 0, source: 'unclassified', needsReview: true };
  }

  console.log(`[Classifier] 規則分類: ${name} → ${ruleCategory}`);
  return { category: ruleCategory, confidence: 0.6, source: 'rule' };
}

/**
 * 批量分類工具
 *
 * 回傳的每筆工具可能帶有 category: null（無法分類），
 * 呼叫端 MUST 檢查 _meta.needsReview，不得直接寫入 registry。
 */
export async function batchClassify(tools) {
  const results = [];
  let unclassified = 0;
  for (const tool of tools) {
    const result = await classifyTool(
      tool.name,
      tool.description || '',
      tool.topics || tool.triggers || []
    );
    if (result.needsReview) unclassified++;
    results.push({ ...tool, category: result.category, _meta: result });
  }
  if (unclassified > 0) {
    console.warn(`[Classifier] ${unclassified}/${tools.length} 筆無法分類，需人工覆核`);
  }
  return results;
}
