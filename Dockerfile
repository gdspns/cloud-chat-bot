# 构建阶段
FROM node:-slim AS build
LABEL "language"="nodejs"
LABEL "framework"="vite"

WORKDIR /src

# 复制 package 文件
COPY package*.json ./

# 安装最新的 npm 并安装依赖
RUN npm install -g npm@latest && npm install

# 复制所有源代码
COPY . .

# 构建项目
RUN npm run build

# 运行阶段
FROM zeabur/caddy-static

# 从构建阶段复制构建产物到 Caddy 目录
COPY --from=build /src/dist /usr/share/caddy

# 不需要额外的 Caddyfile，zeabur/caddy-static 已经内置了正确的配置
