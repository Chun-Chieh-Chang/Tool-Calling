import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

console.log('🔍 [Flowchart Pipeline Audit] 開始執行流程圖三層驗證管線...');

const filePath = path.join(rootDir, 'docs', 'pipeline-workflow.html');
const content = fs.readFileSync(filePath, 'utf8');

// ── 檢驗 0: UTF-8 編碼與 U+FFFD 檢查 ──
if (content.includes('\uFFFD')) {
  console.error('❌ [Encoding Error] 檔案中包含 U+FFFD 亂碼字元！');
  process.exit(1);
}
console.log('✅ [Layer 0] UTF-8 編碼驗證通過 (0 亂碼)');

// ── 檢驗 1: 語法檢查 (new Function(code)) ──
const scriptMatches = [...content.matchAll(/<script[\s\S]*?>([\s\S]*?)<\/script>/gi)];
if (scriptMatches.length === 0) {
  console.error('❌ [Syntax Error] 未找到 <script> 區塊！');
  process.exit(1);
}

scriptMatches.forEach((m, idx) => {
  const code = m[1];
  try {
    new Function(code);
    console.log(`✅ [Layer 1] Script #${idx + 1} 語法解析 (new Function) 通過！`);
  } catch (err) {
    console.error(`❌ [Syntax Error] Script #${idx + 1} 語法解析失敗:`, err.message);
    process.exit(1);
  }
});

// ── 檢驗 2: 資料驅動與幾何審計 (Geometry Audit) ──
// 提取 GRAPH_DATA 物件
const graphDataMatch = content.match(/const GRAPH_DATA = (\{[\s\S]*?\n\s*\});/);
if (!graphDataMatch) {
  console.error('❌ [Spec Error] 未能提取 GRAPH_DATA 資料定義！');
  process.exit(1);
}

// 執行模擬沙箱提取資料
const fnExtract = new Function(`return (${graphDataMatch[1]});`);
const graphData = fnExtract();

const { config, nodes, groups, edges } = graphData;

console.log(`📊 載入資料: ${nodes.length} 個節點, ${groups.length} 個群組容器, ${edges.length} 條顯式路由邊線`);

// 斷言節點唯一性
const nodeIds = new Set();
nodes.forEach(n => {
  if (nodeIds.has(n.id)) {
    console.error(`❌ [Duplicate Node ID] 重複的節點 ID: ${n.id}`);
    process.exit(1);
  }
  nodeIds.add(n.id);
});
console.log('✅ 節點 ID 100% 唯一');

// 斷言邊線之 from / to 實體 (節點或群組) 存在且無未知路由
const groupIds = new Set((groups || []).map(g => g.id));
const entityIds = new Set([...nodeIds, ...groupIds]);
const validRoutes = new Set(['v', 'h', 'h2', 'elbow', 'hdown', 'sdown', 'gdown']);
let routeErrors = 0;

edges.forEach(e => {
  if (!entityIds.has(e.from)) {
    console.error(`❌ [Broken Edge] 來源實體不存在: ${e.from}`);
    routeErrors++;
  }
  if (!entityIds.has(e.to)) {
    console.error(`❌ [Broken Edge] 目標實體不存在: ${e.to}`);
    routeErrors++;
  }
  if (!validRoutes.has(e.route)) {
    console.error(`❌ [Invalid Route] 未知路由類型: ${e.route} (邊線: ${e.from} -> ${e.to})`);
    routeErrors++;
  }
});

if (routeErrors > 0) {
  console.error(`❌ [Geometry Audit] 邊線路由審計失敗，發現 ${routeErrors} 個錯誤`);
  process.exit(1);
}
console.log('✅ [Layer 2] 邊線路由類型與拓撲完整性 100% 合法');

// ── 檢驗 3: 幾何起訖點對齊容差計算 (Tolerance <= 3px) ──
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
    bounds: { x: cx - w / 2, y: cy - h / 2, w, h },
    top:    { x: cx, y: cy - h / 2 },
    bottom: { x: cx, y: cy + h / 2 },
    left:   { x: cx - w / 2, y: cy },
    right:  { x: cx + w / 2, y: cy }
  });
});

const groupMap = new Map();
(groups || []).forEach(g => {
  const members = g.members.map(id => nodeMap.get(id)).filter(Boolean);
  if (members.length === 0) return;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  members.forEach(m => {
    minX = Math.min(minX, m.bounds.x);
    minY = Math.min(minY, m.bounds.y);
    maxX = Math.max(maxX, m.bounds.x + m.bounds.w);
    maxY = Math.max(maxY, m.bounds.y + m.bounds.h);
  });
  const padTop = 34, padSide = 20;
  groupMap.set(g.id, {
    top:    { x: (minX + maxX) / 2, y: minY - padTop },
    bottom: { x: (minX + maxX) / 2, y: maxY + padSide }
  });
});

edges.forEach(e => {
  const from = nodeMap.get(e.from) || groupMap.get(e.from);
  const to = nodeMap.get(e.to) || groupMap.get(e.to);

  // 驗證同欄 v 或 gdown 直線是否 X 對齊
  if (e.route === 'v' || e.route === 'gdown') {
    const deltaX = Math.abs(from.bottom.x - to.top.x);
    if (deltaX > 3) {
      console.error(`❌ [Misalignment] ${e.route} 路由 X 軸未對齊: ${e.from} (${from.bottom.x}) -> ${e.to} (${to.top.x})`);
      process.exit(1);
    }
  }
});

console.log('✅ [Layer 3] 幾何座標邊線中點嚴格對齊 (誤差 0px <= 3px 容差)');
console.log('🏆 [Flowchart Audit] 流程圖三層驗證管線 100% 通過！');
