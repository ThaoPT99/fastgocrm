"use client";

import { useState } from "react";
import { currentWeek } from "./ai-contract";
import { addDays } from "./plan-monitor";
import { WeeklyAssistant, type AskAssistant } from "./crm-assistant";
import { summarizeWeek, type WeeklyMember, type WeeklyRecord } from "./weekly-work";

const dateLabel = (day: string) => day.split("-").reverse().join("/");

export default function WeeklyWorkPanel({ day, members, records, team, setTeam, canReviewTeam, readOnly, ask, openCenter }: {
  day: string; members: WeeklyMember[]; records: WeeklyRecord[]; team: string; setTeam: (team: string) => void;
  canReviewTeam: boolean; readOnly: boolean; ask: AskAssistant; openCenter: (id: string) => void;
}) {
  const [week, setWeek] = useState(currentWeek(day));
  const [person, setPerson] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const teams = [...new Set(members.map((member) => member.team).filter(Boolean))];
  const teamMembers = members.filter((member) => !team || member.team === team);
  const people = teamMembers.filter((member) => !person || member.email === person);
  const to = addDays(week, 6);
  const summaries = summarizeWeek(people, records, week, to, day);
  const contacts = summaries.reduce((sum, item) => sum + item.contacts.length, 0);
  const uniqueCenters = new Set(summaries.flatMap((item) => item.centers)).size;
  const intakes = summaries.reduce((sum, item) => sum + item.intakes.length, 0);
  const support = summaries.reduce((sum, item) => sum + item.support.length, 0);
  const centers = new Map(records.filter((record) => record.kind === "partner" && record.id).map((record) => [record.id, record.title]));
  const owner = people.length === 1 ? people[0].email : undefined;

  async function exportReport() {
    setExporting(true);
    setExportError("");
    try {
      const { weeklyWorkWorkbook } = await import("./weekly-work-export");
      const workbook = await weeklyWorkWorkbook(summaries, centers, week, to, day);
      const url = URL.createObjectURL(workbook);
      const link = document.createElement("a");
      link.href = url;
      link.download = `fastgo-bao-cao-tuan-${week}-den-${to}.xlsx`;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch {
      setExportError("Chưa xuất được báo cáo Excel. Hãy thử lại.");
    } finally {
      setExporting(false);
    }
  }

  return <>
    <section className="panel policy">
      <div className="sectionHead">
        <div><h2>Tổng hợp công việc tuần</h2>
          <p>Từ {dateLabel(week)} đến {dateLabel(to)}{to > day && " · Hoạt động được ghi nhận tới " + dateLabel(day)}.</p></div>
        <button type="button" className="primary" disabled={exporting || !summaries.length} onClick={exportReport}>
          {exporting ? "Đang xuất báo cáo…" : "Xuất báo cáo Excel"}
        </button>
      </div>
      {exportError && <p role="alert" className="notice error">{exportError}</p>}
      <div className="toolbar weeklyControls">
        <label>Chọn ngày trong tuần<input type="date" required max={day} value={week} onChange={(event) => {
          if (event.target.value) setWeek(currentWeek(event.target.value));
        }} /></label>
        {teams.length > 1 && <label>Nhóm<select value={team} onChange={(event) => { setTeam(event.target.value); setPerson(""); }}>
          <option value="">Tất cả nhóm</option>{teams.map((value) => <option key={value}>{value}</option>)}
        </select></label>}
        {teamMembers.length > 1 && <label>Nhân sự<select value={person} onChange={(event) => setPerson(event.target.value)}>
          <option value="">Tất cả nhân sự</option>{teamMembers.map((member) => <option key={member.email} value={member.email}>{member.name}</option>)}
        </select></label>}
        <div className="rowActions"><button type="button" onClick={() => setWeek(addDays(week, -7))}>Tuần trước</button>
          <button type="button" disabled={week >= currentWeek(day)} onClick={() => setWeek(addDays(week, 7))}>Tuần sau</button>
          <button type="button" onClick={() => setWeek(currentWeek(day))}>Tuần này</button></div>
      </div>
      <div className="kpiTargets">
        <div><span>Lượt liên hệ đã ghi</span><strong>{contacts}</strong></div>
        <div><span>Trung tâm đã liên hệ</span><strong>{uniqueCenters}</strong></div>
        <div><span>Hồ sơ tiếp nhận trong tuần</span><strong>{intakes}</strong></div>
        <div><span>Hoạt động cần hỗ trợ</span><strong>{support}</strong></div>
      </div>
      <p>Liên hệ và việc nội bộ tính theo người thực hiện. Hồ sơ và lịch hẹn tính theo người phụ trách. Hồ sơ tiếp nhận cần được đối soát riêng để tính KPI đạt chuẩn.</p>
      <div className="tableWrap mobileCards"><table>
        <thead><tr><th>Nhân sự</th><th>Ngày có hoạt động</th><th>Lượt liên hệ</th><th>Trung tâm</th><th>Việc nội bộ</th><th>Hồ sơ tiếp nhận</th><th>Lịch hẹn hoàn tất / tổng</th><th>Cần hỗ trợ</th></tr></thead>
        <tbody>{summaries.map((item) => <tr key={item.member.email}>
          <th scope="row">{item.member.name}<small>{item.member.team}</small></th>
          <td data-label="Ngày có hoạt động">{item.days.length}</td><td data-label="Lượt liên hệ">{item.contacts.length}</td>
          <td data-label="Trung tâm">{item.centers.length}</td><td data-label="Việc nội bộ">{item.internal.length}</td>
          <td data-label="Hồ sơ tiếp nhận">{item.intakes.length}</td>
          <td data-label="Lịch hẹn hoàn tất / tổng">{item.meetings.filter((record) => record.status === "Hoàn tất" && record.date <= day).length} / {item.meetings.length}</td>
          <td data-label="Cần hỗ trợ">{item.support.length ? <span className="pill danger">{item.support.length}</span> : 0}</td>
        </tr>)}</tbody>
      </table></div>
      {!summaries.length && <p>Chưa có nhân sự trong phạm vi đã chọn.</p>}
    </section>
    <section className="panel policy">
      <h2>Kết quả và nội dung đã ghi</h2>
      <p>Mở từng nhân sự để xem toàn bộ hoạt động đã ghi trong tuần.</p>
      {summaries.map((item) => <details className="weeklyDetails" key={item.member.email}>
        <summary>{item.member.name} · {item.activities.length} hoạt động{item.support.length > 0 && " · " + item.support.length + " cần hỗ trợ"}</summary>
        {!item.activities.length ? <p>Chưa có hoạt động được ghi trong tuần này.</p> : <ul className="weeklyTimeline">{item.activities.map((record, index) => <li key={record.id ?? index}>
          <small>{dateLabel(record.date)} · {record.kind === "activity" ? record.status : "Việc nội bộ"}</small>
          <b>{record.title}</b>
          {record.kind === "activity" && record.partnerId && centers.has(record.partnerId) &&
            <button type="button" className="textButton" onClick={() => openCenter(record.partnerId!)}>{centers.get(record.partnerId)}</button>}
          {record.notes && <p className="weeklyNotes">{record.notes}</p>}
          {record.kind === "logwork" && record.partner && <p className="weeklyNotes"><b>Vướng mắc</b> {record.partner}</p>}
          {record.status === "Cần hỗ trợ" && <span className="pill danger">Cần hỗ trợ</span>}
        </li>)}</ul>}
      </details>)}
    </section>
    {!readOnly && people.length > 0 && <WeeklyAssistant key={week + team + (owner ?? "")} day={day} team={team}
      range={{ from: week, to: to > day ? day : to }} owner={owner} personLabel={owner ? people[0].name : undefined}
      canReviewTeam={canReviewTeam && !owner} ask={ask} />}
  </>;
}
