# ============================================================
# EventEase Monolith Dockerfile
# Single container: Nginx (port 80) + Uvicorn (port 8000)
#   Nginx serves the React SPA at / and proxies /api/* + /health to Uvicorn.
#   supervisord keeps both processes alive under one PID 1.
# ============================================================

# ── Stage 1: Build the React / Vite frontend ──────────────────────────────
FROM node:20-alpine AS frontend-builder

WORKDIR /app/frontend

# Install dependencies
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

# In the monolith the frontend and backend share the same origin,
# so the API lives at a relative path — leave VITE_API_BASE_URL empty
# so backendApi.ts falls back to window.location.origin automatically.
ARG VITE_API_BASE_URL=""
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

ARG VITE_TICKETMASTER_API_KEY=""
ENV VITE_TICKETMASTER_API_KEY=$VITE_TICKETMASTER_API_KEY

COPY frontend/ .
RUN npm run build


# ── Stage 2: Final image — Nginx + Python + supervisord ───────────────────
FROM python:3.12-slim

# Install Nginx and supervisord (both tiny on slim)
RUN apt-get update && apt-get install -y --no-install-recommends \
        nginx \
        supervisor \
    && rm -rf /var/lib/apt/lists/*

# ── Backend ──────────────────────────────────────────────────────────────
WORKDIR /app/backend

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/alembic.ini .
COPY backend/alembic ./alembic
COPY backend/app ./app

# ── Frontend static assets ───────────────────────────────────────────────
COPY --from=frontend-builder /app/frontend/dist /usr/share/nginx/html

# ── Nginx config ─────────────────────────────────────────────────────────
COPY monolith/nginx.conf /etc/nginx/conf.d/default.conf
# Remove the default site so only our config is active
RUN rm -f /etc/nginx/sites-enabled/default

# ── supervisord config ───────────────────────────────────────────────────
COPY monolith/supervisord.conf /etc/supervisor/conf.d/eventease.conf

# Non-root user for the Python process (Nginx still needs root for port 80)
RUN useradd --create-home --uid 10001 eventease

# Render injects PORT but in the monolith Nginx always listens on 10000
# (Render's free plan expects port 10000 by default when using Docker).
EXPOSE 10000

HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
    CMD python3 -c "import urllib.request; urllib.request.urlopen('http://localhost:10000/health')"

CMD ["/usr/bin/supervisord", "-n", "-c", "/etc/supervisor/supervisord.conf"]

