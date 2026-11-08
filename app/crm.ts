export const categories = {
  partner: "Đối tác B2B",
  task: "Công việc",
  activity: "Nhật ký liên hệ",
  meeting: "Lịch hẹn",
  intake: "Hồ sơ tiếp nhận",
  logwork: "Nhật ký làm việc",
} as const;

export const followupChannels = ["Cuộc gọi", "Cuộc gặp", "Tin nhắn", "Gửi tài liệu", "Khác"] as const;
export const nextOwners = { self: "Người phụ trách trung tâm", partner: "Chờ đối tác", support: "Chờ người hỗ trợ", none: "Chưa có bước tiếp theo" } as const;
export type NextOwner = keyof typeof nextOwners;
export type NextStep = { nextOwner?: NextOwner | null; nextParty?: string | null; followupDate?: string | null; followupAction?: string | null };
export function nextOwnerOf(step: NextStep): NextOwner {
  return step.nextOwner ?? (step.followupDate ? "self" : "none");
}
export function nextStepGroup(step: NextStep, day: string) {
  const owner = nextOwnerOf(step);
  if (owner === "none") return "unplanned";
  if (owner !== "self") return step.followupDate && step.followupDate <= day ? "ask" : "waiting";
  return step.followupDate && step.followupDate > day ? "upcoming" : "mine";
}

export const statuses = {
  partner: ["Tiềm năng", "Đang trao đổi", "Đang hợp tác"],
  task: ["Mới", "Đang xử lý", "Hoàn tất"],
  activity: [...followupChannels, "Email"],
  meeting: ["Đã lên lịch", "Hoàn tất", "Đã hủy"],
  intake: ["Mới", "Đang xử lý", "Hoàn tất"],
  logwork: ["Đã cập nhật", "Cần hỗ trợ"],
} as const;

export const roles = { head: "Trưởng khối", lead: "Trưởng nhóm", sale: "Sales", intake: "Nhân viên hồ sơ" } as const;
export type Kind = keyof typeof categories;
export type Role = keyof typeof roles;
export const partnerActivityKinds = ["task", "activity", "meeting", "intake"] as const;

export function needsPartner(kind: string) {
  return (partnerActivityKinds as readonly string[]).includes(kind);
}

export function isDemoEmail(email: string) {
  return email.endsWith("@fastgo.example");
}

export function today(date = new Date()) {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Ho_Chi_Minh" }).format(date);
}
