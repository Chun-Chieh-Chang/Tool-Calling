#!/usr/bin/env node
// check-traditional: skip-file —— 本檔是簡→繁對照表的「定義者」，表內必然是簡體字
/**
 * fix-simplified.js — 將 tools.json 中的簡體中文修正為繁體
 *
 * 為什麼需要（2026-09-16 診斷）
 * ────────────────────────────
 * 本專案是繁體中文專案，但 LLM 產生 trigger 時會輸出簡體
 * （訓練語料以簡體為主，例如「跑跨浏览器自动化测试」「截取网页完整截图」）。
 *
 * 影響不只是「不好看」——**繁體查詢永遠匹配不到簡體 trigger**：
 * tokenize 會把「瀏覽器」切成 瀏覽/覽器，「浏览器」切成 浏览/览器，
 * 兩者完全不重疊。這直接造成召回失敗。
 *
 * 統計：triggers 461/8821 項目含簡體（958 個簡體字元）。
 *
 * 用法
 * ─────
 *   node scripts/fix-simplified.js            # 預覽（唯讀）
 *   node scripts/fix-simplified.js --apply    # 寫入（先自動備份）
 *
 * 2026-10-15 Q1=B（Worker 開 PR）：瀏覽器端「加入工具庫」管線會經
 * core/tool-enricher.js import 本檔的 toTraditional()，因此 node:fs／
 * node:path／node:url 改為 main() 內延遲載入——頂端只保留純邏輯與
 * opencc 載入（本就 try/catch 容錯），瀏覽器可直接載入本模組。
 * CLI 分支以 `typeof process` 守門，瀏覽器不會進入。
 */

