FROM node:22-alpine
LABEL "language"="nodejs"
LABEL "framework"="vite"

WORKDIR /app

COPY package*.json ./
RUN npm install -g npm@latest && npm install

COPY . .
RUN npm run build

# 安装 serve 来提供静态文件服务
RUN npm install -g serve

EXPOSE 8080

# 使用 serve 提供静态文件
CMD ["serve", "-s", "dist", "-l", "8080"]
