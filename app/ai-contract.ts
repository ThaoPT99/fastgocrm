import { z } from "zod";

export const partnerAiModes = {
  summary: "Tóm tắt tình hình",
  prepare: "Chuẩn bị lần liên hệ",
  message: "Soạn tin nhắn",
  log: "Giúp tôi ghi kết quả",
} as const;
export type PartnerAiMode = keyof typeof partnerAiModes;
export const crmAiOutput = z.object({
  summary: z.string().trim().min(1).max(1800),
  points: z.array(z.string().trim().min(1).max(600)).max(30).default([]),
  message: z.string().max(2500).nullish().transform((value) => value ?? undefined),
  draft: z.object({
    activity: z.string().trim().min(1).max(180),
    result: z.string().trim().min(1).max(4000),
    nextAction: z.string().trim().max(180).nullish().transform((value) => value ?? ""),
    nextDate: z.union([z.string().date(), z.literal("")]).nullish().transform((value) => value ?? ""),
  }).nullish().transform((value) => value ?? undefined),
});
export type CrmAiOutput = z.infer<typeof crmAiOutput>;

export function currentWeek(day: string) {
  const date = new Date(day + "T00:00:00Z");
  date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7);
  return date.toISOString().slice(0, 10);
}