// ── 簡 → 繁 對照表 ───────────────────────────────────────────────────────
// 只收「兩者確實不同」的字。刻意排除簡繁同形者（理、言、影、系、容、面、
// 成、同、點…等不需轉換），避免把正確的繁體誤改。
// 只收「簡體字元 → 相異繁體字元」的無歧義對應。
// 刻意排除兩類：
//   1. 簡繁同形字（搜、探、提、接…）——收了會誤報成簡體
//   2. 一簡對多繁的歧義字（复→復/複、干→乾/幹、于→於/于、后→後/后）
//      ——強制轉換可能改錯（如「恢复」會變成「恢複」）
export const S2T = {
  录: '錄', 视: '視', 频: '頻', 览: '覽', 动: '動', 试: '試', 码: '碼', 资: '資',
  检: '檢', 钮: '鈕', 择: '擇', 页: '頁', 结: '結', 网: '網', 图: '圖', 说: '說',
  让: '讓', 应: '應', 当: '當', 发: '發', 现: '現', 开: '開', 关: '關', 时: '時',
  间: '間', 长: '長', 问: '問', 题: '題', 处: '處', 数: '數', 据: '據', 讯: '訊',
  术: '術', 语: '語', 简: '簡', 单: '單', 双: '雙', 边: '邊', 还: '還', 这: '這',
  个: '個', 么: '麼', 样: '樣', 电: '電', 话: '話', 听: '聽', 读: '讀', 写: '寫',
  记: '記', 忆: '憶', 体: '體', 统: '統', 计: '計', 画: '畫', 规: '規',
  范: '範', 内: '內', 构: '構', 点: '點', 线: '線', 条: '條', 级: '級', 类: '類',
  别: '別', 种: '種', 档: '檔', 压: '壓', 缩: '縮', 转: '轉', 换: '換', 编: '編',
  辑: '輯', 删: '刪', 载: '載', 门: '門', 们: '們', 见: '見', 观: '觀', 觉: '覺',
  认: '認', 识: '識', 讲: '講', 论: '論', 议: '議', 请: '請', 谢: '謝', 对: '對',
  导: '導', 层: '層', 属: '屬', 万: '萬', 与: '與', 专: '專', 业: '業', 东: '東',
  两: '兩', 严: '嚴', 临: '臨', 为: '為', 丽: '麗', 举: '舉', 义: '義', 乐: '樂',
  习: '習', 乡: '鄉', 书: '書', 买: '買', 乱: '亂', 争: '爭', 云: '雲',
  亚: '亞', 产: '產', 亲: '親', 亿: '億', 仅: '僅', 从: '從', 仓: '倉', 仪: '儀',
  价: '價', 众: '眾', 优: '優', 会: '會', 伟: '偉', 传: '傳', 伤: '傷', 伦: '倫',
  伪: '偽', 侠: '俠', 侦: '偵', 侧: '側', 俭: '儉', 债: '債', 倾: '傾',
  偿: '償', 储: '儲', 儿: '兒', 党: '黨', 兰: '蘭', 兴: '興', 养: '養', 兽: '獸',
  冈: '岡', 册: '冊', 军: '軍', 农: '農', 冲: '衝', 决: '決', 况: '況', 冻: '凍',
  净: '淨', 凉: '涼', 减: '減', 凑: '湊', 几: '幾', 凤: '鳳', 凭: '憑', 凯: '凱',
  击: '擊', 刘: '劉', 则: '則', 刚: '剛', 创: '創', 剂: '劑', 剑: '劍', 剥: '剝',
  剧: '劇', 办: '辦', 劝: '勸', 务: '務', 励: '勵', 劲: '勁', 劳: '勞', 势: '勢',
  勋: '勳', 区: '區', 医: '醫', 华: '華', 协: '協', 卖: '賣', 卫: '衛', 却: '卻',
  厂: '廠', 厅: '廳', 历: '歷', 厉: '厲', 县: '縣', 参: '參', 变: '變', 叙: '敘',
  叶: '葉', 号: '號', 叹: '嘆', 吓: '嚇', 吗: '嗎', 吨: '噸', 启: '啟',
  呜: '嗚', 员: '員', 呛: '嗆', 咏: '詠', 响: '響', 哑: '啞', 唤: '喚', 啰: '囉',
  喷: '噴', 嘱: '囑', 团: '團', 园: '園', 围: '圍', 国: '國', 圆: '圓', 圣: '聖',
  场: '場', 坏: '壞', 块: '塊', 坚: '堅', 坛: '壇', 坝: '壩', 坟: '墳', 坠: '墜',
  垄: '壟', 垒: '壘', 垦: '墾', 垫: '墊', 堑: '塹', 堕: '墮', 墙: '牆', 壮: '壯',
  声: '聲', 壳: '殼', 备: '備', 够: '夠', 头: '頭', 夹: '夾', 夺: '奪',
  奋: '奮', 奖: '獎', 妇: '婦', 妈: '媽', 妆: '妝', 娱: '娛', 婴: '嬰',
  岗: '崗', 岛: '島', 岭: '嶺', 峡: '峽', 峦: '巒', 巅: '巔', 巩: '鞏',
  币: '幣', 帅: '帥', 师: '師', 帐: '帳', 帘: '簾', 帮: '幫', 带: '帶', 帧: '幀',
  幂: '冪', 并: '並', 广: '廣', 庄: '莊', 庆: '慶', 库: '庫',
  废: '廢', 庙: '廟', 庞: '龐',
  异: '異', 弃: '棄', 张: '張', 弥: '彌', 弯: '彎', 弹: '彈', 强: '強',
  归: '歸', 彻: '徹', 径: '徑', 忧: '憂', 怀: '懷',
  态: '態', 总: '總', 恋: '戀', 恳: '懇', 恶: '惡', 恼: '惱', 悦: '悅',
  悬: '懸', 惊: '驚', 惧: '懼', 惨: '慘', 惩: '懲', 惯: '慣', 愿: '願',
  懒: '懶', 戏: '戲', 战: '戰', 户: '戶', 扑: '撲', 执: '執', 扩: '擴',
  扫: '掃', 扬: '揚', 扰: '擾', 抚: '撫', 抛: '拋', 抢: '搶', 护: '護', 报: '報',
  担: '擔', 拟: '擬', 拥: '擁', 拨: '撥', 挂: '掛', 挚: '摯', 挤: '擠',
  挥: '揮', 捞: '撈', 损: '損',
  搁: '擱', 搅: '攪', 摄: '攝', 摆: '擺', 摇: '搖', 摊: '攤',
  撵: '攆', 撷: '擷', 撑: '撐', 撸: '擼', 撺: '攛', 擞: '擻', 攒: '攢',
  // 第二輪補充（由實際掃描結果歸納）
  浏: '瀏', 测: '測', 虑: '慮', 虚: '虛', 紧: '緊', 译: '譯', 输: '輸',
  链: '鏈', 络: '絡', 连: '連', 详: '詳', 细: '細', 杂: '雜', 标: '標',
  签: '簽', 组: '組', 织: '織', 软: '軟', 驱: '驅', 权: '權', 设: '設',
  调: '調', 验: '驗', 证: '證', 评: '評', 质: '質', 准: '準', 误: '誤',
  错: '錯', 顶: '頂', 顺: '順', 预: '預', 领: '領', 风: '風', 飞: '飛',
  马: '馬', 鸟: '鳥', 鱼: '魚', 龙: '龍', 齿: '齒', 齐: '齊', 龄: '齡',
  顿: '頓', 颁: '頒', 颂: '頌', 颗: '顆', 频: '頻', 颜: '顏', 题: '題',
  额: '額', 颠: '顛', 颖: '穎', 镜: '鏡', 铁: '鐵', 银: '銀', 钢: '鋼',
  钱: '錢', 钟: '鐘', 针: '針', 钉: '釘', 钩: '鉤', 铜: '銅', 铝: '鋁',
  铸: '鑄', 铺: '鋪', 链: '鏈', 销: '銷', 锁: '鎖', 锋: '鋒', 锐: '銳',
  错: '錯', 锦: '錦', 键: '鍵', 镇: '鎮', 镜: '鏡', 长: '長', 门: '門',
  问: '問', 闲: '閒', 间: '間', 闷: '悶', 闹: '鬧', 闻: '聞', 阀: '閥',
  阁: '閣', 阅: '閱', 队: '隊', 阳: '陽', 阴: '陰', 阵: '陣', 阶: '階',
  际: '際', 陆: '陸', 陈: '陳', 险: '險', 隐: '隱', 难: '難', 雄: '雄',
  雾: '霧', 霉: '黴', 静: '靜', 面: '面', 韧: '韌', 韩: '韓', 顶: '頂',
  页: '頁', 项: '項', 顺: '順', 须: '須', 顽: '頑', 顾: '顧', 顿: '頓',
  颁: '頒', 颂: '頌', 预: '預', 领: '領', 颇: '頗', 颈: '頸', 颊: '頰',
  频: '頻', 颗: '顆', 题: '題', 颜: '顏', 额: '額', 颠: '顛', 颖: '穎',
  风: '風', 飘: '飄', 飞: '飛', 飨: '饗', 餐: '餐', 饥: '飢', 饭: '飯',
  饮: '飲', 饰: '飾', 饱: '飽', 饲: '飼', 饶: '饒', 饺: '餃', 饼: '餅',
  馆: '館', 馈: '饋', 馊: '餿', 馒: '饅', 马: '馬', 驰: '馳', 驱: '驅',
  驳: '駁', 驴: '驢', 驶: '駛', 驹: '駒', 驻: '駐', 驼: '駝', 驾: '駕',
  骂: '罵', 骄: '驕', 骆: '駱', 骇: '駭', 验: '驗', 骗: '騙', 骚: '騷',
  骤: '驟', 骨: '骨', 高: '高', 髅: '髏', 髓: '髓', 鱼: '魚', 鲁: '魯',
  鲜: '鮮', 鲤: '鯉', 鲨: '鯊', 鲸: '鯨', 鸟: '鳥', 鸡: '雞', 鸣: '鳴',
  鸦: '鴉', 鸭: '鴨', 鸯: '鴦', 鸳: '鴛', 鸽: '鴿', 鹅: '鵝', 鹉: '鵡',
  鹊: '鵲', 鹏: '鵬', 鹤: '鶴', 鹰: '鷹', 鹿: '鹿', 麦: '麥', 黄: '黃',
  黑: '黑', 齐: '齊', 齿: '齒', 龄: '齡', 龙: '龍',

  // ── 2026-09-19 補漏 ─────────────────────────────────────────────────────
  // 發現經過：trigger 擴充時模型輸出「戀爱婚育」，但 toTraditional 沒把它轉成
  // 「戀愛婚育」——因為 爱 不在表內。繁體查詢查不到含簡體字的 trigger，
  // 這會造成靜默召回失敗。故系統性比對常用簡體字後補齊下列確定的一對一對應。
  // 仍依原設計排除：簡繁同形字（厚、台、助、姐、妹…）與一簡對多繁的歧義字
  // （复→復/複、后→後/后、干→乾/幹、厘→釐/厘）。
  爱: '愛', 学: '學', 车: '車', 汉: '漢', 来: '來', 实: '實', 进: '進',
  过: '過', 给: '給', 谁: '誰', 课: '課', 该: '該', 终: '終', 经: '經',
  绝: '絕', 续: '續', 维: '維', 绿: '綠', 训: '訓', 财: '財', 责: '責',
  贫: '貧', 货: '貨', 费: '費', 赛: '賽', 赞: '贊', 赢: '贏', 轮: '輪',
  胜: '勝', 厌: '厭', 厕: '廁', 厨: '廚',
  济: '濟', 随: '隨', 艰: '艱', 欢: '歡', 伞: '傘',
  询: '詢', 赔: '賠', 练: '練', 约: '約', 难: '難', 队: '隊', 阶: '階',
  际: '際', 陆: '陸', 险: '險', 隐: '隱', 韩: '韓', 战: '戰', 户: '戶',
  扬: '揚', 执: '執', 扩: '擴', 护: '護', 报: '報', 拟: '擬', 拨: '撥',
  运: '運', 远: '遠', 连: '連', 迟: '遲', 适: '適', 选: '選', 递: '遞',
  达: '達', 违: '違', 灵: '靈', 层: '層', 迟: '遲', 碍: '礙', 矿: '礦',
};

