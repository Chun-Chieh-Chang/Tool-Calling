// Verify current pipeline-workflow.html edge geometry
const fs = require('fs');
const html = fs.readFileSync('d:/Self-developed_Apps/Tool-Calling/docs/pipeline-workflow.html', 'utf-8');

// Parse config
const cfgMatch = html.match(/nodeWidth:\s*(\d+),\s*nodeHeight:\s*(\d+),\s*colGap:\s*(\d+),\s*rowGap:\s*(\d+),\s*padX:\s*(\d+),\s*padY:\s*(\d+)/);
const cfg = { nodeWidth: +cfgMatch[1], nodeHeight: +cfgMatch[2], colGap: +cfgMatch[3], rowGap: +cfgMatch[4], padX: +cfgMatch[5], padY: +cfgMatch[6] };

// Parse nodes
const nodeMatches = html.matchAll(/id:\s*'(\w+)'[\s\S]*?col:\s*([\d.]+)[\s\S]*?row:\s*([\d.]+)[\s\S]*?type:\s*'(\w+)'/g);
const nodes = [];
for (const m of nodeMatches) nodes.push({ id: m[1], col: parseFloat(m[2]), row: parseFloat(m[3]), type: m[4] });

// Parse groups — 直接從 groups: [...] 區間提取，最簡單可靠
const gStart = html.indexOf('groups: [');
const gEnd = html.indexOf('],\n\n      // 顯式路由', gStart);
const groupsRaw = gStart >= 0 && gEnd >= 0 ? html.substring(gStart, gEnd + 2) : '';
const groups = [];
if (groupsRaw) {
  const gRegex = /id:\s*'(\w+)'[\s\S]*?title:\s*'([^']+)'[\s\S]*?members:\s*\[([^\]]+)\]/g;
  let gm;
  while ((gm = gRegex.exec(groupsRaw)) !== null) {
    const members = gm[3].split(',').map(s => s.trim().replace(/'/g, ''));
    groups.push({ id: gm[1], title: gm[2], members });
  }
}

// Parse edges
const edgeRegex = /from:\s*'(\w+)'.*?to:\s*'(\w+)'.*?route:\s*'(\w+)'/gs;
const edges = [];
let em;
while ((em = edgeRegex.exec(html)) !== null) {
  const labelMatch = html.substring(em.index, em.index + 200).match(/label:\s*'([^']*)'/);
  edges.push({ from: em[1], to: em[2], route: em[3], label: labelMatch ? labelMatch[1] : '' });
}

const GAP = 5;
const MARKER_TIP = 4.8;

function computeBBox(node) {
  const dW = node.type === 'decision' ? 180 : cfg.nodeWidth;
  const dH = node.type === 'decision' ? 72 : cfg.nodeHeight;
  const cx = cfg.padX + node.col * (cfg.nodeWidth + cfg.colGap) + cfg.nodeWidth / 2;
  const cy = cfg.padY + node.row * (cfg.nodeHeight + cfg.rowGap) + cfg.nodeHeight / 2;
  return {
    x: cx - dW/2, y: cy - dH/2, w: dW, h: dH, cx, cy, type: node.type,
    top: { x: cx, y: cy - dH/2 },
    bottom: { x: cx, y: cy + dH/2 },
    left: { x: cx - dW/2, y: cy },
    right: { x: cx + dW/2, y: cy }
  };
}

const nodeMap = new Map();
nodes.forEach(n => nodeMap.set(n.id, computeBBox(n)));

const groupMap = new Map();
groups.forEach(g => {
  const members = g.members.map(id => nodeMap.get(id)).filter(Boolean);
  if (!members.length) return;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  members.forEach(m => {
    minX = Math.min(minX, m.x);
    minY = Math.min(minY, m.y);
    maxX = Math.max(maxX, m.x + m.w);
    maxY = Math.max(maxY, m.y + m.h);
  });
  const padTop = 34, padSide = 20;
  groupMap.set(g.id, {
    ...g,
    type: 'group',
    bounds: {
      x: minX - padSide, y: minY - padTop,
      w: (maxX - minX) + padSide * 2,
      h: (maxY - minY) + padTop + padSide,
      top: { x: (minX + maxX) / 2, y: minY - padTop },
      bottom: { x: (minX + maxX) / 2, y: maxY + padSide }
    }
  });
});

console.log('=== NODES ===');
console.log(JSON.stringify(nodes.map(n => ({ id: n.id, col: n.col, row: n.row, type: n.type })), null, 2));

