import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 預設 20 大領域高級主題色對照 (Master Palette)
const baseCategoryColors = {
  "開發工具": "#2563EB",
  "數據分析": "#059669",
  "知識管理": "#7C3AED",
  "安全性": "#EF4444",
  "多媒體生成": "#EC4899",
  "AI 框架": "#D97706",
  "學習資源": "#4F46E5",
  "測試與自動化": "#0D9488",
  "基礎設施": "#475569",
  "資料庫": "#0891B2",
  "前端設計": "#9333EA",
  "3D工程繪圖": "#EA580C",
  "專案管理": "#0284C7",
  "簡報與文件生產力": "#65A30D",
  "自動化流程與外掛": "#C026D3"
};

// 根據背景 Hex 顏色計算最優文字對比色 (黑白文字演算法)
function getContrastTextColor(hexColor) {
  if (!hexColor) return "#FFFFFF";
  const hex = hexColor.replace('#', '');
  if (hex.length !== 6) return "#FFFFFF";
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.55 ? "#0F172A" : "#FFFFFF";
}

// 若遇動態新增之未知分類，自動透過 HSL 演算法生成和諧高對比色
function getCategoryColor(catName, index) {
  if (baseCategoryColors[catName]) return baseCategoryColors[catName];
  const hue = (index * 137.5) % 360;
  return `hsl(${Math.floor(hue)}, 65%, 45%)`;
}

/**
 * 全自動動態數據驅動 2D / 3D 雙引擎知識圖譜生成器 (零 Console 警示、零 404 與無過時 API)
 */