// 防呆：移除簡繁同形的項（如 面→面、高→高）。
// 這種項若留著，findSimplified 會把正確的繁體誤報成簡體。
for (const k of Object.keys(S2T)) {
  if (S2T[k] === k) delete S2T[k];
}

const S2T_KEYS = new Set(Object.keys(S2T));

// ── 語境相依字（第三類）：留在 S2T，但**不列入逐字偵測**──────────────────
//
// 准：繁體裡 准（批准／准許／核准）與 準（準確／準則）都合法。
// 逐字判定必然誤報——「批准」「核准」「准許」全會被當成簡體。
// 它必須留在 S2T（閘門要開，否則「准確」不會被轉成「準確」），
// 但偵測改走 opencc 的詞組級比對（見 findContextSimplified）。
const S2T_CONTEXT = new Set(['准']);

// ── 安全單字對照表（S2T 的補充，不進偵測器）────────────────────────────────
//
// 🔴 2026-09-20 修掉一個循環盲區：
//   `toTraditional()` 原本拿 S2T_KEYS 當**閘門**——只有偵測到明確簡體字，
//   才把整串交給 opencc 做詞組級轉換。但 S2T 表不完整（缺「没」等字），
//   於是「没」這類字**永遠轉不到**；更糟的是 `findSimplified()` 也用同一張表，
//   所以複檢也抓不到 —— 偵測與轉換雙雙失明。
//
// 為什麼不能直接把這些字加進 S2T：一旦進了 S2T_KEYS，閘門就會為
// 「含有『没』但其他部分是繁體」的字串打開，整串丟給 opencc，
// 結果 opencc 會把已經是繁體的部分改錯：
//     跨平台 → 跨平臺　群組 → 羣組　減少干擾 → 減少幹擾　漏斗 → 漏鬥
//
// 解法：這些字**只做單字對照**，不觸發 opencc。
// 收錄條件（全部滿足）：
//   1. opencc 單字轉換後與原字不同（確實是簡體）
//   2. **無歧義**：該字在繁體裡不存在同樣字形（故排除 台/群/干/斗/里/
//      面/发/只/松/向/系/布/并/谷/几/克/么/曲/升/术/折/准/适/复/于/后）
//   3. 已實際出現在 registry 或知識詞檔中（不是憑空猜測）
const S2T_SAFE = {
  没: '沒', 热: '熱', 笔: '筆', 红: '紅', 无: '無', 渐: '漸',
  订: '訂', 寿: '壽', 辅: '輔', 踪: '蹤', 遥: '遙', 绪: '緒',
  献: '獻', 肤: '膚',
  // 2026-09-25：註解／log 清查時漏網的無歧義簡體字（繁體不存在同形字）。
  // 刻意不收「尝」——它對應 嘗／嚐 兩種繁體寫法，屬歧義字，須靠 opencc 上下文處理。
  败: '敗', 级: '級', 确: '確', 触: '觸', 试: '試', 显: '顯',
  // 2026-10-09：U+79BB（「離」的簡體形）。10-07 拿 20 個常用簡體字探測時，
  // 未抓到的 5 個碼位裡有 4 個屬刻意豁免（該字形在繁體本身合法），
  // 唯獨它是真缺口——同時不在 S2T_KEYS 也不在本表，於是偵測與轉換雙雙漏掉
  // （陷阱 19 的循環盲區）。收錄資格同上方註解：opencc 單字轉換後不同，
  // 且「离」在繁體裡不獨立存在。
  离: '離',

  // ── 2026-10-15 第八輪 Q1=A：陷阱 19 的循環盲區「規模化復發」 ─────────────
  // 發現經過：清洗 `*_zh`／原文欄位的簡體殘留時，改用 **raw opencc 逐字比對**
  // 當稽核器（`findSimplified` 只查本表，看不到表外的字 → 會假綠）。
  // 全庫 771 筆掃出 100 筆字串／64 筆工具含下表這些字，其中 **87 筆在 triggers**
  // （V1 身分維度，影響最直接——簡體 trigger 永遠匹配不到繁體查詢）。
  // 它們同時不在 S2T_KEYS 也不在本表，所以門禁看不到、fix-simplified 也修不動。
  //
  // 收錄資格（沿用上方三條件）：① opencc 單字轉換後不同 ② 繁體不存在同形字
  // ③ 已實際出現在 registry。**刻意排除**歧義或繁體合法字：台/群/表/托/干/核/
  // 了/制/游/布/合/床/才/峰/回/搜/秘/家/私/板/周/征/借/占/采/晒/致/吃/于/后/
  // 里/复/划/注/余（opencc 會把它們換成 臺/羣/錶/託/幹/覈/瞭/製/遊/佈/閤/牀/
  // 纔/峯/迴/蒐/祕/傢/俬/闆/週/徵/藉/佔/採/曬/緻/喫/於/後/裡/複/劃/註/餘 等
  // 變體——那是**偏好**不是簡繁，強改會動到已正確的繁體，見本檔 197-206 行）。
  //
  // 為什麼收在 S2T_SAFE 而不是 S2T：這些字只做**單字對照**、不開啟 opencc 閘門，
  // 因此不會把同串裡已正確的繁體字連帶改壞。
  // 例：「公開访客」只動 访→訪（allow-simplified：逐字引用要防治的簡體字，該字即本行的說明對象）
  机: '機', 审: '審', 谱: '譜', 将: '將', 绘: '繪', 获: '獲',
  监: '監', 词: '詞', 脚: '腳', 逻: '邏', 环: '環', 纯: '純',
  讨: '討', 润: '潤', 释: '釋', 纸: '紙', 较: '較', 础: '礎',
  装: '裝', 树: '樹', 气: '氣', 温: '溫', 娲: '媧', 联: '聯',
  畅: '暢', 灯: '燈', 旧: '舊', 脑: '腦', 栅: '柵', 盖: '蓋',
  状: '狀', 满: '滿', 断: '斷', 栏: '欄', 渗: '滲', 账: '賬',
  职: '職', 尔: '爾', 涨: '漲', 积: '積', 虫: '蟲', 缀: '綴',
  揽: '攬', 尽: '盡', 迁: '遷', 营: '營', 拦: '攔', 胀: '脹',
  访: '訪', 许: '許', 竞: '競', 盘: '盤',

  // ── 2026-11-01：registry 納入繁簡守門後挖出的兩個漏字 ──────────────────
  // 枢：真簡體（繁體不存在同形字，正確為「樞」）。先前不在 S2T 也不在 SAFE，
  //     偵測與轉換**雙雙失明**——實測「知識中枢」在守門下完全看不見，
  //     而它正是繁中 UI 直接顯示給使用者的字。
  枢: '樞',
  // 羣：opencc cn→t 的異體偏好（會把「群組」改成「羣組」）。本庫主流是「群」
  //     （全庫 群 105 vs 羣 1），cn→tw 已會正規化為「群」，此處補上單字對照，
  //     讓閘門在 gate 未開時也能抓到並修正它。
  羣: '群',
};

