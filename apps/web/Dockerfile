# Multi-stage Dockerfile for Next.js Web App in Bun Monorepo

# 1. Base stage
FROM oven/bun:1.3.13 AS base
WORKDIR /app

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

# 3. Builder stage
FROM base AS builder
WORKDIR /app

# Copy dependencies and node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./package.json
COPY --from=deps /app/bun.lock ./bun.lock
COPY --from=deps /app/turbo.json ./turbo.json
COPY --from=deps /app/tsconfig.base.json ./tsconfig.base.json

# Copy all source files
COPY packages/ ./packages/
COPY apps/web/ ./apps/web/

# Generate Prisma Client for database queries
RUN bun --cwd packages/database run prisma:generate

# Build shared packages and production Next.js bundle
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN bun run build

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

EXPOSE 3000

# Start Next.js production server
CMD ["bun", "--cwd", "apps/web", "run", "start"]