export function generateKnowledgeGraph(registryInput = null) {
  let registry = registryInput;
  if (!registry) {
    const registryPath = path.join(__dirname, '../registry/tools.json');
    registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  }

  const nodes = [];
  const edges = [];

  // 1. Root Node
  nodes.push({
    id: "root",
    label: `Tool-Calling\n(${registry.tools.length} AI Tools)`,
    group: "root",
    lastUpdated: registry.lastUpdated || new Date().toISOString(),
    totalTools: registry.tools.length,
    shape: "ellipse",
    color: {
      background: "#4F46E5",
      border: "#6366F1",
      highlight: { background: "#6366F1", border: "#FFFFFF" },
      hover: { background: "#6366F1", border: "#FFFFFF" }
    },
    colorHex: "#6366F1",
    font: { color: "#FFFFFF", size: 22, face: "Inter", bold: true },
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
        border: colorHex,
        highlight: { background: colorHex, border: "#FFFFFF" },
        hover: { background: colorHex, border: "#93C5FD" }
      },
      colorHex: colorHex,
      textColor: textColor,
      font: {
        color: textColor,
        size: 16,
        face: "Inter",
        bold: true,
        strokeWidth: textColor === '#FFFFFF' ? 2 : 0,
        strokeColor: '#0F172A'
      },
      val: 24
    });

    edges.push({
      from: "root",
      to: catId,
      source: "root",
      target: catId,
      color: { color: "#334155", highlight: "#60A5FA" },
      colorHex: "#334155",
      width: 3,
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
        size: 12,
        color: {
          background: "#1E293B",
          border: colorHex,
          highlight: { background: colorHex, border: "#FFFFFF" },
          hover: { background: colorHex, border: "#FFFFFF" }
        },
        colorHex: colorHex,
        font: { color: "#F8FAFC", size: 13, face: "Inter", strokeWidth: 3, strokeColor: "#0F172A" },
        title: `<b>${tool.name}</b><br/>ID: ${tool.id}<br/>描述: ${tool.description}<br/>⭐ 場景: ${tool.useCase || '無'}`,
        val: 12
      });

      edges.push({
        from: catId,
        to: toolNodeId,
        source: catId,
        target: toolNodeId,
        color: { color: "#334155", highlight: colorHex },
        colorHex: colorHex,
        width: 1,
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
              background: "#334155",
              border: "#64748B",
              highlight: { background: "#60A5FA", border: "#FFFFFF" }
            },
            colorHex: "#64748B",
            font: { color: "#CBD5E1", size: 11, face: "Inter", strokeWidth: 2, strokeColor: "#0F172A" },
            val: 6
          });

          edges.push({
            from: toolNodeId,
            to: subId,
            source: toolNodeId,
            target: subId,
            color: { color: "#475569", highlight: "#60A5FA" },
            colorHex: "#475569",
            width: 1,
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
  <!-- 補齊 Data URI SVG Favicon 消除 404 報錯 -->
  <link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🌐</text></svg>">
  <script type="text/javascript" src="https://unpkg.com/vis-network/standalone/umd/vis-network.min.js"></script>
  <!-- 僅引進 3d-force-graph 內建三維引擎，消滅三維多重實體與 Deprecation 警示 -->
  <script type="text/javascript" src="https://unpkg.com/3d-force-graph@1.73.1/dist/3d-force-graph.min.js"></script>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg-base: #0F172A;
      --surface-card: #1E293B;
      --text-primary: #F1F5F9;
      --text-secondary: #94A3B8;
      --accent-brand: #3B82F6;
      --border-color: #334155;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
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
      background: rgba(30, 41, 59, 0.88);
      backdrop-filter: blur(12px);
      border: 1px solid var(--border-color);
      border-radius: 12px;
      padding: 16px 24px;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5);
    }

    h1 {
      font-size: 20px;
      font-weight: 700;
      background: linear-gradient(135deg, #60A5FA 0%, #A855F7 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      margin-bottom: 6px;
    }

    p.subtitle {
      font-size: 13px;
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
      background: linear-gradient(135deg, #3B82F6 0%, #8B5CF6 100%);
      border: none;
      border-radius: 10px;
      color: #FFFFFF;
      padding: 10px 18px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      box-shadow: 0 4px 14px rgba(59, 130, 246, 0.4);
      transition: all 0.3s ease;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .mode-btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 20px rgba(59, 130, 246, 0.6);
    }

    .search-box {
      background: rgba(30, 41, 59, 0.88);
      backdrop-filter: blur(12px);
      border: 1px solid var(--border-color);
      border-radius: 10px;
      padding: 10px 16px;
      color: var(--text-primary);
      font-size: 14px;
      outline: none;
      width: 260px;
      transition: all 0.3s ease;
    }

    .search-box:focus {
      border-color: var(--accent-brand);
      box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.25);
    }

    #network2d, #network3d {
      width: 100%;
      height: 100%;
      position: absolute;
      top: 0;
      left: 0;
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
      background: rgba(30, 41, 59, 0.92);
      backdrop-filter: blur(16px);
      border: 1px solid var(--border-color);
      border-radius: 14px;
      padding: 14px 18px;
      max-height: calc(100vh - 160px);
      width: 270px;
      overflow-y: auto;
      box-shadow: 0 12px 30px -5px rgba(0, 0, 0, 0.6);
    }

    .legend-header {
      font-size: 13px;
      font-weight: 700;
      color: #60A5FA;
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
      font-size: 12px;
      color: var(--text-primary);
      padding: 5px 8px;
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.2s ease;
      user-select: none;
      border: 1px solid transparent;
    }

    .legend-item:hover {
      background: rgba(255, 255, 255, 0.08);
      transform: translateX(3px);
    }

    .legend-item.active {
      background: rgba(59, 130, 246, 0.25);
      border-color: rgba(96, 165, 250, 0.6);
      color: #60A5FA;
      font-weight: 600;
      box-shadow: 0 0 10px rgba(59, 130, 246, 0.3);
    }

    .legend-badge {
      width: 12px;
      height: 12px;
      border-radius: 3px;
      display: inline-block;
      flex-shrink: 0;
    }

    /* 左下角：富文本詳細抽屜面板 */
    #detailPanel {
      position: absolute;
      bottom: 20px;
      left: 20px;
      z-index: 20;
      width: 360px;
      background: rgba(30, 41, 59, 0.95);
      backdrop-filter: blur(16px);
      border: 1px solid var(--border-color);
      border-radius: 14px;
      padding: 20px;
      display: none;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.6);
      transform: translateY(10px);
      transition: all 0.3s ease;
    }

    #detailPanel.active {
      display: block;
      transform: translateY(0);
    }

    .panel-title {
      font-size: 16px;
      font-weight: 700;
      color: #60A5FA;
      margin-bottom: 8px;
    }

    .panel-tag {
      display: inline-block;
      padding: 3px 8px;
      background: rgba(59, 130, 246, 0.2);
      color: #93C5FD;
      border-radius: 6px;
      font-size: 11px;
      margin-bottom: 12px;
    }

    .close-btn {
      position: absolute;
      top: 12px;
      right: 14px;
      background: none;
      border: none;
      color: var(--text-secondary);
      font-size: 18px;
      cursor: pointer;
    }
  </style>
