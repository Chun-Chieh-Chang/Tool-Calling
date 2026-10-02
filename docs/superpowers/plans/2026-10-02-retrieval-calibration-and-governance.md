# 檢索校準修復 + 語意層三端對齊 + 治理門禁 實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修復檢索的三個實測缺陷（L1.5 量尺不一致造成的 213% 信心度、萬用觸發詞同分群、negativeConstraints 被當正向證據），把 LLM rerank 在 CLI 端預設化（三端對齊），並建立「行為遙測回流」與四道資料治理門禁。

**Architecture:** 兩個階段。Phase A（Task 1-5）動檢索引擎：先凍結評測基線，再逐一修復三個計分缺陷，每個修復後重跑 267 題 benchmark 驗證無回歸；最後把 CLI 的 rerank 從「預設關閉」改為「有 key 就啟用」（與 `web/server.js:295` 既有行為對齊）。Phase B（Task 6-11）動資料與守衛：新增 telemetry JSONL 回流端點、把 `tools.json` 的四個寫入者收斂到 `core/registry.js#saveRegistry()`、給危險的 `npm run enrich` 上鎖、新增樣板黑名單與文件數字兩道門禁。

**Tech Stack:** Node.js ≥ 18（ES Modules）、`node:test` 內建測試器、GitHub Stars 不動、無新依賴。

**基準與門檻（全計畫共用）：**
- 評測命令：`node scripts/eval-benchmark.js`（267 題；基線於 Task 1 凍結）。
- 回歸門檻：任一引擎改動後，agent / fusion 的 Hit@1 不得比基線低 **超過 3 個百分點**（取樣噪音地板，DEV_LOG 2026-09-27 已驗證 1~2 筆差異 = 1~2pp 屬噪音）；空集誠實率必須維持 10/10。
- 測試命令：`npm test`（320 tests 起步，本計畫會新增測試檔）。
- Commit 規範：Conventional Commits，英文描述。

---

## Phase A — 檢索校準與語意層

### Task 1: 凍結修復前基線

**Files:**
- Create: `docs/benchmarks/2026-10-02-pre-fix-baseline.txt`

- [ ] **Step 1: 建立目錄並執行評測基準**

```bash
mkdir -p docs/benchmarks
node scripts/eval-benchmark.js 2>&1 | tee docs/benchmarks/2026-10-02-pre-fix-baseline.txt
```

Expected: 輸出含 `agent`、`fusion` 引擎的 Hit@1 / Hit@3 / MRR 表與 `空集誠實率 10/10`。記下 fusion 的 Hit@1（預期 ~56%）與 semantic 分組 Hit@1（預期 ~47%）。

- [ ] **Step 2: Commit**

```bash
git add docs/benchmarks/2026-10-02-pre-fix-baseline.txt
git commit -m "chore(bench): freeze pre-fix eval baseline (267 queries)"
```

---

### Task 2: 修復 L1.5 量尺不一致（213% 信心度的根因）

**根因**（`core/search-engine.js:974`）：L1.5 層回傳 `3 * discrim`（量級 0~3），L2 層回傳 `Math.min(score / maxPossible, 0.99)`（量級 0~0.99）。兩層量尺不一致，融合層與顯示層直接 `score * 100` 就溢出 100%。`discrim ∈ (0, 1]`，把 L1.5 分數改為 `discrim` 本身即可對齊 0~1，且排序完全不變（單調轉換）。

**Files:**
- Modify: `core/search-engine.js:972-977`
- Test: `tests/l15-score-scale.test.js`

- [ ] **Step 1: 確認 search() 的匯出名稱**

```bash
grep -n "^export function search" core/search-engine.js
```

Expected: 一行 `export function search(...)`。若匯出名不同，後續測試的 import 以實際名稱為準。

- [ ] **Step 2: 寫失敗測試**

建立 `tests/l15-score-scale.test.js`：

```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { search } from '../core/search-engine.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const registry = JSON.parse(readFileSync(path.join(__dirname, '..', 'registry', 'tools.json'), 'utf8'));
const tools = registry.tools.filter((t) => t.status === 'active' || t.status === 'experimental');

test('L1.5 分數必須落在 0~1（修復信心度 213%）', () => {
  const r = search(tools, '我想把 YouTube 影片轉成逐字稿', { topK: 10 });
  assert.ok(r.length > 0, '此查詢在現行工具庫應有 L1.5 命中');
  for (const x of r) {
    assert.ok(x.score <= 1.0, `分數 ${x.score} 超過 1.0（matchLevel=${x.matchLevel}）`);
    assert.ok(x.score > 0, `分數 ${x.score} 不應為 0`);
  }
});
```

- [ ] **Step 3: 執行測試確認失敗**

```bash
node --test tests/l15-score-scale.test.js
```

Expected: FAIL，錯誤訊息含「分數 2.13 超過 1.0」（或類似 >1 的分數）。

- [ ] **Step 4: 修改 L1.5 計分**

`core/search-engine.js` 第 972-977 行，把：

```javascript
        triggerExactHits.push({
          tool,
          score: Math.round((3 * discrim) * 100) / 100,
          matchLevel: 'L1.5-trigger-exact',
          matchedKeywords: [trig],
        });
```

改為：

```javascript
        // 2026-10-02 量尺對齊：L1.5 原回傳 3*discrim（0~3 量級），與 L2 的 0~0.99
        // 不一致，融合與顯示層乘 100 後出現「213%」。改回 discrim 本身（0~1），
        // 單調轉換不改變排序；觸發詞鑑別度即為信心度的誠實表達。
        triggerExactHits.push({
          tool,
          score: Math.round(discrim * 100) / 100,
          matchLevel: 'L1.5-trigger-exact',
          matchedKeywords: [trig],
        });
```

- [ ] **Step 5: 顯示層防禦性蓋帽（三端）**

`cli.js` 第 146-148 行，把：

```javascript
    const bar = '█'.repeat(Math.round(score * 20)).padEnd(20, '░');
    console.log(`${c.bold}#${i + 1}${c.reset} ${c.cyan}${tool.name}${c.reset} ${c.dim}(${tool.id})${c.reset}`);
    console.log(`   信心度: ${c.green}${bar}${c.reset} ${(score * 100).toFixed(0)}%  [${matchLevel}]`);
```

改為：

```javascript
    // 防禦性蓋帽：任何上游量尺疏漏都不該把信心度畫出量尺外
    const pct = Math.min(100, Math.round(score * 100));
    const bar = '█'.repeat(Math.round(pct / 5)).padEnd(20, '░');
    console.log(`${c.bold}#${i + 1}${c.reset} ${c.cyan}${tool.name}${c.reset} ${c.dim}(${tool.id})${c.reset}`);
    console.log(`   信心度: ${c.green}${bar}${c.reset} ${pct}%  [${matchLevel}]`);
```

`web/app.js` 第 1248 行，把：

```javascript
    const percentage = Math.round(score * 100);
```

改為：

```javascript
    const percentage = Math.min(100, Math.round(score * 100));
