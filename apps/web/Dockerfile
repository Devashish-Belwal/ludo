# Multi-stage Dockerfile for Next.js Web App in Bun Monorepo

# 1. Base stage
FROM oven/bun:1.3.13 AS base
WORKDIR /app
ENV PATH="/app/node_modules/.bin:${PATH}"

# 2. Dependencies stage
FROM base AS deps
WORKDIR /app

# Copy root manifest and lockfile
COPY package.json bun.lock turbo.json tsconfig.base.json ./

# Copy all package manifests for accurate workspace resolution
COPY packages/shared/package.json ./packages/shared/
COPY packages/database/package.json ./packages/database/
COPY packages/database/prisma ./packages/database/prisma/
COPY packages/game-engine/package.json ./packages/game-engine/
COPY packages/redis/package.json ./packages/redis/
COPY apps/web/package.json ./apps/web/
COPY apps/websocket/package.json ./apps/websocket/

# Install all workspace dependencies (root and nested package node_modules)
RUN bun install --frozen-lockfile

# Generate Prisma Client in deps stage where packages/database/node_modules exists
ENV DATABASE_URL="postgresql://postgres:postgres@localhost:5432/ludo?schema=public"
RUN cd packages/database && bun run prisma:generate

# 3. Builder stage (inherits all installed dependencies & CLI tools)
FROM deps AS builder
WORKDIR /app

# Copy source files
COPY packages/ ./packages/
COPY apps/web/ ./apps/web/

# Build shared packages and production Next.js bundle
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN cd packages/shared && bun run build
RUN cd packages/game-engine && bun run build
RUN cd packages/redis && bun run build
RUN cd apps/web && bun run build

# 4. Production Runner stage
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

# Start Next.js production server
CMD ["bun", "run", "start"]
