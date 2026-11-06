import { readFile } from "node:fs/promises";
import { createClient } from "@libsql/client";

const url = process.env.TURSO_DATABASE_URL;
if (!url) throw new Error("Set TURSO_DATABASE_URL");
const client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });
try {
  const journal = JSON.parse(await readFile(new URL("../drizzle/meta/_journal.json", import.meta.url), "utf8"));
  await client.execute("CREATE TABLE IF NOT EXISTS _fastgo_migrations (name TEXT PRIMARY KEY)");
  for (const { tag } of journal.entries) {
    const already = await client.execute({ sql: "SELECT name FROM _fastgo_migrations WHERE name = ?", args: [tag] });
    if (already.rows.length) continue;
    const sql = await readFile(new URL("../drizzle/" + tag + ".sql", import.meta.url), "utf8");
    const statements = sql.split("--> statement-breakpoint").map((part) => part.trim()).filter(Boolean);
    await client.batch([...statements, { sql: "INSERT INTO _fastgo_migrations (name) VALUES (?)", args: [tag] }], "write");
    console.log("Applied " + tag);
  }
} finally {
  client.close();
}
