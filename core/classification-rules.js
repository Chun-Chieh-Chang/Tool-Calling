/**
 * core/classification-rules.js — 分類規則引擎（唯讀，純函式）
 *
 * 從 scripts/rescan-classification.js 抽出，讓多值推断（infer-multidimensional.js）
 * 與既有 rescan 共用同一份規則，避免兩份規則漂移。
 *
 * 匯出：
 *   fields(tool)              欄位加權（identity / name / body / cat）
 *   ruleApplies(rule, f)     規則是否命中
 *   RULES                     全量規則（R1–R10b + D 系列）
 *   RULES_BY_PASS             依 pass 分層
 *   inferPrimary(tool)        返回 { required, rule, why } 或 null（primary 身分）
 *   inferSecondary(tool)      返回 [{ required, rule, why }]（secondary 身分候選）
 *
 * MECE 約束：每筆工具可同時具有多個身分（primary + secondary），
 * primary 是「現行單一分類」的替代，secondary 是「多重身分」的補充。
 */

import { categoriesWithKeywords } from './categories.js';

// ─── 欄位加權 ──────────────────────────────────────────────────────────────
export function fields(tool) {
  const nameField = [tool.id || '', tool.name || ''].join(' ').toLowerCase();
  return {
    name: nameField,
    identity: [nameField, (tool.triggers || []).join(' ')].join(' ').toLowerCase(),
    body: [tool.description || '', tool.useCase || '', (tool.capabilities || []).join(' ')]
      .join(' ').toLowerCase(),
    cat: tool.category || ''
  };
}

// ─── 領域規則（D 系列）專用排除條款 ───────────────────────────────────────
const D_EXCLUDE = [
  /samples?|examples?|\bdemos?\b|learning|walkthrough|cheat ?sheet/,
  /\bskills?\b/
];

export function ruleApplies(rule, f) {
  const exclusions = [...(rule.exclusions || [])];
  if (/^D\d+/.test(rule.id) && rule.required !== '學習資源') exclusions.push(...D_EXCLUDE);
  for (const ex of exclusions) {
    if (ex.test(f.identity) || ex.test(f.body)) return { ok: false, why: `excluded:${ex.source.slice(0, 36)}` };
  }
  if (typeof rule.custom === 'function') return rule.custom(f);
  if (rule.strict) {
    const nameHit = (rule.signals || []).find(s => s.test(f.name));
    return nameHit
      ? { ok: true, why: `name:${nameHit.source.slice(0, 36)}` }
      : { ok: false, why: 'no-name-hit' };
  }
  const idHit = (rule.signals || []).find(s => s.test(f.identity));
  if (idHit) return { ok: true, why: `identity:${idHit.source.slice(0, 36)}` };
  const bodyHits = (rule.signals || []).filter(s => s.test(f.body));
  if (bodyHits.length >= 2) return { ok: true, why: `body×${bodyHits.length}` };
  return { ok: false, why: 'insufficient-signal' };
}

// ─── 共用排除條款 ──────────────────────────────────────────────────────────
const EX = {
  proxy: /\bproxy\b|proxying/,
  peripheral: /\bplugin\b|extension\b|\bskills?\b|skill\.md|guide\b|tutorial|mcp server|mcp-server/,
  iconFont: /font[- ]awesome|\bicons?\b|icon library|svg icons/,
  notebook: /notebook/,
  runtime: /inference engine|local (llm|model) (runtime|serving|inference)|quantiz|gguf|\bvram\b|webgpu|offload/
};

// ─── R6 專用：判斷「agent 訊號」是工具自稱，還是只是描述周邊 ──────────────
const AGENT_SIGNALS = [
  /coding[- ]agent/,
  /code[- ]agent/,
  /autonomous (coding|developer)/,
  /ai (coding|code) (assistant|agent)/,
  /agentic (ide|coding)/,
  /terminal (agent|assistant)/,
  /writes? code|multi[- ]file edit/,
  /編碼agent|編碼代理/
];
const PERIPHERAL_CONTEXT = /\b(for|using|with|enabling|supporting|powered by|built for|aimed at|designed for)\b[^.!?]{0,24}$/;
const MODEL_FOLLOW = /^\s*(model|models|llm|checkpoint|weights)/;

