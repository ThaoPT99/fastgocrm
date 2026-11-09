import { nextOwnerOf, nextStepGroup, type NextStep } from "./crm";
import SalesQueue from "./sales-queue";

export default function WorkNextSteps({ day, centers, open }: {
  day: string; centers: (NextStep & { id?: string; title: string })[]; open: (id: string) => void;
}) {
  const items = (group: ReturnType<typeof nextStepGroup>) => centers.filter((center) => center.id && nextStepGroup(center, day) === group)
    .sort((a, b) => (a.followupDate ?? "9999").localeCompare(b.followupDate ?? "9999"))
    .map((center) => ({ id: center.id!, title: center.title,
      detail: [center.followupAction, nextOwnerOf(center) === "support" ? center.nextParty : nextOwnerOf(center) === "partner" ? "Chờ đối tác" : "",
        center.followupDate].filter(Boolean).join(" · "),
      badge: group === "ask" ? "Đến ngày hỏi lại" : group === "mine" && center.followupDate && center.followupDate < day ? "Quá hạn" : undefined,
      urgent: group === "ask" || Boolean(group === "mine" && center.followupDate && center.followupDate < day),
      open: () => open(center.id!),
    }));
  const unplanned = items("unplanned");
  return <>
    <div className="salesQueues">
      <SalesQueue title="Cần làm" empty="Chưa có việc đến hạn." items={items("mine")} />
      <SalesQueue title="Cần hỏi lại" empty="Chưa tới ngày hỏi lại." items={items("ask")} />
      <SalesQueue title="Đang chờ" empty="Chưa có việc đang chờ." items={items("waiting")} />
    </div>
    <details className="panel policy compactDetails"><summary>Việc đã hẹn sắp tới</summary>
      <SalesQueue title="Việc sắp tới" empty="Chưa có lịch sắp tới." items={items("upcoming")} /></details>
    {unplanned.length > 0 && <details className="panel policy"><summary>Trung tâm chưa xác định bước tiếp theo · {unplanned.length}</summary>
      <SalesQueue title="Cần xác định bước tiếp theo" empty="" items={unplanned} /></details>}
  </>;
}
