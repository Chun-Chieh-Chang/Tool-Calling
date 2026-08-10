

---

## 🌐 網頁版 UI

啟動網頁介面（**必須從專案根目錄執行**）：

```bash
# 方式一：Python HTTP Server
python -m http.server 3000

# 方式二：Node http-server
npx http-server -p 3000

# 然後開啟瀏覽器訪問 http://localhost:3000/web/
```

> ⚠️ **重要**：不要直接打開 `web/index.html`（file:// 協議不支援 ES Module），必須透過 HTTP Server 才能正常載入！

網頁版提供：
- 📊 **儀表板總覽** - 統計圖表與分類概覽
- 🔧 **工具目錄列表** - 完整的工具瀏覽與搜尋
- 🔥 **每週涨星榜** - GitHub 熱門 AI 工具排行
- 🌐 **互動式知識圖譜** - 3D 可視化工具關係網絡