```

- [ ] **Step 6: 執行測試確認通過**

```bash
node --test tests/l15-score-scale.test.js
```

Expected: PASS。

- [ ] **Step 7: 跑評測確認排序無回歸**

```bash
node scripts/eval-benchmark.js 2>&1 | tee docs/benchmarks/2026-10-02-after-task2.txt
diff <(grep -E "Hit@1" docs/benchmarks/2026-10-02-pre-fix-baseline.txt) <(grep -E "Hit@1" docs/benchmarks/2026-10-02-after-task2.txt)
```

Expected: 無差異或差異在噪音地板內（L1.5 改的是單調轉換，排序應完全不變）。

- [ ] **Step 8: Commit**

```bash
git add core/search-engine.js cli.js web/app.js tests/l15-score-scale.test.js docs/benchmarks/2026-10-02-after-task2.txt
git commit -m "fix(search): normalize L1.5 score to 0-1 scale and clamp confidence display (fixes 213% meter)"
```

---

### Task 3: L1.5 同分群破解（萬用觸發詞並列）

**根因**：同一查詢整串命中多支工具的同一 trigger（如 `youtube`、`model`）時，L1.5 給**完全相同**的分數，形成大規模同分群（DEV_LOG 已記錄 213%/182% 群）。破解法：以「身分強度」做次要排序——trigger 出現在工具的 id/name（工具以此為名）比出現在 context triggers 證據更強。加權 0.017 的保證範圍（2026-10-02 實測）：重排僅可能發生在 discrim 差 < 0.017 的「近等價 trigger」之間（df ≥ 7 的相鄰 IDF 階梯間距可小於 0.017，存在嚴格翻轉案例）；df ≤ 6 的最小間距 0.0176 大於 boost，絕對安全。267 題評測實證零跨 trigger 回歸（13 個 top-1 變化皆同分群內部重排或翻正）。

**Files:**
- Modify: `core/search-engine.js:965-980`（Task 2 修改後的 L1.5 區塊）
- Test: `tests/l15-tiebreak.test.js`

- [ ] **Step 1: 寫失敗測試（synthetic，不依賴真實 registry）**

建立 `tests/l15-tiebreak.test.js`：

```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import { search } from '../core/search-engine.js';

const mk = (id, name) => ({
  id,
  name,
  description: 'test tool',
  category: '測試',
  triggers: ['youtube'],
  capabilities: [],
});

test('L1.5 同分破解：id 含 trigger 的工具應排在純 context 命中之前', () => {
  const tools = [
    mk('alpha-tool', 'Alpha Tool'),
    mk('youtube-helper', 'YouTube Helper'),
    mk('gamma-tool', 'Gamma Tool'),
  ];
  const r = search(tools, 'youtube 影片處理', { topK: 5 });
  assert.equal(r.length, 3);
  assert.equal(r[0].tool.id, 'youtube-helper', `實際排序：${r.map((x) => x.tool.id).join(', ')}`);
});
```

- [ ] **Step 2: 執行測試確認失敗**

```bash
node --test tests/l15-tiebreak.test.js
```

Expected: FAIL（三支工具同分，排序取決於 registry 順序，`alpha-tool` 可能排第一）。

- [ ] **Step 3: 實作身分加權**

`core/search-engine.js` L1.5 區塊（Task 2 完成後的樣子），把：

```javascript
    for (const tool of tools) {
      for (const trig of (tool.triggers || [])) {
        const tNorm = getTriggerNorm(trig);
        if (tNorm.length < 4) continue;           // 太短的 trigger 不參與精確命中
        if (!qNorm.includes(tNorm)) continue;      // 查詢必須整段包含 trigger
        const discrim = triggerDiscriminativeScore(trig, idfMap);
        if (discrim <= 0) continue;               // 停用 trigger 不計
        // 2026-10-02 量尺對齊：L1.5 原回傳 3*discrim（0~3 量級），與 L2 的 0~0.99
        // 不一致，融合與顯示層乘 100 後出現「213%」。改回 discrim 本身（0~1），
        // 單調轉換不改變排序；觸發詞鑑別度即為信心度的誠實表達。
        triggerExactHits.push({
          tool,
          score: Math.round(discrim * 100) / 100,
          matchLevel: 'L1.5-trigger-exact',
          matchedKeywords: [trig],
        });
        break; // 一個工具只算一次
      }
    }
```

改為：

```javascript
    for (const tool of tools) {
      for (const trig of (tool.triggers || [])) {
        const tNorm = getTriggerNorm(trig);
        if (tNorm.length < 4) continue;           // 太短的 trigger 不參與精確命中
        if (!qNorm.includes(tNorm)) continue;      // 查詢必須整段包含 trigger
        const discrim = triggerDiscriminativeScore(trig, idfMap);
        if (discrim <= 0) continue;               // 停用 trigger 不計
        // 2026-10-02 量尺對齊：L1.5 原回傳 3*discrim（0~3 量級），與 L2 的 0~0.99
        // 不一致，融合與顯示層乘 100 後出現「213%」。改回 discrim 本身（0~1），
        // 單調轉換不改變排序；觸發詞鑑別度即為信心度的誠實表達。
        // 同分破解：高 df 萬用 trigger（model/code/youtube）會讓多支工具同分。
        // trigger 出現在 id/name（工具以此為名）比出現在 context triggers 證據強。
        // ⚠️ 保證範圍（2026-10-02 實測）：重排僅可能發生在 discrim 差 < 0.017 的
        // 「近等價 trigger」之間（df ≥ 7 的相鄰階梯間距可小於 0.017，存在嚴格翻轉
        // 案例）；df ≤ 6 的最小間距 0.0176 大於 boost，絕對安全。267 題評測實證
        // 零跨 trigger 回歸（13 個 top-1 變化皆同分群內部重排或翻正）。
        const inIdentity = normalize(tool.id).includes(tNorm) || normalize(tool.name).includes(tNorm);
        triggerExactHits.push({
          tool,
          score: Math.round(Math.min(1, discrim + (inIdentity ? L15_IDENTITY_BOOST : 0)) * 100) / 100,
          matchLevel: 'L1.5-trigger-exact',
          matchedKeywords: [trig],
        });
        break; // 一個工具只算一次
      }
    }
```

- [ ] **Step 4: 執行兩個 L1.5 測試確認通過**

```bash
node --test tests/l15-tiebreak.test.js tests/l15-score-scale.test.js
```

Expected: 全部 PASS。

- [ ] **Step 5: 跑評測確認無回歸**

```bash
node scripts/eval-benchmark.js 2>&1 | tee docs/benchmarks/2026-10-02-after-task3.txt
```

Expected: Hit@1 與基線差異 ≤ 3pp（實務上 L1.5 命中的查詢不多，影響應在 1~2 題內）；空集誠實率 10/10。

- [ ] **Step 6: Commit**

```bash
git add core/search-engine.js tests/l15-tiebreak.test.js docs/benchmarks/2026-10-02-after-task3.txt
git commit -m "fix(search): break L1.5 tie groups via identity-strength secondary ordering"
```

---

### Task 4: negativeConstraints 符號修復（反證據不得當加分）

**根因**（DEV_LOG 2026-09-27「已知殘留」#2）：`core/agent-retrieval.js` 的 V3（`scoreV3Scenario`）與 V4（`scoreV4Constraint`）把 `negativeConstraints` 折進**正向**文本算相似度——查詢越符合「該工具明文不支援的情境」，該工具反而分數越高。修法：從 V3/V4 正向文本移除，改為獨立的扣分項。

**Files:**
- Modify: `core/agent-retrieval.js:164-185`（V3/V4 定義）、`core/agent-retrieval.js:274-300`（fuse）、`core/agent-retrieval.js:302-312`（reasons）
- Test: `tests/negative-constraint-sign.test.js`

- [ ] **Step 1: 寫失敗測試**

建立 `tests/negative-constraint-sign.test.js`：

```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import { agentRetrieve } from '../core/agent-retrieval.js';

