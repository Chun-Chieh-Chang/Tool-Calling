import { search, listByCategory, warmSearchIndex, getCachedSearch as getInMemoryCache, cacheSearchResults as setInMemoryCache, getRegistryCacheFingerprint } from './core/search-engine.js';
import { persistCache } from './persist-cache.js';
import { behaviorTracker } from './behavior-tracker.js';

let registryTools = [];
let categoryChartInstance = null;
let languageChartInstance = null;
let currentTab = 'dashboard';

// DOM Elements
const searchInput = document.getElementById('searchInput');
const categorySelect = document.getElementById('categorySelect');
const resultsGrid = document.getElementById('resultsGrid');
const resultCount = document.getElementById('resultCount');
const toolCardTemplate = document.getElementById('toolCardTemplate');

const dashboardTabBtn = document.getElementById('dashboardTabBtn');
const toolsTabBtn = document.getElementById('toolsTabBtn');
const trendingTabBtn = document.getElementById('trendingTabBtn');

const dashboardView = document.getElementById('dashboardView');
const toolsView = document.getElementById('toolsView');
const trendingView = document.getElementById('trendingView');

const kpiTotalTools = document.getElementById('kpiTotalTools');
const kpiTotalCategories = document.getElementById('kpiTotalCategories');
const kpiTotalSubtools = document.getElementById('kpiTotalSubtools');
const categoryOverviewGrid = document.getElementById('categoryOverviewGrid');

const trendingWorldWeek = document.getElementById('trendingWorldWeek');
const trendingDateRange = document.getElementById('trendingDateRange');
const trendingScannedCount = document.getElementById('trendingScannedCount');
const trendingAddedCount = document.getElementById('trendingAddedCount');
const leaderboardBody = document.getElementById('leaderboardBody');
const newlyAddedGrid = document.getElementById('newlyAddedGrid');
// 新增 DOM refs for 雙週展示與刷新按鈕
const lastWeekDateRangeLabel = document.getElementById('lastWeekDateRangeLabel');
const currentWeekDateRangeLabel = document.getElementById('currentWeekDateRangeLabel');
const currentWeekLeaderboardBody = document.getElementById('currentWeekLeaderboardBody');
const refreshTrendingBtn = document.getElementById('refreshTrendingBtn');

// 初始化
/**
 * 靜態展示站導流橫幅（2026-10-15 Q2=A）。
 * 本機工作台與 live 服務本身就是完整版，不需要橫幅；只有第三方純靜態託管
 * （GitHub Pages）才顯示，把訪客導向 live 工作台——遙測回流與「加入工具庫」
 * 提名管線都只在 live 環境完整可用，找不到入口＝真人遙測永遠 0 筆。
 *
 * 🔴 判斷方式刻意用「能力探測」而非主機名稱白名單：live 工作台的公開網址
 *    每次重新發佈都會換一組（2026-10-15 第七輪實測：連續三次部署得到三個
 *    不同連結，舊連結全部失效），寫死清單必然過期——而過期的後果是橫幅
 *    反過來出現在 live 工作台上，對著完整版的使用者說「你正在瀏覽靜態
 *    展示版」。探測後端則永遠跟著現實走，且不需隨部署維護。
 */
async function setupStaticSiteBanner() {
  const banner = document.getElementById('staticSiteBanner');
  if (!banner) return;
  try {
    const res = await fetch('./api/trending/status', { method: 'GET' });
    if (res.ok) return; // 有後端＝這裡就是完整版，不顯示橫幅
  } catch {
    // 純靜態託管：fetch 失敗（Pages 回 404 或網路不可達）→ 往下顯示橫幅
  }
  banner.hidden = false;
}

/**
 * 取得工具庫主檔（registry/tools.json）。
 *
 * 🔴 為什麼包裝一層：2026-10-18 live 工作空間降級時，這支 3MB 的靜態檔
 *    取料失敗，但 init() 的 catch 只把暗色的 resultCount 改成「載入失敗」
 *    （在「工具目錄」分頁的摺疊區）——KPI 卡片靜靜顯示「--」、圖表全空，
 *    使用者看到的是「工具庫是空的」而不是「資料沒載到」。取不到主檔就必須
 *    向前端大聲報錯，不能靜默退化。
 *
 * 空陣列／缺 tools 欄位一律視為失敗：SSOT 有 771 筆工具，「合法但空」的
 * 回應只可能是毀損或半成品快取。
 */
