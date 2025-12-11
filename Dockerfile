# 构建阶段
FROM node:-alpine AS build
LABEL "language"="nodejs"
LABEL "framework"="vite"

WORKDIR /app

COPY package*.json ./
RUN npm install -g npm@latest && npm install

COPY . .
RUN npm run build

# 运行阶段 - 使用 Nginx
FROM nginx:alpine

# 复制构建产物
COPY --from=build /app/dist /usr/share/nginx/html

# 创建 Nginx 配置
RUN echo 'server { \
    listen 8080; \
    server_name _; \
    root /usr/share/nginx/html; \
    index index.html; \
    location / { \
        try_files $uri $uri/ /index.html; \
    } \
    gzip on; \
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript; \
}' > /etc/nginx/conf.d/default.conf

location / {
    try_files $uri $uri/ /index.html;
}

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
