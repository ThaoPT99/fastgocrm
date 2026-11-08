import { prioritizeCenters } from "./sales-workflow";
import type { KpiPlan } from "./kpi-plan";
import type { IntakeChecklist } from "./intake-checklist";
import type { NextStep } from "./crm";

export default function ContactPriorities({ day, centers, records, plan, open }: {
  day: string; centers: (NextStep & { id?: string; title: string })[];
  records: { kind: string; date: string; status: string; partnerId?: string | null; intakeChecklist?: IntakeChecklist | null }[];
  plan?: KpiPlan; open: (id: string) => void;
}) {
  const priorities = prioritizeCenters(day, centers, records, plan);
  return <details className="panel policy">
    <summary>Gợi ý trung tâm cần chú ý · {priorities.length}</summary>
    <p>Tối đa 10 trung tâm, kèm lý do để bạn chủ động chọn việc cần xử lý.</p>
    {!priorities.length ? <p>Chưa có trung tâm cần ưu tiên từ dữ liệu hiện có.</p> : <ol className="planPriorities">
      {priorities.map((center, index) => <li key={center.id}><div><b>{index + 1}. {center.title}</b><p>{center.reason}</p></div>
        <button onClick={() => open(center.id)}>Xem tình hình</button></li>)}
    </ol>}
  </details>;
}
