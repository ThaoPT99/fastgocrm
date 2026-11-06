import writeExcelFile from "write-excel-file/universal";
import { appliesToChecklist, checklistGroups, checklistProgress, emptyChecklist, receivedQuantity, residenceChoices, type IntakeChecklist } from "./intake-checklist";

export type IntakeExportRow = {
  id: string;
  title: string;
  center: string;
  owner: string;
  team: string;
  date: string;
  status: string;
  notes: string;
  checklist?: IntakeChecklist | null;
};

function header(labels: string[]) {
  return labels.map((value) => ({ value, fontWeight: "bold" as const, textColor: "#FFFFFF", backgroundColor: "#172C52", height: 25 }));
}

export function intakeWorkbook(rows: IntakeExportRow[]) {
  const summary = rows.map((row) => {
    const checklist = row.checklist ?? emptyChecklist;
    const progress = checklistProgress(checklist);
    return [row.id, row.title, row.center, row.owner, row.team, row.date, row.status,
      residenceChoices.find((choice) => choice.id === checklist.residence)?.label ?? "Chưa chọn",
      progress.completed, progress.total, progress.total - progress.completed,
      { value: row.notes, wrap: true }];
  });
  const details = rows.flatMap((row) => {
    const checklist = row.checklist ?? emptyChecklist;
    return checklistGroups.flatMap((group) => group.items.map((item) => {
      const applies = appliesToChecklist(item, checklist);
      const received = receivedQuantity(item, checklist);
      const shortage = applies ? Math.max(0, item.required - received) : null;
      return [row.id, row.title, group.title, item.label, { value: item.requirement, wrap: true },
        applies ? "Có" : item.residence && !checklist.residence ? "Chưa chọn" : "Không",
        item.unit ?? "bản", item.required, applies || received > 0 ? received : null, shortage];
    }));
  });
  return writeExcelFile([
    {
      sheet: "Hồ sơ tiếp nhận", stickyRowsCount: 1,
      columns: [39, 32, 31, 25, 16, 17, 18, 21, 17, 17, 17, 54].map((width) => ({ width })),
      data: [header(["Mã bản ghi", "Học sinh / hồ sơ", "Trung tâm", "Người phụ trách", "Nhóm", "Ngày tiếp nhận", "Trạng thái", "Giấy tờ cư trú", "Số mục đủ", "Số mục cần", "Số mục thiếu", "Ghi chú"]), ...summary],
    },
    {
      sheet: "Chi tiết giấy tờ", stickyRowsCount: 1,
      columns: [39, 32, 23, 43, 52, 16, 12, 15, 15, 15].map((width) => ({ width })),
      data: [header(["Mã bản ghi", "Học sinh / hồ sơ", "Nhóm giấy tờ", "Giấy tờ", "Yêu cầu", "Áp dụng", "Đơn vị", "Cần", "Đã nhận", "Còn thiếu"]), ...details],
    },
  ]).toBlob();
}
