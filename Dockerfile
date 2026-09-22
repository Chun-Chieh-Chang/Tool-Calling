# 多階段構建：先編譯，再打包
FROM node:20-alpine AS builder

WORKDIR /build
COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# 最終鏡像：只包含運行時依賴
FROM node:20-alpine

WORKDIR /app

# 安全性：使用非 root 用戶
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# 複製生產依賴列表和鎖文件
COPY package*.json ./

# 只安裝生產依賴
RUN npm ci --only=production && \
    npm cache clean --force

# 從 builder 階段複製已構建的資源和源代碼
COPY --from=builder /build/dist ./dist
COPY --from=builder /build/core ./core
COPY --from=builder /build/web ./web
COPY --from=builder /build/registry ./registry
COPY --from=builder /build/cli.js ./cli.js
COPY --from=builder /build/mcp-server.js ./mcp-server.js

# 切換至 nodejs 用戶
USER nodejs

# 暴露端口
EXPOSE 3000

# 健康檢查
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000', (r)=>{if(r.statusCode!==200)throw new Error(r.statusCode)})"

# 啟動命令
CMD ["npm", "start"]
