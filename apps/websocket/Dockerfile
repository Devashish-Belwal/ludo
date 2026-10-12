# Multi-stage Dockerfile for Dedicated WebSocket Service in Bun Monorepo

# 1. Base stage
FROM oven/bun:1.3.13 AS base
WORKDIR /app
ENV PATH="/app/node_modules/.bin:${PATH}"

# 2. Builder stage
FROM base AS builder
WORKDIR /app

# Copy repository manifests and source code before install so node_modules are created in place
COPY package.json bun.lock turbo.json tsconfig.base.json ./
COPY packages/ ./packages/
COPY apps/websocket/ ./apps/websocket/
COPY apps/web/package.json ./apps/web/package.json

# Install dependencies (creates all root and package node_modules in place)
RUN bun install --frozen-lockfile

# Build shared packages
ENV NODE_ENV=production
RUN cd packages/shared && bun run build
RUN cd packages/game-engine && bun run build
RUN cd packages/redis && bun run build

# 3. Production Runner stage
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV WS_PORT=3001

# Copy all built artifacts and dependencies
COPY --from=builder /app ./

EXPOSE 3001

# Start WebSocket server
CMD ["bun", "run", "apps/websocket/src/server.ts"]
