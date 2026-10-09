# syntax=docker/dockerfile:1
# Imagen del dashboard (Next.js 16 + better-sqlite3 + mssql). Una sola imagen
# para dos servicios del compose: `app` (next start) y `tareas` (supercronic con
# las tareas nocturnas, que son scripts tsx sobre el mismo código).
# Guía: docs/despliegue-linux.md

# --- Etapa de build ---
FROM node:24-alpine AS build
# Por si better-sqlite3 no encuentra binario precompilado para musl: entonces lo
# compila node-gyp, que necesita estas herramientas.
RUN apk add --no-cache python3 make g++
WORKDIR /repo

# Manifiestos primero para aprovechar la caché de capas.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# `next build` abre la SQLite de SQLITE_PATH y le aplica las migraciones: aquí
# es una base vacía dentro de esta etapa, que se descarta. Solo se prerenderizan
# las páginas de error, así que no se hornea ningún dato en la imagen.
RUN npm run build && rm -rf .next/cache data

# --- Dependencias de producción ---
FROM node:24-alpine AS deps
RUN apk add --no-cache python3 make g++
WORKDIR /repo
COPY package.json package-lock.json ./
# tsx está en `dependencies` a propósito: lo necesitan las tareas nocturnas.
RUN npm ci --omit=dev

# --- Imagen final ---
FROM node:24-alpine AS runtime
# Para limpiar SOLO las imágenes viejas del dashboard (docs/despliegue-linux.md):
# un `docker image prune` sin filtro borraría también las de vuelta atrás de tickets.
LABEL org.opencontainers.image.title="dashboard-tmsystem"

# tzdata: la zona la fija TZ (regla 14 de CLAUDE.md: hora de España). Node se
# apaña con su ICU, pero supercronic (Go) necesita la base de zonas del sistema
# para que las 02:00 de la crontab sean las de Madrid.
# supercronic: cron para contenedores (logs a stdout, respeta TZ). Versión fija y
# comprobada con el SHA1 que publica en https://github.com/aptible/supercronic/releases
ARG SUPERCRONIC_VERSION=0.2.49
ARG SUPERCRONIC_SHA1SUM=e63c11a9726b775a6a11801e81af4f3fb926aa68
RUN apk add --no-cache tzdata \
 && wget -q -O /usr/local/bin/supercronic \
    "https://github.com/aptible/supercronic/releases/download/v${SUPERCRONIC_VERSION}/supercronic-linux-amd64" \
 && echo "${SUPERCRONIC_SHA1SUM}  /usr/local/bin/supercronic" | sha1sum -c - \
 && chmod +x /usr/local/bin/supercronic

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    TZ=Europe/Madrid
WORKDIR /app

COPY --from=deps /repo/node_modules ./node_modules
COPY --from=build /repo/.next ./.next
COPY package.json package-lock.json next.config.ts tsconfig.json ./
COPY public ./public
COPY drizzle ./drizzle
# Los scripts (tsx) importan el código de src/, así que va entero.
COPY src ./src
COPY scripts ./scripts
COPY docker/crontab ./docker/crontab

# El resto de /app es de root. El proceso solo escribe en la SQLite y los
# backups (montados desde el host) y en la caché de Next. El usuario `node` de la
# imagen tiene el uid 1000, el mismo que `tmsystem` en el servidor: las carpetas
# montadas no necesitan cambiar de dueño.
RUN mkdir -p data backups .next/cache && chown node:node data backups .next/cache
USER node

EXPOSE 3000
CMD ["node", "node_modules/next/dist/bin/next", "start", "-H", "0.0.0.0", "-p", "3000"]
