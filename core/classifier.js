/**
 * 工具分类器模块 - LLM + 规则引擎混合方案
 *
 * 分类策略：
 * - 高置信度（≥0.8）：直接采用 LLM 分类
 * - 中置信度（0.5-0.8）：LLM 建议 + 规则校验，需人工覆核
 * - 低置信度（<0.5）：回退到规则引擎，标记为需人工确认
 *
 * 使用方式：
 * - 调用 AGNES_API_KEY 时启用 LLM 分类
 * - 否则仅使用规则引擎
 */

import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = import.meta.dirname;
const ROOT = join(__dirname, '..');
const HOOK_LOG_PATH = join(ROOT, '.agnes', 'hooks', 'classifier-log.json');

// 18 个有效分类
const VALID_CATEGORIES = [
  'AI 代理', 'AI 框架', '开发工具', 'UI/UX设计',
  '图文资源', '知识管理', '学习资源', '研究',
  '安全性', '金融与投资', '3D工程绘图', '浏览器自动化',
  'API 整合', '数据分析', '多媒体生成', '影片',
  '音频', '文件生产力'
];

/**
 * 调用 LLM 进行分类
 */
async function classifyWithLLM(name, description, topics) {
  const apiKey = process.env.AGNES_API_KEY;
  if (!apiKey) return null;

  const prompt = `你是一个专业的工具分类专家。请根据以下信息将工具归类到最合适的分类中。

工具名称：${name}
工具描述：${description}
相关标签：${topics ? topics.join(', ') : '无'}

可选分类（共18个）：
AI 代理 - 成品agent、agent harness、skill/plugin集合
AI 框架 - LLM SDK、模型本体、推理/训练框架
开发工具 - CLI、IDE、代码审查、token压缩等泛用工具
UI/UX设计 - 前端框架、设计系统、网页动画、原型
图文资源 - 图标库、SVG矢量资源
知识管理 - agent记忆、RAG、知识图谱、codebase索引
学习资源 - 教程、课程、书籍、Awesome Lists
研究 - 学术研究、文献、论文
安全性 - 渗透测试、漏洞扫描、信息安全
金融与投资 - 交易、量化、股票分析
3D工程绘图 - CAD、3D建模、3D资产
浏览器自动化 - 爬虫、Scraper、Headless
API 整合 - API网关、集成工具
数据分析 - Pandas/Polars、产品分析
多媒体生成 - AI图像/视频生成
影片 - 视频编辑、视频生成、串流
音频 - TTS/STT、音频处理
文件生产力 - 简报/PPT、Office、PDF

请按以下格式输出JSON：
{"category": "分类名称", "confidence": 0.xx, "reason": "分类理由"}

注意：
1. confidence 必须在0到1之间
2. category必须是上述18个分类之一
3. reason简要说明分类依据`;

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
    { pattern: /\b(shadcn-ui|storybook|tldraw|chakra-ui|ant-design|material-ui|radix-ui|tailwind|next\.?js)\b/i, cat: 'UI/UX设计', weight: 100 },
    { pattern: /\b(lucide|heroicons|font-awesome|tabler-icons|iconify|simple-icons|remix-icon|iconoir)\b/i, cat: '图文资源', weight: 100 },
    { pattern: /\b(rag|retrieval|embedding|knowledge.?graph|second.?brain|persistent.?memory)\b/i, cat: '知识管理', weight: 95 },
    { pattern: /\b(tutorial|course|education|bootcamp|roadmap|awesome-list|curriculum|handbook|interview|面试)\b/i, cat: '学习资源', weight: 90 },
    { pattern: /\b(research|paper|arxiv|science|survey)\b/i, cat: '研究', weight: 80 },
    { pattern: /\b(security|vuln|pentest|hack|owasp|cryptography)\b/i, cat: '安全性', weight: 90 },
    { pattern: /\b(trading|stock|quant|portfolio|backtest|financial market|finance)\b/i, cat: '金融与投资', weight: 85 },
    { pattern: /\b(cad|freecad|openscad|blender|bim|text-to-cad|cadquery|parametric 3d|3d model|mesh|geometry|opengl)\b/i, cat: '3D工程绘图', weight: 85 },
    { pattern: /\b(crawl|scrape|scraper|crawler|spider|puppeteer|headless-browser)\b/i, cat: '浏览器自动化', weight: 100 },
    { pattern: /\b(api gateway|api integration|rest api|graphql api|openapi|mcp connector)\b/i, cat: 'API 整合', weight: 80 },
    { pattern: /\b(data-analy|pandas|polars|duckdb|dataframe|eda)\b/i, cat: '数据分析', weight: 90 },
    { pattern: /\b(generative-ai|img2video|text2video|text2img|image-generation|diffusion-model)\b/i, cat: '多媒体生成', weight: 100 },
    { pattern: /\b(video|animation|movie|ffmpeg|streaming)\b/i, cat: '影片', weight: 90 },
    { pattern: /\b(audio|music|speech|voice|whisper|tts|stt)\b/i, cat: '音频', weight: 90 },
    { pattern: /\b(ppt|powerpoint|slide|presentation|office|docx|xlsx|pdf|markdown)\b/i, cat: '文件生产力', weight: 90 },
    { pattern: /\b(skill|prompt|cli-tool|code-editor|ide)\b/i, cat: '开发工具', weight: 80 },
  ];

  let bestMatch = { cat: '开发工具', weight: 0 };
  for (const rule of rules) {
    if (rule.pattern.test(text)) {
      if (rule.weight > bestMatch.weight) {
        bestMatch = { cat: rule.cat, weight: rule.weight };
      }
    }
  }

  // 如果没匹配到，默认归入开发工具
  return bestMatch.weight > 0 ? bestMatch.cat : '开发工具';
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

  // 回退到规则引擎
  const ruleCategory = classifyByRules(name, description, topics);
  console.log(`[Classifier] 规则分类: ${name} → ${ruleCategory}`);
  return { category: ruleCategory, confidence: 0.6, source: 'rule' };
}

/**
 * 批量分类工具
 */
export async function batchClassify(tools) {
  const results = [];
  for (const tool of tools) {
    const result = await classifyTool(
      tool.name,
      tool.description || '',
      tool.topics || tool.triggers || []
    );
    results.push({ ...tool, category: result.category, _meta: result });
  }
  return results;
}
