const residenceChoices = [
  { id: "household", label: "Hộ khẩu" },
  { id: "residence", label: "Xác nhận cư trú" },
] as const;

type Residence = (typeof residenceChoices)[number]["id"];
export type IntakeChecklist = {
  residence: Residence | "";
  optional: string[];
  checked: string[];
};

type Item = {
  id: string;
  label: string;
  requirement: string;
  residence?: Residence;
  optional?: boolean;
};

export const checklistGroups: { title: string; items: Item[] }[] = [
  { title: "Giấy tờ học sinh", items: [
    { id: "birth", label: "Giấy khai sinh", requirement: "3 bản sao hoặc bản photo công chứng" },
    { id: "household", label: "Hộ khẩu", requirement: "3 bản công chứng", residence: "household" },
    { id: "residence", label: "Xác nhận cư trú", requirement: "2 bản gốc có dấu đỏ, xác nhận cư trú tại địa phương trên 1 năm", residence: "residence" },
    { id: "id", label: "Căn cước công dân", requirement: "3 bản công chứng" },
    { id: "high-diploma-original", label: "Bằng tốt nghiệp THPT · Bản gốc", requirement: "1 bản gốc" },
    { id: "high-diploma-copy", label: "Bằng tốt nghiệp THPT · Bản photo", requirement: "3 bản photo không công chứng" },
    { id: "school-record-original", label: "Học bạ · Bản gốc", requirement: "1 bản gốc" },
    { id: "school-record-copy", label: "Học bạ · Bản photo", requirement: "3 bản photo không công chứng" },
    { id: "degree-original", label: "Bằng ĐH/CĐ/Trung cấp · Bản gốc", requirement: "1 bản gốc", optional: true },
    { id: "degree-copy", label: "Bằng ĐH/CĐ/Trung cấp · Bản photo", requirement: "3 bản photo không công chứng", optional: true },
    { id: "transcript-original", label: "Bảng điểm ĐH/CĐ/Trung cấp · Bản gốc", requirement: "1 bản gốc", optional: true },
    { id: "transcript-copy", label: "Bảng điểm ĐH/CĐ/Trung cấp · Bản photo", requirement: "3 bản photo không công chứng", optional: true },
    { id: "passport", label: "Hộ chiếu", requirement: "1 bản gốc" },
    { id: "photo-small", label: "Ảnh 3,5 × 4,5", requirement: "5 ảnh nền trắng" },
    { id: "photo-large", label: "Ảnh 4 × 6", requirement: "5 ảnh nền trắng" },
  ] },
  { title: "Giấy tờ cha mẹ", items: [
    { id: "father-id", label: "Căn cước công dân của bố", requirement: "3 bản công chứng" },
    { id: "mother-id", label: "Căn cước công dân của mẹ", requirement: "3 bản công chứng" },
    { id: "land", label: "Giấy tờ nhà đất", requirement: "3 bản công chứng mỗi giấy tờ áp dụng", optional: true },
    { id: "parents-work", label: "Giấy tờ công việc của cha mẹ", requirement: "3 bản công chứng mỗi giấy tờ áp dụng, như đăng ký kinh doanh hoặc biên lai thuế", optional: true },
  ] },
  { title: "Giấy tờ phát sinh", items: [
    { id: "extra", label: "Giấy tờ bổ sung theo hồ sơ", requirement: "3 bản công chứng mỗi giấy tờ. Ghi rõ tên giấy tờ ở phần Ghi chú.", optional: true },
  ] },
];

export { residenceChoices };
export const emptyChecklist: IntakeChecklist = { residence: "", optional: [], checked: [] };
const items = checklistGroups.flatMap((group) => group.items);
export const checklistItemIds = new Set(items.map((item) => item.id));
export const checklistOptionalIds = new Set(items.filter((item) => item.optional).map((item) => item.id));

export function checklistProgress(checklist: IntakeChecklist | null | undefined) {
  const current = checklist ?? emptyChecklist;
  const applicable = items.filter((item) => (!item.optional || current.optional.includes(item.id))
    && (!item.residence || current.residence === item.residence));
  const completed = applicable.filter((item) => current.checked.includes(item.id)).length;
  return { completed, total: applicable.length + (current.residence ? 0 : 1) };
}