async function fetchRegistryData() {
  const res = await fetch('./registry/tools.json');
  if (!res.ok) throw new Error(`registry/tools.json 回應 HTTP ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data.tools)) throw new Error('registry/tools.json 格式不完整（缺少 tools 陣列）');
  if (data.tools.length === 0) throw new Error('registry/tools.json 的 tools 陣列是空的');
  return data;
}

/** 顯示工具庫載入失敗橫幅（紅色告警＋重試按鈕）。 */
function showRegistryError(err) {
  console.error('[Registry] 載入失敗：', err);
  const banner = document.getElementById('registryError');
  const msg = document.getElementById('registryErrorMessage');
  const detail = err && err.message ? err.message : String(err);
  if (msg) msg.textContent = `原因：${detail}`;
  if (banner) banner.hidden = false;
  const btn = document.getElementById('registryRetryBtn');
  if (btn && !btn.dataset.bound) {
    btn.dataset.bound = '1';
    btn.addEventListener('click', () => {
      btn.disabled = true;
      btn.textContent = '重試中…';
      location.reload();
    });
  }
}

async function init() {
  setupStaticSiteBanner();
  let data;
  try {
    data = await fetchRegistryData();
  } catch (firstErr) {
    // 一次自動重試：公開工作台的靜態檔偶發失敗（2026-10-18 實測：同一頁面
    // 的 API 有回應、唯獨 3MB 主檔失敗）。重試仍失敗才亮橫幅。
    await new Promise((r) => setTimeout(r, 1200));
    try {
      data = await fetchRegistryData();
    } catch (secondErr) {
      // 沒有主檔就沒有初始化意義——早退，且必須讓使用者看見（不能靜默 "--"）
      showRegistryError(secondErr);
      if (resultCount) resultCount.textContent = '載入失敗，請稍後再試。';
      return;
    }
    console.warn('[Registry] 首次載入失敗，重試成功：', firstErr.message);
  }

  try {
    registryTools = Array.isArray(data.tools) ? data.tools : [];

    populateCategories();
    renderDashboard();
    renderTools(registryTools);

    // 預熱搜尋索引（主線程）
    const warm = () => warmSearchIndex(registryTools);
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(warm);
    } else {
      setTimeout(warm, 0);
    }
    
    // 初始化持久化快取
    persistCache.init().then(() => {
      console.log('[Cache] IndexedDB initialized');
    }).catch(err => {
      console.warn('[Cache] IndexedDB init failed:', err.message);
    });

    // 事件監聽
    searchInput.addEventListener('input', debounce(handleSearch, 300));
    categorySelect.addEventListener('change', handleSearch);

    if (dashboardTabBtn) dashboardTabBtn.addEventListener('click', () => switchTab('dashboard'));
    if (toolsTabBtn) toolsTabBtn.addEventListener('click', () => switchTab('tools'));
    if (trendingTabBtn) trendingTabBtn.addEventListener('click', () => switchTab('trending'));

    // 綁定每週漲星榜即時刷新按鈕
    setupRefreshTrendingButton();

    // 綁定「加入工具庫」按鈕事件委派
    setupAddToRegistryButtons();

    // 綁定「關閉系統」按鈕
    setupShutdownButton();

    // 綁定「操作流程」步驟條：點擊 .wf-step → 聚焦目標控件並閃高亮
    setupWorkflowSteps();

  } catch (err) {
    // 初始化期的其他錯誤（非取料失敗）：只記主控台，不亮「載入失敗」橫幅
    console.error('[Init] 初始化失敗：', err);
    if (resultCount) resultCount.textContent = '初始化失敗，請重新整理頁面。';
  }
}

// ─── 操作流程步驟條 ──────────────────────────────────────────────────────
function setupWorkflowSteps() {
  const bar = document.querySelector('.workflow-steps');
  if (!bar) return;
  bar.addEventListener('click', (e) => {
    const btn = e.target.closest('.wf-step');
    if (!btn) return;
    const sel = btn.dataset.focus;
    if (!sel) return;
    const target = document.querySelector(sel);
    if (!target) return;
    target.scrollIntoView({ block: 'center', behavior: 'smooth' });
    try { target.focus({ preventScroll: true }); } catch { target.focus(); }
    target.classList.remove('wf-pulse');
    // 觸發 reflow 讓 animation 可重複播放
    void target.offsetWidth;
    target.classList.add('wf-pulse');
    setTimeout(() => target.classList.remove('wf-pulse'), 2000);
  });
}

// ─── 關閉系統 ─────────────────────────────────────────────────────────────
// 呼叫後端 /api/shutdown 讓 Node 程序優雅退出，並嘗試關閉分頁。
// 瀏覽器出於安全限制通常不允許指令關閉使用者開啟的分頁，
// 因此若 window.close() 無效，改用全螢幕覆蓋提示用戶手動關閉。
function setupShutdownButton() {
  const btn = document.getElementById('shutdownBtn');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    const ok = window.confirm('確定要關閉本地伺服器並離開工作台嗎？\n未完成的背景任務將中斷。');
    if (!ok) return;
    btn.disabled = true;
    const label = btn.querySelector('span');
    if (label) label.textContent = '關閉中…';
    try {
      await fetch('/api/shutdown', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: 'SHUTDOWN' }),
        credentials: 'same-origin',
      });
    } catch (e) {
      // 伺服器退出時 fetch 可能拋錯，這是預期行為
    }
    showShutdownOverlay();
    window.close();
  });
}

function showShutdownOverlay() {
  if (document.getElementById('shutdownOverlay')) return;
  const overlay = document.createElement('div');
  overlay.id = 'shutdownOverlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,0.94);color:#f8fafc;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;z-index:99999;font-family:system-ui,-apple-system,sans-serif;text-align:center;padding:24px;';
  const icon = document.createElement('div');
  icon.style.fontSize = '32px';
  icon.textContent = '⏹';
  const title = document.createElement('div');
  title.style.cssText = 'font-size:20px;font-weight:700;letter-spacing:1px;';
  title.textContent = '伺服器已關閉';
  const body = document.createElement('div');
  body.style.cssText = 'font-size:14px;opacity:0.85;line-height:1.6;';
  body.append('您可以關閉此分頁。');
  body.appendChild(document.createElement('br'));
  body.append('如需重新啟動，請於終端機執行 ');
  const code = document.createElement('code');
  code.style.cssText = 'background:rgba(255,255,255,0.12);padding:2px 6px;border-radius:4px;';
  code.textContent = 'npm start';
  body.appendChild(code);
  overlay.append(icon, title, body);
  document.body.appendChild(overlay);
}

// ─── 分頁切換 (Tab Switcher) ──────────────────────────────────────────────

function switchTab(tabName) {
  currentTab = tabName;
  dashboardView.style.display = tabName === 'dashboard' ? 'block' : 'none';
  toolsView.style.display = tabName === 'tools' ? 'block' : 'none';
  if (trendingView) trendingView.style.display = tabName === 'trending' ? 'block' : 'none';

  dashboardTabBtn.classList.toggle('active', tabName === 'dashboard');
  toolsTabBtn.classList.toggle('active', tabName === 'tools');
  if (trendingTabBtn) trendingTabBtn.classList.toggle('active', tabName === 'trending');

  if (tabName === 'trending') {
    loadWeeklyTrending();
  }
}

// ─── 儀表板計算與渲染 ───────────────────────────────────────────────────

function renderDashboard() {
  if (!Array.isArray(registryTools) || registryTools.length === 0) return;

  // 1. KPI 數據統計
  const totalTools = registryTools.length;
  const categoriesSet = new Set();
  let totalSubtools = 0;
  const categoryCounts = {};
  const languageCounts = {};

  for (const tool of registryTools) {
    if (!tool) continue;
    const cats = getToolCategories(tool);
    for (const cat of cats) {
      categoriesSet.add(cat);
      categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
    }

    if (Array.isArray(tool.subTools)) {
      totalSubtools += tool.subTools.length;
    }

    const lang = tool.language || '其他 / 常規';
    languageCounts[lang] = (languageCounts[lang] || 0) + 1;
  }

  if (kpiTotalTools) kpiTotalTools.textContent = totalTools;
  const hintToolCount = document.getElementById('hintToolCount');
  if (hintToolCount) hintToolCount.textContent = totalTools;
  if (kpiTotalCategories) kpiTotalCategories.textContent = categoriesSet.size;
  if (kpiTotalSubtools) kpiTotalSubtools.textContent = `~${totalSubtools}+`;

  // 2. 渲染圖表
  renderCategoryChart(categoryCounts);
  renderLanguageChart(languageCounts);

  // 3. 渲染分類概覽卡片
  renderCategoryOverview(categoryCounts);
}

// ─── Chart.js 統計圖表 ─────────────────────────────────────────────────

function renderCategoryChart(categoryCounts) {
  const canvas = document.getElementById('categoryChart');
  if (!canvas || typeof Chart === 'undefined') return;

  const sortedCategories = Object.entries(categoryCounts)
    .sort((a, b) => b[1] - a[1]);

  const labels = sortedCategories.map(item => item[0]);
  const dataValues = sortedCategories.map(item => item[1]);

  if (categoryChartInstance) {
    categoryChartInstance.destroy();
  }

  const ctx = canvas.getContext('2d');
  categoryChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: '工具數量',
        data: dataValues,
        backgroundColor: 'rgba(53, 100, 212, 0.75)',
        borderColor: '#3564d4',
        borderWidth: 1,
        borderRadius: 4,
        hoverBackgroundColor: '#2a52b8'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#0f172a',
          titleColor: '#ffffff',
          bodyColor: '#cbd5e1',
          borderColor: '#334155',
          borderWidth: 1,
          padding: 10,
          displayColors: false
        }
      },
      scales: {
        x: {
          ticks: { color: '#475569', font: { size: 11, weight: '600' } },
          grid: { display: false }
        },
        y: {
          ticks: { color: '#475569', font: { size: 11, weight: '600' } },
          grid: { color: 'rgba(203, 213, 225, 0.6)' }
        }
      },
      onClick: (event, elements) => {
        if (elements.length > 0) {
          const index = elements[0].index;
          const clickedCategory = labels[index];
          if (clickedCategory && categorySelect) {
            categorySelect.value = clickedCategory;
            handleSearch();
            switchTab('tools');
          }
        }
      }
    }
  });
}

function renderLanguageChart(languageCounts) {
  const canvas = document.getElementById('languageChart');
  if (!canvas || typeof Chart === 'undefined') return;

  const sortedLangs = Object.entries(languageCounts)
    .sort((a, b) => b[1] - a[1]);

  const labels = sortedLangs.map(item => item[0]);
  const dataValues = sortedLangs.map(item => item[1]);

  const palette = [
    '#3564d4', '#06b6d4', '#0d9488', '#10b981', 
    '#f59e0b', '#6366f1', '#8b5cf6', '#64748b'
  ];

  if (languageChartInstance) {
    languageChartInstance.destroy();
  }

  const ctx = canvas.getContext('2d');
  languageChartInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data: dataValues,
        backgroundColor: palette.slice(0, labels.length),
        borderColor: '#ffffff',
        borderWidth: 2,
        hoverOffset: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'right',
          labels: {
            color: '#475569',
            font: { size: 12, weight: '500' },
            boxWidth: 12,
            padding: 10
          }
        },
        tooltip: {
          backgroundColor: '#0f172a',
          titleColor: '#ffffff',
          bodyColor: '#cbd5e1',
          borderColor: '#334155',
          borderWidth: 1,
          padding: 10
        }
      }
    }
  });
}

function getCategoryStarScore(catTools) {
  if (!Array.isArray(catTools)) return 0;
  return catTools.reduce((sum, t) => sum + (t ? (t.stars || 0) : 0), 0);
}

// ─── HTML 轉義工具函式 (XSS 防護) ──────────────────────────────────────────

/**
 * 轉義 HTML 特殊字元，防止動態資料注入 (Stored XSS 修復)
 * @param {*} value - 要轉義的值
 * @returns {string} 轉義後的字串
 */
function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * 驗證並清洗 URL：僅允許 http/https 協議，防止 javascript: 等偽協議注入
 * @param {*} url - 原始 URL
 * @returns {string} 安全 URL 或 '#' 
 */
function safeUrl(url) {
  if (typeof url !== 'string' || !url || url === '#') return '#';
  try {
    const parsed = new URL(url, window.location.href);
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') ? parsed.href : '#';
  } catch (e) {
    return '#';
  }
}

function formatStarCount(num) {
  if (!num || isNaN(num)) return '0';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'k';
  return String(num);
}

// ─── 渲染：分類條目面板卡片 (按 Star 數由高到低，由左至右、由上至下排列) ───

function renderCategoryOverview(categoryCounts) {
  if (!categoryOverviewGrid) return;
  categoryOverviewGrid.innerHTML = '';

  const grouped = {};
  for (const tool of registryTools) {
    if (!tool) continue;
    const cats = getToolCategories(tool);
    for (const cat of cats) {
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(tool);
    }
  }

  // 按照 Star 數總和由高到低（由左至右、由上至下）排序分類
  const sortedCategories = Object.keys(grouped).sort((a, b) => {
    const scoreA = getCategoryStarScore(grouped[a]);
    const scoreB = getCategoryStarScore(grouped[b]);
    if (scoreB !== scoreA) return scoreB - scoreA;
    return grouped[b].length - grouped[a].length;
  });

  for (const cat of sortedCategories) {
    // 類別內工具亦按 Star 數排序
    const catTools = grouped[cat].sort((a, b) => (b.stars || 0) - (a.stars || 0));
    const totalStars = getCategoryStarScore(catTools);
    const card = document.createElement('div');
    card.className = 'cat-card glass-panel';

    const topToolsList = catTools.slice(0, 3).map(t => `<li>${escapeHtml(t.name)} ${t.stars ? `<span style="opacity:0.6;font-size:0.75rem;">(⭐${formatStarCount(t.stars)})</span>` : ''}</li>`).join('');

    card.innerHTML = `
      <div>
        <div class="cat-card-header">
          <span class="cat-name">${escapeHtml(cat)}</span>
          <span class="cat-badge">⭐ ${formatStarCount(totalStars)} • ${catTools.length} 個條目</span>
        </div>
        <ul class="cat-preview-list">
          ${topToolsList}
        </ul>
      </div>
      <div class="cat-card-footer">
        <span>探索該分類工具 →</span>
      </div>
    `;

    card.addEventListener('click', () => {
      if (categorySelect) {
        categorySelect.value = cat;
        handleSearch();
        switchTab('tools');
      }
    });

    categoryOverviewGrid.appendChild(card);
  }
}

// ─── 每週漲星榜數據載入與渲染 ──────────────────────────────────────────────

let weeklyTrendingLoaded = false;

/**
 * 共用排行榜列渲染函式
 * @param {HTMLElement} tbody - 目標 tbody
 * @param {Array} items - 排行榜資料
 * @param {boolean} isWip - 是否為「進行中」（本週迄今）模式
 */
function renderLeaderboardRows(tbody, items, isWip = false) {
  tbody.innerHTML = '';
  if (!items || items.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-secondary); padding: 24px;">尚無資料</td></tr>`;
    return;
  }

  const top10 = items.slice(0, 10);
  top10.forEach(item => {
    const tr = document.createElement('tr');
    const rankClass = item.rank === 1 ? 'rank-1' : item.rank === 2 ? 'rank-2' : item.rank === 3 ? 'rank-3' : 'rank-other';
    const rankEmoji = item.rank === 1 ? '🥇' : item.rank === 2 ? '🥈' : item.rank === 3 ? '🥉' : item.rank;

    // 格式化時間顯示（直接使用標準 ISO World Week 日期字串，防止時區偏移）
    const startTime = item.startStarsAt ? String(item.startStarsAt).slice(0, 10) : '-';
    const endTime = item.endStarsAt ? String(item.endStarsAt).slice(0, 10) : '-';
    const prevDisplay = item.prevStars > 0 ? item.prevStars.toLocaleString() : '首次';
    const currDisplay = item.currentStars.toLocaleString();
    const deltaStr = item.delta > 0 ? `+${item.delta.toLocaleString()}` : `${item.currentStars.toLocaleString()} (待比對)`;

    // 正式模式：標準藍色 delta-badge；WIP 模式：琥珀色 delta-badge-wip
    const deltaBadgeClass = isWip ? 'delta-badge-wip' : 'delta-badge';
    // 狀態 badge / 按鈕
    let statusHtml;
    if (!isWip) {
      const statusClass = item.isNewlyAdded ? 'newly-added' : 'in-registry';
      statusHtml = `<span class="status-badge ${statusClass}">${escapeHtml(item.statusText || '--')}</span>`;
    } else {
      statusHtml = `<button class="add-to-registry-btn" data-url="${safeUrl(item.url)}" data-name="${escapeHtml(item.name)}">＋ 加入工具庫</button>`;
    }

    tr.innerHTML = `
      <td style="text-align: center;"><span class="rank-badge ${rankClass}">${rankEmoji}</span></td>
      <td><strong>${escapeHtml(item.name)}</strong></td>
      <td><a href="${safeUrl(item.url)}" target="_blank" rel="noopener noreferrer" style="color: var(--brand-color); text-decoration: none;">${escapeHtml(item.fullName)} ↗</a></td>
      <td>
        <div style="font-size: 14px; font-weight: bold;">⭐ ${currDisplay}</div>
        <div style="font-size: 11px; color: var(--text-secondary); margin-top: 2px;">
          起: ${prevDisplay} (${startTime})<br>
          終: ${currDisplay} (${endTime})
        </div>
      </td>
      <td><span class="${deltaBadgeClass}">🔥 ${deltaStr}</span></td>
      <td><span class="category-tag">${escapeHtml(item.category)}</span></td>
      <td style="text-align: center;">${statusHtml}</td>
    `;
    tbody.appendChild(tr);
  });
}

