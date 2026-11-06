"use client";

import { useState } from "react";
import { programs, personalTargets, quarterOf, quarterRange, weeklyMilestones, type KpiPlan } from "./kpi-plan";
import { roles, type Role } from "./crm";

type Person = { email: string; name: string; role: Role; team: string };
type Center = { id?: string; owner: string; title: string; followupDate?: string | null };
type SavedPlan = KpiPlan & { owner: string };
type Counts = KpiPlan["actual"];
const zero = (): Counts => [0, 0];
const displayDate = (date: string) => date.split("-").reverse().join("/");
const yearQuarterLabel = (quarter: string) => "Quý " + quarter.slice(-1) + "/" + quarter.slice(0, 4);

export default function KpiPlanner({ day, members, centers, plans, email, readOnly, busy, save, open }: {
  day: string; members: Person[]; centers: Center[]; plans: SavedPlan[]; email: string;
  readOnly: boolean; busy: boolean; save: (plan: KpiPlan) => void; open: (id: string, update: boolean) => void;
}) {
  const current = quarterOf(day);
  const next = current.endsWith("4") ? Number(current.slice(0, 4)) + 1 + "-Q1" : current.slice(0, -1) + (Number(current.slice(-1)) + 1);
  const [quarter, setQuarter] = useState(current);
  const [emailChoice, setEmailChoice] = useState(email);
  const eligible = members.filter((member): member is Person & { role: Exclude<Role, "intake"> } => member.role !== "intake");
  const member = eligible.find((person) => person.email === emailChoice) ?? eligible[0];
  const quarters = [...new Set([current, next, ...plans.filter((plan) => eligible.some((person) => person.email === plan.owner)).map((plan) => plan.quarter)])].sort();
  const activeQuarter = quarters.includes(quarter) ? quarter : current;
  const saved = plans.find((plan) => plan.owner === member?.email && plan.quarter === activeQuarter);
  if (!member) return <section className="panel">Chưa có nhân sự kinh doanh trong phạm vi này.</section>;
  return <>
    <section className="toolbar">
      <label>Kỳ kế hoạch <select value={activeQuarter} onChange={(event) => setQuarter(event.target.value)}>
        {quarters.map((value) => <option key={value} value={value}>{yearQuarterLabel(value)}</option>)}
      </select></label>
      <label>Nhân sự <select value={member.email} onChange={(event) => {
        setEmailChoice(event.target.value);
      }}>
        {eligible.map((person) => <option key={person.email} value={person.email}>{person.name} · {roles[person.role]}</option>)}
      </select></label>
    </section>
    {eligible.length > 1 && <section className="panel policy">
      <h2>Kế hoạch của nhân sự</h2>
      <div className="tableWrap"><table>
        <thead><tr><th>Nhân sự</th><th>D2-6 đạt chuẩn / KPI</th><th>D4-1 đạt chuẩn / KPI</th><th>Kế hoạch</th></tr></thead>
        <tbody>{eligible.map((person) => {
          const personPlan = plans.find((plan) => plan.owner === person.email && plan.quarter === activeQuarter);
          const targets = personalTargets(person.role);
          return <tr key={person.email}>
            <th>{person.name}{person.team && " · " + person.team}</th>
            {targets.map((target, index) => <td key={programs[index]}>{personPlan ? personPlan.actual[index] + " / " + target : "Chưa có số liệu"}</td>)}
            <td><button type="button" onClick={() => setEmailChoice(person.email)}>{personPlan ? "Xem kế hoạch" : "Chưa lập"}</button></td>
          </tr>;
        })}</tbody>
      </table></div>
    </section>}
    <QuarterPlan key={member.email + activeQuarter + (saved?.version ?? 0)} day={day} quarter={activeQuarter}
      role={member.role} centers={centers.filter((center) => center.owner === member.email && center.id)}
      saved={saved} editable={!readOnly && email === member.email} busy={busy} save={save} open={open} />
  </>;
}

