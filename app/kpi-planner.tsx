"use client";

import { useState } from "react";
import { defaultOutreach, planInput, programs, personalTargets, quarterOf, quarterRange, weeklyMilestones, type KpiPlan } from "./kpi-plan";
import { roles, type Role } from "./crm";
import PlanOutreach, { OutreachInputs, type PlanningRecord } from "./plan-outreach";

type Person = { email: string; name: string; role: Role; team: string };
type Center = { id?: string; owner: string; title: string; followupDate?: string | null };
type SavedPlan = KpiPlan & { owner: string };
type Counts = KpiPlan["actual"];
const zero = (): Counts => [0, 0];
const displayDate = (date: string) => date.split("-").reverse().join("/");
const yearQuarterLabel = (quarter: string) => "Quý " + quarter.slice(-1) + "/" + quarter.slice(0, 4);

export default function KpiPlanner({ day, members, centers, records, plans, email, readOnly, busy, save, open, goPartners }: {
  day: string; members: Person[]; centers: Center[]; plans: SavedPlan[]; email: string;
  records: PlanningRecord[]; goPartners: () => void;
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
      <div className="tableWrap mobileCards"><table>
        <thead><tr><th>Nhân sự</th><th>D2-6 đạt chuẩn / KPI</th><th>D4-1 đạt chuẩn / KPI</th><th>Kế hoạch</th></tr></thead>
        <tbody>{eligible.map((person) => {
          const personPlan = plans.find((plan) => plan.owner === person.email && plan.quarter === activeQuarter);
          const targets = personalTargets(person.role);
          return <tr key={person.email}>
            <th scope="row">{person.name}{person.team && " · " + person.team}</th>
            {targets.map((target, index) => <td data-label={programs[index] + " đạt chuẩn / KPI"} key={programs[index]}>{personPlan ? personPlan.actual[index] + " / " + target : "Chưa có số liệu"}</td>)}
            <td><button type="button" onClick={() => setEmailChoice(person.email)}>{personPlan ? "Xem kế hoạch" : "Chưa lập"}</button></td>
          </tr>;
        })}</tbody>
      </table></div>
    </section>}
    <QuarterPlan key={member.email + activeQuarter + (saved?.version ?? 0)} day={day} quarter={activeQuarter}
      role={member.role} centers={centers.filter((center) => center.owner === member.email && center.id)}
      records={records} goPartners={goPartners} saved={saved} editable={!readOnly && email === member.email} busy={busy} save={save} open={open} />
  </>;
}

