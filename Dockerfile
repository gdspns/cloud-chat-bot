FROM node:22-slim AS build
LABEL "language"="nodejs"
LABEL "framework"="vite"

WORKDIR /src

RUN npm install -g npm@latest

COPY package.json package-lock.json ./
RUN npm install

COPY . .
RUN npm run build

FROM zeabur/caddy-static

# 创建自定义 Caddyfile 以支持 SPA 路由
RUN echo ':8080 {\n\
    root * /usr/share/caddy\n\
    encode gzip\n\
    try_files {path} /index.html\n\
    file_server\n\
}' > /etc/caddy/Caddyfile

COPY --from=build /src/dist /usr/share/caddy
