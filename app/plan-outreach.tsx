import { defaultOutreach, outreachSchedule, programs, quarterRange, type KpiPlan, type OutreachSettings } from "./kpi-plan";
import { currentWeek } from "./ai-contract";

export type PlanningCenter = { id?: string; owner: string; title: string; followupDate?: string | null };
export type PlanningRecord = { kind: string; partnerId?: string | null; date: string };
const dateLabel = (date: string) => date.split("-").reverse().join("/");

export function OutreachInputs({ quarter, settings, change, disabled }: {
  quarter: string; settings: OutreachSettings; change: (settings: OutreachSettings) => void; disabled: boolean;
}) {
  const { start, end } = quarterRange(quarter);
  return <section className="panel policy">
    <h2>3. Sức làm mỗi ngày</h2>
    <fieldset className="planForm planFieldset" disabled={disabled}>
      <label>Bạn có thể liên hệ bao nhiêu trung tâm mới mỗi ngày?<input type="number" required min={1} max={100} step={1} value={settings.dailyCapacity}
        onChange={(event) => change({ ...settings, dailyCapacity: Number(event.target.value) })} /></label>
      <details className="compactDetails" onInvalidCapture={(event) => { event.currentTarget.open = true; }}>
      <summary>Giả định đang dùng · {settings.conversion}% gửi hồ sơ · {settings.leadDays} ngày chờ</summary>
      <div className="formGrid">
      <label>Ngày bắt đầu tiếp cận<input type="date" required min={start} max={end} value={settings.startDate}
        onChange={(event) => change({ ...settings, startDate: event.target.value })} /></label>
      <label>Tỷ lệ trung tâm gửi hồ sơ dự kiến (%)<input type="number" required min={1} max={100} step={1} value={settings.conversion}
        onChange={(event) => change({ ...settings, conversion: Number(event.target.value) })} /><small>{settings.conversion}% nghĩa là cứ tiếp cận 100 trung tâm, dự kiến {settings.conversion} trung tâm gửi hồ sơ.</small></label>
      <label>Số ngày đến lần gửi đầu tiên<input type="number" required min={1} max={90} step={1} value={settings.leadDays}
        onChange={(event) => change({ ...settings, leadDays: Number(event.target.value) })} /><small>14 ngày tương đương 2 tuần.</small></label>
      <label>Hồ sơ đạt chuẩn mỗi trung tâm mới<select value={settings.filesPerCenter}
        onChange={(event) => {
          const total = Number(event.target.value);
          change({ ...settings, filesPerCenter: total, outputByProgram: settings.outputByProgram && total > 1 ? [1, total - 1] : undefined });
        }}>
        <option value={1}>1 bộ · Gửi ít</option><option value={3}>3 bộ · Trung bình</option><option value={5}>5 bộ · Mạnh</option>
      </select><small>Mặc định 1 bộ. Với 3 hoặc 5 bộ, cần xác nhận khả năng nhận đủ hồ sơ trong quý.</small></label>
      <label>Cách phân bổ nguồn mới<select value={settings.outputByProgram ? "mixed" : "separate"} onChange={(event) => {
        if (event.target.value === "mixed") {
          const total = Math.max(3, settings.filesPerCenter);
          change({ ...settings, filesPerCenter: total, outputByProgram: [1, total - 1] });
        } else change({ ...settings, outputByProgram: undefined });
      }}><option value="separate">Mỗi nhóm trung tâm tập trung một loại</option><option value="mixed">Một trung tâm gửi cả D2-6 và D4-1</option></select></label>
      {settings.outputByProgram && programs.map((program, index) => <label key={program}>{program} mỗi trung tâm có gửi
        <input type="number" required min={1} max={4} step={1} value={settings.outputByProgram![index]} onChange={(event) => {
          const counts: [number, number] = [...settings.outputByProgram!];
          counts[index] = Number(event.target.value);
          change({ ...settings, outputByProgram: counts });
        }} /><small>Tổng hai loại cần bằng {settings.filesPerCenter} bộ/trung tâm.</small>
      </label>)}
      </div></details>
    </fieldset>
  </section>;
}

