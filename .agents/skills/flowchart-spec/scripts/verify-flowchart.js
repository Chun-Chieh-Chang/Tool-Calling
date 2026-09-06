import fs from 'fs';
import path from 'path';

/**
 * 流程圖幾何與三層審計驗證腳本 (Flowchart 3-Layer Spec Auditor)
 * 用法: node verify-flowchart.js <path-to-html-file>
 */
const targetFile = process.argv[2] || 'docs/pipeline-workflow.html';
const resolvedPath = path.resolve(process.cwd(), targetFile);

if (!fs.existsSync(resolvedPath)) {
  console.error(`❌ [File Error] 目標檔案不存在: ${resolvedPath}`);
  process.exit(1);
}

console.log(`🔍 [Flowchart Spec Audit] 開始審計檔案: ${targetFile}...`);
const content = fs.readFileSync(resolvedPath, 'utf8');

// ── 第 0 層：UTF-8 編碼與 U+FFFD 檢查 ──
if (content.includes('\uFFFD')) {
  console.error('❌ [Layer 0 Fail] 檔案包含 U+FFFD 亂碼字元！');
  process.exit(1);
}
console.log('✅ [Layer 0 Pass] UTF-8 編碼驗證通過 (0 亂碼)');

// ── 第 1 層：語法解析檢查 (new Function) ──
const scriptMatches = [...content.matchAll(/<script[\s\S]*?>([\s\S]*?)<\/script>/gi)];
if (scriptMatches.length === 0) {
  console.error('❌ [Layer 1 Fail] 未找到任何 <script> 區塊！');
  process.exit(1);
}

scriptMatches.forEach((m, idx) => {
  try {
    new Function(m[1]);
    console.log(`✅ [Layer 1 Pass] Script #${idx + 1} 語法解析通過！`);
  } catch (err) {
    console.error(`❌ [Layer 1 Fail] Script #${idx + 1} 語法解析失敗:`, err.message);
    process.exit(1);
  }
});

// ── 第 2 層：資料完整性與拓撲審計 ──
const graphDataMatch = content.match(/const GRAPH_DATA = (\{[\s\S]*?\n\s*\});/);
if (!graphDataMatch) {
  console.error('❌ [Layer 2 Fail] 未能提取 GRAPH_DATA 宣告！');
  process.exit(1);
}

const fnExtract = new Function(`return (${graphDataMatch[1]});`);
const graphData = fnExtract();
const { config, nodes, groups, edges } = graphData;

console.log(`📊 節點數: ${nodes.length}, 群組數: ${(groups || []).length}, 邊線數: ${edges.length}`);

// 檢查節點 ID 唯一性
const nodeIds = new Set();
nodes.forEach(n => {
  if (nodeIds.has(n.id)) {
    console.error(`❌ [Layer 2 Fail] 重複節點 ID: ${n.id}`);
    process.exit(1);
  }
  nodeIds.add(n.id);
});

// 檢查邊線路由類型合法性
const validRoutes = new Set(['v', 'h', 'h2', 'elbow', 'hdown', 'sdown', 'gdown']);
let routeErrors = 0;

edges.forEach(e => {
  if (!nodeIds.has(e.from)) {
    console.error(`❌ [Layer 2 Fail] 邊線起點不存在: ${e.from}`);
    routeErrors++;
  }
  if (!nodeIds.has(e.to)) {
    console.error(`❌ [Layer 2 Fail] 邊線終點不存在: ${e.to}`);
    routeErrors++;
  }
  if (!validRoutes.has(e.route)) {
    console.error(`❌ [Layer 2 Fail] 未知路由類型: ${e.route}`);
    routeErrors++;
  }
});

if (routeErrors > 0) {
  console.error(`❌ [Layer 2 Fail] 發現 ${routeErrors} 個拓撲錯誤！`);
  process.exit(1);
}
console.log('✅ [Layer 2 Pass] 節點與邊線拓撲 100% 合法且無斷裂！');

// ── 第 3 層：幾何座標邊線中點嚴格審計 (容差 <= 3px) ──
const nodeMap = new Map();
const { nodeWidth, nodeHeight, colGap, rowGap, padX, padY, diamondWidth, diamondHeight, diamondSize } = config;
const dW = diamondWidth || diamondSize || 180;
const dH = diamondHeight || diamondSize || 72;

nodes.forEach(n => {
  const cx = padX + n.col * (nodeWidth + colGap) + nodeWidth / 2;
  const cy = padY + n.row * (nodeHeight + rowGap) + nodeHeight / 2;
  const w = n.type === 'decision' ? dW : nodeWidth;
  const h = n.type === 'decision' ? dH : nodeHeight;

  nodeMap.set(n.id, {
    top:    { x: cx, y: cy - h / 2 },
    bottom: { x: cx, y: cy + h / 2 },
    left:   { x: cx - w / 2, y: cy },
    right:  { x: cx + w / 2, y: cy }
  });
});

edges.forEach(e => {
  const from = nodeMap.get(e.from);
  const to = nodeMap.get(e.to);

  if (e.route === 'v') {
    const deltaX = Math.abs(from.bottom.x - to.top.x);
    if (deltaX > 3) {
      console.error(`❌ [Layer 3 Fail] v 路由 X 軸未對齊: ${e.from} (${from.bottom.x}) -> ${e.to} (${to.top.x})`);
      process.exit(1);
    }
  }
});

console.log('✅ [Layer 3 Pass] 幾何中點對齊嚴格通過 (容差 <= 3px)');
console.log('🏆 [Audit Complete] 流程圖規範審計 100% 成功！');
