import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 顏色定義 (Premium Color Master Palette)
const categoryColors = {
  "開發工具": "#3B82F6",
  "數據分析": "#10B981",
  "知識管理": "#8B5CF6",
  "安全性": "#EF4444",
  "多媒體生成": "#EC4899",
  "AI 框架": "#F59E0B",
  "學習資源": "#6366F1",
  "測試與自動化": "#14B8A6",
  "基礎設施": "#64748B",
  "資料庫": "#06B6D4",
  "前端設計": "#A855F7",
  "3D工程繪圖": "#F97316",
  "專案管理": "#0EA5E9",
  "簡報與文件生產力": "#84CC16",
  "自動化流程與外掛": "#D946EF"
};

const defaultColor = "#94A3B8";

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
    shape: "ellipse",
    color: { background: "#6366F1", border: "#818CF8", highlight: { background: "#818CF8", border: "#C7D2FE" } },
    font: { color: "#FFFFFF", size: 22, face: "Inter" },
    value: 40
  });

  // 2. Category Nodes
  const categories = [...new Set(registry.tools.map(t => t.category))];
  categories.forEach((cat, idx) => {
    const catId = `cat_${idx}`;
    const colorHex = categoryColors[cat] || defaultColor;
    
    nodes.push({
      id: catId,
      label: cat,
      group: "category",
      shape: "box",
      margin: 12,
      color: { background: colorHex, border: colorHex, highlight: { background: colorHex, border: "#FFFFFF" } },
      font: { color: "#FFFFFF", size: 16, face: "Inter", bold: true },
      value: 25
    });

    edges.push({
      from: "root",
      to: catId,
      color: { color: "#334155", highlight: "#60A5FA" },
      width: 3
    });

    // 3. Tools in this Category
    const catTools = registry.tools.filter(t => t.category === cat);
    catTools.forEach(tool => {
      const toolNodeId = `tool_${tool.id}`;
      
      nodes.push({
        id: toolNodeId,
        label: tool.name,
        group: "tool",
        shape: "dot",
        size: 12,
        color: { background: "#1E293B", border: colorHex, highlight: { background: colorHex, border: "#FFFFFF" } },
        font: { color: "#F1F5F9", size: 12, face: "Inter" },
        title: `<b>${tool.name}</b><br/>ID: ${tool.id}<br/>描述: ${tool.description}<br/>⭐ 場景: ${tool.useCase || '無'}`
      });

      edges.push({
        from: catId,
        to: toolNodeId,
        color: { color: "#1E293B", highlight: colorHex },
        width: 1
      });

      // 4. SubTools / Capabilities (如果存在)
      if (tool.subTools && Array.isArray(tool.subTools)) {
        tool.subTools.slice(0, 5).forEach((sub, sIdx) => {
          const subId = `sub_${tool.id}_${sIdx}`;
          nodes.push({
            id: subId,
            label: sub.name || sub.id,
            group: "subtool",
            shape: "diamond",
            size: 6,
            color: { background: "#334155", border: "#64748B" },
            font: { color: "#94A3B8", size: 10, face: "Inter" }
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
      background: rgba(30, 41, 59, 0.85);
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
      background: rgba(30, 41, 59, 0.85);
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

    #detailPanel {
      position: absolute;
      bottom: 20px;
      right: 20px;
      z-index: 10;
      width: 340px;
      background: rgba(30, 41, 59, 0.9);
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

    .panel-desc {
      font-size: 13px;
      color: var(--text-secondary);
      line-height: 1.5;
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
    <p class="subtitle">展示 ${registry.tools.length} 個 AI 工具、${categories.length} 大分類與拆解微技能節點 (自動即時同步中)</p>
  </div>

  <div id="controls">
    <input type="text" id="searchInput" class="search-box" placeholder="🔍 搜尋圖譜中的工具或分類..." />
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

    const options = {
      nodes: {
        font: { face: 'Inter' }
      },
      physics: {
        barnesHut: {
          gravitationalConstant: -3000,
          centralGravity: 0.3,
          springLength: 95,
          springConstant: 0.04,
          damping: 0.09,
          avoidOverlap: 0.5
        },
        maxVelocity: 50,
        minVelocity: 0.75,
        solver: 'barnesHut',
        stabilization: { iterations: 150 }
      },
      interaction: {
        hover: true,
        tooltipDelay: 200,
        zoomView: true
      }
    };

    const network = new vis.Network(container, data, options);

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
      }
    });

    function showPanel(node) {
      const panel = document.getElementById('detailPanel');
      const content = document.getElementById('panelContent');
      content.innerHTML = \`
        <div class="panel-title">\${node.label.replace('\\n', ' ')}</div>
        <div class="panel-tag">\${node.group.toUpperCase()}</div>
        <div class="panel-desc">\${node.title || '無詳細說明'}</div>
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

  console.log(`[Auto-Sync] Knowledge graph updated with ${registry.tools.length} tools!`);
}

// 支援命令列獨立執行
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  generateKnowledgeGraph();
}
