import { search, listAll, listByCategory, warmSearchIndex } from './core/search-engine.js';

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

// 初始化
async function init() {
  try {
    const res = await fetch('./registry/tools.json');
    if (!res.ok) throw new Error('Failed to load tools registry');
    const data = await res.json();
    registryTools = Array.isArray(data.tools) ? data.tools : [];

    populateCategories();
    renderDashboard();
    renderTools(registryTools);

    // 預熱搜尋索引
    const warm = () => warmSearchIndex(registryTools);
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(warm);
    } else {
      setTimeout(warm, 0);
    }

    // 事件監聽
    searchInput.addEventListener('input', debounce(handleSearch, 300));
    categorySelect.addEventListener('change', handleSearch);

    if (dashboardTabBtn) dashboardTabBtn.addEventListener('click', () => switchTab('dashboard'));
    if (toolsTabBtn) toolsTabBtn.addEventListener('click', () => switchTab('tools'));
    if (trendingTabBtn) trendingTabBtn.addEventListener('click', () => switchTab('trending'));

  } catch (err) {
    console.error(err);
    if (resultCount) resultCount.textContent = '載入失敗，請稍後再試。';
  }
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
        backgroundColor: 'rgba(96, 165, 250, 0.7)',
        borderColor: '#60A5FA',
        borderWidth: 1,
        borderRadius: 6,
        hoverBackgroundColor: 'rgba(59, 130, 246, 0.95)'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1E293B',
          titleColor: '#F1F5F9',
          bodyColor: '#94A3B8',
          borderColor: '#334155',
          borderWidth: 1,
          padding: 10,
          displayColors: false
        }
      },
      scales: {
        x: {
          ticks: { color: '#94A3B8', font: { family: 'Inter', size: 11 } },
          grid: { display: false }
        },
        y: {
          ticks: { color: '#94A3B8', font: { family: 'Inter', size: 11 } },
          grid: { color: 'rgba(51, 65, 85, 0.4)' }
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
    '#60A5FA', '#34D399', '#FBBF24', '#F87171', 
    '#A78BFA', '#F472B6', '#38BDF8', '#818CF8'
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
        borderColor: '#0F172A',
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
            color: '#94A3B8',
            font: { family: 'Inter', size: 12 },
            boxWidth: 12,
            padding: 12
          }
        },
        tooltip: {
          backgroundColor: '#1E293B',
          titleColor: '#F1F5F9',
          bodyColor: '#94A3B8',
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

    const topToolsList = catTools.slice(0, 3).map(t => `<li>${t.name} ${t.stars ? `<span style="opacity:0.6;font-size:0.75rem;">(⭐${formatStarCount(t.stars)})</span>` : ''}</li>`).join('');

    card.innerHTML = `
      <div>
        <div class="cat-card-header">
          <span class="cat-name">${cat}</span>
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

async function loadWeeklyTrending() {
  if (!leaderboardBody) return;
  if (weeklyTrendingLoaded) return;

  try {
    const res = await fetch('./registry/weekly-trending.json');
    if (!res.ok) throw new Error('Weekly trending data not found');
    const data = await res.json();

    if (trendingWorldWeek) trendingWorldWeek.textContent = `🏆 GitHub 每週漲星排行榜 (${data.worldWeek || '2026-W30'})`;
    if (trendingDateRange) trendingDateRange.textContent = `探勘區間：${data.dateRange || '近 7 天'}`;
    if (trendingScannedCount) trendingScannedCount.textContent = data.scannedReposCount ? data.scannedReposCount.toLocaleString() : '--';
    if (trendingAddedCount) trendingAddedCount.textContent = `${data.newlyAddedCount || 0} 個工具`;

    // 1. 渲染排行榜表格 (Top 10 Leaderboard)
    leaderboardBody.innerHTML = '';
    const top10 = Array.isArray(data.top10) ? data.top10 : [];

    top10.forEach(item => {
      const tr = document.createElement('tr');
      const rankClass = item.rank === 1 ? 'rank-1' : item.rank === 2 ? 'rank-2' : item.rank === 3 ? 'rank-3' : 'rank-other';
      const rankEmoji = item.rank === 1 ? '🥇' : item.rank === 2 ? '🥈' : item.rank === 3 ? '🥉' : item.rank;
      const statusClass = item.isNewlyAdded ? 'newly-added' : 'in-registry';

      tr.innerHTML = `
        <td style="text-align: center;"><span class="rank-badge ${rankClass}">${rankEmoji}</span></td>
        <td><strong>${item.name}</strong></td>
        <td><a href="${item.url}" target="_blank" rel="noopener noreferrer" style="color: var(--brand-color); text-decoration: none;">${item.fullName} ↗</a></td>
        <td>⭐ ${formatStarCount(item.currentStars)}</td>
        <td><span class="delta-badge">🔥 +${formatStarCount(item.delta)} 漲星</span></td>
        <td><span class="category-tag">${item.category}</span></td>
        <td style="text-align: center;"><span class="status-badge ${statusClass}">${item.statusText}</span></td>
      `;
      leaderboardBody.appendChild(tr);
    });

    // 2. 渲染本週新納入本專案工具箱的工具特寫 (Newly Added Tools Highlight)
    if (newlyAddedGrid) {
      newlyAddedGrid.innerHTML = '';
      const addedTools = Array.isArray(data.addedTools) ? data.addedTools : [];
      if (addedTools.length === 0) {
        newlyAddedGrid.innerHTML = '<div style="grid-column: 1 / -1; color: var(--text-secondary); text-align: center; padding: 24px;">本週探勘之 Top 10 工具皆已在庫存中，暫無新增入庫工具。</div>';
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
  syncAllViews();
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
    const results = search(registryTools || [], query, options);
    renderSearchResults(results);
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
        <span class="accordion-title">${cat}</span>
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
  clone.querySelector('.tool-desc').textContent = tool.description || '無描述';
  // 若卡片屬於多分類 section，顯示當前 section 的分類；否則顯示工具的分類
  const displayCat = currentCategory || getToolCategories(tool).join(' / ');
  clone.querySelector('.category-tag').textContent = displayCat;
  clone.querySelector('.github-link').href = tool.url || '#';

  const badge = clone.querySelector('.match-badge');
  if (score !== null) {
    const percentage = Math.round(score * 100);
    badge.textContent = `${percentage}% Match`;
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
    if (tool.useCase) {
      const tag = document.createElement('span');
      tag.className = 'tag usecase';
      tag.textContent = '⭐ ' + tool.useCase;
      tagsContainer.appendChild(tag);
    }
    if (tool.negativeConstraints && tool.negativeConstraints.length > 0) {
      const tag = document.createElement('span');
      tag.className = 'tag highlight';
      tag.textContent = '🚫 ' + tool.negativeConstraints[0] + (tool.negativeConstraints.length > 1 ? '...' : '');
      tagsContainer.appendChild(tag);
    }
    if (matchedKeywords && matchedKeywords.length > 0) {
      const tag = document.createElement('span');
      tag.className = 'tag';
      tag.textContent = '匹配: ' + matchedKeywords.slice(0, 2).join(', ');
      tagsContainer.appendChild(tag);
    }
  }

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