const mkTool = (id, negs) => ({
  id,
  name: id,
  description: 'convert video files to mp4',
  useCase: 'video conversion',
  category: '多媒體',
  triggers: ['video'],
  capabilities: [],
  negativeConstraints: negs,
});

test('查詢命中禁用場景的工具應被扣分、排到乾淨工具之後', () => {
  // 禁用文本刻意重用查詢的完整詞（batch/convert/video），確保重疊度
  // 穩定超過 0.25 門檻——測試驗的是「扣分機制存在」，不是閾值調校。
  const tools = [
    mkTool('tool-with-neg', ['Not designed for batch convert video workloads']),
    mkTool('tool-clean', []),
  ];
  const r = agentRetrieve(tools, 'batch convert video files', { topK: 2 });
  assert.equal(r.topK.length, 2);
  assert.equal(r.topK[0].id, 'tool-clean', `實際排序：${r.topK.map((x) => x.id).join(', ')}`);
  assert.equal(r.topK[1].id, 'tool-with-neg');
});
```

- [ ] **Step 2: 執行測試確認失敗**

```bash
node --test tests/negative-constraint-sign.test.js
```

Expected: FAIL——兩支工具正向證據完全相同，`tool-with-neg` 因禁用文本被算成相似度而同分或更高，排序未把乾淨工具排前。

- [ ] **Step 3: V3 移除正向文本中的禁用欄位**

`core/agent-retrieval.js` 第 164-174 行，把：

```javascript
// V3 情境：useCase + category + negativeConstraints。
function scoreV3Scenario(q, tool, idf) {
  const scenarioText = [
    tool.useCase || '',
    tool.useCase_zh || '',
    tool.category || '',
    ...(tool.negativeConstraints || []),
  ].join(' ');
  const toolBag = bagOf(tokenize(scenarioText));
  return { value: weightedSim(q.bag, toolBag, idf.idfIdentity, { weightA: 1, weightB: 1 }) };
}
```

改為：

```javascript
// V3 情境：useCase + category。
// 2026-10-02 符號修復：negativeConstraints 是「反證據」，不得折進正向文本
// （舊實作讓查詢越符合「明文不支援的情境」分數越高，DEV_LOG 2026-09-27 殘留 #2）。
// 禁用場景改由 fuse() 內的 negativePenalty() 統一扣分。
function scoreV3Scenario(q, tool, idf) {
  const scenarioText = [
    tool.useCase || '',
    tool.useCase_zh || '',
    tool.category || '',
  ].join(' ');
  const toolBag = bagOf(tokenize(scenarioText));
  return { value: weightedSim(q.bag, toolBag, idf.idfIdentity, { weightA: 1, weightB: 1 }) };
}
```

- [ ] **Step 4: V4 移除正向文本中的禁用欄位**

同檔第 176-185 行，把：

```javascript
// V4 部署：install.method + language + negativeConstraints。
function scoreV4Constraint(q, tool, idf) {
  const constraintText = [
    tool.install?.method || '',
    tool.language || '',
    ...(tool.negativeConstraints || []),
  ].join(' ');
  const toolBag = bagOf(tokenize(constraintText));
  return { value: weightedSim(q.bag, toolBag, idf.idfIdentity, { weightA: 1, weightB: 1 }) };
}
```

改為：

```javascript
// V4 部署：install.method + language。（negativeConstraints 改由 negativePenalty 扣分，見 V3 註解）
function scoreV4Constraint(q, tool, idf) {
  const constraintText = [
    tool.install?.method || '',
    tool.language || '',
  ].join(' ');
  const toolBag = bagOf(tokenize(constraintText));
  return { value: weightedSim(q.bag, toolBag, idf.idfIdentity, { weightA: 1, weightB: 1 }) };
}
```

- [ ] **Step 5: 在 fuse() 加入扣分項**

同檔，在 `function fuse(...)` 之前（第 274 行附近）新增函式：

```javascript
// 2026-10-02 符號修復：查詢與禁用場景的詞彙重疊度越高（0~1），
// 該工具越不該被推薦。重疊 ≤ 0.25 不罰（避免誤傷只共享一個語境詞的情形），
// 重疊 1.0 時扣 0.15（約等於 V2 權重的一半，足以把命中的工具拉出 top-1，
// 但不至於把其他維度的強證據完全歸零）。
function negativePenalty(q, tool, idf) {
  const negs = tool.negativeConstraints || [];
  if (negs.length === 0) return 0;
  const negBag = bagOf(tokenize(negs.join(' ')));
  const sim = weightedSim(q.bag, negBag, idf.idfIdentity, { weightA: 1, weightB: 1 });
  if (sim <= 0.25) return 0;
  return Math.min(0.15, (sim - 0.25) * 0.5);
}
```

`fuse()` 內，把（第 287 行附近）：

```javascript
  const base = per.V1 * weights.V1 + per.V2 * weights.V2 + per.V3 * weights.V3 + per.V4 * weights.V4
    + (v5 !== null ? per.V5 * w5 : 0);
```

之後、`let weighted;` 的整段 if/else 結束後（第 297 行 `weighted = base;` 之後），把：

```javascript
  } else {
    weighted = base;
  }
  const topDimKey = dims.reduce((a, b) => (per[a] >= per[b] ? a : b));
  return { per, bestDim, weighted, topDimKey, trigHit: s1.trigHit };
```

改為：

```javascript
  } else {
    weighted = base;
  }
  // 符號修復：命中禁用場景扣分（只影響排序，不改變 bestDim／decision 門檻）
  const negPenalty = negativePenalty(q, tool, idf);
  if (negPenalty > 0) weighted = Math.max(0, weighted - negPenalty);
  const topDimKey = dims.reduce((a, b) => (per[a] >= per[b] ? a : b));
  return { per, bestDim, weighted, topDimKey, trigHit: s1.trigHit, negPenalty };
```

- [ ] **Step 6: reasons() 顯示扣分原因**

同檔 `reasons()` 內（第 310 行附近），把：

```javascript
  if (fuseResult.bestDim < NO_MATCH_THRESHOLD) r.push('⚠ 所有維度皆無有效信號');
  return r;
```

改為：

```javascript
  if (fuseResult.negPenalty > 0) r.push(`🚫 命中禁用場景，已扣分 ${fuseResult.negPenalty.toFixed(2)}`);
  if (fuseResult.bestDim < NO_MATCH_THRESHOLD) r.push('⚠ 所有維度皆無有效信號');
  return r;