function agentSignalIsSelfAttributed(text) {
  for (const re of AGENT_SIGNALS) {
    const m = text.match(new RegExp(re.source, 'g'));
    if (!m) continue;
    for (const match of m) {
      const tail = text.slice(text.indexOf(match) + match.length);
      if (PERIPHERAL_CONTEXT.test(tail) || MODEL_FOLLOW.test(tail)) continue;
      return true;
    }
  }
  return false;
}

// ─── 領域關鍵詞規則 ────────────────────────────────────────────────────────
const DOMAIN_RULES = categoriesWithKeywords().map((c, i) => ({
  id: `D${i + 1}`,
  cat: c.name,
  desc: c.definition,
  signals: c.keywords.map(k => new RegExp(k))
}));

const D_RULES = DOMAIN_RULES.flatMap(d => ([
  {
    id: `${d.id}-T1`,
    step: '決策樹 §2-7 領域關鍵詞（精確）',
    desc: `${d.desc} → ${d.cat}（名稱明確）`,
    pass: 1, tier: 1, strict: true, required: d.cat, signals: d.signals
  },
  {
    id: `${d.id}-T3`,
    step: '決策樹 §2-7 領域關鍵詞（啟發）',
    desc: `${d.desc} → ${d.cat}（敘述提及）`,
    pass: 3, tier: 3, strict: false, required: d.cat, signals: d.signals
  }
]));

// §2-4 領域 skill 包
const SKILL_PACK_DOMAINS = [
  { re: /cyber ?security|pentest|vulnerab|exploit|malware|forensic|threat|reverse[- ]?engineer/, cat: '安全性' },
  { re: /scientific|science|academic|research|neuroscience|genom|biolog|clinical|literature|paper/, cat: '研究' },
  { re: /financial|finance|trading|investment|portfolio|equity|stock|earnings/, cat: '金融與投資' },
  { re: /ui[- ]?ux|\bui\b|design|figma|frontend|typography|brand|gsap|prototyp/, cat: 'UI/UX設計' },
  { re: /ppt|slide|docx|xlsx|pdf|office|document/, cat: '文件生產力' },
  { re: /video|youtube|subtitle|ffmpeg/, cat: '影片' },
  { re: /audio|music|tts|speech|voice|elevenlabs/, cat: '音訊' },
  { re: /image|diffusion|media|comfyui|comfy/, cat: '多媒體生成' },
  { re: /playwright|test|e2e|cypress|vitest|jest/, cat: '測試與自動化' },
  { re: /scrap|crawl|browser|stealth/, cat: '瀏覽器自動化' },
  { re: /3d|cad|blender|mesh/, cat: '3D工程繪圖' }
];
const PACK_LEARNING_ARTIFACT = /samples?|examples?|\bdemos?\b|\bguides?\b|\btutorials?\b|walkthrough/;

