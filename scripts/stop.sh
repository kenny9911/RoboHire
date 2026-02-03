#!/bin/bash

# GoHire API - Stop All Services Script

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Ports
BACKEND_PORT=4607
FRONTEND_PORT=3607

echo -e "${YELLOW}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${YELLOW}║           GoHire API - Stop All Services                   ║${NC}"
echo -e "${YELLOW}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Function to kill process on a port
kill_port() {
    local port=$1
    local pid=$(lsof -ti :$port 2>/dev/null)
    if [ -n "$pid" ]; then
        echo -e "${YELLOW}⏹  Stopping process on port $port (PID: $pid)...${NC}"
        kill -9 $pid 2>/dev/null || true
        sleep 1
        echo -e "${GREEN}✓  Stopped${NC}"
        return 0
    else
        echo -e "${GREEN}✓  No process running on port $port${NC}"
        return 1
    fi
}

# Kill processes
stopped=0
kill_port $BACKEND_PORT && stopped=$((stopped + 1))
kill_port $FRONTEND_PORT && stopped=$((stopped + 1))

echo ""
if [ $stopped -gt 0 ]; then
    echo -e "${GREEN}✓ Stopped $stopped service(s)${NC}"
else
    echo -e "${GREEN}✓ No services were running${NC}"
fi