async function loadWeeklyTrending(forceRefresh = false) {
  if (!leaderboardBody) return;
  if (weeklyTrendingLoaded && !forceRefresh) return;

  try {
    const fetchUrl = forceRefresh ? `./registry/weekly-trending.json?t=${Date.now()}` : './registry/weekly-trending.json';
    const res = await fetch(fetchUrl);
    if (!res.ok) throw new Error('Weekly trending data not found');
    const data = await res.json();

    // ── 更新頂部 header 摘要（顯示上週正式資訊）──
    const lastWeekData = data.lastWeek || {};
    const currWeekData = data.currentWeekToDate || {};

    if (trendingWorldWeek) {
      trendingWorldWeek.textContent = `🏆 GitHub 每週漲星排行榜 (${lastWeekData.weekStr || data.worldWeek || '--'})`;
    }
    if (trendingDateRange) {
      trendingDateRange.textContent = `上週統計區間：${lastWeekData.dateRange || data.dateRange || '近 7 天'}`;
    }
    const scannedCount = data.activeReposCount || data.scannedReposCount || data.trackedPoolSize || 0;
    if (trendingScannedCount) trendingScannedCount.textContent = scannedCount ? scannedCount.toLocaleString() : '--';
    if (trendingAddedCount) trendingAddedCount.textContent = `${lastWeekData.newlyAddedCount ?? data.newlyAddedCount ?? 0} 個工具`;

    // ── 更新各 section 的日期範圍標籤 ──
    if (lastWeekDateRangeLabel && lastWeekData.dateRange) {
      lastWeekDateRangeLabel.textContent = `${lastWeekData.dateRange} · 已列入工具箱納入判斷`;
    }
    if (currentWeekDateRangeLabel) {
      const toDateRange = currWeekData.dateRange || '--';
      currentWeekDateRangeLabel.textContent = currWeekData.asOfDate
        ? `${toDateRange}（截至 ${currWeekData.asOfDate}）· 統計進行中`
        : toDateRange;
    }

    // ── 1. 渲染上週正式排行榜 (lastWeek) ──
    const lastWeekItems = (lastWeekData.top10 || data.top10 || []);
    renderLeaderboardRows(leaderboardBody, lastWeekItems, false);

    // ── 2. 渲染本週迄今預覽排行榜 (currentWeekToDate) ──
    const currentWeekItems = (currWeekData.top10 || []);
    if (currentWeekLeaderboardBody) {
      renderLeaderboardRows(currentWeekLeaderboardBody, currentWeekItems, true);
    }

    // ── 3. 渲染上週新納入工具特寫 (Newly Added Tools Highlight) ──
    if (newlyAddedGrid) {
      newlyAddedGrid.innerHTML = '';
      const rawList = lastWeekItems;
      const addedTools = Array.isArray(data.addedTools) ? data.addedTools : rawList.filter(item => item.isNewlyAdded);
      if (addedTools.length === 0) {
        newlyAddedGrid.innerHTML = '<div style="grid-column: 1 / -1; color: var(--text-secondary); text-align: center; padding: 24px;">上週探勘之 Top 10 工具皆已在庫存中，暫無新增入庫工具。</div>';
      } else {
        addedTools.forEach(tool => {
          const card = createToolCard(tool, null, null, [], tool.category);
          if (card) newlyAddedGrid.appendChild(card);
        });
      }
    }

    weeklyTrendingLoaded = true;
  } catch (err) {
    console.warn('Could not load weekly trending JSON:', err);
    if (leaderboardBody) {
      leaderboardBody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--text-secondary); padding: 24px;">尚未生成當週漲星數據報告。您可以執行 `npm run trending` 手動生成。</td></tr>';
    }
  }
}

