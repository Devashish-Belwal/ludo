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

# Install dependencies (installs root and nested workspace node_modules)
RUN bun install --frozen-lockfile

# 3. Builder stage (inherits all installed dependencies & CLI tools)
FROM deps AS builder
WORKDIR /app

# Copy source packages needed by websocket service
COPY packages/ ./packages/
COPY apps/websocket/ ./apps/websocket/

# Build TypeScript packages
ENV NODE_ENV=production
RUN cd packages/shared && bun run build
RUN cd packages/game-engine && bun run build
RUN cd packages/redis && bun run build

# 4. Production Runner stage
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV WS_PORT=3001

# Copy all built artifacts and workspace dependencies
COPY --from=builder /app ./

EXPOSE 3001

# Start WebSocket server
CMD ["bun", "run", "apps/websocket/src/server.ts"]
