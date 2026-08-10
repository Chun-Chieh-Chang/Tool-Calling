/**
 * IndexedDB 持久化搜尋快取
 * 
 * 用途：
 * - 持久化搜尋結果到瀏覽器 IndexedDB
 * - 下次開頁可直接命中快取，無需重新計算
 * - 自動過期機制（預設 10 分鐘）
 * 
 * API:
 *   - persistCache.get(key) -> Promise<result|null>
 *   - persistCache.set(key, result) -> Promise<void>
 *   - persistCache.clear() -> Promise<void>
 */

const DB_NAME = 'ToolCallingSearchCache';
const DB_VERSION = 1;
const STORE_NAME = 'search_results';

class IndexedDBCACHE {
  constructor() {
    this.db = null;
    this.defaultTTL = 10 * 60 * 1000; // 10 分鐘
  }

  /**
   * 初始化資料庫連接
   */
  async init() {
    if (this.db) return this.db;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        
        // 建立物件倉庫，以 key 為主鍵
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'key' });
          // 為 timestamp 建立索引以便查詢過期項目
          store.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };
    });
  }

  /**
   * 取得快取結果
   * @param {string} key - 快取鍵
   * @param {number} ttl - 過期時間（毫秒），預設 10 分鐘
   * @returns {Promise<any|null>}
   */
  async get(key, ttl = this.defaultTTL) {
    await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(key);

      request.onsuccess = () => {
        const result = request.result;
        if (!result) {
          resolve(null);
          return;
        }

        const now = Date.now();
        if (now - result.timestamp > ttl) {
          // 已過期，刪除並返回 null
          resolve(null);
          return;
        }

        resolve(result.data);
      };

      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 儲存搜尋結果到 IndexedDB
   * @param {string} key - 快取鍵
   * @param {any} data - 要儲存的數據
   */
  async set(key, data) {
    await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      
      const request = store.put({
        key,
        data,
        timestamp: Date.now()
      });

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 清除所有快取
   */
  async clear() {
    await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 清除過期快取
   */
  async cleanupExpired(ttl = this.defaultTTL) {
    await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const index = store.index('timestamp');
      
      const cutoffTime = Date.now() - ttl;
      const request = index.openCursor(IDBKeyRange.upperBound(cutoffTime));
      
      let deletedCount = 0;
      
      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (!cursor) {
          resolve(deletedCount);
          return;
        }
        
        cursor.delete();
        deletedCount++;
        cursor.continue();
      };
      
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 取得快取統計資訊
   */
  async getStats() {
    await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.count();

      request.onsuccess = () => resolve({
        totalEntries: request.result,
        estimatedSize: request.result * 1024 // 粗略估算
      });

      request.onerror = () => reject(request.error);
    });
  }
}

// 單一實例
export const persistCache = new IndexedDBCACHE();

// 匯出便捷函數
export const getCachedSearch = persistCache.get.bind(persistCache);
export const cacheSearchResults = persistCache.set.bind(persistCache);
export const clearPersistCache = persistCache.clear.bind(persistCache);
export const cleanupPersistCache = persistCache.cleanupExpired.bind(persistCache);