// ── opencc-js（優先）／內建表（備援） ──────────────────────────────────────
// 2026-09-19：手維護的對照表註定補不完。實測 trigger 擴充連續產出
// 「查询」「赔償」「训练」等漏網簡體——每次都是逐字補表，永遠有下一批。
// 改用 opencc-js 的 cn→t 詞組級轉換：
//   - 連原本刻意避開的歧義字都能靠上下文處理正確（恢复→恢復、干什么→幹什麼、后面→後面）
//   - 簡繁同形字（面試、搜尋、提升…）實測維持不變，不會誤報
//   - 純繁體、英文、數字皆不受影響
// 它是純 JS、安裝後離線可用，因此 npm test 仍不需網路。
// 若未安裝或載入失敗，自動降級回內建表（行為與過去一致）。
let openccConvert = null;
try {
  const OpenCC = await import('opencc-js');
  // 🔴 2026-11-01：cn→t → cn→tw（台灣正體）。
  // 為什麼改：實測 cn→t 會把**已經正確的繁體**改壞——
  //   核准與批准 → 覈准與批准　覈准的情況 → 覈準的情況
  //   群組設定 → 羣組設定　　　跨平台支援 → 跨平臺支援
  // cn→tw 保住群／核／准許／核准／系統／循環，只剩台與干需要還原（見 RESTORE_CHARS）。
  openccConvert = OpenCC.Converter({ from: 'cn', to: 'tw' });
} catch {
  openccConvert = null;
}

