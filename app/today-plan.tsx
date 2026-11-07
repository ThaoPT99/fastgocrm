import { outreachSchedule, personalTargets, quarterOf, type KpiPlan } from "./kpi-plan";
import type { PlanningCenter, PlanningRecord } from "./plan-outreach";

export default function TodayPlan({ day, plan, centers, records, goPlan, goPartners }: {
  day: string; plan?: KpiPlan; centers: PlanningCenter[]; records: PlanningRecord[];
  goPlan: () => void; goPartners: () => void;
}) {
  if (!plan?.settings || plan.quarter !== quarterOf(day)) return <section className="toolbar startHere">
    <span><b>Lên kế hoạch tiếp cận cho quý này.</b> Hoàn thành 4 bước hướng dẫn để biết mỗi tuần cần tiếp cận bao nhiêu trung tâm.</span>
    <button onClick={goPlan}>Lập kế hoạch quý</button>
  </section>;
  const centerIds = new Set(centers.map((center) => center.id));
  const sourceCounts = [0, 0];
  for (const source of plan.sources) {
    if (!centerIds.has(source.centerId) || source.date < day) continue;
    source.counts.forEach((count, index) => { sourceCounts[index] += count; });
  }
  const gap = personalTargets("sale").map((target, index) => Math.max(0, target - plan.actual[index] - sourceCounts[index]));
  const schedule = outreachSchedule(plan.quarter, day, gap, plan.settings);
  const firstContact = new Map<string, string>();
  for (const record of records) {
    if (record.kind !== "activity" || !record.partnerId || !centerIds.has(record.partnerId)) continue;
    if (!firstContact.has(record.partnerId) || record.date < firstContact.get(record.partnerId)!) firstContact.set(record.partnerId, record.date);
  }
  const contactedToday = [...firstContact.values()].filter((date) => date === day).length;
  const weekday = new Date(day + "T00:00:00Z").getUTCDay();
  const workingToday = weekday !== 0 && weekday !== 6 && day >= schedule.from && day <= schedule.deadline;
  return <section className="panel policy">
    <h2>Tiếp cận mới theo kế hoạch quý</h2>
    <p>{workingToday && schedule.total
      ? "Nhịp cần đạt từ hôm nay · Khoảng " + schedule.dailyRequired + " trung tâm mới/ngày. Hôm nay đã ghi nhận lần liên hệ đầu với " + contactedToday + " trung tâm."
      : "Kế hoạch còn cần tiếp cận " + schedule.total + " trung tâm mới. Mở kế hoạch để xem các tuần còn có thể triển khai."}</p>
    <p>Chọn và lưu trung tâm sẽ tiếp cận trong kế hoạch. Cập nhật liên hệ tại từng trung tâm để tạo nhật ký và đặt follow-up.</p>
    <div className="rowActions"><button onClick={goPlan}>Xem kế hoạch tuần</button><button onClick={goPartners}>Mở đối tác B2B</button></div>
  </section>;
}
