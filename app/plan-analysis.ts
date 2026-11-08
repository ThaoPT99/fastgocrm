import { z } from "zod";
import { requestDeepSeek } from "./deepseek";
import { defaultOutreach, outreachSchedule, personalTargets, quarterRange, type KpiPlan } from "./kpi-plan";
import type { Role } from "./crm";
import type { partnerOutcomes } from "./plan-monitor";

export const analysisOutput = z.object({
  summary: z.string().trim().min(1).max(1200),
  actions: z.array(z.object({
    action: z.string().trim().min(1).max(300),
    reason: z.string().trim().min(1).max(500),
  })).min(1).max(4),
  support: z.string().trim().min(1).max(600),
});
export type PlanAnalysis = z.infer<typeof analysisOutput>;

export async function analyzeKpiPlan(plan: KpiPlan, role: Exclude<Role, "intake">, day: string, observation?: ReturnType<typeof partnerOutcomes>) {
  const key = process.env.DEEPSEEK_API_KEY?.trim();
  if (!key) return { error: "Chưa cấu hình dịch vụ AI cho hệ thống.", status: 503 } as const;
  const targets = personalTargets(role);
  const { end } = quarterRange(plan.quarter);
  const validSources = plan.sources.filter((source) => source.date >= day && source.date <= end);
  const sourceCounts = targets.map((_, index) => validSources.reduce((sum, source) => sum + source.counts[index], 0));
  const confirmed = targets.map((_, index) => validSources.reduce((sum, source) => sum + (source.confirmed ? source.counts[index] : 0), 0));
  const remaining = targets.map((target, index) => Math.max(0, target - plan.actual[index] - sourceCounts[index]));
  const settings = plan.settings ?? defaultOutreach(plan.quarter, day);
  const schedule = outreachSchedule(plan.quarter, day, remaining, settings);
  const numbers = {
    quanSatThucTe: observation ? {
      soTrungTamDaDuThoiGian: observation.mature, guiTrongMocCho: observation.timely,
      guiTre: observation.late, chuaGui: observation.awaiting.length, tyLeGuiTrongMocCho: observation.rate,
      du20TrungTamTheoDoi: observation.sufficient, chuThich: "Tỷ lệ gửi hồ sơ tiếp nhận trong mốc chờ, không phải tỷ lệ hồ sơ đạt chuẩn. Dữ liệu dựa trên lần liên hệ đầu có ghi nhận trong 90 ngày gần nhất.",
    } : undefined,
    ngayTinh: day, quy: plan.quarter, thuTuLoaiHoSo: ["D2-6", "D4-1"],
    chiTieu: targets, daDatChuan: plan.actual, nguonConDuKien: sourceCounts, nguonDaXacNhan: confirmed,
    hoSoConThieuNguon: remaining, soNguonQuaHen: plan.sources.filter((source) => source.date < day).length,
    giaDinh: { tyLeGuiPhanTram: settings.conversion, ngayDenLanGuiDau: settings.leadDays, hoSoMoiTrungTamMoi: settings.filesPerCenter,
      phanBoMoiTrungTam: settings.outputByProgram, cachTinh: settings.outputByProgram ? "Một trung tâm gửi cả hai loại, tổng tiếp cận là trung tâm duy nhất; không cộng hai cột theo loại" : "Hai nhóm trung tâm riêng theo loại hồ sơ" },
    ngayBatDau: schedule.from, hanTiepCan: schedule.deadline, soNgayLamViecConLai: schedule.days,
    trungTamCanCoGuiTheoLoai: schedule.centers, trungTamCanTiepCanTheoLoai: schedule.contacts,
    tongTrungTamCanTiepCan: schedule.total, trungTamCanTiepCanMoiNgay: schedule.dailyRequired,
    sucLamMoiNgay: settings.dailyCapacity, khaNangTiepCan: schedule.capacity, thieuLuotTiepCan: schedule.shortfall,
  };
  return requestDeepSeek("Bạn là trợ lý lập kế hoạch KPI cho Fastgo CRM. Trả lời tiếng Việt, ngắn, dễ hiểu, hỗ trợ nhân viên mới. Dựa đúng số liệu hệ thống đã tính. Các mảng theo thứ tự D2-6 và D4-1. Không tự thay chỉ tiêu, không hứa chắc đạt KPI, không suy diễn tên đối tác hoặc thành tích. Tỷ lệ chuyển đổi và hồ sơ mỗi trung tâm là giả định có thể điều chỉnh. 14 ngày là mốc đến lần gửi đầu, không đảm bảo toàn bộ hồ sơ đạt chuẩn. Lịch thứ Hai đến thứ Sáu chưa trừ ngày lễ. Nếu vượt sức làm hoặc không đủ thời gian, nêu rõ cần hỗ trợ nguồn và ưu tiên nguồn hiện có. Đề xuất 2-3 hành động cụ thể, nêu lý do từ số liệu; không tự tăng giả định để làm đẹp tính khả thi. Nếu đã đủ nguồn, tập trung xác nhận và thu hồ sơ. Trả về JSON đúng dạng {\"summary\":\"nhận xét ngắn\",\"actions\":[{\"action\":\"việc cần làm\",\"reason\":\"lý do\"}],\"support\":\"đề xuất trao đổi với Team Lead\"}. Viết văn bản thuần trong các chuỗi, không Markdown.", numbers, analysisOutput);
}
