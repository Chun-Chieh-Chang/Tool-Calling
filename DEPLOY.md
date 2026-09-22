# 生產部署指南（Docker）

## 前置要求

- Docker 20.10+（或 Docker Desktop）
- Git
- 環境變數：`AGNES_API_KEYS`（若使用 rerank 功能）

---

## 快速開始（本地測試）

### 1. 構建鏡像

```bash
cd /path/to/Tool-Calling
git pull origin main
docker build --tag tool-calling:latest .
```

預期輸出：`Successfully tagged tool-calling:latest`

### 2. 本地運行測試

```bash
docker run \
  -e AGNES_API_KEYS=$AGNES_API_KEYS \
  -p 3000:3000 \
  --name tool-calling-test \
  tool-calling:latest
```

### 3. 驗證

開啟新終端：

```bash
# 檢查容器狀態
docker ps | grep tool-calling

# 測試 Web UI
curl http://localhost:3000 | head -20

# 測試健康檢查
docker exec tool-calling-test node -e "console.log('OK')"
```

預期：
- 容器運行中（STATUS: Up）
- HTTP 200 返回 HTML
- 容器可執行命令

### 4. 清理測試容器

```bash
docker stop tool-calling-test
docker rm tool-calling-test
```

---

## 生產部署

### 方案 A：Docker Compose（推薦）

**1. 建立 `docker-compose.yml`**

```yaml
version: '3.8'

services:
  tool-calling:
    image: tool-calling:latest
    container_name: tool-calling-web
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      NODE_ENV: production
      PORT: 3000
      AGNES_API_KEYS: ${AGNES_API_KEYS}
    volumes:
      - ./logs:/app/logs
    healthcheck:
      test: ["CMD", "node", "-e", "require('http').get('http://localhost:3000')"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 10s
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
```

**2. 啟動服務**

```bash
# 設置環境變數
export AGNES_API_KEYS="sk-xxx,sk-yyy"

# 啟動（後台）
docker-compose up -d

# 查看日誌
docker-compose logs -f tool-calling

# 停止
docker-compose down
```

---

### 方案 B：Kubernetes（企業級）

**1. 構建並推送鏡像到私有倉庫**

```bash
docker build --tag your-registry/tool-calling:latest .
docker push your-registry/tool-calling:latest
```

**2. 建立 `k8s-deployment.yaml`**

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: tool-calling
  namespace: production
spec:
  replicas: 2
  selector:
    matchLabels:
      app: tool-calling
  template:
    metadata:
      labels:
        app: tool-calling
    spec:
      containers:
      - name: web
        image: your-registry/tool-calling:latest
        imagePullPolicy: Always
        ports:
        - containerPort: 3000
        env:
        - name: NODE_ENV
          value: "production"
        - name: AGNES_API_KEYS
          valueFrom:
            secretKeyRef:
              name: tool-calling-secrets
              key: api-keys
        livenessProbe:
          httpGet:
            path: /
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /
            port: 3000
          initialDelaySeconds: 10
          periodSeconds: 5
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"

---
apiVersion: v1
kind: Service
metadata:
  name: tool-calling
  namespace: production
spec:
  type: LoadBalancer
  ports:
  - port: 80
    targetPort: 3000
  selector:
    app: tool-calling
```

**3. 部署**

```bash
# 設置 API key
kubectl create secret generic tool-calling-secrets \
  --from-literal=api-keys=$AGNES_API_KEYS \
  -n production

# 部署
kubectl apply -f k8s-deployment.yaml

# 檢查狀態
kubectl get deployment tool-calling -n production
kubectl logs -f deployment/tool-calling -n production
```

---

## CI/CD 集成（GitHub Actions）

建立 `.github/workflows/deploy.yml`：

```yaml
name: Deploy to Production