// ── 繁體合法但 opencc 會改寫的字形（逐位還原用）──────────────────────────
// 這些字在繁體裡合法，且是**本工具庫的主流寫法**（全庫統計：台 160 vs 臺 7、
// 干 13 vs 幹 0），但 opencc cn→tw 會把它們換成異體字。
//
// ⚠️ 必須「逐位比對後還原」，不能用全域 replace：否則「臺北」「幹部」這類
// 本來就對的繁體會被改壞。只把 opencc **動過的那一處**換回原字。
const RESTORE_CHARS = {
  '台': '臺',   // opencc：跨平台 → 跨平臺
  '干': '幹',   // opencc：減少干擾 → 減少幹擾
};

// ── 「准」的合法繁體用法（上下文規則）────────────────────────────────────
//
// 准在繁體裡是**一個合法字**，但它和「準」是兩個不同的字：
//   准（准許、批准、核准、允准）—— 允許的意思
//   準（準確、準則、標準）—— 精確的意思
// opencc 會把「准許」也改成「準許」（實測 cn→tw 與 cn→t 都會），那是把
// **已經正確的繁體改壞**。因此這裡用上下文判定：
//   後面接 許／予／以／該／此 → 准（准許／准予／准以／准該／准此）
//   前面接 批／允／獲／覈／核／不 → 准（批准／允准／獲准／覈准／核准／不准）
// 其餘情境（如「准確」）才交給 opencc 判斷。
const CONTEXT_KEEP_AFTER = '許予以該此';
const CONTEXT_KEEP_BEFORE = '批允獲覈核不';

