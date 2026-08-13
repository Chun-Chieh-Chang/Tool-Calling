import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const htmlFiles = [
  'dist/knowledge-graph.html',
  'docs/knowledge-graph.html',
  'web/index.html'
];

htmlFiles.forEach(relPath => {
  const fullPath = path.join(__dirname, '..', relPath);
  if (!fs.existsSync(fullPath)) return;

  const content = fs.readFileSync(fullPath, 'utf8');
  const matches = content.match(/id="[^"]+"/g) || [];
  const ids = matches.map(m => m.replace('id="', '').replace('"', ''));
  
  const counts = {};
  ids.forEach(id => {
    counts[id] = (counts[id] || 0) + 1;
  });

  const duplicates = Object.keys(counts).filter(id => counts[id] > 1);
  if (duplicates.length > 0) {
    console.error(`❌ [Duplicate ID] 檔案 ${relPath} 發現 ${duplicates.length} 個重複 ID:`, duplicates);
  } else {
    console.log(`✅ [Unique ID] 檔案 ${relPath} 所有 ${ids.length} 個 ID 均 100% 唯一！`);
  }
});
