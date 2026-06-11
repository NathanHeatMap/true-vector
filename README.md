# Vetting Platform — Prototype

Agentic workforce-vetting platform built to meet AS 4811:2022 as a defence-environment baseline. See `design-docs/` for the architecture; see `AS4811_Build_Playbook_v0.1.md` (project root) for the build sequence.

## Quickstart

```bash
# 1. Install
pnpm install

# 2. Local Postgres
docker compose up -d

# 3. Environment
cp .env.example .env.local
# fill in CLERK keys, ANTHROPIC_API_KEY

# 4. Schema
pnpm db:push

# 5. Dev server
pnpm dev
```

Visit http://localhost:3000.

## Commands

| Command | What |
|---|---|
| `pnpm dev` | Next.js dev server with HMR |
| `pnpm build` | Production build |
| `pnpm start` | Run production build |
| `pnpm lint` | ESLint + TypeScript |
| `pnpm test` | Vitest unit tests |
| `pnpm test:e2e` | Playwright end-to-end |
| `pnpm db:push` | Apply schema to local DB (dev only) |
| `pnpm db:generate` | Generate migration SQL |
| `pnpm db:migrate` | Apply migrations (prod-shaped) |
| `pnpm db:studio` | Drizzle Studio at localhost:4983 |
| `pnpm seed` | Populate demo data |

## Repository layout

```
src/
├── app/                    # Next.js routes
│   ├── (officer)/          # Security Officer dashboard
│   ├── (candidate)/        # Candidate portal
│   └── api/                # Streaming + webhook endpoints
├── agents/                 # One file per agent (RR, CP, ID, CR, IN, SU, DC, AU)
├── db/
│   ├── schema.ts           # Drizzle schema
│   ├── index.ts            # DB client
│   └── migrations/
├── lib/
│   ├── audit.ts            # The audit log primitive — read this first
│   ├── tenant.ts           # Tenant + IAM helpers
│   ├── orchestrator.ts     # Case state machine
│   ├── schemas.ts          # Zod schemas (single source of truth)
│   └── ...
├── components/
└── seed/
```

## Working with Claude Code

Open this repo in Claude Code. The agent reads `CLAUDE.md` at the start of every session. Each session works on one build card from `AS4811_Build_Playbook_v0.1.md`. See the "Session protocol" section in `CLAUDE.md`.

## Conventions

- TypeScript strict.
- Server Components by default; Server Actions for mutations.
- Every state-changing operation calls `recordEvent()`.
- Sensitive fields carry sensitivity tags; access goes through the field-filtering helper.
- Evidence, consent records, and audit events are append-only.

## What's deliberately not here yet

- Real external integrations (identity verification, police checks, AGSVA). All mocked.
- Lifecycle re-screening loop.
- Insider Threat Program fusion service.
- Multi-jurisdiction. Prototype is NSW only.

These are documented in `design-docs/` and slotted as increments B/C after the prototype lands.

## Licence

Proprietary. Do not distribute.