/** 這一處的「准」是否屬於合法繁體用法（不需要轉成「準」）。 */
function isLegitimateQuan(s, i) {
  const next = s[i + 1] || '';
  const prev = s[i - 1] || '';
  if (next && CONTEXT_KEEP_AFTER.includes(next)) return true;
  if (prev && CONTEXT_KEEP_BEFORE.includes(prev)) return true;
  return false;
}

/**
 * 還原 opencc 改寫掉的合法繁體字形（逐位比對，只還原被動過的那幾處）。
 */
function restoreVariants(converted, original) {
  if (converted.length !== original.length) return converted;
  let out = converted;
  for (let i = 0; i < original.length; i++) {
    const orig = original[i];
    // ① 台／干 這類「合法但被換成異體字」
    const want = RESTORE_CHARS[orig];
    if (want && out[i] === want) {
      out = out.slice(0, i) + orig + out.slice(i + 1);
      continue;
    }
    // ② 「准許／批准／核准」被誤改成「準許／準准／覈准」
    if (S2T_CONTEXT.has(orig) && out[i] === '準' && isLegitimateQuan(original, i)) {
      out = out.slice(0, i) + orig + out.slice(i + 1);
    }
  }
  return out;
}

/**
 * 語境相依字的偵測（opencc 詞組級比對）。
 *
 * 准：繁體裡 准（批准／准許／核准／允准）與 準（準確／準則）**都合法**，
 * 逐字判定必然誤報——「批准」「核准」「准許」會全被當成簡體。
 * 改用 opencc cn→tw 的詞組級輸出判斷：只有當 opencc 真的會把「這一處」
 * 改掉、**且**該處不是合法繁體用法時，才算真正的簡體。
 *
 *   准確的數值 → opencc 改成 準確的數值 → 判定為簡體 ✅
 *   批准／核准／准許 → 合法繁體用法 → 不報 ✅
 */
