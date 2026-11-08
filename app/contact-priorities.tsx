import { prioritizeCenters } from "./sales-workflow";
import type { KpiPlan } from "./kpi-plan";
import type { IntakeChecklist } from "./intake-checklist";

export default function ContactPriorities({ day, centers, records, plan, start }: {
  day: string; centers: { id?: string; title: string; followupDate?: string | null }[];
  records: { kind: string; date: string; status: string; partnerId?: string | null; intakeChecklist?: IntakeChecklist | null }[];
  plan?: KpiPlan; start: (id: string, ids: string[]) => void;
}) {
  const priorities = prioritizeCenters(day, centers, records, plan);
  const ids = priorities.map((center) => center.id);
  return <section className="panel policy">
    <div className="sectionHead priorityHeading"><div><h2>Liên hệ ưu tiên hôm nay</h2><p>Tối đa 10 trung tâm, xếp theo lịch đến hạn và các việc đang cần xử lý.</p></div>
      {priorities.length > 0 && <button className="primary" onClick={() => start(ids[0], ids)}>Bắt đầu lượt liên hệ</button>}
    </div>
    {!priorities.length ? <p>Chưa có trung tâm cần ưu tiên từ dữ liệu hiện có.</p> : <ol className="planPriorities">
      {priorities.map((center, index) => <li key={center.id}><div><b>{index + 1}. {center.title}</b><p>{center.reason}</p></div>
        <button onClick={() => start(center.id, ids)}>Mở để xử lý</button></li>)}
    </ol>}
  </section>;
}
