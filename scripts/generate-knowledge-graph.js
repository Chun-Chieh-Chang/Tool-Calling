import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// OLED 純黑與高對比霓虹實心調色盤 (True Pure OLED Black & Solid Neon Industrial Palette)
const baseCategoryColors = {
  "AI 框架": "#38bdf8",        // 電光天藍 (Sky 400)
  "AI 代理": "#22d3ee",        // 精密青藍 (Cyan 400)
  "開發工具": "#cbd5e1",      // 白銀石板 (Slate 300)
  "UI/UX設計": "#c084fc",     // 霓虹紫羅蘭 (Purple 400)
  "多媒體生成": "#f472b6",    // 賽博洋紅 (Pink 400)
  "影片": "#f87171",          // 激光緋紅 (Red 400)
  "音訊": "#a3e635",          // 聲譜萊姆綠 (Lime 400)
  "瀏覽器自動化": "#60a5fa",  // 皇家寶藍 (Blue 400)
  "安全性": "#ef4444",        // 安全警示紅 (Red 500)
  "測試與自動化": "#38bdf8",  // 測試天青 (Sky 400)
  "API 整合": "#2dd4bf",      // 介面松石綠 (Teal 400)
  "學習資源": "#fbbf24",      // 知識金黃 (Amber 400)
  "文件生產力": "#34d399",    // 生產力翡翠綠 (Emerald 400)
  "資料庫": "#10b981",        // 資料庫綠 (Emerald 500)
  "知識管理": "#0ea5e9",      // 知識天藍 (Sky 500)
  "研究": "#a855f7",          // 深度研究紫 (Purple 500)
  "基礎設施": "#94a3b8",      // 雲端白灰 (Slate 400)
  "行銷": "#fb923c",          // 行銷光橙 (Orange 400)
  "數據分析": "#14b8a6",      // 數據分析綠 (Teal 500)
  "3D工程繪圖": "#818cf8",    // 3D 幾何靛藍 (Indigo 400)
  "圖標與視覺資源": "#d8b4fe" // 視覺資源紫 (Purple 300)
};

// 根據背景 Hex 顏色計算最優文字對比色 (黑白文字演算法)
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
  return `hsl(${Math.floor(hue)}, 85%, 65%)`;
}

/**
 * 全自動動態數據驅動 2D / 3D 雙引擎知識圖譜生成器 (100% True Pure OLED Black + Solid Filled Nodes + Fine Regular Text)
 */