export default function PlanOutreach({ plan, day, remaining, centers, records, editable, change, open, goPartners, dirty }: {
  plan: KpiPlan; day: string; remaining: number[]; centers: PlanningCenter[]; records: PlanningRecord[]; editable: boolean;
  change: (settings: OutreachSettings) => void; open: (id: string) => void; goPartners: () => void; dirty: boolean;
}) {
  const settings = plan.settings ?? defaultOutreach(plan.quarter, day);
  const result = outreachSchedule(plan.quarter, day, remaining, settings);
  const firstWeek = result.weeks[0];
  const centerMap = new Map(centers.map((center) => [center.id, center]));
  const selected = new Set(settings.centers.map((center) => center.centerId));
  const sourceIds = new Set(plan.sources.map((source) => source.centerId));
  const received = new Set(records.filter((record) => record.kind === "intake").map((record) => record.partnerId));
  const contacts = new Map<string, string>();
  for (const record of records) {
    if (record.kind !== "activity" || !record.partnerId) continue;
    const first = contacts.get(record.partnerId);
    if (!first || record.date < first) contacts.set(record.partnerId, record.date);
  }
  const available = centers.filter((center) => center.id && !selected.has(center.id) && !sourceIds.has(center.id) && !received.has(center.id));
  const contacted = settings.centers.filter((center) => contacts.has(center.centerId) || received.has(center.centerId));
  const sent = contacted.filter((center) => received.has(center.centerId));
  const hasStarted = contacted.length > 0;
  function leave(action: () => void) {
    if (!dirty || window.confirm("Bạn có thay đổi chưa lưu. Mở đối tác sẽ bỏ các thay đổi này.")) action();
  }

  return <>
    <section className="panel policy">
      <h2>{firstWeek && currentWeek(firstWeek.from) === currentWeek(day) ? "Việc cần làm tuần này" : "Kế hoạch tiếp cận"}</h2>
      {result.total > 0 && firstWeek && <p><strong>Tiếp cận {firstWeek.total} trung tâm mới</strong> từ {dateLabel(firstWeek.from)} đến {dateLabel(firstWeek.through)}.</p>}
      {!result.total ? <p>Nguồn dự kiến đã đủ. Theo dõi các trung tâm đã chọn.</p>
        : !result.days ? <p className="notice error" role="status">Đã hết thời gian tiếp cận theo kế hoạch. Cùng Team Lead rà nguồn có thể gửi sớm.</p>
          : result.shortfall > 0 ? <p className="notice error" role="status">Cần khoảng {result.dailyRequired} trung tâm/ngày. Bạn dự kiến làm được {settings.dailyCapacity}. Trao đổi với Team Lead để bổ sung nguồn.</p>
            : null}
      <details className="compactDetails">
      <summary>Cách tính và lịch từng tuần</summary>
      <p>Giả định chuyển đổi {settings.conversion}% · {settings.leadDays} ngày đến lần gửi đầu · {settings.filesPerCenter} hồ sơ đạt chuẩn mỗi trung tâm mới.</p>
      <div className="kpiTargets">
        <div><span>Cần bắt đầu liên hệ</span><strong>{result.total}</strong><span>trung tâm mới</span></div>
        <div><span>Ngày làm việc còn để tiếp cận</span><strong>{result.days}</strong><span>đến {dateLabel(result.deadline)}</span></div>
        <div><span>Cần tiếp cận mỗi ngày</span><strong>{result.dailyRequired || "—"}</strong><span>Khả năng bạn nhập · {settings.dailyCapacity}/ngày</span></div>
      </div>
      <div className="tableWrap mobileCards"><table>
        <thead><tr><th>Loại hồ sơ</th><th>Thiếu nguồn</th><th>Cần trung tâm có gửi</th><th>Cần tiếp cận trung tâm mới</th></tr></thead>
        <tbody>{programs.map((program, index) => <tr key={program}><th scope="row">{program}</th><td data-label="Hồ sơ thiếu nguồn">{remaining[index]}</td><td data-label="Cần trung tâm có gửi">{result.centers[index]}</td><td data-label="Cần tiếp cận trung tâm mới">{result.contacts[index]}</td></tr>)}</tbody>
      </table></div>
      {!result.total ? <p className="notice">Nguồn dự kiến hiện đã đủ bù phần KPI còn thiếu. Tiếp tục xác nhận và theo dõi các nguồn đã chọn.</p>
        : !result.days ? <p className="notice error" role="status">Thời gian còn lại không đủ mốc {settings.leadDays} ngày theo giả định. Cần Team Lead hỗ trợ nguồn có thể gửi sớm hoặc rà lại tiến độ của trung tâm đang chăm sóc.</p>
          : result.shortfall ? <p className="notice error" role="status">Khối lượng đang vượt khả năng bạn nhập. Bạn có thể tiếp cận khoảng {result.capacity} trung tâm trong thời gian còn lại, thiếu {result.shortfall} lượt tiếp cận trung tâm mới so với đề xuất. Trao đổi với Team Lead để bổ sung nguồn hoặc tăng hỗ trợ.</p>
            : <p className="notice">Khối lượng tiếp cận nằm trong khả năng bạn nhập. Kết quả vẫn phụ thuộc tỷ lệ gửi và số hồ sơ thực tế của các trung tâm.</p>}
      <p>{settings.outputByProgram
        ? "Mỗi trung tâm có gửi dự kiến đóng góp " + settings.outputByProgram[0] + " D2-6 và " + settings.outputByProgram[1] + " D4-1. Các cột theo loại có thể cùng một trung tâm; tổng tiếp cận đếm trung tâm duy nhất."
        : "Mỗi nhóm tiếp cận tập trung vào một loại hồ sơ. Tổng tiếp cận cộng hai nhóm riêng."} Phần nguồn đang có được trừ trước khi tính tiếp cận mới.</p>
      <p>Mốc gửi đầu chỉ phản ánh thời gian đến lần gửi đầu tiên. Khi nhận hồ sơ, cần đối soát đạt chuẩn và cập nhật số thực tế để tính KPI.</p>
      {result.weeks.length > 0 && result.total > 0 && <div className="tableWrap mobileCards"><table>
        <thead><tr><th>Khoảng ngày làm việc</th><th>Số ngày làm việc</th><th>Trung tâm cho D2-6</th><th>Trung tâm cho D4-1</th><th>Tổng cần tiếp cận</th></tr></thead>
        <tbody>{result.weeks.map((week) => <tr key={week.date}><th scope="row">{dateLabel(week.from)} – {dateLabel(week.through)}</th><td data-label="Số ngày làm việc">{week.days} ngày</td>
          {week.contacts.map((count, index) => <td data-label={"Trung tâm cho " + programs[index]} key={programs[index]}>{count}</td>)}<td data-label="Tổng trung tâm cần tiếp cận"><b>{week.total}</b></td></tr>)}</tbody>
      </table></div>}
      </details>
    </section>
    <details className="panel policy compactDetails">
      <summary>Trung tâm sẽ tiếp cận · {settings.centers.length}</summary>
      {editable && <div className="planForm">
        <label>Thêm trung tâm vào danh sách tiếp cận<select value="" disabled={!available.length || settings.centers.length >= 1000} onChange={(event) => {
          if (event.target.value) change({ ...settings, centers: [...settings.centers, { centerId: event.target.value, program: remaining[0] > 0 ? "D2-6" : "D4-1" }] });
        }}>
          <option value="">{available.length ? "Chọn trung tâm chưa gửi hồ sơ" : "Chưa có trung tâm phù hợp để chọn"}</option>
          {available.map((center) => <option key={center.id} value={center.id}>{center.title}</option>)}
        </select></label>
        <button type="button" onClick={() => leave(goPartners)}>Tìm và thêm trung tâm trong Đối tác B2B</button>
      </div>}
      {!settings.centers.length && <p>Chưa chọn trung tâm cụ thể. Bạn có thể lưu mục tiêu trước, sau đó bổ sung danh sách khi tìm được đầu mối.</p>}
      <ul className="planPriorities">{settings.centers.map((center, index) => <li key={center.centerId}>
        <div><b>{centerMap.get(center.centerId)?.title ?? "Trung tâm không còn trong phạm vi phụ trách"}</b>
          <small>{received.has(center.centerId) ? "Đã gửi hồ sơ · Cần đối soát số đạt chuẩn" : contacts.has(center.centerId) ? "Đã có liên hệ · Tiếp tục follow-up" : "Chưa ghi nhận liên hệ"}</small>
          {centerMap.get(center.centerId)?.followupDate && <small>Follow-up {dateLabel(centerMap.get(center.centerId)!.followupDate!)}</small>}
        </div>
        {editable ? <><label>Loại hồ sơ tập trung<select value={center.program} onChange={(event) => change({
          ...settings, centers: settings.centers.map((item, position) => position === index ? { ...item, program: event.target.value as typeof center.program } : item),
        })}>{[...programs, "Cả hai"].map((program) => <option key={program}>{program}</option>)}</select></label>
          <button type="button" onClick={() => change({ ...settings, centers: settings.centers.filter((_, position) => position !== index) })}>Bỏ chọn</button></>
          : <span className="pill">{center.program}</span>}
        {centerMap.has(center.centerId) && <button type="button" onClick={() => leave(() => open(center.centerId))}>{editable ? "Mở để liên hệ" : "Xem trung tâm"}</button>}
      </li>)}</ul>
      <p>Trong danh sách đã chọn · {contacted.length} trung tâm có liên hệ · {sent.length} trung tâm có hồ sơ tiếp nhận{hasStarted && " · Tỷ lệ gửi quan sát được " + Math.round(sent.length * 100 / contacted.length) + "%"}.</p>
      <p>Tỷ lệ quan sát có thể còn thấp khi trung tâm đang chờ tới mốc gửi. Các trung tâm đã có nguồn dự kiến được quản lý ở bước 2. Danh sách tiếp cận giúp theo dõi hành động, số hồ sơ dự kiến được nhập ở bước 2 khi đã có nguồn cụ thể.</p>
    </details>
  </>;
}
