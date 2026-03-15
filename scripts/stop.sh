#!/bin/bash

# RoboHire API - Stop All Services Script

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Ports
BACKEND_PORT=4607
FRONTEND_PORT=3607
GRACE_PERIOD_SECONDS=10

echo -e "${YELLOW}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${YELLOW}║           RoboHire API - Stop All Services                   ║${NC}"
echo -e "${YELLOW}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

terminate_pids() {
    local label=$1
    shift
    local pids=("$@")

    if [ ${#pids[@]} -eq 0 ]; then
        return 1
    fi

    echo -e "${YELLOW}⏹  Stopping ${label} (PID: ${pids[*]})...${NC}"
    kill "${pids[@]}" 2>/dev/null || true

    for ((i=0; i<GRACE_PERIOD_SECONDS; i++)); do
        local remaining=()
        for pid in "${pids[@]}"; do
            if kill -0 "$pid" 2>/dev/null; then
                remaining+=("$pid")
            fi
        done

        if [ ${#remaining[@]} -eq 0 ]; then
            echo -e "${GREEN}✓  ${label} stopped cleanly${NC}"
            return 0
        fi

        sleep 1
    done

    local remaining=()
    for pid in "${pids[@]}"; do
        if kill -0 "$pid" 2>/dev/null; then
            remaining+=("$pid")
        fi
    done

    if [ ${#remaining[@]} -gt 0 ]; then
        echo -e "${RED}⚠  ${label} did not exit after ${GRACE_PERIOD_SECONDS}s, forcing stop...${NC}"
        kill -9 "${remaining[@]}" 2>/dev/null || true
    fi

    sleep 1
    echo -e "${GREEN}✓  ${label} stopped${NC}"
    return 0
}

# Function to kill process on a port
kill_port() {
    local port=$1
    local pids=($(lsof -ti :"$port" 2>/dev/null))
    if [ ${#pids[@]} -gt 0 ]; then
        terminate_pids "process on port $port" "${pids[@]}"
        return 0
    fi

    echo -e "${GREEN}✓  No process running on port $port${NC}"
    return 1
}

# Function to kill agent worker processes
kill_agent() {
    local pids=($(pgrep -f "interview-worker" 2>/dev/null))
    if [ ${#pids[@]} -gt 0 ]; then
        terminate_pids "agent worker" "${pids[@]}"
        return 0
    fi

    echo -e "${GREEN}✓  No agent worker running${NC}"
    return 1
}

# Kill processes
stopped=0
kill_port $BACKEND_PORT && stopped=$((stopped + 1))
kill_port $FRONTEND_PORT && stopped=$((stopped + 1))
kill_agent && stopped=$((stopped + 1))

echo ""
if [ $stopped -gt 0 ]; then
    echo -e "${GREEN}✓ Stopped $stopped service(s)${NC}"
else
    echo -e "${GREEN}✓ No services were running${NC}"
fi
