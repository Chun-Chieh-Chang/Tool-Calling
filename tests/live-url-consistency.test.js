import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// 2026-10-15 第七輪：live 工作台的公開網址**每次重新發佈都會換一組**。
// 實測：連續三次部署得到三個不同連結，舊連結全部失效（HTTP 400）。
//
// 這個網址在 repo 裡是多點寫死的（遙測中繼 meta、導流橫幅 href、README 線上版
// 對照表），而「只更新其中一處」不會有任何徵兆——Pages 的遙測中繼與導流橫幅
// 會靜默指向死連結，症狀和「功能還沒做」一模一樣。本測試把「多點必須一致」
// 變成機制。
//
// 刻意不收 HANDOFF.md：那裡記的是歷史部署紀錄（哪一天發佈到哪個連結），
// 改了就不是紀錄了。

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const LIVE_URL_RE = /https:\/\/[a-f0-9]{32}\.sg\.agentos-app\.run/g;

const read = (p) => readFileSync(join(repoRoot, p), 'utf-8');
const matches = (s) => s.match(LIVE_URL_RE) || [];

test('live 工作台網址：relay meta 與導流橫幅指向同一個連結，且兩處都在', () => {
  const html = read('web/index.html');
  const unique = [...new Set(matches(html))];
  assert.equal(
    unique.length,
    1,
    `web/index.html 應恰好出現一種 live 網址，實際：${JSON.stringify(unique)}`
  );
  assert.equal(
    matches(html).length,
    2,
    'relay meta 與導流橫幅 href 都必須帶 live 網址（少一個＝某條路徑靜默失效）'
  );
});

test('live 工作台網址：README 線上版對照表與 web/index.html 一致', () => {
  const htmlUrl = [...new Set(matches(read('web/index.html')))][0];
  const readmeUrls = [...new Set(matches(read('README.md')))];
  assert.deepEqual(
    readmeUrls,
    [htmlUrl],
    'README 的「工具選用工作台（完整版）」連結必須與 web/index.html 相同'
  );
});

test('live 工作台網址：不得在 app.js 寫死主機白名單', () => {
  // 導流橫幅改用後端能力探測（GET /api/trending/status）：寫死主機清單會隨
  // 每次部署過期，而過期的後果是橫幅反過來出現在 live 工作台上，對著完整版
  // 的使用者說「你正在瀏覽靜態展示版」。這條測試防止那個清單被加回來。
  //
  // 用裸字串比對而非 LIVE_URL_RE：原本的清單存的是**不帶 scheme 的 host**
  // （`<hex>.sg.agentos-app.run`），只認 `https://…` 的樣式會漏掉它
  // ——負向對照（把清單加回去）當場證明過那個漏網。
  assert.ok(
    !read('web/app.js').includes('agentos-app.run'),
    'app.js 不應出現 live 主機（任何形式）——請用 /api/trending/status 能力探測'
  );
});
