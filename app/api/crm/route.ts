import { and, asc, eq, inArray, isNull, like, ne, not, or, sql } from "drizzle-orm";
import { z } from "zod";
import { getClient, getDb } from "../../../db";
import { accessCodes, demoInstalls, members, records } from "../../../db/schema";
import { accessCodeDigest, allowAccessAttempt, getCrmIdentity, validNewPin } from "../../crm-auth";
import { checklistItemIds, checklistOptionalIds } from "../../intake-checklist";
import { followupChannels, isDemoEmail, needsPartner, partnerActivityKinds, statuses, today } from "../../crm";

export const dynamic = "force-dynamic";
const json = (data: unknown, status = 200) => Response.json(data, {
  status, headers: { "Cache-Control": "no-store" },
});

const memberInput = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  name: z.string().trim().min(1).max(100),
  role: z.enum(["head", "lead", "sale"]),
  team: z.string().trim().max(60),
}).refine((member) => !isDemoEmail(member.email) && (member.role === "head" || member.team.length > 0));
const recordInput = z.object({
  id: z.string().uuid().optional(),
  version: z.number().int().positive().optional(),
  kind: z.enum(["partner", "task", "activity", "meeting", "intake", "logwork"]),
  title: z.string().trim().min(1).max(180),
  owner: z.string().email(),
  status: z.string(),
  date: z.string().date(),
  partner: z.string().trim().max(180),
  partnerId: z.string().uuid().nullish(),
  intakeChecklist: z.object({
    residence: z.enum(["", "household", "residence"]),
    optional: z.array(z.string().refine((id) => checklistOptionalIds.has(id))).max(checklistOptionalIds.size),
    checked: z.array(z.string().refine((id) => checklistItemIds.has(id))).max(checklistItemIds.size),
  }).nullish(),
  notes: z.string().trim().max(4000),
}).refine((record) => (statuses[record.kind] as readonly string[]).includes(record.status) &&
  (record.kind !== "logwork" || record.status !== "Cần hỗ trợ" || record.partner.length > 0));
const command = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start-sales-mode") }),
  z.object({ action: z.literal("passcode"), email: z.string().trim().toLowerCase().email(), operation: z.enum(["assign", "revoke"]), code: z.string().max(16).optional() }),
  z.object({ action: z.literal("change-passcode"), currentCode: z.string().max(100), newCode: z.string().max(16) }),
  z.object({ action: z.literal("record"), record: z.unknown(), demoAs: z.string().email().optional() }),
  z.object({ action: z.literal("member"), member: z.unknown() }),
  z.object({ action: z.literal("remove"), id: z.string().uuid(), version: z.number().int().positive(), demoAs: z.string().email().optional() }),
  z.object({ action: z.literal("clear-demo") }),
  z.object({ action: z.literal("link-partners") }),
  z.object({ action: z.literal("initialize-followups") }),
  z.object({
    action: z.literal("followup"),
    centerId: z.string().uuid(),
    version: z.number().int().positive(),
    demoAs: z.string().email().optional(),
    channel: z.enum(followupChannels),
    activity: z.string().trim().min(1).max(180),
    result: z.string().trim().min(1).max(4000),
    nextAction: z.string().trim().max(180),
    nextDate: z.union([z.string().date(), z.literal("")]),
  }),
]);

const demoCleanupKey = "crm-demo-cleared-v1";
const partnerLinkKey = "crm-partner-links-v1";
const followupKey = "crm-followups-v1";

async function hasInstall(db: ReturnType<typeof getDb>, key: string) {
  return Boolean(await db.select({ key: demoInstalls.key }).from(demoInstalls)
    .where(eq(demoInstalls.key, key)).get());
}

