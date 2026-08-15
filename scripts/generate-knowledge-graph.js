import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 16 世紀文藝復興古典礦物與植物色階 (Renaissance Classical Mineral & Botanical Palette)
const baseCategoryColors = {
  "AI 框架": "#B45309",        // 古典黃銅金 (Antique Brass)
  "AI 代理": "#A16207",        // 琥珀赭黃 (Raw Sienna)
  "開發工具": "#92400E",      // 溫潤古銅 (Warm Copper)
  "UI/UX設計": "#581C87",     // 文藝復興皇家紫晶 (Tyrian Purple)
  "多媒體生成": "#991B1B",    // 封蠟赭紅 (Wax Seal Crimson)
  "影片": "#B91C1C",          // 硃砂深紅 (Cinnabar Red)
  "音訊": "#3F6212",          // 古木橄欖綠 (Olive Atelier)
  "瀏覽器自動化": "#1E3A8A",  // 深邃群青 (Lapis Lazuli)
  "安全性": "#78350F",        // 深褐焦赭 (Burnt Umber)
  "測試與自動化": "#1D4ED8",  // 大航海深海藍 (Ocean Indigo)
  "API 整合": "#0F766E",      // 松石青綠 (Verdigris Teal)
  "學習資源": "#CA8A04",      // 古羊皮金 (Ochre Gold)
  "文件生產力": "#15803D",    // 草本墨綠 (Herbal Sage)
  "資料庫": "#065F46",        // 孔雀石綠 (Malachite Green)
  "知識管理": "#0369A1",      // 古典天青 (Cerulean Azure)
  "研究": "#831843",          // 古籍精裝絳紫 (Deep Claret)
  "基礎設施": "#44403C",      // 鐵膽墨岩黑 (Iron Gall Slate)
  "行銷": "#C2410C",          // 文藝復興陶土橙 (Terracotta)
  "數據分析": "#047857",      // 翡翠秘藥綠 (Emerald Green)
  "3D工程繪圖": "#D97706",    // 星盤黃銅金 (Astrolabe Gold)
  "圖標與視覺資源": "#6D28D9" // 威尼斯紫羅蘭 (Venetian Violet)
};

// 根據背景 Hex 顏色計算最優文字對比色 (黑白文字演算法)
function getContrastTextColor(hexColor) {
  if (!hexColor) return "#F5EFEB";
  const hex = hexColor.replace('#', '');
  if (hex.length !== 6) return "#F5EFEB";
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.55 ? "#1C1917" : "#F5EFEB";
}

// 若遇動態新增之未知分類，自動透過古典色相演算法生成
function getCategoryColor(catName, index) {
  if (baseCategoryColors[catName]) return baseCategoryColors[catName];
  const hue = (index * 137.5 + 35) % 360;
  return `hsl(${Math.floor(hue)}, 55%, 38%)`;
}

/**
 * 全自動動態數據驅動 2D / 3D 雙引擎知識圖譜生成器 (16th-Century Renaissance Theme)
 */
