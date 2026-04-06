#!/bin/bash

# RoboHire API - Start All Services Script

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Ports
BACKEND_PORT=4607
FRONTEND_PORT=3607
BACKEND_HEALTH_URL="http://localhost:${BACKEND_PORT}/api/v1/health"
FRONTEND_URL="http://localhost:${FRONTEND_PORT}"
STARTUP_TIMEOUT_SECONDS=60

echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║           RoboHire API - Start All Services                  ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Navigate to project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

echo -e "${BLUE}📁 Project directory: $PROJECT_ROOT${NC}"
echo ""

wait_for_http() {
    local url=$1
    local label=$2
    local timeout=${3:-$STARTUP_TIMEOUT_SECONDS}

    for ((i=1; i<=timeout; i++)); do
        if ! kill -0 "$DEV_PID" 2>/dev/null; then
            echo -e "${RED}✗ npm run dev exited before ${label} became ready${NC}"
            wait "$DEV_PID" 2>/dev/null || true
            return 1
        fi

        if curl -fsS "$url" >/dev/null 2>&1; then
            echo -e "${GREEN}✓ ${label} is ready${NC}"
            return 0
        fi

        sleep 1
    done

    echo -e "${RED}✗ Timed out waiting for ${label} at ${url}${NC}"
    return 1
}

cleanup() {
    # Send SIGINT if process is still alive (covers EXIT without prior signal, e.g. TERM)
    if [ -n "${DEV_PID:-}" ] && kill -0 "$DEV_PID" 2>/dev/null; then
        kill -INT "$DEV_PID" 2>/dev/null || true
        wait "$DEV_PID" 2>/dev/null || true
    fi
    echo -e "${GREEN}✓ All services stopped${NC}"
}

# On first Ctrl+C: let children handle SIGINT from the terminal; don't re-signal.
# On second Ctrl+C: force exit.
handle_int() {
    if [ "${INT_RECEIVED:-}" = "1" ]; then
        echo -e "\n${RED}Force exit${NC}"
        exit 1
    fi
    INT_RECEIVED=1
    echo -e "\n${YELLOW}⏹  Shutting down (press Ctrl+C again to force)...${NC}"
    # Children already got SIGINT from terminal; just wait
}

trap handle_int INT
trap cleanup EXIT TERM

# Start backend, frontend, and agent worker
echo -e "${BLUE}🚀 Starting backend, frontend, and agent worker...${NC}"
npm run dev &
DEV_PID=$!

echo -e "${BLUE}⏳ Waiting for backend API...${NC}"
wait_for_http "$BACKEND_HEALTH_URL" "Backend API"

echo -e "${BLUE}⏳ Waiting for frontend...${NC}"
wait_for_http "$FRONTEND_URL" "Frontend"

echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                 Services Started Successfully              ║${NC}"
echo -e "${GREEN}╠════════════════════════════════════════════════════════════╣${NC}"
echo -e "${GREEN}║  Backend:       http://localhost:${BACKEND_PORT}                      ║${NC}"
echo -e "${GREEN}║  Frontend:      http://localhost:${FRONTEND_PORT}                      ║${NC}"
echo -e "${GREEN}║  Agent Worker:  LiveKit interview agent                    ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}Press Ctrl+C to stop all services${NC}"

# Wait for background process
wait "$DEV_PID"
