import { integer, sqliteTable, text, index, primaryKey, type AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import type { IntakeChecklist } from "../app/intake-checklist";
import type { KpiPlan } from "../app/kpi-plan";

export const members = sqliteTable("members", {
  email: text().primaryKey(),
  name: text().notNull(),
  role: text({ enum: ["head", "lead", "sale", "intake"] }).notNull(),
  team: text().notNull(),
});

export const kpiPlans = sqliteTable("kpi_plans", {
  owner: text().notNull().references(() => members.email),
  quarter: text().notNull(),
  version: integer().notNull(),
  actual: text({ mode: "json" }).$type<KpiPlan["actual"]>().notNull(),
  sources: text({ mode: "json" }).$type<KpiPlan["sources"]>().notNull(),
  settings: text({ mode: "json" }).$type<KpiPlan["settings"]>(),
}, (table) => [primaryKey({ columns: [table.owner, table.quarter] })]);

export const records = sqliteTable("records", {
  id: text().primaryKey(),
  kind: text().notNull(),
  title: text().notNull(),
  owner: text().notNull().references(() => members.email),
  status: text().notNull(),
  date: text().notNull(),
  partner: text().notNull(),
  province: text(),
  partnerId: text("partner_id").references((): AnySQLiteColumn => records.id, { onDelete: "restrict" }),
  followupDate: text("followup_date"),
  followupAction: text("followup_action"),
  loggedAt: text("logged_at"),
  performedBy: text("performed_by"),
  intakeChecklist: text("intake_checklist", { mode: "json" }).$type<IntakeChecklist>(),
  notes: text().notNull(),
  version: integer().notNull().default(1),
}, (table) => [
  index("records_owner_idx").on(table.owner),
  index("records_partner_idx").on(table.partnerId),
]);

export const demoInstalls = sqliteTable("demo_installs", {
  key: text().primaryKey(),
});

export const accessCodes = sqliteTable("access_codes", {
  email: text().primaryKey().references(() => members.email, { onDelete: "cascade" }),
  digest: text().notNull().unique(),
});

export const accessSessions = sqliteTable("access_sessions", {
  digest: text().primaryKey(),
  email: text().notNull().references(() => accessCodes.email, { onDelete: "cascade" }),
  codeDigest: text("code_digest").notNull(),
  expiresAt: integer("expires_at").notNull(),
}, (table) => [index("access_sessions_email_idx").on(table.email), index("access_sessions_expiry_idx").on(table.expiresAt)]);

export const accessLimits = sqliteTable("access_limits", {
  key: text().primaryKey(),
  window: integer().notNull(),
  attempts: integer().notNull(),
});

export const adminSessions = sqliteTable("admin_sessions", {
  digest: text().primaryKey(),
  expiresAt: integer("expires_at").notNull(),
  keyDigest: text("key_digest").notNull(),
});
