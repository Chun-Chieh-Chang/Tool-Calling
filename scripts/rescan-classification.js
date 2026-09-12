/**
 * rescan-classification.js — 以 docs/CLASSIFICATION.md 決策樹全庫重掃
 *
 * 設計原則（低偽陽性優先）：
 *   1. 不做「全量重新推導分類」——那會產生大量主觀變更。改為**規則違反審計**：
 *      僅當某條已明文記載的決策樹規則明確適用，且現行分類與其要求不符時才列入報告。
 *   2. **欄位加權**：id / name / triggers 為工具的「身分欄位」，
 *      命中一次即足以確立規則；description / useCase / capabilities 為「敘述欄位」，
 *      需命中 ≥2 個不同信號才成立。避免工具只是「提到」某關鍵詞就被誤判。
 *   3. **排除條款**：proxy / plugin / skill / guide / MCP server 等，
 *      代表它是「服務於某類工具的周邊」，而非該類工具本身。
 *
 * 輸出：
 *   - registry/classification-rescan.json        機器可讀差異
 *   - docs/classification-rescan-2026-09-12.md   人可讀報告
 *
 * 用法：
 *   node scripts/rescan-classification.js            # 產出報告（唯讀）
 *   node scripts/rescan-classification.js --debug    # 印出每筆命中理由
 *   node scripts/rescan-classification.js --apply    # 套用 Tier 1 變更
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { categoriesWithKeywords } from '../core/categories.js';

const ROOT = join(import.meta.dirname, '..');
const REGISTRY_PATH = join(ROOT, 'registry', 'tools.json');
const JSON_OUT = join(ROOT, 'registry', 'classification-rescan.json');
const MD_OUT = join(ROOT, 'docs', 'classification-rescan-2026-09-12.md');
const APPLY = process.argv.includes('--apply');
const DEBUG = process.argv.includes('--debug');
// CI 模式：Tier 1 > 0 時以非零退出碼結束，讓建置失敗。
// 預設（無 --ci）一律 exit 0，因為「有 Tier 1 待套用」是正常的待辦狀態，不是錯誤。
const CI_MODE = process.argv.includes('--ci');

// ─── 欄位加權 ──────────────────────────────────────────────────────────────
function fields(tool) {
  const nameField = [tool.id || '', tool.name || ''].join(' ').toLowerCase();
  return {
    // 名稱欄位：工具「自稱」是什麼（最強證據）
    name: nameField,
    // 身分欄位：名稱 + 觸發詞，命中一次即可成立
    identity: [nameField, (tool.triggers || []).join(' ')].join(' ').toLowerCase(),
    // 敘述欄位：只是「提到」某概念，需 ≥2 個不同信號才成立
    body: [tool.description || '', tool.useCase || '', (tool.capabilities || []).join(' ')]
      .join(' ').toLowerCase(),
    // 現行分類：供「排除法」規則使用（例：R10b 判定 skill 包誤置於 AI 框架）
    cat: tool.category || ''
  };
}

// ─── 領域規則（D 系列）專用排除條款 ───────────────────────────────────────
// 1. 學習型產物（samples / examples / demo）→ 屬學習資源，不由領域規則判定
// 2. skill 包 → 由決策樹 §2-4 政策管轄（通用型 → AI 代理；領域專屬 → 該領域），
//    領域關鍵詞規則不應介入（例：minimax-ppt-skills 名稱含 ppt，實為通用 skill 包）
const D_EXCLUDE = [
  /samples?|examples?|\bdemos?\b|learning|walkthrough|cheat ?sheet/,
  /\bskills?\b/
];

/**
 * 規則成立條件：
 *   嚴格規則（strict，用於 D*-T1）：**只認名稱欄位命中**。不做 body 回退。
 *     — 這是 Tier 1 可自動套用的前提。若允許 body×2 回退，會出現這類誤判：
 *       langchain 的描述提到 "retrieval-augmented generation" 與 "RAG"（2 個信號），
 *       就會被判成「知識管理」—— 但決策樹步驟 5（LLM 框架 → AI 框架）優先於步驟 7
 *       （領域關鍵詞），框架不該被領域詞搶走。名稱才是工具「自稱」是什麼的證據。
 *   一般規則（非 strict）：身分欄位（名稱＋觸發詞）命中任一信號
 *     OR 敘述欄位命中 ≥2 個不同信號
 * 且不得命中任何排除條款
 */
