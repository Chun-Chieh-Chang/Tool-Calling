#!/usr/bin/env node
/**
 * scripts/start-local.js — 一鍵本機啟動與資料同步自動化腳本
 *
 * 整合 2026-10-24 實測踩坑的常規流程，自動觸發、不需人工重跑：
 *   1. 自動偵測 registry/weekly-trending.json 是否過期（stale，門檻可配）
 *      過期時觸發 npm run trending（GitHub 探勘）→ npm run build（同步 dist/）
 *   2. 以 cmd /c start /b 背景啟動正式伺服器（不受 shell 15s 超時影響）
 *   3. 驗證 3000 埠監聽 + 首頁 HTTP 200
 *   4. 輸出明確的啟動結果、PID 與停止指令
 *
 * 用法:
 *   node scripts/start-local.js                 # 自動偵測過期→同步→啟動→驗證
 *   node scripts/start-local.js --no-trending    # 跳過自動 trending 同步
 *   node scripts/start-local.js --force-trending # 無條件跑 trending
 *   node scripts/start-local.js --dev            # 改啟動 dev 模式（服務 web/）
 *   node scripts/start-local.js --port 4000      # 指定埠
 */

import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '..');

// ── 參數解析 ─────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const getOpt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

const SKIP_TRENDING = flag('--no-trending');
const FORCE_TRENDING = flag('--force-trending');
const DEV_MODE = flag('--dev');
const PORT = getOpt('--port') || process.env.PORT || '3000';
const STALE_HOURS = parseFloat(getOpt('--stale-hours') || process.env.STALE_HOURS || '24');
const LAUNCH_LOG = path.join(__dirname, '..', '.agnes', 'dev-server.log');

// ── 工具函式 ─────────────────────────────────────────────────────────
const step = (msg) => console.log('\n' + msg);

function logResult(title, lines) {
  step(`==== ${title} ====`);
  for (const l of lines) console.log('  ' + l);
}

/** 讀取 registry/weekly-trending.json 的 lastUpdated 並判斷是否過期 */
function checkTrendingStaleness() {
  const jsonPath = path.join(ROOT, 'registry', 'weekly-trending.json');
  if (!fs.existsSync(jsonPath)) {
    return { exists: false, stale: true, reason: 'weekly-trending.json 不存在' };
  }
  try {
    const j = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    const lastUpdated = j.lastUpdated ? new Date(j.lastUpdated) : null;
    if (!lastUpdated || isNaN(lastUpdated.getTime())) {
      return { exists: true, stale: true, reason: 'lastUpdated 無效或缺失', asOf: j.asOfDate };
    }
    const ageHours = (Date.now() - lastUpdated.getTime()) / 3600000;
    const stale = ageHours > STALE_HOURS;
    return {
      exists: true,
      stale,
      reason: stale ? `已 ${(ageHours).toFixed(1)} 小時未更新（>${STALE_HOURS}h 門檻）` : `資料新鮮（${ageHours.toFixed(1)}h 內）`,
      asOf: j.asOfDate || j.lastUpdated,
      worldWeek: j.worldWeek
    };
  } catch (e) {
    return { exists: true, stale: true, reason: 'JSON 解析失敗: ' + e.message };
  }
}