function QuarterPlan({ day, quarter, role, centers, saved, editable, busy, save, open }: {
  day: string; quarter: string; role: Exclude<Role, "intake">; centers: Center[];
  saved?: SavedPlan; editable: boolean; busy: boolean; save: (plan: KpiPlan) => void; open: (id: string, update: boolean) => void;
}) {
  const { start, end } = quarterRange(quarter);
  const [plan, setPlan] = useState<KpiPlan>(() => ({
    quarter, version: saved?.version ?? 0, actual: saved?.actual ?? zero(), sources: saved?.sources ?? [],
  }));
  const targets = personalTargets(role);
  const gap = targets.map((target, index) => Math.max(0, target - plan.actual[index]));
  const centerById = new Map(centers.map((center) => [center.id, center]));
  const currentSources = plan.sources.filter((source) => centerById.has(source.centerId) && source.date >= day && source.date <= end);
  const covered = (index: number, onlyConfirmed: boolean) => currentSources.reduce((total, source) =>
    total + (!onlyConfirmed || source.confirmed ? source.counts[index] : 0), 0);
  const milestones = weeklyMilestones(day > start ? day : start, end, gap);
  const remaining = gap.map((value, index) => Math.max(0, value - covered(index, false)));
  const priority = plan.sources.filter((source) => centerById.has(source.centerId) &&
    source.counts.some((count, index) => count > 0 && gap[index] > 0))
    .sort((a, b) => Number(b.date < day) - Number(a.date < day)
      || Number(b.confirmed) - Number(a.confirmed) || a.date.localeCompare(b.date));
  const available = centers.filter((center) => !plan.sources.some((source) => source.centerId === center.id));
  const dirty = JSON.stringify(plan.actual) !== JSON.stringify(saved?.actual ?? zero())
    || JSON.stringify(plan.sources) !== JSON.stringify(saved?.sources ?? []);

  function setSource(index: number, changes: Partial<KpiPlan["sources"][number]>) {
    setPlan({ ...plan, sources: plan.sources.map((source, position) => position === index ? { ...source, ...changes } : source) });
  }

  function countFields(values: Counts, change: (counts: Counts) => void, prefix = "") {
    return programs.map((program, index) => <label key={program}>{prefix}{program}
      <input type="number" required min={0} max={9999} step={1} value={values[index]} onChange={(event) => {
        const counts: Counts = [...values];
        counts[index] = Number(event.target.value);
        change(counts);
      }} />
    </label>);
  }

  return <>
    <section className="panel policy">
      <h2>Mức độ đủ nguồn</h2>
      {!saved && !dirty && <p>Chưa có kế hoạch đã lưu. Bảng dưới dùng chỉ tiêu cá nhân và tiến độ ban đầu bằng 0.</p>}
      {dirty && <p>Đang tính thử theo thay đổi chưa lưu.</p>}
      <div className="tableWrap"><table>
        <thead><tr><th>Loại hồ sơ</th><th>KPI</th><th>Đạt chuẩn đã xác nhận</th><th>Còn thiếu</th><th>Nguồn đã xác nhận</th><th>Nguồn chưa xác nhận</th><th>Còn thiếu nguồn</th></tr></thead>
        <tbody>{programs.map((program, index) => <tr key={program}>
          <th>{program}</th><td>{targets[index]}</td><td>{plan.actual[index]}</td><td>{gap[index]}</td>
          <td>{covered(index, true)}</td><td>{covered(index, false) - covered(index, true)}</td><td><b>{remaining[index]}</b></td>
        </tr>)}</tbody>
      </table></div>
      <p>Chỉ tính nguồn còn hiệu lực trong quý. Nguồn đã xác nhận vẫn là dự kiến cho tới khi hồ sơ đạt chuẩn.</p>
    </section>
    {day <= end && gap.some(Boolean) && <section className="panel policy">
      <h2>Việc ưu tiên đề xuất</h2>
      {remaining.some(Boolean) && <p><b>Bổ sung nguồn:</b> {programs.map((program, index) => remaining[index] ? remaining[index] + " " + program : "").filter(Boolean).join(" và ")}. Đây là phần còn thiếu kể cả khi các nguồn đang dự kiến đều thành hiện thực.</p>}
      {priority.length > 0 && <ul className="planPriorities">{priority.map((source) => {
        const center = centerById.get(source.centerId)!;
        return <li key={source.centerId}><div>
          <b>{center.title}</b>
          <div>{source.date < day ? "Xác minh lại số lượng và ngày đạt chuẩn đã quá hạn"
            : source.confirmed ? "Chốt lịch bàn giao và kiểm tra giấy tờ còn thiếu" : "Xác nhận danh sách ứng viên và ngày bàn giao"}</div>
          <small>Mốc dự kiến {displayDate(source.date)} · {source.counts[0]} D2-6 · {source.counts[1]} D4-1
            {center.followupDate && " · Follow-up " + displayDate(center.followupDate)}</small>
        </div><button type="button" onClick={() => {
          if (!dirty || window.confirm("Bạn có thay đổi chưa lưu. Mở đối tác sẽ bỏ các thay đổi này.")) open(source.centerId, editable);
        }}>{editable ? "Cập nhật đối tác" : "Xem đối tác"}</button></li>;
      })}</ul>}
    </section>}
    {milestones.length > 0 && gap.some(Boolean) && <section className="panel policy">
      <h2>Mốc hồ sơ cần đạt mỗi tuần</h2>
      <p>CRM phân bổ phần KPI còn thiếu qua các tuần còn lại, kể cả tuần cuối chưa đủ ngày.</p>
      <div className="tableWrap"><table>
        <thead><tr><th>Tuần kết thúc</th>{programs.map((program) => <th key={program}>{program}</th>)}</tr></thead>
        <tbody>{milestones.map((milestone) => <tr key={milestone.date}><td>{displayDate(milestone.date)}</td>
          {milestone.counts.map((count, index) => <td key={programs[index]}>{count}</td>)}</tr>)}</tbody>
      </table></div>
    </section>}
    <section className="panel policy">
      <h2>{editable ? "Cập nhật số thực tế và nguồn" : "Nguồn dự kiến"}</h2>
      <form className="planForm" onSubmit={(event) => { event.preventDefault(); if (editable && !busy) save(plan); }}>
        {editable && <><p>Nhập số hồ sơ đạt chuẩn đã đối soát theo từng loại. Khi hồ sơ từ một trung tâm đạt chuẩn, cộng vào thực tế và giảm số còn dự kiến ở nguồn đó.</p>
          <div className="formGrid">{countFields(plan.actual, (actual) => setPlan({ ...plan, actual }), "Đã đạt ")}</div></>}
        {plan.sources.map((source, index) => <fieldset key={source.centerId} className="planSource" disabled={!editable || busy}>
          <legend>{centerById.get(source.centerId)?.title ?? "Trung tâm không còn trong phạm vi phụ trách"}</legend>
          {editable ? <>
            <div className="formGrid">
              <label>Ngày dự kiến đạt chuẩn<input type="date" required min={start} max={end} value={source.date}
                onChange={(event) => setSource(index, { date: event.target.value })} /></label>
              <label>Mức xác nhận<select value={source.confirmed ? "confirmed" : "estimate"}
                onChange={(event) => setSource(index, { confirmed: event.target.value === "confirmed" })}>
                <option value="estimate">Chưa xác nhận</option><option value="confirmed">Đã xác nhận</option>
              </select></label>
              {countFields(source.counts, (counts) => setSource(index, { counts }), "Còn dự kiến ")}
            </div>
            <button type="button" onClick={() => setPlan({ ...plan, sources: plan.sources.filter((_, position) => position !== index) })}>Bỏ nguồn</button>
          </> : <p>{displayDate(source.date)} · {source.confirmed ? "Đã xác nhận" : "Chưa xác nhận"} · {source.counts[0]} D2-6 · {source.counts[1]} D4-1</p>}
        </fieldset>)}
        {editable && <>
          <label>Thêm nguồn từ trung tâm<select value="" disabled={!available.length || busy || plan.sources.length >= 200} onChange={(event) => {
            if (event.target.value) setPlan({ ...plan, sources: [...plan.sources, { centerId: event.target.value, date: end, confirmed: false, counts: zero() }] });
          }}>
            <option value="">{available.length ? "Chọn trung tâm đang phụ trách" : "Không còn trung tâm để thêm"}</option>
            {available.map((center) => <option key={center.id} value={center.id}>{center.title}</option>)}
          </select></label>
          <div className="actions"><button className="primary" disabled={busy || Boolean(saved && !dirty) || plan.sources.some((source) => !source.counts.some(Boolean))}>Lưu kế hoạch</button></div>
        </>}
      </form>
    </section>
  </>;
}
