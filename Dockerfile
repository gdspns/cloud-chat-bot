FROM node:22-alpine AS builder
LABEL "language"="nodejs"

WORKDIR /src

# 复制项目文件
COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

# 使用 Caddy 提供静态文件服务
FROM zeabur/caddy-static
LABEL "framework"="static"

# 复制构建产物到 Caddy 目录
COPY --from=builder /src/dist /usr/share/caddy

# 配置 SPA 路由
RUN echo ':8080 {' > /etc/caddy/Caddyfile && \
    echo '    root * /usr/share/caddy' >> /etc/caddy/Caddyfile && \
    echo '    encode gzip' >> /etc/caddy/Caddyfile && \
    echo '    try_files {path} /index.html' >> /etc/caddy/Caddyfile && \
    echo '    file_server' >> /etc/caddy/Caddyfile && \
    echo '}' >> /etc/caddy/Caddyfile

EXPOSE 8080
