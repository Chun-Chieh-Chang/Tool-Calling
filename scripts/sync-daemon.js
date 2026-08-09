/**
 * sync-daemon.js — 背景快照同步精靈
 *
 * 在背景持續執行，定時更新 GitHub Stars 與快照。
 * 適合需要即時 delta 資料又不依賴 CI/CD cron 的場景。
 *
 * 使用：
 *   npm run daemon            # 前景執行 (Ctrl+C 停止)
 *   npm run daemon:start      # Windows：註冊為背景任務
 *   npm run daemon:stop       # Windows：停止背景任務
 *
 * 輪詢間隔預設 6 小時，可用環境變數 DAEMON_INTERVAL_MS 覆寫。
 */

const INTERVAL_MS = parseInt(process.env.DAEMON_INTERVAL_MS || `${6 * 3600000}`, 10);

async function syncOnce() {
  const { loadRegistry } = await import('../core/registry.js');
  const { loadSnapshot, saveSnapshot, parseOwnerRepo } = await import('../core/snapshot.js');

  const registry = loadRegistry();
  const snap = loadSnapshot();
  let updated = 0;

  // 支援 CI 環境：提供 GITHUB_TOKEN 可突破匿名 API 60 次/小時速率限制
  const token = process.env.GITHUB_TOKEN;
  const headers = { 'User-Agent': 'Tool-Calling-Daemon' };
  if (token && token.length > 10) headers['Authorization'] = `token ${token}`;

  for (const tool of registry.tools) {
    if (!tool.url) continue;
    const parsed = parseOwnerRepo(tool.url);
    if (!parsed) continue;
    const fullName = `${parsed.owner}/${parsed.repo}`;
    try {
      const apiUrl = `https://api.github.com/repos/${parsed.owner}/${parsed.repo}`;
      const res = await fetch(apiUrl, { headers, signal: AbortSignal.timeout(6000) });
      if (!res.ok) continue;
      const data = await res.json();
      if (typeof data.stargazers_count === 'number') {
        snap[fullName] = data.stargazers_count;
        tool.stars = data.stargazers_count;
        updated++;
      }
    } catch { /* 個別失敗不影響整體 */ }
    await new Promise(r => setTimeout(r, 200)); // 避免 API rate limit
  }

  saveSnapshot(snap);
  registry.lastUpdated = new Date().toISOString();
  const { writeFileSync } = await import('node:fs');
  const { join, dirname } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const registryPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'registry', 'tools.json');
  writeFileSync(registryPath, JSON.stringify(registry, null, 2), 'utf-8');

  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
  console.log(`[${now}] ✅ 同步完成 — ${updated}/${registry.tools.length} 個工具已更新`);
}

async function main() {
  // 一次性模式：供 CI/CD（.github/workflows/sync-stars.yml）呼叫，同步完即退出
  const once = process.argv.includes('--once');
  if (!once) {
    console.log(`🧠 Tool-Calling 背景同步精靈啟動`);
    console.log(`   輪詢間隔：${INTERVAL_MS / 3600000} 小時`);
    console.log(`   首次同步：立即執行\n`);
  }

  await syncOnce();

  if (once) {
    process.exit(0);
  }

  setInterval(syncOnce, INTERVAL_MS);
}

main().catch(err => {
  console.error('[Daemon] 嚴重錯誤:', err);
  process.exit(1);
});