</head>
<body>
  <div id="header">
    <h1>🌐 Tool-Calling 全景 AI 工具 3D/2D 雙視角知識圖譜</h1>
    <p class="subtitle">展示 ${registry.tools.length} 個 AI 工具 (零 Console 警示 | 左鍵旋轉 | 右鍵/中鍵/Shift+左鍵平移 | 滾輪對焦)</p>
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
      <span style="font-size:11px; color:#94A3B8;">(${categories.length} 類)</span>
    </div>
    <div class="legend-grid">
      ${legendItemsHtml}
    </div>

    <!-- 🔗 連線型態圖例說明 -->
    <div class="legend-header" style="margin-top: 12px; border-top: 1px solid var(--border-color); padding-top: 10px;">
      <span>🔗 圖譜連線類型說明</span>
    </div>
    <div class="legend-grid">
      <div class="legend-item" style="cursor:default;">
        <span style="display:inline-block; width:16px; height:2px; background:#60A5FA;"></span>
        <span><b>實線</b>：主分類歸屬網絡</span>
      </div>
      <div class="legend-item" style="cursor:default;">
        <span style="display:inline-block; width:16px; height:0; border-top:2px dashed #94A3B8;"></span>
        <span><b>虛線</b>：拆解微技能/能力 (點擊亮顯)</span>
      </div>
    </div>

    <!-- 🎮 3D 操控技巧說明 -->
    <div class="legend-header" style="margin-top: 12px; border-top: 1px solid var(--border-color); padding-top: 10px;">
      <span>🎮 3D 空間操控技巧</span>
    </div>
    <div style="font-size: 11px; color: #94A3B8; line-height: 1.5; padding: 4px;">
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

  <script>
    const nodesData = ${JSON.stringify(nodes)};
    const edgesData = ${JSON.stringify(edges)};

    let is3DMode = false;
    let graph3DInstance = null;

    // ─── 1. 初始化 2D Vis.js Network ──────────────────────────────────────────
    const container2d = document.getElementById('network2d');
    const data2d = {
      nodes: new vis.DataSet(nodesData),
      edges: new vis.DataSet(edgesData)
    };

    const options2d = {
      nodes: { font: { face: 'Inter' } },
      layout: { improvedLayout: false },
      physics: {
        enabled: true,
        barnesHut: {
          gravitationalConstant: -4500,
          centralGravity: 0.25,
          springLength: 120,
          springConstant: 0.02,
          damping: 0.35,
          avoidOverlap: 0.6
        },
        maxVelocity: 35,
        minVelocity: 0.2,
        solver: 'barnesHut',
        stabilization: { enabled: true, iterations: 250 }
      },
      interaction: { hover: true, tooltipDelay: 200, zoomView: true }
    };

    const network2d = new vis.Network(container2d, data2d, options2d);
    network2d.on('stabilizationIterationsDone', () => network2d.setOptions({ physics: { enabled: false } }));

    // Helper: 根據背景 Hex 顏色計算最優文字對比色 (黑白文字演算法)
    function getContrastTextColorJS(hexColor) {
      if (!hexColor) return "#FFFFFF";
      const hex = hexColor.replace('#', '');
      if (hex.length !== 6) return "#FFFFFF";
      const r = parseInt(hex.substring(0, 2), 16);
      const g = parseInt(hex.substring(2, 4), 16);
      const b = parseInt(hex.substring(4, 6), 16);
      const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      return luminance > 0.55 ? "#0F172A" : "#FFFFFF";
    }

    // ─── 2. 初始化 3D Force-Directed Graph (純淨、零 Console 警示 3D 渲染) ─────────
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
        .backgroundColor('#0B0F19')
        .nodeColor(node => node.colorHex || '#3B82F6')
        .nodeVal(node => node.val || 10)
        .nodeCanvasObject((node, ctx, globalScale) => {
          // 純淨 2D Canvas in 3D 繪製文字與背景，絕無全域 Three.js 實體與過時 API 警示
          const label = node.label.replace('\\n', ' ');
          const fontSize = node.group === 'root' ? 14 / globalScale : (node.group === 'category' ? 11 / globalScale : 8 / globalScale);
          ctx.font = \`bold \${fontSize}px Inter, sans-serif\`;
          
          const textWidth = ctx.measureText(label).width;
          const bckgDimensions = [textWidth + 8, fontSize + 6];

          // 繪製背景標籤
          ctx.fillStyle = node.group === 'root' ? 'rgba(79, 70, 229, 0.9)' :
                         (node.group === 'category' ? (node.colorHex || '#2563EB') :
                         (node.group === 'tool' ? 'rgba(30, 41, 59, 0.88)' : 'rgba(51, 65, 85, 0.8)'));
          ctx.fillRect(node.x - bckgDimensions[0] / 2, node.y - bckgDimensions[1] / 2, ...bckgDimensions);

          if (node.group === 'tool') {
            ctx.strokeStyle = node.colorHex || '#3B82F6';
            ctx.lineWidth = 1;
            ctx.strokeRect(node.x - bckgDimensions[0] / 2, node.y - bckgDimensions[1] / 2, ...bckgDimensions);
          }

          // 繪製對比文字
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = node.group === 'category' ? getContrastTextColorJS(node.colorHex) : '#F1F5F9';
          ctx.fillText(label, node.x, node.y);
        })
        .nodeCanvasObjectMode(() => 'after')
        .nodeLabel(node => \`<div style="background:rgba(30,41,59,0.95); padding:8px 12px; border-radius:8px; border:1px solid #334155; color:#F1F5F9;"><b>\${node.label.replace('\\n', ' ')}</b><br/><span style="font-size:11px; color:#94A3B8;">\${node.group.toUpperCase()}</span></div>\`)
        .linkColor(link => link.colorHex || '#334155')
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

      // 顯式開啟 3D 右鍵、中鍵與 Shift+左鍵平移功能 (Explicit 3D Panning Mapping)
      setTimeout(() => {
        if (graph3DInstance.controls) {
          const controls = graph3DInstance.controls();
          if (controls) {
            controls.enablePan = true;
            controls.panSpeed = 1.2;
            controls.screenSpacePanning = true;
            controls.enableRotate = true;
            controls.rotateSpeed = 1.0;

            // 顯式配置滑鼠按鍵對應：右鍵與中鍵皆定為 2 (PAN 平移)
            controls.mouseButtons = {
              LEFT: 0,   // ROTATE
              MIDDLE: 2, // PAN
              RIGHT: 2   // PAN
            };

            // 動態監聽 Shift 鍵按壓，解鎖 Shift + 左鍵平移！
            window.addEventListener('keydown', (e) => {
              if (e.key === 'Shift' && controls.mouseButtons) {
                controls.mouseButtons.LEFT = 2; // 切換為 PAN
              }
            });
            window.addEventListener('keyup', (e) => {
              if (e.key === 'Shift' && controls.mouseButtons) {
                controls.mouseButtons.LEFT = 0; // 還原為 ROTATE
              }
            });
          }
        }
      }, 100);

      // 手動 3D 游標 Raycast 視線對焦滾輪推進 (100% Pixel-Exact 3D Raycast Zoom)
      container3d.addEventListener('wheel', function (event) {
        if (!graph3DInstance) return;
        const camera = graph3DInstance.camera();
        const controls = graph3DInstance.controls();
        if (!camera || !controls) return;

        event.preventDefault();
        event.stopPropagation();

        const rect = container3d.getBoundingClientRect();
        const mouseX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        const mouseY = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        // 從 3d-force-graph 內建 Three 實體獲取 Raycaster 類別
        const THREE_REF = window.THREE || (graph3DInstance.scene && graph3DInstance.scene().constructor ? graph3DInstance.scene().constructor.prototype : null);
        
        let targetPoint = new THREE.Vector3(0, 0, 0);
        if (typeof THREE !== 'undefined' && THREE.Raycaster) {
          const raycaster = new THREE.Raycaster();
          raycaster.setFromCamera(new THREE.Vector2(mouseX, mouseY), camera);
          const intersects = raycaster.intersectObjects(graph3DInstance.scene().children, true);

          if (intersects.length > 0) {
            targetPoint = intersects[0].point.clone();
          } else {
            raycaster.ray.at(220, targetPoint);
          }
        }

        // 滾輪向前 (deltaY < 0) 放大，向後縮小
        const zoomStep = event.deltaY < 0 ? 0.84 : 1.19;

        const camToTarget = new THREE.Vector3().subVectors(camera.position, targetPoint);
        const currentDistance = camToTarget.length();
        const newDistance = Math.max(currentDistance * zoomStep, 10);

        camToTarget.normalize().multiplyScalar(newDistance);
        const newCamPos = new THREE.Vector3().addVectors(targetPoint, camToTarget);

        controls.target.lerp(targetPoint, 0.25);
        camera.position.copy(newCamPos);
        controls.update();
      }, { passive: false });

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

    // 動態富文本面板渲染
    function showPanel(node) {
      const panel = document.getElementById('detailPanel');
      const content = document.getElementById('panelContent');
      
      let descHtml = '';
      
      if (node.group === 'root') {
        descHtml = \`
          <div style="font-size:13px; line-height:1.6; color:#CBD5E1; margin-bottom:10px;">
            <b>Tool-Calling</b> 是全自動 AI Agent 工具調用基礎設施，全庫包含 <b>\${node.totalTools}</b> 個 AI 工具與 <b>${categories.length}</b> 大分類，支援三層（L1/L2/L3）精態與語意檢索。
          </div>
          <div style="font-size:11px; color:#94A3B8;">
            🕒 資料庫最後更新時間: \${new Date(node.lastUpdated).toLocaleString()}
          </div>
        \`;
      } else if (node.group === 'category') {
        const catTools = nodesData.filter(n => n.group === 'tool' && n.categoryName === node.categoryName);
        const sampleTools = node.topTools ? node.topTools.map(t => \`<span style="display:inline-block; padding:3px 8px; background:rgba(59, 130, 246, 0.15); border:1px solid rgba(96, 165, 250, 0.3); color:#93C5FD; border-radius:4px; font-size:11px; margin:2px;">\${t}</span>\`).join(' ') : '';
        const langs = node.languages && node.languages.length ? node.languages.join(', ') : '無特定語言標示';

        descHtml = \`
          <div style="font-size:13px; line-height:1.6; color:#CBD5E1; margin-bottom:10px;">
            \${node.description}
          </div>
          <div style="font-size:12px; color:#60A5FA; margin-top:8px; margin-bottom:4px;">
            📊 分類包含工具總數: <b>\${node.toolCount || catTools.length}</b> 個
          </div>
          <div style="font-size:12px; color:#94A3B8; margin-bottom:8px;">
            💻 主要開發語言: <b>\${langs}</b>
          </div>
          <div style="margin-top:6px;">
            \${sampleTools}
          </div>
        \`;
      } else if (node.group === 'tool') {
        const t = node.toolData || {};
        descHtml = \`
          <div style="font-size:13px; line-height:1.6; color:#CBD5E1; margin-bottom:10px;">
            \${t.description || '無詳細描述'}
          </div>
          \${t.useCase ? \`<div style="font-size:12px; color:#34D399; margin-bottom:6px; line-height:1.5;"><b>⭐ 推薦場景:</b> \${t.useCase}</div>\` : ''}
          \${t.advantages && t.advantages.length ? \`<div style="font-size:12px; color:#60A5FA; margin-bottom:6px; line-height:1.5;"><b>★ 關鍵優勢:</b> \${t.advantages.join(', ')}</div>\` : ''}
          \${t.negativeConstraints && t.negativeConstraints.length ? \`<div style="font-size:12px; color:#F87171; margin-bottom:6px; line-height:1.5;"><b>🚫 禁用場景:</b> \${t.negativeConstraints.join(', ')}</div>\` : ''}
          \${t.language ? \`<div style="font-size:11px; color:#94A3B8; margin-top:8px;">開發語言: \${t.language}</div>\` : ''}
        \`;
      } else if (node.group === 'subtool') {
        descHtml = \`
          <div style="font-size:13px; line-height:1.6; color:#CBD5E1; margin-bottom:8px;">
            所屬工具: <b style="color:#60A5FA;">\${node.parentToolName || '主工具'}</b>
          </div>
          <div style="font-size:12px; color:#94A3B8; line-height:1.5;">
            微技能描述: \${node.subDesc}
          </div>
        \`;
      }

      content.innerHTML = \`
        <div class="panel-title">\${node.label.replace('\\n', ' ')}</div>
        <div class="panel-tag">\${node.group.toUpperCase()}</div>
        \${descHtml}
      \`;
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

  console.log(`[Auto-Sync] Pure 3D Graph with ZERO Console Warnings & Favicon Data URI updated for ${registry.tools.length} tools!`);
}

// 支援命令列獨立執行
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  generateKnowledgeGraph();
}