// ─── 全量規則 ──────────────────────────────────────────────────────────────
export const RULES = [
  {
    id: 'R1',
    step: '決策樹 §2-3 ／ §3 邊界「API 端點目錄」',
    desc: '可直接調用的 API 端點目錄／網關／多供應商聚合器 → API 整合',
    tier: 1,
    required: 'API 整合',
    signals: [
      /\bfree (public )?apis?\b/,
      /public apis/,
      /free (llm )?api keys?/,
      /api (directory|list|catalog)\b/,
      /free api keys?/,
      /\bllm (router|gateway|aggregator)\b/,
      /api (router|gateway|aggregator)\b/,
      /provider aggregation/,
      /multi[- ]provider (router|gateway|failover|endpoint)/,
      /openai[- ]compatible (api|endpoint|\/v1)/,
      /\/v1 endpoint/,
      /免費api|免费api|免費接口|免费接口|api大全/
    ],
    exclusions: [EX.runtime]
  },
  {
    id: 'R2',
    step: '決策樹 §2-2 ／ §3 邊界「書籍閱讀清單」',
    desc: '書籍／書單／閱讀清單（主要價值為閱讀）→ 學習資源',
    tier: 1,
    required: '學習資源',
    signals: [
      /\bfree[- ]?books?\b/,
      /\be-?books?\b/,
      /book ?lists?\b/,
      /\bbook list\b/,
      /reading list/,
      /free[- ]programming[- ]books/,
      /book notes/,
      /books?\b.{0,24}(index|list|collection|directory|catalog)/,
      /(index|list|collection|directory|catalog).{0,24}\bbooks?\b/,
      /book of .{0,20}(knowledge|secret|tips|patterns)/,
      /書單|书单|书籍|書籍|電子書|电子书|讀書筆記|读书笔记/
    ],
    exclusions: [EX.notebook, EX.iconFont, /book[- ]?to[- ]?skill|book.{0,10}skill|skill.{0,10}book/, /\breader\b|reader app|閱讀器/]
  },
  {
    id: 'R3',
    step: '決策樹 §2-2 ／ §3 邊界「Awesome 清單」',
    desc: 'Awesome／curated 清單，條目非 API 端點、非可執行 agent/skill 包 → 學習資源',
    tier: 1,
    required: '學習資源',
    signals: [
      /awesome[- ]?lists?/,
      /awesome[- ](resources|tools|apps|skills|agents|projects|guides|collection|prompts)/,
      /curated (list|collection|directory) of/,
      /a (curated )?list of/,
      /collection of .{0,20}(resources|tools|links|examples|projects|guides)/,
      /精選|精选/
    ],
    exclusions: [EX.iconFont, EX.runtime, EX.proxy, /\bskills?\b/, /subagents?/]
  },
  {
    id: 'R4',
    step: '決策樹 §2-5 ／ §3 邊界「本地推理引擎」',
    desc: '本地／推理引擎、模型運行時 → AI 框架',
    tier: 1,
    required: 'AI 框架',
    signals: [
      /inference engine/,
      /model serving|serving engine/,
      /(local|on[- ]device|offline|desktop) (llm|model) (runtime|serving|inference|server)/,
      /run .{0,20}(massive|large|big) (llm|model|moe)/,
      /quantiz/,
      /webgpu/,
      /\bgguf\b|\bvram\b/,
      /本地推理|本地模型|本地部署|模型服務/
    ],
    exclusions: []
  },
  {
    id: 'R5',
    step: '決策樹 §2-6 ／ §3 邊界「AI code review」',
    desc: 'AI 代碼審查／PR 審查工具 → 開發工具',
    tier: 1,
    required: '開發工具',
    signals: [
      /code[- ]review/,
      /pr[- ]review|pull[- ]request review/,
      /code reviewer|pull request reviewer/,
      /static analysis|static analyzer/,
      /lint|linter/,
      /unit test|test (framework|runner|automation)/,
      /代碼審查|代码审查|程式碼審查|代码评审/
    ],
    // 排除：TDD 方法論／工作流（純流程指引，非 code review 工具）、
    //       agent skill 包（R5 不應介入 §2-4 的 skill 包裁決）、
    //       Oxlint 規則集（ESLint 系 rules collection，非 AI code review）
    exclusions: [
      EX.proxy,
      /\btdd\b|test[- ]driven|red[- ]green[- ]refactor/,
      /agent[- ]?skills?\b/,
      /\boxlint\b/
    ]
  },
  {
    id: 'R6',
    step: '決策樹 §2-8 ／ §3 邊界「編碼 Agent」',
    desc: '自稱為編碼 agent / AI code assistant → AI 代理（Tier 2：語境裁決）',
    tier: 2,
    required: 'AI 代理',
    custom: (f) => {
      const peripheralEx = [EX.proxy, EX.peripheral, /orchestrat|manage fleets|fleet/];
      for (const ex of peripheralEx) {
        if (ex.test(f.identity) || ex.test(f.body)) return { ok: false, why: `excluded:${ex.source.slice(0, 30)}` };
      }
      if (AGENT_SIGNALS.some(re => re.test(f.name))) return { ok: true, why: 'name:self-attributed' };
      if (agentSignalIsSelfAttributed(f.body)) return { ok: true, why: 'body:self-attributed' };
      return { ok: false, why: 'not-agent' };
    }
  },
  {
    id: 'R7',
    step: '決策樹 §2-15 ／ §3 邊界「影片客戶端」',
    desc: '影片客戶端／串流播放 → 影片',
    tier: 1,
    required: '影片',
    signals: [
      /video (player|client|app)/,
      /youtube (app|client|player)/,
      /video streaming client/,
      /ad[- ]free youtube/
    ],
    exclusions: [/downloader|download video/]
  },
  {
    id: 'R8',
    step: '決策樹 §2-16 ／ §3 邊界「音樂播放器」',
    desc: '音樂播放器 → 音訊',
    tier: 1,
    required: '音訊',
    signals: [/music player/, /audio player/, /音樂播放器|音乐播放器/],
    exclusions: []
  },
  {
    id: 'R9',
    step: '決策樹 §2-1',
    desc: '學術研究／論文／文獻 → 研究',
    tier: 2,
    required: '研究',
    signals: [
      /arxiv/,
      /research paper|academic (paper|research)/,
      /literature review|systematic review/,
      /preprint|peer[- ]reviewed/,
      /论文|論文|文献|學術|学术/
    ],
    exclusions: [/\bskill\b|skill\.md/]
  },
  {
    id: 'R10',
    step: '決策樹 §2-4 ／ §3 邊界「skill・plugin 集合」',
    desc: '領域專屬 skill・plugin 包 → 該領域',
    tier: 1,
    required: null,
    custom: (f) => {
      if (!/\bskills?\b|\bplugins?\b/.test(f.name)) return { ok: false, why: 'not-skill-pack' };
      if (PACK_LEARNING_ARTIFACT.test(f.name)) return { ok: false, why: 'excluded:learning-artifact' };
      const hit = SKILL_PACK_DOMAINS.find(d => d.re.test(f.name));
      if (hit) return { ok: true, why: `name-domain:${hit.cat}`, required: hit.cat };
      return { ok: false, why: 'no-domain-in-name' };
    }
  },
  {
    id: 'R10b',
    step: '決策樹 §2-4 ／ §1 分類定義「AI 框架」',
    desc: 'skill・plugin 包 誤置於 AI 框架 → AI 代理',
    tier: 1,
    required: 'AI 代理',
    custom: (f) => {
      if (f.cat !== 'AI 框架') return { ok: false, why: 'not-misfiled' };
      if (!/\bskills?\b|\bplugins?\b/.test(f.name)) return { ok: false, why: 'not-skill-pack' };
      if (PACK_LEARNING_ARTIFACT.test(f.name)) return { ok: false, why: 'excluded:learning-artifact' };
      if (SKILL_PACK_DOMAINS.some(d => d.re.test(f.name))) return { ok: false, why: 'domain-specific' };
      return { ok: true, why: 'pack-cannot-be-framework' };
    }
  },
  ...D_RULES
];