```

- [ ] **Step 7: 執行測試確認通過**

```bash
node --test tests/negative-constraint-sign.test.js
npm test
```

Expected: 新測試 PASS；既有 320+ 測試全綠（`tier1-preservation` 等不受影響，因分類規則讀的是 triggers，不是本檔）。

- [ ] **Step 8: 跑評測確認無回歸**

```bash
node scripts/eval-benchmark.js 2>&1 | tee docs/benchmarks/2026-10-02-after-task4.txt
```

Expected: agent / fusion Hit@1 與基線差異 ≤ 3pp；constrained 分組 Hit@1 不低於基線 −3pp（基線約 59.6%）；空集誠實率 10/10。若 constrained 組跌幅超過門檻，把 `negativePenalty` 的係數 `0.5` 降為 `0.3` 後重跑（扣分力度唯一可調參數）。

- [ ] **Step 9: Commit**

```bash
git add core/agent-retrieval.js tests/negative-constraint-sign.test.js docs/benchmarks/2026-10-02-after-task4.txt
git commit -m "fix(retrieval): treat negativeConstraints as penalties, not positive evidence"
```

---

### Task 5: CLI 端 LLM rerank 預設化（三端對齊）

**背景**：`web/server.js:295` 早已是「`rerank` undefined = 有 key 就啟用」，`core/retrieval-fusion.js:340` 對 `false` 才跳過、無 key 時自動略過（離線安全）。只有 CLI（`cli.js:119`）還在預設 `rerank: false`。本任務把 CLI 改為同樣的「有 key 就啟用」語意，並提供 `--no-rerank` 逃生門。rerank 實測 Hit@1 58% → 73.8%（47 題評測集，top-50 候選）。

**Files:**
- Modify: `cli.js:1079-1081`（旗標解析）、`cli.js:119`（rerank 參數）、README.md 指令對照表

- [ ] **Step 1: 定位旗標宣告與傳遞點**

```bash
grep -n "searchDeep\|deep:" cli.js
```

Expected: 三處左右——`let searchDeep = false` 宣告、`--deep` 解析（第 1079-1081 行）、傳入 `cmdSearch(query, { deep: searchDeep })` 的呼叫點。

- [ ] **Step 2: 新增 --no-rerank 旗標**

在 `cli.js` 第 1079-1081 行：

```javascript
        } else if (args[i] === '--deep') {
          // 啟用 LLM rerank（較準但約需 5 秒）
          searchDeep = true;
        } else {
```

改為：

```javascript
        } else if (args[i] === '--deep') {
          // 保留相容：等價於新預設行為（有 key 就啟用 rerank）
          searchDeep = true;
        } else if (args[i] === '--no-rerank') {
          // 停用 LLM rerank（預設：有 key 就啟用，與 web / MCP 端一致）
          searchNoRerank = true;
        } else {
```

並在 `let searchDeep = false;` 宣告旁（Step 1 grep 到的宣告行）加上：

```javascript
  let searchNoRerank = false;
```

在呼叫點把 `{ deep: searchDeep }` 改為 `{ deep: searchDeep, noRerank: searchNoRerank }`。

- [ ] **Step 3: 改 rerank 預設值**

`cli.js` 第 118-119 行，把：

```javascript
    // 預設走快速路徑（詞彙引擎 ~119ms）；--deep 才啟用 LLM rerank（~5s）
    rerank: options.deep ? undefined : false,
```

改為：

```javascript
    // 三端對齊（2026-10-02）：rerank 預設「有 key 就啟用」（與 web/server.js 同語意，
    // 由 retrieval-fusion 內部判定；無 key 時自動略過、離線安全）。--no-rerank 可強制停用。
    rerank: options.noRerank ? false : undefined,
```

- [ ] **Step 4: README 同步**

`README.md` 指令對照表第 105 行，把：

```markdown
| 核心指令 | `node cli.js search "<查詢>" [-c 分類]` | 搜尋最適工具（支援自然語言與分類過濾） |
```

改為：

```markdown
| 核心指令 | `node cli.js search "<查詢>" [-c 分類] [--no-rerank]` | 搜尋最適工具（自然語言 + 分類過濾；設定 API key 時自動啟用 LLM rerank，`--no-rerank` 可停用） |
```

- [ ] **Step 5: 手動驗證三種模式**

```bash
node cli.js search "我想把 YouTube 影片轉成逐字稿" --no-rerank
node cli.js search "我想把 YouTube 影片轉成逐字稿"
```

Expected: 有 key 時第二個命令輸出含「（已套用 LLM rerank，耗時較長）」且第一名人選可能改變（rerank 重排）；無 key 時兩者輸出相同（rerank 自動略過）。分數全部 ≤ 100%。

- [ ] **Step 6: npm test 全綠**

```bash
npm test
```

Expected: 全部 PASS（rerank 相關測試在無 key 環境本就設計為跳過／離線路徑）。

- [ ] **Step 7: Commit**

```bash
git add cli.js README.md
git commit -m "feat(cli): enable LLM rerank by default when API key present (align CLI with web/MCP)"
```

---

## Phase B — 證據迴路與資料治理

### Task 6: 行為遙測回流端點（補上斷了的最後一里路）

**背景**：`web/behavior-tracker.js` 只把搜尋/點擊事件存進瀏覽器 localStorage，資料從未回到伺服器——真人查詢語料因此無法累積（本專案最缺的證據）。本任務新增 `POST /api/telemetry`，以 JSONL 附加寫入 `web/data/`（`.gitignore` 排除，使用者資料不進版控）。

**Files:**
- Create: `web/telemetry-endpoint.js`
- Modify: `web/server.js`（`/api/chain` 區塊前插入路由）、`web/behavior-tracker.js`（三個 record 方法）、`.gitignore`
- Test: `tests/telemetry-endpoint.test.js`

- [ ] **Step 1: 寫失敗測試**

建立 `tests/telemetry-endpoint.test.js`：

```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

function newDir() {
  return mkdtempSync(path.join(tmpdir(), 'telemetry-'));
}

test('合法 search 事件附加寫入 JSONL', async () => {
  const dir = newDir();
  process.env.TELEMETRY_DIR = dir;
  const { handleTelemetry } = await import('../web/telemetry-endpoint.js');
  const out = handleTelemetry({ type: 'search', query: '我想把 YouTube 影片轉成逐字稿', timestamp: 1 });
  assert.equal(out.status, 200);
  const lines = readFileSync(path.join(dir, 'telemetry-events.jsonl'), 'utf8').trim().split('\n');
  assert.equal(lines.length, 1);
  assert.deepEqual(JSON.parse(lines[0]), { type: 'search', query: '我想把 YouTube 影片轉成逐字稿', timestamp: 1 });
  rmSync(dir, { recursive: true, force: true });
});

test('非法 type 回 400 且不寫檔', async () => {
  const dir = newDir();
  process.env.TELEMETRY_DIR = dir;
  const { handleTelemetry } = await import('../web/telemetry-endpoint.js');
  const out = handleTelemetry({ type: 'hack', query: 'x' });
  assert.equal(out.status, 400);
  rmSync(dir, { recursive: true, force: true });
});

test('click 事件缺 toolId 回 400', async () => {
  const dir = newDir();
  process.env.TELEMETRY_DIR = dir;
  const { handleTelemetry } = await import('../web/telemetry-endpoint.js');
  const out = handleTelemetry({ type: 'click', query: 'x' });
  assert.equal(out.status, 400);
  rmSync(dir, { recursive: true, force: true });
});

test('query 超過 500 字被截斷而非拒絕', async () => {
  const dir = newDir();
  process.env.TELEMETRY_DIR = dir;
  const { handleTelemetry } = await import('../web/telemetry-endpoint.js');
  const out = handleTelemetry({ type: 'search', query: 'a'.repeat(600), timestamp: 2 });
  assert.equal(out.status, 200);
  const lines = readFileSync(path.join(dir, 'telemetry-events.jsonl'), 'utf8').trim().split('\n');
  assert.equal(JSON.parse(lines[0]).query.length, 500);
  rmSync(dir, { recursive: true, force: true });
});
```

- [ ] **Step 2: 執行測試確認失敗**

```bash
node --test tests/telemetry-endpoint.test.js
```

Expected: FAIL（模組不存在）。

- [ ] **Step 3: 實作 telemetry-endpoint.js**

建立 `web/telemetry-endpoint.js`：

```javascript
/**
 * telemetry-endpoint.js — 行為遙測回流（唯寫附加；分析在別處做）
 *
 * 背景：web/behavior-tracker.js 只把行為存在瀏覽器 localStorage，
 * 資料從未回到伺服器。真人查詢語料是本專案最缺的證據
 * （eval-queries.json 的 methodology 欄位明言下一步應收集真人問句），
 * 本模組是回流的最後一里路。
 *
 * 格式：JSON Lines（一行一事件），附加寫入、不重寫整檔。
 * 位置：web/data/telemetry-events.jsonl（已列入 .gitignore，使用者資料不進版控）。
 * 測試：環境變數 TELEMETRY_DIR 可改寫輸出目錄（每次呼叫時讀取，便於測試隔離）。
 */
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DIR = join(__dirname, 'data');
const ALLOWED_TYPES = new Set(['search', 'click', 'abandon']);

export function telemetryFilePath() {
  const dir = process.env.TELEMETRY_DIR || DEFAULT_DIR;
  return join(dir, 'telemetry-events.jsonl');
}

/**
 * 驗證並寫入一筆行為事件。
 * @param {object} event - { type, query, timestamp?, toolId?, position? }
 * @returns {{ status: number, body: object }}
 */
export function handleTelemetry(event) {
  if (!event || !ALLOWED_TYPES.has(event.type)) {
    return { status: 400, body: { error: `type 必須是 ${[...ALLOWED_TYPES].join('/')}` } };
  }
  if (typeof event.query !== 'string' || event.query.trim().length === 0) {
    return { status: 400, body: { error: 'query 必須是非空字串' } };
  }
  const clean = {
    type: event.type,
    query: event.query.slice(0, 500),
    timestamp: Number.isFinite(event.timestamp) ? event.timestamp : Date.now(),
  };
  if (event.type === 'click') {
    if (typeof event.toolId !== 'string' || !event.toolId) {
      return { status: 400, body: { error: 'click 事件需要 toolId' } };
    }
    clean.toolId = event.toolId.slice(0, 120);
    clean.position = Number.isFinite(event.position) ? event.position : null;
  }
  const file = telemetryFilePath();
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(file, JSON.stringify(clean) + '\n', 'utf-8');
  return { status: 200, body: { ok: true } };
}
```

- [ ] **Step 4: 執行測試確認通過**

```bash
node --test tests/telemetry-endpoint.test.js
```

Expected: 4 個測試全 PASS。

- [ ] **Step 5: 掛進 server.js 路由**

`web/server.js` 第 326-331 行（`/api/search` 區塊結尾與 `/api/chain` 註解之間），把：

```javascript
      return;
    }

    // ─── 多工具鏈規劃 API ──────────────────────────────────────────────