function QuarterPlan({ day, quarter, role, centers, records, goPartners, saved, editable, busy, save, open }: {
  day: string; quarter: string; role: Exclude<Role, "intake">; centers: Center[];
  records: PlanningRecord[]; goPartners: () => void;
  saved?: SavedPlan; editable: boolean; busy: boolean; save: (plan: KpiPlan) => void; open: (id: string, update: boolean) => void;
}) {
  const { start, end } = quarterRange(quarter);
  const [plan, setPlan] = useState<KpiPlan>(() => ({
    quarter, version: saved?.version ?? 0, actual: saved?.actual ?? zero(), sources: saved?.sources ?? [],
    settings: saved?.settings ?? defaultOutreach(quarter, day),
  }));
  const [step, setStep] = useState(saved?.settings ? 3 : 0);
  const [validation, setValidation] = useState("");
  const steps = ["Chỉ tiêu và số đã đạt", "Nguồn từ trung tâm đang có", "Giả định và sức làm", "Kế hoạch đề xuất"];
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
    || JSON.stringify(plan.sources) !== JSON.stringify(saved?.sources ?? [])
    || JSON.stringify(plan.settings) !== JSON.stringify(saved?.settings);

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

  function next() {
    const result = planInput.safeParse(plan);
    if (!result.success) {
      setValidation("Kiểm tra số hồ sơ, ngày trong quý và số lượng dự kiến của từng nguồn. Mỗi nguồn cần ít nhất 1 hồ sơ.");
      return;
    }
    setValidation("");
    setStep(Math.min(3, step + 1));
  }

  if (!editable && !saved) return <section className="panel policy">
    <h2>Chưa có kế hoạch đã lưu</h2>
    <p>Nhân sự cần tự lập kế hoạch cho quý này. Khi đã lưu, bạn có thể xem nguồn dự kiến, khối lượng tiếp cận và các giả định tại đây.</p>
  </section>;

  return <form className="guidedPlan" onSubmit={(event) => {
    event.preventDefault();
    if (!editable || busy) return;
    if (step < 3) next();
    else if (planInput.safeParse(plan).success) save(plan);
  }}>
    <fieldset className="planFieldset" disabled={busy}>
    {editable && <section className="panel policy">
      <h2>{saved ? "Rà và điều chỉnh kế hoạch" : "Lập kế hoạch có hướng dẫn"}</h2>
      <p>Quý đã chọn ở phía trên. Hoàn thành các bước dưới đây để nhận mục tiêu tiếp cận theo tuần.</p>
      <ol className="planSteps">{steps.map((label, index) => <li key={label} aria-current={step === index ? "step" : undefined}>
        <span>{index + 1}</span>{label}
      </li>)}</ol>
      {dirty && <p>Thay đổi đang được tính thử. Bấm Lưu kế hoạch ở bước cuối để lưu.</p>}
    </section>}
    {validation && <p className="notice error" role="alert">{validation}</p>}
    {(!editable || step === 0) && <section className="panel policy">
      <h2>1. Chỉ tiêu và số đã đạt</h2>
      <p>KPI cá nhân của quý đã chọn · {targets[0]} D2-6 và {targets[1]} D4-1, tổng {targets[0] + targets[1]} hồ sơ đạt chuẩn.</p>
      {editable && <div className="planForm"><p>Nhập số đã đối soát trong quý. Nhân viên mới chưa có kết quả giữ số 0.</p>
        <div className="formGrid">{countFields(plan.actual, (actual) => setPlan({ ...plan, actual }), "Đã đạt ")}</div></div>}
      {!editable && <p>Đã đạt {plan.actual[0]} D2-6 và {plan.actual[1]} D4-1.</p>}
    </section>}
    {(!editable || step === 3) && <><section className="panel policy">
      <h2>Mức độ đủ nguồn</h2>
      {!saved && <p>Kế hoạch đang tính thử, chưa được lưu.</p>}
      <div className="tableWrap mobileCards"><table>
        <thead><tr><th>Loại hồ sơ</th><th>KPI</th><th>Đạt chuẩn đã xác nhận</th><th>Còn thiếu</th><th>Nguồn đã xác nhận</th><th>Nguồn chưa xác nhận</th><th>Còn thiếu nguồn</th></tr></thead>
        <tbody>{programs.map((program, index) => <tr key={program}>
          <th scope="row">{program}</th><td data-label="KPI">{targets[index]}</td><td data-label="Đạt chuẩn đã xác nhận">{plan.actual[index]}</td><td data-label="Còn thiếu">{gap[index]}</td>
          <td data-label="Nguồn đã xác nhận">{covered(index, true)}</td><td data-label="Nguồn chưa xác nhận">{covered(index, false) - covered(index, true)}</td><td data-label="Còn thiếu nguồn"><b>{remaining[index]}</b></td>
        </tr>)}</tbody>
      </table></div>
      <p>Chỉ tính nguồn còn hiệu lực trong quý. Nguồn đã xác nhận vẫn là dự kiến cho tới khi hồ sơ đạt chuẩn.</p>
    </section>
    <PlanOutreach plan={plan} day={day} remaining={remaining} centers={centers} records={records} editable={editable}
      change={(settings) => setPlan({ ...plan, settings })} open={(id) => open(id, editable)} goPartners={goPartners} dirty={dirty} />
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
      <div className="tableWrap mobileCards"><table>
        <thead><tr><th>Tuần kết thúc</th>{programs.map((program) => <th key={program}>{program}</th>)}</tr></thead>
        <tbody>{milestones.map((milestone) => <tr key={milestone.date}><th scope="row">Tuần kết thúc {displayDate(milestone.date)}</th>
          {milestone.counts.map((count, index) => <td data-label={programs[index]} key={programs[index]}>{count}</td>)}</tr>)}</tbody>
      </table></div>
    </section>}
    </>}
    {(!editable || step === 1) && <section className="panel policy">
      <h2>2. Nguồn từ trung tâm đang có</h2>
      <div className="planForm">
        {editable && <><p>Chưa có đối tác hoặc chưa có nguồn cụ thể? Giữ trống và bấm Tiếp tục. CRM sẽ tính nguồn cần phát triển mới.</p>
          <p>Mức gửi ít 1 bộ, trung bình 3 bộ, mạnh 5 bộ mỗi quý giúp bạn ước lượng. Nhập số còn có thể đạt chuẩn trong quý này, tách theo D2-6 và D4-1. Khi hồ sơ đạt chuẩn, tăng số thực tế ở bước 1 và giảm số dự kiến tại đây.</p></>}
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
            const centerId = event.target.value;
            if (centerId) setPlan({ ...plan,
              sources: [...plan.sources, { centerId, date: end, confirmed: false, counts: zero() }],
              settings: { ...plan.settings!, centers: plan.settings!.centers.filter((center) => center.centerId !== centerId) },
            });
          }}>
            <option value="">{available.length ? "Chọn trung tâm đang phụ trách" : "Không còn trung tâm để thêm"}</option>
            {available.map((center) => <option key={center.id} value={center.id}>{center.title}</option>)}
          </select></label>
        </>}
      </div>
    </section>}
    {(!editable || step === 2) && <OutreachInputs quarter={quarter} settings={plan.settings!}
      disabled={!editable || busy} change={(settings) => setPlan({ ...plan, settings })} />}
    {editable && <div className="toolbar planNavigation">
      <span>Bước {step + 1}/4 · {steps[step]}</span>
      <div className="rowActions">
        {step > 0 && <button type="button" disabled={busy} onClick={() => { setValidation(""); setStep(step - 1); }}>Quay lại</button>}
        <button className="primary" disabled={busy || (step === 3 && Boolean(saved && !dirty))}>
          {busy ? "Đang lưu…" : step === 3 ? "Lưu kế hoạch" : "Tiếp tục"}
        </button>
      </div>
    </div>}
    </fieldset>
  </form>;
}