function findContextSimplified(str) {
  if (!openccConvert) return [];
  const s = String(str);
  // 效能：只有真的含語境相依字才呼叫 opencc。registry/tools.json 有 6 萬多行，
  // 每行都呼叫一次會讓守門慢到不能用。
  let hasContext = false;
  for (const ch of s) {
    if (S2T_CONTEXT.has(ch)) { hasContext = true; break; }
  }
  if (!hasContext) return [];
  const converted = openccConvert(s);
  if (converted.length !== s.length) return [];   // 長度變了就不逐位比對（保守不報）
  const out = [];
  for (let i = 0; i < s.length; i++) {
    if (!S2T_CONTEXT.has(s[i])) continue;
    if (isLegitimateQuan(s, i)) continue;
    if (converted[i] !== s[i]) out.push(s[i]);
  }
  return out;
}

/** 將字串中的簡體字轉為繁體；非簡體字原樣保留。null/undefined → 空字串。 */
export function toTraditional(str) {
  if (str == null) return '';
  const s = String(str);
  if (!openccConvert) return [...s].map((ch) => S2T[ch] || S2T_SAFE[ch] || ch).join('');

  // ⚠️ 不可無條件交給 opencc：實測它會把**已經是繁體**的字串改錯
  // （「減少干擾」→「減少幹擾」、「群組」→「羣組」）。
  // 因此這裡用內建表的「安全子集」當作偵測器（刻意排除干/复/于/后 等歧義字），
  // 只有確認含明確簡體字時才交給 opencc 做詞組級轉換。
  const hasSimplified = [...s].some((ch) => S2T_KEYS.has(ch));
  if (hasSimplified) return restoreVariants(openccConvert(s), s);
  // 閘門沒開：絕大部分是「本來就全是繁體」，但不排除只有 S2T 表外簡體字
  // （「没」就是這樣整批漏網的）。此時**不**整串交給 opencc（會誤改 台/群/干），
  // 只做無歧義的單字對照。
  let out = '';
  let changed = false;
  for (const ch of s) {
    const mapped = S2T_SAFE[ch];
    if (mapped) { out += mapped; changed = true; } else { out += ch; }
  }
  return changed ? out : s;
}

/**
 * 回傳字串中仍是簡體的字元（用於驗證轉換完整性）。null/undefined → 空陣列。
 *
 * ⚠️ 一律走內建對照表，不用 opencc：opencc 單字轉換會把繁體的「干」→「幹」、
 * 「台」→「臺」，因此拿它當偵測器會把「減少干擾」「跨平台」誤報成簡體。
 * 偵測要保守（寧可漏），轉換才交給 opencc。
 */
export function findSimplified(str) {
  if (str == null) return [];
  const s = String(str);
  // 連 S2T_SAFE 一起查：這些字是無歧義簡體，但因不在主表內，
  // 過去不論轉換或偵測都抓不到（「没」曾整批漏網且複檢也顯示 0）。
  const out = [...s].filter((ch) => (S2T_KEYS.has(ch) && !S2T_CONTEXT.has(ch)) || S2T_SAFE[ch]);
  // 語境相依字（准）：逐字判定會誤報「批准／核准／准許」，
  // 改用 opencc 的詞組級比對（只有 opencc 真會改的那一處才算）。
  for (const ch of findContextSimplified(s)) out.push(ch);
  return out;
}

/** 目前是否使用 opencc-js（false 表示降級為內建對照表）。 */
export function usingOpenCC() {
  return Boolean(openccConvert);
}

