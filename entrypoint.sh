#!/bin/bash
set -e

echo "=========================================="
echo "       GoHire API Startup Script"
echo "=========================================="

# 设置环境变量
export NODE_ENV=production

# 增加文件描述符限制 (nginx 需要)
ulimit -n 65535 2>/dev/null || true
echo "文件描述符限制: $(ulimit -n)"

# 配置参数
HEALTH_CHECK_INTERVAL=10       # 健康检查间隔（秒）
MAX_RESTART_ATTEMPTS=5         # 最大连续重启次数
RESTART_COOLDOWN=30            # 重启冷却时间（秒）
BACKEND_PORT=4607
NGINX_PORT=80

# 重启计数器
RESTART_COUNT=0
LAST_RESTART_TIME=0

# 记录日志函数
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"
}

# 检查后端进程是否存活
check_backend_alive() {
    # 检查进程是否存在
    if ! kill -0 $BACKEND_PID 2>/dev/null; then
        return 1
    fi
    # 检查健康端点
    if ! curl -s http://localhost:${BACKEND_PORT}/api/v1/health > /dev/null 2>&1; then
        return 1
    fi
    return 0
}

# 检查 nginx 是否存活
check_nginx_alive() {
    # 检查 nginx 主进程
    if pgrep -x nginx > /dev/null 2>&1; then
        return 0
    fi
    return 1
}

# 重启后端服务
restart_backend() {
    log "⚠️  后端服务异常，准备重启..."

    # 记录重启信息
    RESTART_COUNT=$((RESTART_COUNT + 1))
    CURRENT_TIME=$(date +%s)

    # 检查是否超过冷却时间
    if [ $((CURRENT_TIME - LAST_RESTART_TIME)) -lt $RESTART_COOLDOWN ]; then
        log "🚫 距离上次重启不足 ${RESTART_COOLDOWN}秒，跳过重启"
        return 0
    fi

    # 关闭旧进程
    if [ -n "$BACKEND_PID" ] && kill -0 $BACKEND_PID 2>/dev/null; then
        log "🛑 停止旧后端进程 (PID: $BACKEND_PID)..."
        kill -TERM $BACKEND_PID 2>/dev/null || true
        # 等待进程退出
        for i in {1..5}; do
            if ! kill -0 $BACKEND_PID 2>/dev/null; then
                break
            fi
            sleep 1
        done
        # 强制 kill
        kill -9 $BACKEND_PID 2>/dev/null || true
    fi

    # 清理僵尸进程
    wait $BACKEND_PID 2>/dev/null || true

    log "🚀 启动新后端进程..."

    # 启动新进程
    cd /app/backend
    node index.js &
    BACKEND_PID=$!

    log "✅ 后端已重启 (PID: $BACKEND_PID, 重启次数: $RESTART_COUNT)"

    LAST_RESTART_TIME=$(date +%s)
}

# 重启 nginx
restart_nginx() {
    log "⚠️  nginx 异常，准备重启..."

    # 停止 nginx
    log "🛑 停止 nginx..."
    pkill -x nginx 2>/dev/null || true
    sleep 2

    # 重新测试配置并启动
    log "🚀 启动 nginx..."

    # 测试配置
    if ! nginx -t 2>&1; then
        log "❌ nginx 配置错误，无法重启"
        return 1
    fi

    nginx -g "daemon on;"

    # 等待启动
    sleep 2
    for i in {1..5}; do
        if pgrep -x nginx > /dev/null 2>&1; then
            log "✅ nginx 已重启 (PID: $(pgrep -x nginx))"
            return 0
        fi
        sleep 1
    done

    log "❌ nginx 重启失败"
    return 1
}

# 启动后端服务
start_backend() {
    log "[1/2] 启动后端服务 on port ${BACKEND_PORT}..."

    cd /app/backend
    node index.js &
    BACKEND_PID=$!

    log "后端启动中 (PID: $BACKEND_PID)..."

    # 等待后端服务启动
    log "等待后端服务启动..."
    for i in {1..30}; do
        if curl -s http://localhost:${BACKEND_PORT}/api/v1/health > /dev/null 2>&1; then
            log "✅ 后端服务就绪!"
            return 0
        fi
        if [ $i -eq 10 ]; then
            log "⚠️  后端启动较慢，继续等待..."
        fi
        sleep 1
    done

    log "❌ 后端服务启动失败"
    exit 1
}

# 启动 nginx - 智能检测是否已运行
start_nginx() {
    log "[2/2] 启动 nginx on port ${NGINX_PORT}..."

    # 检查 nginx 是否已经在运行
    if pgrep -x nginx > /dev/null 2>&1; then
        NGINX_PID=$(pgrep -x nginx | head -1)
        log "✅ nginx 已在运行 (PID: $NGINX_PID)"
        return 0
    fi

    # nginx 未运行，启动它
    log "启动 nginx..."
    nginx -g "daemon on;"
    sleep 2

    # 验证启动成功
    if pgrep -x nginx > /dev/null 2>&1; then
        NGINX_PID=$(pgrep -x nginx | head -1)
        log "✅ nginx 启动成功 (PID: $NGINX_PID)"
        return 0
    fi

    log "❌ nginx 启动失败"
    exit 1
}

# 主进程监控循环
monitor_processes() {
    log "🔄 进入进程监控模式..."

    while true; do
        # 检查后端
        if ! check_backend_alive; then
            log "❌ 后端服务异常"
            restart_backend
        fi

        # 检查 nginx
        if ! check_nginx_alive; then
            log "❌ nginx 异常"
            restart_nginx
        fi

        # 等待下次检查
        sleep $HEALTH_CHECK_INTERVAL
    done
}

# 优雅关闭
cleanup() {
    log "🛑 收到终止信号，正在关闭服务..."

    if [ -n "$BACKEND_PID" ] && kill -0 $BACKEND_PID 2>/dev/null; then
        log "停止后端进程 (PID: $BACKEND_PID)..."
        kill -TERM $BACKEND_PID
        wait $BACKEND_PID 2>/dev/null || true
    fi

    pkill -x nginx 2>/dev/null || true

    log "✅ 服务已关闭"
    exit 0
}

# trap 信号
trap cleanup SIGTERM SIGINT SIGHUP

# ========== 主程序入口 ==========

# 1. 启动后端
start_backend

# 2. 启动 nginx
start_nginx

log ""
log "╔══════════════════════════════════════════════════════╗"
log "║           GoHire API 服务已启动!                      ║"
log "╠══════════════════════════════════════════════════════╣"
log "║  后端:  PID $BACKEND_PID                             ║"
log "║  监控:  每 ${HEALTH_CHECK_INTERVAL}秒检查一次                               ║"
log "║  重启:  连续失败 $MAX_RESTARTS 次后进入冷却                       ║"
log "╚══════════════════════════════════════════════════════╝"
log ""

# 3. 进入监控循环
monitor_processes