export function generateKnowledgeGraph(registryInput = null) {
  let registry = registryInput;
  if (!registry) {
    const registryPath = path.join(__dirname, '../registry/tools.json');
    registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  }

  const nodes = [];
  const edges = [];

  // 1. Root Node (文藝復興黃銅金核心星盤)
  nodes.push({
    id: "root",
    label: `Tool-Calling\n(${registry.tools.length} AI Tools)`,
    group: "root",
    lastUpdated: registry.lastUpdated || new Date().toISOString(),
    totalTools: registry.tools.length,
    shape: "ellipse",
    color: {
      background: "#92400E",
      border: "#F59E0B",
      highlight: { background: "#B45309", border: "#FDE68A" },
      hover: { background: "#B45309", border: "#FDE68A" }
    },
    colorHex: "#B45309",
    font: { color: "#F5EFEB", size: 22, face: "Cinzel, serif", bold: true },
    val: 40
  });

  // 2. Category Nodes
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
      margin: 14,
      color: {
        background: colorHex,
        border: "#B45309",
        highlight: { background: colorHex, border: "#FDE68A" },
        hover: { background: colorHex, border: "#F59E0B" }
      },
      colorHex: colorHex,
      textColor: textColor,
      font: {
        color: textColor,
        size: 16,
        face: "Cinzel, serif",
        bold: true,
        strokeWidth: textColor === '#F5EFEB' ? 2 : 0,
        strokeColor: '#12100E'
      },
      val: 24
    });

    edges.push({
      from: "root",
      to: catId,
      source: "root",
      target: catId,
      color: { color: "#78350F", highlight: "#F59E0B" },
      colorHex: "#78350F",
      width: 2.5,
      isDashed: false
    });

    // 3. Tools in this Category
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
        size: 10,
        color: {
          background: colorHex,
          border: "#12100E",
          highlight: { background: "#F5EFEB", border: colorHex },
          hover: { background: "#F5EFEB", border: colorHex }
        },
        colorHex: colorHex,
        font: { color: "#F5EFEB", size: 13, face: "EB Garamond, Georgia, serif", strokeWidth: 3, strokeColor: "#12100E" },
        title: `<b>${tool.name}</b><br/>分類: ${tool.category}<br/>描述: ${tool.description}<br/>⭐ 場景: ${tool.useCase || '無'}`,
        val: 10
      });

      edges.push({
        from: catId,
        to: toolNodeId,
        source: catId,
        target: toolNodeId,
        color: { color: colorHex, highlight: "#FDE68A", opacity: 0.5 },
        colorHex: colorHex,
        width: 1.5,
        length: 95,
        isDashed: false
      });

      // 4. SubTools / Capabilities
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
            size: 6,
            color: {
              background: "#1A1713",
              border: colorHex,
              highlight: { background: colorHex, border: "#F5EFEB" }
            },
            colorHex: colorHex,
            font: { color: "#D6C7B2", size: 11, face: "EB Garamond, Georgia, serif", strokeWidth: 2, strokeColor: "#12100E" },
            val: 6
          });

          edges.push({
            from: toolNodeId,
            to: subId,
            source: toolNodeId,
            target: subId,
            color: { color: colorHex, highlight: "#FDE68A", opacity: 0.35 },
            colorHex: colorHex,
            width: 1,
            length: 45,
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
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700;800&family=EB+Garamond:ital,wght@0,400;0,600;1,400&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet">
  <script type="text/javascript" src="https://unpkg.com/vis-network/standalone/umd/vis-network.min.js"></script>
  <script type="text/javascript" src="https://unpkg.com/three@0.149.0/build/three.min.js"></script>
  <script type="text/javascript" src="https://unpkg.com/three-spritetext@1.8.2/dist/three-spritetext.min.js"></script>
  <script type="text/javascript" src="https://unpkg.com/3d-force-graph@1.73.1/dist/3d-force-graph.min.js"></script>
  <style>
    :root {
      --bg-base: #12100E;
      --surface-card: #1A1713;
      --surface-inset: #110F0D;
      --text-primary: #F5EFEB;
      --text-secondary: #A8A29E;
      --text-muted: #78716C;
      --accent-brand: #D97706;
      --brand-gradient: linear-gradient(135deg, #B45309 0%, #D97706 50%, #F59E0B 100%);
      --border-color: #362E25;
      --border-gold: #B45309;
      --success-color: #34D399;
      --warning-color: #F87171;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: 'EB Garamond', Georgia, serif;
      background-color: var(--bg-base);
      color: var(--text-primary);
      overflow: hidden;
      height: 100vh;
      width: 100vw;
    }

    #header {
      position: absolute;
      top: 20px;
      left: 20px;
      z-index: 10;
      background: rgba(26, 23, 19, 0.94);
      backdrop-filter: blur(16px);
      border: 1px solid var(--border-gold);
      border-radius: 8px;
      padding: 16px 24px;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.7);
    }

    h1 {
      font-family: 'Cinzel', Georgia, serif;
      font-size: 20px;
      font-weight: 700;
      letter-spacing: 0.03em;
      background: var(--brand-gradient);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      margin-bottom: 6px;
    }

    p.subtitle {
      font-family: 'EB Garamond', Georgia, serif;
      font-style: italic;
      font-size: 14px;
      color: var(--text-secondary);
    }

    #controls {
      position: absolute;
      top: 20px;
      right: 20px;
      z-index: 10;
      display: flex;
      gap: 12px;
      align-items: center;
    }

    .mode-btn {
      background: var(--brand-gradient);
      border: 1px solid #78350F;
      border-radius: 6px;
      color: #FFFFFF;
      font-family: 'Cinzel', Georgia, serif;
      padding: 10px 18px;
      font-size: 14px;
      font-weight: 700;
      letter-spacing: 0.03em;
      cursor: pointer;
      box-shadow: 0 4px 14px rgba(180, 83, 9, 0.4);
      transition: all 0.3s ease;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .mode-btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 20px rgba(217, 119, 6, 0.6);
      border-color: #F59E0B;
    }

    .mode-btn * {
      pointer-events: none;
    }

    .search-box {
      background: rgba(26, 23, 19, 0.94);
      backdrop-filter: blur(12px);
      border: 1px solid var(--border-gold);
      border-radius: 6px;
      padding: 10px 16px;
      color: var(--text-primary);
      font-family: 'EB Garamond', Georgia, serif;
      font-size: 15px;
      outline: none;
      width: 260px;
      transition: all 0.3s ease;
    }

    .search-box:focus {
      border-color: var(--accent-brand);
      box-shadow: 0 0 0 3px rgba(217, 119, 6, 0.25);
    }

    #network2d, #network3d {
      width: 100%;
      height: 100%;
      position: absolute;
      top: 0;
      left: 0;
      background-color: var(--bg-base);
    }

    #network3d {
      display: none;
    }

    /* 右側中間：分類色彩與連線圖例面板 */
    #legendPanel {
      position: absolute;
      top: 50%;
      right: 20px;
      transform: translateY(-50%);
      z-index: 15;
      background: rgba(26, 23, 19, 0.94);
      backdrop-filter: blur(16px);
      border: 1px solid var(--border-gold);
      border-radius: 8px;
      padding: 14px 18px;
      max-height: calc(100vh - 160px);
      width: 270px;
      overflow-y: auto;
      box-shadow: 0 12px 30px -5px rgba(0, 0, 0, 0.7);
    }

    .legend-header {
      font-family: 'Cinzel', Georgia, serif;
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.03em;
      color: #F59E0B;
      margin-bottom: 10px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .legend-grid {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .legend-item {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
      color: var(--text-primary);
      padding: 5px 8px;
      border-radius: 4px;
      cursor: pointer;
      transition: all 0.2s ease;
      user-select: none;
      border: 1px solid transparent;
    }

    .legend-item:hover {
      background: rgba(180, 83, 9, 0.15);
      border-color: var(--border-color);
      transform: translateX(3px);
    }

    .legend-item.active {
      background: rgba(180, 83, 9, 0.25);
      border-color: var(--border-gold);
      color: #F59E0B;
      font-weight: 700;
      box-shadow: 0 0 10px rgba(180, 83, 9, 0.3);
    }

    .legend-badge {
      width: 12px;
      height: 12px;
      border-radius: 2px;
      display: inline-block;
      flex-shrink: 0;
    }

    /* 左下角：富文本詳細抽屜面板 */
    #detailPanel {
      position: absolute;
      bottom: 20px;
      left: 20px;
      z-index: 20;
      width: 380px;
      background: rgba(26, 23, 19, 0.96);
      backdrop-filter: blur(16px);
      border: 1px solid var(--border-gold);
      border-radius: 8px;
      padding: 20px;
      display: none;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.8);
      transform: translateY(10px);
      transition: all 0.3s ease;
    }

    #detailPanel.active {
      display: block;
      transform: translateY(0);
    }

    .panel-title {
      font-family: 'Cinzel', Georgia, serif;
      font-size: 17px;
      font-weight: 700;
      letter-spacing: 0.02em;
      color: #F59E0B;
      margin-bottom: 8px;
    }

    .panel-tag {
      display: inline-block;
      padding: 2px 8px;
      background: rgba(180, 83, 9, 0.15);
      color: #FBBF24;
      border: 1px solid var(--border-gold);
      border-radius: 4px;
      font-family: 'Cinzel', Georgia, serif;
      font-size: 11px;
      font-weight: 700;
      margin-bottom: 12px;
    }

    .close-btn {
      position: absolute;
      top: 12px;
      right: 14px;
      background: none;
      border: none;
      color: var(--text-secondary);
      font-size: 20px;
      cursor: pointer;
      line-height: 1;
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
    <h1>🌐 Tool-Calling 全景 AI 工具 3D/2D 雙視角知識圖譜</h1>
    <p class="subtitle">展示 ${registry.tools.length} 個 AI 工具 (零 Console 警示 | 左鍵旋轉 | 右鍵/中鍵/Shift+左鍵平移 | 滾輪對焦)</p>
    <p style="font-size: 12px; color: var(--accent-brand); margin-top: 4px; font-weight: 600; font-family: 'Cinzel', Georgia, serif;">Developed by Wesley Chang, July-2026.</p>
  </div>

  <div id="controls">
    <button id="viewToggleBtn" class="mode-btn" onclick="toggle3DMode()">
      <span>🌌 切換至 3D 宇宙視角</span>
    </button>
    <input type="text" id="searchInput" class="search-box" placeholder="🔍 搜尋圖譜中的工具或分類..." />
  </div>

  <!-- 右側中間：分類色彩與連線型態圖例面板 -->
  <div id="legendPanel">
    <div class="legend-header">
      <span>🎨 點擊分類圖例高亮圖譜</span>
      <span style="font-size:11px; color:#A8A29E;">(${categories.length} 類)</span>
    </div>
    <div class="legend-grid">
      ${legendItemsHtml}
    </div>

    <!-- 🔗 連線型態圖例說明 -->
    <div class="legend-header" style="margin-top: 12px; border-top: 1px solid var(--border-color); padding-top: 10px;">
      <span>🔗 連線類型說明</span>
    </div>
    <div class="legend-grid">
      <div class="legend-item" style="cursor:default;">
        <span style="display:inline-block; width:16px; height:2px; background:#D97706;"></span>
        <span><b>實線</b>：主分類歸屬網絡</span>
      </div>
      <div class="legend-item" style="cursor:default;">
        <span style="display:inline-block; width:16px; height:0; border-top:2px dashed #A8A29E;"></span>
        <span><b>虛線</b>：拆解微技能/能力</span>
      </div>
    </div>

    <!-- 🎮 3D 操控技巧說明 -->
    <div class="legend-header" style="margin-top: 12px; border-top: 1px solid var(--border-color); padding-top: 10px;">
      <span>🎮 3D 空間操控技巧</span>
    </div>
    <div style="font-size: 12px; color: #A8A29E; line-height: 1.5; padding: 4px; font-style: italic;">
      • <b>旋轉 (Rotate)</b>: 滑鼠左鍵拖曳<br/>
      • <b>平移 (Pan)</b>: 右鍵 / 中鍵 / Shift+左鍵拖曳<br/>
      • <b>對焦縮放 (Zoom)</b>: 滾輪指哪裡放大哪裡
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
        font: { face: 'EB Garamond, Georgia, serif' },
        borderWidth: 1.5,
        shadow: true
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
    
    // -- 2D Hover Tooltip (文藝復興羊皮紙夜空黑曜石樣式) --
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
      
      let html = '<div style="background:rgba(26,23,19,0.98); padding:10px 14px; border-radius:6px; border:1px solid #B45309; color:#F5EFEB; font-family:EB Garamond,Georgia,serif; font-size:13px; min-width:200px; max-width:320px; box-shadow:0 8px 24px rgba(0,0,0,0.7);">';
      html += '<div style="font-family:Cinzel,serif; font-weight:bold; font-size:14px; color:#F59E0B; margin-bottom:4px;">' + node.label.replace(/\\n/g, ' ') + '</div>';
      
      if (node.categoryName) {
        html += '<div style="color:#A8A29E; font-size:11px; margin-bottom:6px; font-style:italic;">' + node.categoryName + '</div>';
      }
      
      if (node.toolData && node.group === 'tool') {
        const t = node.toolData;
        if (t.description) {
          html += '<div style="color:#D6C7B2; font-size:12px; line-height:1.5; margin-bottom:6px;">' + t.description.slice(0, 80) + (t.description.length > 80 ? '...' : '') + '</div>';
        }
        if (t.useCase) {
          html += '<div style="color:#34D399; font-size:12px; margin-bottom:4px;"><b>★ 場景:</b> ' + t.useCase.slice(0, 50) + (t.useCase.length > 50 ? '...' : '') + '</div>';
        }
        if (t.advantages && t.advantages.length > 0) {
          html += '<div style="color:#F59E0B; font-size:12px;"><b>◆ 優勢:</b> ' + t.advantages.slice(0, 2).join(', ') + '</div>';
        }
        if (t.language) {
          html += '<div style="color:#A8A29E; font-size:11px; margin-top:4px;">Language: ' + t.language + '</div>';
        }
      } else if (node.group === 'category') {
        html += '<div style="color:#D6C7B2; font-size:12px;">Contains <b>' + (node.toolCount || 0) + '</b> tools</div>';
      } else if (node.group === 'root') {
        html += '<div style="color:#D6C7B2; font-size:12px;">Total <b>' + (node.totalTools || 0) + '</b> AI Tools</div>';
      }
      
      html += '<div style="color:#78716C; font-size:10px; margin-top:6px; text-transform:uppercase; font-family:Cinzel,serif;">' + node.group + '</div>';
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

    // Helper: 根據背景 Hex 顏色計算最優文字對比色 (黑白文字演算法)
    function getContrastTextColorJS(hexColor) {
      if (!hexColor) return "#F5EFEB";
      const hex = hexColor.replace('#', '');
      if (hex.length !== 6) return "#F5EFEB";
      const r = parseInt(hex.substring(0, 2), 16);
      const g = parseInt(hex.substring(2, 4), 16);
      const b = parseInt(hex.substring(4, 6), 16);
      const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      return luminance > 0.55 ? "#1C1917" : "#F5EFEB";
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
        .backgroundColor('#12100E')
        .nodeColor(node => node.colorHex || '#B45309')
        .nodeVal(node => node.val || 10)
        .nodeThreeObject(node => {
          if (typeof SpriteText === 'undefined') return null;
          const label = node.label.replace('\\n', ' ');
          const bgHex = node.colorHex || '#B45309';
          const txtColor = node.group === 'category' ? getContrastTextColorJS(bgHex) : '#F5EFEB';

          const sprite = new SpriteText(label);
          sprite.fontFace = node.group === 'category' || node.group === 'root' ? 'Cinzel, Georgia, serif' : 'EB Garamond, Georgia, serif';
          sprite.fontWeight = 'bold';

          if (node.group === 'root') {
            sprite.textHeight = 10;
            sprite.backgroundColor = 'rgba(146, 64, 14, 0.92)';
            sprite.textColor = '#F5EFEB';
            sprite.strokeColor = '#F59E0B';
            sprite.strokeWidth = 1.5;
          } else if (node.group === 'category') {
            sprite.textHeight = 8;
            sprite.backgroundColor = bgHex;
            sprite.textColor = txtColor;
          } else if (node.group === 'tool') {
            sprite.textHeight = 5;
            sprite.backgroundColor = 'rgba(26, 23, 19, 0.92)';
            sprite.strokeColor = bgHex;
            sprite.strokeWidth = 1.2;
            sprite.textColor = '#F5EFEB';
          } else {
            sprite.textHeight = 3.5;
            sprite.backgroundColor = 'rgba(38, 32, 26, 0.85)';
            sprite.textColor = '#D6C7B2';
          }

          sprite.padding = 3;
          sprite.borderRadius = 3;
          sprite.position.set(0, (node.val || 10) / 3 + 8, 0);
          return sprite;
        })
        .nodeThreeObjectExtend(true)
        .nodeLabel(node => {
          const name = node.label.replace('\\n', ' ');
          let html = '<div style="background:rgba(26,23,19,0.96); padding:10px 14px; border-radius:6px; border:1px solid #B45309; color:#F5EFEB; font-family:EB Garamond,Georgia,serif; font-size:13px; min-width:180px; box-shadow:0 6px 16px rgba(0,0,0,0.7);">';
          html += '<div style="font-family:Cinzel,serif; font-weight:bold; font-size:13px; color:#F59E0B; margin-bottom:4px;">' + name + '</div>';
          
          if (node.group === 'tool' && node.toolData) {
            const t = node.toolData;
            if (t.description) {
              html += '<div style="color:#D6C7B2; font-size:12px; margin-bottom:4px;">' + t.description.slice(0, 60) + (t.description.length > 60 ? '...' : '') + '</div>';
            }
            if (t.useCase) {
              html += '<div style="color:#34D399; font-size:12px; margin-bottom:2px;">★ ' + t.useCase + '</div>';
            }
            if (t.advantages && t.advantages.length > 0) {
              html += '<div style="color:#F59E0B; font-size:12px;">◆ ' + t.advantages[0] + '</div>';
            }
            if (t.negativeConstraints && t.negativeConstraints.length > 0) {
              html += '<div style="color:#F87171; font-size:12px;">✕ ' + t.negativeConstraints[0] + '</div>';
            }
          } else if (node.group === 'category') {
            html += '<div style="color:#D6C7B2; font-size:12px;">' + (node.toolCount || 0) + ' tools</div>';
          } else if (node.group === 'subtool') {
            html += '<div style="color:#A8A29E; font-size:12px;">' + (node.subDesc || '') + '</div>';
          }
          
          html += '<div style="color:#78716C; font-size:10px; margin-top:4px; text-transform:uppercase; font-family:Cinzel,serif;">' + node.group + '</div>';
          html += '</div>';
          return html;
        })
        .linkColor(link => link.colorHex || '#78350F')
        .linkWidth(link => link.width || 1)
        .linkDirectionalParticles(link => link.isDashed ? 3 : 0)
        .linkDirectionalParticleSpeed(0.007)
        .linkDirectionalParticleWidth(2.5)
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

      // 完美解鎖 Shift + 滑鼠左鍵拖曳 100% 視角平移 (Capturing Pointerdown Shift-Pan Algorithm)
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
        btn.innerHTML = '<span>🌌 切換至 3D 宇宙視角</span>';
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

    // 動態富文本面板渲染 (文藝復興古典星象抽屜)
    function showPanel(node) {
      const panel = document.getElementById('detailPanel');
      const content = document.getElementById('panelContent');
      
      let descHtml = '';
      
      if (node.group === 'root') {
        descHtml = '<div style="font-size:14px; line-height:1.6; color:#D6C7B2; margin-bottom:10px;">' +
          '<b>Tool-Calling</b> 是全自動 AI Agent 工具調用基礎設施，全庫包含 <b>' + node.totalTools + '</b> 個 AI 工具與 <b>' + categories.length + '</b> 大分類，支援三層（L1/L2/L3）精態與語意檢索。' +
          '</div>' +
          '<div style="font-size:12px; color:#A8A29E; font-style:italic;">' +
          '🕒 資料庫最後更新時間: ' + new Date(node.lastUpdated).toLocaleString() +
          '</div>';
      } else if (node.group === 'category') {
        const catTools = nodesData.filter(n => n.group === 'tool' && n.categoryName === node.categoryName);
        const sampleTools = node.topTools ? node.topTools.map(t => '<span style="display:inline-block; padding:2px 8px; background:rgba(180, 83, 9, 0.15); border:1px solid #B45309; color:#FDE68A; border-radius:4px; font-size:12px; margin:2px;">' + t + '</span>').join(' ') : '';
        const langs = node.languages && node.languages.length ? node.languages.join(', ') : '無特定語言標示';

        descHtml = '<div style="font-size:14px; line-height:1.6; color:#D6C7B2; margin-bottom:10px;">' +
          (node.description || '') +
          '</div>' +
          '<div style="font-size:13px; color:#F59E0B; margin-top:8px; margin-bottom:4px; font-weight:600;">' +
          '📊 分類包含工具總數: <b>' + (node.toolCount || catTools.length) + '</b> 個' +
          '</div>' +
          '<div style="font-size:13px; color:#A8A29E; margin-bottom:8px;">' +
          '💻 主要開發語言: <b>' + langs + '</b>' +
          '</div>' +
          '<div style="margin-top:6px;">' +
          sampleTools +
          '</div>';
      } else if (node.group === 'tool') {
        const t = node.toolData || {};
        descHtml = '<div style="font-size:14px; line-height:1.6; color:#D6C7B2; margin-bottom:10px;">' +
          (t.description || '無詳細描述') +
          '</div>' +
          (t.useCase ? '<div style="font-size:13px; color:#34D399; margin-bottom:6px; line-height:1.5;"><b>⭐ 推薦場景:</b> ' + t.useCase + '</div>' : '') +
          (t.advantages && t.advantages.length ? '<div style="font-size:13px; color:#F59E0B; margin-bottom:6px; line-height:1.5;"><b>◆ 關鍵優勢:</b> ' + t.advantages.join(', ') + '</div>' : '') +
          (t.negativeConstraints && t.negativeConstraints.length ? '<div style="font-size:13px; color:#F87171; margin-bottom:6px; line-height:1.5;"><b>✕ 禁用場景:</b> ' + t.negativeConstraints.join(', ') + '</div>' : '') +
          (t.language ? '<div style="font-size:12px; color:#A8A29E; margin-top:8px; font-style:italic;">開發語言: ' + t.language + '</div>' : '');
      } else if (node.group === 'subtool') {
        descHtml = '<div style="font-size:14px; line-height:1.6; color:#D6C7B2; margin-bottom:8px;">' +
          '所屬工具: <b style="color:#F59E0B;">' + (node.parentToolName || '主工具') + '</b>' +
          '</div>' +
          '<div style="font-size:13px; color:#A8A29E; line-height:1.5;">' +
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
