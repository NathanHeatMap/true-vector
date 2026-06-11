/**
 * Clerk webhook handler.
 *
 * Subscribed events:
 *   - organization.created — provision a Tenant row
 *   - organization.updated — sync name + metadata
 *   - user.created / user.updated — enrich the auto-provisioned WorkforcePerson
 *
 * SECURITY: Every request is verified against CLERK_WEBHOOK_SECRET via Svix.
 * Unverified payloads are rejected with 401.
 */

import { headers } from "next/headers";
import { Webhook } from "svix";
import { eq } from "drizzle-orm";
import { ulid } from "ulid";

import { db } from "@/db";
import { tenants, workforcePersons } from "@/db/schema";
import { recordEvent } from "@/lib/audit";

interface ClerkEvent {
  type: string;
  data: Record<string, unknown>;
}

export async function POST(req: Request) {
  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (!secret) {
    return new Response("CLERK_WEBHOOK_SECRET not configured", { status: 500 });
  }

  const payload = await req.text();
  const hdr = await headers();
  const svixId = hdr.get("svix-id");
  const svixTs = hdr.get("svix-timestamp");
  const svixSig = hdr.get("svix-signature");

  if (!svixId || !svixTs || !svixSig) {
    return new Response("missing svix headers", { status: 400 });
  }

  let event: ClerkEvent;
  try {
    event = new Webhook(secret).verify(payload, {
      "svix-id": svixId,
      "svix-timestamp": svixTs,
      "svix-signature": svixSig,
    }) as ClerkEvent;
  } catch {
    return new Response("invalid signature", { status: 401 });
  }

  try {
    await handle(event);
    return new Response("ok", { status: 200 });
  } catch (err) {
    console.error("clerk webhook handler error", err);
    return new Response("handler error", { status: 500 });
  }
}

async function handle(event: ClerkEvent) {
  switch (event.type) {
    case "organization.created":
    case "organization.updated":
      return upsertTenant(event.data);
    case "user.created":
    case "user.updated":
      return upsertPersonFromUser(event.data);
    default:
      return; // ignore other event types for now
  }
}

async function upsertTenant(data: Record<string, unknown>) {
  const clerkOrgId = data.id as string;
  const name = (data.name as string) ?? "Untitled tenant";

  const existing = await db
    .select()
    .from(tenants)
    .where(eq(tenants.clerkOrgId, clerkOrgId))
    .limit(1);

  if (existing[0]) {
    await db
      .update(tenants)
      .set({ name, updatedAt: new Date().toISOString() })
      .where(eq(tenants.tenantId, existing[0].tenantId));
    return;
  }

  const tenantId = `t_${ulid()}`;
  await db.insert(tenants).values({
    tenantId,
    clerkOrgId,
    name,
    jurisdictions: [],
  });

  // The very first audit event for a tenant — genesis of its chain.
  await recordEvent({
    type: "programme.review_completed", // closest existing type; consider adding a "tenant.provisioned" type later
    tenantId,
    actor: { kind: "system", service: "clerk-webhook" },
    subject: { entityType: "tenant", entityId: tenantId },
    after: { name, clerkOrgId },
  });
}

async function upsertPersonFromUser(data: Record<string, unknown>) {
  const clerkUserId = data.id as string;
  const emailAddresses = data.email_addresses as
    | Array<{ email_address: string; id: string }>
    | undefined;
  const primaryEmailId = data.primary_email_address_id as string | undefined;
  const firstName = (data.first_name as string) ?? "";
  const lastName = (data.last_name as string) ?? "";
  const displayName = `${firstName} ${lastName}`.trim() || "Unknown";
  const primaryEmail =
    emailAddresses?.find((e) => e.id === primaryEmailId)?.email_address ??
    emailAddresses?.[0]?.email_address ??
    "unknown@example.invalid";

  const existing = await db
    .select()
    .from(workforcePersons)
    .where(eq(workforcePersons.clerkUserId, clerkUserId))
    .limit(1);

  if (existing[0]) {
    await db
      .update(workforcePersons)
      .set({ displayName, primaryEmail, updatedAt: new Date().toISOString() })
      .where(eq(workforcePersons.personId, existing[0].personId));
  }
  // We don't insert here; auto-provisioning happens in requireRole() so we
  // have the tenant context. Users without a tenant don't get a person row.
}
