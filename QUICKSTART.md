# True Vector — Running the prototype

Status after Cards 0-5: you can sign in, create a role, watch the Role Risk Agent score it, sign off, and activate it. Audit trail is recorded for every step.

## Prerequisites

- Node 20+ and pnpm 9+
- Docker (for the local Postgres)
- A Clerk account (free tier — for auth)
- An Anthropic API key (for the Role Risk Agent)

## First-time setup

```bash
# 1. Install dependencies
pnpm install

# 2. Start Postgres locally
docker compose up -d

# 3. Set up environment
cp .env.example .env.local
# Then edit .env.local — see "Environment" below.

# 4. Apply database schema
pnpm db:push

# 5. Apply the audit-log immutability triggers
# (One-time — these enforce append-only at the DB level)
psql "$DATABASE_URL" -f src/db/migrations/0000_audit_immutability.sql

# 6. Run
pnpm dev
```

Open <http://localhost:3000>. Sign in. You'll land on the home dashboard with empty state — that's expected. Click "+ New role".

## Environment

`.env.local` needs:

- `DATABASE_URL` — defaults to the docker-compose Postgres; usually leave as-is.
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` — from your Clerk dashboard.
- `CLERK_WEBHOOK_SECRET` — from your Clerk dashboard. Needed when Clerk pings the platform about org / user changes.
- `ANTHROPIC_API_KEY` — your Anthropic API key. Without this, the Role Risk Agent can't run.
- `AUDIT_HMAC_SECRET` — any long random string. Used to sign the audit log chain. **Do not change after data is in the log** — verification will break.

## What works now

- **Auth**: sign-in flow via Clerk; sessions auto-provision a tenant + workforce person record on first request.
- **Home dashboard** (`/officer`): stat strip with role counts; recent roles; "New role" quick action.
- **Roles list** (`/officer/roles`): all roles for your tenant, sorted by most recent.
- **New role flow** (`/officer/roles/new`): title + description + assets, "Run Risk Assessment" calls the agent, persists the draft, redirects to the detail page.
- **Role detail** (`/officer/roles/[id]`): risk assessment, check set, PD insertions, state-machine actions (submit for sign-off / sign off with rationale / retire).
- **Audit log**: every state change writes an HMAC-chained event. DB triggers block UPDATE / DELETE on the audit log table.

## What's not built yet (Cards 6+)

- Candidate apply flow (Card 6) — the candidate-facing intake portal.
- Case state machine (Card 7) — the Orchestrator that ties evidence-gathering together.
- Evidence agents — ID, CR, IN (Card 8).
- Suitability + Decision agents (Card 9).
- Audit Bundle inspector (Card 10).
- Public Footprint Check (Card 8.6) — the differentiator feature; spec ready, build is next.

Following the build playbook in the project root.

## Useful commands

```bash
pnpm dev             # dev server with HMR
pnpm lint            # ESLint + tsc --noEmit
pnpm test            # Vitest unit tests
pnpm db:studio       # Drizzle Studio — visual DB inspection
pnpm db:push         # Sync schema to local DB (dev only)
pnpm db:generate     # Generate migration SQL (prod-shaped)
```

## When something goes wrong

- **"ANTHROPIC_API_KEY not configured"** when clicking Run Risk Assessment → set it in `.env.local` and restart `pnpm dev`.
- **Sign-in works but home page redirects to /** → you don't have a tenant yet. Create an organisation in the Clerk dashboard, or set up the Clerk webhook so we provision tenants automatically.
- **Audit log triggers fail to install** → the SQL migration runs idempotently; run it again. Confirm you're connected to the right DB via `psql "$DATABASE_URL" -c "\dt"`.
- **Drizzle schema push fails** → `docker compose down -v && docker compose up -d` will reset Postgres. You'll lose data but it's a prototype.
