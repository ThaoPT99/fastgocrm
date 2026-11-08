import { z } from "zod";
import { addDays, partnerOutcomes } from "./plan-monitor";
import { checklistProgress, type IntakeChecklist } from "./intake-checklist";
import type { KpiPlan } from "./kpi-plan";

export const situations = {
  unanswered: { title: "Đối tác chưa phản hồi", content: "Xem lại lần trao đổi gần nhất và kênh đã dùng. Hỏi ngắn xem người phụ trách có thuận tiện trao đổi không. Nếu chưa kết nối được, ghi rõ kết quả và chọn thời điểm liên hệ lại phù hợp." },
  noStudents: { title: "Trung tâm chưa có học sinh phù hợp", content: "Hỏi nhu cầu D2-6 và D4-1, thời điểm dự kiến có ứng viên và điều kiện trung tâm đang cần làm rõ. Chốt thông tin nên gửi thêm và ngày hai bên cùng cập nhật nguồn." },
  existingProvider: { title: "Trung tâm đang làm với đơn vị khác", content: "Tìm hiểu những tiêu chí trung tâm quan tâm và nhu cầu còn chưa được đáp ứng. Giới thiệu thông tin đã được công ty duyệt, hỏi khả năng thử phối hợp với một trường hợp phù hợp và hẹn bước tiếp theo." },
  fees: { title: "Đối tác hỏi phí hoặc chính sách", content: "Xác nhận chương trình và nội dung cần báo giá. Dùng bảng phí, điều kiện và chính sách đã được công ty duyệt. Chuyển câu hỏi vượt thẩm quyền cho Team Lead và hẹn thời điểm phản hồi." },
} as const;
export const situationKeys = ["unanswered", "noStudents", "existingProvider", "fees"] as const;
export type Situation = keyof typeof situations;
export const supportStatuses = ["Mới", "Đang xử lý", "Đã giải quyết"] as const;
export type SupportMessage = { by: string; text: string; at: string };
export type SupportRequest = {
  id: string; centerId: string; requestedBy: string; assignedTo: string; problem: string;
  status: string; messages: SupportMessage[]; version: number; createdAt: string;
};
export type Playbook = { team: string; key: Situation; draft?: string; published?: string | null; version: number; approvedAt?: string | null };
export const supportInput = z.object({
  id: z.string().uuid(), version: z.number().int().positive(),
  note: z.string().trim().min(1).max(2000), status: z.enum(supportStatuses).optional(),
});

type Center = { id?: string; title: string; followupDate?: string | null };
type Record = { kind: string; partnerId?: string | null; date: string; status: string; intakeChecklist?: IntakeChecklist | null };
export function prioritizeCenters(day: string, centers: Center[], records: Record[], plan?: KpiPlan) {
  const waiting = new Set(partnerOutcomes(day, plan?.settings?.leadDays ?? 14, centers, records).awaiting.map((center) => center.id));
  const planned = new Set(plan?.settings?.centers.map((center) => center.centerId));
  const nearSources = new Set(plan?.sources.filter((source) => source.date <= addDays(day, 7)).map((source) => source.centerId));
  return centers.flatMap((center) => {
    if (!center.id) return [];
    const linked = records.filter((record) => record.partnerId === center.id);
    let score = 0;
    const reasons: string[] = [];
    if (center.followupDate && center.followupDate < day) { score += 100; reasons.push("Follow-up quá hạn " + center.followupDate); }
    if (center.followupDate === day) { score += 80; reasons.push("Đến lịch liên hệ hôm nay"); }
    if (linked.some((record) => record.kind === "meeting" && record.status === "Đã lên lịch" && record.date === day)) { score += 70; reasons.push("Có lịch hẹn hôm nay"); }
    if (waiting.has(center.id)) { score += 50; reasons.push("Đã qua mốc chờ gửi hồ sơ"); }
    if (nearSources.has(center.id)) { score += 40; reasons.push("Nguồn dự kiến đã đến hẹn hoặc sắp đến hẹn"); }
    if (linked.some((record) => record.kind === "intake" && checklistProgress(record.intakeChecklist).completed < checklistProgress(record.intakeChecklist).total)) {
      score += 30; reasons.push("Có hồ sơ cần bổ sung giấy tờ");
    }
    if (planned.has(center.id) && !linked.some((record) => record.kind === "activity")) { score += 25; reasons.push("Đã chọn trong kế hoạch, chưa có liên hệ"); }
    if (!center.followupDate) { score += 10; reasons.push("Cần xác định bước liên hệ tiếp theo"); }
    return score ? [{ id: center.id, title: center.title, score, reason: reasons.join(" · "), date: center.followupDate ?? "9999" }] : [];
  }).sort((a, b) => b.score - a.score || a.date.localeCompare(b.date) || a.title.localeCompare(b.title, "vi")).slice(0, 10);
}