/**
 * 綁定每週漲星即時刷新按鈕
 */
function setupRefreshTrendingButton() {
  if (!refreshTrendingBtn) return;

  refreshTrendingBtn.addEventListener('click', async () => {
    const textSpan = refreshTrendingBtn.querySelector('.refresh-text');
    const originalText = textSpan ? textSpan.textContent : '🔄 刷新當日即時數據';

    // 進入 loading 狀態
    refreshTrendingBtn.classList.add('loading');
    refreshTrendingBtn.disabled = true;
    if (textSpan) textSpan.textContent = '⏳ 正在向 GitHub 探勘中...';

    try {
      // 觸發伺服器端刷新 API
      const res = await fetch('/api/trending/refresh', { credentials: 'same-origin' });
      
      if (res.status === 404) {
        // 純前端靜態託管（如 GitHub Pages）
        alert('ℹ 當前處於線上靜態展示模式。線上數據每週一凌晨由 GitHub Actions 自動定時探勘更新。\n\n若需即時探勘，請在本地終端機執行 `npm run trending`。');
        if (textSpan) textSpan.textContent = originalText;
        refreshTrendingBtn.classList.remove('loading');
        refreshTrendingBtn.disabled = false;
        return;
      }

      // 輪詢直到掃描完成
      const pollInterval = setInterval(async () => {
        try {
          const statusRes = await fetch('/api/trending/status');
          if (statusRes.ok) {
            const statusData = await statusRes.json();
            if (!statusData.isScanning) {
              clearInterval(pollInterval);
              // 強制重新載入前端 JSON
              await loadWeeklyTrending(true);
              
              if (textSpan) textSpan.textContent = '✅ 已刷新為最新即時數據！';
              refreshTrendingBtn.classList.remove('loading');
              
              setTimeout(() => {
                if (textSpan) textSpan.textContent = originalText;
                refreshTrendingBtn.disabled = false;
              }, 2500);
            }
          }
        } catch {
          // 網路暫態錯誤，繼續下一輪輪詢
        }
      }, 2000);

    } catch (err) {
      console.warn('Refresh request failed:', err);
      if (textSpan) textSpan.textContent = '⚠ 刷新失敗，請確認伺服器已啟動';
      setTimeout(() => {
        if (textSpan) textSpan.textContent = originalText;
        refreshTrendingBtn.classList.remove('loading');
        refreshTrendingBtn.disabled = false;
      }, 3000);
    }
  });
}

