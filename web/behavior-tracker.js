/**
 * 使用者行為追蹤與反饋循環
 * 
 * 用途：
 * - 記錄用戶搜尋行為（查詢詞、點擊工具、停留時間）
 * - 分析搜尋成功/失敗模式
 * - 動態調整搜尋權重
 * 
 * 存儲方式：localStorage（瀏覽器）+ IndexedDB（大數據）
 */

const STORAGE_KEY = 'tool-calling-behavior';
const MAX_HISTORY = 1000; // 最多記錄 1000 條行為

export class BehaviorTracker {
  constructor() {
    this.history = this._loadHistory();
    this.sessionStart = Date.now();
  }

  /**
   * 載入歷史行為記錄
   */
  _loadHistory() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (err) {
      console.warn('[Behavior] Failed to load history:', err);
    }
    return [];
  }

  /**
   * 儲存歷史行為記錄
   */
  _saveHistory() {
    try {
      // 只保留最近 MAX_HISTORY 條記錄
      const trimmed = this.history.slice(-MAX_HISTORY);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    } catch (err) {
      console.warn('[Behavior] Failed to save history:', err);
    }
  }

  /**
   * 記錄一次搜尋行為
   * @param {string} query - 搜尋查詢
   * @param {object[]} results - 搜尋結果
   * @param {number} duration - 搜尋耗時（毫秒）
   */
  recordSearch(query, results, duration) {
    const entry = {
      timestamp: Date.now(),
      type: 'search',
      query,
      resultCount: results?.length || 0,
      topResultId: results?.[0]?.tool?.id || null,
      duration
    };

    this.history.push(entry);
    this._saveHistory();
  }

  /**
   * 記錄一次工具點擊
   * @param {string} toolId - 工具 ID
   * @param {string} query - 原始查詢
   * @param {number} position - 在結果中的位置
   */
  recordClick(toolId, query, position) {
    const entry = {
      timestamp: Date.now(),
      type: 'click',
      toolId,
      query,
      position
    };

    this.history.push(entry);
    this._saveHistory();
  }

  /**
   * 記錄搜尋被放棄（用戶未點擊任何結果）
   * @param {string} query - 搜尋查詢
   */
  recordAbandon(query) {
    const entry = {
      timestamp: Date.now(),
      type: 'abandon',
      query
    };

    this.history.push(entry);
    this._saveHistory();
  }

  /**
   * 計算工具使用統計
   * @param {string} toolId - 工具 ID
   * @returns {object} 統計數據
   */
  getToolStats(toolId) {
    const clicks = this.history.filter(h => h.type === 'click' && h.toolId === toolId);
    const totalClicks = clicks.length;
    
    // 計算近期成功率（近 30 天）
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const recentClicks = clicks.filter(c => c.timestamp > thirtyDaysAgo).length;
    
    return {
      totalClicks,
      recentClicks,
      lastClicked: clicks[clicks.length - 1]?.timestamp || null
    };
  }

  /**
   * 計算搜尋成功率
   * @param {string} query - 搜尋查詢
   * @returns {object} 成功率統計
   */
  getSearchSuccessRate(query) {
    const searches = this.history.filter(h => h.type === 'search' && h.query === query);
    const clicks = this.history.filter(h => h.type === 'click' && h.query === query);
    
    if (searches.length === 0) return null;
    
    // 簡單計算：有點擊的搜尋比例
    const successfulSearches = searches.filter(s => 
      clicks.some(c => c.timestamp >= s.timestamp && c.timestamp <= s.timestamp + 30000)
    ).length;
    
    return {
      totalSearches: searches.length,
      successfulSearches,
      successRate: searches.length > 0 ? successfulSearches / searches.length : 0
    };
  }

  /**
   * 獲取熱門搜尋詞
   * @param {number} limit - 返回數量
   * @returns {object[]} 熱門搜尋詞列表
   */
  getPopularQueries(limit = 10) {
    const searches = this.history.filter(h => h.type === 'search');
    const queryCounts = new Map();
    
    for (const search of searches) {
      queryCounts.set(search.query, (queryCounts.get(search.query) || 0) + 1);
    }
    
    return Array.from(queryCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([query, count]) => ({ query, count }));
  }

  /**
   * 獲取未滿足的搜尋需求（無點擊或高放棄率）
   * @param {number} minSearches - 最少搜尋次數門檻
   * @returns {object[]} 未滿足需求列表
   */
  getUnmetNeeds(minSearches = 3) {
    const queries = new Map();
    
    for (const entry of this.history) {
      if (entry.type === 'search') {
        if (!queries.has(entry.query)) {
          queries.set(entry.query, { searches: 0, clicks: 0 });
        }
        queries.get(entry.query).searches++;
      } else if (entry.type === 'click') {
        const q = queries.get(entry.query);
        if (q) q.clicks++;
      }
    }
    
    return Array.from(queries.entries())
      .filter(([_, stats]) => stats.searches >= minSearches && stats.clicks === 0)
      .map(([query, stats]) => ({ query, searches: stats.searches }))
      .sort((a, b) => b.searches - a.searches);
  }

  /**
   * 清除所有歷史記錄
   */
  clear() {
    this.history = [];
    localStorage.removeItem(STORAGE_KEY);
  }

  /**
   * 獲取行為報告
   * @returns {object} 綜合報告
   */
  getReport() {
    const totalSearches = this.history.filter(h => h.type === 'search').length;
    const totalClicks = this.history.filter(h => h.type === 'click').length;
    const totalAbandons = this.history.filter(h => h.type === 'abandon').length;
    
    return {
      totalSearches,
      totalClicks,
      totalAbandons,
      overallSuccessRate: totalSearches > 0 ? totalClicks / totalSearches : 0,
      popularQueries: this.getPopularQueries(5),
      unmetNeeds: this.getUnmetNeeds(2),
      sessionDuration: Date.now() - this.sessionStart
    };
  }
}

// 單一實例
export const behaviorTracker = new BehaviorTracker();

// 自動化事件監聽（可選）
export function installAutoTracking() {
  // 監聽搜尋輸入
  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    let searchTimer = null;
    searchInput.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        const query = searchInput.value.trim();
        if (query.length > 2) {
          behaviorTracker.recordSearch(query, [], 0);
        }
      }, 1000);
    });
  }

  // 監聽工具卡片點擊
  document.addEventListener('click', (e) => {
    const card = e.target.closest('.tool-card');
    if (card) {
      const toolId = card.dataset.toolId;
      const query = searchInput?.value?.trim() || '';
      if (toolId) {
        behaviorTracker.recordClick(toolId, query, 0);
      }
    }
  });
}
