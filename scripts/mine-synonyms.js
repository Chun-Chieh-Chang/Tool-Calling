/**
 * 同義詞詞典自動挖掘腳本
 *
 * 背景：search-engine.js 原本的 SYNONYM_MAP 是手動維護的固定字典，
 * 覆蓋率有限（例如原本完全沒有「翻譯/translate」這組映射，導致中文查詢
 * 「翻譯」零結果，即使 registry 裡確實有相關工具）。
 *
 * 這支腳本改從 registry/tools.json 既有的 triggers 資料「自動挖掘」
 * 中英文同義詞對：同一個工具的 triggers 陣列本身就是一組「輸入這些詞
 * 都應該找到同一個工具」的詞彙，例如 ppt-master 的 triggers 是
 * ["ppt","powerpoint","簡報","slides","presentation",...]——這些詞彼此
 * 之間本來就是（近似）同義詞關係，不需要另外人工標註。
 *
 * 挖掘邏輯：
 *   1. 對每個工具的 triggers，依字元判斷分成「含中文」與「純拉丁字母」兩組
 *   2. 排除「過於通用」的詞（例如 mcp / skills / agent 這類出現在十幾二十個
 *      工具裡的生態系標籤——它們不代表任何單一具體概念，若納入挖掘，
 *      會把彼此無關的中文詞透過這些通用詞錯誤地連在一起）
 *   3. 統計「中文詞 × 英文詞」在同一個工具 triggers 中共同出現的次數，
 *      只保留在 ≥2 個不同工具中都共現的配對（單一工具的巧合共現不採信，
 *      跨工具重複出現才視為可信的同義詞證據）
 *   4. 對於共享同一個錨點詞（同一個英文詞或中文詞）的一群詞，彼此也建立
 *      連結（例如「簡報」「投影片」都連到 "presentation"，因此「簡報」
 *      「投影片」之間也建立連結）
 *   5. 與少量人工維護的「種子詞典」取聯集合併——這份種子詞典只放
 *      「trigger 共現資料不足以自動挖掘出來、但確定是核心概念」的極少數
 *      條目（例如翻譯/translate 這組，目前沒有任何工具把中英文詞
 *      同時放進 triggers，純粹靠自動挖掘挖不到）。種子詞典應盡量精簡，
 *      隨著 registry 內容變豐富，未來理想上應該逐漸不需要它。
 *
 * 輸出：core/synonyms.generated.js（純 ESM，`export const SYNONYM_MAP = {...}`），
 * 由 core/search-engine.js 直接 import 使用。
 *
 * 使用方式：
 *   node scripts/mine-synonyms.js        # 手動重新挖掘
 *   （scripts/build-web.js 部署前也會自動呼叫一次，確保 dist 內容最新）
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

const CJK_RE = /[\u4e00-\u9fff]/;
const isChinese = (term) => CJK_RE.test(term);

// 出現在超過此數量工具的 trigger 詞彙視為「過於通用的生態系標籤」
// （如 mcp、skills、agent、llm、automation），不參與挖掘，避免透過
// 通用詞把彼此無關的概念錯誤地連在一起。
const EXCLUDE_DF_THRESHOLD = 5;

// 一組中英文詞至少要在幾個「不同工具」的 triggers 中共同出現，
// 才視為可信的同義詞證據。
//
// 註：實測 279 個工具的 registry 資料偏稀疏——93 組候選配對全部只出現在
// 剛好 1 個工具裡，沒有任何配對重複出現在 2 個以上的工具中。若門檻設為 2，
// 會直接把整個挖掘結果清空。因此暫時降為 1（也就是只要同一個工具的
// triggers 裡「同時」出現某個中文詞與某個英文詞，就視為候選同義詞）。
// 這仍然是有意義的訊號，因為 triggers 本身就是人工為單一工具精心挑選的
// 一組「同義觸發詞」，並非自由文字；主要風險是同一工具內較長的 triggers
// 清單可能涵蓋多個略有差異的子概念（例如 strix 的 "漏洞" 和 "auto-fix"
// 其實不是真同義詞，只是剛好都是同一個資安工具的觸發詞）。
// 隨著未來 registry 內容變多、更多工具的 triggers 出現重疊，
// 建議把此門檻調高回 2 以上以提升精確度。
const MIN_PAIR_COOCCURRENCE = 1;

// 每個詞最多保留幾個挖掘出的同義詞，避免長尾雜訊詞拖累查詢擴展效能。
const MAX_MINED_SYNONYMS_PER_TERM = 8;

// 種子詞典：僅保留「目前 triggers 共現資料挖不到、但確定重要」的少量條目。
// 隨 registry 內容增加、更多工具把中英文 triggers 放在一起，
// 這份清單理論上可以持續精簡。
const SEED_SYNONYMS = {
  '翻譯': ['translate', 'translation', 'localization', '在地化', '本地化'],
  'translate': ['翻譯', 'translation', 'localization', '在地化'],
  'translation': ['翻譯', 'translate', 'localization'],
};

// 別名種子：registry 裡的中文 triggers 多半是「安全測試」「跨瀏覽器測試」
// 這類複合詞組，很少見到單獨的「安全」「測試」「檔案」「影片」這種通用
// 短詞本身被當成 trigger，導致純挖掘找不到這些常見短詞的同義詞。
// 這裡不手動列出完整同義詞清單，而是讓這些短詞「併入」挖掘階段已經
// 找到的對應概念群組（例如「安全」併入「漏洞」那個已挖掘出
// pentest/vulnerability/security... 的群組）。好處是這些短詞的同義詞
// 內容仍然完全來自挖掘結果，未來挖掘出的群組變豐富時，這裡會自動跟著變豐富，
// 不需要再手動維護內容，只需要維護「哪個短詞屬於哪個群組」這一行對應關係。
const ALIAS_SEEDS = {
  '安全': '漏洞',
  '測試': '自動化測試',
  '檔案': '檔案系統',
  '影片': '影片生成',
};

/**
 * 從 tools 陣列挖掘中英文同義詞詞典
 * @param {object[]} tools
 * @returns {{ map: Record<string,string[]>, stats: object }}
 */
