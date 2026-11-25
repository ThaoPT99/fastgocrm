export const partnerTypes = {
  student: "Học sinh trực tiếp",
  collaborator: "Cộng tác viên tuyển sinh",
  organization: "Đơn vị tư vấn du học",
  teacher: "Giáo viên kết nối",
} as const;

export type PartnerType = keyof typeof partnerTypes;
