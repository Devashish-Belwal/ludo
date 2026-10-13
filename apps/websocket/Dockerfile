# Single-stage Dockerfile for Dedicated WebSocket Service in Bun Monorepo (Prevents redundant layer duplication on small disks)

FROM oven/bun:1.3.13 AS base
WORKDIR /app
ENV PATH="/app/node_modules/.bin:${PATH}"

# Copy repository manifests and shared packages before install
COPY package.json bun.lock turbo.json tsconfig.base.json ./
COPY packages/ ./packages/
COPY apps/websocket/package.json ./apps/websocket/package.json
COPY apps/web/package.json ./apps/web/package.json

# Install dependencies in place
RUN bun install --frozen-lockfile && rm -rf ~/.bun/install/cache /root/.bun/install/cache

# Copy apps/websocket source files after dependencies are installed
COPY apps/websocket/ ./apps/websocket/

# Build shared packages
ENV NODE_ENV=production
ENV WS_PORT=3001
RUN cd packages/shared && bun run build
RUN cd packages/game-engine && bun run build
RUN cd packages/redis && bun run build

EXPOSE 3001

# Start WebSocket server
CMD ["bun", "run", "apps/websocket/src/server.ts"]
