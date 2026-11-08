import { quarterOf, type KpiPlan } from "./kpi-plan";
import { monitorPlan, partnerOutcomes, type MonitorCenter, type MonitorRecord } from "./plan-monitor";
import type { Role } from "./crm";

type Center = MonitorCenter & { owner: string };
type Person = { email: string; name: string; role: Role };
type SavedPlan = KpiPlan & { owner: string };
const displayDate = (day: string) => day.split("-").reverse().join("/");

export function LearningObservation({ day, leadDays, centers, records, assumedRate, apply }: {
  day: string; leadDays: number; centers: MonitorCenter[]; records: MonitorRecord[]; assumedRate: number;
  apply?: (rate: number) => void;
}) {
  const observation = partnerOutcomes(day, leadDays, centers, records);
  return <section className="panel policy">
    <h2>Đối chiếu với kết quả tiếp cận thực tế</h2>
    <p>Nhóm trung tâm có lần liên hệ đầu được ghi nhận từ {displayDate(observation.since)} đến {displayDate(observation.through)}. Mỗi trung tâm đã qua đủ {leadDays} ngày theo giả định.</p>
    <div className="kpiTargets">
      <div><span>Trung tâm đã đủ thời gian theo dõi</span><strong>{observation.mature}</strong></div>
      <div><span>Gửi trong vòng {leadDays} ngày</span><strong>{observation.timely}</strong></div>
      <div><span>Tỷ lệ gửi quan sát được</span><strong>{observation.rate === null ? "—" : observation.rate + "%"}</strong><span>Giả định kế hoạch · {assumedRate}%</span></div>
    </div>
    <p>{observation.stillWaiting} trung tâm chưa đủ thời gian theo dõi được tách khỏi phép tính. Có {observation.late} trung tâm đã gửi sau mốc chờ.</p>
    {!observation.sufficient ? <p>Cần ít nhất 20 trung tâm đã đủ thời gian theo dõi để đề xuất điều chỉnh tỷ lệ. Hiện tại hãy tiếp tục ghi nhận liên hệ và hồ sơ tiếp nhận.</p>
      : observation.rate === 0 ? <p className="notice error">Chưa có trung tâm nào gửi trong mốc chờ. Cần cùng Team Lead rà lại nguồn, nội dung trao đổi và thời gian chờ trước khi dùng một tỷ lệ mới.</p>
        : <><p>Kết quả hiện có thể dùng để tính thử. Tỷ lệ gửi hồ sơ cần được rà cùng chất lượng nguồn và khả năng đạt chuẩn.</p>
          {apply && observation.rate !== assumedRate && <button type="button" onClick={() => apply(observation.rate!)}>Tính thử với tỷ lệ {observation.rate}%</button>}</>}
    <small>Dựa trên lịch sử đã nhập trong CRM. Hồ sơ tiếp nhận xác nhận lần gửi, số đạt chuẩn để tính KPI vẫn cần đối soát.</small>
  </section>;
}

export default function PlanWatch({ day, members, centers, records, plans, openPlan, openCenter, personal }: {
  day: string; members: Person[]; centers: Center[]; records: (MonitorRecord & { owner: string })[];
  plans: SavedPlan[]; openPlan: (owner: string) => void; openCenter: (id: string) => void; personal: boolean;
}) {
  const alerts = members.flatMap((person) => {
    if (person.role === "intake") return [];
    const plan = plans.find((item) => item.owner === person.email && item.quarter === quarterOf(day));
    const ownCenters = centers.filter((center) => center.owner === person.email);
    const ownRows = records.filter((record) => record.owner === person.email);
    if (!plan) return [{ person, reasons: ["Chưa có kế hoạch quý đã lưu."], awaiting: [] as { id: string; title: string; due: string }[], expired: 0 }];
    const monitor = monitorPlan(day, person.role, plan, ownCenters, ownRows);
    const reasons: string[] = [];
    if (monitor.conversionBehind) reasons.push("Tỷ lệ gửi đúng mốc " + monitor.outcomes.rate + "%, thấp hơn giả định " + (plan.settings?.conversion ?? 50) + "% trên " + monitor.outcomes.mature + " trung tâm đã đủ thời gian theo dõi.");
    if (monitor.outcomes.awaiting.length) reasons.push(monitor.outcomes.awaiting.length + " trung tâm đã qua mốc chờ nhưng chưa có hồ sơ tiếp nhận.");
    if (monitor.expired.length) reasons.push(monitor.expired.length + " nguồn dự kiến đã quá hẹn, cần đối soát hoặc cập nhật mốc mới.");
    if (monitor.schedule.shortfall) reasons.push("Thiếu khả năng tiếp cận " + monitor.schedule.shortfall + " trung tâm so với phần nguồn còn thiếu. Cần cùng Team Lead rà phương án hỗ trợ.");
    return reasons.length ? [{ person, reasons, awaiting: monitor.outcomes.awaiting, expired: monitor.expired.length }] : [];
  });
  return <section className="panel policy planWatch">
    <h2>{personal ? "Việc cần chú ý trong kế hoạch" : "Kế hoạch cần hỗ trợ"}</h2>
    <p>Tự đối chiếu kế hoạch với lịch sử liên hệ và hồ sơ tiếp nhận mỗi khi tải dữ liệu.</p>
    {!alerts.length ? <p>Chưa phát hiện cảnh báo từ các dữ liệu hiện có.</p> : <ul className="planPriorities">{alerts.map(({ person, reasons, awaiting }) =>
      <li key={person.email}><div>
        <b>{person.name}</b>
        <ul>{reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
        {awaiting.slice(0, 3).map((center) => <div key={center.id}>
          <button type="button" className="textButton" onClick={() => openCenter(center.id)}>{center.title}</button>
          <small> · Đến mốc gửi đầu {displayDate(center.due)}</small>
        </div>)}
      </div><button type="button" onClick={() => openPlan(person.email)}>{personal ? "Rà và điều chỉnh kế hoạch" : "Xem kế hoạch nhân sự"}</button></li>)}</ul>}
  </section>;
}
