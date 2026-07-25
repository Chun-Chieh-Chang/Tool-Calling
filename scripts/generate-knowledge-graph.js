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
  "安全性": "#DC2626",
  "多媒體生成": "#DB2777",
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
  const hex = hexColor.replace('#', '');
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
 * 全自動動態數據驅動圖譜生成器 (100% 無硬編碼，數據與 tools.json 即時同步)
 */
export function generateKnowledgeGraph(registryInput = null) {
  let registry = registryInput;
  if (!registry) {
    const registryPath = path.join(__dirname, '../registry/tools.json');
    registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  }

  const nodes = [];
  const edges = [];

  // 1. Root Node (完全動態計算總數與時間戳)
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
    font: { color: "#FFFFFF", size: 22, face: "Inter", bold: true },
    value: 40
  });

  // 2. Category Nodes (從 tools.json 動態聚合與提煉摘要)
  const categories = [...new Set(registry.tools.map(t => t.category))].filter(Boolean);
  
  categories.forEach((cat, idx) => {
    const catId = `cat_${idx}`;
    const colorHex = getCategoryColor(cat, idx);
    const textColor = getContrastTextColor(colorHex);
    
    // 動態計算該分類下的工具清單與語言指標
    const catTools = registry.tools.filter(t => t.category === cat);
    const languages = [...new Set(catTools.map(t => t.language).filter(Boolean))];
    const useCases = catTools.map(t => t.useCase).filter(Boolean);
    
    // 動態合成分類技術領域描述文案 (Data-Driven Dynamic Description)
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
        highlight: {
          background: colorHex,
          border: "#FFFFFF"
        },
        hover: {
          background: colorHex,
          border: "#93C5FD"
        }
      },
      font: {
        color: textColor,
        size: 16,
        face: "Inter",
        bold: true,
        strokeWidth: textColor === '#FFFFFF' ? 2 : 0,
        strokeColor: '#0F172A'
      },
      value: 25
    });

    edges.push({
      from: "root",
      to: catId,
      color: { color: "#334155", highlight: "#60A5FA" },
      width: 3
    });

    // 3. Tools in this Category (全屬性綁定 tools.json 動態欄位)
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
        font: { color: "#F8FAFC", size: 13, face: "Inter", strokeWidth: 3, strokeColor: "#0F172A" },
        title: `<b>${tool.name}</b><br/>ID: ${tool.id}<br/>描述: ${tool.description}<br/>⭐ 場景: ${tool.useCase || '無'}`
      });

      edges.push({
        from: catId,
        to: toolNodeId,
        color: { color: "#1E293B", highlight: colorHex },
        width: 1
      });

      // 4. SubTools / Capabilities (動態連結)
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
              highlight: { background: "#475569", border: "#FFFFFF" }
            },
            font: { color: "#CBD5E1", size: 11, face: "Inter", strokeWidth: 2, strokeColor: "#0F172A" }
          });

          edges.push({
            from: toolNodeId,
            to: subId,
            color: { color: "#0F172A" },
            width: 0.5,
            dashes: true
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
  <title>Tool-Calling 全景 AI 工具知識圖譜 (Interactive Knowledge Graph)</title>
  <script type="text/javascript" src="https://unpkg.com/vis-network/standalone/umd/vis-network.min.js"></script>
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
      width: 280px;
      transition: all 0.3s ease;
    }

    .search-box:focus {
      border-color: var(--accent-brand);
      box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.25);
    }

    #network {
      width: 100%;
      height: 100%;
    }

    /* 左下角色彩對照面板 */
    #legendPanel {
      position: absolute;
      bottom: 20px;
      left: 20px;
      z-index: 10;
      background: rgba(30, 41, 59, 0.92);
      backdrop-filter: blur(16px);
      border: 1px solid var(--border-color);
      border-radius: 12px;
      padding: 14px 18px;
      max-height: 280px;
      width: 270px;
      overflow-y: auto;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5);
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

    #detailPanel {
      position: absolute;
      bottom: 20px;
      right: 20px;
      z-index: 10;
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
    <h1>🌐 Tool-Calling 全景 AI 工具知識圖譜</h1>
    <p class="subtitle">展示 ${registry.tools.length} 個 AI 工具、${categories.length} 大分類與拆解微技能節點 (100% 數據即時同步)</p>
  </div>

  <div id="controls">
    <input type="text" id="searchInput" class="search-box" placeholder="🔍 搜尋圖譜中的工具或分類..." />
  </div>

  <!-- 左下角色彩對照圖例 -->
  <div id="legendPanel">
    <div class="legend-header">
      <span>🎨 點擊分類圖例高亮圖譜</span>
      <span style="font-size:11px; color:#94A3B8;">(${categories.length} 類)</span>
    </div>
    <div class="legend-grid">
      ${legendItemsHtml}
    </div>
  </div>

  <div id="detailPanel">
    <button class="close-btn" onclick="closePanel()">×</button>
    <div id="panelContent"></div>
  </div>

  <div id="network"></div>

  <script>
    const nodesData = ${JSON.stringify(nodes)};
    const edgesData = ${JSON.stringify(edges)};

    const container = document.getElementById('network');
    const data = {
      nodes: new vis.DataSet(nodesData),
      edges: new vis.DataSet(edgesData)
    };

    // 物理力學最佳化配置
    const options = {
      nodes: {
        font: { face: 'Inter' }
      },
      physics: {
        enabled: true,
        barnesHut: {
          gravitationalConstant: -4000,
          centralGravity: 0.25,
          springLength: 110,
          springConstant: 0.02,
          damping: 0.35,
          avoidOverlap: 0.6
        },
        maxVelocity: 35,
        minVelocity: 0.2,
        solver: 'barnesHut',
        stabilization: {
          enabled: true,
          iterations: 300,
          updateInterval: 25,
          onlyDynamicEdges: false,
          fit: true
        }
      },
      interaction: {
        hover: true,
        tooltipDelay: 200,
        zoomView: true
      }
    };

    const network = new vis.Network(container, data, options);

    // 穩定後自動鎖定物理引擎
    network.on('stabilizationIterationsDone', function () {
      network.setOptions({ physics: { enabled: false } });
    });

    // 拖拽時動態啟動/結束物理學
    network.on('dragStart', function () {
      network.setOptions({ physics: { enabled: true } });
    });
    network.on('dragEnd', function () {
      setTimeout(() => {
        network.setOptions({ physics: { enabled: false } });
      }, 1000);
    });

    // 點擊圖例 (Legend Click) 凸顯分類與關聯節點
    function filterCategory(catName, element) {
      const isAlreadyActive = element && element.classList.contains('active');
      
      document.querySelectorAll('.legend-item').forEach(el => el.classList.remove('active'));

      if (isAlreadyActive) {
        network.unselectAll();
        network.fit({ animation: { duration: 600, easingFunction: 'easeInOutQuad' } });
        closePanel();
        return;
      }

      if (element) element.classList.add('active');

      const allNodes = data.nodes.get();
      const targetNodes = allNodes.filter(n => n.categoryName === catName || (n.group === 'category' && n.label === catName));
      const targetIds = targetNodes.map(n => n.id);

      const catNode = allNodes.find(n => n.group === 'category' && n.label === catName);

      if (targetIds.length > 0) {
        network.selectNodes(targetIds);

        if (catNode) {
          network.focus(catNode.id, {
            scale: 1.15,
            animation: { duration: 800, easingFunction: 'easeInOutQuad' }
          });
          showPanel(catNode);
        }
      }
    }

    // 監聽來自主頁面 (app.js) 的跨 View 全域搜尋與分類即時連動訊息 (Cross-View Realtime Sync)
    window.addEventListener('message', function(event) {
      const msg = event.data;
      if (!msg) return;

      if (msg.type === 'SYNC_FILTER' || msg.type === 'SEARCH') {
        const query = (msg.query || '').toLowerCase().trim();
        const cat = msg.category || '';

        if (cat) {
          const legendEl = Array.from(document.querySelectorAll('.legend-item')).find(el => el.textContent.includes(cat));
          filterCategory(cat, legendEl);
          return;
        }

        if (query) {
          const found = data.nodes.get().find(n => n.label.toLowerCase().includes(query));
          if (found) {
            network.focus(found.id, {
              scale: 1.2,
              animation: { duration: 800, easingFunction: 'easeInOutQuad' }
            });
            network.selectNodes([found.id]);
            showPanel(found);
          }
        } else {
          network.unselectAll();
          network.fit({ animation: { duration: 600, easingFunction: 'easeInOutQuad' } });
          closePanel();
          document.querySelectorAll('.legend-item').forEach(el => el.classList.remove('active'));
        }
      }
    });

    // Node click handler
    network.on('click', function (params) {
      if (params.nodes.length > 0) {
        const nodeId = params.nodes[0];
        const node = data.nodes.get(nodeId);
        if (node) {
          showPanel(node);
        }
      } else {
        closePanel();
        document.querySelectorAll('.legend-item').forEach(el => el.classList.remove('active'));
      }
    });

    // 動態 100% 數據綁定之富文本面板渲染 (完全取自即時更新之 tools.json)
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
        const catTools = data.nodes.get().filter(n => n.group === 'tool' && n.categoryName === node.categoryName);
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

      const found = data.nodes.get().find(n => n.label.toLowerCase().includes(term));
      if (found) {
        network.focus(found.id, {
          scale: 1.2,
          animation: { duration: 800, easingFunction: 'easeInOutQuad' }
        });
        network.selectNodes([found.id]);
        showPanel(found);
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

  console.log(`[Auto-Sync] 100% data-driven knowledge graph with cross-view sync updated for ${registry.tools.length} tools!`);
}

// 支援命令列獨立執行
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  generateKnowledgeGraph();
}
