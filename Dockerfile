# 构建参数
ARG BUILD_DATE=latest

# 构建阶段 - 构建前端
FROM  harbor.lightark.cc/infra/node:22.15-bookworm-slim as frontend-build

WORKDIR /app

# 复制前端 package.json
COPY frontend/package*.json ./

# 配置 npm 使用国内镜像源并安装依赖
RUN npm config set registry https://registry.npmmirror.com/ && \
    npm config set fetch-retry-mintimeout 20000 && \
    npm config set fetch-retry-maxtimeout 120000 && \
    npm config set fetch-retries 5 && \
    npm config set fetch-timeout 300000 && \
    npm config set maxsockets 5 && \
    npm cache clean --force

# 安装依赖
RUN npm install --legacy-peer-deps --no-audit --no-fund || \
    (echo "First install attempt failed, retrying..." && \
     npm cache clean --force && \
     npm install --legacy-peer-deps --no-audit --no-fund)

# 复制前端源代码
COPY frontend/ ./

# 构建前端
RUN npm run build

# 构建阶段 - 构建后端
FROM harbor.lightark.cc/infra/node:22.15-bookworm-slim as backend-build

WORKDIR /app

# 复制后端 package.json
COPY backend/package*.json ./

# 配置 npm 使用国内镜像源并安装依赖
RUN npm config set registry https://registry.npmmirror.com/ && \
    npm config set fetch-retry-mintimeout 20000 && \
    npm config set fetch-retry-maxtimeout 120000 && \
    npm config set fetch-retries 5 && \
    npm config set fetch-timeout 300000 && \
    npm config set maxsockets 5 && \
    npm cache clean --force

# 安装依赖
RUN npm install --legacy-peer-deps --no-audit --no-fund || \
    (echo "First install attempt failed, retrying..." && \
     npm cache clean --force && \
     npm install --legacy-peer-deps --no-audit --no-fund)

# 复制后端源代码
COPY backend/ ./

# 构建后端
RUN npm run build

# 生产阶段 - 同时运行前端和后端
FROM harbor.lightark.cc/image-base/node:18.20.5-alpine

# 元数据
LABEL build_date="${BUILD_DATE}"

# 安装 nginx（用于前端服务）
RUN apk add --no-cache nginx bash curl

# 创建必要的目录
RUN mkdir -p /app/logs /app/backend/logs /run/nginx

# 复制前端构建产物
COPY --from=frontend-build /app/dist /usr/share/nginx/html

# 复制后端构建产物
COPY --from=backend-build /app/dist /app/backend
COPY --from=backend-build /app/node_modules /app/backend/node_modules
COPY --from=backend-build /app/package*.json /app/backend/

# 复制 nginx 配置
COPY nginx.conf /etc/nginx/nginx.conf

# 复制 entrypoint 脚本
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# 暴露端口（前端 nginx 和后端 express）
EXPOSE 80 4607

# 启动脚本
ENTRYPOINT ["/entrypoint.sh"]
