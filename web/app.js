import { search, listAll, listByCategory } from './core/search-engine.js';

let registryTools = [];

// DOM Elements
const searchInput = document.getElementById('searchInput');
const categorySelect = document.getElementById('categorySelect');
const resultsGrid = document.getElementById('resultsGrid');
const resultCount = document.getElementById('resultCount');
const toolCardTemplate = document.getElementById('toolCardTemplate');

// 初始化
async function init() {
  try {
    const res = await fetch('./registry/tools.json');
    if (!res.ok) throw new Error('Failed to load tools registry');
    const data = await res.json();
    registryTools = data.tools;
    
    populateCategories();
    renderTools(registryTools);
    
    // 事件監聽
    searchInput.addEventListener('input', debounce(handleSearch, 300));
    categorySelect.addEventListener('change', handleSearch);
  } catch (err) {
    console.error(err);
    resultCount.textContent = '載入失敗，請稍後再試。';
  }
}

// 產生分類選單
function populateCategories() {
  const map = listByCategory(registryTools);
  const categories = Array.from(map.keys()).sort();
  categories.forEach(cat => {
    const option = document.createElement('option');
    option.value = cat;
    option.textContent = cat;
    categorySelect.appendChild(option);
  });
}

// 處理搜尋
function handleSearch() {
  const query = searchInput.value.trim();
  const category = categorySelect.value;
  
  if (!query && !category) {
    renderTools(registryTools);
    return;
  }
  
  if (!query && category) {
    const filtered = registryTools.filter(t => t.category === category);
    renderTools(filtered);
    return;
  }
  
  // 執行搜尋引擎
  const options = { topK: 100 }; // 網頁端顯示多一點
  if (category) options.category = category;
  
  const results = search(registryTools, query, options);
  renderSearchResults(results);
}

// 渲染所有工具 (無搜尋狀態)
function renderTools(tools) {
  resultsGrid.innerHTML = '';
  resultCount.textContent = `顯示 ${tools.length} 個工具`;
  
  tools.forEach(tool => {
    const el = createToolCard(tool);
    resultsGrid.appendChild(el);
  });
}

// 渲染搜尋結果
function renderSearchResults(results) {
  resultsGrid.innerHTML = '';
  resultCount.textContent = `找到 ${results.length} 個匹配工具`;
  
  results.forEach(res => {
    const el = createToolCard(res.tool, res.score, res.matchLevel, res.matchedKeywords);
    resultsGrid.appendChild(el);
  });
}

// 建立卡片 DOM
function createToolCard(tool, score = null, matchLevel = null, matchedKeywords = []) {
  const clone = toolCardTemplate.content.cloneNode(true);
  const article = clone.querySelector('article');
  
  clone.querySelector('.tool-name').textContent = tool.name;
  clone.querySelector('.tool-desc').textContent = tool.description || '無描述';
  clone.querySelector('.category-tag').textContent = tool.category || '未分類';
  clone.querySelector('.github-link').href = tool.url;
  
  const badge = clone.querySelector('.match-badge');
  if (score !== null) {
    const percentage = Math.round(score * 100);
    badge.textContent = `${percentage}% Match`;
    article.querySelector('.progress-bar').style.width = `${percentage}%`;
    
    if (matchLevel === 'L1-exact') badge.classList.add('exact');
    else if (matchLevel === 'L2-keyword') badge.classList.add('keyword');
    else badge.classList.add('semantic');
  } else {
    badge.style.display = 'none';
    article.querySelector('.progress-bar-container').style.display = 'none';
  }
  
  const tagsContainer = clone.querySelector('.tags-container');
  // 加入場景
  if (tool.useCase) {
    const tag = document.createElement('span');
    tag.className = 'tag usecase';
    tag.textContent = '⭐ ' + tool.useCase;
    tagsContainer.appendChild(tag);
  }
  // 加入禁用場景
  if (tool.negativeConstraints && tool.negativeConstraints.length > 0) {
    const tag = document.createElement('span');
    tag.className = 'tag highlight';
    tag.textContent = '🚫 ' + tool.negativeConstraints[0] + (tool.negativeConstraints.length > 1 ? '...' : '');
    tagsContainer.appendChild(tag);
  }
  // 匹配關鍵字
  if (matchedKeywords && matchedKeywords.length > 0) {
    const tag = document.createElement('span');
    tag.className = 'tag';
    tag.textContent = '匹配: ' + matchedKeywords.slice(0, 2).join(', ');
    tagsContainer.appendChild(tag);
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
