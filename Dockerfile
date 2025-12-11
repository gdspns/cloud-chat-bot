FROM zeabur/caddy-static
LABEL "language"="static"

COPY . /usr/share/caddy

# Caddyfile for SPA routing
RUN echo ':8080 {' > /etc/caddy/Caddyfile && \
    echo '    root * /usr/share/caddy' >> /etc/caddy/Caddyfile && \
    echo '    encode gzip' >> /etc/caddy/Caddyfile && \
    echo '    file_server' >> /etc/caddy/Caddyfile && \
    echo '    try_files {path} {path}/ /index.html' >> /etc/caddy/Caddyfile && \
    echo '    header {' >> /etc/caddy/Caddyfile && \
    echo '        Cache-Control "public, max-age=31536000, immutable"' >> /etc/caddy/Caddyfile && \
    echo '    }' >> /etc/caddy/Caddyfile && \
    echo '    @static path *.js *.css *.png *.jpg *.jpeg *.gif *.ico *.svg *.woff *.woff2' >> /etc/caddy/Caddyfile && \
    echo '    header @static Cache-Control "public, max-age=31536000, immutable"' >> /etc/caddy/Caddyfile && \
    echo '}' >> /etc/caddy/Caddyfile

EXPOSE 8080