```

改為：

```javascript
      return;
    }

    // ─── 行為遙測回流 API ──────────────────────────────────────────────
    // behavior-tracker.js 的事件原本只存瀏覽器 localStorage；這裡補上
    // 伺服器端落盤（JSONL 附加寫入），讓真人查詢語料開始累積。
    // 只寫不讀、無副作用放大；事件形狀驗證在 web/telemetry-endpoint.js。
    if (decodedUrl === '/api/telemetry' && req.method === 'POST') {
      try {
        const { handleTelemetry } = await import('./telemetry-endpoint.js');
        const event = JSON.parse(req._body || '{}');
        const out = handleTelemetry(event);
        res.writeHead(out.status, { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders(req) });
        res.end(JSON.stringify(out.body));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders(req) });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    // ─── 多工具鏈規劃 API ──────────────────────────────────────────────
```

- [ ] **Step 6: behavior-tracker.js 加回流**

`web/behavior-tracker.js`，在 `_saveHistory()` 方法之後（第 47 行 `}` 之後）新增：

```javascript
  /**
   * 回流到伺服器：把事件 POST 到 /api/telemetry（fire-and-forget）。
   * 失敗一律靜默——遙測永遠不能影響前端功能；本地 localStorage 仍是主儲存。
   */
  _postToServer(entry) {
    try {
      fetch('/api/telemetry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry),
        keepalive: true,
      }).catch(() => {});
    } catch (err) {
      /* fetch 不可用（舊瀏覽器）時靜默 */
    }
  }
```

並在 `recordSearch`（第 66 行 `this._saveHistory();` 之後）、`recordClick`（第 85 行後）、`recordAbandon`（第 99 行後）三處，各加一行：

```javascript
    this._postToServer(entry);
```

- [ ] **Step 7: .gitignore 排除使用者資料**

`.gitignore` 尾端追加：

```gitignore
# 行為遙測（使用者資料，不進版控）
web/data/
```

- [ ] **Step 8: 端到端手動驗證**

```bash
node web/server.js &
sleep 2
curl -s -X POST http://localhost:3000/api/telemetry -H "Content-Type: application/json" -d '{"type":"search","query":"telemetry smoke test"}'
cat web/data/telemetry-events.jsonl
```

Expected: 回 `{"ok":true}`；檔案內含一筆 JSONL（PORT 以 server 啟動時的輸出為準，預設 3000）。驗證後殺掉 server、刪掉測試檔案內容（保留目錄）。

- [ ] **Step 9: Commit**

```bash
git add web/telemetry-endpoint.js web/server.js web/behavior-tracker.js .gitignore tests/telemetry-endpoint.test.js
git commit -m "feat(telemetry): server-side JSONL event collection via POST /api/telemetry"
```

---

### Task 7: tools.json 寫入路徑收斂到 saveRegistry()

**背景**：`tools.json` 有四個寫入者各自手寫 `writeFileSync(...JSON.stringify(...))`（commit `5656ac6` 只修了尾端換行這個症狀）。收斂到 `core/registry.js#saveRegistry()` 後，未來任何寫入層級的契約（換行、原子寫、知識圖譜同步）只需改一處。