export const RULES_BY_PASS = [1, 2, 3]
  .map(p => RULES.filter(r => (r.pass || 1) === p))
  .filter(group => group.length > 0);

// ─── 多值身分推断 ─────────────────────────────────────────────────────────
// primary：依 pass 分層、先命中者勝（現行單一分類的替代）
export function inferPrimary(tool) {
  const f = fields(tool);
  for (const passRules of RULES_BY_PASS) {
    for (const rule of passRules) {
      const r = ruleApplies(rule, f);
      if (r.ok) {
        return { required: r.required || rule.required, rule: rule.id, why: r.why };
      }
    }
  }
  return null;
}

// secondary：掃描**所有**命中規則（不只第一個），返回其他身分候選。
// 這是「多重身分」的量化：一個工具可同時命中「API 整合」（它是 API）
// 與「AI 代理」（它是 agent 用的）等多個規則 → 多重身分。
// 不套用 pass 分層（因為 secondary 只作候選，不作 primary）。
export function inferSecondary(tool) {
  const f = fields(tool);
  const hits = [];
  for (const rule of RULES) {
    if (rule.pass !== undefined && rule.pass > 1) continue; // 只用 pass 1（精確規則）作 secondary，避免啟發偽陽性
    if (rule.tier !== 1) continue;
    const r = ruleApplies(rule, f);
    if (r.ok && r.required) {
      hits.push({ required: r.required, rule: rule.id, why: r.why });
    }
  }
  // 去重：同一分類多條規則命中只留第一條
  const seen = new Set();
  const out = [];
  for (const h of hits) {
    if (seen.has(h.required)) continue;
    seen.add(h.required);
    out.push(h);
  }
  return out;
}
