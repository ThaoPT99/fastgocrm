import { and, eq, gt } from "drizzle-orm";
import { headers } from "next/headers";
import { timingSafeEqual } from "node:crypto";
import { getClient, getDb } from "../db";
import { accessCodes, accessSessions, adminSessions, members } from "../db/schema";

export const sessionCookie = "__Host-fastgo-session";
export const sessionSeconds = 12 * 60 * 60;
const pinPattern = /^[0-9]{8}$/;

export function validNewPin(pin: string) {
  return pinPattern.test(pin) && !/^(\d)\1{7}$/.test(pin)
    && !"01234567890123456789".includes(pin) && !"98765432109876543210".includes(pin);
}

export async function accessCodeDigest(value: string) {
  const code = value.toLowerCase().replace(/[-\s]/g, "");
  if (/^[a-f0-9]{32}$/.test(code)) return digest(code);
  if (!pinPattern.test(code)) return null;
  const secret = process.env.CRM_PIN_PEPPER;
  if (!secret) throw new Error("Missing Fastgo PIN configuration");
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, encoder.encode(code));
  return Array.from(new Uint8Array(mac), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function allowAccessAttempt(key: string, limit: number) {
  const window = Math.floor(Date.now() / (10 * 60 * 1000));
  const result = await getClient().execute({ sql: `INSERT INTO access_limits (key, window, attempts)
    VALUES (?, ?, 1) ON CONFLICT(key) DO UPDATE SET
    attempts = CASE WHEN access_limits.window = excluded.window THEN min(access_limits.attempts + 1, ?) ELSE 1 END,
    window = excluded.window RETURNING attempts`, args: [key, window, limit + 1] });
  return Number(result.rows[0]?.attempts) <= limit;
}

export function randomHex(size: number) {
  return Array.from(crypto.getRandomValues(new Uint8Array(size)), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function digest(value: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function sessionToken(cookie: string | null) {
  return cookie?.split(";").map((part) => part.trim())
    .find((part) => part.startsWith(sessionCookie + "="))?.slice(sessionCookie.length + 1);
}

export async function adminKeyDigest() {
  const key = process.env.CRM_ADMIN_PASSWORD;
  return key && key.length >= 32 ? digest(key) : null;
}

export async function matchesAdminKey(value: string) {
  const keyDigest = await adminKeyDigest();
  return keyDigest !== null && timingSafeEqual(Buffer.from(await digest(value), "hex"), Buffer.from(keyDigest, "hex"));
}

export async function getCrmIdentity() {
  const token = sessionToken((await headers()).get("cookie"));
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const db = getDb();
  const tokenDigest = await digest(token);
  const email = process.env.CRM_ADMIN_EMAIL?.trim().toLowerCase();
  const key = await adminKeyDigest();
  if (email && key) {
    const admin = await db.select().from(adminSessions)
      .where(and(eq(adminSessions.digest, tokenDigest), eq(adminSessions.keyDigest, key), gt(adminSessions.expiresAt, Date.now()))).get();
    if (admin) {
      const profile = await db.select({ displayName: members.name }).from(members).where(eq(members.email, email)).get();
      return { email, displayName: profile?.displayName ?? "Quản trị viên", role: "head" as const, ownerAdmin: true, viaCode: false };
    }
  }
  const member = await db.select({ email: members.email, displayName: members.name, role: members.role })
    .from(accessSessions)
    .innerJoin(accessCodes, and(eq(accessCodes.email, accessSessions.email), eq(accessCodes.digest, accessSessions.codeDigest)))
    .innerJoin(members, eq(members.email, accessSessions.email))
    .where(and(eq(accessSessions.digest, tokenDigest), gt(accessSessions.expiresAt, Date.now()))).get();
  return member ? { ...member, ownerAdmin: false, viaCode: true } : null;
}
