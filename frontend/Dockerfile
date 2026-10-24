# Multi-stage Dockerfile for EventEase Frontend (Vite + React + TypeScript + Tailwind CSS)

# Stage 1: Build static assets
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies based on package-lock
COPY package.json package-lock.json ./
RUN npm ci

# API URL passed at build time (defaults to active Render backend)
ARG VITE_API_BASE_URL=https://eventease-backend-qkbl.onrender.com
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

# Copy source code and build production bundle
COPY . .
RUN npm run build

# Stage 2: Production web server using lightweight Nginx
FROM nginx:alpine AS runner

# Replace default Nginx configuration with SPA-compatible routing
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy production bundle from builder
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://localhost/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
