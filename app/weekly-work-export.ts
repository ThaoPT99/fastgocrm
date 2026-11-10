import writeExcelFile from "write-excel-file/universal";
import type { summarizeWeek } from "./weekly-work";

const header = (labels: string[]) => labels.map((value) => ({
  value, fontWeight: "bold" as const, textColor: "#FFFFFF", backgroundColor: "#172C52", height: 26,
}));
const columns = (widths: number[]) => widths.map((width) => ({ width }));

export function weeklyWorkWorkbook(
  summaries: ReturnType<typeof summarizeWeek>,
  centers: ReadonlyMap<string | undefined, string>,
  from: string, to: string, day: string,
) {
  const summary = summaries.map(({ member, days, contacts, centers, internal, intakes, meetings, support }) => [
    member.name, member.team, days.length, contacts.length, centers.length, internal.length,
    intakes.length, meetings.filter((record) => record.status === "Hoàn tất" && record.date <= day).length,
    meetings.length, support.length,
  ]);
  const activities = summaries.flatMap(({ member, activities }) => activities.map((record) => [
    record.date, member.name, member.team, record.kind === "activity" ? "Liên hệ đối tác" : "Việc nội bộ",
    record.kind === "activity" ? centers.get(record.partnerId ?? undefined) ?? record.partner : "",
    { value: record.title, wrap: true }, record.status, { value: record.notes, wrap: true },
    { value: record.kind === "logwork" ? record.partner : "", wrap: true },
  ]));
  return writeExcelFile([
    {
      sheet: "Tổng hợp tuần",
      columns: columns([28, 18, 21, 16, 16, 15, 19, 20, 18, 17]),
      data: [
        header(["BÁO CÁO CÔNG VIỆC TUẦN"]),
        ["Từ ngày", from, "Đến ngày", to],
        ["Ghi nhận đến ngày", to < day ? to : day],
        [],
        header(["Nhân sự", "Team", "Ngày có hoạt động", "Lượt liên hệ", "Trung tâm", "Việc nội bộ",
          "Hồ sơ tiếp nhận", "Lịch hẹn hoàn tất", "Tổng lịch hẹn", "Cần hỗ trợ"]),
        ...summary,
      ],
    },
    {
      sheet: "Chi tiết hoạt động", stickyRowsCount: 1,
      columns: columns([15, 27, 17, 21, 32, 43, 23, 58, 44]),
      data: [
        header(["Ngày", "Nhân sự", "Team", "Loại hoạt động", "Trung tâm", "Công việc", "Trạng thái",
          "Kết quả / ghi chú", "Vướng mắc / cần hỗ trợ"]),
        ...activities,
      ],
    },
  ]).toBlob();
}