on:
  push:
    branches: [main]
    paths:
      - 'core/**'
      - 'web/**'
      - 'registry/**'
      - 'package*.json'
      - 'Dockerfile'

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v3
    
    - name: Build Docker image
      run: |
        docker build \
          --tag tool-calling:${{ github.sha }} \
          --tag tool-calling:latest \
          .
    
    - name: Push to registry
      env:
        REGISTRY: your-registry
        USERNAME: ${{ secrets.REGISTRY_USERNAME }}
        PASSWORD: ${{ secrets.REGISTRY_PASSWORD }}
      run: |
        echo "$PASSWORD" | docker login -u "$USERNAME" --password-stdin $REGISTRY
        docker tag tool-calling:latest $REGISTRY/tool-calling:latest
        docker push $REGISTRY/tool-calling:latest
    
    - name: Deploy to production
      env:
        DEPLOY_HOST: ${{ secrets.DEPLOY_HOST }}
        DEPLOY_USER: ${{ secrets.DEPLOY_USER }}
        DEPLOY_KEY: ${{ secrets.DEPLOY_KEY }}
      run: |
        mkdir -p ~/.ssh
        echo "$DEPLOY_KEY" > ~/.ssh/deploy_key
        chmod 600 ~/.ssh/deploy_key
        ssh -i ~/.ssh/deploy_key $DEPLOY_USER@$DEPLOY_HOST << 'EOF'
          cd /home/tool-calling
          docker-compose pull
          docker-compose up -d
        EOF
```

---

## 監測 & 維護

### 日誌監測

```bash
# Docker Compose
docker-compose logs -f --tail 50 tool-calling

# Docker 直接
docker logs -f tool-calling-web

# Kubernetes
kubectl logs -f deployment/tool-calling -n production --tail=50
```

### 性能指標

監測這些指標：

```bash
# CPU/記憶體使用率
docker stats tool-calling-web

# 請求延遲（P95）
# 預期：<500ms（搜尋 + 融合）

# 誤判率
# 預期：<0.1% (HTTP 5xx)

# no-match 率
# 預期：15-20%（正常）
```

### 備份 & 恢復

```bash
# 備份註冊表
docker exec tool-calling-web tar czf - /app/registry > registry-backup.tar.gz

# 恢復
docker cp registry-backup.tar.gz tool-calling-web:/tmp/
docker exec tool-calling-web tar xzf /tmp/registry-backup.tar.gz
```

---

## 版本管理

### 標記規則

```bash
# 開發版
docker build --tag tool-calling:dev .

# 正式版（按 git 提交）
docker build --tag tool-calling:$(git rev-parse --short HEAD) .

# 發行版（按語意版本）
docker build --tag tool-calling:1.0.0 .
```

### 回滾

```bash
# 查看已有版本
docker images tool-calling

# 回滾到前一版本
docker-compose down
docker pull tool-calling:prev-commit-hash
sed -i 's/latest/prev-commit-hash/g' docker-compose.yml
docker-compose up -d
```

---

## 常見問題

**Q: 容器啟動失敗（OOMKilled）**
- A: 增加記憶體限制（Dockerfile 預設 512MB）

**Q: API key 過期導致 rerank 失敗**
- A: 更新環境變數後重啟：`docker-compose restart`

**Q: 部署後 no-match 率異常高**
- A: 檢查 registry 是否正確複製。驗證：`docker exec tool-calling-web ls -la /app/registry`

**Q: 效能下降**
- A: 檢查 CPU/記憶體限制。分析慢查詢：在 Web UI 中查看「深度搜尋」時間

---

## 生產檢查清單

- [ ] Docker 版本 ≥ 20.10
- [ ] AGNES_API_KEYS 已設置
- [ ] 防火牆允許 3000 端口（或代理設置）
- [ ] 日誌收集已配置（JSON File / ELK Stack）
- [ ] 備份計畫已制定
- [ ] 監測告警已設置（CPU > 80%、記憶體 > 75%）
- [ ] SSL/TLS 已配置（nginx 反向代理）
- [ ] 本地測試通過
- [ ] 回滾計畫已文檔化

---

## 支援

- 問題排查：查看容器日誌 `docker logs -f tool-calling-web`
- 性能優化：調整 `Dockerfile` 中的 `--max-old-space-size`
- 監測面板：推薦使用 Grafana + Prometheus

---

**最後更新**：2026-09-22  
**版本**：tool-calling v1.0.0 (決策閾值修正後)