export function mineSynonyms(tools) {
  // Step 1: 計算每個 trigger 詞彙的文件頻率（df）
  const df = new Map();
  const perToolTriggers = [];
  for (const tool of tools) {
    const terms = new Set(
      (tool.triggers || []).map((t) => t.toLowerCase().trim()).filter(Boolean)
    );
    perToolTriggers.push(terms);
    for (const term of terms) df.set(term, (df.get(term) || 0) + 1);
  }

  // Step 2 + 3: 統計「中文詞 × 英文詞」跨語言共現次數（排除過於通用的詞）
  const pairCounts = new Map(); // `${zh}|||${en}` -> count

  for (const terms of perToolTriggers) {
    const zhTerms = [];
    const enTerms = [];
    for (const term of terms) {
      if ((df.get(term) || 0) > EXCLUDE_DF_THRESHOLD) continue;
      if (isChinese(term)) zhTerms.push(term);
      else enTerms.push(term);
    }
    for (const zh of zhTerms) {
      for (const en of enTerms) {
        const key = `${zh}|||${en}`;
        pairCounts.set(key, (pairCounts.get(key) || 0) + 1);
      }
    }
  }

  const links = new Map(); // term -> Set<term>
  const addLink = (a, b) => {
    if (!links.has(a)) links.set(a, new Set());
    links.get(a).add(b);
  };

  let keptPairs = 0;
  for (const [key, count] of pairCounts) {
    if (count < MIN_PAIR_COOCCURRENCE) continue;
    const [zh, en] = key.split('|||');
    addLink(zh, en);
    addLink(en, zh);
    keptPairs++;
  }

  // Step 4: 共享同一個錨點詞的詞彙群組，彼此也建立連結
  // （例如「簡報」「投影片」都連到 presentation，因此兩者也互相連結）
  const cliqueSource = new Map(links); // 用挖掘階段結束時的快照做展開，避免無限擴散
  for (const [, neighbors] of cliqueSource) {
    const group = [...neighbors];
    if (group.length < 2 || group.length > 8) continue; // 太大的群組通常代表錨點詞不夠具體，跳過
    for (let i = 0; i < group.length; i++) {
      for (let j = 0; j < group.length; j++) {
        if (i === j) continue;
        addLink(group[i], group[j]);
      }
    }
  }

  // Step 5: 與種子詞典取聯集合併
  for (const [term, syns] of Object.entries(SEED_SYNONYMS)) {
    for (const s of syns) addLink(term, s);
  }

  // Step 6: 別名種子——把通用短詞併入既有挖掘出的群組（見 ALIAS_SEEDS 註解）
  for (const [alias, target] of Object.entries(ALIAS_SEEDS)) {
    const targetNeighbors = links.get(target);
    if (!targetNeighbors) continue; // 目標群組這次沒挖到東西，略過
    // alias 加入 target 的整個群組（含 target 本身），並反向把 alias
    // 也加進群組內每個成員的清單
    addLink(alias, target);
    for (const member of targetNeighbors) {
      addLink(alias, member);
      addLink(member, alias);
    }
    addLink(target, alias);
  }

  // 轉成一般物件，每個詞的同義詞數量設上限
  const map = {};
  for (const [term, set] of links) {
    map[term] = [...set].slice(0, MAX_MINED_SYNONYMS_PER_TERM);
  }

  return {
    map,
    stats: {
      totalTerms: Object.keys(map).length,
      candidatePairs: pairCounts.size,
      keptPairs,
      seedTerms: Object.keys(SEED_SYNONYMS).length,
    },
  };
}

function toGeneratedSource(map) {
  const header = `/**
 * ⚠️ 此檔案由 scripts/mine-synonyms.js 自動產生，請勿手動編輯。
 * 若要調整挖掘邏輯或種子詞典，請修改 scripts/mine-synonyms.js 後重新執行：
 *   node scripts/mine-synonyms.js
 *
 * 產生時間：${new Date().toISOString()}
 */
`;
  return `${header}export const SYNONYM_MAP = ${JSON.stringify(map, null, 2)};\n`;
}

// CLI 入口：直接執行此檔案時才會寫檔，被其他模組 import mineSynonyms 時不會
if (import.meta.url === `file://${process.argv[1]}`) {
  const registryPath = path.join(rootDir, 'registry', 'tools.json');
  const registry = JSON.parse(fs.readFileSync(registryPath, 'utf-8'));
  const { map, stats } = mineSynonyms(registry.tools);

  const outPath = path.join(rootDir, 'core', 'synonyms.generated.js');
  fs.writeFileSync(outPath, toGeneratedSource(map), 'utf-8');

  console.log('同義詞詞典挖掘完成：');
  console.log(`  候選中英文配對數：${stats.candidatePairs}`);
  console.log(`  通過共現門檻（≥${MIN_PAIR_COOCCURRENCE} 個工具）：${stats.keptPairs}`);
  console.log(`  種子詞典條目數：${stats.seedTerms}`);
  console.log(`  最終詞典詞彙數：${stats.totalTerms}`);
  console.log(`  已寫入：${path.relative(rootDir, outPath)}`);
}
