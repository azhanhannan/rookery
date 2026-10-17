# syntax=docker/dockerfile:1
# Two images from one build (see docs/DEPLOY.md):
#   --target api  Fastify API (tsx), runs `prisma migrate deploy` on start
#   --target web  Caddy serving dist/ and proxying /api to the api container
ARG NODE_IMAGE=node:24.11-bookworm-slim

FROM ${NODE_IMAGE} AS base
# Prisma needs OpenSSL to pick its engine build.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# ---- build: full install, then the browser app ----
FROM base AS build
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci
COPY . .
# prebuild copies Stockfish and downloads Maia. fetch-maia never fails (it only warns), so check the
# model really made it into dist/: an image without it would ship with the Maia bots silently gone.
RUN npm run build \
 && test -s dist/maia/maia3_simplified.onnx \
 && test -s dist/stockfish/stockfish-19-lite-single.wasm

# ---- api: production dependencies only ----
FROM base AS api
ENV NODE_ENV=production
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
# postinstall runs `prisma generate` into server/generated.
RUN npm ci --omit=dev && npm cache clean --force
COPY tsconfig.json tsconfig.server.json ./
COPY server/src ./server/src
# The server imports shared game/insights code from src/ and rates puzzles from public/puzzles.
COPY src ./src
COPY public/puzzles ./public/puzzles
USER node
EXPOSE 5181
CMD ["node", "--import", "tsx", "server/src/main.ts"]

# ---- web: Caddy + the built app ----
FROM caddy:2.10-alpine AS web
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv
