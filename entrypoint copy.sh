#!/bin/bash
set -e

echo "=========================================="
echo "       GoHire API Startup Script"
echo "=========================================="

# 设置环境变量
export NODE_ENV=production

# 启动后端服务（后台运行）
echo "[1/2] Starting backend server on port 4607..."
node /app/backend/index.js &
BACKEND_PID=$!

echo "Backend started with PID: $BACKEND_PID"

# 等待后端服务启动
echo "Waiting for backend to be ready..."
for i in {1..30}; do
    if curl -s http://localhost:4607/api/v1/health > /dev/null 2>&1; then
        echo "Backend is ready!"
        break
    fi
    if [ $i -eq 30 ]; then
        echo "Backend failed to start within 30 seconds"
        exit 1
    fi
    sleep 1
done

# 启动 nginx（前台运行）
echo "[2/2] Starting nginx on port 80..."
exec /usr/sbin/nginx -g "daemon off;"
