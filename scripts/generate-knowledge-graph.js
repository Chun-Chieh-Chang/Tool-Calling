import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// OLED 純黑與 Obsidian 沉穩調色盤 (True Pure OLED Black & Obsidian Graph View Palette)
const baseCategoryColors = {
  "AI 框架": "#0284c7",        // 沉穩天藍 (Sky 600)
  "AI 代理": "#0891b2",        // 深邃青藍 (Cyan 600)
  "開發工具": "#94a3b8",      // 柔和石板 (Slate 400)
  "UI/UX設計": "#9333ea",     // 雅致紫羅蘭 (Purple 600)
  "多媒體生成": "#db2777",    // 典雅玫紅 (Pink 600)
  "影片": "#e11d48",          // 復古磚紅 (Rose 600)
  "音訊": "#65a30d",          // 自然苔綠 (Lime 600)
  "瀏覽器自動化": "#2563eb",  // 皇家寶藍 (Blue 600)
  "安全性": "#dc2626",        // 警示赤紅 (Red 600)
  "測試與自動化": "#0369a1",  // 沉靜鈷藍 (Sky 700)
  "API 整合": "#0d9488",      // 介面松石 (Teal 600)
  "學習資源": "#d97706",      // 琥珀暖金 (Amber 600)
  "文件生產力": "#059669",    // 墨綠翡翠 (Emerald 600)
  "資料庫": "#16a34a",        // 穩固森林 (Green 600)
  "知識管理": "#0284c7",      // 知識沉藍 (Sky 600)
  "研究": "#7e22ce",          // 深度典雅紫 (Purple 700)
  "基礎設施": "#64748b",      // 鋼鐵冷灰 (Slate 500)
  "行銷": "#ea580c",          // 活力暖橙 (Orange 600)
  "數據分析": "#0f766e",      // 深海暗綠 (Teal 700)
  "3D工程繪圖": "#4f46e5",    // 幾何靛青 (Indigo 600)
  "圖標與視覺資源": "#a855f7" // 柔和薰衣草 (Purple 500)
};

// 根據背景 Hex 顏色計算最優文字對比色
function getContrastTextColor(hexColor) {
  if (!hexColor) return "#ffffff";
  const hex = hexColor.replace('#', '');
  if (hex.length !== 6) return "#ffffff";
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#000000" : "#ffffff";
}

// 若遇動態新增之未知分類，自動透過色相演算法生成
function getCategoryColor(catName, index) {
  if (baseCategoryColors[catName]) return baseCategoryColors[catName];
  const hue = (index * 137.5 + 200) % 360;
  return `hsl(${Math.floor(hue)}, 65%, 48%)`;
}

/**
 * 全自動動態數據驅動 2D / 3D 雙引擎知識圖譜生成器 (Obsidian Graph View Style + Zero Border + OLED Pure Black)
 */
