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
    <section className="panel policy"><h2>Tình hình công việc với đối tác</h2>
      <p>Ghi nhận sau khi gặp, gọi hoặc nhắn đối tác. Mỗi trung tâm có một bước tiếp theo, người cần thực hiện và ngày cần theo dõi.</p></section>
    <div className="salesQueues">
      <SalesQueue title="Đến lượt mình làm" empty="Chưa có việc của bạn đến hạn." items={items("mine")} />
      <SalesQueue title="Đến lúc hỏi lại" empty="Chưa có việc chờ nào tới ngày hỏi lại." items={items("ask")} />
      <SalesQueue title="Đang chờ người khác" empty="Chưa có việc đang chờ đối tác hoặc người hỗ trợ." items={items("waiting")} />
      <SalesQueue title="Việc đã hẹn sắp tới" empty="Chưa có việc cá nhân được hẹn cho ngày tới." items={items("upcoming")} />
    </div>
    {unplanned.length > 0 && <details className="panel policy"><summary>Trung tâm chưa xác định bước tiếp theo · {unplanned.length}</summary>
      <SalesQueue title="Cần xác định bước tiếp theo" empty="" items={unplanned} /></details>}
  </>;
}