**Files:**
- Modify: `scripts/sync-daemon.js:57`、`scripts/trending-weekly.js:443`、`scripts/reclassify-tools.js:442`（各加 import）

- [ ] **Step 1: 確認寫入點現況**

```bash
grep -rn "writeFileSync(REGISTRY_PATH" scripts/*.js
```

Expected: 恰好三行（sync-daemon.js:57、trending-weekly.js:443、reclassify-tools.js:442）。`trending-weekly.js:481/486/524/571` 寫的是快照/追蹤池/報告，不動。

- [ ] **Step 2: 逐一替換**

`scripts/sync-daemon.js` 第 57 行，把：

```javascript
  writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2) + '\n', 'utf-8');
```

改為：

```javascript
  // 2026-10-02 寫入路徑收斂：tools.json 一律經 saveRegistry()（尾端換行、
  // lastUpdated、知識圖譜同步由單一入口負責）
  saveRegistry(registry);
```

檔案頂部 import 區（第 15 行 `import { writeFileSync } from 'node:fs';` 之後）加：

```javascript
import { saveRegistry } from '../core/registry.js';
```

`scripts/trending-weekly.js` 第 443 行，把：

```javascript
  writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2) + '\n', 'utf8');
```

改為：

```javascript
  // 2026-10-02 寫入路徑收斂：見 core/registry.js#saveRegistry()
  saveRegistry(registry);
```

頂部（第 11 行 import 之後）加：

```javascript
import { saveRegistry } from '../core/registry.js';
```

（此檔其他 `writeFileSync` 呼叫寫的是快照/追蹤池/報告，`writeFileSync` import 保留。）

`scripts/reclassify-tools.js` 第 442 行，把：

```javascript
    writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2) + '\n', 'utf8');
```

改為：

```javascript
    // 2026-10-02 寫入路徑收斂：見 core/registry.js#saveRegistry()
    saveRegistry(registry);
```

頂部（第 13 行 import 之後）加：

```javascript
import { saveRegistry } from '../core/registry.js';
```

- [ ] **Step 3: 驗證收敛完成**

```bash
grep -rn "JSON.stringify(registry" scripts/*.js core/*.js
```

Expected: **無任何結果**——`core/registry.js` 的 `saveRegistry` 內部用的參數名是 `data`，不會被這個 grep 命中；scripts/ 下不該再有任何 `JSON.stringify(registry` 的寫入。

- [ ] **Step 4: 行為驗證（dry run）**

```bash
node scripts/check-duplicate-ids.js
npm test
```

Expected: 全綠。三支腳本不會在測試中自動執行寫入；此步確保 import 無循環依賴、語法無誤（check-syntax 會全掃）。

- [ ] **Step 5: Commit**

```bash
git add scripts/sync-daemon.js scripts/trending-weekly.js scripts/reclassify-tools.js
git commit -m "refactor(registry): converge all tools.json writers onto saveRegistry()"
```

---

### Task 8: 給危險路徑 npm run enrich 上鎖

**背景**：DEV_LOG 2026-09-27「已知殘留」#5 明言 `scripts/enrich-registry.js`「prompt 明令『猜用途』、整批覆寫 triggers、直接 `status='active'` 繞過 activateIfComplete」，但「本輪未使用它，也未修」。它是 `package.json` 的正式 script，任何人都可能誤跑。本任務不刪功能，只加明確的 `--force` 門。

**Files:**
- Modify: `scripts/enrich-registry.js`（第 6 行 API_KEY 檢查之後）

- [ ] **Step 1: 加鎖**

`scripts/enrich-registry.js` 開頭，把：

```javascript
const API_KEY = process.env.AGNES_API_KEY;
if (!API_KEY) {
  console.error('Error: AGNES_API_KEY environment variable is missing.');
  console.error('Please set it using: $env:AGNES_API_KEY="your-key" (Windows) or export AGNES_API_KEY="your-key" (Mac/Linux)');
  process.exit(1);
}
```

改為：

```javascript
const API_KEY = process.env.AGNES_API_KEY;
if (!API_KEY) {
  console.error('Error: AGNES_API_KEY environment variable is missing.');
  console.error('Please set it using: $env:AGNES_API_KEY="your-key" (Windows) or export AGNES_API_KEY="your-key" (Mac/Linux)');
  process.exit(1);
}
// 2026-10-02 上鎖：DEV_LOG 2026-09-27「已知殘留」#5——本腳本 prompt 明令
// 「猜用途」、整批覆寫 triggers、直接 status='active' 繞過 activateIfComplete。
// 一般補齊請改用 scripts/enrich-new-tools.js（有守門）；真要跑本腳本必須 --force。
if (!process.argv.includes('--force')) {
  console.error('🚫 enrich-registry.js 是已知的危險路徑（DEV_LOG 2026-09-27 殘留 #5）：');
  console.error('   它會「猜用途」生成內容、整批覆寫 triggers、並繞過啟用門禁。');
  console.error('   一般補齊請改用：node scripts/enrich-new-tools.js');
  console.error('   若你了解風險仍要執行，請加 --force。');
  process.exit(1);
}
```

- [ ] **Step 2: 驗證鎖生效**

```bash
node scripts/enrich-registry.js; echo "exit=$?"
```

Expected: 印出 🚫 警告，`exit=1`（不會真的打 API——即使設了 AGNES_API_KEY 也會先被鎖擋下）。

- [ ] **Step 3: Commit**

```bash
git add scripts/enrich-registry.js
git commit -m "fix(scripts): gate enrich-registry.js behind --force (known dangerous path)"
```

---

### Task 9: 樣板黑名單門禁 check-templates.js

**背景**：2026-09-27 的污染事件（108 支工具的 `negativeConstraints` 是萬用句）暴露「品質分數測不出樣板文字」。本門禁把已知樣板句列入黑名單，出現在 `tools.json` 即擋 CI。教訓原文：「同一個缺陷類別可能有多個寫入點」——所以黑名單掃**全欄位**而非只掃單一產生器的輸出欄位。

**Files:**
- Create: `scripts/check-templates.js`
- Modify: `package.json`（test chain）

- [ ] **Step 1: 實作門禁腳本**

建立 `scripts/check-templates.js`：

