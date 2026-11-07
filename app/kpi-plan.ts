import { z } from "zod";
import type { Role } from "./crm";

export const programs = ["D2-6", "D4-1"] as const;
export const personalTargets = (role: Exclude<Role, "intake">) => role === "sale" ? [31, 62] as const : [25, 50] as const;
const count = z.number().int().min(0).max(9999);
const counts = z.tuple([count, count]);
const quarterPattern = /^20\d{2}-Q[1-4]$/;
export const outreachSettings = z.object({
  startDate: z.string().date(),
  conversion: z.number().min(1).max(100),
  leadDays: z.number().int().min(1).max(90),
  filesPerCenter: z.number().int().min(1).max(5),
  dailyCapacity: z.number().int().min(1).max(100),
  centers: z.array(z.object({ centerId: z.string().uuid(), program: z.enum(programs) })).max(1000),
});
export const planInput = z.object({
  quarter: z.string().regex(quarterPattern),
  version: z.number().int().min(0),
  actual: counts,
  settings: outreachSettings.nullish(),
  sources: z.array(z.object({
    centerId: z.string().uuid(),
    date: z.string().date(),
    confirmed: z.boolean(),
    counts,
  })).max(200),
}).superRefine((plan, ctx) => {
  if (!quarterPattern.test(plan.quarter)) return;
  const { start, end } = quarterRange(plan.quarter);
  const centers = new Set<string>();
  if (plan.settings) {
    const assigned = plan.settings.centers.map((center) => center.centerId);
    if (plan.settings.startDate < start || plan.settings.startDate > end || new Set(assigned).size !== assigned.length) {
      ctx.addIssue({ code: "custom", message: "Kiểm tra ngày bắt đầu và danh sách trung tâm tiếp cận." });
    }
  }
  for (const source of plan.sources) {
    if (centers.has(source.centerId) || source.date < start || source.date > end || !source.counts.some(Boolean)) {
      ctx.addIssue({ code: "custom", message: "Mỗi trung tâm cần số hồ sơ dự kiến và ngày trong quý, mỗi trung tâm chỉ ghi một lần." });
      return;
    }
    centers.add(source.centerId);
  }
  if (plan.settings?.centers.some((center) => centers.has(center.centerId))) {
    ctx.addIssue({ code: "custom", message: "Trung tâm đã có nguồn dự kiến được theo dõi ở phần nguồn hiện có." });
  }
});

export type KpiPlan = z.infer<typeof planInput>;
export type OutreachSettings = z.infer<typeof outreachSettings>;

export function defaultOutreach(quarter: string, day: string): OutreachSettings {
  const { start, end } = quarterRange(quarter);
  return { startDate: day < start ? start : day > end ? end : day, conversion: 50, leadDays: 14,
    filesPerCenter: 1, dailyCapacity: 3, centers: [] };
}

function shiftDay(day: string, amount: number) {
  const date = new Date(day + "T00:00:00Z");
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

export function outreachSchedule(quarter: string, day: string, gap: readonly number[], settings: OutreachSettings) {
  const { start, end } = quarterRange(quarter);
  const from = [day, start, settings.startDate].sort().at(-1)!;
  const deadline = shiftDay(end, -settings.leadDays);
  const days: string[] = [];
  for (let date = from; date <= deadline; date = shiftDay(date, 1)) {
    const weekday = new Date(date + "T00:00:00Z").getUTCDay();
    if (weekday !== 0 && weekday !== 6) days.push(date);
  }
  const centers = gap.map((count) => Math.ceil(count / settings.filesPerCenter));
  const contacts = centers.map((count) => Math.ceil(count * 100 / settings.conversion));
  const total = contacts.reduce((sum, count) => sum + count, 0);
  const weeks = new Map<string, { date: string; contacts: number[]; days: number }>();
  let allocatedD26 = 0;
  let allocated = 0;
  for (const [index, date] of days.entries()) {
    const cumulative = Math.ceil(total * (index + 1) / days.length);
    const cumulativeD26 = total ? Math.round(cumulative * contacts[0] / total) : 0;
    const d26 = cumulativeD26 - allocatedD26;
    const weekEnd = shiftDay(date, 7 - new Date(date + "T00:00:00Z").getUTCDay());
    const key = weekEnd > end ? end : weekEnd;
    const week = weeks.get(key) ?? { date: key, contacts: [0, 0], days: 0 };
    week.contacts[0] += d26;
    week.contacts[1] += cumulative - allocated - d26;
    week.days++;
    weeks.set(key, week);
    allocatedD26 = cumulativeD26;
    allocated = cumulative;
  }
  const capacity = days.length * settings.dailyCapacity;
  return { from, end, deadline, days: days.length, centers, contacts, total, capacity,
    dailyRequired: days.length ? Math.ceil(total / days.length) : 0,
    shortfall: Math.max(0, total - capacity), weeks: [...weeks.values()] };
}

export function quarterOf(day: string) {
  return day.slice(0, 4) + "-Q" + Math.ceil(Number(day.slice(5, 7)) / 3);
}

export function quarterRange(quarter: string) {
  const year = Number(quarter.slice(0, 4));
  const index = Number(quarter.slice(-1)) - 1;
  return {
    start: new Date(Date.UTC(year, index * 3, 1)).toISOString().slice(0, 10),
    end: new Date(Date.UTC(year, (index + 1) * 3, 0)).toISOString().slice(0, 10),
  };
}

export function weeklyMilestones(from: string, end: string, gap: readonly number[]) {
  const dates: string[] = [];
  const next = new Date(from + "T00:00:00Z");
  let date = from;
  while (date <= end) {
    next.setUTCDate(next.getUTCDate() + (7 - next.getUTCDay()) % 7);
    dates.push(next.toISOString().slice(0, 10) > end ? end : next.toISOString().slice(0, 10));
    next.setUTCDate(next.getUTCDate() + 1);
    date = next.toISOString().slice(0, 10);
  }
  return dates.map((date, index) => ({
    date,
    counts: gap.map((number) => Math.ceil(number * (index + 1) / dates.length) - Math.ceil(number * index / dates.length)),
  }));
}
