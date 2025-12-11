# 构建阶段
FROM node:22-alpine AS build
LABEL "language"="nodejs"
LABEL "framework"="vite"

WORKDIR /app

COPY package*.json ./
RUN npm install -g npm@latest && npm install

COPY . .
RUN npm run build

# 运行阶段 - 使用 Apache
FROM httpd:alpine

# 复制构建产物
COPY --from=build /app/dist /usr/local/apache2/htdocs/

# 配置 Apache
RUN echo 'ServerName localhost' >> /usr/local/apache2/conf/httpd.conf && \
    echo 'Listen 8080' > /usr/local/apache2/conf/extra/ports.conf && \
    sed -i 's/Listen 80/Listen 8080/g' /usr/local/apache2/conf/httpd.conf && \
    sed -i 's/#LoadModule rewrite_module/LoadModule rewrite_module/' /usr/local/apache2/conf/httpd.conf

# 添加 .htaccess 支持 SPA 路由
RUN echo '<Directory "/usr/local/apache2/htdocs"> \
    Options Indexes FollowSymLinks \
    AllowOverride All \
    Require all granted \
    RewriteEngine On \
    RewriteBase / \
    RewriteRule ^index\.html$ - [L] \
    RewriteCond %{REQUEST_FILENAME} !-f \
    RewriteCond %{REQUEST_FILENAME} !-d \
    RewriteRule . /index.html [L] \
</Directory>' >> /usr/local/apache2/conf/httpd.conf

EXPOSE 8080

CMD ["httpd-foreground"]
