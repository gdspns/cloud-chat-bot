:8080 {
    root * /usr/share/caddy
    encode gzip
    
    # 支持 SPA 路由
    try_files {path} /index.html
    
    # 静态文件服务
    file_server
    
    # 设置缓存头
    header /assets/* Cache-Control "public, max-age=31536000, immutable"
    header / Cache-Control "no-cache, no-store, must-revalidate"
}
