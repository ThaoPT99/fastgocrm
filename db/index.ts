import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";

let client: ReturnType<typeof createClient> | undefined;

export function getClient() {
  const url = process.env.TURSO_DATABASE_URL;
  if (!url) throw new Error("TURSO_DATABASE_URL is required");
  return client ??= createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });
}

export function getDb() {
  return drizzle(getClient(), { schema });
}
