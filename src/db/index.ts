/**
 * Database client — Drizzle + node-postgres.
 *
 * Single client instance reused across the app. In Next.js, this module is
 * imported by Server Components and Server Actions; the connection pool lives
 * for the lifetime of the server process.
 */

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL is required");
}

// Hot-reload-safe singleton pattern for Next.js dev mode.
const globalForDb = globalThis as unknown as {
  postgres: ReturnType<typeof postgres> | undefined;
};

const client = globalForDb.postgres ?? postgres(url, { max: 10 });
if (process.env.NODE_ENV !== "production") {
  globalForDb.postgres = client;
}

export const db = drizzle(client, { schema });
export type Db = typeof db;