function linkLegacyPartners(db: ReturnType<typeof getDb>) {
  const match = sql`FROM records AS center
    WHERE center.kind = 'partner' AND center.owner = ${records.owner}
      AND lower(trim(CASE WHEN substr(center.title, 1, 6) = '[Mẫu] '
        THEN substr(center.title, 7) ELSE center.title END)) = lower(trim(${records.partner}))`;
  return db.update(records).set({
    partnerId: sql`(SELECT min(center.id) ${match})`,
    version: sql`${records.version} + 1`,
  }).where(and(inArray(records.kind, partnerActivityKinds), sql`${records.partnerId} IS NULL`,
    sql`trim(${records.partner}) <> '' AND (SELECT count(*) ${match}) = 1`));
}

async function context(request: Request) {
  const identity = await getCrmIdentity();
  if (!identity) return null;
  const db = getDb();
  const email = identity.email.toLowerCase();
  const ownerAdmin = identity.ownerAdmin;
  const salesMode = ownerAdmin && request.headers.get("x-fastgo-work-mode") === "sales";
  const admin = ownerAdmin && !salesMode;
  const roster = await db.select().from(members).orderBy(asc(members.team), asc(members.name));
  const actor = roster.find((member) => member.email === email);
  if (!admin && (!actor || isDemoEmail(email))) return null;
  const role = salesMode ? "sale" : admin ? "head" : actor!.role;
  const visible = roster.filter((member) => role === "head" ||
    (role === "lead" ? member.team === actor!.team : member.email === email));
  return { db, email, admin, ownerAdmin, salesMode, role, visible, viaCode: identity.viaCode, name: identity.displayName };
}

export async function GET(request: Request) {
  const ctx = await context(request);
  if (!ctx) return json({ error: "Tài khoản chưa được cấp quyền CRM." }, 403);
  const rows = ctx.visible.length ? await ctx.db.select().from(records)
    .where(inArray(records.owner, ctx.visible.map((member) => member.email)))
    .orderBy(asc(records.date), asc(records.id)) : [];
  const demoCleared = ctx.admin && await hasInstall(ctx.db, demoCleanupKey);
  const partnersLinked = ctx.admin && await hasInstall(ctx.db, partnerLinkKey);
  const followupsReady = ctx.admin && await hasInstall(ctx.db, followupKey);
  const roster = ctx.salesMode ? ctx.visible.map((member) => ({ ...member, role: "sale" })) : ctx.visible;
  const codeEmails = ctx.role === "head" ? (await ctx.db.select({ email: accessCodes.email }).from(accessCodes)).map((item) => item.email) : [];
  const visibleEmails = new Set(roster.map((member) => member.email));
  const scopedRows = rows.map((row) => row.performedBy && !visibleEmails.has(row.performedBy)
    ? { ...row, performedBy: "" } : row);
  return json({ members: roster, records: scopedRows, role: ctx.role, admin: ctx.admin, ownerAdmin: ctx.ownerAdmin, salesMode: ctx.salesMode,
    email: ctx.email, demoCleared, partnersLinked, followupsReady, codeEmails });
}

async function clearDemo(db: ReturnType<typeof getDb>) {
  if (!await hasInstall(db, demoCleanupKey)) {
    const demoDomain = "%@fastgo.example";
    const demoRecord = or(like(records.owner, demoDomain), like(records.title, "[Mẫu] %"))!;
    const demoCenters = db.select({ id: records.id }).from(records)
      .where(and(eq(records.kind, "partner"), demoRecord));
    try {
      await db.batch([
        db.insert(demoInstalls).values({ key: demoCleanupKey }),
        db.update(records).set({ partnerId: null, version: sql`${records.version} + 1` })
          .where(and(not(demoRecord), inArray(records.partnerId, demoCenters))),
        db.delete(records).where(and(ne(records.kind, "partner"), demoRecord)),
        db.delete(records).where(and(eq(records.kind, "partner"), demoRecord)),
        db.delete(members).where(like(members.email, demoDomain)),
      ]);
    } catch (error) {
      if (!await hasInstall(db, demoCleanupKey)) throw error;
    }
  }
}