async function main() {
  // node 內建模組延遲載入（見檔頭 2026-10-15 註記）：本檔會被瀏覽器管線 import，
  // 頂端不可出現靜態 node: import。
  const { readFileSync, writeFileSync, mkdirSync, copyFileSync } = await import('node:fs');
  const path = (await import('node:path')).default;
  const { fileURLToPath } = await import('node:url');
  const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
  const REGISTRY = path.join(ROOT, 'registry', 'tools.json');
  const BACKUP_DIR = path.join(ROOT, 'registry', 'backups');

  const apply = typeof process !== 'undefined' && process.argv.includes('--apply');
  const j = JSON.parse(readFileSync(REGISTRY, 'utf8'));
  const tools = j.tools.filter((t) => t.status === 'active' || t.status === 'experimental');

  const fields = ['triggers', 'capabilities', 'advantages', 'negativeConstraints'];
  // 🔴 2026-11-01：_zh 欄位一併納入修正範圍——它們正是繁中 UI 直接顯示的字，
  // 而且自此被 check-traditional 門禁看守。守門抓得到、修不掉是半套，
  // 這裡讓修正器與守門看同一批欄位。
  const zhFields = ['description_zh', 'useCase_zh', 'advantages_zh', 'negativeConstraints_zh'];
  const changes = [];
  let changedItems = 0, changedChars = 0, changedTools = new Set();

  for (const t of tools) {
    for (const f of [...fields, ...zhFields]) {
      const v = t[f];
      // 欄位可能是陣列，也可能是單一字串（實測 lucide 的 advantages_zh 是字串）——
      // 守門是掃「整行文字」，兩種形狀都會被看到，修正器就必須兩種都修得動。
      const arr = Array.isArray(v) ? v : (typeof v === 'string' ? [v] : null);
      if (!arr) continue;
      let dirty = false;
      for (let i = 0; i < arr.length; i++) {
        const bad = findSimplified(arr[i]);
        if (!bad.length) continue;
        const fixed = toTraditional(arr[i]);
        if (fixed === arr[i]) continue;
        changes.push({ id: t.id, field: f, from: arr[i], to: fixed });
        changedItems++;
        changedChars += bad.length;
        changedTools.add(t.id);
        dirty = true;
        if (apply) arr[i] = fixed;
      }
      if (apply && dirty && !Array.isArray(v)) t[f] = arr[0];
    }
    if (apply && typeof t.description === 'string') {
      const fixed = toTraditional(t.description);
      if (fixed !== t.description) t.description = fixed;
    }
    // subTools 的描述來自 GitHub README，可能是簡體中文（實測 baoyu-skills 有 5 處）。
    // 門禁掃整份檔案會看到它們，修正器就得修得動——守門抓得到、修不掉是半套。
    if (apply && Array.isArray(t.subTools)) {
      for (const st of t.subTools) {
        if (typeof st.description === 'string') {
          const fixed = toTraditional(st.description);
          if (fixed !== st.description) st.description = fixed;
        }
        if (typeof st.name === 'string') {
          const fixed = toTraditional(st.name);
          if (fixed !== st.name) st.name = fixed;
        }
      }
    }
  }

  console.log(`\n掃描 ${tools.length} 筆工具`);
  console.log(`  含簡體項目：${changedItems} 個（${changedChars} 個簡體字元，涉及 ${changedTools.size} 筆工具）\n`);
  for (const c of changes.slice(0, 12)) {
    console.log(`  [${c.field}] ${c.id}`);
    console.log(`    - ${c.from}`);
    console.log(`    + ${c.to}`);
  }
  if (changes.length > 12) console.log(`  …另有 ${changes.length - 12} 項`);

  if (!apply) {
    console.log('\n（預覽模式，未寫入。加 --apply 實際修正）');
    return;
  }

  mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  copyFileSync(REGISTRY, path.join(BACKUP_DIR, `tools.${stamp}.json`));
  writeFileSync(REGISTRY, `${JSON.stringify(j, null, 2)}\n`, 'utf8');
  console.log(`\n已修正並寫入 tools.json（備份於 registry/backups/）`);
}

let isDirect = false;
if (typeof process !== 'undefined' && process.argv[1]) {
  // pathToFileURL 才處理得了 Windows 磁碟機路徑（D:\… → file:///D:/…）；
  // 瀏覽器環境 `typeof process` 即為 false，這個動態 import 不會執行。
  const { pathToFileURL } = await import('node:url');
  isDirect = import.meta.url === pathToFileURL(process.argv[1]).href;
}
if (isDirect) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