/**
 * 綁定「加入工具庫」按鈕（事件委派於 leaderboardBody）
 *
 * 2026-10-15 Q1=B：非本機（GitHub Pages／公開實例）沒有 server.js 的
 * /api/tools/add（端點刻意只允許 localhost，見 web/server.js 雙閘門），
 * 改開 Web 提名對話框：瀏覽器端掃描＋補齊 → 預覽 → Cloudflare Worker 開 PR。
 * 本機行為完全不變（維持背景補齊直接入庫）。
 */
function setupAddToRegistryButtons() {
  const target = currentWeekLeaderboardBody || leaderboardBody;
  if (!target) return;
  // 部署模式判定與 web/server.js 同一組旗標（Host 頭本地值）
  const isLocalWorkbench = ['localhost', '127.0.0.1', '::1', '[::1]']
    .includes(String(location.hostname || '').toLowerCase());

  target.addEventListener('click', async (e) => {
    const btn = e.target.closest('.add-to-registry-btn');
    if (!btn) return;

    const toolUrl = btn.dataset.url;
    const toolName = btn.dataset.name;
    if (!toolUrl) return;

    if (!isLocalWorkbench) {
      // 純靜態託管：開提名對話框（動態 import，本機工作台不會載入這段依賴）
      try {
        // 雙路徑：部署樹 dist/pipeline/（'./…'）與原始碼樹 repo/pipeline/（'../…'）
        // 兩邊深度不同，各試一次；都不行才報錯（見 pipeline/ 檔頭版面註解）
        let dialogMod = null;
        for (const p of ['./pipeline/add-tool-dialog.js', '../pipeline/add-tool-dialog.js']) {
          try { dialogMod = await import(p); break; } catch { /* 試下一個路徑 */ }
        }
        if (!dialogMod) throw new Error('找不到提名對話框模組');
        await dialogMod.openAddToolDialog({ url: toolUrl, name: toolName });
      } catch (err) {
        console.warn('Add tool dialog failed:', err);
        window.alert(`無法開啟提名對話框：${err.message}\n\n也可在本機執行：node cli.js add ${toolUrl}`);
      }
      return;
    }

    const confirmed = window.confirm(`確認將「${toolName}」加入工具庫？\n\n${toolUrl}`);
    if (!confirmed) return;

    btn.disabled = true;
    btn.textContent = '⏳ 加入中...';

    try {
      const res = await fetch('/api/tools/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: toolUrl })
      });
      const data = await res.json();

      if (data.status === 'exists') {
        btn.textContent = '✅ 已存在';
        btn.classList.add('added');
      } else if (data.status === 'added') {
        btn.textContent = '✅ 已加入';
        btn.classList.add('added');
      } else {
        btn.textContent = '❌ 失敗';
        btn.classList.add('failed');
        setTimeout(() => { btn.textContent = '＋ 加入工具庫'; btn.disabled = false; btn.classList.remove('failed'); }, 3000);
      }
    } catch (err) {
      console.warn('Add tool failed:', err);
      btn.textContent = '❌ 網路錯誤';
      btn.classList.add('failed');
      setTimeout(() => { btn.textContent = '＋ 加入工具庫'; btn.disabled = false; btn.classList.remove('failed'); }, 3000);
    }
  });
}