export function generateKnowledgeGraph(registryInput = null) {
  let registry = registryInput;
  if (!registry) {
    const registryPath = path.join(__dirname, '../registry/tools.json');
    registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  }

  const nodes = [];
  const edges = [];

  // 1. Root Node (品牌鈷藍實心核心節點 - 細外框、標準字重)
  nodes.push({
    id: "root",
    label: `Tool-Calling\n(${registry.tools.length} AI Tools)`,
    group: "root",
    lastUpdated: registry.lastUpdated || new Date().toISOString(),
    totalTools: registry.tools.length,
    shape: "ellipse",
    color: {
      background: "#0284c7",
      border: "#ffffff",
      highlight: { background: "#38bdf8", border: "#ffffff" },
      hover: { background: "#38bdf8", border: "#ffffff" }
    },
    colorHex: "#0284c7",
    font: { color: "#ffffff", size: 18, face: "-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif", bold: false, strokeWidth: 0.5, strokeColor: "#000000" },
    val: 40
  });

  // 2. Category Nodes (實心高飽和分類節點 - 細外框、標準字重)
  const categories = [...new Set(registry.tools.map(t => t.category))].filter(Boolean);
  
  categories.forEach((cat, idx) => {
    const catId = `cat_${idx}`;
    const colorHex = getCategoryColor(cat, idx);
    const textColor = getContrastTextColor(colorHex);
    
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
      shape: "box",
      margin: 12,
      color: {
        background: colorHex,
        border: "#ffffff",
        highlight: { background: "#ffffff", border: colorHex },
        hover: { background: "#ffffff", border: colorHex }
      },
      colorHex: colorHex,
      textColor: textColor,
      font: {
        color: textColor,
        size: 14,
        face: "-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif",
        bold: false,
        strokeWidth: 0.5,
        strokeColor: '#000000'
      },
      val: 24
    });

    edges.push({
      from: "root",
      to: catId,
      source: "root",
      target: catId,
      color: { color: "#38bdf8", highlight: "#ffffff", opacity: 0.85 },
      colorHex: "#38bdf8",
      width: 2,
      isDashed: false
    });

    // 3. Tools in this Category (實心工具節點 - 細微外框線、標準無加粗字體)
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
        size: 9,
        color: {
          background: colorHex,          // 實心節點底色 (Solid filled)
          border: "#ffffff",             // 純白細外框
          highlight: { background: "#ffffff", border: colorHex },
          hover: { background: "#ffffff", border: colorHex }
        },
        colorHex: colorHex,
        font: {
          color: "#f8fafc",
          size: 12,
          face: "-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif",
          bold: false,                   // 文字不加粗 (Regular weight)
          strokeWidth: 0.6,              // 細化文字外框線 (Fine subtle outline)
          strokeColor: "#000000"
        },
        title: `<b>${tool.name}</b><br/>分類: ${tool.category}<br/>描述: ${tool.description}<br/>⭐ 場景: ${tool.useCase || '無'}`,
        val: 11
      });

      edges.push({
        from: catId,
        to: toolNodeId,
        source: catId,
        target: toolNodeId,
        color: { color: colorHex, highlight: "#ffffff", opacity: 0.75 },
        colorHex: colorHex,
        width: 1.2,
        length: 90,
        isDashed: false
      });

      // 4. SubTools / Capabilities (實心微技能節點 - 細微外框線、標準字體)
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
            shape: "diamond",
            size: 5,
            color: {
              background: "#94a3b8",      // 實心石板銀灰
              border: "#ffffff",
              highlight: { background: "#38bdf8", border: "#ffffff" },
              hover: { background: "#38bdf8", border: "#ffffff" }
            },
            colorHex: "#94a3b8",
            font: {
              color: "#cbd5e1",
              size: 10,
              face: "-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif",
              bold: false,               // 文字不加粗
              strokeWidth: 0.5,          // 細化文字外框線
              strokeColor: "#000000"
            },
            val: 5
          });

          edges.push({
            from: toolNodeId,
            to: subId,
            source: toolNodeId,
            target: subId,
            color: { color: "#64748b", highlight: "#38bdf8", opacity: 0.65 },
            colorHex: "#64748b",
            width: 1,
            length: 40,
            dashes: true,
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
      --bg-panel: rgba(0, 0, 0, 0.94);
      --bg-panel-solid: #000000;
      --surface-hover: rgba(56, 189, 248, 0.15);
      --surface-inset: #111111;
      --text-primary: #ffffff;
      --text-secondary: #e2e8f0;
      --text-muted: #94a3b8;
      --brand-cobalt: #0284c7;
      --brand-cobalt-hover: #0369a1;
      --brand-cobalt-light: rgba(2, 132, 199, 0.25);
      --brand-cyan: #38bdf8;
      --border-precision: 1px solid #222222;
      --border-subtle: 1px solid #1a1a1a;
      --shadow-micro: 0 4px 20px rgba(0, 0, 0, 0.9);
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
      font-size: 14px;
      line-height: 1.5;
    }

    /* 頂部純黑 OLED 標頭 (品牌鈷藍 5px 飾條 + 脈衝呼吸燈) */
    #header {
      position: absolute;
      top: 16px;
      left: 16px;
      z-index: 10;
      background: var(--bg-panel);
      backdrop-filter: blur(16px);
      border: 1px solid #262626;
      border-left: 5px solid var(--brand-cobalt);
      border-radius: 6px;
      padding: 14px 20px;
      box-shadow: var(--shadow-micro);
    }

    @keyframes pulseGreen {
      0% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7); }
      70% { box-shadow: 0 0 0 6px rgba(16, 185, 129, 0); }
      100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
    }

    .header-status-row {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 6px;
    }

    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background-color: var(--status-success);
      display: inline-block;
      animation: pulseGreen 1.8s infinite cubic-bezier(0.4, 0, 0.6, 1);
    }

    .status-text {
      font-family: "JetBrains Mono", Consolas, monospace;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.06em;
      color: var(--text-muted);
      text-transform: uppercase;
    }

    h1 {
      font-size: 16px;
      font-weight: 800;
      color: var(--text-primary);
      display: flex;
      align-items: center;
      gap: 8px;
    }

    p.subtitle {
      font-size: 12px;
      color: var(--text-secondary);
      font-weight: 500;
      margin-top: 2px;
    }

    #controls {
      position: absolute;
      top: 16px;
      right: 16px;
      z-index: 10;
      display: flex;
      gap: 10px;
      align-items: center;
    }

    .mode-btn {
      background: var(--brand-cobalt);
      border: 1px solid var(--brand-cyan);
      border-radius: 6px;
      color: #ffffff;
      padding: 8px 16px;
      font-size: 13px;
      font-weight: 700;
      cursor: pointer;
      box-shadow: 0 0 15px rgba(2, 132, 199, 0.4);
      transition: var(--transition-fast);
      display: flex;
      align-items: center;
      gap: 6px;
      min-height: 40px;
    }

    .mode-btn:hover {
      background: var(--brand-cobalt-hover);
      border-color: #ffffff;
      box-shadow: 0 0 20px rgba(56, 189, 248, 0.6);
    }

    .mode-btn:active {
      transform: scale(0.98);
    }

    .mode-btn * {
      pointer-events: none;
    }

    .search-box {
      background: #000000;
      border: 1px solid #333333;
      border-radius: 6px;
      padding: 8px 14px;
      color: #ffffff;
      font-size: 13px;
      font-weight: 600;
      outline: none;
      width: 260px;
      min-height: 40px;
      transition: var(--transition-fast);
    }

    .search-box::placeholder {
      color: var(--text-muted);
    }

    .search-box:focus {
      border-color: var(--brand-cyan);
      box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.3);
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

    /* 右側中間：純黑 OLED 分類圖例面板 */
    #legendPanel {
      position: absolute;
      top: 50%;
      right: 16px;
      transform: translateY(-50%);
      z-index: 15;
      background: var(--bg-panel);
      backdrop-filter: blur(16px);
      border: 1px solid #262626;
      border-radius: 6px;
      padding: 14px 16px;
      max-height: calc(100vh - 120px);
      width: 250px;
      overflow-y: auto;
      box-shadow: var(--shadow-micro);
    }

    .legend-header {
      font-size: 12px;
      font-weight: 800;
      color: var(--text-primary);
      margin-bottom: 8px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .legend-grid {
      display: flex;
      flex-direction: column;
      gap: 3px;
    }

    .legend-item {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      font-weight: 600;
      color: var(--text-secondary);
      padding: 5px 8px;
      border-radius: 4px;
      cursor: pointer;
      transition: var(--transition-fast);
      user-select: none;
      border: 1px solid transparent;
    }

    .legend-item:hover {
      background: var(--surface-hover);
      border-color: rgba(56, 189, 248, 0.3);
      color: var(--text-primary);
    }

    .legend-item.active {
      background: var(--brand-cobalt-light);
      border-color: var(--brand-cyan);
      color: var(--brand-cyan);
      font-weight: 800;
    }

    .legend-badge {
      width: 10px;
      height: 10px;
      border-radius: 2px;
      display: inline-block;
      flex-shrink: 0;
    }

    /* 左下角：富文本詳細抽屜面板 (純黑高對比面板) */
    #detailPanel {
      position: absolute;
      bottom: 20px;
      left: 20px;
      z-index: 20;
      width: 380px;
      background: rgba(0, 0, 0, 0.98);
      backdrop-filter: blur(20px);
      border: 1px solid var(--brand-cobalt);
      border-radius: 6px;
      padding: 18px;
      display: none;
      box-shadow: 0 12px 40px rgba(0, 0, 0, 0.95);
      transform: translateY(8px);
      transition: var(--transition-fast);
    }

    #detailPanel.active {
      display: block;
      transform: translateY(0);
    }

    .panel-title {
      font-size: 16px;
      font-weight: 800;
      color: var(--brand-cyan);
      margin-bottom: 6px;
    }

    .panel-tag {
      display: inline-block;
      padding: 2px 6px;
      background: var(--brand-cobalt-light);
      color: var(--brand-cyan);
      border: 1px solid rgba(56, 189, 248, 0.4);
      border-radius: 4px;
      font-family: "JetBrains Mono", Consolas, monospace;
      font-size: 10px;
      font-weight: 800;
      margin-bottom: 10px;
      text-transform: uppercase;
    }

    .close-btn {
      position: absolute;
      top: 12px;
      right: 14px;
      background: none;
      border: none;
      color: var(--text-muted);
      font-size: 18px;
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
      <span class="status-text">SYSTEM ONLINE // KNOWLEDGE GRAPH</span>
    </div>
    <h1>🌐 Tool-Calling 知識圖譜儀表板</h1>
    <p class="subtitle">展示 ${registry.tools.length} 個 AI 工具 (左鍵旋轉 | 右鍵/中鍵/Shift+左鍵平移 | 滾輪對焦)</p>
  </div>

  <div id="controls">
    <button id="viewToggleBtn" class="mode-btn" onclick="toggle3DMode()">
      <span>🌌 切換至 3D 空間視角</span>
    </button>
    <input type="text" id="searchInput" class="search-box" placeholder="🔍 檢索圖譜工具或領域分類..." />
  </div>

  <!-- 右側中間：分類色彩與連線型態圖例面板 -->
  <div id="legendPanel">
    <div class="legend-header">
      <span>領域分類圖例</span>
      <span style="font-size:11px; color:var(--text-muted); font-weight:700;">(${categories.length} 類)</span>
    </div>
    <div class="legend-grid">
      ${legendItemsHtml}
    </div>

    <!-- 🔗 連線型態圖例說明 -->
    <div class="legend-header" style="margin-top: 12px; border-top: 1px solid #1a1a1a; padding-top: 8px;">
      <span>連線類型</span>
    </div>
    <div class="legend-grid">
      <div class="legend-item" style="cursor:default;">
        <span style="display:inline-block; width:14px; height:2px; background:var(--brand-cyan);"></span>
        <span><b>實線</b>：主分類歸屬網絡</span>
      </div>
      <div class="legend-item" style="cursor:default;">
        <span style="display:inline-block; width:14px; height:0; border-top:2px dashed #94a3b8;"></span>
        <span><b>虛線</b>：拆解微技能/能力</span>
      </div>
    </div>

    <!-- 🎮 3D 操控技巧說明 -->
    <div class="legend-header" style="margin-top: 12px; border-top: 1px solid #1a1a1a; padding-top: 8px;">
      <span>空間操控</span>
    </div>
    <div style="font-size: 11px; color: var(--text-secondary); line-height: 1.4; padding: 2px; font-weight: 500;">
      • <b>旋轉</b>: 左鍵拖曳<br/>
      • <b>平移</b>: 右鍵 / 中鍵 / Shift+左鍵<br/>
      • <b>縮放</b>: 滑鼠滾輪
    </div>
  </div>

  <!-- 左下角：詳細抽屜面板 -->
  <div id="detailPanel">
    <button class="close-btn" onclick="closePanel()">×</button>
    <div id="panelContent"></div>
  </div>

  <!-- 2D 平面網絡容器 -->
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

    // ─── 1. 初始化 2D Vis.js Network ──────────────────────────────────────────
    const container2d = document.getElementById('network2d');
    const data2d = {
      nodes: new vis.DataSet(nodesData),
      edges: new vis.DataSet(edgesData)
    };

    const options2d = {
      nodes: {
        font: {
          face: '-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif',
          strokeWidth: 0.6,
          strokeColor: '#000000'
        },
        borderWidth: 1.2,
        shadow: false,
        opacity: 1
      },
      edges: {
        smooth: {
          type: 'continuous',
          roundness: 0.2
        }
      },
      layout: { improvedLayout: false },
      physics: {
        enabled: true,
        barnesHut: {
          gravitationalConstant: -18000,
          centralGravity: 0.03,
          springLength: 110,
          springConstant: 0.02,
          damping: 0.4,
          avoidOverlap: 0.9
        },
        maxVelocity: 45,
        minVelocity: 0.2,
        solver: 'barnesHut',
        stabilization: { enabled: true, iterations: 300 }
      },
      interaction: { hover: true, zoomView: true }
    };

    const network2d = new vis.Network(container2d, data2d, options2d);
    
    // -- 2D Hover Tooltip (純黑微陰影樣式) --
    function updateTooltip2d(node) {
      let tooltipEl = document.getElementById('graph-tooltip-2d');
      if (!tooltipEl) {
        tooltipEl = document.createElement('div');
        tooltipEl.id = 'graph-tooltip-2d';
        tooltipEl.style.cssText = 'position:absolute; pointer-events:none; z-index:1000; transition: opacity 0.15s;';
        document.body.appendChild(tooltipEl);
      }
      
      if (!node) {
        tooltipEl.style.opacity = '0';
        setTimeout(() => tooltipEl.remove(), 200);
        return;
      }
      
      let html = '<div style="background:rgba(0,0,0,0.98); padding:10px 14px; border-radius:6px; border:1px solid #0284c7; color:#ffffff; font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif; font-size:13px; min-width:200px; max-width:320px; box-shadow:0 8px 30px rgba(0,0,0,0.95);">';
      html += '<div style="font-weight:800; font-size:14px; color:#38bdf8; margin-bottom:4px;">' + node.label.replace(/\\n/g, ' ') + '</div>';
      
      if (node.categoryName) {
        html += '<div style="color:#94a3b8; font-size:11px; margin-bottom:6px; font-weight:700;">' + node.categoryName + '</div>';
      }
      
      if (node.toolData && node.group === 'tool') {
        const t = node.toolData;
        if (t.description) {
          html += '<div style="color:#cbd5e1; font-size:12px; font-weight:500; line-height:1.4; margin-bottom:6px;">' + t.description.slice(0, 80) + (t.description.length > 80 ? '...' : '') + '</div>';
        }
        if (t.useCase) {
          html += '<div style="color:#34d399; font-size:12px; font-weight:700; margin-bottom:4px;"><b>★ 場景:</b> ' + t.useCase.slice(0, 50) + (t.useCase.length > 50 ? '...' : '') + '</div>';
        }
        if (t.advantages && t.advantages.length > 0) {
          html += '<div style="color:#38bdf8; font-size:12px; font-weight:700;"><b>◆ 優勢:</b> ' + t.advantages.slice(0, 2).join(', ') + '</div>';
        }
        if (t.language) {
          html += '<div style="color:#94a3b8; font-size:11px; font-weight:600; margin-top:4px;">Language: ' + t.language + '</div>';
        }
      } else if (node.group === 'category') {
        html += '<div style="color:#cbd5e1; font-size:12px; font-weight:600;">收錄 <b>' + (node.toolCount || 0) + '</b> 個工具</div>';
      } else if (node.group === 'root') {
        html += '<div style="color:#cbd5e1; font-size:12px; font-weight:600;">共 <b>' + (node.totalTools || 0) + '</b> 個 AI 工具</div>';
      }
      
      html += '<div style="color:#64748b; font-size:10px; margin-top:6px; text-transform:uppercase; font-family:monospace; font-weight:700;">' + node.group + '</div>';
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
        setTimeout(() => tooltipEl.remove(), 200);
      }
    });

    container2d.addEventListener('mousemove', function(e) {
      const tooltipEl = document.getElementById('graph-tooltip-2d');
      if (tooltipEl) {
        let x = e.clientX + 15;
        let y = e.clientY - 10;
        const rect = tooltipEl.getBoundingClientRect();
        if (x + rect.width > window.innerWidth) x = e.clientX - rect.width - 15;
        if (y + rect.height > window.innerHeight) y = e.clientY - rect.height - 10;
        tooltipEl.style.left = x + 'px';
        tooltipEl.style.top = y + 'px';
      }
    });

    network2d.once('stabilizationIterationsDone', function() {
      network2d.setOptions({ physics: { enabled: false } });
      network2d.fit({ animation: { duration: 600, easingFunction: 'easeInOutQuad' } });
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

    // ─── 2. 初始化 3D Force-Directed Graph ──
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
        .nodeColor(node => node.colorHex || '#38bdf8')
        .nodeOpacity(1) // 100% 完全不透明實心球體 (Opaque Solid Spheres)
        .nodeResolution(20) // 高解析平滑球體
        .nodeVal(node => node.val || 10)
        .nodeThreeObject(node => {
          if (typeof SpriteText === 'undefined') return null;
          const label = node.label.replace('\\n', ' ');
          const bgHex = node.colorHex || '#38bdf8';
          const txtColor = node.group === 'category' ? getContrastTextColorJS(bgHex) : '#ffffff';

          const sprite = new SpriteText(label);
          sprite.fontFace = '-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif';
          sprite.fontWeight = 'normal'; // 文字不加粗 (Regular)

          if (node.group === 'root') {
            sprite.textHeight = 10;
            sprite.backgroundColor = '#0284c7';
            sprite.textColor = '#ffffff';
            sprite.strokeColor = '#ffffff';
            sprite.strokeWidth = 0.5; // 細化外框線
          } else if (node.group === 'category') {
            sprite.textHeight = 8;
            sprite.backgroundColor = bgHex;
            sprite.textColor = txtColor;
            sprite.strokeColor = '#000000';
            sprite.strokeWidth = 0.5; // 細化外框線
          } else if (node.group === 'tool') {
            sprite.textHeight = 4.6;
            sprite.backgroundColor = 'rgba(0, 0, 0, 0.92)';
            sprite.strokeColor = bgHex;
            sprite.strokeWidth = 0.6; // 細化外框線
            sprite.textColor = '#f8fafc';
          } else {
            sprite.textHeight = 3.2;
            sprite.backgroundColor = 'rgba(0, 0, 0, 0.88)';
            sprite.strokeColor = '#666666';
            sprite.strokeWidth = 0.5; // 細化外框線
            sprite.textColor = '#cbd5e1';
          }

          sprite.padding = 2.5;
          sprite.borderRadius = 3;
          sprite.position.set(0, (node.val || 10) / 3 + 8, 0);
          return sprite;
        })
        .nodeThreeObjectExtend(true)
        .nodeLabel(node => {
          const name = node.label.replace('\\n', ' ');
          let html = '<div style="background:rgba(0,0,0,0.98); padding:10px 14px; border-radius:6px; border:1px solid #0284c7; color:#ffffff; font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif; font-size:13px; min-width:180px; box-shadow:0 8px 30px rgba(0,0,0,0.95);">';
          html += '<div style="font-weight:800; font-size:13px; color:#38bdf8; margin-bottom:4px;">' + name + '</div>';
          
          if (node.group === 'tool' && node.toolData) {
            const t = node.toolData;
            if (t.description) {
              html += '<div style="color:#cbd5e1; font-size:12px; font-weight:500; margin-bottom:4px;">' + t.description.slice(0, 60) + (t.description.length > 60 ? '...' : '') + '</div>';
            }
            if (t.useCase) {
              html += '<div style="color:#34d399; font-size:12px; font-weight:700; margin-bottom:2px;">★ ' + t.useCase + '</div>';
            }
            if (t.advantages && t.advantages.length > 0) {
              html += '<div style="color:#38bdf8; font-size:12px; font-weight:700;">◆ ' + t.advantages[0] + '</div>';
            }
            if (t.negativeConstraints && t.negativeConstraints.length > 0) {
              html += '<div style="color:#f87171; font-size:12px; font-weight:700;">✕ ' + t.negativeConstraints[0] + '</div>';
            }
          } else if (node.group === 'category') {
            html += '<div style="color:#cbd5e1; font-size:12px; font-weight:600;">' + (node.toolCount || 0) + ' tools</div>';
          } else if (node.group === 'subtool') {
            html += '<div style="color:#94a3b8; font-size:12px; font-weight:600;">' + (node.subDesc || '') + '</div>';
          }
          
          html += '<div style="color:#64748b; font-size:10px; margin-top:4px; text-transform:uppercase; font-family:monospace; font-weight:700;">' + node.group + '</div>';
          html += '</div>';
          return html;
        })
        .linkColor(link => link.colorHex || '#38bdf8')
        .linkWidth(link => link.width || 1.2)
        .linkDirectionalParticles(link => link.isDashed ? 2 : 0)
        .linkDirectionalParticleSpeed(0.006)
        .linkDirectionalParticleWidth(2)
        .onNodeClick(node => {
          const distance = 140;
          const distRatio = 1 + distance / Math.hypot(node.x || 1, node.y || 1, node.z || 1);
          graph3DInstance.cameraPosition(
            { x: (node.x || 0) * distRatio, y: (node.y || 0) * distRatio, z: (node.z || 0) * distRatio },
            node,
            1200
          );
          showPanel(node);
        });

      // 顯式開啟 3D 右鍵、中鍵與 Shift+左鍵平移功能 (Explicit 3D Panning & Shift-Left Pan Algorithm)
      setTimeout(() => {
        if (graph3DInstance.controls) {
          const controls = graph3DInstance.controls();
          if (controls) {
            controls.enablePan = true;
            controls.panSpeed = 1.2;
            controls.screenSpacePanning = true;
            controls.enableRotate = true;
            controls.rotateSpeed = 1.0;

            controls.mouseButtons = {
              LEFT: 0,   // 普通左鍵: 旋轉 (ROTATE)
              MIDDLE: 2, // 滾輪中鍵: 平移 (PAN)
              RIGHT: 2   // 滑鼠右鍵: 平移 (PAN)
            };
          }
        }
      }, 100);

      // 防止右鍵跳出瀏覽器選單
      container3d.addEventListener('contextmenu', e => e.preventDefault());

      // Shift + 滑鼠左鍵拖曳 100% 視角平移
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

      // 以鼠標位置為原點的 3D 滾輪縮放演算法（Pivot Zoom）
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
        const newDist = Math.max(currentDist * zoomStep, 5);
        camToPivot.normalize().multiplyScalar(newDist);
        const newCamPos = new Vector3Class().addVectors(pivot, camToPivot);

        const targetToPivot = new Vector3Class().subVectors(targetPoint, pivot);
        const targetDist = targetToPivot.length();
        const newTargetDist = targetDist * zoomStep;
        targetToPivot.normalize().multiplyScalar(newTargetDist);
        const newTarget = new Vector3Class().addVectors(pivot, targetToPivot);

        const finalDist = new Vector3Class().subVectors(newCamPos, newTarget).length();
        if (finalDist < 5 || finalDist > 5000) return;

        camera.position.copy(newCamPos);
        controls.target.copy(newTarget);
        controls.update();
      }, { passive: false });

      window.graph3DInstance = graph3DInstance;
      graph3DInstance.cameraPosition({ x: 0, y: 0, z: 480 });
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
          graph3DInstance.cameraPosition({ x: 0, y: 0, z: 480 }, { x: 0, y: 0, z: 0 }, 1000);
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
            network2d.focus(catNode.id, { scale: 1.15, animation: { duration: 800 } });
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

    // 動態富文本面板渲染 (純黑 OLED 高對比面板)
    function showPanel(node) {
      const panel = document.getElementById('detailPanel');
      const content = document.getElementById('panelContent');
      
      let descHtml = '';
      
      if (node.group === 'root') {
        descHtml = '<div style="font-size:13px; line-height:1.5; color:#cbd5e1; font-weight:500; margin-bottom:8px;">' +
          '<b>Tool-Calling</b> 是全自動 AI Agent 工具調用基礎設施，全庫包含 <b>' + node.totalTools + '</b> 個 AI 工具與 <b>' + categories.length + '</b> 大分類，支援三層（L1/L2/L3）精態與語意檢索。' +
          '</div>' +
          '<div style="font-size:11px; color:#94a3b8; font-weight:600; font-family:monospace;">' +
          '🕒 資料庫最後更新: ' + new Date(node.lastUpdated).toLocaleString() +
          '</div>';
      } else if (node.group === 'category') {
        const catTools = nodesData.filter(n => n.group === 'tool' && n.categoryName === node.categoryName);
        const sampleTools = node.topTools ? node.topTools.map(t => '<span style="display:inline-block; padding:2px 6px; background:#111111; border:1px solid #333333; color:#38bdf8; font-weight:600; border-radius:4px; font-size:11px; margin:2px;">' + t + '</span>').join(' ') : '';
        const langs = node.languages && node.languages.length ? node.languages.join(', ') : '無特定語言標示';

        descHtml = '<div style="font-size:13px; line-height:1.5; color:#cbd5e1; font-weight:500; margin-bottom:8px;">' +
          (node.description || '') +
          '</div>' +
          '<div style="font-size:12px; color:#38bdf8; margin-top:6px; margin-bottom:4px; font-weight:700;">' +
          '📊 包含工具總數: <b>' + (node.toolCount || catTools.length) + '</b> 個' +
          '</div>' +
          '<div style="font-size:12px; color:#94a3b8; font-weight:600; margin-bottom:6px;">' +
          '💻 主要語言: <b>' + langs + '</b>' +
          '</div>' +
          '<div style="margin-top:6px;">' +
          sampleTools +
          '</div>';
      } else if (node.group === 'tool') {
        const t = node.toolData || {};
        descHtml = '<div style="font-size:13px; line-height:1.5; color:#cbd5e1; font-weight:500; margin-bottom:8px;">' +
          (t.description || '無詳細描述') +
          '</div>' +
          (t.useCase ? '<div style="font-size:12px; color:#34d399; margin-bottom:4px; line-height:1.4; font-weight:700;"><b>★ 推薦場景:</b> ' + t.useCase + '</div>' : '') +
          (t.advantages && t.advantages.length ? '<div style="font-size:12px; color:#38bdf8; margin-bottom:4px; line-height:1.4; font-weight:700;"><b>◆ 關鍵優勢:</b> ' + t.advantages.join(', ') + '</div>' : '') +
          (t.negativeConstraints && t.negativeConstraints.length ? '<div style="font-size:12px; color:#f87171; margin-bottom:4px; line-height:1.4; font-weight:700;"><b>✕ 禁用場景:</b> ' + t.negativeConstraints.join(', ') + '</div>' : '') +
          (t.language ? '<div style="font-size:11px; color:#94a3b8; font-weight:600; margin-top:6px;">開發語言: ' + t.language + '</div>' : '');
      } else if (node.group === 'subtool') {
        descHtml = '<div style="font-size:13px; line-height:1.5; color:#cbd5e1; font-weight:500; margin-bottom:6px;">' +
          '所屬工具: <b style="color:#38bdf8;">' + (node.parentToolName || '主工具') + '</b>' +
          '</div>' +
          '<div style="font-size:12px; color:#94a3b8; font-weight:600; line-height:1.4;">' +
          '微技能描述: ' + node.subDesc +
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
            { x: (found.x || 0) + 80, y: (found.y || 0) + 80, z: (found.z || 0) + 80 },
            found,
            1000
          );
          showPanel(found);
        }
      } else {
        const found = data2d.nodes.get().find(n => n.label.toLowerCase().includes(term));
        if (found) {
          network2d.focus(found.id, { scale: 1.2, animation: { duration: 800 } });
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
