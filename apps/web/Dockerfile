# Multi-stage Dockerfile for Next.js Web App in Bun Monorepo

# 1. Base stage
FROM oven/bun:1.3.13 AS base
WORKDIR /app
ENV PATH="/app/node_modules/.bin:${PATH}"

# Copy official Node.js 20 binary for Next.js Turbopack compilation & runtime compatibility
COPY --from=node:20-slim /usr/local/bin/node /usr/local/bin/node

# 2. Builder stage
FROM base AS builder
WORKDIR /app

# Copy repository manifests and shared packages before install
COPY package.json bun.lock turbo.json tsconfig.base.json ./
COPY packages/ ./packages/
COPY apps/web/package.json ./apps/web/package.json
COPY apps/websocket/package.json ./apps/websocket/package.json

# Install dependencies (fast and clean in place)
RUN bun install --frozen-lockfile

# Copy apps/web source files after dependencies are installed
COPY apps/web/ ./apps/web/

# Generate Prisma Client in database package
ENV DATABASE_URL="postgresql://postgres:postgres@localhost:5432/ludo?schema=public"
RUN cd packages/database && bun run prisma:generate

# Build shared packages and production Next.js bundle
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV AUTH_SECRET="build-dummy-auth-secret-for-compilation"
ENV WS_TOKEN_SECRET="build-dummy-ws-token-secret-for-compilation"
ENV NEXT_PUBLIC_APP_URL="http://localhost:3000"
ENV NEXT_PUBLIC_WS_URL="ws://localhost:3001"

RUN cd packages/shared && bun run build
RUN cd packages/game-engine && bun run build
RUN cd packages/redis && bun run build
RUN cd apps/web && node /app/node_modules/.bin/next build

# 3. Production Runner stage
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV NEXT_TELEMETRY_DISABLED=1

# Copy built workspace and node_modules
COPY --from=builder /app ./

WORKDIR /app/apps/web
EXPOSE 3000

# Start Next.js production server with Node.js
CMD ["node", "/app/node_modules/.bin/next", "start"]
