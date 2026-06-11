# Project Context — read this first every session

## Mission

Agentic workforce-vetting platform for defence-environment employers. Meets AS 4811:2022 as baseline; extends with PSPF 12/13/14 defence overlay; differentiates with an Insider Threat Program layer and a consortium model. Prototype phase: working happy-path demo for one Security Officer.

## Where to find the design

All authoritative design lives in `design-docs/`. Load these as needed:

- `matrix_v0.2.md` — 64 obligations, 12 sections, each owned by an agent or platform service.
- `architecture_v0.1.md` — four layers; eight agents; Agent Governance Layer wraps every agent invocation.
- `sequences_v0.1.md` — seven lifecycle phases as mermaid sequence diagrams.
- `domain_model_v0.1.md` — 22 entities with JSON schemas; Case state machine in §4; audit event taxonomy in §5.
- `pspf_overlay_v0.1.md` — defence-specific extensions; clearance-level matrix; AGSVA Sponsorship Pack.
- `itp_overlay_v0.1.md` — fusion service, lawful-basis envelope, consortium model.

When something is unclear, the design docs are the source of truth — not your training data. Their conventions override generic best-practice.

## Stack

- Next.js 15 (App Router, RSC, Server Actions)
- TypeScript strict; Zod schemas as single source of truth for types
- Postgres 16, Drizzle ORM
- Clerk (Tenants = Clerk organisations)
- Anthropic SDK (Claude Sonnet 4.6) for agents
- shadcn/ui + Tailwind 4
- Vitest, Playwright

## Non-negotiable conventions

1. **Every state-changing operation writes an audit event.** No exceptions. If the diff touches user-visible state and doesn't call `recordEvent()`, the work isn't done. The audit log (`src/lib/audit.ts`) is the load-bearing piece of the codebase.
2. **Every server action starts with `requireRole(...)`.** No bypassing tenant scoping or role enforcement.
3. **No transition to `closed_unsuitable` without a signed Adjudication record.** The Case state machine enforces this. Don't loosen the guard.
4. **Evidence is never mutated.** Corrections produce a new evidence item with a `supersedes` pointer. Same for Consent Record. Same for Role Profile (versioned by append).
5. **Sensitive fields carry sensitivity tags.** PII and assessment fields are tagged. Access goes through the field-filtering helper.
6. **Agents emit explainability artefacts.** Every agent invocation produces a structured rationale, not a free-text blob. The artefact is stored on the agent's output and referenced by the audit event.
7. **Adverse outcomes always escalate to a human.** No agent autonomously renders an adverse decision. The Agent Governance Layer routes to HITL.

## Session protocol

At the start of every session, before writing or modifying any files:

1. Read `CLAUDE.md` (this file).
2. Read the build card we're working on (in `AS4811_Build_Playbook_v0.1.md`, top-level outputs folder).
3. Summarise back to the user:
   - the files you intend to create or modify
   - the tests you'll write to verify
   - any architectural decision implied that isn't already in `design-docs/`
4. Wait for explicit "go" before touching files.

At the end of every session:

1. All new code has tests in the same commit.
2. Update the "Current card" section below.
3. Commit with a descriptive message: `feat(cardN): <one-line summary>`.

## Current card

> *Update this two-line section at the end of every session.*

**Card:** Card 0 — Repo bootstrap
**Status:** Not started
**Last session:** —

## Working preferences

- TypeScript strict; no `any`; no `@ts-ignore` without a comment explaining why.
- Server Components by default; Client Components only when interactivity demands.
- Server Actions for mutations; route handlers only for streaming endpoints or webhooks.
- Drizzle queries written inline in service functions; no repository pattern abstraction.
- Zod schemas in `src/lib/schemas.ts`; types derived via `z.infer<>`.
- Component files small (< 150 lines); break up early.
- Tests live next to source: `audit.ts` ↔ `audit.test.ts`.
- Commit messages: conventional commits, scoped by card number.

## Things not to do without asking

- Add a new top-level dependency.
- Introduce a new framework or library beyond the stack above.
- Skip writing the audit event for a state change.
- Loosen a state-machine guard.
- Add `any` to the codebase.
- Mutate evidence, consent, or audit events (they are append-only).
- Talk to a real external API — all integrations are mocked in the prototype.