export async function POST(request: Request) {
  if (request.headers.get("sec-fetch-site") === "cross-site" ||
      !request.headers.get("content-type")?.startsWith("application/json")) {
    return json({ error: "Yêu cầu không hợp lệ." }, 403);
  }
  const parsed = command.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: "Yêu cầu không hợp lệ." }, 400);
  const data = parsed.data;
  if (data.action === "clear-demo") {
    if (!(await context(request))?.admin) {
      return json({ error: "Chỉ quản trị viên được dọn dữ liệu mẫu." }, 403);
    }
    await clearDemo(getDb());
    return json({ ok: true });
  }

  const ctx = await context(request);
  if (!ctx) return json({ error: "Tài khoản chưa được cấp quyền CRM." }, 403);
  if (data.action === "passcode") {
    const member = ctx.visible.find((person) => person.email === data.email);
    if (ctx.role !== "head" || !member || (!ctx.admin && member.role === "head")) {
      return json({ error: "Bạn không có quyền đặt hoặc thu hồi mã cho tài khoản này." }, 403);
    }
    if (data.operation === "revoke") {
      await ctx.db.delete(accessCodes).where(eq(accessCodes.email, data.email));
      return json({ ok: true });
    }
    const pin = data.code?.trim() ?? "";
    if (!validNewPin(pin)) return json({ error: "Mã cần đúng 8 chữ số. Hãy tránh dãy liên tiếp hoặc lặp cùng một số." }, 400);
    const hashed = await accessCodeDigest(pin);
    const assigned = await getClient().execute({ sql: `INSERT INTO access_codes (email, digest)
      SELECT ?, ? WHERE NOT EXISTS (SELECT 1 FROM access_codes WHERE digest = ?)
      ON CONFLICT(email) DO UPDATE SET digest = excluded.digest`, args: [data.email, hashed, hashed] });
    return assigned.rowsAffected === 1 ? json({ ok: true }) : json({ error: "Mã này đang được sử dụng. Hãy chọn mã khác." }, 409);
  }
  if (data.action === "change-passcode") {
    if (!ctx.viaCode) return json({ error: "Tính năng dành cho nhân sự đăng nhập bằng mật mã cá nhân." }, 403);
    const pin = data.newCode.trim();
    if (!validNewPin(pin)) return json({ error: "Mã cần đúng 8 chữ số. Hãy tránh dãy liên tiếp hoặc lặp cùng một số." }, 400);
    if (!await allowAccessAttempt("change:" + ctx.email, 8)) return json({ error: "Đã thử quá nhiều lần. Vui lòng thử lại sau ít phút." }, 429);
    const previous = await accessCodeDigest(data.currentCode);
    if (!previous || !await ctx.db.select({ email: accessCodes.email }).from(accessCodes)
      .where(and(eq(accessCodes.email, ctx.email), eq(accessCodes.digest, previous))).get()) {
      return json({ error: "Mã hiện tại chưa đúng." }, 400);
    }
    const hashed = await accessCodeDigest(pin);
    const changed = await getClient().execute({ sql: `UPDATE access_codes SET digest = ?
      WHERE email = ? AND digest = ? AND NOT EXISTS (SELECT 1 FROM access_codes WHERE digest = ?)`, args: [hashed, ctx.email, previous, hashed] });
    return changed.rowsAffected === 1 ? json({ ok: true }) : json({ error: "Mã này đang được sử dụng hoặc mã hiện tại đã thay đổi." }, 409);
  }
  if (data.action === "start-sales-mode") {
    if (!ctx.admin) return json({ error: "Chỉ quản trị viên có thể chuyển sang chế độ làm việc Sales." }, 403);
    await ctx.db.insert(members).values({ email: ctx.email, name: ctx.name.slice(0, 100), role: "head", team: "" })
      .onConflictDoNothing();
    return json({ ok: true });
  }
  if (data.action === "initialize-followups") {
    if (!ctx.admin) return json({ error: "Chỉ quản trị viên được chuyển lịch theo dõi cũ." }, 403);
    if (!await hasInstall(ctx.db, followupKey)) {
      const openTask = sql`FROM records AS task
        WHERE task.partner_id = ${records.id} AND task.kind = 'task' AND task.status <> 'Hoàn tất'
        ORDER BY task.date, task.id LIMIT 1`;
      try {
        await ctx.db.batch([
          ctx.db.insert(demoInstalls).values({ key: followupKey }),
          ctx.db.update(records).set({
            followupDate: sql`(SELECT task.date ${openTask})`,
            followupAction: sql`(SELECT task.title ${openTask})`,
            version: sql`${records.version} + 1`,
          }).where(and(eq(records.kind, "partner"), isNull(records.followupDate),
            sql`EXISTS (SELECT 1 ${openTask})`,
            sql`NOT EXISTS (SELECT 1 FROM records AS activity WHERE activity.partner_id = ${records.id} AND activity.logged_at IS NOT NULL)`)),
        ]);
      } catch (error) {
        if (!await hasInstall(ctx.db, followupKey)) throw error;
      }
    }
    return json({ ok: true });
  }
  if (data.action === "link-partners") {
    if (!ctx.admin) return json({ error: "Chỉ quản trị viên được liên kết dữ liệu cũ." }, 403);
    if (!await hasInstall(ctx.db, partnerLinkKey)) {
      try {
        await ctx.db.batch([ctx.db.insert(demoInstalls).values({ key: partnerLinkKey }), linkLegacyPartners(ctx.db)]);
      } catch (error) {
        if (!await hasInstall(ctx.db, partnerLinkKey)) throw error;
      }
    }
    return json({ ok: true });
  }
  if (data.action === "member") {
    if (!ctx.admin) return json({ error: "Chỉ quản trị viên được quản lý nhân sự." }, 403);
    const input = memberInput.safeParse(data.member);
    if (!input.success) return json({ error: "Kiểm tra email, tên và team của nhân sự." }, 400);
    const member = input.data;
    await ctx.db.insert(members).values(member).onConflictDoUpdate({
      target: members.email, set: { name: member.name, role: member.role, team: member.team },
    });
    return json({ ok: true });
  }

  if (data.demoAs) return json({ error: "Hãy tải lại trang trước khi tiếp tục." }, 403);
  const permitted = ctx.visible.map((member) => member.email);

  if (data.action === "followup") {
    if (Boolean(data.nextAction) !== Boolean(data.nextDate)) {
      return json({ error: "Hãy nhập cả việc cần làm và ngày follow-up, hoặc để trống cả hai." }, 400);
    }
    const center = await ctx.db.select({ owner: records.owner }).from(records)
      .where(and(eq(records.id, data.centerId), eq(records.kind, "partner"))).get();
    if (!center || !permitted.includes(center.owner)) return json({ error: "Bạn không có quyền cập nhật trung tâm này." }, 403);
    const now = new Date();
    const nextDate = data.nextDate || null;
    const nextAction = data.nextAction || null;
    const condition = "id = ? AND owner = ? AND version = ? AND kind = 'partner'";
    const match = [data.centerId, center.owner, data.version];
    const [activity, updated] = await getClient().batch([
      { sql: `INSERT INTO records
        (id, kind, title, owner, status, date, partner, partner_id, notes, followup_date, followup_action, logged_at, performed_by)
        SELECT ?, 'activity', ?, owner, ?, ?, title, id, ?, ?, ?, ?, ? FROM records WHERE ${condition}`,
        args: [crypto.randomUUID(), data.activity, data.channel, today(now), data.result, nextDate, nextAction, now.toISOString(), ctx.email, ...match] },
      { sql: `UPDATE records SET followup_date = ?, followup_action = ?, version = version + 1 WHERE ${condition}`,
        args: [nextDate, nextAction, ...match] },
    ], "write");
    return activity.rowsAffected === 1 && updated.rowsAffected === 1
      ? json({ ok: true }) : json({ error: "Hồ sơ vừa thay đổi. Hãy tải lại để xem lịch follow-up mới nhất." }, 409);
  }

  if (data.action === "remove") {
    if (!permitted.length) return json({ error: "Bạn chưa có dữ liệu được cấp quyền." }, 403);
    const linked = await ctx.db.select({ id: records.id }).from(records)
      .where(and(eq(records.partnerId, data.id), inArray(records.owner, permitted))).get();
    if (linked) return json({ error: "Trung tâm đang có hoạt động hoặc hồ sơ liên kết. Hãy chuyển các bản ghi đó trước khi xóa." }, 409);
    const removed = await ctx.db.delete(records).where(and(eq(records.id, data.id),
      eq(records.version, data.version), inArray(records.owner, permitted),
      or(ne(records.kind, "activity"), isNull(records.loggedAt)),
      ctx.admin ? undefined : or(ne(records.kind, "logwork"), eq(records.owner, ctx.email)))).returning({ id: records.id });
    return removed.length ? json({ ok: true }) : json({ error: "Bản ghi đã thay đổi hoặc không còn truy cập được. Tải lại trang." }, 409);
  }

  const input = recordInput.safeParse(data.record);
  if (!input.success) return json({ error: "Kiểm tra thông tin bắt buộc. Nếu cần hỗ trợ, hãy mô tả vướng mắc." }, 400);
  const { id, version, ...record } = input.data;
  if (record.kind !== "intake") delete record.intakeChecklist;
  if (!permitted.includes(record.owner)) return json({ error: "Bạn không có quyền giao cho nhân sự này." }, 403);
  if (record.kind === "logwork" && record.owner !== ctx.email) {
    return json({ error: "Bạn chỉ có thể ghi hoặc sửa nhật ký của mình." }, 403);
  }
  if (needsPartner(record.kind)) {
    if (!record.partnerId) return json({ error: "Hãy chọn một trung tâm đã có trong Đối tác B2B." }, 400);
    const center = await ctx.db.select({ title: records.title }).from(records)
      .where(and(eq(records.id, record.partnerId), eq(records.kind, "partner"), eq(records.owner, record.owner))).get();
    if (!center) return json({ error: "Trung tâm phải thuộc Sales phụ trách bản ghi." }, 400);
    record.partner = center.title.replace(/^\[Mẫu\] /, "");
  } else {
    record.partnerId = null;
  }
  if (id) {
    if (!version) return json({ error: "Thiếu phiên bản bản ghi." }, 400);
    if (record.kind === "partner") {
      const linked = await ctx.db.select({ id: records.id }).from(records)
        .where(and(eq(records.partnerId, id), inArray(records.owner, permitted), ne(records.owner, record.owner))).get();
      if (linked) return json({ error: "Trung tâm đang có bản ghi liên kết với người phụ trách hiện tại." }, 409);
    }
    const updated = await ctx.db.update(records).set({ ...record, version: version + 1 })
      .where(and(eq(records.id, id), eq(records.version, version), eq(records.kind, record.kind),
        inArray(records.owner, permitted), or(ne(records.kind, "activity"), isNull(records.loggedAt)),
        record.kind === "logwork" ? and(eq(records.owner, record.owner), eq(records.date, record.date)) : undefined))
      .returning({ id: records.id });
    if (!updated.length) return json({ error: "Bản ghi đã thay đổi hoặc không còn truy cập được. Tải lại trang." }, 409);
  } else {
    await ctx.db.insert(records).values({ id: crypto.randomUUID(), ...record,
      loggedAt: record.kind === "logwork" ? new Date().toISOString() : null });
  }
  return json({ ok: true });
}
