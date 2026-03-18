# Build stage
FROM node:22-alpine AS builder

WORKDIR /build

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Build args become VITE_ env vars at build time
ARG VITE_LOGTO_ENDPOINT
ARG VITE_LOGTO_APP_ID
ARG VITE_DEFAULT_WS
ARG VITE_PORT=3001

RUN npm run build

# Runtime stage — serve static files with nginx
FROM nginx:alpine

COPY --from=builder /build/dist /usr/share/nginx/html

# SPA routing: serve index.html for all paths
RUN printf 'server {\n\
    listen 3001;\n\
    root /usr/share/nginx/html;\n\
    index index.html;\n\
    location / {\n\
        try_files $uri $uri/ /index.html;\n\
    }\n\
}\n' > /etc/nginx/conf.d/default.conf

EXPOSE 3001

CMD ["nginx", "-g", "daemon off;"]
