#!/usr/bin/env node
/**
 * infer-facets.js — 從既有禁用散文萃取結構化 negativeFacets（Batch 2）
 *
 * 🔒 與 enrich-registry.js 的差別：這裡是**有依據的轉換**——只從工具既有的
 *    negativeConstraints 散文萃取 ±facet 條目，不從 Name/URL「猜用途」；
 *    產出先過 core/registry-contract.js 的同一道格式門（白名 facet、極性、
 *    token 數、重複、上限），不合格的條目直接丟棄，寧少勿濫。
 *
 * 用法
 * ───
 *   node scripts/infer-facets.js --top=100              # dry-run：只印提案
 *   node scripts/infer-facets.js --top=100 --apply      # 寫入 registry
 *   node scripts/infer-facets.js --ids=a,b,c --apply    # 指定工具
 *   AGNES_API_KEY 必須設定（與 enrich-triggers-llm 同一環境變數）
 *
 * 冪等：已有 negativeFacets 的工具一律跳過（--force 可重萃）。
 */
import { loadRegistry, saveRegistry } from '../core/registry.js';
import { validateNegativeFacets } from '../core/registry-contract.js';

const API_KEY = process.env.AGNES_API_KEY;
if (!API_KEY) {
  console.error('Error: AGNES_API_KEY environment variable is missing.');
  process.exit(1);
}
const API_URL = 'https://apihub.agnes-ai.com/v1/chat/completions';
const MODEL = process.env.ENRICH_MODEL || 'agnes-2.5-flash';
const DELAY_MS = Number(process.env.INFER_DELAY_MS || 500);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const FORCE = args.includes('--force');
const topArg = args.find((a) => a.startsWith('--top='))?.split('=')[1];
const idsArg = args.find((a) => a.startsWith('--ids='))?.split('=')[1];

function buildPrompt(tool) {
  return `You convert a tool's free-text negative constraints into structured facet entries.

Output: ONLY a JSON array of strings. Each string is "[-+]facet:value".
- "-facet:value" = the tool must NOT be used when a request matches value (a true exclusion).
- "+facet:value" = the tool REQUIRES value to be useful (requests matching value are good fits; never a reason to reject).
- facet must be exactly one of: platform, language, license, pricing, deployment, ecosystem, format, scale, interface, integration
- value: lowercase, 1-3 words, english.
- At most 6 entries total. Use [] if nothing meaningful can be extracted.
- Preserve meaning EXACTLY. Watch for double negation: "not suitable for non-X" means the tool requires X => "+facet:x".

Facet cheatsheet: platform=OS/runtime surface, language=programming language, license=legal license, pricing=cost model, deployment=cloud/local/self-hosted, ecosystem=vendor/platform family, format=file/data format, scale=data size or team size, interface=CLI/GUI/API surface, integration=external service dependency.

Tool context:
name: ${tool.name}
description: ${tool.description || ''}
useCase: ${tool.useCase || ''}
negativeConstraints (free text, may be imperfect): ${(tool.negativeConstraints || []).join(' | ') || '(empty)'}`;
}

async function inferFacets(tool) {
  const body = JSON.stringify({
    model: MODEL,
    messages: [
      { role: 'system', content: 'You are a precise data-annotation engine. Output only valid JSON, no markdown.' },
      { role: 'user', content: buildPrompt(tool) },
    ],
    temperature: 0,
  });
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
    body,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 120)}`);
  const j = await res.json();
  const text = j.choices?.[0]?.message?.content || '';
  const jsonText = text.slice(text.indexOf('['), text.lastIndexOf(']') + 1);
  const parsed = JSON.parse(jsonText);
  if (!Array.isArray(parsed)) throw new Error(`非陣列輸出：${text.slice(0, 80)}`);
  return parsed.map((s) => String(s).trim().toLowerCase()).filter(Boolean);
}

async function main() {
  const registry = loadRegistry();
  const actives = registry.tools.filter((t) => t.status === 'active' || t.status === 'experimental');
  let candidates;
  if (idsArg) {
    const ids = new Set(idsArg.split(',').map((s) => s.trim()));
    candidates = actives.filter((t) => ids.has(t.id));
  } else {
    const top = Number(topArg || 100);
    candidates = [...actives]
      .sort((a, b) => (b.stars || 0) - (a.stars || 0))
      .slice(0, top);
  }
  if (!FORCE) candidates = candidates.filter((t) => !Array.isArray(t.negativeFacets) || t.negativeFacets.length === 0);
  candidates = candidates.filter((t) => (t.negativeConstraints || []).length > 0);
  console.log(`母體 ${candidates.length} 支（dry-run=${!APPLY}，model=${MODEL}）`);

  let ok = 0, rejected = 0, failed = 0, emptyOut = 0;
  const proposals = [];
  for (const tool of candidates) {
    try {
      const raw = await inferFacets(tool);
      const errors = validateNegativeFacets(raw);
      if (errors.length > 0) {
        const valid = raw.filter((e) => typeof e === 'string' && validateNegativeFacets([e]).length === 0);
        if (valid.length === 0) {
          rejected++;
          console.log(`  ✗ ${tool.id}: 全部條目不合格（${errors[0]}）`);
          await sleep(DELAY_MS);
          continue;
        }
        proposals.push({ id: tool.id, facets: valid, dropped: raw.length - valid.length });
        ok++;
      } else if (raw.length === 0) {
        emptyOut++;
        proposals.push({ id: tool.id, facets: [] });
      } else {
        proposals.push({ id: tool.id, facets: raw });
        ok++;
      }
    } catch (err) {
      failed++;
      console.log(`  ✗ ${tool.id}: ${err.message.slice(0, 100)}`);
    }
    await sleep(DELAY_MS);
  }

  const withEntries = proposals.filter((p) => p.facets.length > 0);
  console.log(`\n=== 摘要：成功 ${ok}、全遭門禁剔除 ${rejected}、空輸出 ${emptyOut}、API 失敗 ${failed}；帶條目 ${withEntries.length} 支 ===`);
  for (const p of withEntries) console.log(`  ${p.id}: ${JSON.stringify(p.facets)}${p.dropped ? `（丟棄 ${p.dropped} 筆不合格）` : ''}`);

  if (!APPLY) {
    console.log('\n（dry-run：未寫入。確認後加 --apply 寫入）');
    return;
  }
  let applied = 0;
  for (const p of withEntries) {
    const tool = registry.tools.find((t) => t.id === p.id);
    if (tool) {
      tool.negativeFacets = p.facets;
      applied++;
    }
  }
  if (applied > 0) saveRegistry(registry);
  console.log(`\n✅ 已寫入 ${applied} 支工具的 negativeFacets（經 saveRegistry）`);
}

main().catch((err) => {
  console.error('❌', err.message);
  process.exit(1);
});