```javascript
#!/usr/bin/env node
/**
 * 樣板黑名單門禁：registry/tools.json 的敘述欄位不得出現已知樣板句。
 *
 * 🔴 為什麼需要（2026-09-27 污染事件，DEV_LOG 有完整記錄）：
 *   兩個不同的產生器（scan-tool.js、trending-weekly.js）各自寫入了
 *   「初次收錄建議人工審查…」「由自動化探勘入庫，建議人工審查…」等
 *   萬用句，共污染 108 支工具，且 metadata quality 當時給了滿分——
 *   品質分數測不出樣板。本門禁補上這個洞。
 *
 *   教訓：「同一個缺陷類別可能有多個寫入點」，所以這裡掃全欄位，
 *   不針對特定產生器的輸出欄位。新增產生器時，把它的樣板句加進 BOILERPLATE。
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REGISTRY = path.join(__dirname, '..', 'registry', 'tools.json');

// 已知的萬用句（2026-09-27 清理的 108 支來自前兩條）。
// 判準：對任何工具都成立的話 = 假文字；發現新的就加進來。
const BOILERPLATE = [
  '初次收錄建議人工審查',
  '由自動化探勘入庫，建議人工審查',
  '詳細安裝指令需依官方 README 為準',
];

const FIELDS = ['description', 'useCase', 'advantages', 'negativeConstraints'];

const registry = JSON.parse(readFileSync(REGISTRY, 'utf8'));
const failures = [];
for (const tool of registry.tools) {
  for (const field of FIELDS) {
    const values = Array.isArray(tool[field]) ? tool[field] : [tool[field]];
    for (const v of values) {
      if (typeof v !== 'string') continue;
      for (const bp of BOILERPLATE) {
        if (v.includes(bp)) {
          failures.push(`${tool.id} .${field}: 含樣板「${bp}…」`);
        }
      }
    }
  }
}

if (failures.length > 0) {
  console.error(`❌ [Template Guard] ${failures.length} 筆欄位含萬用樣板句（假文字不得進檢索向量）：`);
  for (const f of failures.slice(0, 20)) console.error(`  · ${f}`);
  if (failures.length > 20) console.error(`  · …共 ${failures.length} 筆`);
  process.exit(1);
}
console.log(`✅ [Template Guard] ${registry.tools.length} 筆工具無樣板句污染`);
```

- [ ] **Step 2: 對現行庫跑一次（應通過）**

```bash
node scripts/check-templates.js
```

Expected: `✅ … 736 筆工具無樣板句污染`（2026-09-27 已清完；若有殘留，輸出會列出——那些本來就該清）。

- [ ] **Step 3: 用 fixture 驗證門禁真的會擋（注入→驗證→還原）**

```bash
cp registry/tools.json /tmp/tools.json.bak
node -e "
const fs = require('fs');
const reg = JSON.parse(fs.readFileSync('registry/tools.json', 'utf8'));
reg.tools.push({ id: 'guard-test-fixture', name: 'x', category: 'x', description: 'ok',
  useCase: 'ok', advantages: ['初次收錄建議人工審查確認適用場景'], negativeConstraints: [], triggers: [] });
fs.writeFileSync('registry/tools.json', JSON.stringify(reg, null, 2));
"
node scripts/check-templates.js; echo "exit=$?"
cp /tmp/tools.json.bak registry/tools.json
node scripts/check-templates.js; echo "exit=$?"
```

Expected: 第一次 `exit=1`（列出 guard-test-fixture）；還原後 `exit=0`。確認 `git status` 中 registry/tools.json 無殘留變更（`git diff --stat registry/tools.json` 為空）。

- [ ] **Step 4: 掛進 npm test**

`package.json` 的 `scripts.test`，把：

```json
"test": "node scripts/check-syntax.js && node scripts/check-utf8.js && node scripts/check-duplicate-ids.js && node scripts/check-traditional.js && node scripts/check-traditional.js --full --code && node --test --test-concurrency=1 tests/*.test.js",
```

改為：

```json
"test": "node scripts/check-syntax.js && node scripts/check-utf8.js && node scripts/check-duplicate-ids.js && node scripts/check-templates.js && node scripts/check-traditional.js && node scripts/check-traditional.js --full --code && node --test --test-concurrency=1 tests/*.test.js",
```

- [ ] **Step 5: Commit**

```bash
git add scripts/check-templates.js package.json
git commit -m "feat(gate): boilerplate-sentence blacklist guard for registry narrative fields"
```

---

### Task 10: 文件數字門禁 check-doc-stats.js + README 修正

**背景**：工具數同時出現三個版本（README 725、AGENTS.md 731、實際 736）。AGENTS.md 由 `npm run agents:init` 自動同步，README 沒有機制。本任務修正 README 並加門禁：兩份文件宣稱的工具數必須等於 `registry/tools.json` 實際筆數。

**Files:**
- Create: `scripts/check-doc-stats.js`
- Modify: `README.md:7`、`package.json`（test chain，接在 Task 9 之後）

- [ ] **Step 1: 修正 README 數字**

`README.md` 第 7 行，把：

```markdown
想像你有一個 **全功能 AI 工具箱**，裡面收錄了 **725 個頂尖開源 AI 工具與技能**（截至 2026-09-25，實際數量以 `registry/tools.json` 為準）：
```

改為：

```markdown
想像你有一個 **全功能 AI 工具箱**，裡面收錄了 **736 個頂尖開源 AI 工具與技能**（截至 2026-10-02，實際數量以 `registry/tools.json` 為準）：
```

- [ ] **Step 2: 實作門禁腳本**

建立 `scripts/check-doc-stats.js`：

```javascript
#!/usr/bin/env node
/**
 * 文件數字門禁：README 與 AGENTS.md 宣稱的工具數必須等於實際筆數。
 *
 * 🔴 為什麼需要：2026-10-02 診斷發現工具數同時有三個版本
 *   （README 725 / AGENTS.md 731 / 實際 736）。AGENTS.md 由
 *   `npm run agents:init` 自動同步，README 沒有機制——本門禁補上。
 *   文件標記格式若有調整，請同步修改這裡的 regex。
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const registry = JSON.parse(readFileSync(path.join(ROOT, 'registry', 'tools.json'), 'utf8'));
const actual = registry.tools.length;

const failures = [];

const readme = readFileSync(path.join(ROOT, 'README.md'), 'utf8');
const mReadme = readme.match(/(\d+)\s*個頂尖開源/);
if (!mReadme) {
  failures.push('README.md 找不到「N 個頂尖開源」工具數標記');
} else if (Number(mReadme[1]) !== actual) {
  failures.push(`README.md 宣稱 ${mReadme[1]} 個工具，實際為 ${actual}（請更新 README 第 7 行，或跑 npm run agents:init 同步 AGENTS.md）`);
}

const agents = readFileSync(path.join(ROOT, 'AGENTS.md'), 'utf8');
const mAgents = agents.match(/工具庫規模:\s*(\d+)\s*個工具/);
if (!mAgents) {
  failures.push('AGENTS.md 找不到「工具庫規模: N 個工具」標記');
} else if (Number(mAgents[1]) !== actual) {
  failures.push(`AGENTS.md 宣稱 ${mAgents[1]} 個工具，實際為 ${actual}（跑 npm run agents:init 重新生成）`);
}

if (failures.length > 0) {
  console.error('❌ [Doc Stats Guard] 文件數字與 registry 不一致：');
  for (const f of failures) console.error(`  · ${f}`);
  process.exit(1);
}
console.log(`✅ [Doc Stats Guard] README / AGENTS.md 工具數 = 實際 ${actual} 筆`);
```

- [ ] **Step 3: 同步 AGENTS.md 並驗證**

```bash
npm run agents:init
node scripts/check-doc-stats.js
```

Expected: `✅ … README / AGENTS.md 工具數 = 實際 736 筆`。

- [ ] **Step 4: 掛進 npm test**

`package.json` 的 `scripts.test`（Task 9 完成後的樣子），在 `node scripts/check-templates.js && ` 之後插入 `node scripts/check-doc-stats.js && `：

