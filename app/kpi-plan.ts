import { z } from "zod";
import type { Role } from "./crm";

export const programs = ["D2-6", "D4-1"] as const;
export const personalTargets = (role: Exclude<Role, "intake">) => role === "sale" ? [31, 62] as const : [25, 50] as const;
const count = z.number().int().min(0).max(9999);
const counts = z.tuple([count, count]);
const quarterPattern = /^20\d{2}-Q[1-4]$/;
export const planInput = z.object({
  quarter: z.string().regex(quarterPattern),
  version: z.number().int().min(0),
  actual: counts,
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
  for (const source of plan.sources) {
    if (centers.has(source.centerId) || source.date < start || source.date > end || !source.counts.some(Boolean)) {
      ctx.addIssue({ code: "custom", message: "Mỗi trung tâm cần số hồ sơ dự kiến và ngày trong quý, mỗi trung tâm chỉ ghi một lần." });
      return;
    }
    centers.add(source.centerId);
  }
});

export type KpiPlan = z.infer<typeof planInput>;

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
