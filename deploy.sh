#!/bin/bash

# =============================================================================
# RoboHire API 部署脚本
# =============================================================================
# 功能: 1) 同步代码到 Lightark Gitlab  2) 远程服务器部署
# =============================================================================
# 用法:
#   ./deploy.sh <服务器IP> <用户名> <密码> [项目路径]
#
# 示例:
#   ./deploy.sh 192.168.1.100 root password123
#   ./deploy.sh 192.168.1.100 root password123 /app/myproject
# =============================================================================

set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# =============================================================================
# Git 配置区
# =============================================================================
BRANCH="main"
GITLAB_REPO="https://gitlab.lightark.cc/lightark-product/robohire.git"

# =============================================================================
# 服务器部署配置区
# =============================================================================
DEFAULT_PROJECT_PATH="/data/robohire/robohire"
HARBOR_URL="harbor.lightark.cc/iagent"
IMAGE_NAME="robohire-api"

# =============================================================================
# 参数检查
# =============================================================================
if [ -z "$1" ] || [ -z "$2" ] || [ -z "$3" ]; then
    echo -e "${RED}用法: $0 <服务器IP> <用户名> <密码> [项目路径]${NC}"
    echo ""
    echo "参数说明:"
    echo "  服务器IP    - 目标服务器的 IP 地址"
    echo "  用户名      - SSH 登录用户名"
    echo "  密码        - SSH 密码"
    echo "  项目路径    - (可选) 服务器上的项目路径，默认: ${DEFAULT_PROJECT_PATH}"
    exit 1
fi

# 获取参数
SERVER_IP="$1"
SSH_USER="$2"
SSH_PASS="$3"
SERVER_PROJECT_PATH="${4:-${DEFAULT_PROJECT_PATH}}"

# =============================================================================
# 第一步: Git 同步到 Lightark Gitlab
# =============================================================================
echo -e "${CYAN}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║           第一步: Git 代码同步到 Lightark Gitlab          ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════════════╝${NC}"
echo ""

# 获取当前脚本所在目录（项目根目录）
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
echo -e "${GREEN}📂 项目目录: ${SCRIPT_DIR}${NC}"
echo ""

# 设置临时目录（当前目录的上一层，名称为 tmp_robohire_api）
PARENT_DIR="$(dirname "${SCRIPT_DIR}")"
TEMP_DIR="${PARENT_DIR}/tmp_robohire_api"
trap "rm -rf ${TEMP_DIR}" EXIT

echo -e "${YELLOW}📦 设置临时目录: ${TEMP_DIR}${NC}"
echo ""

# 清理已存在的临时目录
if [ -d "${TEMP_DIR}" ]; then
    echo -e "${YELLOW}🗑️  清理已存在的临时目录...${NC}"
    rm -rf "${TEMP_DIR}"
fi

# 克隆远程仓库（获取远程最新代码）
echo -e "${YELLOW}📥 克隆远程仓库...${NC}"
git clone "${GITLAB_REPO}" "${TEMP_DIR}/robohire"
cd "${TEMP_DIR}/robohire"

# 切换到 main 分支
git checkout ${BRANCH}

# 复制本地 backend 和 frontend 到临时目录（覆盖远程文件）
echo -e "${YELLOW}📁 复制本地代码到临时目录...${NC}"
rm -rf backend frontend
cp -r "${SCRIPT_DIR}/backend" .
cp -r "${SCRIPT_DIR}/frontend" .

# 复制其他关键文件
cp "${SCRIPT_DIR}/package.json" .
cp "${SCRIPT_DIR}/package-lock.json" .
cp "${SCRIPT_DIR}/docker-compose.yaml" .
cp "${SCRIPT_DIR}/Dockerfile" .
cp "${SCRIPT_DIR}/nginx.conf" .
cp "${SCRIPT_DIR}/entrypoint.sh" .
cp -r "${SCRIPT_DIR}/scripts" .

echo -e "${GREEN}✅ 代码复制完成${NC}"
echo ""

# 提交所有更改
echo -e "${YELLOW}📝 提交更改...${NC}"
git add -A
if git diff --cached --quiet; then
    echo -e "${GREEN}✅ 没有新变更，无需提交${NC}"
else
    # 检查是否有 remote 分支，不存在则创建
    if ! git ls-remote --exit-code . "${BRANCH}" >/dev/null 2>&1; then
        echo -e "${YELLOW}🏷️ 创建远程分支 ${BRANCH}${NC}"
        git push -u origin ${BRANCH}
    fi
    git commit -m "Sync: $(date '+%Y-%m-%d %H:%M:%S')"
fi
echo ""

# 推送到远程
echo -e "${YELLOW}📤 推送到 Lightark Gitlab...${NC}"
git push origin ${BRANCH} -f

# 同步 tags
echo -e "${YELLOW}🏷️ 同步 Tags...${NC}"
git push origin --tags

echo ""
echo -e "${GREEN}✅ Lightark Gitlab 同步完成${NC}"
echo ""

# =============================================================================
# 第二步: 远程服务器部署
# =============================================================================
echo -e "${BLUE}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║           第二步: 远程服务器部署                         ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${GREEN}📡 服务器:${NC}   ${SSH_USER}@${SERVER_IP}"
echo -e "${GREEN}📁 项目路径:${NC} ${SERVER_PROJECT_PATH}"
echo ""

# 执行远程命令
echo -e "${YELLOW}🚀 执行部署命令...${NC}"
echo ""

sshpass -p "${SSH_PASS}" ssh -o StrictHostKeyChecking=no "${SSH_USER}@${SERVER_IP}" "
    cd '${SERVER_PROJECT_PATH}'
    
    echo '=========================================='
    echo '       服务器部署开始'
    echo '=========================================='
    echo ''
    
    # 显示当前目录
    echo '📂 项目目录: \$(pwd)'
    echo ''
    
    # 拉取最新代码
    echo '📥 Git 拉取最新代码...'
    git pull origin main
    echo ''
    
    # 停止旧容器
    echo '🛑 停止旧容器...'
    docker-compose down || true
    echo ''
    
    # 构建并启动
    echo '🚀 构建并启动服务...'
    docker-compose build
    docker-compose up -d
    
    echo ''
    echo '=========================================='
    echo '       部署完成!'
    echo '=========================================='
    echo ''
    
    # 显示容器状态
    echo '📊 容器状态:'
    docker ps --filter 'name=robohire-api' --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
    
    echo ''
    echo '🌐 访问地址:'
    echo '   前端: http://${SERVER_IP}:33607'
    echo '   API:  http://${SERVER_IP}:34607'
    
    echo ''
    echo '📝 最近日志:'
    docker-compose logs --tail=20
"

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}✅ 全部完成!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "💡 查看日志: ssh ${SSH_USER}@${SERVER_IP} 'cd ${SERVER_PROJECT_PATH} && docker-compose logs -f'"