// ─── 分類工具函式 ────────────────────────────────────────────────────────

/**
 * 取得工具的所有分類（支援 string 與 array 格式）
 * @returns {string[]}
 */
function getToolCategories(tool) {
  if (!tool || !tool.category) return ['未分類'];
  if (Array.isArray(tool.category)) return tool.category.length > 0 ? tool.category : ['未分類'];
  return [tool.category];
}

/**
 * 檢查工具是否屬於某個分類
 */
function toolBelongsToCategory(tool, category) {
  if (!tool) return false;
  const cats = getToolCategories(tool);
  return cats.includes(category);
}

// 產生分類選單
function populateCategories() {
  const allCats = new Set();
  for (const tool of registryTools) {
    for (const cat of getToolCategories(tool)) {
      allCats.add(cat);
    }
  }
  const sorted = Array.from(allCats).sort();
  sorted.forEach(cat => {
    const option = document.createElement('option');
    option.value = cat;
    option.textContent = cat;
    categorySelect.appendChild(option);
  });
}

// ─── 統一四視圖連動同步引擎 (Unified 4-View Sync Engine) ────────────────────

function handleSearch() {
  const startTime = Date.now();
  syncAllViews();
  const duration = Date.now() - startTime;

  // 記錄搜尋行為
  const query = searchInput ? searchInput.value.trim() : '';
  if (query.length > 0) {
    behaviorTracker.recordSearch(query, [], duration);
  }
}

