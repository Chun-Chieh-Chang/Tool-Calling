const fs = require('fs');
const path = require('path');

const registryPath = path.join(__dirname, 'registry', 'tools.json');
let data;
try {
  data = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
} catch (e) {
  console.error('Error reading registry:', e.message);
  process.exit(1);
}

console.log('=== 處理重複 ID ===\n');
console.log(`總工具數: ${data.tools.length}\n`);

// 找出所有重複的 ID
const idGroups = {};
data.tools.forEach((t, idx) => {
  if (!idGroups[t.id]) idGroups[t.id] = [];
  idGroups[t.id].push({ ...t, originalIndex: idx });
});

// 處理重複項目
let updated = 0;
for (const [id, tools] of Object.entries(idGroups)) {
  if (tools.length <= 1) continue;
  
  console.log(`ID "${id}" 出現 ${tools.length} 次:`);
  tools.forEach((t, i) => {
    console.log(`  [${i+1}] ${t.name} - ${t.url}`);
    
    // 對於第二個及之後的，加後綴
    if (i > 0) {
      const urlParts = t.url.split('/');
      const owner = urlParts[urlParts.length - 2];
      const suffix = owner.toLowerCase();
      
      // 建立新 ID
      const newId = `${id}-${suffix}`;
      
      // 檢查新 ID 是否已存在
      if (data.tools.some(tool => tool.id === newId)) {
        // 如果新 ID 已存在，嘗試其他變體
        const altIds = [`${id}-${suffix}-fork`, `${id}-${owner}`, `${id}-v2`];
        for (const altId of altIds) {
          if (!data.tools.some(tool => tool.id === altId)) {
            console.log(`     → 更新為: ${altId}`);
            t.id = altId;
            updated++;
            break;
          }
        }
      } else {
        console.log(`     → 更新為: ${newId}`);
        t.id = newId;
        updated++;
      }
    }
  });
}

// 保存修改
try {
  fs.writeFileSync(registryPath, JSON.stringify(data, null, 2));
  console.log(`\n✓ 已更新 ${updated} 個重複 ID`);
  console.log(`  總工具數: ${data.tools.length}`);
} catch (e) {
  console.error('Error writing registry:', e.message);
  process.exit(1);
}