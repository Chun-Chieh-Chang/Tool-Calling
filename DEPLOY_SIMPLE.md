# 簡單部署指南

## 生產機環境要求

- Node.js 20+
- npm
- Git

## 部署步驟（複製貼上即可）

### 第一次部署

```bash
# 1. 進入目錄
cd /home/tool-calling

# 2. 複製代碼
git clone https://github.com/你的帳號/Tool-Calling.git
cd Tool-Calling

# 3. 安裝依賴
npm install --production

# 4. 構建
npm run build

# 5. 啟動
npm start
```

服務運行在 http://localhost:3000

### 更新部署

```bash
cd /home/tool-calling/Tool-Calling

# 1. 拉最新代碼
git pull origin main

# 2. 重新構建
npm run build

# 3. 重啟服務
# （停止前面的 npm start，再執行）
npm start
```

## 保持運行（後台）

```bash
# 方法 1：nohup（最簡單）
nohup npm start > server.log 2>&1 &

# 方法 2：screen（可重新連接）
screen -S tool-calling
npm start
# 按 Ctrl+A 再 D 離開（保持運行）

# 方法 3：systemd service（最穩定）
# 建立 /etc/systemd/system/tool-calling.service
[Unit]
Description=Tool-Calling Service
After=network.target

[Service]
Type=simple
User=nodejs
WorkingDirectory=/home/tool-calling/Tool-Calling
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target

# 然後執行
sudo systemctl daemon-reload
sudo systemctl enable tool-calling
sudo systemctl start tool-calling
sudo systemctl status tool-calling
```

## 驗證

```bash
# 測試 HTTP
curl http://localhost:3000 | head -20

# 測試搜尋
curl "http://localhost:3000" | grep -i "tool-calling"
```

## 日誌

```bash
# nohup 方式
tail -f server.log

# screen 方式
screen -r tool-calling

# systemd 方式
sudo journalctl -u tool-calling -f
```

## 停止服務

```bash
# nohup 方式
pkill -f "npm start"

# screen 方式
screen -X -S tool-calling quit

# systemd 方式
sudo systemctl stop tool-calling
```

## 故障排查

**問題：Port 3000 已被佔用**
```bash
lsof -i :3000  # 找出佔用進程
kill -9 <PID>  # 強制停止
```

**問題：npm start 報錯**
```bash
npm install  # 重新安裝全部依賴（包括 dev）
npm run test  # 驗證測試通過
```

**問題：效能不足**
```bash
# 增加 Node.js 記憶體上限
NODE_OPTIONS="--max-old-space-size=2048" npm start
```

---

完成。現在就可以部署了。
