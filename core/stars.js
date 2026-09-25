/**
 * stars.js — 加入工具時的 GitHub 星數取得與寫入
 *
 * 為什麼要抽出來
 * ──────────────
 * cli.js cmdAdd() 與 web/server.js 的 POST /api/tools/add 原本各有一份
 * 「呼叫 GitHub API → 寫 star-snapshots.json → 掛到 newTool.stars」的複製貼上碼，
 * 而舊寫法把這動作放在 `registry.tools.push(newTool); saveRegistry(registry)` **之後**。
 * 後果：快照有星數、tools.json 那筆沒有（push 之後只存檔一次，而語意補齊階段
 * 會重新 loadRegistry 覆寫回去，事後修改的記憶體物件永遠不落盤）。
 *
 * 這裡拆成三層，方便各層單獨驗證：
 *   fetchRepoStars()      — 只問 GitHub，任何失敗回傳 null（不拋錯）
 *   applyRepoStars()      — 純函式，把星數同時掛進 tool 與 snapshot 物件
 *   attachStarsToTool()   — 串起來，並將 snapshot 落盤
 *
 * ⚠️ 呼叫端必須在 `registry.tools.push(newTool)` **之前** 呼叫 attachStarsToTool()：
 *    它靠「原地修改同一個物件引用」生效，換物件或事後再掛都不會落盤。
 *
 * 測試可注入 fetchImpl / loadSnapshot / saveSnapshot，不需要網路、也不會動到
 * registry/star-snapshots.json。
 */

import { loadSnapshot, saveSnapshot, parseOwnerRepo } from './snapshot.js';

const API_TIMEOUT_MS = 5000;
const USER_AGENT = 'Tool-Calling-Add-Agent';

/**
 * 向 GitHub 查詢倉庫星數。
 *
 * @param {string} repoUrl GitHub repo URL（也接受 /tree/ 子路徑）
 * @param {object} [options]
 * @param {function} [options.fetchImpl] 取代全域 fetch（測試用）
 * @returns {Promise<number|null>} 星數；URL 不是 GitHub、HTTP 非 2xx、
 *                                 欄位不是有效數字、或任何網路錯誤都回傳 null
 */
export async function fetchRepoStars(repoUrl, { fetchImpl } = {}) {
  const parsed = parseOwnerRepo(repoUrl);
  if (!parsed) return null;
  const doFetch = fetchImpl ?? globalThis.fetch;
  try {
    const apiUrl = `https://api.github.com/repos/${parsed.owner}/${parsed.repo}`;
    const res = await doFetch(apiUrl, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const data = await res.json();
    // Number.isFinite 而非 typeof === 'number'：NaN 也是 number，
    // 而 JSON.stringify(NaN) 會寫出 null，把「沒有星數」變成「星數是 null」的髒資料。
    return Number.isFinite(data?.stargazers_count) ? data.stargazers_count : null;
  } catch {
    // 星數非必要資訊，失敗不影響工具加入
    return null;
  }
}

/**
 * 把星數同時寫進工具物件與快照物件（純函式，不做任何 I/O）。
 *
 * 快照檔是混合形狀：既有 `snapshots[]`（週次歷史），也有扁平的 `owner/repo → stars`
 * 即時基準線（sync-daemon 與 trending-weekly 讀的是後者）。這裡只碰扁平鍵。
 *
 * @param {object} tool 會被打上 tool.stars 的工具物件
 * @param {object} snapshot loadSnapshot() 回傳的物件（扁平鍵為 fullName → stars）
 * @param {string} fullName `owner/repo`
 * @param {number} stars 有限數（NaN／Infinity 一律拒絕，避免寫出 null 髒資料）
 * @returns {boolean} 是否真的有寫入（stars 不是有效數字時 false 且不動任何東西）
 */
export function applyRepoStars(tool, snapshot, fullName, stars) {
  if (!tool || !Number.isFinite(stars)) return false;
  tool.stars = stars;
  if (snapshot && fullName) snapshot[fullName] = stars;
  return true;
}

/**
 * 加入管線專用：取星數 → 更新工具物件 → 快照落盤。
 *
 * 快照只是副作用：載入或寫入失敗時**仍然**把星數掛進工具（tools.json 才是
 * 單一真理來源），任何 I/O 錯誤都不向上拋——呼叫端不必再包 try/catch。
 *
 * @param {object} tool 將被寫進 registry 的工具物件（原地修改）
 * @param {string} repoUrl 工具 URL
 * @param {object} [options]
 * @param {function} [options.fetchImpl] 取代全域 fetch
 * @param {function} [options.loadSnapshotImpl] 取代快照載入
 * @param {function} [options.saveSnapshotImpl] 取代快照寫入
 * @returns {Promise<number|null>} 寫入工具物件的星數，未取得時 null
 */
export async function attachStarsToTool(
  tool,
  repoUrl,
  { fetchImpl, loadSnapshotImpl, saveSnapshotImpl } = {},
) {
  const parsed = parseOwnerRepo(repoUrl);
  if (!parsed) return null;
  const stars = await fetchRepoStars(repoUrl, { fetchImpl });
  if (stars === null) return null;

  const fullName = `${parsed.owner}/${parsed.repo}`;
  let snap = null;
  try {
    snap = (loadSnapshotImpl ?? loadSnapshot)();
  } catch {
    // 快照讀不到就略過快照，不影響 tool.stars
  }
  const applied = applyRepoStars(tool, snap, fullName, stars);
  if (snap) {
    try {
      (saveSnapshotImpl ?? saveSnapshot)(snap);
    } catch {
      // 快照寫不入（磁碟／權限）不是加入失敗的理由
    }
  }
  return applied ? stars : null;
}
