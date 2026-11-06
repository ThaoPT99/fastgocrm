const residenceChoices = [
  { id: "household", label: "Hộ khẩu" },
  { id: "residence", label: "Xác nhận cư trú" },
] as const;

type Residence = (typeof residenceChoices)[number]["id"];
export type IntakeChecklist = {
  residence: Residence | "";
  optional: string[];
  checked: string[];
  received?: Record<string, number>;
};

type Item = {
  id: string;
  label: string;
  requirement: string;
  required: number;
  unit?: "ảnh";
  residence?: Residence;
  optional?: boolean;
};

export const checklistGroups: { title: string; items: Item[] }[] = [
  { title: "Giấy tờ học sinh", items: [
    { id: "birth", label: "Giấy khai sinh", requirement: "3 bản sao hoặc bản photo công chứng", required: 3 },
    { id: "household", label: "Hộ khẩu", requirement: "3 bản công chứng", required: 3, residence: "household" },
    { id: "residence", label: "Xác nhận cư trú", requirement: "2 bản gốc có dấu đỏ, xác nhận cư trú tại địa phương trên 1 năm", required: 2, residence: "residence" },
    { id: "id", label: "Căn cước công dân", requirement: "3 bản công chứng", required: 3 },
    { id: "high-diploma-original", label: "Bằng tốt nghiệp THPT · Bản gốc", requirement: "1 bản gốc", required: 1 },
    { id: "high-diploma-copy", label: "Bằng tốt nghiệp THPT · Bản photo", requirement: "3 bản photo không công chứng", required: 3 },
    { id: "school-record-original", label: "Học bạ · Bản gốc", requirement: "1 bản gốc", required: 1 },
    { id: "school-record-copy", label: "Học bạ · Bản photo", requirement: "3 bản photo không công chứng", required: 3 },
    { id: "degree-original", label: "Bằng ĐH/CĐ/Trung cấp · Bản gốc", requirement: "1 bản gốc", required: 1, optional: true },
    { id: "degree-copy", label: "Bằng ĐH/CĐ/Trung cấp · Bản photo", requirement: "3 bản photo không công chứng", required: 3, optional: true },
    { id: "transcript-original", label: "Bảng điểm ĐH/CĐ/Trung cấp · Bản gốc", requirement: "1 bản gốc", required: 1, optional: true },
    { id: "transcript-copy", label: "Bảng điểm ĐH/CĐ/Trung cấp · Bản photo", requirement: "3 bản photo không công chứng", required: 3, optional: true },
    { id: "passport", label: "Hộ chiếu", requirement: "1 bản gốc", required: 1 },
    { id: "photo-small", label: "Ảnh 3,5 × 4,5", requirement: "5 ảnh nền trắng", required: 5, unit: "ảnh" },
    { id: "photo-large", label: "Ảnh 4 × 6", requirement: "5 ảnh nền trắng", required: 5, unit: "ảnh" },
  ] },
  { title: "Giấy tờ cha mẹ", items: [
    { id: "father-id", label: "Căn cước công dân của bố", requirement: "3 bản công chứng", required: 3 },
    { id: "mother-id", label: "Căn cước công dân của mẹ", requirement: "3 bản công chứng", required: 3 },
    { id: "land", label: "Giấy tờ nhà đất", requirement: "3 bản công chứng mỗi giấy tờ áp dụng", required: 3, optional: true },
    { id: "parents-work", label: "Giấy tờ công việc của cha mẹ", requirement: "3 bản công chứng mỗi giấy tờ áp dụng, như đăng ký kinh doanh hoặc biên lai thuế", required: 3, optional: true },
  ] },
  { title: "Giấy tờ phát sinh", items: [
    { id: "extra", label: "Giấy tờ bổ sung theo hồ sơ", requirement: "3 bản công chứng mỗi giấy tờ. Ghi rõ tên giấy tờ ở phần Ghi chú.", required: 3, optional: true },
  ] },
];

export { residenceChoices };
export const emptyChecklist: IntakeChecklist = { residence: "", optional: [], checked: [] };
const items = checklistGroups.flatMap((group) => group.items);
export const checklistItemIds = new Set(items.map((item) => item.id));
export const checklistOptionalIds = new Set(items.filter((item) => item.optional).map((item) => item.id));

export function receivedQuantity(item: Item, checklist: IntakeChecklist) {
  return checklist.received?.[item.id] ?? (checklist.checked.includes(item.id) ? item.required : 0);
}

export function checklistProgress(checklist: IntakeChecklist | null | undefined) {
  const current = checklist ?? emptyChecklist;
  const applicable = items.filter((item) => (!item.optional || current.optional.includes(item.id))
    && (!item.residence || current.residence === item.residence));
  const missing = applicable.flatMap((item) => {
    const shortage = item.required - receivedQuantity(item, current);
    return shortage > 0 ? [{ id: item.id, label: item.label, shortage, unit: item.unit ?? "bản" }] : [];
  });
  const total = applicable.length + (current.residence ? 0 : 1);
  return { completed: applicable.length - missing.length, total, missing, needsResidence: !current.residence };
}
