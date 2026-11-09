import { and, asc, desc, eq, gte, lte, inArray, isNull, like, ne, not, or, sql } from "drizzle-orm";
import { z } from "zod";
import { getClient, getDb } from "../../../db";
import { accessCodes, demoInstalls, kpiPlans, members, records, playbooks, supportRequests, teamDirectory } from "../../../db/schema";
import { accessCodeDigest, allowAccessAttempt, getCrmIdentity, validNewPin } from "../../crm-auth";
import { checklistItemIds, checklistOptionalIds } from "../../intake-checklist";
import { followupChannels, isDemoEmail, needsPartner, partnerActivityKinds, statuses, today } from "../../crm";
import { personalTargets, planInput, quarterOf } from "../../kpi-plan";
import { analyzeKpiPlan } from "../../plan-analysis";
import { contactEvidence, partnerAssistance, weeklyAssistance } from "../../crm-ai";
import { partnerOutcomes } from "../../plan-monitor";
import { situationKeys, supportInput } from "../../sales-workflow";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
const json = (data: unknown, status = 200) => Response.json(data, {
  status, headers: { "Cache-Control": "no-store" },
});

function databaseRejected(error: unknown, reason: string) {
  return error instanceof Error && error.cause instanceof Error &&
    error.cause.message.includes(reason);
}

const memberInput = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  name: z.string().trim().min(1).max(100),
  role: z.enum(["head", "lead", "sale", "intake"]),
  team: z.string().trim().max(60),
}).refine((member) => !isDemoEmail(member.email) && (member.role === "head" || member.role === "intake" || member.team.length > 0));
const recordInput = z.object({
  id: z.string().uuid().optional(),
  version: z.number().int().positive().optional(),
  kind: z.enum(["partner", "task", "activity", "meeting", "intake", "logwork"]),
  title: z.string().trim().min(1).max(180),
  owner: z.string().email(),
  status: z.string(),
  date: z.string().date(),
  partner: z.string().trim().max(180),
  province: z.string().trim().max(100).nullable().optional(),
  partnerId: z.string().uuid().nullish(),
  intakeChecklist: z.object({
    residence: z.enum(["", "household", "residence"]),
    optional: z.array(z.string().refine((id) => checklistOptionalIds.has(id))).max(checklistOptionalIds.size),
    checked: z.array(z.string().refine((id) => checklistItemIds.has(id))).max(checklistItemIds.size),
    received: z.record(z.string().refine((id) => checklistItemIds.has(id)), z.number().int().min(0).max(999)).optional(),
  }).nullish(),
  notes: z.string().trim().max(4000),
}).refine((record) => (statuses[record.kind] as readonly string[]).includes(record.status) &&
  (record.kind !== "logwork" || record.status !== "Cần hỗ trợ" || record.partner.length > 0));
