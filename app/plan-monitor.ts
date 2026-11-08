import { defaultOutreach, outreachSchedule, personalTargets, type KpiPlan } from "./kpi-plan";
import type { Role } from "./crm";

export type MonitorRecord = { kind: string; partnerId?: string | null; date: string };
export type MonitorCenter = { id?: string; title: string };

export function addDays(day: string, amount: number) {
  const date = new Date(day + "T00:00:00Z");
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

export function partnerOutcomes(day: string, leadDays: number, centers: MonitorCenter[], records: MonitorRecord[]) {
  const ids = new Set(centers.map((center) => center.id));
  const firstContact = new Map<string, string>();
  const firstReceipt = new Map<string, string>();
  for (const record of records) {
    if (!record.partnerId || !ids.has(record.partnerId) || record.date > day) continue;
    const map = record.kind === "activity" ? firstContact : record.kind === "intake" ? firstReceipt : undefined;
    if (map && (!map.has(record.partnerId) || record.date < map.get(record.partnerId)!)) map.set(record.partnerId, record.date);
  }
  const since = addDays(day, -90);
  const cohort = centers.flatMap((center) => {
    if (!center.id) return [];
    const contact = firstContact.get(center.id);
    const receipt = firstReceipt.get(center.id);
    if (!contact || contact < since || (receipt && receipt < contact)) return [];
    const due = addDays(contact, leadDays);
    return [{ id: center.id, title: center.title, contact, due, receipt }];
  });
  const mature = cohort.filter((center) => center.due <= day);
  const timely = mature.filter((center) => center.receipt && center.receipt <= center.due);
  const late = mature.filter((center) => center.receipt && center.receipt > center.due);
  const awaiting = mature.filter((center) => !center.receipt).sort((a, b) => a.due.localeCompare(b.due));
  return { since, through: addDays(day, -leadDays), mature: mature.length, timely: timely.length, late: late.length,
    awaiting, stillWaiting: cohort.length - mature.length,
    rate: mature.length ? Math.round(timely.length * 100 / mature.length) : null,
    sufficient: mature.length >= 20 };
}

export function monitorPlan(day: string, role: Exclude<Role, "intake">, plan: KpiPlan, centers: MonitorCenter[], records: MonitorRecord[]) {
  const settings = plan.settings ?? defaultOutreach(plan.quarter, day);
  const targets = personalTargets(role);
  const ids = new Set(centers.map((center) => center.id));
  const gap = targets.map((target, index) => Math.max(0, target - plan.actual[index]));
  const active = plan.sources.filter((source) => ids.has(source.centerId) && source.date >= day);
  const remaining = gap.map((amount, index) => Math.max(0, amount - active.reduce((sum, source) => sum + source.counts[index], 0)));
  const schedule = outreachSchedule(plan.quarter, day, remaining, settings);
  const outcomes = partnerOutcomes(day, settings.leadDays, centers, records);
  const expired = plan.sources.filter((source) => ids.has(source.centerId) && source.date < day &&
    source.counts.some((count, index) => count > 0 && gap[index] > 0));
  const conversionBehind = outcomes.sufficient && outcomes.rate !== null && outcomes.rate <= settings.conversion - 10;
  return { outcomes, expired, remaining, schedule, conversionBehind };
}
