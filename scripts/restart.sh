#!/bin/bash

# RoboHire API - Restart All Services Script
# This script stops any running services and restarts them

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Ports
BACKEND_PORT=4607
FRONTEND_PORT=3607

echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║           RoboHire API - Restart All Services                ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Function to kill process on a port
kill_port() {
    local port=$1
    local pid=$(lsof -ti :$port 2>/dev/null)
    if [ -n "$pid" ]; then
        echo -e "${YELLOW}⏹  Stopping process on port $port (PID: $pid)...${NC}"
        kill -9 $pid 2>/dev/null || true
        sleep 1
        echo -e "${GREEN}✓  Port $port is now free${NC}"
    else
        echo -e "${GREEN}✓  Port $port is already free${NC}"
    fi
}

# Function to kill agent worker processes
kill_agent() {
    local pids=$(pgrep -f "interview-worker" 2>/dev/null)
    if [ -n "$pids" ]; then
        echo -e "${YELLOW}⏹  Stopping agent worker (PID: $pids)...${NC}"
        echo "$pids" | xargs kill -9 2>/dev/null || true
        sleep 1
        echo -e "${GREEN}✓  Agent worker stopped${NC}"
    else
        echo -e "${GREEN}✓  No agent worker running${NC}"
    fi
}

# Step 1: Stop existing services
echo -e "${YELLOW}Step 1: Stopping existing services...${NC}"
kill_port $BACKEND_PORT
kill_port $FRONTEND_PORT
kill_agent
echo ""

# Step 2: Navigate to project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

echo -e "${YELLOW}Step 2: Project directory: $PROJECT_ROOT${NC}"
echo ""

# Step 3: Start services
echo -e "${YELLOW}Step 3: Starting services...${NC}"
echo ""

# Start backend, frontend, and agent worker
echo -e "${BLUE}🚀 Starting backend, frontend, and agent worker...${NC}"
npm run dev &

# Wait a moment for services to start
sleep 3

echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                 Services Started Successfully              ║${NC}"
echo -e "${GREEN}╠════════════════════════════════════════════════════════════╣${NC}"
echo -e "${GREEN}║  Backend:       http://localhost:${BACKEND_PORT}                      ║${NC}"
echo -e "${GREEN}║  Frontend:      http://localhost:${FRONTEND_PORT}                      ║${NC}"
echo -e "${GREEN}║  Agent Worker:  LiveKit interview agent                   ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}Press Ctrl+C to stop all services${NC}"

# Wait for background process
wait