const command = z.discriminatedUnion("action", [
  z.object({ action: z.literal("team-create"), name: z.string().trim().min(1).max(60) }),
  z.object({ action: z.literal("team-rename"), team: z.string().min(1), name: z.string().trim().min(1).max(60) }),
  z.object({ action: z.literal("team-status"), team: z.string().min(1), active: z.boolean() }),
  z.object({ action: z.literal("next-step"), centerId: z.string().uuid(), version: z.number().int().positive(),
    nextOwner: z.enum(["self", "partner", "support", "none"]), nextParty: z.string().trim().max(100),
    nextAction: z.string().trim().max(180), nextDate: z.union([z.string().date(), z.literal("")]) }),
  z.object({ action: z.literal("support-create"), id: z.string().uuid(), centerId: z.string().uuid(),
    assignedTo: z.string().email(), problem: z.string().trim().min(1).max(2000) }),
  z.object({ action: z.literal("support-reply"), ...supportInput.shape }),
  z.object({ action: z.literal("playbook"), team: z.string().max(60), key: z.enum(situationKeys),
    version: z.number().int().min(0), operation: z.enum(["draft", "publish"]), content: z.string().trim().min(1).max(4000) }),
  z.object({
    action: z.literal("partner-ai"), centerId: z.string().uuid(),
    mode: z.enum(["summary", "prepare", "message", "log"]),
    note: z.string().trim().max(2500), channel: z.enum(followupChannels),
  }),
  z.object({
    action: z.literal("weekly-ai"), teamReview: z.boolean(), owner: z.string().email().optional(),
    team: z.string().max(60).optional(), from: z.string().date(), to: z.string().date(),
  }),
  z.object({ action: z.literal("analyze-plan"), owner: z.string().email(), plan: planInput }),
  z.object({ action: z.literal("kpi-plan"), plan: planInput }),
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
    performedDate: z.string().date().optional(),
    nextOwner: z.enum(["self", "partner", "support", "none"]).optional(),
    nextParty: z.string().trim().max(100).optional(),
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
  const visible = roster.filter((member) => role === "head" || role === "intake" ||
    (role === "lead" ? member.team === actor!.team : member.email === email));
  return { db, email, admin, ownerAdmin, salesMode, role, visible, roster, actor, viaCode: identity.viaCode, name: identity.displayName };
}

export async function GET(request: Request) {
  const ctx = await context(request);
  if (!ctx) return json({ error: "Tài khoản chưa được cấp quyền CRM." }, 403);
  const rows = ctx.visible.length ? await ctx.db.select().from(records)
    .where(ctx.role === "intake" ? eq(records.kind, "intake") : inArray(records.owner, ctx.visible.map((member) => member.email)))
    .orderBy(asc(records.date), asc(records.id)) : [];
  const demoCleared = ctx.admin && await hasInstall(ctx.db, demoCleanupKey);
  const partnersLinked = ctx.admin && await hasInstall(ctx.db, partnerLinkKey);
  const followupsReady = ctx.admin && await hasInstall(ctx.db, followupKey);
  const intakeCenters = ctx.role === "intake"
    ? await ctx.db.select({ id: records.id, title: records.title, owner: records.owner }).from(records)
      .where(eq(records.kind, "partner")).orderBy(asc(records.title))
    : [];
  const intakeOwners = ctx.role === "intake" ? new Set([...rows, ...intakeCenters].map((row) => row.owner)) : null;
  const roster = intakeOwners ? ctx.visible.filter((member) => intakeOwners.has(member.email))
    : ctx.salesMode ? ctx.visible.map((member) => ({ ...member, role: "sale" })) : ctx.visible;
  const codeEmails = ctx.role === "head" ? (await ctx.db.select({ email: accessCodes.email }).from(accessCodes)).map((item) => item.email) : [];
  const visibleEmails = new Set(roster.map((member) => member.email));
  const scopedRows = rows.map((row) => row.performedBy && !visibleEmails.has(row.performedBy)
    ? { ...row, performedBy: "" } : row);
  const plans = ctx.role !== "intake" && visibleEmails.size
    ? await ctx.db.select().from(kpiPlans).where(inArray(kpiPlans.owner, [...visibleEmails])) : [];
  const centerIds = rows.filter((row) => row.kind === "partner").map((row) => row.id);
  const support = ctx.role !== "intake" && centerIds.length
    ? await ctx.db.select().from(supportRequests).where(inArray(supportRequests.centerId, centerIds)) : [];
  const teams = new Set(ctx.visible.map((person) => person.team));
  const supportContacts = ctx.role === "intake" ? [] : ctx.roster.filter((person) =>
    person.role === "head" || (person.role === "lead" && teams.has(person.team)));
  const guides = ctx.role === "intake" ? [] : await ctx.db.select().from(playbooks)
    .where(ctx.role === "head" ? undefined : inArray(playbooks.team, ["", ...teams]));
  const guideData = guides.flatMap((guide) => {
    const editor = ctx.role === "head" || (ctx.role === "lead" && guide.team === ctx.actor?.team);
    if (!editor && !guide.published) return [];
    return [{ ...guide, draft: editor ? guide.draft : undefined, approvedBy: undefined }];
  });
  const directory = ctx.admin ? await ctx.db.select().from(teamDirectory).orderBy(asc(teamDirectory.name)) : [];
  return json({ members: roster, teamDirectory: directory, records: scopedRows, role: ctx.role, admin: ctx.admin, ownerAdmin: ctx.ownerAdmin, salesMode: ctx.salesMode,
    email: ctx.email, demoCleared, partnersLinked, followupsReady, codeEmails, intakeCenters, plans, support, supportContacts, guides: guideData });
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
  if (data.action === "playbook") {
    if (!(ctx.role === "head" || (ctx.role === "lead" && data.team === ctx.actor?.team))) return json({ error: "Bạn chỉ được duyệt hướng dẫn trong phạm vi quản lý." }, 403);
    if (!ctx.roster.some((person) => person.email === ctx.email)) return json({ error: "Thêm hồ sơ nhân sự của bạn trước khi duyệt hướng dẫn." }, 400);
    const condition = and(eq(playbooks.team, data.team), eq(playbooks.key, data.key), eq(playbooks.version, data.version));
    if (data.operation === "publish") {
      const guide = await ctx.db.select().from(playbooks).where(condition).get();
      if (!guide || guide.draft !== data.content) return json({ error: "Lưu bản nháp mới nhất trước khi duyệt." }, 409);
      const updated = await ctx.db.update(playbooks).set({ published: guide.draft, approvedBy: ctx.email,
        approvedAt: new Date().toISOString(), version: data.version + 1 }).where(condition).returning();
      return updated.length ? json({ ok: true }) : json({ error: "Hướng dẫn vừa thay đổi. Hãy tải lại." }, 409);
    }
    try {
      const saved = data.version === 0
        ? await ctx.db.insert(playbooks).values({ team: data.team, key: data.key, draft: data.content }).onConflictDoNothing().returning()
        : await ctx.db.update(playbooks).set({ draft: data.content, version: data.version + 1 }).where(condition).returning();
      return saved.length ? json({ ok: true }) : json({ error: "Hướng dẫn vừa thay đổi. Hãy tải lại." }, 409);
    } catch (error) {
      if (databaseRejected(error, "known_team_required")) {
        return json({ error: "Team vừa thay đổi. Hãy tải lại trước khi lưu hướng dẫn." }, 409);
      }
      throw error;
    }
  }
  if (data.action === "support-create" || data.action === "support-reply") {
    if (ctx.role === "intake") return json({ error: "Vai trò hồ sơ chưa có quyền dùng hỗ trợ kinh doanh." }, 403);
    const request = data.action === "support-reply"
      ? await ctx.db.select().from(supportRequests).where(eq(supportRequests.id, data.id)).get() : undefined;
    const centerId = data.action === "support-create" ? data.centerId : request?.centerId;
    const center = centerId ? await ctx.db.select().from(records).where(and(eq(records.id, centerId), eq(records.kind, "partner"))).get() : undefined;
    if (!center || !ctx.visible.some((person) => person.email === center.owner)) return json({ error: "Bạn không có quyền hỗ trợ trung tâm này." }, 403);
    if (!ctx.roster.some((person) => person.email === ctx.email)) return json({ error: "Thêm hồ sơ nhân sự của bạn trước khi gửi hỗ trợ." }, 400);
    if (data.action === "support-create") {
      const ownerTeam = ctx.roster.find((person) => person.email === center.owner)?.team;
      const assignee = ctx.roster.find((person) => person.email === data.assignedTo &&
        (person.role === "head" || (person.role === "lead" && person.team === ownerTeam)));
      if (!assignee) return json({ error: "Chọn Trưởng nhóm của người phụ trách hoặc Trưởng khối." }, 400);
      const inserted = await ctx.db.insert(supportRequests).values({ id: data.id, centerId: center.id, requestedBy: ctx.email,
        assignedTo: assignee.email, problem: data.problem, status: "Mới", messages: [], createdAt: new Date().toISOString() }).onConflictDoNothing().returning();
      if (inserted.length) return json({ ok: true });
      const existing = await ctx.db.select().from(supportRequests).where(eq(supportRequests.id, data.id)).get();
      return existing?.requestedBy === ctx.email && existing.centerId === center.id && existing.problem === data.problem && existing.assignedTo === assignee.email
        ? json({ ok: true }) : json({ error: "Yêu cầu đã thay đổi. Hãy tải lại." }, 409);
    }
    if (!request) return json({ error: "Không tìm thấy yêu cầu." }, 404);
    const manager = ctx.role === "head" || (ctx.role === "lead" && ctx.actor?.team === ctx.roster.find((person) => person.email === center.owner)?.team);
    if (data.status && !manager) return json({ error: "Trưởng nhóm hoặc Trưởng khối cập nhật trạng thái xử lý." }, 403);
    const updated = await ctx.db.update(supportRequests).set({ status: data.status ?? request.status,
      messages: [...request.messages, { by: ctx.email, text: data.note, at: new Date().toISOString() }], version: data.version + 1 })
      .where(and(eq(supportRequests.id, data.id), eq(supportRequests.version, data.version))).returning();
    return updated.length ? json({ ok: true }) : json({ error: "Yêu cầu vừa thay đổi. Hãy tải lại trước khi gửi." }, 409);
  }
  if (data.action === "partner-ai" || data.action === "weekly-ai") {
    if (ctx.role === "intake") return json({ error: "Vai trò hồ sơ chưa có quyền dùng trợ lý kinh doanh." }, 403);
    const permitted = ctx.visible.map((person) => person.email);
    if (data.action === "partner-ai") {
      const center = await ctx.db.select().from(records).where(and(eq(records.id, data.centerId), eq(records.kind, "partner"))).get();
      if (!center || !permitted.includes(center.owner)) return json({ error: "Bạn không có quyền truy cập trung tâm này." }, 403);
      if ((data.mode === "log" || data.mode === "message") && !data.note.trim()) return json({ error: "Nhập ghi chú hoặc mục đích soạn tin nhắn trước." }, 400);
      if (!await allowAccessAttempt("assistant-ai:" + ctx.email, 20)) return json({ error: "Đã dùng 20 lượt trợ lý trong 10 phút. Bạn thử lại sau." }, 429);
      const history = await ctx.db.select().from(records)
        .where(and(eq(records.partnerId, center.id), inArray(records.kind, ["activity", "meeting"])))
        .orderBy(desc(records.date), desc(records.loggedAt)).limit(30);
      const intakeTotal = await ctx.db.select({ count: sql<number>`count(*)` }).from(records)
        .where(and(eq(records.partnerId, center.id), eq(records.kind, "intake"))).get();
      const result = await partnerAssistance(data.mode, {
        ngayHienTai: today(), trungTam: { ten: center.title, tinh: center.province, trangThai: center.status, ghiChu: center.notes.slice(0, 700),
          viecTiepTheo: center.followupAction, ngayTiepTheo: center.followupDate,
          nguoiLamBuocTiepTheo: center.nextOwner, nguoiHoTro: center.nextParty },
        lichSu: contactEvidence(history), soBanGhiDuocCungCap: history.length, soHoSoDaTiepNhan: Number(intakeTotal?.count ?? 0),
        ghiChuNguoiDung: data.note, hinhThucNguoiDungChon: data.channel,
      });
      return json(result, result.status);
    }
    if (data.from > data.to || (Date.parse(data.to) - Date.parse(data.from)) / 86_400_000 > 31) {
      return json({ error: "Chọn khoảng thời gian tối đa 31 ngày." }, 400);
    }
    if (data.teamReview && ctx.role !== "head" && ctx.role !== "lead") return json({ error: "Chỉ Trưởng nhóm và Trưởng khối được tổng hợp họp nhóm." }, 403);
    const membersInScope = ctx.visible.filter((person) => person.role !== "intake" &&
      (data.teamReview ? !data.team || person.team === data.team : person.email === (data.owner ?? ctx.email)));
    if (!membersInScope.length) return json({ error: "Chưa có nhân sự trong phạm vi tổng hợp." }, 403);
    if (!await allowAccessAttempt("assistant-ai:" + ctx.email, 20)) return json({ error: "Đã dùng 20 lượt trợ lý trong 10 phút. Bạn thử lại sau." }, 429);
    const owners = membersInScope.map((person) => person.email);
    const periodRows = await ctx.db.select().from(records)
      .where(and(inArray(records.owner, owners), gte(records.date, data.from), lte(records.date, data.to)));
    const centers = await ctx.db.select().from(records).where(and(eq(records.kind, "partner"), inArray(records.owner, owners)));
    const plans = await ctx.db.select().from(kpiPlans).where(and(inArray(kpiPlans.owner, owners), eq(kpiPlans.quarter, quarterOf(data.to))));
    const report = membersInScope.map((person) => {
      const personRows = periodRows.filter((record) => record.kind === "logwork" ? record.owner === person.email : (record.performedBy ?? record.owner) === person.email);
      const plan = plans.find((item) => item.owner === person.email);
      return {
        nhanSu: person.name, nhom: person.team, vaiTro: person.role,
        luotLienHe: personRows.filter((record) => record.kind === "activity").length,
        hoSoTiepNhanTrongKy: periodRows.filter((record) => record.owner === person.email && record.kind === "intake").length,
        trungTamQuaHen: centers.filter((center) => center.owner === person.email && center.followupDate && center.followupDate <= today()).length,
        hoatDong: contactEvidence(personRows).slice(0, 5),
        keHoach: plan ? { quy: plan.quarter, chiTieu: personalTargets(person.role as "head" | "lead" | "sale"), daDatChuan: plan.actual,
          nguonConDuKien: [0, 1].map((index) => plan.sources.filter((source) => source.date >= today()).reduce((sum, source) => sum + source.counts[index], 0)) } : null,
      };
    });
    const result = await weeklyAssistance({ tuNgay: data.from, denNgay: data.to, ngayHienTai: today(), nhanSu: report.slice(0, 30), tongNhanSu: report.length }, data.teamReview);
    return json(result, result.status);
  }
  if (data.action === "analyze-plan") {
    const member = ctx.visible.find((person) => person.email === data.owner);
    if (ctx.role === "intake" || !member || member.role === "intake") return json({ error: "Bạn không có quyền phân tích kế hoạch này." }, 403);
    const ids = [...new Set(data.plan.sources.map((source) => source.centerId))];
    if (ids.length) {
      const centers = await ctx.db.select({ id: records.id }).from(records)
        .where(and(eq(records.kind, "partner"), eq(records.owner, data.owner), inArray(records.id, ids)));
      if (centers.length !== ids.length) return json({ error: "Nguồn dự kiến không thuộc nhân sự đã chọn. Hãy tải lại dữ liệu." }, 400);
    }
    if (!process.env.DEEPSEEK_API_KEY?.trim()) return json({ error: "Chưa cấu hình dịch vụ AI cho hệ thống." }, 503);
    if (!await allowAccessAttempt("plan-ai:" + ctx.email, 5)) return json({ error: "Bạn đã dùng 5 lượt phân tích trong 10 phút. Hãy thử lại sau." }, 429);
    const observationRows = await ctx.db.select().from(records).where(eq(records.owner, data.owner));
    const observation = partnerOutcomes(today(), data.plan.settings?.leadDays ?? 14,
      observationRows.filter((record) => record.kind === "partner"), observationRows);
    const result = await analyzeKpiPlan(data.plan, ctx.salesMode ? "sale" : member.role, today(), observation);
    return json(result, result.status);
  }
  if (data.action === "kpi-plan") {
    if (ctx.role === "intake" || !ctx.visible.some((person) => person.email === ctx.email)) {
      return json({ error: "Bạn không có quyền lưu kế hoạch KPI." }, 403);
    }
    const { quarter, version, actual, sources, settings } = data.plan;
    const ids = [...new Set([...sources.map((source) => source.centerId), ...(settings?.centers.map((center) => center.centerId) ?? [])])];
    if (ids.length) {
      const centers = await ctx.db.select({ id: records.id }).from(records)
        .where(and(eq(records.kind, "partner"), eq(records.owner, ctx.email), inArray(records.id, ids)));
      if (centers.length !== ids.length) return json({ error: "Hãy chọn trung tâm bạn đang phụ trách." }, 400);
    }
    const saved = version === 0
      ? await ctx.db.insert(kpiPlans).values({ owner: ctx.email, quarter, version: 1, actual, sources, settings })
        .onConflictDoNothing().returning({ version: kpiPlans.version })
      : await ctx.db.update(kpiPlans).set({ actual, sources, settings, version: version + 1 })
        .where(and(eq(kpiPlans.owner, ctx.email), eq(kpiPlans.quarter, quarter), eq(kpiPlans.version, version)))
        .returning({ version: kpiPlans.version });
    return saved.length ? json({ ok: true }) : json({ error: "Kế hoạch vừa thay đổi. Hãy tải lại trang trước khi lưu." }, 409);
  }
  if (ctx.role === "intake" && data.action !== "change-passcode") {
    if (data.action !== "record") {
      return json({ error: "Nhân viên hồ sơ chỉ được tạo và chỉnh sửa hồ sơ tiếp nhận." }, 403);
    }
    const parsedRecord = recordInput.safeParse(data.record);
    if (!parsedRecord.success) return json({ error: "Thông tin hồ sơ không hợp lệ." }, 400);
    const { id, version, kind, title, date, status, notes, intakeChecklist, partnerId } = parsedRecord.data;
    if (kind !== "intake") return json({ error: "Nhân viên hồ sơ chỉ được tạo và chỉnh sửa hồ sơ tiếp nhận." }, 403);
    if (!id) {
      const center = partnerId ? await ctx.db.select({ owner: records.owner, title: records.title }).from(records)
        .where(and(eq(records.id, partnerId), eq(records.kind, "partner"))).get() : null;
      if (!center) return json({ error: "Hãy chọn một trung tâm B2B đã có." }, 400);
      await ctx.db.insert(records).values({ id: crypto.randomUUID(), kind, title, date, status, notes, intakeChecklist,
        owner: center.owner, partnerId, partner: center.title });
      return json({ ok: true });
    }
    if (!version) return json({ error: "Hãy tải lại hồ sơ trước khi cập nhật." }, 409);
    const updated = await ctx.db.update(records).set({ title, date, status, notes, intakeChecklist, version: version + 1 })
      .where(and(eq(records.id, id), eq(records.kind, "intake"), eq(records.version, version)))
      .returning({ id: records.id });
    return updated.length ? json({ ok: true }) : json({ error: "Hồ sơ vừa thay đổi hoặc không còn tồn tại. Hãy tải lại trang." }, 409);
  }
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
  if (data.action === "team-create" || data.action === "team-rename" || data.action === "team-status") {
    if (!ctx.admin) return json({ error: "Chỉ Admin được quản lý team." }, 403);
    if (data.action === "team-create") {
      const result = await ctx.db.run(sql`INSERT INTO team_directory (name)
        SELECT ${data.name} WHERE NOT EXISTS (SELECT 1 FROM team_directory WHERE name = ${data.name} COLLATE NOCASE)`);
      return result.rowsAffected ? json({ ok: true }) : json({ error: "Tên team đã có trong danh mục." }, 409);
    }
    if (data.action === "team-rename") {
      const result = await ctx.db.update(teamDirectory).set({ name: data.name })
        .where(and(eq(teamDirectory.name, data.team), sql`NOT EXISTS (
          SELECT 1 FROM team_directory AS other WHERE other.name = ${data.name} COLLATE NOCASE AND other.name <> ${data.team}
        )`)).returning();
      return result.length ? json({ ok: true }) : json({ error: "Tên team đã được dùng hoặc team vừa thay đổi. Hãy tải lại trang." }, 409);
    }
    const result = await ctx.db.update(teamDirectory).set({ active: data.active })
      .where(and(eq(teamDirectory.name, data.team), data.active ? undefined : sql`NOT EXISTS (
        SELECT 1 FROM members WHERE team = ${data.team}
      )`)).returning();
    return result.length ? json({ ok: true }) : json({ error: "Team vừa thay đổi hoặc vẫn còn nhân sự. Hãy chuyển nhân sự sang team khác trước." }, 409);
  }
  if (data.action === "member") {
    if (!ctx.admin) return json({ error: "Chỉ quản trị viên được quản lý nhân sự." }, 403);
    const input = memberInput.safeParse(data.member);
    if (!input.success) return json({ error: "Kiểm tra email, tên và team của nhân sự." }, 400);
    const member = input.data;
    try {
      await ctx.db.insert(members).values(member).onConflictDoUpdate({
        target: members.email, set: { name: member.name, role: member.role, team: member.team },
      });
    } catch (error) {
      if (databaseRejected(error, "active_team_required")) {
        return json({ error: "Hãy chọn một team đang hoạt động trong danh mục." }, 409);
      }
      throw error;
    }
    return json({ ok: true });
  }

  if ("demoAs" in data && data.demoAs) return json({ error: "Hãy tải lại trang trước khi tiếp tục." }, 403);
  const permitted = ctx.visible.map((member) => member.email);

  if (data.action === "followup" || data.action === "next-step") {
    const nextOwner = data.nextOwner ?? (data.nextDate ? "self" : "none");
    if (Boolean(data.nextAction) !== Boolean(data.nextDate)) {
      return json({ error: "Hãy nhập cả việc cần làm và ngày follow-up, hoặc để trống cả hai." }, 400);
    }
    if ((nextOwner === "none") !== !Boolean(data.nextAction) || (nextOwner === "support" && !data.nextParty?.trim())) {
      return json({ error: "Chọn người làm bước tiếp theo, nội dung, ngày hẹn và tên người hỗ trợ nếu đang chờ hỗ trợ." }, 400);
    }
    const center = await ctx.db.select({ owner: records.owner }).from(records)
      .where(and(eq(records.id, data.centerId), eq(records.kind, "partner"))).get();
    if (!center || !permitted.includes(center.owner)) return json({ error: "Bạn không có quyền cập nhật trung tâm này." }, 403);
    const nextParty = nextOwner === "support" ? data.nextParty!.trim() : null;
    if (data.action === "next-step") {
      const updated = await ctx.db.update(records).set({ nextOwner, nextParty, followupAction: data.nextAction || null,
        followupDate: data.nextDate || null, version: data.version + 1 })
        .where(and(eq(records.id, data.centerId), eq(records.kind, "partner"), eq(records.owner, center.owner), eq(records.version, data.version))).returning();
      return updated.length ? json({ ok: true }) : json({ error: "Trung tâm vừa thay đổi. Hãy tải lại trước khi lưu." }, 409);
    }
    const now = new Date();
    const performedDate = data.performedDate ?? today(now);
    if (performedDate > today(now)) return json({ error: "Ngày thực hiện không được ở tương lai." }, 400);
    const latest = await ctx.db.select({ date: records.date }).from(records)
      .where(and(eq(records.partnerId, data.centerId), eq(records.kind, "activity"))).orderBy(desc(records.date)).limit(1);
    const historicalOnly = Boolean(latest[0] && latest[0].date > performedDate);
    const nextDate = data.nextDate || null;
    const nextAction = data.nextAction || null;
    const condition = "id = ? AND owner = ? AND version = ? AND kind = 'partner'";
    const match = [data.centerId, center.owner, data.version];
    const [activity, updated] = await getClient().batch([
      { sql: `INSERT INTO records
        (id, kind, title, owner, status, date, partner, partner_id, notes, followup_date, followup_action, logged_at, performed_by, next_owner, next_party)
        SELECT ?, 'activity', ?, owner, ?, ?, title, id, ?, ?, ?, ?, ?, ?, ? FROM records WHERE ${condition}`,
        args: [crypto.randomUUID(), data.activity, data.channel, performedDate, data.result, nextDate, nextAction, now.toISOString(), ctx.email, nextOwner, nextParty, ...match] },
      historicalOnly ? { sql: `UPDATE records SET version = version + 1 WHERE ${condition}`, args: match }
        : { sql: `UPDATE records SET followup_date = ?, followup_action = ?, next_owner = ?, next_party = ?, version = version + 1 WHERE ${condition}`,
          args: [nextDate, nextAction, nextOwner, nextParty, ...match] },
    ], "write");
    return activity.rowsAffected === 1 && updated.rowsAffected === 1
      ? json({ ok: true, historicalOnly }) : json({ error: "Hồ sơ vừa thay đổi. Hãy tải lại để xem lịch follow-up mới nhất." }, 409);
  }

  if (data.action === "remove") {
    if (!permitted.length) return json({ error: "Bạn chưa có dữ liệu được cấp quyền." }, 403);
    const support = await ctx.db.select({ id: supportRequests.id }).from(supportRequests).where(eq(supportRequests.centerId, data.id)).get();
    if (support) return json({ error: "Trung tâm có lịch sử yêu cầu hỗ trợ, cần giữ để đối soát." }, 409);
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
  if (record.kind !== "partner") delete record.province;
  else if (record.province === "") record.province = null;
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
    const createdId = crypto.randomUUID();
    await ctx.db.insert(records).values({ id: createdId, ...record,
      loggedAt: record.kind === "logwork" ? new Date().toISOString() : null });
    if (record.kind === "partner") return json({ ok: true, createdCenterId: createdId });
  }
  return json({ ok: true });
}