console.log('\n=== GROUPS (raw) ===');
console.log(JSON.stringify(groups, null, 2));
groupMap.forEach(g => {
  const b = g.bounds;
  console.log(`${g.id}: bbox=[${b.x.toFixed(0)}, ${b.y.toFixed(0)}, ${b.w.toFixed(0)}, ${b.h.toFixed(0)}] top=[${b.top.x.toFixed(0)},${b.top.y.toFixed(0)}] bottom=[${b.bottom.x.toFixed(0)},${b.bottom.y.toFixed(0)}]`);
});

console.log('\n=== EDGE PATH ANALYSIS ===');
let errors = 0;
edges.forEach(e => {
  const fromNode = nodeMap.get(e.from) || groupMap.get(e.from);
  const toNode = nodeMap.get(e.to) || groupMap.get(e.to);
  if (!fromNode || !toNode) {
    console.log(`❌ MISSING: ${e.from} -> ${e.to} [${e.route}]`);
    errors++;
    return;
  }
  const f = fromNode.type === 'group' ? fromNode.bounds : fromNode;
  const t = toNode.type === 'group' ? toNode.bounds : toNode;
  const route = e.route || 'v';
  let path, tipExtends;

  switch (route) {
    case 'v':
      path = `M${f.bottom.x.toFixed(0)} ${f.bottom.y.toFixed(0)} L${f.bottom.x.toFixed(0)} ${(t.top.y - GAP).toFixed(0)}`;
      tipExtends = GAP - MARKER_TIP;
      break;
    case 'gdown':
      path = `M${f.bottom.x.toFixed(0)} ${f.bottom.y.toFixed(0)} L${f.bottom.x.toFixed(0)} ${(t.top.y - GAP).toFixed(0)}`;
      tipExtends = GAP - MARKER_TIP;
      break;
    case 'h':
      path = `M${f.right.x.toFixed(0)} ${f.right.y.toFixed(0)} L${(t.left.x - GAP).toFixed(0)} ${f.right.y.toFixed(0)}`;
      tipExtends = GAP - MARKER_TIP;
      break;
    case 'hdown':
      path = `M${f.right.x.toFixed(0)} ${f.right.y.toFixed(0)} L${t.top.x.toFixed(0)} ${f.right.y.toFixed(0)} L${t.top.x.toFixed(0)} ${(t.top.y - GAP).toFixed(0)}`;
      tipExtends = GAP - MARKER_TIP;
      break;
    case 'elbow':
      path = `M${f.bottom.x.toFixed(0)} ${f.bottom.y.toFixed(0)} L${f.bottom.x.toFixed(0)} ${((f.bottom.y + t.top.y) / 2).toFixed(0)} L${t.top.x.toFixed(0)} ${((f.bottom.y + t.top.y) / 2).toFixed(0)} L${t.top.x.toFixed(0)} ${(t.top.y - GAP).toFixed(0)}`;
      tipExtends = GAP - MARKER_TIP;
      break;
    case 'sider':
      const chanX = (t.right.x + f.left.x) / 2;
      const mY = (f.bottom.y + t.top.y) / 2;
      path = `M${f.bottom.x.toFixed(0)} ${f.bottom.y.toFixed(0)} L${f.bottom.x.toFixed(0)} ${mY.toFixed(0)} L${chanX.toFixed(0)} ${mY.toFixed(0)} L${chanX.toFixed(0)} ${t.right.y.toFixed(0)} L${(t.right.x + GAP).toFixed(0)} ${t.right.y.toFixed(0)}`;
      tipExtends = GAP - MARKER_TIP;
      break;
    default:
      path = `??? [${route}]`;
      tipExtends = 0;
  }

  const status = tipExtends >= 0
    ? `✓ tip extends ${(tipExtends).toFixed(1)}px past border (not penetrating)`
    : `⚠ PENETRATES ${(Math.abs(tipExtends)).toFixed(1)}px`;

  const targetAnchor = route === 'sider'
    ? `right=[${t.right.x.toFixed(0)},${t.right.y.toFixed(0)}]`
    : `top=[${t.top.x.toFixed(0)},${t.top.y.toFixed(0)}]`;

  const targetInfo = (toNode && toNode.id && toNode.id.startsWith('grp_'))
    ? `group[${toNode.id}] bottom=[${t.bottom.x.toFixed(0)},${t.bottom.y.toFixed(0)}] top=[${t.top.x.toFixed(0)},${t.top.y.toFixed(0)}]`
    : `node[${toNode && toNode.id}] ${targetAnchor}`;

  console.log(`\n  ${e.from} → ${e.to} [${route}] "${e.label}"`);
  console.log(`    path: ${path}`);
  console.log(`    ${targetInfo}`);
  console.log(`    ${status}`);
});

console.log(`\n=== SUMMARY: ${edges.length - errors}/${edges.length} edges valid, ${errors} errors ===`);
