# Multi-stage Dockerfile for Next.js Web App in Bun Monorepo

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
COPY apps/web/ ./apps/web/
COPY apps/websocket/package.json ./apps/websocket/package.json

# Install dependencies (creates all root and package node_modules in place)
RUN bun install --frozen-lockfile

# Generate Prisma Client in database package
ENV DATABASE_URL="postgresql://postgres:postgres@localhost:5432/ludo?schema=public"
RUN cd packages/database && bun run prisma:generate

# Build shared packages and production Next.js bundle
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN cd packages/shared && bun run build
RUN cd packages/game-engine && bun run build
RUN cd packages/redis && bun run build
RUN cd apps/web && bun run build

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

# Start Next.js production server
CMD ["bun", "run", "start"]
