/**
 * core/world-week.js — ISO 8601 World Week 國際標準世界週計算核心模組
 * 
 * 符合 ISO-8601 標準：
 * 1. 一週以星期一 (Monday) 為起始，星期日 (Sunday) 為結束。
 * 2. 嚴格使用 UTC 時間計算，杜絕時區跨日偏移 (Zero Timezone Drift)。
 * 3. 作為專案所有每週統計、快照與 UI 呈現的單一事實來源 (Single Source of Truth)。
 */

/**
 * 取得指定日期的 ISO 8601 World Week 詳細資訊
 * @param {Date|string|number} [dateInput=new Date()]
 * @returns {{
 *   year: number,
 *   weekNo: number,
 *   weekStr: string,
 *   monday: Date,
 *   sunday: Date,
 *   mondayStr: string,
 *   sundayStr: string,
 *   dateRange: string
 * }}
 */
export function getISOWeekDetails(dateInput = new Date()) {
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) {
    throw new TypeError(`Invalid date input for getISOWeekDetails: ${dateInput}`);
  }

  const utcYear = d.getUTCFullYear();
  const utcMonth = d.getUTCMonth();
  const utcDay = d.getUTCDate();
  
  const utcDate = new Date(Date.UTC(utcYear, utcMonth, utcDay));
  
  // ISO-8601: 1 (Mon) 到 7 (Sun)
  const day = utcDate.getUTCDay() === 0 ? 7 : utcDate.getUTCDay();
  
  // 計算該週的 Monday (Day 1, 00:00:00.000 UTC)
  const monday = new Date(utcDate);
  monday.setUTCDate(utcDay - (day - 1));
  monday.setUTCHours(0, 0, 0, 0);
  
  // 計算該週的 Sunday (Day 7, 23:59:59.999 UTC)
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  sunday.setUTCHours(23, 59, 59, 999);
  
  // ISO-8601 週次由該週星期四所在年份決定
  const thursday = new Date(monday);
  thursday.setUTCDate(monday.getUTCDate() + 3);
  const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((thursday - yearStart) / 86400000) + 1) / 7);
  const year = thursday.getUTCFullYear();
  const weekStr = `${year}-W${String(weekNo).padStart(2, '0')}`;
  
  const mondayStr = monday.toISOString().slice(0, 10);
  const sundayStr = sunday.toISOString().slice(0, 10);
  
  return {
    year,
    weekNo,
    weekStr,
    monday,
    sunday,
    mondayStr,
    sundayStr,
    dateRange: `${mondayStr} ~ ${sundayStr}`
  };
}

/**
 * 取得當前世界週 (Current World Week)
 * @param {Date|string|number} [now=new Date()]
 */
export function getCurrentWorldWeek(now = new Date()) {
  return getISOWeekDetails(now);
}

/**
 * 取得上一世界週 (Previous / Last Completed World Week)
 * @param {Date|string|number} [now=new Date()]
 */
export function getPreviousWorldWeek(now = new Date()) {
  const current = getISOWeekDetails(now);
  const prevMonday = new Date(current.monday);
  prevMonday.setUTCDate(prevMonday.getUTCDate() - 7);
  return getISOWeekDetails(prevMonday);
}

/**
 * 取得指定週次字串 (如 '2026-W32') 的日期範圍
 * @param {string} weekStr
 * @returns {{ monday: Date, sunday: Date, mondayStr: string, sundayStr: string, dateRange: string }}
 */
export function getWeekRangeFromWeekStr(weekStr) {
  const match = String(weekStr).match(/^(\d{4})-W(\d{2})$/);
  if (!match) {
    throw new Error(`Invalid ISO week format: ${weekStr} (expected YYYY-Www)`);
  }
  const year = parseInt(match[1], 10);
  const week = parseInt(match[2], 10);

  // 1月4日必定在第 1 週
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() === 0 ? 7 : jan4.getUTCDay();
  const w1Monday = new Date(jan4);
  w1Monday.setUTCDate(4 - (jan4Day - 1));
  w1Monday.setUTCHours(0, 0, 0, 0);

  const targetMonday = new Date(w1Monday);
  targetMonday.setUTCDate(w1Monday.getUTCDate() + (week - 1) * 7);

  const targetSunday = new Date(targetMonday);
  targetSunday.setUTCDate(targetMonday.getUTCDate() + 6);
  targetSunday.setUTCHours(23, 59, 59, 999);

  const mondayStr = targetMonday.toISOString().slice(0, 10);
  const sundayStr = targetSunday.toISOString().slice(0, 10);

  return {
    year,
    weekNo: week,
    weekStr,
    monday: targetMonday,
    sunday: targetSunday,
    mondayStr,
    sundayStr,
    dateRange: `${mondayStr} ~ ${sundayStr}`
  };
}
