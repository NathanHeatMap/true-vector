/**
 * Unit tests for the audit log primitive.
 *
 * These tests require a Postgres database with the schema migrated and the
 * append-only trigger installed. Run via:
 *
 *   docker compose up -d
 *   pnpm db:push
 *   psql $DATABASE_URL -f src/db/migrations/0000_audit_immutability.sql
 *   pnpm test src/lib/audit.test.ts
 *
 * The harness creates a throw-away tenant per test and tears it down after.
 */

import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";

import { db } from "@/db";
import { auditEvents, tenants } from "@/db/schema";
import {
  GENESIS_PREV_HASH,
  recordEvent,
  verifyChain,
  type RecordEventInput,
} from "@/lib/audit";

let tenantId: string;

beforeAll(() => {
  if (!process.env.AUDIT_HMAC_SECRET) {
    process.env.AUDIT_HMAC_SECRET = "test-secret-do-not-use-in-prod";
  }
});

beforeEach(async () => {
  tenantId = `t_${ulid()}`;
  await db.insert(tenants).values({
    tenantId,
    clerkOrgId: `org_${ulid()}`,
    name: `Test tenant ${tenantId}`,
  });
});

afterEach(async () => {
  // Tenant has ON DELETE CASCADE for most tables, but audit_events is RESTRICT
  // (events are append-only — we don't cascade-delete them). The append-only
  // trigger means we cannot directly delete events; for test isolation we
  // disable the trigger session-locally, clean up, then re-enable.
  await db.execute(sql`alter table audit_events disable trigger user`);
  await db.execute(sql`delete from audit_events where tenant_id = ${tenantId}`);
  await db.execute(sql`alter table audit_events enable trigger user`);
  await db.execute(sql`delete from tenants where tenant_id = ${tenantId}`);
});

function input(overrides: Partial<RecordEventInput> = {}): RecordEventInput {
  return {
    type: "role.risk.assessed",
    tenantId,
    actor: { kind: "agent", agentCode: "RR", agentVersion: "0.1.0" },
    subject: { entityType: "role_profile", entityId: `rp_${ulid()}` },
    ...overrides,
  };
}

describe("recordEvent", () => {
  it("inserts a first event with prev_hash = GENESIS", async () => {
    const event = await recordEvent(input());
    expect(event.prevHash).toBe(GENESIS_PREV_HASH);
    expect(event.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(event.eventId).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/); // ULID
  });

  it("chains subsequent events to the previous hash", async () => {
    const first = await recordEvent(input());
    const second = await recordEvent(input());
    expect(second.prevHash).toBe(first.hash);
    expect(second.hash).not.toBe(first.hash);
  });

  it("rejects unknown event types via Zod", async () => {
    await expect(
      recordEvent({ ...input(), type: "not.a.real.type" as never }),
    ).rejects.toThrow();
  });

  it("isolates chains per tenant", async () => {
    const otherTenantId = `t_${ulid()}`;
    await db.insert(tenants).values({
      tenantId: otherTenantId,
      clerkOrgId: `org_${ulid()}`,
      name: "Other tenant",
    });

    const a1 = await recordEvent(input());
    const b1 = await recordEvent(input({ tenantId: otherTenantId }));

    expect(a1.prevHash).toBe(GENESIS_PREV_HASH);
    expect(b1.prevHash).toBe(GENESIS_PREV_HASH);
    expect(a1.hash).not.toBe(b1.hash);

    // Cleanup
    await db.execute(sql`alter table audit_events disable trigger user`);
    await db.execute(sql`delete from audit_events where tenant_id = ${otherTenantId}`);
    await db.execute(sql`alter table audit_events enable trigger user`);
    await db.execute(sql`delete from tenants where tenant_id = ${otherTenantId}`);
  });
});

describe("verifyChain", () => {
  it("verifies an empty chain as valid", async () => {
    const result = await verifyChain(tenantId);
    expect(result.valid).toBe(true);
    expect(result.events).toBe(0);
  });

  it("verifies a single event as valid", async () => {
    await recordEvent(input());
    const result = await verifyChain(tenantId);
    expect(result.valid).toBe(true);
    expect(result.events).toBe(1);
  });

  it("verifies a multi-event chain as valid", async () => {
    for (let i = 0; i < 10; i++) {
      await recordEvent(input());
    }
    const result = await verifyChain(tenantId);
    expect(result.valid).toBe(true);
    expect(result.events).toBe(10);
  });

  it("detects tampering — modified payload", async () => {
    await recordEvent(input());
    const e2 = await recordEvent(input());

    // Tamper: change the `after` payload, leave hash untouched. Disable trigger
    // to perform the tamper; re-enable for the rest of the test.
    await db.execute(sql`alter table audit_events disable trigger user`);
    await db.execute(
      sql`update audit_events set after = '"tampered"'::jsonb where event_id = ${e2.eventId}`,
    );
    await db.execute(sql`alter table audit_events enable trigger user`);

    const result = await verifyChain(tenantId);
    expect(result.valid).toBe(false);
    expect(result.firstBrokenEventId).toBe(e2.eventId);
    expect(result.reason).toMatch(/hash/);
  });

  it("detects tampering — deleted middle event", async () => {
    await recordEvent(input());
    const e2 = await recordEvent(input());
    await recordEvent(input());

    await db.execute(sql`alter table audit_events disable trigger user`);
    await db.execute(sql`delete from audit_events where event_id = ${e2.eventId}`);
    await db.execute(sql`alter table audit_events enable trigger user`);

    const result = await verifyChain(tenantId);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/prev_hash mismatch/);
  });
});

describe("append-only enforcement", () => {
  it("rejects direct UPDATE attempts at the database level", async () => {
    const e = await recordEvent(input());
    await expect(
      db.execute(
        sql`update audit_events set lawful_basis = 'forged' where event_id = ${e.eventId}`,
      ),
    ).rejects.toThrow(/append-only/);
  });

  it("rejects direct DELETE attempts at the database level", async () => {
    const e = await recordEvent(input());
    await expect(
      db.execute(sql`delete from audit_events where event_id = ${e.eventId}`),
    ).rejects.toThrow(/append-only/);
  });

  it("rejects TRUNCATE attempts", async () => {
    await recordEvent(input());
    await expect(db.execute(sql`truncate audit_events`)).rejects.toThrow(/append-only/);
  });
});
