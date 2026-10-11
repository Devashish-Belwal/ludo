# Multiplayer Ludo Application

Real-time multiplayer web application for Ludo built with Next.js App Router, Node.js WebSocket service, PostgreSQL, and Upstash Redis.

## Architecture

- **`apps/web`**: Next.js App Router frontend, Google OAuth authentication, user profiles, friends system, game UI.
- **`apps/websocket`**: Dedicated Node.js WebSocket service (`ws`) managing real-time connections, presence, matchmaking, and game turns *(Milestone 6)*.
- **`packages/database`**: Prisma ORM schema & client for durable application data *(Milestone 2)*.
- **`packages/redis`**: Upstash Redis client, scripts, and key schemas *(Milestone 5)*.
- **`packages/shared`**: Shared TypeScript types, Zod contracts, and schemas.
- **`packages/game-engine`**: Pure TypeScript authoritative Ludo game rules engine *(Milestone 7)*.

---

## Prerequisites

- [Bun](https://bun.sh/) (v1.3+ recommended)
- [Node.js](https://nodejs.org/) (v20+ or v24+ for the WebSocket service)

---

## Getting Started

### 1. Install Dependencies

```bash
bun install
```

### 2. Environment Configuration

Copy `.env.example` to `.env` (or configure service-specific environment files):

```bash
cp .env.example .env
```

### 3. Development Mode

Run all workspaces concurrently:

```bash
bun run dev
```

Or run individual apps:

```bash
bun run --filter web dev
```

### 4. Quality Checks

Run linting across workspaces:

```bash
bun run lint
```

Run TypeScript strict checks across workspaces:

```bash
bun run typecheck
```

Build all packages and applications:

```bash
bun run build
```

---

## Milestones

- [x] **Milestone 1 — Project Foundation**
- [ ] **Milestone 2 — Database Design**
- [ ] **Milestone 3 — Authentication and Profiles**
- [ ] **Milestone 4 — Friends System**
- [ ] **Milestone 5 — Redis Infrastructure and Presence**
- [ ] **Milestone 6 — WebSocket Infrastructure**
- [ ] **Milestone 7 — Game Engine**
- [ ] **Milestone 8 — Private Games and Invitations**
- [ ] **Milestone 9 — Public Matchmaking**
- [ ] **Milestone 10 — Game UI**
- [ ] **Milestone 11 — Reliability and Recovery**
- [ ] **Milestone 12 — Docker and Production Deployment**
