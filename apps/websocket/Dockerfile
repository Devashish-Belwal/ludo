# Multi-stage Dockerfile for Dedicated WebSocket Service in Bun Monorepo

# 1. Base stage
FROM oven/bun:1.3.13 AS base
WORKDIR /app
ENV PATH="/app/node_modules/.bin:${PATH}"

# 2. Dependencies stage
FROM base AS deps
WORKDIR /app

# Copy root manifest and lockfile
COPY package.json bun.lock turbo.json tsconfig.base.json ./

# Copy package manifests for workspace resolution
COPY packages/shared/package.json ./packages/shared/
COPY packages/database/package.json ./packages/database/
COPY packages/game-engine/package.json ./packages/game-engine/
COPY packages/redis/package.json ./packages/redis/
COPY apps/web/package.json ./apps/web/
COPY apps/websocket/package.json ./apps/websocket/

# Install dependencies
RUN bun install --frozen-lockfile

# 3. Builder stage
FROM base AS builder
WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./package.json
COPY --from=deps /app/bun.lock ./bun.lock
COPY --from=deps /app/turbo.json ./turbo.json
COPY --from=deps /app/tsconfig.base.json ./tsconfig.base.json

# Copy source packages needed by websocket service
COPY packages/ ./packages/
COPY apps/websocket/ ./apps/websocket/

# Build TypeScript packages and websocket service
ENV NODE_ENV=production
RUN bun --cwd packages/shared run build
RUN bun --cwd packages/game-engine run build
RUN bun --cwd packages/redis run build
RUN bun --cwd apps/websocket run build

# 4. Production Runner stage
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV WS_PORT=3001

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/websocket ./apps/websocket

EXPOSE 3001

# Start WebSocket server
CMD ["bun", "run", "apps/websocket/src/server.ts"]
