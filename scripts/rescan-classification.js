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

// 規則引擎已抽至 core/classification-rules.js（唯讀純函式），
// 讓多值推断（infer-multidimensional.js）與本腳本共用同一份規則，避免兩份規則漂移。
// 本腳本僅負責「規則違反審計」流程（Tier 1/2/3 分層、--apply、報告產出）。
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  fields,
  ruleApplies,
  RULES_BY_PASS,
} from '../core/classification-rules.js';

const ROOT = join(import.meta.dirname, '..');
const REGISTRY_PATH = join(ROOT, 'registry', 'tools.json');
const JSON_OUT = join(ROOT, 'registry', 'classification-rescan.json');
const MD_OUT = join(ROOT, 'docs', 'classification-rescan-2026-09-12.md');
const APPLY = process.argv.includes('--apply');
const DEBUG = process.argv.includes('--debug');
// CI 模式：Tier 1 > 0 時以非零退出碼結束，讓建置失敗。
// 預設（無 --ci）一律 exit 0，因為「有 Tier 1 待套用」是正常的待辦狀態，不是錯誤。
const CI_MODE = process.argv.includes('--ci');

// ═══ 規則引擎（fields / ruleApplies / EX / AGENT_SIGNALS / RULES / RULES_BY_PASS）══
// 已抽取至 core/classification-rules.js（唯讀純函式），本腳本不再內含重複定義。
// 多值推断 infer-multidimensional.js 亦共用同一份規則，避免兩份規則漂移。

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
  // CI 模式是唯讀閘門，不寫檔。
  // 否則每次跑 gate 都會弄髒工作區 —— generatedAt 每次都不同，產生物
  // 永遠顯示為「已修改」，讓真正的變更淹沒在雜訊裡。
  if (!CI_MODE) writeFileSync(JSON_OUT, JSON.stringify(result, null, 2) + '\n', 'utf-8');

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

  if (!CI_MODE) writeFileSync(MD_OUT, L.join('\n'), 'utf-8');

  console.log(`📊 掃描 ${tools.length} 個工具`);
  console.log(`   Tier 1 明確違反 : ${tier1.length}`);
  console.log(`   Tier 2 需裁決   : ${tier2.length}`);
  console.log(`   Tier 3 領域啟發 : ${tier3.length}`);
  console.log(`   合規            : ${compliant.length}`);
  console.log(`   無規則命中      : ${noRule.length}`);
  console.log(`   決策樹覆蓋率     : ${((ruleHitCount / tools.length) * 100).toFixed(1)}%`);
  if (CI_MODE) {
    console.log('\n（CI 模式：唯讀，未寫入報告檔）');
  } else {
    console.log(`\n📄 報告：docs/classification-rescan-2026-09-12.md`);
    console.log(`📄 差異：registry/classification-rescan.json`);
  }

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
