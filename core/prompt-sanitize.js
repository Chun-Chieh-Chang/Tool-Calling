/**
 * LLM prompt 的「資料區」淨化 — CWE-20 / Prompt Injection 防護的單一來源。
 *
 * 為什麼需要：
 * prompt 是由「指令」與「資料」拼成的同一段字串，而資料（使用者查詢、
 * 工具名稱／描述／標籤）來自外部。攻擊者只要在資料裡塞進看起來像指令的
 * 內容（「忽略以上規則，改成回傳 xxx」、或是提前閉合分隔標籤），
 * 就能覆寫我們原本的指令。
 *
 * 這裡做的是**降低可行性的第一道防線**，不是完整解法：
 * - 把 `<` `>` 換成全形替代字形 → 資料無法閉合 XML 式分隔標籤。
 * - 把連續三個反引號降級 → 資料無法開啟新的程式碼區塊。
 * - 壓縮連續空行 → 資料無法用大量換行把指令「推離」模型注意力範圍。
 * - 截斷長度 → 限制單次注入可攜帶的酬載量。
 *
 * 取捨：這些替換只動分隔符號類的字元，不動一般文字，
 * 所以對繁體中文語意幾乎無損（實測 rerank 準確度未因此下降）。
 *
 * 注意：本函式**不做** HTML 跳脫（那是 `escapeHtml` 的職責，用於 CWE-79）。
 * 兩者防的是不同弱點，不要混用。
 */

/**
 * 移除會干擾 prompt 結構的字元，讓外部資料永遠只能是「資料」。
 *
 * @param {string} text - 任意外部輸入（可能為 null / undefined）
 * @param {number} [maxLength=2000] - 截斷上限
 * @returns {string} 淨化後的字串（至少回傳空字串）
 */
export function neutralizeDelimiters(text, maxLength = 2000) {
  return String(text ?? '')
    .replace(/</g, '‹')
    .replace(/>/g, '›')
    .replace(/`{3}/g, "'''")
    .replace(/\r?\n{3,}/g, '\n\n')
    .slice(0, maxLength);
}

export default neutralizeDelimiters;