/** 跑 npm run <script> 並回傳 stdout */
function runNpm(script, description) {
  step(`▶ ${description}（npm run ${script}）`);
  const logFile = path.join(__dirname, '..', '.agnes', `npm-${script}.log`);
  const p = spawn('npm', ['run', script], {
    cwd: ROOT,
    shell: process.platform === 'win32',
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let out = '', err = '';
  p.stdout.on('data', (d) => (out += d));
  p.stderr.on('data', (d) => (err += d));
  return new Promise((resolve, reject) => {
    p.on('close', (code) => {
      // 寫 log 檔（沙箱 stdout 受限時可查證）
      fs.writeFileSync(logFile, out + err);
      if (code !== 0) {
        // 只回傳末尾，避免長日誌爆 context
        const tail = (out + err).split('\n').slice(-12).join('\n');
        console.log('  ⚠ ' + description + ` 結束 code=${code}`);
        console.log('  末尾日誌:\n' + tail);
        return reject(new Error(`npm run ${script} failed (code=${code})`));
      }
      console.log('  ✓ ' + description + ' 完成');
      resolve({ out, err });
    });
    p.on('error', (e) => reject(new Error(`npm run ${script} spawn failed: ${e.message}`)));
  });
}

/** 以 cmd /c start /b 背景啟動 node web/server.js（已驗證不受 shell 超時影響） */
function startServerBackground() {
  step(`▶ 背景啟動 ${DEV_MODE ? 'dev' : '正式'} 伺服器（埠 ${PORT}）`);
  const cmdExe = 'cmd.exe';
  const nodeArgs = DEV_MODE ? ['web/server.js', '--dev'] : ['web/server.js'];
  const ps = spawn(cmdExe, ['/c', 'start', '/b', 'node', ...nodeArgs], {
    cwd: ROOT,
    env: { ...process.env, PORT },
    stdio: ['ignore', 'ignore', 'ignore'],
    detached: true
  });
  ps.unref();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('背景啟動逾時 12s 仍未監聽 ' + PORT)), 12000);
    // 輪詢 3000 埠直到監聽
    const poll = () => {
      const cmd = `powershell -NoProfile -Command "(Get-NetTCPConnection -State Listen -LocalPort ${PORT} -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty OwningProcess)"`;
      let pid = null;
      try {
        const out = execSync(cmd, { shell: process.platform === 'win32', stdio: ['ignore', 'pipe', 'pipe'], timeout: 5000 });
        const v = out.toString().trim();
        if (v && v !== 'undefined' && v.length > 0) pid = v;
      } catch { pid = null; }
      if (pid) {
        clearTimeout(timer);
        fs.mkdirSync(path.dirname(LAUNCH_LOG), { recursive: true });
        fs.writeFileSync(LAUNCH_LOG, JSON.stringify({ pid: Number(pid), port: PORT, dev: DEV_MODE, startedAt: new Date().toISOString(), cmd: 'cmd /c start /b node ...' }, null, 2));
        console.log('  ✓ 伺服器已監聽 ' + PORT + '，OwningProcess=' + pid);
        console.log('  停止指令: Stop-Process -Id ' + pid + ' -Force');
        return resolve(Number(pid));
      }
      setTimeout(poll, 1000);
    };
    setTimeout(poll, 3000); // 先給 3 秒啟動緩衝
  });
}

/** 驗證首頁 HTTP 200 */
function verifyHttp(port) {
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:${port}/`, (res) => {
      let len = 0;
      res.on('data', (d) => (len += d.length));
      res.on('end', () => {
        console.log(`  ✓ 首頁 http://localhost:${port}/ 回應 HTTP ${res.statusCode}（${len} bytes）`);
        resolve(res.statusCode === 200);
      });
    });
    req.on('error', (e) => {
      console.log('  ✗ 首頁驗證失敗: ' + e.message);
      resolve(false);
    });
    req.setTimeout(6000, () => { req.destroy(); resolve(false); });
  });
}

// ── 主流程 ───────────────────────────────────────────────────────────
async function main() {
  step('==== 一鍵本機啟動與資料同步 ====');
  console.log('平台: ' + process.platform + ' | node: ' + process.version + ' | 埠: ' + PORT + ' | 模式: ' + (DEV_MODE ? 'dev' : '正式'));
  console.log('過期門檻: ' + STALE_HOURS + ' 小時');

  // 1. 過期偵測
  const staleness = checkTrendingStaleness();
  step('Step 1: 偵測 weekly-trending.json 新鮮度');
  console.log('  ' + JSON.stringify(staleness, null, 2).split('\n').map((l) => '    ' + l));

  // 2. 決定是否跑 trending + build
  const shouldTrending = !SKIP_TRENDING && (FORCE_TRENDING || staleness.stale);
  if (shouldTrending) {
    await runNpm('trending', 'GitHub 每週漲星探勘（更新到最新資料）');
    await runNpm('build', '同步 dist/（讓正式伺服器服務最新資料）');
  } else {
    step('Step 2: 跳過 trending 同步（--no-trending 或資料新鮮）');
    // 仍確保 dist 存在（正式模式需要）
    if (!DEV_MODE) {
      const distIndex = path.join(ROOT, 'dist', 'index.html');
      if (!fs.existsSync(distIndex)) {
        console.log('  dist/index.html 不存在，先 build');
        await runNpm('build', '確保 dist/ 存在');
      } else {
        console.log('  ✓ dist/ 已存在，無需重新 build');
      }
    }
  }

  // 3. 背景啟動伺服器
  const pid = await startServerBackground();

  // 4. 驗證 HTTP
  const ok = await verifyHttp(PORT);

  // 5. 結果
  logResult(ok ? '✅ 啟動成功' : '⚠ 啟動異常（請查 .agnes/dev-server.log）', [
    `模式: ${DEV_MODE ? 'dev（服務 web/，即時修改）' : '正式（服務 dist/）'}`,
    `存取: http://localhost:${PORT}/`,
    `圖譜: http://localhost:${PORT}/knowledge-graph.html`,
    `node PID: ${pid}`,
    `停止: Stop-Process -Id ${pid} -Force`,
    `日誌: .agnes/dev-server.log`
  ]);
  if (!ok) process.exitCode = 1;
}

main().catch((e) => {
  console.error('\n❌ 啟動失敗: ' + e.message);
  process.exitCode = 1;
});