/**
 * 走 server 檢索（與 MCP / CLI 共用 core/ 引擎：agent 四維 + fusion 融合）
 *
 * 為什麼要改走 server：前端原本自行實作 TF-IDF（search-worker.js）與 L2，
 * 與 core/ 的引擎是兩套不同實作，導致檢索引擎的改進無法反映到網頁
 * （實測 Hit@1 差距 16.7% vs 38.1%）。
 *
 * 延遲實測（2026-09-16）：
 *   詞彙引擎（rerank=false）  平均 119ms  → 適合即時搜尋
 *   含 LLM rerank（rerank=true）平均 5365ms → 太慢，已移除「深度搜尋」開關
 *
 * 失敗時回傳 null，由呼叫端退回原本的 Worker / 主線程流程（離線安全）。
 *
 * @param {string} query
 * @param {{topK?: number, category?: string}} [options]
 * @returns {Promise<Array|null>} 工具陣列，失敗時 null
 */
async function serverSearch(query, options = {}) {
  try {
    const res = await fetch('/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        topK: options.topK || 100,
        category: options.category || undefined,
      }),
    });
    if (!res.ok) throw new Error(`api ${res.status}`);
    const data = await res.json();
    if (Array.isArray(data.results)) {
      console.log(`[Search] server (${data.elapsedMs}ms, decision=${data.decision})`);
      return data.results;
    }
    return null;
  } catch (err) {
    console.warn('[Search] server unavailable, falling back:', err.message);
    return null;
  }
}

function syncAllViews() {
  const query = searchInput ? searchInput.value.trim() : '';
  const category = categorySelect ? categorySelect.value : '';

  // 如果使用者輸入搜尋或過濾條件，自動開啟列表視圖（若當前不在列表視圖）
  if ((query || category) && currentTab !== 'tools') {
    switchTab('tools');
  }

  if (!query && !category) {
    renderTools(registryTools);
  } else if (!query && category) {
    const filtered = (registryTools || []).filter(t => t && toolBelongsToCategory(t, category));
    renderSearchResults(filtered);
  } else {
    const options = { topK: 100 };
    if (category) options.category = category;
    
    // 先檢查持久化快取
    const cachedKey = `${query}|${category}`;
    persistCache.get(cachedKey).then(cached => {
      if (cached && cached.length > 0) {
        console.log('[Search] Cache hit from IndexedDB');
        renderSearchResults(cached);
        return;
      }
      
      // 檢查記憶體快取
      const registryVersion = getRegistryCacheFingerprint(registryTools || []);
      const memoryCached = getInMemoryCache(query, category, undefined, registryVersion);
      if (memoryCached && memoryCached.length > 0) {
        console.log('[Search] Cache hit from memory');
        renderSearchResults(memoryCached);
        return;
      }
      
      // 優先走 server 檢索（與 MCP / CLI 共用 core/ 引擎）
      serverSearch(query, { topK: options.topK, category }).then(serverResults => {
        if (serverResults) {
          setInMemoryCache(query, category, undefined, serverResults, registryVersion);
          renderSearchResults(serverResults);
          return;
        }

        // server 不可用 → 退回主線程 L2 關鍵字搜尋
        // （原本還有一層 Web Worker TF-IDF，但那是與 core/ 重複的第三套實作，
        //   且品質與 L2 同級，已移除）
        console.log('[Search] Using main thread search');
        const results = search(registryTools || [], query, options);
        setInMemoryCache(query, category, undefined, results, registryVersion);
        renderSearchResults(results);
      });
    }).catch(err => {
      console.error('[Search] Cache lookup failed:', err);
      // 出錯時回退到主線程
      const options = { topK: 100 };
      if (category) options.category = category;
      const results = search(registryTools || [], query, options);
      renderSearchResults(results);
    });
  }
}


// ─── 渲染：分類折疊 (Accordion) 模式 ──────────────────────────────────

// 狀態追蹤：記錄每個分類的展開/收合狀態
const sectionState = {};

function renderTools(tools) {
  resultsGrid.innerHTML = '';
  if (!Array.isArray(tools)) return;
  resultCount.textContent = `顯示 ${tools.length} 個工具`;

  // 按分類分組（支援多分類工具出現在多個 section）
  const grouped = {};
  for (const tool of tools) {
    if (!tool) continue;
    const cats = getToolCategories(tool);
    for (const cat of cats) {
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(tool);
    }
  }

  // 依 Star 數總和由高到低（由左至右、由上至下）排序分類
  const sortedCategories = Object.keys(grouped).sort((a, b) => {
    const scoreA = getCategoryStarScore(grouped[a]);
    const scoreB = getCategoryStarScore(grouped[b]);
    if (scoreB !== scoreA) return scoreB - scoreA;
    return grouped[b].length - grouped[a].length;
  });

  for (const cat of sortedCategories) {
    // 類別內的工具亦按 Star 數由高到低排序 (由左至右、由上至下)
    const catTools = grouped[cat].sort((a, b) => (b.stars || 0) - (a.stars || 0));
    const totalStars = getCategoryStarScore(catTools);
    const sectionId = `section-${cat.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '-')}`;

    // 預設全部展開
    if (sectionState[cat] === undefined) sectionState[cat] = true;
    const isOpen = sectionState[cat];

    // 建立 section 容器
    const section = document.createElement('div');
    section.className = 'accordion-section';

    // 建立 header
    const header = document.createElement('button');
    header.className = 'accordion-header';
    header.setAttribute('aria-expanded', String(isOpen));
    header.setAttribute('aria-controls', sectionId);
    header.innerHTML = `
      <div class="accordion-header-left">
        <span class="accordion-icon">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </span>
        <span class="accordion-title">${escapeHtml(cat)}</span>
        <span class="accordion-count">${catTools.length}</span>
      </div>
    `;

    header.addEventListener('click', () => {
      sectionState[cat] = !sectionState[cat];
      section.classList.toggle('open', sectionState[cat]);
      header.setAttribute('aria-expanded', String(sectionState[cat]));
    });

    // 建立 content 容器
    const content = document.createElement('div');
    content.id = sectionId;
    content.className = `accordion-content ${isOpen ? 'open' : ''}`;

    // 在 content 內建 grid
    const grid = document.createElement('div');
    grid.className = 'grid';
    for (const tool of catTools) {
      if (!tool) continue;
      const card = createToolCard(tool, null, null, [], cat);
      if (card) grid.appendChild(card);
    }
    content.appendChild(grid);

    section.appendChild(header);
    section.appendChild(content);
    resultsGrid.appendChild(section);
  }
}

