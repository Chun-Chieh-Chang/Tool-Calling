const fs = require('fs');
const path = require('path');

const registryPath = path.join(__dirname, 'registry', 'tools.json');
const data = JSON.parse(fs.readFileSync(registryPath, 'utf8'));

console.log('=== 工具庫狀態 ===\n');
console.log(`總工具數: ${data.tools.length}\n`);

// 檢查今天新增的工具
const today = new Date().toISOString().slice(0, 10);
const todayTools = data.tools.filter(t => t.addedAt && t.addedAt.startsWith(today));
console.log(`今日 (${today}) 新增: ${todayTools.length} 個\n`);

console.log('新增工具列表:');
todayTools.forEach(t => {
  const enriched = t.useCase && t.negativeConstraints && t.advantages;
  const icon = enriched ? '✓' : '⚠';
  console.log(`  ${icon} ${t.id.padEnd(35)} | ${t.name.padEnd(40)} | ${t.category}`);
});

// 檢查需要 enrich 的工具
console.log('\n\n需要 Enrich 的工具:');
const needsEnrich = data.tools.filter(t => !t.useCase || !t.negativeConstraints?.length || !t.advantages?.length);
if (needsEnrich.length === 0) {
  console.log('  無 - 所有工具已補完');
} else {
  needsEnrich.slice(0, 10).forEach(t => {
    console.log(`  ⚠ ${t.id}: useCase=${!!t.useCase}, neg=${(t.negativeConstraints||[]).length}, adv=${(t.advantages||[]).length}`);
  });
  if (needsEnrich.length > 10) {
    console.log(`  ... 還有 ${needsEnrich.length - 10} 個`);
  }
}

// 檢查重複 ID
console.log('\n\n重複 ID 檢查:');
const idCounts = {};
data.tools.forEach(t => {
  idCounts[t.id] = (idCounts[t.id] || 0) + 1;
});
const duplicates = Object.entries(idCounts).filter(([_, count]) => count > 1);
if (duplicates.length === 0) {
  console.log('  無重複');
} else {
  duplicates.forEach(([id, count]) => {
    console.log(`  ⚠ ${id}: ${count} 次`);
  });
}

console.log('\n=== Git 狀態 ===');