export function generateKnowledgeGraph(registryInput = null) {
  let registry = registryInput;
  if (!registry) {
    const registryPath = path.join(__dirname, '../registry/tools.json');
    registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  }

  const nodes = [];
  const edges = [];

  // 1. Root Node (Obsidian 核心星系主節點 - 無外框圓形實心點)
  nodes.push({
    id: "root",
    label: `Tool-Calling\n(${registry.tools.length} Tools)`,
    group: "root",
    lastUpdated: registry.lastUpdated || new Date().toISOString(),
    totalTools: registry.tools.length,
    shape: "dot",
    size: 14,
    borderWidth: 0,
    borderWidthSelected: 0,
    color: {
      background: "#0284c7",
      border: "#0284c7",
      highlight: { background: "#38bdf8", border: "#38bdf8" },
      hover: { background: "#38bdf8", border: "#38bdf8" }
    },
    colorHex: "#0284c7",
    font: { color: "#ffffff", size: 14, face: "-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif", bold: false, strokeWidth: 0, strokeColor: "transparent" },
    val: 32
  });

  // 2. Category Nodes (Obsidian 分類星團節點 - 無外框圓形實心點)
  const categories = [...new Set(registry.tools.map(t => t.category))].filter(Boolean);
  
  categories.forEach((cat, idx) => {
    const catId = `cat_${idx}`;
    const colorHex = getCategoryColor(cat, idx);
    
    const catTools = registry.tools.filter(t => t.category === cat);
    const languages = [...new Set(catTools.map(t => t.language).filter(Boolean))];
    const useCases = catTools.map(t => t.useCase).filter(Boolean);
    
    let dynamicCatDesc = `收錄 ${catTools.length} 個與「${cat}」相關之 AI 工具與 Agent 技能。`;
    if (useCases.length > 0) {
      dynamicCatDesc += ` 核心應用場景涵蓋：${useCases.slice(0, 2).join('；')} 等。`;
    }
    
    nodes.push({
      id: catId,
      label: cat,
      group: "category",
      categoryName: cat,
      description: dynamicCatDesc,
      toolCount: catTools.length,
      languages: languages,
      topTools: catTools.slice(0, 5).map(t => t.name),
      shape: "dot",
      size: 9.5,
      borderWidth: 0,
      borderWidthSelected: 0,
      color: {
        background: colorHex,
        border: colorHex,
        highlight: { background: "#ffffff", border: "#ffffff" },
        hover: { background: "#ffffff", border: "#ffffff" }
      },
      colorHex: colorHex,
      font: {
        color: "#e2e8f0",
        size: 12.5,
        face: "-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif",
        bold: false,
        strokeWidth: 0,
        strokeColor: 'transparent'
      },
      val: 20
    });

    // Obsidian 主幹連線 (幽微內斂細線)
    edges.push({
      from: "root",
      to: catId,
      source: "root",
      target: catId,
      color: { color: "rgba(2, 132, 199, 0.4)", highlight: "#38bdf8", hover: "#38bdf8", opacity: 0.4 },
      colorHex: "#0284c7",
      width: 1.0,
      isDashed: false
    });

    // 3. Tools in this Category (Obsidian 筆記節點 - 無外框圓形實心點)
    catTools.forEach(tool => {
      const toolNodeId = `tool_${tool.id}`;
      
      nodes.push({
        id: toolNodeId,
        label: tool.name,
        group: "tool",
        categoryName: cat,
        toolData: {
          id: tool.id,
          name: tool.name,
          description: tool.description,
          category: tool.category,
          language: tool.language,
          useCase: tool.useCase,
          advantages: tool.advantages || [],
          negativeConstraints: tool.negativeConstraints || [],
          install: tool.install,
          capabilities: tool.capabilities || []
        },
        shape: "dot",
        size: 5.5,
        borderWidth: 0,
        borderWidthSelected: 0,
        color: {
          background: colorHex,
          border: colorHex,
          highlight: { background: "#ffffff", border: "#ffffff" },
          hover: { background: "#ffffff", border: "#ffffff" }
        },
        colorHex: colorHex,
        font: {
          color: "#94a3b8",
          size: 11,
          face: "-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif",
          bold: false,
          strokeWidth: 0,
          strokeColor: "transparent"
        },
        title: `<b>${tool.name}</b><br/>分類: ${tool.category}<br/>描述: ${tool.description}<br/>⭐ 場景: ${tool.useCase || '無'}`,
        val: 8
      });

      // Obsidian 內容分支連線 (超細極簡線條)
      edges.push({
        from: catId,
        to: toolNodeId,
        source: catId,
        target: toolNodeId,
        color: { color: "rgba(255, 255, 255, 0.12)", highlight: "#38bdf8", hover: "#38bdf8", opacity: 0.2 },
        colorHex: colorHex,
        width: 0.6,
        length: 70,
        isDashed: false
      });

      // 4. SubTools / Capabilities (Obsidian 微原子節點 - 無外框超微圓點)
      if (tool.subTools && Array.isArray(tool.subTools)) {
        tool.subTools.slice(0, 3).forEach((sub, sIdx) => {
          const subId = `sub_${tool.id}_${sIdx}`;
          nodes.push({
            id: subId,
            label: sub.name || sub.id,
            group: "subtool",
            categoryName: cat,
            parentToolName: tool.name,
            subDesc: sub.description || '深層拆解之微技能',
            shape: "dot",
            size: 3.2,
            borderWidth: 0,
            borderWidthSelected: 0,
            color: {
              background: "#475569",
              border: "#475569",
              highlight: { background: "#0284c7", border: "#0284c7" },
              hover: { background: "#0284c7", border: "#0284c7" }
            },
            colorHex: "#475569",
            font: {
              color: "#64748b",
              size: 9,
              face: "-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif",
              bold: false,
              strokeWidth: 0,
              strokeColor: "transparent"
            },
            val: 4
          });

          edges.push({
            from: toolNodeId,
            to: subId,
            source: toolNodeId,
            target: subId,
            color: { color: "rgba(255, 255, 255, 0.06)", highlight: "#0284c7", hover: "#0284c7", opacity: 0.15 },
            colorHex: "#475569",
            width: 0.4,
            length: 35,
            dashes: [2, 4],
            isDashed: true
          });
        });
      }
    });
  });

  // 動態生成圖例 HTML 項目
  const legendItemsHtml = categories.map((cat, idx) => {
    const colorHex = getCategoryColor(cat, idx);
    return `<div class="legend-item" onclick="filterCategory('${cat}', this)">
      <span class="legend-badge" style="background:${colorHex}"></span>
      <span>${cat}</span>
    </div>`;
  }).join('');

  const htmlContent = `<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Tool-Calling 全景 AI 工具 3D/2D 雙視角知識圖譜</title>
  <link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🌐</text></svg>">
  <script type="text/javascript" src="https://unpkg.com/vis-network/standalone/umd/vis-network.min.js"></script>
  <script type="text/javascript" src="https://unpkg.com/three@0.149.0/build/three.min.js"></script>
  <script type="text/javascript" src="https://unpkg.com/three-spritetext@1.8.2/dist/three-spritetext.min.js"></script>
  <script type="text/javascript" src="https://unpkg.com/3d-force-graph@1.73.1/dist/3d-force-graph.min.js"></script>
  <style>
    :root {
      --bg-pure-black: #000000;
      --bg-panel: rgba(10, 10, 10, 0.92);
      --bg-panel-solid: #0d0d0d;
      --surface-hover: rgba(2, 132, 199, 0.12);
      --surface-inset: #111111;
      --text-primary: #f1f5f9;
      --text-secondary: #94a3b8;
      --text-muted: #64748b;
      --brand-cobalt: #0284c7;
      --brand-cobalt-hover: #0369a1;
      --brand-cobalt-light: rgba(2, 132, 199, 0.2);
      --brand-cyan: #38bdf8;
      --border-precision: 1px solid #1f1f1f;
      --border-subtle: 1px solid #161616;
      --shadow-micro: 0 4px 24px rgba(0, 0, 0, 0.85);
      --shadow-hover: 0 8px 32px rgba(0, 0, 0, 0.95);
      --status-success: #10b981;
      --status-error: #ef4444;
      --transition-fast: all 0.12s cubic-bezier(0.16, 1, 0.3, 1);
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif);
      background-color: var(--bg-pure-black);
      color: var(--text-primary);
      overflow: hidden;
      height: 100vh;
      width: 100vw;
      font-size: 13px;
      line-height: 1.5;
    }

    /* Obsidian 風格浮動頂部狀態列 */
    #header {
      position: absolute;
      top: 14px;
      left: 14px;
      z-index: 10;
      background: var(--bg-panel);
      backdrop-filter: blur(16px);
      border: 1px solid #222222;
      border-left: 4px solid var(--brand-cobalt);
      border-radius: 6px;
      padding: 12px 18px;
      box-shadow: var(--shadow-micro);
    }

    @keyframes pulseGreen {
      0% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7); }
      70% { box-shadow: 0 0 0 5px rgba(16, 185, 129, 0); }
      100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
    }

    .header-status-row {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 4px;
    }

    .status-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background-color: var(--status-success);
      display: inline-block;
      animation: pulseGreen 2s infinite cubic-bezier(0.4, 0, 0.6, 1);
    }

    .status-text {
      font-family: "JetBrains Mono", Consolas, monospace;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.05em;
      color: var(--text-muted);
      text-transform: uppercase;
    }

    h1 {
      font-size: 15px;
      font-weight: 700;
      color: var(--text-primary);
      display: flex;
      align-items: center;
      gap: 8px;
    }

    p.subtitle {
      font-size: 11px;
      color: var(--text-secondary);
      font-weight: 500;
      margin-top: 2px;
    }

    #controls {
      position: absolute;
      top: 14px;
      right: 14px;
      z-index: 10;
      display: flex;
      gap: 10px;
      align-items: center;
    }

    .mode-btn {
      background: #161616;
      border: 1px solid #333333;
      border-radius: 6px;
      color: #e2e8f0;
      padding: 7px 14px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
      transition: var(--transition-fast);
      display: flex;
      align-items: center;
      gap: 6px;
      min-height: 36px;
    }

    .mode-btn:hover {
      background: #222222;
      border-color: var(--brand-cobalt);
      color: #ffffff;
    }

    .mode-btn:active {
      transform: scale(0.98);
    }

    .mode-btn * {
      pointer-events: none;
    }

    .search-box {
      background: #0d0d0d;
      border: 1px solid #222222;
      border-radius: 6px;
      padding: 7px 12px;
      color: #f1f5f9;
      font-size: 12px;
      font-weight: 500;
      outline: none;
      width: 240px;
      min-height: 36px;
      transition: var(--transition-fast);
    }

    .search-box::placeholder {
      color: var(--text-muted);
    }

    .search-box:focus {
      border-color: var(--brand-cobalt);
      box-shadow: 0 0 0 2px rgba(2, 132, 199, 0.25);
    }

    #network2d, #network3d {
      width: 100%;
      height: 100%;
      position: absolute;
      top: 0;
      left: 0;
      background-color: var(--bg-pure-black);
    }

    #network3d {
      display: none;
      background-color: #000000;
    }

    /* 右側中間：Obsidian 圖例面板 */
    #legendPanel {
      position: absolute;
      top: 50%;
      right: 14px;
      transform: translateY(-50%);
      z-index: 15;
      background: var(--bg-panel);
      backdrop-filter: blur(16px);
      border: 1px solid #222222;
      border-radius: 6px;
      padding: 12px 14px;
      max-height: calc(100vh - 110px);
      width: 230px;
      overflow-y: auto;
      box-shadow: var(--shadow-micro);
    }

    .legend-header {
      font-size: 11px;
      font-weight: 700;
      color: var(--text-primary);
      margin-bottom: 6px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .legend-grid {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .legend-item {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      font-weight: 500;
      color: var(--text-secondary);
      padding: 4px 6px;
      border-radius: 4px;
      cursor: pointer;
      transition: var(--transition-fast);
      user-select: none;
      border: 1px solid transparent;
    }

    .legend-item:hover {
      background: var(--surface-hover);
      color: var(--text-primary);
    }

    .legend-item.active {
      background: var(--brand-cobalt-light);
      border-color: var(--brand-cobalt);
      color: #ffffff;
      font-weight: 700;
    }

    .legend-badge {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      display: inline-block;
      flex-shrink: 0;
    }

    /* 左下角：富文本詳細抽屜面板 (Obsidian 純黑極簡面板) */
    #detailPanel {
      position: absolute;
      bottom: 18px;
      left: 18px;
      z-index: 20;
      width: 360px;
      background: rgba(10, 10, 10, 0.96);
      backdrop-filter: blur(20px);
      border: 1px solid #262626;
      border-left: 3px solid var(--brand-cobalt);
      border-radius: 6px;
      padding: 16px;
      display: none;
      box-shadow: 0 10px 36px rgba(0, 0, 0, 0.9);
      transform: translateY(6px);
      transition: var(--transition-fast);
    }

    #detailPanel.active {
      display: block;
      transform: translateY(0);
    }

    .panel-title {
      font-size: 15px;
      font-weight: 700;
      color: var(--text-primary);
      margin-bottom: 4px;
    }

    .panel-tag {
      display: inline-block;
      padding: 2px 6px;
      background: rgba(255, 255, 255, 0.08);
      color: var(--brand-cyan);
      border-radius: 3px;
      font-family: "JetBrains Mono", Consolas, monospace;
      font-size: 10px;
      font-weight: 700;
      margin-bottom: 8px;
      text-transform: uppercase;
    }

    .close-btn {
      position: absolute;
      top: 10px;
      right: 12px;
      background: none;
      border: none;
      color: var(--text-muted);
      font-size: 16px;
      font-weight: bold;
      cursor: pointer;
      line-height: 1;
      padding: 4px;
    }

    .close-btn:hover {
      color: var(--text-primary);
    }
  
    /* 禁用 vis.js 原生 tooltip */
    .vis-tooltip { display: none !important; }
  </style>
</head>
<body>
  <div id="header">
    <div class="header-status-row">
      <span class="status-dot"></span>
      <span class="status-text">OBSIDIAN GRAPH // ACTIVE</span>
    </div>
    <h1>🌐 Tool-Calling 知識圖譜</h1>
    <p class="subtitle">${registry.tools.length} 個 AI 工具星系 (滾輪縮放 | 拖曳平移 | 懸浮高亮)</p>
  </div>

  <div id="controls">
    <button id="viewToggleBtn" class="mode-btn" onclick="toggle3DMode()">
      <span>🌌 切換至 3D 空間視角</span>
    </button>
    <input type="text" id="searchInput" class="search-box" placeholder="🔍 檢索工具或分類..." />
  </div>

  <!-- 右側中間：分類色彩與連線型態圖例面板 -->
  <div id="legendPanel">
    <div class="legend-header">
      <span>領域分類</span>
      <span style="font-size:10px; color:var(--text-muted); font-weight:600;">(${categories.length})</span>
    </div>
    <div class="legend-grid">
      ${legendItemsHtml}
    </div>

    <!-- 🔗 連線型態圖例說明 -->
    <div class="legend-header" style="margin-top: 10px; border-top: 1px solid #1a1a1a; padding-top: 6px;">
      <span>連線類型</span>
    </div>
    <div class="legend-grid">
      <div class="legend-item" style="cursor:default;">
        <span style="display:inline-block; width:12px; height:1.5px; background:rgba(255,255,255,0.3);"></span>
        <span>主類別網絡</span>
      </div>
      <div class="legend-item" style="cursor:default;">
        <span style="display:inline-block; width:12px; height:0; border-top:1.5px dashed rgba(255,255,255,0.15);"></span>
        <span>微技能拆解</span>
      </div>
    </div>
  </div>

  <!-- 左下角：詳細抽屜面板 -->
  <div id="detailPanel">
    <button class="close-btn" onclick="closePanel()">×</button>
    <div id="panelContent"></div>
  </div>

  <!-- 2D 平面網絡容器 (Obsidian Graph) -->
  <div id="network2d"></div>

  <!-- 3D 宇宙空間網絡容器 -->
  <div id="network3d"></div>

  <script id="nodes-data" type="application/json">${JSON.stringify(nodes)}</script>
  <script id="edges-data" type="application/json">${JSON.stringify(edges)}</script>

  <script>
    const nodesData = JSON.parse(document.getElementById('nodes-data').textContent);
    const edgesData = JSON.parse(document.getElementById('edges-data').textContent);

    let is3DMode = false;
    let graph3DInstance = null;

    // ─── 1. 初始化 2D Vis.js Network (Obsidian Graph View: 無外框純淨圓球、極簡飄逸文字) ───────
    const container2d = document.getElementById('network2d');
    const data2d = {
      nodes: new vis.DataSet(nodesData),
      edges: new vis.DataSet(edgesData)
    };

    const options2d = {
      nodes: {
        shape: 'dot',
        borderWidth: 0,
        borderWidthSelected: 0,
        font: {
          face: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          strokeWidth: 0,
          strokeColor: 'transparent',
          color: '#94a3b8'
        },
        shadow: false,
        opacity: 1
      },
      edges: {
        smooth: {
          type: 'continuous',
          roundness: 0.15
        },
        selectionWidth: 1.5,
        hoverWidth: 1.2
      },
      layout: { improvedLayout: false },
      physics: {
        enabled: true,
        barnesHut: {
          gravitationalConstant: -14000,
          centralGravity: 0.05,
          springLength: 85,
          springConstant: 0.03,
          damping: 0.42,
          avoidOverlap: 0.85
        },
        maxVelocity: 40,
        minVelocity: 0.2,
        solver: 'barnesHut',
        stabilization: { enabled: true, iterations: 300 }
      },
      interaction: {
        hover: true,
        zoomView: false, // 由自定義 2D Pivot Zoom 引擎全權接管，打破縮放限制
        dragView: true,
        hoverConnectedEdges: true
      }
    };

    const network2d = new vis.Network(container2d, data2d, options2d);
    
    // -- 2D Hover Tooltip (Obsidian Minimalist Popover) --
    function updateTooltip2d(node) {
      let tooltipEl = document.getElementById('graph-tooltip-2d');
      if (!tooltipEl) {
        tooltipEl = document.createElement('div');
        tooltipEl.id = 'graph-tooltip-2d';
        tooltipEl.style.cssText = 'position:absolute; pointer-events:none; z-index:1000; transition: opacity 0.12s;';
        document.body.appendChild(tooltipEl);
      }
      
      if (!node) {
        tooltipEl.style.opacity = '0';
        setTimeout(() => tooltipEl.remove(), 150);
        return;
      }
      
      let html = '<div style="background:rgba(12,12,12,0.96); padding:10px 14px; border-radius:6px; border:1px solid #222222; border-left:3px solid ' + (node.colorHex || '#0284c7') + '; color:#f1f5f9; font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif; font-size:12px; min-width:180px; max-width:300px; box-shadow:0 8px 28px rgba(0,0,0,0.9);">';
      html += '<div style="font-weight:700; font-size:13px; color:#ffffff; margin-bottom:3px;">' + node.label.replace(/\\n/g, ' ') + '</div>';
      
      if (node.categoryName) {
        html += '<div style="color:#94a3b8; font-size:11px; margin-bottom:5px; font-weight:600;">' + node.categoryName + '</div>';
      }
      
      if (node.toolData && node.group === 'tool') {
        const t = node.toolData;
        if (t.description) {
          html += '<div style="color:#cbd5e1; font-size:11px; font-weight:400; line-height:1.4; margin-bottom:5px;">' + t.description.slice(0, 80) + (t.description.length > 80 ? '...' : '') + '</div>';
        }
        if (t.useCase) {
          html += '<div style="color:#34d399; font-size:11px; font-weight:600; margin-bottom:3px;"><b>★ 場景:</b> ' + t.useCase.slice(0, 50) + (t.useCase.length > 50 ? '...' : '') + '</div>';
        }
        if (t.advantages && t.advantages.length > 0) {
          html += '<div style="color:#38bdf8; font-size:11px; font-weight:600;"><b>◆ 優勢:</b> ' + t.advantages.slice(0, 2).join(', ') + '</div>';
        }
      } else if (node.group === 'category') {
        html += '<div style="color:#cbd5e1; font-size:11px; font-weight:500;">收錄 <b>' + (node.toolCount || 0) + '</b> 個工具</div>';
      } else if (node.group === 'root') {
        html += '<div style="color:#cbd5e1; font-size:11px; font-weight:500;">共 <b>' + (node.totalTools || 0) + '</b> 個 AI 工具</div>';
      }
      
      html += '<div style="color:#64748b; font-size:9px; margin-top:5px; text-transform:uppercase; font-family:monospace; font-weight:700;">' + node.group + '</div>';
      html += '</div>';
      
      tooltipEl.innerHTML = html;
      tooltipEl.style.opacity = '1';
    }

    network2d.on('hoverNode', function(params) {
      const nodeId = params.node;
      const node = data2d.nodes.get(nodeId);
      updateTooltip2d(node);
    });

    network2d.on('blurNode', function() {
      const tooltipEl = document.getElementById('graph-tooltip-2d');
      if (tooltipEl) {
        tooltipEl.style.opacity = '0';
        setTimeout(() => tooltipEl.remove(), 150);
      }
    });

    container2d.addEventListener('mousemove', function(e) {
      const tooltipEl = document.getElementById('graph-tooltip-2d');
      if (tooltipEl) {
        let x = e.clientX + 14;
        let y = e.clientY - 10;
        const rect = tooltipEl.getBoundingClientRect();
        if (x + rect.width > window.innerWidth) x = e.clientX - rect.width - 14;
        if (y + rect.height > window.innerHeight) y = e.clientY - rect.height - 10;
        tooltipEl.style.left = x + 'px';
        tooltipEl.style.top = y + 'px';
      }
    });

    // 2D Pivot Zoom (支援超深層放大檢視，突破 Vis.js 原生縮放上限)
    container2d.addEventListener('wheel', function(e) {
      e.preventDefault();
      const currentScale = network2d.getScale();
      const zoomFactor = e.deltaY < 0 ? 1.18 : 0.85;
      const newScale = Math.min(Math.max(currentScale * zoomFactor, 0.02), 35.0);

      const rect = container2d.getBoundingClientRect();
      const pointer = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      const domPos = network2d.DOMtoCanvas(pointer);

      network2d.moveTo({
        position: domPos,
        scale: newScale,
        offset: { x: -pointer.x + rect.width / 2, y: -pointer.y + rect.height / 2 },
        animation: false
      });
    }, { passive: false });

    network2d.once('stabilizationIterationsDone', function() {
      network2d.setOptions({ physics: { enabled: false } });
      network2d.fit({ animation: { duration: 500, easingFunction: 'easeInOutQuad' } });
    });
    setTimeout(function() { network2d.fit(); }, 300);

    // Helper: 根據背景 Hex 顏色計算最優文字對比色
    function getContrastTextColorJS(hexColor) {
      if (!hexColor) return "#ffffff";
      const hex = hexColor.replace('#', '');
      if (hex.length !== 6) return "#ffffff";
      const r = parseInt(hex.substring(0, 2), 16);
      const g = parseInt(hex.substring(2, 4), 16);
      const b = parseInt(hex.substring(4, 6), 16);
      const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      return luminance > 0.6 ? "#000000" : "#ffffff";
    }

    // ─── 2. 初始化 3D Force-Directed Graph (Obsidian 柔和霧面磨砂實心球體) ──
    function init3DGraph() {
      if (graph3DInstance) return;

      const container3d = document.getElementById('network3d');
      const gData = {
        nodes: JSON.parse(JSON.stringify(nodesData)),
        links: JSON.parse(JSON.stringify(edgesData))
      };

      graph3DInstance = ForceGraph3D({
        controlType: 'orbit'
      })(container3d)
        .graphData(gData)
        .backgroundColor('#000000')
        .nodeThreeObject(node => {
          const group = new THREE.Group();
          const bgHex = node.colorHex || '#0284c7';

          // 計算合適的球體半徑 (Obsidian 典雅星系比例)
          let radius = 2.2;
          if (node.group === 'root') radius = 6.0;
          else if (node.group === 'category') radius = 4.2;
          else if (node.group === 'subtool') radius = 1.2;

          // 柔和霧面磨砂實心球體 (高粗糙度，無刺眼反光)
          const sphereGeo = new THREE.SphereGeometry(radius, 16, 16);
          const sphereMat = new THREE.MeshStandardMaterial({
            color: bgHex,
            roughness: 0.8,
            metalness: 0.05,
            transparent: false,
            opacity: 1.0
          });
          const sphereMesh = new THREE.Mesh(sphereGeo, sphereMat);
          group.add(sphereMesh);

          // 建立輕量 SpriteText
          if (typeof SpriteText !== 'undefined') {
            const label = node.label.replace('\\n', ' ');
            const txtColor = node.group === 'category' ? getContrastTextColorJS(bgHex) : '#ffffff';

            const sprite = new SpriteText(label);
            sprite.fontFace = '-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif';
            sprite.fontWeight = 'normal';

            if (node.group === 'root') {
              sprite.textHeight = 8.5;
              sprite.backgroundColor = '#0284c7';
              sprite.textColor = '#ffffff';
              sprite.strokeWidth = 0;
            } else if (node.group === 'category') {
              sprite.textHeight = 7.0;
              sprite.backgroundColor = bgHex;
              sprite.textColor = txtColor;
              sprite.strokeWidth = 0;
            } else if (node.group === 'tool') {
              sprite.textHeight = 3.8;
              sprite.backgroundColor = 'rgba(10, 10, 10, 0.9)';
              sprite.strokeWidth = 0;
              sprite.textColor = '#e2e8f0';
            } else {
              sprite.textHeight = 2.8;
              sprite.backgroundColor = 'rgba(10, 10, 10, 0.85)';
              sprite.strokeWidth = 0;
              sprite.textColor = '#94a3b8';
            }

            sprite.padding = 1.8;
            sprite.borderRadius = 3;
            sprite.position.set(0, radius + 4, 0);
            group.add(sprite);
          }

          return group;
        })
        .nodeThreeObjectExtend(false)
        .nodeLabel(node => {
          const name = node.label.replace('\\n', ' ');
          let html = '<div style="background:rgba(12,12,12,0.96); padding:10px 14px; border-radius:6px; border:1px solid #222222; border-left:3px solid ' + (node.colorHex || '#0284c7') + '; color:#f1f5f9; font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif; font-size:12px; min-width:180px; box-shadow:0 8px 28px rgba(0,0,0,0.9);">';
          html += '<div style="font-weight:700; font-size:13px; color:#ffffff; margin-bottom:3px;">' + name + '</div>';
          
          if (node.group === 'tool' && node.toolData) {
            const t = node.toolData;
            if (t.description) {
              html += '<div style="color:#cbd5e1; font-size:11px; font-weight:400; margin-bottom:3px;">' + t.description.slice(0, 60) + (t.description.length > 60 ? '...' : '') + '</div>';
            }
            if (t.useCase) {
              html += '<div style="color:#34d399; font-size:11px; font-weight:600; margin-bottom:2px;">★ ' + t.useCase + '</div>';
            }
            if (t.advantages && t.advantages.length > 0) {
              html += '<div style="color:#38bdf8; font-size:11px; font-weight:600;">◆ ' + t.advantages[0] + '</div>';
            }
          } else if (node.group === 'category') {
            html += '<div style="color:#cbd5e1; font-size:11px; font-weight:500;">' + (node.toolCount || 0) + ' tools</div>';
          }
          
          html += '<div style="color:#64748b; font-size:9px; margin-top:4px; text-transform:uppercase; font-family:monospace; font-weight:700;">' + node.group + '</div>';
          html += '</div>';
          return html;
        })
        .linkColor(link => link.colorHex || '#0284c7')
        .linkOpacity(0.35)
        .linkWidth(link => link.width || 0.8)
        .linkDirectionalParticles(link => link.isDashed ? 2 : 0)
        .linkDirectionalParticleSpeed(0.004)
        .linkDirectionalParticleWidth(1.4)
        .onNodeClick(node => {
          const distance = 130;
          const distRatio = 1 + distance / Math.hypot(node.x || 1, node.y || 1, node.z || 1);
          graph3DInstance.cameraPosition(
            { x: (node.x || 0) * distRatio, y: (node.y || 0) * distRatio, z: (node.z || 0) * distRatio },
            node,
            1000
          );
          showPanel(node);
        });

      // 3D 平移功能
      setTimeout(() => {
        if (graph3DInstance.controls) {
          const controls = graph3DInstance.controls();
          if (controls) {
            controls.enablePan = true;
            controls.panSpeed = 1.2;
            controls.screenSpacePanning = true;
            controls.enableRotate = true;
            controls.rotateSpeed = 1.0;

            controls.minDistance = 0.5; // 支援超近距離 3D 放大 (Deep Zoom In)
            controls.maxDistance = 20000;
            controls.mouseButtons = {
              LEFT: 0,
              MIDDLE: 2,
              RIGHT: 2
            };
          }
        }
      }, 100);

      container3d.addEventListener('contextmenu', e => e.preventDefault());

      let isShiftPanning = false;
      let lastPanX = 0, lastPanY = 0;

      container3d.addEventListener('pointerdown', function (e) {
        if (e.button === 0 && e.shiftKey) {
          isShiftPanning = true;
          lastPanX = e.clientX;
          lastPanY = e.clientY;
          try { container3d.setPointerCapture(e.pointerId); } catch (err) { }
          e.stopPropagation();
        }
      }, true);

      container3d.addEventListener('pointermove', function (e) {
        if (isShiftPanning && (e.buttons & 1)) {
          const dx = e.clientX - lastPanX;
          const dy = e.clientY - lastPanY;
          lastPanX = e.clientX;
          lastPanY = e.clientY;

          if (graph3DInstance) {
            const camera = graph3DInstance.camera();
            const controls = graph3DInstance.controls();
            if (camera && controls && controls.target) {
              const Vector3Class = controls.target.constructor;
              const target = controls.target;

              const distance = camera.position.distanceTo(target);
              const fovRad = (camera.fov || 45) * Math.PI / 180;
              const factor = (distance * Math.tan(fovRad / 2) * 2) / (container3d.clientHeight || 1080);

              const vLeft = new Vector3Class(-dx * factor, 0, 0).applyQuaternion(camera.quaternion);
              const vUp = new Vector3Class(0, dy * factor, 0).applyQuaternion(camera.quaternion);

              const panOffset = new Vector3Class().addVectors(vLeft, vUp);

              camera.position.add(panOffset);
              target.add(panOffset);
              controls.update();
            }
          }
          e.stopPropagation();
        }
      }, true);

      container3d.addEventListener('pointerup', function (e) {
        if (isShiftPanning) {
          isShiftPanning = false;
          try { container3d.releasePointerCapture(e.pointerId); } catch (err) { }
          e.stopPropagation();
        }
      }, true);

      // Pivot Zoom (支援超深層放大檢視)
      container3d.addEventListener('wheel', function (event) {
        if (!graph3DInstance) return;
        const camera = graph3DInstance.camera();
        const controls = graph3DInstance.controls();
        if (!camera || !controls || !controls.target) return;

        event.preventDefault();
        event.stopPropagation();

        const Vector3Class = controls.target.constructor;
        if (!Vector3Class) return;

        const rect = container3d.getBoundingClientRect();
        const ndcX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        const ndcY = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        const dir = new Vector3Class(ndcX, ndcY, -1).unproject(camera);
        dir.sub(camera.position).normalize();

        const targetPoint = controls.target.clone();
        const lookDir = new Vector3Class().subVectors(targetPoint, camera.position).normalize();
        const d = targetPoint.dot(lookDir);
        const t = (d - camera.position.dot(lookDir)) / dir.dot(lookDir);
        const pivot = new Vector3Class().copy(camera.position).addScaledVector(dir, t);

        const zoomStep = event.deltaY < 0 ? 0.84 : 1.19;

        const camToPivot = new Vector3Class().subVectors(camera.position, pivot);
        const currentDist = camToPivot.length();
        const newDist = Math.max(currentDist * zoomStep, 0.5);
        camToPivot.normalize().multiplyScalar(newDist);
        const newCamPos = new Vector3Class().addVectors(pivot, camToPivot);

        const targetToPivot = new Vector3Class().subVectors(targetPoint, pivot);
        const targetDist = targetToPivot.length();
        const newTargetDist = targetDist * zoomStep;
        targetToPivot.normalize().multiplyScalar(newTargetDist);
        const newTarget = new Vector3Class().addVectors(pivot, targetToPivot);

        const finalDist = new Vector3Class().subVectors(newCamPos, newTarget).length();
        if (finalDist < 0.5 || finalDist > 20000) return;

        camera.position.copy(newCamPos);
        controls.target.copy(newTarget);
        controls.update();
      }, { passive: false });

      window.graph3DInstance = graph3DInstance;
      graph3DInstance.cameraPosition({ x: 0, y: 0, z: 460 });
    }

    // 切換 2D / 3D 視角
    function toggle3DMode() {
      is3DMode = !is3DMode;
      const btn = document.getElementById('viewToggleBtn');
      const c2d = document.getElementById('network2d');
      const c3d = document.getElementById('network3d');

      if (is3DMode) {
        c2d.style.display = 'none';
        c3d.style.display = 'block';
        btn.innerHTML = '<span>📄 切換至 2D 平面視角</span>';
        init3DGraph();
      } else {
        c3d.style.display = 'none';
        c2d.style.display = 'block';
        btn.innerHTML = '<span>🌌 切換至 3D 空間視角</span>';
      }
    }

    // 點擊圖例 (Legend Click)
    function filterCategory(catName, element) {
      const isAlreadyActive = element && element.classList.contains('active');
      document.querySelectorAll('.legend-item').forEach(el => el.classList.remove('active'));

      if (isAlreadyActive) {
        if (is3DMode && graph3DInstance) {
          graph3DInstance.cameraPosition({ x: 0, y: 0, z: 460 }, { x: 0, y: 0, z: 0 }, 1000);
        } else {
          network2d.unselectAll();
          network2d.fit({ animation: { duration: 600 } });
        }
        closePanel();
        return;
      }

      if (element) element.classList.add('active');

      if (is3DMode && graph3DInstance) {
        const catNode = graph3DInstance.graphData().nodes.find(n => n.group === 'category' && n.label === catName);
        if (catNode) {
          const distRatio = 1.4;
          graph3DInstance.cameraPosition(
            { x: (catNode.x || 0) * distRatio, y: (catNode.y || 0) * distRatio, z: (catNode.z || 150) * distRatio },
            catNode,
            1200
          );
          showPanel(catNode);
        }
      } else {
        const allNodes = data2d.nodes.get();
        const targetNodes = allNodes.filter(n => n.categoryName === catName || (n.group === 'category' && n.label === catName));
        const targetIds = targetNodes.map(n => n.id);
        const catNode = allNodes.find(n => n.group === 'category' && n.label === catName);

        if (targetIds.length > 0) {
          network2d.selectNodes(targetIds);
          if (catNode) {
            network2d.focus(catNode.id, { scale: 1.2, animation: { duration: 700 } });
            showPanel(catNode);
          }
        }
      }
    }

    // 2D Node click handler
    network2d.on('click', function (params) {
      if (params.nodes.length > 0) {
        const nodeId = params.nodes[0];
        const node = data2d.nodes.get(nodeId);
        if (node) showPanel(node);
      } else {
        closePanel();
        document.querySelectorAll('.legend-item').forEach(el => el.classList.remove('active'));
      }
    });

    // 動態富文本面板渲染
    function showPanel(node) {
      const panel = document.getElementById('detailPanel');
      const content = document.getElementById('panelContent');
      
      let descHtml = '';
      
      if (node.group === 'root') {
        descHtml = '<div style="font-size:12px; line-height:1.5; color:#cbd5e1; font-weight:400; margin-bottom:6px;">' +
          '<b>Tool-Calling</b> 全自動 AI Agent 工具調用基礎設施，收錄 <b>' + node.totalTools + '</b> 個 AI 工具。' +
          '</div>' +
          '<div style="font-size:11px; color:#64748b; font-family:monospace;">' +
          '最後更新: ' + new Date(node.lastUpdated).toLocaleDateString() +
          '</div>';
      } else if (node.group === 'category') {
        const catTools = nodesData.filter(n => n.group === 'tool' && n.categoryName === node.categoryName);
        const sampleTools = node.topTools ? node.topTools.map(t => '<span style="display:inline-block; padding:1px 5px; background:#161616; border:1px solid #262626; color:#94a3b8; font-weight:500; border-radius:3px; font-size:10px; margin:2px;">' + t + '</span>').join(' ') : '';
        const langs = node.languages && node.languages.length ? node.languages.join(', ') : '無特定語言標示';

        descHtml = '<div style="font-size:12px; line-height:1.5; color:#cbd5e1; font-weight:400; margin-bottom:6px;">' +
          (node.description || '') +
          '</div>' +
          '<div style="font-size:11px; color:#38bdf8; margin-top:4px; margin-bottom:3px; font-weight:600;">' +
          '📊 包含工具: <b>' + (node.toolCount || catTools.length) + '</b> 個' +
          '</div>' +
          '<div style="font-size:11px; color:#64748b; margin-bottom:6px;">' +
          '💻 語言: <b>' + langs + '</b>' +
          '</div>' +
          '<div style="margin-top:4px;">' +
          sampleTools +
          '</div>';
      } else if (node.group === 'tool') {
        const t = node.toolData || {};
        descHtml = '<div style="font-size:12px; line-height:1.5; color:#cbd5e1; font-weight:400; margin-bottom:6px;">' +
          (t.description || '無詳細描述') +
          '</div>' +
          (t.useCase ? '<div style="font-size:11px; color:#34d399; margin-bottom:3px; line-height:1.4; font-weight:600;"><b>★ 推薦場景:</b> ' + t.useCase + '</div>' : '') +
          (t.advantages && t.advantages.length ? '<div style="font-size:11px; color:#38bdf8; margin-bottom:3px; line-height:1.4; font-weight:600;"><b>◆ 關鍵優勢:</b> ' + t.advantages.join(', ') + '</div>' : '') +
          (t.negativeConstraints && t.negativeConstraints.length ? '<div style="font-size:11px; color:#f87171; margin-bottom:3px; line-height:1.4; font-weight:600;"><b>✕ 禁用場景:</b> ' + t.negativeConstraints.join(', ') + '</div>' : '') +
          (t.language ? '<div style="font-size:10px; color:#64748b; margin-top:4px;">語言: ' + t.language + '</div>' : '');
      } else if (node.group === 'subtool') {
        descHtml = '<div style="font-size:12px; line-height:1.5; color:#cbd5e1; font-weight:400; margin-bottom:4px;">' +
          '主工具: <b style="color:#38bdf8;">' + (node.parentToolName || '主工具') + '</b>' +
          '</div>' +
          '<div style="font-size:11px; color:#94a3b8; line-height:1.4;">' +
          node.subDesc +
          '</div>';
      }

      content.innerHTML = '<div class="panel-title">' + node.label.replace(/\\n/g, ' ') + '</div>' +
        '<div class="panel-tag">' + node.group.toUpperCase() + '</div>' +
        descHtml;
      panel.classList.add('active');
    }

    function closePanel() {
      document.getElementById('detailPanel').classList.remove('active');
    }

    // Search filter
    document.getElementById('searchInput').addEventListener('input', function(e) {
      const term = e.target.value.toLowerCase().trim();
      if (!term) return;

      if (is3DMode && graph3DInstance) {
        const found = graph3DInstance.graphData().nodes.find(n => n.label.toLowerCase().includes(term));
        if (found) {
          graph3DInstance.cameraPosition(
            { x: (found.x || 0) + 70, y: (found.y || 0) + 70, z: (found.z || 0) + 70 },
            found,
            1000
          );
          showPanel(found);
        }
      } else {
        const found = data2d.nodes.get().find(n => n.label.toLowerCase().includes(term));
        if (found) {
          network2d.focus(found.id, { scale: 1.2, animation: { duration: 700 } });
          network2d.selectNodes([found.id]);
          showPanel(found);
        }
      }
    });
  </script>
</body>
</html>`;

  const docsDir = path.join(__dirname, '../docs');
  if (!fs.existsSync(docsDir)) {
    fs.mkdirSync(docsDir, { recursive: true });
  }
  fs.writeFileSync(path.join(docsDir, 'knowledge-graph.html'), htmlContent, 'utf8');

  const distDir = path.join(__dirname, '../dist');
  if (fs.existsSync(distDir)) {
    fs.writeFileSync(path.join(distDir, 'knowledge-graph.html'), htmlContent, 'utf8');
  }

  console.log(`[Auto-Sync] Knowledge graph updated for ${registry.tools.length} tools!`);
}

// 支援命令列獨立執行
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  generateKnowledgeGraph();
}