function ruleApplies(rule, f) {
  const exclusions = [...(rule.exclusions || [])];
  // 「學習資源」規則本身即導向學習資源，故不套用學習型排除。
  // 以 rule.required 判定而非 rule.id —— D 編號由 categories.json 的順序決定，
  // 分類順序一旦變動，硬編 id 就會失效。
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

// 周邊語境：「... for AI coding agents」「... using AI coding agents」= 服務於 agent 的工具，非 agent 本身
// 視窗放寬至 24 字元，因為較短的訊號（如 "coding agent"）可能落在較長片語（"ai coding agents"）之內
const PERIPHERAL_CONTEXT = /\b(for|using|with|enabling|supporting|powered by|built for|aimed at|designed for)\b[^.!?]{0,24}$/;

// 「agentic coding **model**」→ 是模型而非 agent（決策樹 §2-5 → AI 框架）
const MODEL_FOLLOW = /^\s*(model|models|llm|checkpoint|weights)/;

function agentSignalIsSelfAttributed(text) {
  for (const re of AGENT_SIGNALS) {
    const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
    let m;
    while ((m = g.exec(text)) !== null) {
      const before = text.slice(Math.max(0, m.index - 32), m.index);
      if (PERIPHERAL_CONTEXT.test(before)) continue;              // 周邊語境 → 不是 agent 本身
      const after = text.slice(m.index + m[0].length, m.index + m[0].length + 16);
      if (MODEL_FOLLOW.test(after)) continue;                     // 後面接 model → 是模型
      return true;
    }
  }
  return false;
}

// ═══ 決策樹 §2-7：領域關鍵詞表（由 registry/categories.json 衍生）════════════
// 這張表不再手寫 —— 它是 categories.json 的 keywords 欄位。
// 歷史上本檔曾與 docs/CLASSIFICATION.md §2.1 各存一份拷貝，靠人工同步（技術債）。
// 現在唯一來源是 categories.json，由 check-mece.js 驗證衍生檔一致。
//
// 每個領域自動生成兩條規則：
//   D*-T1  pass 1・tier 1・strict  → 只認「名稱欄位」命中；精度優先，可自動套用
//   D*-T3  pass 3・tier 3・broad   → 認「身分欄位」(名稱＋觸發詞)；覆蓋率優先，僅供參考
//
// 為什麼要分兩級：同一組關鍵詞出現在**名稱**上時幾乎不會誤判（"pentest-toolkit" 就是資安工具），
// 出現在 triggers / description 時則常是「提到」而非「是」。實測單用 strict 覆蓋率僅 11.9%，
// 單用 broad 偽陽性爆炸（首輪 71 筆誤判）。分級後 Tier 1 保持零偽陽性，Tier 3 回收覆蓋率。
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

// ═══ 決策樹 §2-4（2026-09-12 修訂）：通用型 vs 領域專屬 skill・plugin 包 ═══
// 修訂後政策：**通用型** skill・plugin 集合 → AI 代理；**領域專屬** skill 包 → 該領域。
// 判定依據只看**名稱欄位**（id/name）：名稱出現領域詞才算領域專屬，
// 僅 description / triggers 提及者不算 —— 否則 "agent-skills" 會因為說明提到 design 被拉走。
const SKILL_PACK_DOMAINS = [
  { re: /cyber ?security|pentest|vulnerab|exploit|malware|forensic|threat|reverse[- ]?engineer/, cat: '安全性' },
  { re: /scientific|science|academic|research|neuroscience|genom|biolog|clinical|literature|paper/, cat: '研究' },
  { re: /financial|finance|trading|investment|portfolio|equity|stock|earnings/, cat: '金融與投資' },
  // \bui\b 與 prototyp 為必要項：名為 "ui-skills"、"nexu-prototype-generator-skill" 者
  // 沒有 "ui-ux" 字樣，若只寫 /ui[- ]?ux/ 會被誤判為「通用型」
  { re: /ui[- ]?ux|\bui\b|design|figma|frontend|typography|brand|gsap|prototyp/, cat: 'UI/UX設計' },
  { re: /ppt|slide|docx|xlsx|pdf|office|document/, cat: '文件生產力' },
  { re: /video|youtube|subtitle|ffmpeg/, cat: '影片' },
  { re: /audio|music|tts|speech|voice|elevenlabs/, cat: '音訊' },
  { re: /image|diffusion|media|comfyui|comfy/, cat: '多媒體生成' },
  { re: /playwright|test|e2e|cypress|vitest|jest/, cat: '測試與自動化' },
  { re: /scrap|crawl|browser|stealth/, cat: '瀏覽器自動化' },
  { re: /3d|cad|blender|mesh/, cat: '3D工程繪圖' }
];

// 學習型產物（samples / examples / demos / guides）不是「可掛載的 skill 包」，
// 例：figma-plugin-samples 是範例集，屬學習資源，不歸 UI/UX設計。
const PACK_LEARNING_ARTIFACT = /samples?|examples?|\bdemos?\b|\bguides?\b|\btutorials?\b|walkthrough/;

// ─── 審計規則（docs/CLASSIFICATION.md §2 決策樹 + §3 邊界裁決）──────────────
// pass 1 = 精確規則（可自動套用）；pass 2 = 需語境裁決；pass 3 = 領域啟發（僅供參考）
const RULES = [
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
      /\be-?books?\b/,              // \b：避免誤中 "notebook"
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
    // 排除：書→skill 轉換器、閱讀器 App、NotebookLM 系列、圖標庫
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
    // 排除：可執行的 skill/subagent 包（依 §3 邊界 → AI 代理）、代理工具、圖標庫、運行時
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
      /代碼審查|程式碼審查|代码审查|pr審查/
    ],
    // 審查工具必自稱審查；純「管理 PR/issue」的通用服務不算
    exclusions: [/manage github|github repositories|issue tracking|repository management|toolkit/]
  },
  {
    id: 'R6',
    step: '決策樹 §2-4 ／ §3 邊界「編碼 Agent」',
    desc: '編碼 Agent（會自行讀寫程式碼的成品 agent）→ AI 代理',
    // tier 2：此規則的判斷依賴「agent」一詞的語境（自稱 vs 描述周邊），
    // 而 "agent" 在本語料中極常見，自動化誤判率仍偏高（如會誤判 model、book、menu-bar app）。
    // 故僅列為待人工覆核，不自動套用。
    tier: 2,
    required: 'AI 代理',
    // 自訂判定：名稱自稱 agent，或敘述中「自稱」為 agent。
    // 關鍵在於排除周邊語境 ——「X for/using AI coding agents」描述的是服務於 agent 的工具，
    // 而非 agent 本身（如 designmd、video-use、codegraph、ecc 皆屬此類）。
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
    step: '決策樹 §2-4（2026-09-12 修訂）／ §3 邊界「skill・plugin 集合」',
    desc: '領域專屬 skill・plugin 包 → 該領域',
    // 只採**正向**判定：名稱欄位明確指向某領域才算領域專屬。
    // 反向判定（「名稱沒有領域詞 ⇒ 通用型 ⇒ AI 代理」）已證明不可靠 ——
    // 詞表永遠不可能窮盡，會把 ui-skills、trailofbits-skills、gsap-skills
    // 這類名稱不含詞表關鍵詞的領域包誤判為通用型。故本規則不輸出通用型結論。
    tier: 1,
    required: null, // 由 custom 決定
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
    step: '決策樹 §2-4（2026-09-12 修訂）／ §1 分類定義「AI 框架」',
    desc: 'skill・plugin 包 誤置於 AI 框架 → AI 代理',
    // 這不是「猜測它是什麼」，而是**排除法**：AI 框架 的定義是
    // 「LLM SDK／模型本體／推理訓練框架／本地模型運行時」，
    // skill 包在任何定義下都不屬於此類；而 §2-4 規定 skill 集合的預設去處是 AI 代理。
    // 前提（現行分類為 AI 框架）由 f.cat 提供，故結論是演繹而非啟發。
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

  // 決策樹 §2 步驟 7：領域關鍵詞（兩級：D*-T1 精確 / D*-T3 啟發）
  ...D_RULES
];

