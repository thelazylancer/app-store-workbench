# syntax=docker/dockerfile:1

FROM node:24-alpine AS build
WORKDIR /app
RUN apk add --no-cache git
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# ipatool v2.8.1 with the local --auth-code patch (deploy/ipatool-authcode.patch),
# built with CGO on linux/amd64; keep a glibc base image.
# Rebuild (inside a linux/amd64 golang:1.26-bookworm container):
#   apply deploy/ipatool-authcode.patch to the v2.8.1 source, then
#   CGO_ENABLED=1 go build -trimpath -ldflags "-s -w" \
#     -o ipatool-authcode-linux-amd64 .
FROM node:24-bookworm-slim AS app
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl \
  && rm -rf /var/lib/apt/lists/*
COPY deploy/apple-root-ca.pem /usr/local/share/apple-root-ca.pem
RUN cat /etc/ssl/certs/ca-certificates.crt /usr/local/share/apple-root-ca.pem > /usr/local/share/apple-ca-bundle.pem
COPY deploy/vendor/ipatool-authcode-linux-amd64 /usr/local/bin/ipatool-bin
RUN chmod +x /usr/local/bin/ipatool-bin
COPY deploy/ipatool-wrapper.sh /usr/local/bin/ipatool
RUN chmod +x /usr/local/bin/ipatool
COPY package.json package-lock.json ./
RUN npm ci --include=dev
COPY tsconfig.json ./
COPY server ./server
COPY shared ./shared
ENV IPATOOL_BIN=/usr/local/bin/ipatool
ENV DOWNLOADS_DIR=/app/downloads
ENV HOME=/home/app
ENV SSL_CERT_FILE=/usr/local/share/apple-ca-bundle.pem
RUN mkdir -p /app/downloads /home/app \
  && chown -R 1000:1000 /app /home/app
USER 1000:1000
EXPOSE 3001
CMD ["./node_modules/.bin/tsx", "server/index.ts"]

FROM nginx:alpine AS web
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
