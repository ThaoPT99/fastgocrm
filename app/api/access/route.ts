import { eq, lte } from "drizzle-orm";
import { z } from "zod";
import { getClient, getDb } from "../../../db";
import { accessSessions, adminSessions } from "../../../db/schema";
import { accessCodeDigest, adminKeyDigest, matchesAdminKey, allowAccessAttempt, digest, randomHex, sessionCookie, sessionSeconds, sessionToken } from "../../crm-auth";

const input = z.discriminatedUnion("action", [
  z.object({ action: z.literal("login"), code: z.string().max(100) }),
  z.object({ action: z.literal("logout") }),
]);

function reply(body: object, status = 200, cookie?: string) {
  const headers = new Headers({ "Cache-Control": "no-store" });
  if (cookie) headers.set("Set-Cookie", cookie);
  return Response.json(body, { status, headers });
}

function cookieValue(value: string, age: number) {
  return sessionCookie + "=" + value + "; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=" + age;
}

export async function POST(request: Request) {
  if (request.headers.get("sec-fetch-site") === "cross-site" ||
      !request.headers.get("content-type")?.startsWith("application/json")) {
    return reply({ error: "Yêu cầu không hợp lệ." }, 403);
  }
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return reply({ error: "Yêu cầu không hợp lệ." }, 400);

  if (parsed.data.action === "logout") {
    const token = sessionToken(request.headers.get("cookie"));
    if (token && /^[a-f0-9]{64}$/.test(token)) {
      const db = getDb();
      const hashed = await digest(token);
      await db.batch([
        db.delete(accessSessions).where(eq(accessSessions.digest, hashed)),
        db.delete(adminSessions).where(eq(adminSessions.digest, hashed)),
      ]);
    }
    return reply({ ok: true }, 200, cookieValue("", 0));
  }

  const value = parsed.data.code;
  const token = randomHex(32);
  const hashed = await digest(token);
  const now = Date.now();
  const expiresAt = now + sessionSeconds * 1000;
  const db = getDb();
  const keyDigest = value.length >= 32 ? await adminKeyDigest() : null;
  if (keyDigest && process.env.CRM_ADMIN_EMAIL && await matchesAdminKey(value)) {
    await db.batch([
      db.delete(adminSessions).where(lte(adminSessions.expiresAt, now)),
      db.insert(adminSessions).values({ digest: hashed, expiresAt, keyDigest }),
    ]);
  } else {
    const codeDigest = await accessCodeDigest(value);
    if (!codeDigest) return reply({ error: "Mật mã không hợp lệ hoặc đã bị thay thế." }, 401);
    if (!await allowAccessAttempt("login", 50)) return reply({ error: "Đã thử quá nhiều lần. Vui lòng thử lại sau ít phút." }, 429);
    const inserted = await getClient().execute({
      sql: "INSERT INTO access_sessions (digest, email, code_digest, expires_at) SELECT ?, email, digest, ? FROM access_codes WHERE digest = ?",
      args: [hashed, expiresAt, codeDigest],
    });
    if (inserted.rowsAffected !== 1) return reply({ error: "Mật mã không hợp lệ hoặc đã bị thay thế." }, 401);
    await db.delete(accessSessions).where(lte(accessSessions.expiresAt, now));
  }
  return reply({ ok: true }, 200, cookieValue(token, sessionSeconds));
}