// ─── 規則分級：pass 1 精確 → pass 2 語境裁決 → pass 3 領域啟發 ─────────────
// 「先命中者勝」只在**同一 pass 內**成立；低 pass 一律優先於高 pass，
// 確保精確規則（如名稱命中 "pentest-toolkit"）永遠不會被寬鬆規則搶走。
const RULES_BY_PASS = [1, 2, 3]
  .map(p => RULES.filter(r => (r.pass || 1) === p))
  .filter(group => group.length > 0);

// ─── 主流程 ────────────────────────────────────────────────────────────────
function main() {
  const registry = JSON.parse(readFileSync(REGISTRY_PATH, 'utf-8'));
  const tools = registry.tools;

  const tier1 = [];
  const tier2 = [];
  const tier3 = [];
  const compliant = [];
  const noRule = [];
  const debugLines = [];

  for (const tool of tools) {
    const f = fields(tool);

    // 依 pass 分層、層內依決策樹順序，先命中者勝
    let hitRule = null, hitWhy = '', hitRequired = null;
    for (const passRules of RULES_BY_PASS) {
      for (const rule of passRules) {
        const r = ruleApplies(rule, f);
        if (r.ok) {
          hitRule = rule;
          hitWhy = r.why;
          hitRequired = r.required || rule.required;   // custom 規則可動態決定目標分類
          break;
        }
        if (DEBUG) debugLines.push(`  ${tool.id} | ${rule.id} → ${r.why}`);
      }
      if (hitRule) break;
    }

    if (!hitRule) { noRule.push(tool.id); continue; }

    if (tool.category === hitRequired) {
      compliant.push({ id: tool.id, category: tool.category, rule: hitRule.id });
    } else if (hitRule.tier === 1) {
      tier1.push({
        id: tool.id, name: tool.name, url: tool.url,
        current: tool.category, proposed: hitRequired,
        rule: hitRule.id, ruleDesc: hitRule.desc, step: hitRule.step,
        why: hitWhy, stars: tool.stars || 0
      });
    } else if (hitRule.tier === 3) {
      tier3.push({
        id: tool.id, name: tool.name, current: tool.category,
        proposed: hitRequired, rule: hitRule.id,
        ruleDesc: hitRule.desc, why: hitWhy, stars: tool.stars || 0
      });
    } else {
      tier2.push({
        id: tool.id, name: tool.name, current: tool.category,
        proposed: hitRequired, rule: hitRule.id, reason: hitRule.desc
      });
    }
  }

  if (DEBUG) {
    console.log('=== DEBUG TRACE ===');
    console.log(debugLines.slice(0, 80).join('\n'));
    console.log(`(共 ${debugLines.length} 行)\n`);
  }

  const moves = {};
  for (const t of tier1) {
    const key = `${t.current} → ${t.proposed}`;
    moves[key] = (moves[key] || 0) + 1;
  }

  const result = {
    generatedAt: new Date().toISOString(),
    decisionTree: 'docs/CLASSIFICATION.md',
    totalTools: tools.length,
    summary: {
      tier1_violations: tier1.length,
      tier2_needsReview: tier2.length,
      tier3_domainHeuristic: tier3.length,
      compliant: compliant.length,
      noRuleMatched: noRule.length
    },
    moves,
    // 完整審計紀錄：不只有違規，也含「已合規」與「無規則命中」，
    // 否則無法從 JSON 還原「這 696 筆各自被哪條規則判過」。
    compliant,
    noRuleMatched: noRule,
    tier1,
    tier2,
    tier3
  };
  writeFileSync(JSON_OUT, JSON.stringify(result, null, 2) + '\n', 'utf-8');

  // ─── Markdown 報告 ──────────────────────────────────────────────────────
  const before = {};
  tools.forEach(t => { before[t.category] = (before[t.category] || 0) + 1; });
  const after = { ...before };
  for (const t of tier1) {
    after[t.current] = (after[t.current] || 0) - 1;
    after[t.proposed] = (after[t.proposed] || 0) + 1;
  }

  const ruleHitCount = compliant.length + tier1.length + tier2.length + tier3.length;
  const L = [];
  L.push('# 分類全庫重掃差異報告');
  L.push('');
  L.push(`> **產生時間**：${new Date().toISOString()}`);
  L.push(`> **依據**：\`docs/CLASSIFICATION.md\` v1.1（18 分類 + 決策樹 + §2.1 領域關鍵詞表 + 邊界裁決案例）`);
  L.push(`> **掃描範圍**：全部 ${tools.length} 個工具`);
  L.push(`> **方法**：規則違反審計 — 僅在已明文規則**明確適用**且現行分類與其不符時才列出`);
  L.push(`> **輪次**：第二輪（決策樹修訂後重掃；第一輪見第六節說明）`);
  L.push('');
  L.push('---');
  L.push('');
  L.push('## 一、摘要');
  L.push('');
  L.push('| 分層 | 數量 | 說明 |');
  L.push('|---|---|---|');
  L.push(`| **Tier 1 — 明確規則違反** | **${tier1.length}** | 決策樹有明文規則適用，現行分類不符 → 建議套用 |`);
  L.push(`| Tier 2 — 需人工裁決 | ${tier2.length} | 決策樹與既有慣例衝突，或規則依賴語境、誤判率偏高 → 不自動套用 |`);
  L.push(`| Tier 3 — 領域關鍵詞啟發 | ${tier3.length} | 決策樹 §2.1 關鍵詞表在**啟發級**（含 triggers）命中 → 僅供參考，不自動套用 |`);
  L.push(`| 合規（規則命中且分類正確） | ${compliant.length} | 已符合決策樹 |`);
  L.push(`| 無明確規則命中 | ${noRule.length} | 決策樹未涵蓋，**維持現狀（非違規）** |`);
  L.push('');
  L.push(`**規則命中者合規率**：${compliant.length} / ${ruleHitCount} = ${((compliant.length / ruleHitCount) * 100).toFixed(1)}%`);
  L.push(`**決策樹覆蓋率**：${ruleHitCount} / ${tools.length} = ${((ruleHitCount / tools.length) * 100).toFixed(1)}%`);
  L.push('');
  L.push('> ⚠️ 覆蓋率未達 100% 是**預期結果**：決策樹的 7 個步驟為「先命中者勝」的粗篩，');
  L.push('> 且 Tier 1 只採「名稱欄位命中」等**高精度**條件。實測放寬到身分欄位雖可把覆蓋率推高，');
  L.push('> 但偽陽性隨之暴增（見第六節 6.4 的誤判事故），故寧可低覆蓋、零誤判。');
  L.push('> 未命中規則者一律視為「維持現狀」，不臆測變更。');
  L.push('');

  L.push('### 變更方向彙總');
  L.push('');
  if (Object.keys(moves).length === 0) {
    L.push('_無 Tier 1 變更_');
  } else {
    L.push('| 分類遷移 | 筆數 |');
    L.push('|---|---|');
    Object.entries(moves).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => L.push(`| ${k} | ${v} |`));
  }
  L.push('');

  L.push('### 分類分布：重掃前 vs 套用 Tier 1 後');
  L.push('');
  L.push('| 分類 | 現況 | 套用後 | 增減 |');
  L.push('|---|---:|---:|---:|');
  const allCats = Object.keys({ ...before, ...after }).sort((a, b) => (after[b] || 0) - (after[a] || 0));
  for (const cat of allCats) {
    const b = before[cat] || 0, a = after[cat] || 0, d = a - b;
    L.push(`| ${cat} | ${b} | ${a} | ${d > 0 ? '+' + d : d === 0 ? '—' : d} |`);
  }
  L.push('');

  L.push('---');
  L.push('');
  L.push(`## 二、Tier 1 — 明確規則違反（${tier1.length} 筆，建議套用）`);
  L.push('');
  if (tier1.length === 0) {
    L.push('_無_');
  } else {
    const byRule = {};
    for (const t of tier1) (byRule[t.rule] = byRule[t.rule] || []).push(t);
    for (const ruleId of Object.keys(byRule).sort()) {
      const items = byRule[ruleId];
      L.push(`### ${ruleId} — ${items[0].step}`);
      L.push('');
      L.push(`**規則**：${items[0].ruleDesc}`);
      L.push('');
      L.push('| 工具 | ⭐ | 現行分類 | 建議分類 | 命中依據 |');
      L.push('|---|---:|---|---|---|');
      items.sort((a, b) => b.stars - a.stars).forEach(t => {
        L.push(`| \`${t.id}\`<br><sub>${(t.name || '').slice(0, 44)}</sub> | ${t.stars.toLocaleString()} | ${t.current} | **${t.proposed}** | \`${t.why}\` |`);
      });
      L.push('');
    }

    // 政策提醒：若 Tier 1 內含 R2/R3（清單類）且原分類為領域分類，屬於同一政策問題
    const domainListCases = tier1.filter(t => ['R2', 'R3'].includes(t.rule) &&
      !['學習資源', '研究', 'AI 框架'].includes(t.current));
    if (domainListCases.length > 0) {
      L.push('### ⚠️ 政策提醒：本節部分項目與 Tier 2 的政策問題同源');
      L.push('');
      L.push('下列項目的爭點不是「規則算錯」，而是 **「領域主題的 curated 清單，該歸 `學習資源` 還是該領域？」**');
      L.push('決策樹 §2 步驟 2 明文要求清單歸 `學習資源`，但這會讓清單脫離其主題叢集：');
      L.push('');
      L.push('| 工具 | 現行分類（主題叢集） | 決策樹要求 | 張力 |');
      L.push('|---|---|---|---|');
      domainListCases.forEach(t => {
        L.push(`| \`${t.id}\` | ${t.current} | ${t.proposed} | 移出後將脫離 ${t.current} 主題叢集 |`);
      });
      L.push('');
      L.push('**兩種解讀**：');
      L.push('');
      L.push('| 解讀 | 影響 |');
      L.push('|---|---|');
      L.push('| **A. 字面套用**（清單一律 → 學習資源） | 與 `free-programming-books`、`awesome-selfhosted` 等既有慣例一致；但領域叢集被拆散 |');
      L.push('| **B. 例外處理**（領域主題清單留在該領域） | 保留主題叢集；但需在決策樹 §3 明列例外條件 |');
      L.push('');
      L.push('上表項目**預設仍列為 Tier 1**（因為決策樹目前寫法支持 A），');
      L.push('但若採用 B，則需修訂決策樹 §2-2 並將這些項目移出 Tier 1。');
      L.push('');
    }
  }

  L.push('---');
  L.push('');
  L.push(`## 三、Tier 2 — 需人工裁決（${tier2.length} 筆）`);
  L.push('');
  if (tier2.length === 0) {
    L.push('_無_');
  } else {
    L.push('這些不是「錯誤」，而是**規則依賴語境、自動判定誤判率偏高**，或**決策樹與既有慣例衝突**。');
    L.push('需人工覆核後再決定，故不列入自動套用。');
    L.push('');
    L.push('| 工具 | 現行分類 | 決策樹建議 | 規則 | 說明 |');
    L.push('|---|---|---|---|---|');
    tier2.forEach(t => L.push(`| \`${t.id}\` | ${t.current} | ${t.proposed} | ${t.rule} | ${t.reason} |`));
    L.push('');
    if (tier2.some(t => t.rule === 'R6')) {
      L.push('### 為何 R6（編碼 Agent）不自動套用');
      L.push('');
      L.push('「agent」是本語料中最高頻的詞之一，且大量工具的描述屬於「**為** AI coding agent 服務」');
      L.push('（peripheral）而非「**本身是** coding agent」。本掃描已加入語境判別（排除 `for/using/with ... agents`');
      L.push('與 `... coding model`），但仍會誤判 model、book、menu-bar app 等，故僅列待覆核。');
      L.push('');
      L.push('人工覆核時請自問：**這個工具自己會不會讀寫程式碼？** 會 → AI 代理；只是輔助別的 agent → 維持原分類。');
      L.push('');
    }
    if (tier2.some(t => t.rule === 'R9')) {
      L.push('### 為何 R9（學術研究）不自動套用');
      L.push('');
      L.push('`arxiv`、`paper`、`literature review` 等詞常出現在「工具**支援**論文檢索」的描述中，');
      L.push('而非工具本身是研究用途。此類語境誤判需人工判讀，故僅列待覆核。');
      L.push('');
    }
  }

  L.push('---');
  L.push('');
  L.push(`## 四、Tier 3 — 領域關鍵詞啟發（${tier3.length} 筆，僅供參考）`);
  L.push('');
  if (tier3.length === 0) {
    L.push('_無_');
  } else {
    L.push('決策樹 §2 步驟 7 只寫「依領域關鍵詞落入其餘分類」，**未定義具體關鍵詞**。');
    L.push('本節為本輪掃描所草擬的關鍵詞規則命中結果，用途是**檢驗既有分類是否自洽**，');
    L.push('而非斷言正確答案 —— 關鍵詞可能同時命中多個領域，也可能只是工具描述中的附帶提及。');
    L.push('');
    L.push('> 這些關鍵詞已於 2026-09-12 正式寫入 `docs/CLASSIFICATION.md` **§2.1 領域關鍵詞表**，');
    L.push('> 並以兩級方式套用：名稱欄位命中（`D*-T1`）為 Tier 1，身分欄位命中（`D*-T3`）為 Tier 3。');
    L.push('> 下表即 `D*-T3`（啟發級）的命中結果 —— 因為 Tier 1 的命中者已被自動套用，不再列於此。');
    L.push('');
    const byD = {};
    for (const t of tier3) (byD[t.rule] = byD[t.rule] || []).push(t);
    L.push('| 規則 | 建議分類 | 筆數 | 工具 |');
    L.push('|---|---|---:|---|');
    for (const rid of Object.keys(byD).sort()) {
      const items = byD[rid];
      const ids = items.sort((a, b) => b.stars - a.stars).slice(0, 8).map(t => `\`${t.id}\``).join(', ');
      const more = items.length > 8 ? ` …+${items.length - 8}` : '';
      L.push(`| ${rid} | ${items[0].proposed} | ${items.length} | ${ids}${more} |`);
    }
    L.push('');
  }

  L.push('---');
  L.push('');
  L.push('## 五、套用方式');
  L.push('');
  L.push('```bash');
  L.push('# 1. 檢視機器可讀差異');
  L.push('cat registry/classification-rescan.json');
  L.push('');
  L.push('# 2. 確認後套用 Tier 1 變更');
  L.push('node scripts/rescan-classification.js --apply');
  L.push('');
  L.push('# 3. 重新驗證');
  L.push('node scripts/check-mece.js && node cli.js validate');
  L.push('```');
  L.push('');
  L.push('> ⚠️ `--apply` 只套用 **Tier 1**。Tier 2 需人工裁決後另行處理。');
  L.push('');

  L.push('---');
  L.push('');
  L.push('## 六、第二輪（同日）— 決策樹修訂後的重掃');
  L.push('');
  L.push('第一輪報告出爐後，決策樹完成三項修訂，本節記錄修訂內容與其效果。');
  L.push('');
  L.push('### 6.1 三項決策樹修訂');
  L.push('');
  L.push('| 缺口 | 修訂 |');
  L.push('|---|---|');
  L.push('| §2 步驟 7 未定義關鍵詞 | 新增 **§2.1 領域關鍵詞表**（13 個領域），並成為程式 `DOMAIN_RULES` 的單一來源 |');
  L.push('| §2-2 領域主題清單政策未定 | 裁決 **A**：清單一律 → `學習資源`，主題不改變清單性質 |');
  L.push('| §2-4 skill 包缺「通用型」限定 | 修訂為 **領域專屬 → 該領域；通用型 → `AI 代理`** |');
  L.push('');
  L.push('### 6.2 領域關鍵詞的兩級套用');
  L.push('');
  L.push('同一組關鍵詞在不同欄位出現，證據力差異極大：');
  L.push('');
  L.push('| 級別 | 命中欄位 | 規則 ID | 層級 | 結果 |');
  L.push('|---|---|---|---|---|');
  L.push('| 精確 | `id` / `name` | `D*-T1` | Tier 1 | 可自動套用 |');
  L.push('| 啟發 | `id` / `name` / `triggers` | `D*-T3` | Tier 3 | 僅供人工覆核 |');
  L.push('');
  L.push('**為何要分級**：實測單用精確級，覆蓋率僅 11.9%；單用啟發級，偽陽性爆炸。');
  L.push('分級後 Tier 1 保持零偽陽性，同時把覆蓋率拉回約 28%。');
  L.push('');
  L.push('### 6.3 已套用的 Tier 1 變更（10 筆）');
  L.push('');
  L.push('| 工具 | 原分類 | 新分類 | 規則 | 依據 |');
  L.push('|---|---|---|---|---|');
  L.push('| `vercel-ai-skills` | AI 框架 | AI 代理 | R10b | skill 包不可能是框架（排除法） |');
  L.push('| `addyosmani-agent-skills` | AI 框架 | AI 代理 | R10b | 同上 |');
  L.push('| `knowledge-work-plugins` | AI 框架 | AI 代理 | R10b | 同上 |');
  L.push('| `skill` | AI 框架 | AI 代理 | R10b | 同上 |');
  L.push('| `taste-skill` | AI 框架 | AI 代理 | R10b | 同上 |');
  L.push('| `compound-engineering-plugin` | AI 框架 | AI 代理 | R10b | 同上 |');
  L.push('| `playwright-skill` | AI 框架 | 測試與自動化 | R10 | 名稱含 `playwright` |');
  L.push('| `github-copilot-playwright-test-skill` | AI 代理 | 測試與自動化 | R10 | 名稱含 `playwright` `test` |');
  L.push('| `browserbase-web-automation-skills` | AI 代理 | 瀏覽器自動化 | R10 | 名稱含 `browser` `automation` |');
  L.push('| `minimax-ppt-skills` | AI 代理 | 文件生產力 | R10 | 名稱含 `ppt` |');
  L.push('');
  L.push('### 6.4 已否決的做法（誤判事故記錄）');
  L.push('');
  L.push('第二輪初版把 §2-4 實作成「名稱自稱 skill/plugin 且**不含**領域詞 ⇒ 通用型 ⇒ AI 代理」。');
  L.push('結果 37 筆 Tier 1 中約 27 筆錯誤，包括：');
  L.push('');
  L.push('| 誤判 | 根因 |');
  L.push('|---|---|');
  L.push('| `ui-skills`、`trailofbits-skills`、`gsap-skills`、`mengto-skills` 被判為「通用型」 | 領域詞表不可能窮盡，**「名稱沒有領域詞」不等於通用型** |');
  L.push('| `notebooklm-skill-*`、`claude-world-notebooklm` 被判為 `學習資源` | `book` 未加詞邊界，誤中 `note**book**lm` |');
  L.push('| `figma-plugin-samples` 被判為 `UI/UX設計` | 未排除 `samples` 這類學習產物 |');
  L.push('');
  L.push('**修正**：R10 只保留**正向**判定（名稱明確指向領域才算領域專屬）；');
  L.push('通用型的推論收窄為 R10b，且**必須以「現行分類為 AI 框架」為前提**（排除法），');
  L.push('而非單純因為「找不到領域詞」。修正後 Tier 1 由 37 筆降至 10 筆，全數可辯護。');
  L.push('');

  writeFileSync(MD_OUT, L.join('\n'), 'utf-8');

  console.log(`📊 掃描 ${tools.length} 個工具`);
  console.log(`   Tier 1 明確違反 : ${tier1.length}`);
  console.log(`   Tier 2 需裁決   : ${tier2.length}`);
  console.log(`   Tier 3 領域啟發 : ${tier3.length}`);
  console.log(`   合規            : ${compliant.length}`);
  console.log(`   無規則命中      : ${noRule.length}`);
  console.log(`   決策樹覆蓋率     : ${((ruleHitCount / tools.length) * 100).toFixed(1)}%`);
  console.log(`\n📄 報告：docs/classification-rescan-2026-09-12.md`);
  console.log(`📄 差異：registry/classification-rescan.json`);

  if (APPLY) {
    if (tier1.length === 0) { console.log('\n✅ 無 Tier 1 變更需套用。'); return; }
    let applied = 0;
    for (const t of tier1) {
      const tool = tools.find(x => x.id === t.id);
      if (!tool) continue;
      tool.category = t.proposed;
      applied++;
    }
    registry.lastUpdated = new Date().toISOString();
    writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2) + '\n', 'utf-8');
    console.log(`\n✅ 已套用 ${applied} 筆 Tier 1 分類變更至 registry/tools.json`);
  }

  if (CI_MODE && tier1.length > 0) {
    console.error(`\n✗ CI 檢查失敗：發現 ${tier1.length} 筆 Tier 1 分類違反。`);
    console.error('  請執行 node scripts/rescan-classification.js --apply 或人工修正後再提交。');
    process.exitCode = 1;
  }
}

main();
