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
 * 全自動動態數據驅動 2D / 3D 雙引擎知識圖譜生成器 (Obsidian Expansive Graph + Deep Zoom + Zero Border)
 */
export function generateKnowledgeGraph(registryInput = null) {
  let registry = registryInput;
  if (!registry) {
    const registryPath = path.join(__dirname, '../registry/tools.json');
    registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  }

  const nodes = [];
  const edges = [];

  // 1. Root Node (Obsidian 核心星系主節點 - 預設字體 16px、圓形比例恰當)
  nodes.push({
    id: "root",
    label: `Tool-Calling\n(${registry.tools.length} Tools)`,
    group: "root",
    lastUpdated: registry.lastUpdated || new Date().toISOString(),
    totalTools: registry.tools.length,
    shape: "dot",
    size: 16,
    borderWidth: 0,
    borderWidthSelected: 0,
    color: {
      background: "#0284c7",
      border: "#0284c7",
      highlight: { background: "#38bdf8", border: "#38bdf8" },
      hover: { background: "#38bdf8", border: "#38bdf8" }
    },
    colorHex: "#0284c7",
    font: { color: "#ffffff", size: 16, face: "-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif", bold: false, strokeWidth: 0, strokeColor: "transparent" },
    val: 36
  });

  // 2. Category Nodes (Obsidian 分類星團節點 - 預設字體 14px)
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
      size: 11,
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
        color: "#f1f5f9",
        size: 14,
        face: "-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif",
        bold: false,
        strokeWidth: 0,
        strokeColor: 'transparent'
      },
      val: 24
    });

    // Obsidian 主幹連線 (適中呼吸間距 130px)
    edges.push({
      from: "root",
      to: catId,
      source: "root",
      target: catId,
      color: { color: "rgba(2, 132, 199, 0.45)", highlight: "#38bdf8", hover: "#38bdf8", opacity: 0.45 },
      colorHex: "#0284c7",
      width: 1.1,
      length: 130,
      isDashed: false
    });

    // 3. Tools in this Category (Obsidian 筆記節點 - 預設初始畫面字體大小 13px，圓形比例 7.5px 恰當協調)
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
          url: tool.url,
          description: tool.description,
          category: tool.category,
          language: tool.language,
          stars: tool.stars,
          forks: tool.forks,
          useCase: tool.useCase,
          advantages: tool.advantages || [],
          negativeConstraints: tool.negativeConstraints || [],
          install: tool.install,
          capabilities: tool.capabilities || [],
          subTools: tool.subTools || []
        },
        shape: "dot",
        size: 7.5,
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
          size: 13, // 預設初始畫面字體大小：13px
          face: "-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif",
          bold: false,
          strokeWidth: 0,
          strokeColor: "transparent"
        },
        title: `<b>${tool.name}</b><br/>分類: ${tool.category}<br/>描述: ${tool.description}<br/>⭐ 場景: ${tool.useCase || '無'}`,
        val: 10
      });

      // Obsidian 內容分支連線
      edges.push({
        from: catId,
        to: toolNodeId,
        source: catId,
        target: toolNodeId,
        color: { color: "rgba(255, 255, 255, 0.15)", highlight: "#38bdf8", hover: "#38bdf8", opacity: 0.25 },
        colorHex: colorHex,
        width: 0.7,
        length: 70,
        isDashed: false
      });

      // 4. SubTools / Capabilities (Obsidian 微原子節點 - 預設字體 11px)
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
            size: 4.5,
            borderWidth: 0,
            borderWidthSelected: 0,
            color: {
              background: "#64748b",
              border: "#64748b",
              highlight: { background: "#0284c7", border: "#0284c7" },
              hover: { background: "#0284c7", border: "#0284c7" }
            },
            colorHex: "#64748b",
            font: {
              color: "#94a3b8",
              size: 11,
              face: "-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif",
              bold: false,
              strokeWidth: 0,
              strokeColor: "transparent"
            },
            val: 5
          });

          edges.push({
            from: toolNodeId,
            to: subId,
            source: toolNodeId,
            target: subId,
            color: { color: "rgba(255, 255, 255, 0.1)", highlight: "#0284c7", hover: "#0284c7", opacity: 0.2 },
            colorHex: "#64748b",
            width: 0.5,
            length: 32,
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

    /* 左下角：Obsidian 富文本詳細抽屜面板 (極致細節呈現) */
    #detailPanel {
      position: absolute;
      bottom: 18px;
      left: 18px;
      z-index: 20;
      width: 400px;
      max-height: 80vh;
      overflow-y: auto;
      background: rgba(12, 12, 12, 0.98);
      backdrop-filter: blur(24px);
      border: 1px solid #262626;
      border-left: 4px solid var(--brand-cobalt);
      border-radius: 8px;
      padding: 18px;
      display: none;
      box-shadow: 0 16px 48px rgba(0, 0, 0, 0.95);
      transform: translateY(6px);
      transition: var(--transition-fast);
    }

    #detailPanel.active {
      display: block;
      transform: translateY(0);
    }

    .panel-title {
      font-size: 16px;
      font-weight: 700;
      color: #ffffff;
      margin-bottom: 6px;
    }

    .panel-tag {
      display: inline-block;
      padding: 2px 7px;
      background: rgba(2, 132, 199, 0.2);
      color: var(--brand-cyan);
      border: 1px solid rgba(56, 189, 248, 0.3);
      border-radius: 4px;
      font-family: "JetBrains Mono", Consolas, monospace;
      font-size: 10px;
      font-weight: 700;
      margin-bottom: 10px;
      text-transform: uppercase;
    }

    .panel-section-title {
      font-size: 11px;
      font-weight: 700;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-top: 10px;
      margin-bottom: 4px;
    }

    .panel-badge-pill {
      display: inline-block;
      padding: 2px 7px;
      background: #181818;
      border: 1px solid #2a2a2a;
      color: #cbd5e1;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 500;
      margin: 2px 4px 2px 0;
    }

    .panel-link-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      margin-top: 12px;
      background: #0284c7;
      color: #ffffff;
      padding: 6px 12px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 600;
      text-decoration: none;
      transition: var(--transition-fast);
    }

    .panel-link-btn:hover {
      background: #0369a1;
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
      <span class="status-text">OBSIDIAN UNIVERSE // DEEP ZOOM</span>
    </div>
    <h1>🌐 Tool-Calling 知識圖譜</h1>
    <p class="subtitle">${registry.tools.length} 個 AI 工具星系 (滾輪深層縮放 | 點擊/雙擊聚焦細節)</p>
  </div>

  <div id="controls">
    <button id="resetViewBtn" class="mode-btn" onclick="resetToDefaultState()" title="回歸全景初始狀態">
      <span>🔄 重置全景視角</span>
    </button>
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

  <!-- 2D 平面網絡容器 (Obsidian Expansive Graph) -->
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

    // ─── 1. 初始化 2D Vis.js Network (Obsidian 廣闊深層拓撲星系) ───────────────────
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
          gravitationalConstant: -18000,
          centralGravity: 0.025,
          springLength: 95,
          springConstant: 0.03,
          damping: 0.45,
          avoidOverlap: 0.95
        },
        maxVelocity: 40,
        minVelocity: 0.2,
        solver: 'barnesHut',
        stabilization: { enabled: true, iterations: 300 }
      },
      interaction: {
        hover: true,
        zoomView: false, // 由自定義 2D Pivot Zoom 引擎接管，支援 100 倍極致深層放大
        dragView: true,
        hoverConnectedEdges: true
      }
    };

    const network2d = new vis.Network(container2d, data2d, options2d);
    window.network2d = network2d;
    window.data2d = data2d;
    
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
      
      let html = '<div style="background:rgba(12,12,12,0.96); padding:10px 14px; border-radius:6px; border:1px solid #222222; border-left:3px solid ' + (node.colorHex || '#0284c7') + '; color:#f1f5f9; font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif; font-size:12px; min-width:180px; max-width:320px; box-shadow:0 8px 28px rgba(0,0,0,0.9);">';
      html += '<div style="font-weight:700; font-size:13px; color:#ffffff; margin-bottom:3px;">' + node.label.replace(/\\n/g, ' ') + '</div>';
      
      if (node.categoryName) {
        html += '<div style="color:#94a3b8; font-size:11px; margin-bottom:5px; font-weight:600;">' + node.categoryName + '</div>';
      }
      
      if (node.toolData && node.group === 'tool') {
        const t = node.toolData;
        if (t.description) {
          html += '<div style="color:#cbd5e1; font-size:11px; font-weight:400; line-height:1.4; margin-bottom:5px;">' + t.description.slice(0, 90) + (t.description.length > 90 ? '...' : '') + '</div>';
        }
        if (t.useCase) {
          html += '<div style="color:#34d399; font-size:11px; font-weight:600; margin-bottom:3px;"><b>★ 場景:</b> ' + t.useCase.slice(0, 50) + (t.useCase.length > 50 ? '...' : '') + '</div>';
        }
        if (t.advantages && t.advantages.length > 0) {
          html += '<div style="color:#38bdf8; font-size:11px; font-weight:600;"><b>◆ 優勢:</b> ' + t.advantages.slice(0, 2).join(', ') + '</div>';
        }
        if (t.capabilities && t.capabilities.length > 0) {
          html += '<div style="color:#a855f7; font-size:11px; font-weight:500; margin-top:3px;">⚡ 能力: ' + t.capabilities.slice(0, 3).join(', ') + '</div>';
        }
      } else if (node.group === 'category') {
        html += '<div style="color:#cbd5e1; font-size:11px; font-weight:500;">收錄 <b>' + (node.toolCount || 0) + '</b> 個工具</div>';
      } else if (node.group === 'root') {
        html += '<div style="color:#cbd5e1; font-size:11px; font-weight:500;">共 <b>' + (node.totalTools || 0) + '</b> 個 AI 工具</div>';
      }
      
      html += '<div style="color:#64748b; font-size:9px; margin-top:5px; text-transform:uppercase; font-family:monospace; font-weight:700;">' + node.group + ' (雙擊可極限聚焦)</div>';
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

    // 2D Pivot Zoom (縮放中心：滑鼠當前位置，縮放倍率：1~20)
    container2d.addEventListener('wheel', function(e) {
      e.preventDefault();
      e.stopPropagation();
      const currentScale = network2d.getScale();
      const zoomFactor = e.deltaY < 0 ? 1.15 : (1 / 1.15);
      const newScale = Math.min(Math.max(currentScale * zoomFactor, 1.0), 20.0);

      const rect = container2d.getBoundingClientRect();
      const pointer = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      const domPos = network2d.DOMtoCanvas(pointer);

      network2d.moveTo({
        position: domPos,
        scale: newScale,
        offset: { x: (rect.width / 2) - pointer.x, y: (rect.height / 2) - pointer.y },
        animation: false
      });
    }, { passive: false });

    // 2D 雙擊節點：深入推進對焦
    network2d.on('doubleClick', function(params) {
      if (params.nodes.length > 0) {
        const nodeId = params.nodes[0];
        const node = data2d.nodes.get(nodeId);
        if (node) {
          network2d.focus(nodeId, { scale: 3.5, animation: { duration: 600, easingFunction: 'easeInOutQuad' } });
          showPanel(node);
        }
      }
    });

    network2d.once('stabilizationIterationsDone', function() {
      network2d.setOptions({ physics: { enabled: false } });
      network2d.moveTo({ position: { x: 0, y: 0 }, scale: 1.0, animation: false });
    });
    setTimeout(function() { network2d.moveTo({ position: { x: 0, y: 0 }, scale: 1.0, animation: false }); }, 300);

    // ─── 2. 初始化 3D Force-Directed Graph (Obsidian 廣闊宇宙空間) ─────────────
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

          let radius = 3.5;
          if (node.group === 'root') radius = 9.0;
          else if (node.group === 'category') radius = 6.0;
          else if (node.group === 'subtool') radius = 1.8;

          // 柔和霧面磨砂實心球體 (比例恰當協調)
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

          // 建立純淨無背景透明 SpriteText (對齊 13px 視覺比例)
          if (typeof SpriteText !== 'undefined') {
            const label = node.label.replace('\\n', ' ');

            const sprite = new SpriteText(label);
            sprite.fontFace = '-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif';
            sprite.fontWeight = 'normal';
            sprite.backgroundColor = false;
            sprite.strokeWidth = 0;

            if (node.group === 'root') {
              sprite.textHeight = 12.0;
              sprite.textColor = '#ffffff';
            } else if (node.group === 'category') {
              sprite.textHeight = 9.0;
              sprite.textColor = '#f1f5f9';
            } else if (node.group === 'tool') {
              sprite.textHeight = 6.5; // 預設字體 13px 恰當視覺比例
              sprite.textColor = '#e2e8f0';
            } else {
              sprite.textHeight = 3.8;
              sprite.textColor = '#94a3b8';
            }

            sprite.position.set(0, radius + 3.2, 0);
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
              html += '<div style="color:#cbd5e1; font-size:11px; font-weight:400; margin-bottom:3px;">' + t.description.slice(0, 70) + (t.description.length > 70 ? '...' : '') + '</div>';
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
          
          html += '<div style="color:#64748b; font-size:9px; margin-top:4px; text-transform:uppercase; font-family:monospace; font-weight:700;">' + node.group + ' (點擊深入檢視)</div>';
          html += '</div>';
          return html;
        })
        .linkColor(link => link.colorHex || '#0284c7')
        .linkOpacity(0.35)
        .linkWidth(link => link.width || 0.8)
        .linkDirectionalParticles(link => link.isDashed ? 2 : 0)
        .linkDirectionalParticleSpeed(0.004)
        .linkDirectionalParticleWidth(1.4)
        .d3VelocityDecay(0.25)
        .d3AlphaDecay(0.015)
        .warmupTicks(60)
        .cooldownTicks(300)
        .onNodeClick(node => {
          // 點擊節點：深入對焦至節點正前方
          zoomTo3DNode(node, 36);
          showPanel(node);
        });

      // 設定 3D 力導向物理場
      setTimeout(() => {
        if (graph3DInstance && graph3DInstance.d3Force) {
          const chargeForce = graph3DInstance.d3Force('charge');
          if (chargeForce) chargeForce.strength(-220);

          const linkForce = graph3DInstance.d3Force('link');
          if (linkForce) {
            linkForce.distance(link => {
              const src = link.source && link.source.id ? link.source.id : link.source;
              const tgt = link.target && link.target.id ? link.target.id : link.target;
              if (src === 'root' || tgt === 'root') return 150;
              if (link.isDashed) return 32;
              return 70;
            });
          }
        }
      }, 50);

      // 3D 視角向量對焦推進函數
      function zoomTo3DNode(node, targetDistance = 36) {
        if (!graph3DInstance) return;
        const currentCam = graph3DInstance.cameraPosition();
        const nodePos = { x: node.x || 0, y: node.y || 0, z: node.z || 0 };
        
        let dirX = currentCam.x - nodePos.x;
        let dirY = currentCam.y - nodePos.y;
        let dirZ = currentCam.z - nodePos.z;
        const len = Math.hypot(dirX, dirY, dirZ) || 1;
        dirX /= len; dirY /= len; dirZ /= len;

        const newCamPos = {
          x: nodePos.x + dirX * targetDistance,
          y: nodePos.y + dirY * targetDistance,
          z: nodePos.z + dirZ * targetDistance
        };

        graph3DInstance.cameraPosition(newCamPos, nodePos, 1000);
      }

      // 3D 空間操控配置 (縮放倍率限制 1~20: 距離 15~300)
      setTimeout(() => {
        if (graph3DInstance.controls) {
          const controls = graph3DInstance.controls();
          if (controls) {
            controls.enableZoom = false; // 由自定義 3D Pivot Zoom 依滑鼠位置精確縮放
            controls.enablePan = true;
            controls.panSpeed = 1.2;
            controls.screenSpacePanning = true;
            controls.enableRotate = true;
            controls.rotateSpeed = 1.0;
            controls.minDistance = 15.0;  // 縮放倍率 20x
            controls.maxDistance = 300.0; // 縮放倍率 1x

            controls.mouseButtons = {
              LEFT: 0,   // 左鍵: 旋轉 (ROTATE)
              MIDDLE: 2, // 中鍵: 平移 (PAN)
              RIGHT: 2   // 右鍵: 平移 (PAN)
            };
          }
        }
      }, 100);

      container3d.addEventListener('contextmenu', e => e.preventDefault());

      // 3D Pivot Zoom (縮放中心：滑鼠當前位置，縮放倍率：1~20)
      container3d.addEventListener('wheel', function (e) {
        if (!graph3DInstance) return;
        const camera = graph3DInstance.camera();
        const controls = graph3DInstance.controls();
        if (!camera || !controls || !controls.target) return;

        e.preventDefault();
        e.stopPropagation();

        const rect = container3d.getBoundingClientRect();
        const mouseNDC = new THREE.Vector2(
          ((e.clientX - rect.left) / rect.width) * 2 - 1,
          -((e.clientY - rect.top) / rect.height) * 2 + 1
        );

        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mouseNDC, camera);

        const plane = new THREE.Plane();
        const normal = new THREE.Vector3().subVectors(camera.position, controls.target).normalize();
        plane.setFromNormalAndCoplanarPoint(normal, controls.target);

        const pivot = new THREE.Vector3();
        const hasIntersect = raycaster.ray.intersectPlane(plane, pivot);
        const targetPoint = hasIntersect ? pivot : controls.target.clone();

        const zoomRatio = e.deltaY < 0 ? 0.88 : (1 / 0.88);

        const camToPivot = new THREE.Vector3().subVectors(camera.position, targetPoint);
        const currentDist = camToPivot.length();
        const newDist = Math.min(Math.max(currentDist * zoomRatio, 15.0), 300.0);

        camToPivot.normalize().multiplyScalar(newDist);
        camera.position.copy(targetPoint).add(camToPivot);
        
        if (hasIntersect && e.deltaY < 0) {
          controls.target.lerp(targetPoint, 0.12);
        }
        controls.update();
      }, { passive: false });

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

      window.graph3DInstance = graph3DInstance;
      // 預設 1:1 基準視野 (z: 300)
      graph3DInstance.cameraPosition({ x: 0, y: 0, z: 300 });
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
            network2d.focus(catNode.id, { scale: 1.4, animation: { duration: 700 } });
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
        if (node) {
          network2d.focus(nodeId, { scale: 2.2, animation: { duration: 500 } });
          showPanel(node);
        }
      } else {
        closePanel();
        document.querySelectorAll('.legend-item').forEach(el => el.classList.remove('active'));
      }
    });

    // 動態富文本面板渲染 (Obsidian 深度資訊卡)
    function showPanel(node) {
      const panel = document.getElementById('detailPanel');
      const content = document.getElementById('panelContent');
      
      let descHtml = '';
      
      if (node.group === 'root') {
        descHtml = '<div style="font-size:12px; line-height:1.6; color:#cbd5e1; margin-bottom:8px;">' +
          '<b>Tool-Calling</b> 全自動 AI Agent 工具調用基礎設施，全庫包含 <b>' + node.totalTools + '</b> 個開源 AI 工具與 <b>' + categories.length + '</b> 大分類，支援三層（L1精確/L2關鍵字/L3語義）檢索。' +
          '</div>' +
          '<div style="font-size:11px; color:#64748b; font-family:monospace;">' +
          '🕒 最後更新: ' + new Date(node.lastUpdated).toLocaleString() +
          '</div>';
      } else if (node.group === 'category') {
        const catTools = nodesData.filter(n => n.group === 'tool' && n.categoryName === node.categoryName);
        const sampleTools = node.topTools ? node.topTools.map(t => '<span class="panel-badge-pill">' + t + '</span>').join('') : '';
        const langs = node.languages && node.languages.length ? node.languages.join(', ') : '無特定語言標示';

        descHtml = '<div style="font-size:12px; line-height:1.6; color:#cbd5e1; margin-bottom:8px;">' +
          (node.description || '') +
          '</div>' +
          '<div style="font-size:12px; color:#38bdf8; margin-top:6px; margin-bottom:4px; font-weight:600;">' +
          '📊 收錄工具: <b>' + (node.toolCount || catTools.length) + '</b> 個' +
          '</div>' +
          '<div style="font-size:11px; color:#94a3b8; margin-bottom:6px;">' +
          '💻 支援語言: <b>' + langs + '</b>' +
          '</div>' +
          '<div class="panel-section-title">熱門代表工具</div>' +
          '<div>' + sampleTools + '</div>';
      } else if (node.group === 'tool') {
        const t = node.toolData || {};
        
        let capsHtml = '';
        if (t.capabilities && t.capabilities.length > 0) {
          capsHtml = '<div class="panel-section-title">⚡ 支援能力 (Capabilities)</div><div>' +
            t.capabilities.map(c => '<span class="panel-badge-pill" style="border-color:#38bdf8; color:#38bdf8;">' + c + '</span>').join('') +
            '</div>';
        }

        let advHtml = '';
        if (t.advantages && t.advantages.length > 0) {
          advHtml = '<div class="panel-section-title">◆ 核心優勢</div><div>' +
            t.advantages.map(a => '<span class="panel-badge-pill" style="border-color:#10b981; color:#34d399;">' + a + '</span>').join('') +
            '</div>';
        }

        let subToolsHtml = '';
        if (t.subTools && t.subTools.length > 0) {
          subToolsHtml = '<div class="panel-section-title">🧩 微技能拆解</div><div>' +
            t.subTools.map(s => '<span class="panel-badge-pill" style="border-color:#a855f7; color:#c084fc;">' + (s.name || s.id) + '</span>').join('') +
            '</div>';
        }

        descHtml = '<div style="font-size:12px; line-height:1.6; color:#cbd5e1; margin-bottom:8px;">' +
          (t.description || '無詳細描述') +
          '</div>' +
          (t.useCase ? '<div style="font-size:12px; color:#34d399; margin-bottom:4px; line-height:1.4; font-weight:600;"><b>★ 推薦場景:</b> ' + t.useCase + '</div>' : '') +
          (t.negativeConstraints && t.negativeConstraints.length ? '<div style="font-size:12px; color:#f87171; margin-bottom:4px; line-height:1.4; font-weight:600;"><b>✕ 禁用場景:</b> ' + t.negativeConstraints.join(', ') + '</div>' : '') +
          (t.language ? '<div style="font-size:11px; color:#94a3b8; margin-top:4px;">開發語言: ' + t.language + (t.stars ? ' | ⭐ ' + t.stars.toLocaleString() : '') + '</div>' : '') +
          capsHtml +
          advHtml +
          subToolsHtml +
          (t.url ? '<a href="' + t.url + '" target="_blank" class="panel-link-btn">🔗 開啟 GitHub 倉庫</a>' : '');
      } else if (node.group === 'subtool') {
        descHtml = '<div style="font-size:12px; line-height:1.6; color:#cbd5e1; margin-bottom:6px;">' +
          '所屬主工具: <b style="color:#38bdf8;">' + (node.parentToolName || '主工具') + '</b>' +
          '</div>' +
          '<div style="font-size:11px; color:#94a3b8; line-height:1.5;">' +
          '微技能說明: ' + node.subDesc +
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
            { x: (found.x || 0) + 40, y: (found.y || 0) + 40, z: (found.z || 0) + 40 },
            found,
            1000
          );
          showPanel(found);
        }
      } else {
        const found = data2d.nodes.get().find(n => n.label.toLowerCase().includes(term));
        if (found) {
          network2d.focus(found.id, { scale: 2.5, animation: { duration: 600 } });
          network2d.selectNodes([found.id]);
          showPanel(found);
        }
      }
    });

    // 回歸預設初始狀態 (Reset to Default View State)
    function resetToDefaultState() {
      // 1. 清空搜尋框與取消分類圖例選取
      const searchInput = document.getElementById('searchInput');
      if (searchInput) searchInput.value = '';
      document.querySelectorAll('.legend-item').forEach(el => el.classList.remove('active'));

      // 2. 關閉詳細資訊抽屜
      closePanel();

      // 3. 視圖回歸預設 1:1 基準視野 (Scale: 1.0 / Z: 300)
      if (is3DMode && graph3DInstance) {
        graph3DInstance.cameraPosition(
          { x: 0, y: 0, z: 300 },
          { x: 0, y: 0, z: 0 },
          1000
        );
      } else if (network2d) {
        network2d.unselectAll();
        network2d.moveTo({
          position: { x: 0, y: 0 },
          scale: 1.0,
          animation: { duration: 600, easingFunction: 'easeInOutQuad' }
        });
      }
    }
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
