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

# Install all workspace dependencies
RUN bun install --frozen-lockfile

# Generate Prisma Client in deps stage where packages/database/node_modules exists
ENV DATABASE_URL="postgresql://postgres:postgres@localhost:5432/ludo?schema=public"
RUN bun --cwd packages/database run prisma:generate

# 3. Builder stage
FROM base AS builder
WORKDIR /app
ENV PATH="/app/node_modules/.bin:/app/packages/database/node_modules/.bin:${PATH}"

# Copy source files first
COPY packages/ ./packages/
COPY apps/web/ ./apps/web/

# Copy dependencies and node_modules from deps stage (after source files to preserve node_modules)
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/database/node_modules ./packages/database/node_modules
COPY --from=deps /app/package.json ./package.json
COPY --from=deps /app/bun.lock ./bun.lock
COPY --from=deps /app/turbo.json ./turbo.json
COPY --from=deps /app/tsconfig.base.json ./tsconfig.base.json

# Build shared packages and production Next.js bundle
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN bun --cwd packages/shared run build
RUN bun --cwd packages/game-engine run build
RUN bun --cwd packages/redis run build
RUN bun --cwd apps/web run build

# 4. Production Runner stage
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV NEXT_TELEMETRY_DISABLED=1

# Copy workspace dependencies and built artifacts
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/web ./apps/web

WORKDIR /app/apps/web
EXPOSE 3000

# Start Next.js production server
CMD ["bun", "run", "start"]
