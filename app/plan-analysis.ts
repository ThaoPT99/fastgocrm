import { z } from "zod";
import { defaultOutreach, outreachSchedule, personalTargets, quarterRange, type KpiPlan } from "./kpi-plan";
import type { Role } from "./crm";

export const analysisOutput = z.object({
  summary: z.string().trim().min(1).max(1200),
  actions: z.array(z.object({
    action: z.string().trim().min(1).max(300),
    reason: z.string().trim().min(1).max(500),
  })).min(1).max(4),
  support: z.string().trim().min(1).max(600),
});
export type PlanAnalysis = z.infer<typeof analysisOutput>;

export async function analyzeKpiPlan(plan: KpiPlan, role: Exclude<Role, "intake">, day: string) {
  const key = process.env.DEEPSEEK_API_KEY?.trim();
  if (!key) return { error: "Chưa cấu hình DeepSeek cho hệ thống.", status: 503 } as const;
  const targets = personalTargets(role);
  const { end } = quarterRange(plan.quarter);
  const validSources = plan.sources.filter((source) => source.date >= day && source.date <= end);
  const sourceCounts = targets.map((_, index) => validSources.reduce((sum, source) => sum + source.counts[index], 0));
  const confirmed = targets.map((_, index) => validSources.reduce((sum, source) => sum + (source.confirmed ? source.counts[index] : 0), 0));
  const remaining = targets.map((target, index) => Math.max(0, target - plan.actual[index] - sourceCounts[index]));
  const settings = plan.settings ?? defaultOutreach(plan.quarter, day);
  const schedule = outreachSchedule(plan.quarter, day, remaining, settings);
  const numbers = {
    ngayTinh: day, quy: plan.quarter, thuTuLoaiHoSo: ["D2-6", "D4-1"],
    chiTieu: targets, daDatChuan: plan.actual, nguonConDuKien: sourceCounts, nguonDaXacNhan: confirmed,
    hoSoConThieuNguon: remaining, soNguonQuaHen: plan.sources.filter((source) => source.date < day).length,
    giaDinh: { tyLeGuiPhanTram: settings.conversion, ngayDenLanGuiDau: settings.leadDays, hoSoMoiTrungTamMoi: settings.filesPerCenter },
    ngayBatDau: schedule.from, hanTiepCan: schedule.deadline, soNgayLamViecConLai: schedule.days,
    trungTamCanCoGuiTheoLoai: schedule.centers, trungTamCanTiepCanTheoLoai: schedule.contacts,
    tongTrungTamCanTiepCan: schedule.total, trungTamCanTiepCanMoiNgay: schedule.dailyRequired,
    sucLamMoiNgay: settings.dailyCapacity, khaNangTiepCan: schedule.capacity, thieuLuotTiepCan: schedule.shortfall,
  };
  try {
    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST", signal: AbortSignal.timeout(40_000),
      headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.DEEPSEEK_MODEL?.trim() || "deepseek-flash",
        thinking: { type: "disabled" }, max_tokens: 1600,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "Bạn là trợ lý lập kế hoạch KPI cho Fastgo CRM. Trả lời tiếng Việt, ngắn, dễ hiểu, hỗ trợ nhân viên mới. Dựa đúng số liệu hệ thống đã tính. Các mảng theo thứ tự D2-6 và D4-1. Không tự thay chỉ tiêu, không hứa chắc đạt KPI, không suy diễn tên đối tác hoặc thành tích. Tỷ lệ chuyển đổi và hồ sơ mỗi trung tâm là giả định có thể điều chỉnh. 14 ngày là mốc đến lần gửi đầu, không đảm bảo toàn bộ hồ sơ đạt chuẩn. Lịch thứ Hai đến thứ Sáu chưa trừ ngày lễ. Nếu vượt sức làm hoặc không đủ thời gian, nêu rõ cần hỗ trợ nguồn và ưu tiên nguồn hiện có. Đề xuất 2-3 hành động cụ thể, nêu lý do từ số liệu; không tự tăng giả định để làm đẹp tính khả thi. Nếu đã đủ nguồn, tập trung xác nhận và thu hồ sơ. Trả về JSON đúng dạng {\"summary\":\"nhận xét ngắn\",\"actions\":[{\"action\":\"việc cần làm\",\"reason\":\"lý do\"}],\"support\":\"đề xuất trao đổi với Team Lead\"}. Viết văn bản thuần trong các chuỗi, không Markdown." },
          { role: "user", content: JSON.stringify(numbers) },
        ],
      }),
    });
    if (!response.ok) {
      const error = response.status === 402 ? "Tài khoản DeepSeek chưa đủ số dư. Quản trị viên cần kiểm tra tài khoản."
        : response.status === 401 ? "Khóa DeepSeek không còn hợp lệ. Quản trị viên cần cập nhật cấu hình."
          : "DeepSeek đang bận hoặc chưa xử lý được yêu cầu. Bạn thử lại sau ít phút.";
      return { error, status: 503 } as const;
    }
    const body = await response.json();
    const choice = body.choices?.[0];
    if (choice?.finish_reason !== "stop" || typeof choice?.message?.content !== "string") throw new Error("Incomplete analysis");
    const analysis = analysisOutput.parse(JSON.parse(choice.message.content));
    return { analysis, status: 200 } as const;
  } catch {
    return { error: "Chưa nhận được bản phân tích đầy đủ. Bạn thử lại sau ít phút.", status: 503 } as const;
  }
}
