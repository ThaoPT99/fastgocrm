import { crmAiOutput, type PartnerAiMode } from "./ai-contract";
import { requestDeepSeek } from "./deepseek";

type EvidenceRecord = {
  kind: string; title: string; date: string; notes: string; status: string;
  followupAction: string | null; followupDate: string | null;
  partner?: string;
  nextOwner?: string | null; nextParty?: string | null;
};
export function contactEvidence(records: EvidenceRecord[]) {
  return records.filter((record) => record.kind === "activity" || record.kind === "meeting" || record.kind === "logwork")
    .sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30)
    .map((record) => ({
      loai: record.kind, ngay: record.date, noiDung: record.title.slice(0, 180), ketQua: record.notes.slice(0, 700),
      trangThai: record.status, viecTiepTheo: record.followupAction, ngayTiepTheo: record.followupDate,
      vuongMac: record.kind === "logwork" ? record.partner?.slice(0, 700) : undefined,
      nguoiLamBuocTiepTheo: record.nextOwner, nguoiHoTro: record.nextParty,
    }));
}

const outputInstructions = 'Viết tiếng Việt ngắn gọn, văn bản thuần, dễ dùng cho nhân viên mới. Trả JSON {"summary":"tóm tắt","points":["ý hoặc việc cần làm"]}. Nếu soạn tin nhắn thêm "message":"bản nháp tin nhắn"; nếu giúp ghi kết quả thêm "draft":{"activity":"việc đã làm","result":"kết quả","nextAction":"việc tiếp theo hoặc rỗng","nextDate":"YYYY-MM-DD hoặc rỗng"}. Không có dữ liệu thì nói rõ cần bổ sung gì.';

export async function partnerAssistance(mode: PartnerAiMode, data: unknown) {
  const instructions = {
    summary: "Tóm tắt tình hình của một trung tâm từ lịch sử được cung cấp. Nêu nhu cầu, kết quả gần nhất và việc còn chờ xác nhận.",
    prepare: "Chuẩn bị lần liên hệ tới với trung tâm. Đề xuất mục tiêu trao đổi và 2-4 câu hỏi bám theo lịch sử, chỉ ra điều cần xác nhận.",
    message: "Soạn bản nháp tin nhắn lịch sự bằng tiếng Việt cho trung tâm dựa trên mục đích người dùng nhập và lịch sử. Không tự hứa phí, chiết khấu, visa hay lịch nhận hồ sơ. Nếu thiếu xưng hô, dùng Anh/Chị.",
    log: "Biên tập ghi chú người dùng thành hoạt động và kết quả của lần liên hệ vừa làm. Chỉ ghi các việc đã làm có trong ghi chú. Không biến dự định thành việc đã hoàn thành. Chỉ đặt nextDate khi người dùng nêu rõ ngày trong ghi chú; nếu không có lịch mới, giữ lịch cũ được cung cấp hoặc để trống cả hai trường. Không tự bịa ngày.",
  };
  const response = await requestDeepSeek(instructions[mode] + outputInstructions, data, crmAiOutput);
  if ("analysis" in response && response.analysis) {
    if (mode === "message" && !response.analysis.message?.trim()) return { error: "AI chưa tạo được tin nhắn đầy đủ. Bạn thử lại.", status: 503 } as const;
    if (mode === "log" && !response.analysis.draft) return { error: "AI chưa tạo được bản ghi đầy đủ. Bạn thử lại.", status: 503 } as const;
  }
  return response;
}

export async function weeklyAssistance(data: unknown, team: boolean) {
  return requestDeepSeek(
    (team ? "Viết báo cáo công việc tuần cho nhóm, dùng giọng trung tính." : "Viết báo cáo công việc tuần của một nhân viên, dùng giọng trung tính.")
      + " Viết tiếng Việt, 1–3 đoạn văn ngắn, sẵn để sao chép. Nêu kỳ báo cáo, công việc và kết quả đã ghi nhận, vướng mắc và bước tiếp theo nếu có căn cứ. Phân biệt lịch đã hoàn tất với lịch dự kiến, hồ sơ tiếp nhận với hồ sơ đạt chuẩn KPI. Nếu không có hoạt động đã ghi, nêu rõ điều đó. Không dùng danh sách, Markdown hay lời chào. Trả JSON chỉ có trường summary, tối đa 1600 ký tự.",
    data, crmAiOutput,
  );
}