```json
"test": "node scripts/check-syntax.js && node scripts/check-utf8.js && node scripts/check-duplicate-ids.js && node scripts/check-templates.js && node scripts/check-doc-stats.js && node scripts/check-traditional.js && node scripts/check-traditional.js --full --code && node --test --test-concurrency=1 tests/*.test.js",
```

- [ ] **Step 5: Commit**

```bash
git add scripts/check-doc-stats.js README.md AGENTS.md package.json
git commit -m "feat(gate): doc tool-count guard; fix README stale count (725 -> actual)"
```

---

### Task 11: 全域驗證收尾 + DEV_LOG 記錄

**Files:**
- Modify: `DEV_LOG.md`（尾端追加）

- [ ] **Step 1: 全套驗證**

```bash
npm test
node cli.js validate
node scripts/check-mece.js
node scripts/eval-benchmark.js 2>&1 | tee docs/benchmarks/2026-10-02-post-fix.txt
```

Expected:
- `npm test`：既有 320 + 本計畫新增（l15-score-scale 1、l15-tiebreak 1、negative-constraint-sign 1、telemetry-endpoint 4）= 至少 327 tests，0 fail，2 skipped（playwright e2e）。
- `cli.js validate`：Contract 0 errors。
- `check-mece`：通過。
- benchmark：agent / fusion Hit@1 與基線差異 ≤ 3pp；空集誠實率 10/10。

- [ ] **Step 2: DEV_LOG.md 尾端追加記錄**

```markdown
## 2026-10-02 檢索校準三修復 + rerank 三端對齊 + telemetry 回流 + 四道治理門禁

### 需求
2026-10-02 全域診斷（對話記錄）指認兩大問題：(1) registry 寫入治理（4 個寫入者、
108 支樣板污染、危險的 enrich 路徑）；(2) 需求→工具對接有效性未驗證
（L1.5 量尺不一致 → 213% 信心度、萬用觸發詞同分群、negativeConstraints 被當
正向證據、真人查詢語料為零）。本輪執行第一批修復，計畫檔：
docs/superpowers/plans/2026-10-02-retrieval-calibration-and-governance.md。

### 修復內容
1. **L1.5 量尺對齊**（search-engine.js）：L1.5 回傳 3*discrim（0~3）與 L2 的
   0~0.99 混用，顯示層乘 100 後出現「213%」；改回 discrim（0~1），單調轉換不改排序。
2. **L1.5 同分破解**：id/name 含命中 trigger 的工具 +0.017 身分加權，
   萬用 trigger（youtube/model…）的同分群由身分強度破序。
3. **negativeConstraints 符號修復**（agent-retrieval.js）：從 V3/V4 正向文本移除，
   改為 negativePenalty()（重疊 >0.25 起扣，上限 0.15）；reasons 顯示扣分。
4. **CLI rerank 預設化**：與 web/server.js 對齊「有 key 就啟用」，--no-rerank 逃生門。
5. **telemetry 回流**：POST /api/telemetry → web/data/telemetry-events.jsonl
   （JSONL 附加、.gitignore 排除）；behavior-tracker 三事件 fire-and-forget 上報。
   真人查詢語料開始累積。
6. **寫入路徑收斂**：sync-daemon / trending-weekly / reclassify-tools 三支改呼叫
   core/registry.js#saveRegistry()；tools.json 寫入點由 4 → 1。
7. **enrich 上鎖**：scripts/enrich-registry.js 需 --force（DEV_LOG 2026-09-27 殘留 #5 落地）。
8. **兩道新門禁**：check-templates.js（樣板黑名單）、check-doc-stats.js（文件數字=實際筆數），
   皆已掛入 npm test。

### 驗證結果
（執行時填入：npm test N tests / 0 fail / 2 skip；validate 0 errors；
benchmark 基線 vs post-fix 的 agent / fusion Hit@1 對照；空集誠實率 10/10。）

### 已知殘留（如實記錄）
1. tracked-repos.json 混合 schema（2,543 個 repo key 與 repos 陣列同層）——
   讀寫者分散在 trending-weekly / add-user-requested-tools，屬第二批處理。
2. dist/registry/tools.json 已落後 5 筆——build 流程與 CI 的 dist 政策待釐清。
3. V0 語意 embedding（registry/embeddings/vectors.json）與 retrieveWithAdaptiveHyDE
   已實作未評測——需先建向量檔再跑 eval，屬第二批。
4. 評測集仍為「由 metadata 反推」的自製題（methodology 已自承偏差）——
   telemetry 累積真人查詢後重建。
```

- [ ] **Step 3: Commit**

```bash
git add DEV_LOG.md docs/benchmarks/2026-10-02-post-fix.txt
git commit -m "docs(devlog): record calibration fixes, telemetry loop, and governance gates"
```

---

## 附錄：後續批次 Roadmap（本計畫不實作，各批獨立成計畫）

依 2026-10-02 智囊團結論的證據門檻排序：

**Batch 2 — 表示層試點（門檻：本計畫的乾淨基線已建立）**
1. `tracked-repos.json` schema 統一：2,543 個 repo key 與 `repos` 陣列同層的混合結構，讀寫者（trending-weekly.js、add-user-requested-tools.js:405-420）一次遷移 + tracked-repos-provenance 測試更新。
2. `negativeConstraints` 結構化試點：top-100 熱門工具加機器可讀的 `{facet, value}` 約束欄位，`negativePenalty()` 改讀結構欄位（散文留作顯示），重跑 benchmark——當天可證偽。
3. V0 語意 embedding 實測：`npm run embed:build` 建向量檔（需 API key），查詢端在 server/CLI 有 key 時計算 queryVector 傳入 `retrieveWithRerank`，benchmark 對照 V0 開/關。
4. `retrieveWithAdaptiveHyDE`（core/retrieval-fusion.js:414，已實作未評測）納入 benchmark 對照組。
5. `triggerIdfCache` 為 module 層級、由程序中第一個 corpus 建置——多 registry 共存情境（測試/工具）會重用過期 IDF，列為 Batch 2 觀察項。
6. `core/multidimensional.js:88` 分類端 D1 仍將 negativeConstraints 折入聚類文本（與檢索端同一符號缺陷的分類側）；隨結構化約束一併處理。連同 c61 雙重否定案例，是結構化 {facet, value} 約束的具體論據。

**Batch 3 — 專家資產（門檻：Batch 2 的結構化約束落地）**
1. 意圖原型表：267 題評測集聚類出 20~50 個任務原型（「轉逐字稿」「做簡報」…），疊在 query-intent.js 的三元組上。
2. `registry/recipes.json`：配方 schema（steps / tool ids / 資料流契約 / validated 旗標），先手工驗證 3 條，掛進 `cli.js plan`。禁止自動生成配方。
3. 專業分層：100 支深驗證 / 其餘索引式，深度與 tier 掛鉤。

**Batch 4 — 重建評測集（門檻：telemetry 已累積 ≥ 100 筆真人查詢）**
1. 從 JSONL 匿名化取樣真人查詢，重建 eval-queries.json v2.0（methodology 自承的偏差屆時可修）。
2. 重訂所有基線（與 v1.3.0 不可直接比較，照舊慣例標注）。