// 搜尋結果：扁平列表（不分組）
function renderSearchResults(results) {
  resultsGrid.innerHTML = '';
  if (!Array.isArray(results)) {
    resultCount.textContent = '找到 0 個匹配工具';
    return;
  }
  resultCount.textContent = `找到 ${results.length} 個匹配工具`;

  // 搜尋時不使用 accordion，直接平鋪結果
  const grid = document.createElement('div');
  grid.className = 'grid';
  results.forEach(res => {
    if (!res) return;
    // res 可能是 search result 物件 { tool, score, matchLevel, matchedKeywords }
    // 也可能是純 tool 物件（來自 category filter）
    const tool = (res.tool && typeof res.tool === 'object') ? res.tool : (res.name ? res : null);
    if (!tool || !tool.name) return;
    const score = res.score ?? null;
    const matchLevel = res.matchLevel ?? null;
    const matchedKeywords = res.matchedKeywords || [];
    const card = createToolCard(tool, score, matchLevel, matchedKeywords);
    if (card) grid.appendChild(card);
  });
  resultsGrid.appendChild(grid);
}

// ─── 建立卡片 DOM ─────────────────────────────────────────────────────

function createToolCard(tool, score = null, matchLevel = null, matchedKeywords = [], currentCategory = null) {
  if (!tool || typeof tool !== 'object' || !tool.name) {
    console.warn('createToolCard received invalid tool object:', tool);
    return null;
  }

  const clone = toolCardTemplate.content.cloneNode(true);
  const article = clone.querySelector('article');

  clone.querySelector('.tool-name').textContent = tool.name;
  // 顯示層優先繁中譯文（由 web/server.js 在 /api/search 補上），否則回退原文
  clone.querySelector('.tool-desc').textContent = tool.description_zh || tool.description || '無描述';
  // 若卡片屬於多分類 section，顯示當前 section 的分類；否則顯示工具的分類
  const displayCat = currentCategory || getToolCategories(tool).join(' / ');
  clone.querySelector('.category-tag').textContent = displayCat;
  clone.querySelector('.github-link').href = safeUrl(tool.url);

  const badge = clone.querySelector('.match-badge');
  if (score !== null) {
    const percentage = Math.min(100, Math.round(score * 100));
    badge.textContent = `${percentage}% 匹配`;
    const progressBar = article.querySelector('.progress-bar');
    if (progressBar) progressBar.style.width = `${percentage}%`;

    if (matchLevel === 'L1-exact') badge.classList.add('exact');
    else if (matchLevel === 'L2-keyword') badge.classList.add('keyword');
    else badge.classList.add('semantic');
  } else {
    if (badge && tool.stars) {
      badge.textContent = `⭐ ${formatStarCount(tool.stars)}`;
      badge.style.display = 'inline-block';
      badge.classList.add('star-badge');
    } else if (badge) {
      badge.style.display = 'none';
    }
    const progressBarContainer = article.querySelector('.progress-bar-container');
    if (progressBarContainer) progressBarContainer.style.display = 'none';
  }

  const tagsContainer = clone.querySelector('.tags-container');
  if (tagsContainer) {
    if (tool.delta) {
      const deltaTag = document.createElement('span');
      deltaTag.className = 'tag';
      deltaTag.style.cssText = 'background: rgba(239, 68, 68, 0.15); color: #F87171; border: 1px solid rgba(239, 68, 68, 0.3); font-weight: 700;';
      deltaTag.textContent = `🔥 當週漲星 +${formatStarCount(tool.delta)}`;
      tagsContainer.appendChild(deltaTag);
    }
    if (tool.useCase || tool.useCase_zh) {
      const tag = document.createElement('span');
      tag.className = 'tag usecase';
      // 顯示層優先繁中（與 useCase/description 共用同一個原則）
      tag.textContent = '⭐ ' + (tool.useCase_zh || tool.useCase);
      tagsContainer.appendChild(tag);
    }
    if ((tool.negativeConstraints && tool.negativeConstraints.length > 0) || (tool.negativeConstraints_zh && tool.negativeConstraints_zh.length > 0)) {
      // 顯示層優先繁中（同 useCase 處理方式）；null 取首項
      const ncSource = (Array.isArray(tool.negativeConstraints_zh) && tool.negativeConstraints_zh.length > 0)
        ? tool.negativeConstraints_zh
        : (tool.negativeConstraints || []);
      if (ncSource.length > 0) {
        const tag = document.createElement('span');
        tag.className = 'tag highlight';
        tag.textContent = '🚫 ' + ncSource[0] + (ncSource.length > 1 ? '...' : '');
        tagsContainer.appendChild(tag);
      }
    }
    if (matchedKeywords && matchedKeywords.length > 0) {
      const tag = document.createElement('span');
      tag.className = 'tag';
      tag.textContent = '匹配：' + matchedKeywords.slice(0, 2).join('、');
      tagsContainer.appendChild(tag);
    }
  }

  // 記錄工具點擊行為
  article.addEventListener('click', (e) => {
    const query = searchInput ? searchInput.value.trim() : '';
    behaviorTracker.recordClick(tool.id, query, 0);
  });

  return clone;
}

// 防抖函數
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// 啟動
init();
