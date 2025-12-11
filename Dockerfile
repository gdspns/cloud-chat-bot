FROM node:22-alpine AS builder
LABEL "language"="nodejs"
LABEL "framework"="vite"

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM zeabur/caddy-static
COPY --from=builder /app/dist /usr/share/caddy
COPY Caddyfile /etc/caddy/Caddyfile
