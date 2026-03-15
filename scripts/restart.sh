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

echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║           RoboHire API - Restart All Services                ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

echo -e "${YELLOW}Step 1: Stopping existing services...${NC}"
"$SCRIPT_DIR/stop.sh"
echo ""

echo -e "${YELLOW}Step 2: Starting services...${NC}"
echo ""
exec "$SCRIPT_DIR/start.sh"
