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

COPY --from=build /src/dist /usr/share/caddy
