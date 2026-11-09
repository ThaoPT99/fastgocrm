"use client";

import { useState } from "react";
import type { Role } from "./crm";
import type { WorkflowSave } from "./partner-tools";

export type Team = { name: string; active: boolean };

export default function TeamDirectory({ teams, members, save, busy }: {
  teams: Team[];
  members: { team: string; name: string; role: Role }[];
  save: WorkflowSave;
  busy: boolean;
}) {
  const [form, setForm] = useState<{ original?: string; name: string }>();
  const activeCount = teams.filter((team) => team.active).length;
  return <section className="panel">
    <div className="sectionHead">
      <div><h2>{activeCount} team đang hoạt động</h2>
        {teams.length > activeCount && <p>{teams.length - activeCount} team đã ngừng sử dụng</p>}
      </div>
      <button className="primary" disabled={busy} onClick={() => setForm({ name: "" })}>+ Thêm team</button>
    </div>
    {form && <form className="form" onSubmit={async (event) => {
      event.preventDefault();
      const name = form.name.trim();
      if (await save(form.original ? { action: "team-rename", team: form.original, name } : { action: "team-create", name },
        form.original ? "Đã đổi tên team." : "Đã thêm team.")) setForm(undefined);
    }}>
      <label>{form.original ? "Tên team mới" : "Tên team"}<input required maxLength={60} value={form.name} autoFocus
        onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
      <div className="actions">
        <button type="button" disabled={busy} onClick={() => setForm(undefined)}>Hủy</button>
        <button className="primary" disabled={busy || !form.name.trim()}>Lưu team</button>
      </div>
    </form>}
    {!teams.length ? <p className="empty">Thêm team đầu tiên để phân nhóm nhân sự.</p> :
      <div className="tableWrap mobileCards"><table role="table">
        <thead><tr><th>Team</th><th>Team Lead</th><th>Sales</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
        <tbody>{teams.map((team) => {
          const assigned = members.filter((member) => member.team === team.name);
          const leads = assigned.filter((member) => member.role === "lead");
          const sales = assigned.filter((member) => member.role === "sale").length;
          return <tr key={team.name}>
            <td><b>{team.name}</b></td>
            <td data-label="Team Lead">{leads.map((lead) => lead.name).join(", ") || "Chưa có"}</td>
            <td data-label="Sales">{sales}{team.active && sales < 3 && <small>Thiếu {3 - sales} so với cơ cấu chuẩn</small>}</td>
            <td data-label="Trạng thái">{team.active ? "Đang hoạt động" : "Đã ngừng sử dụng"}</td>
            <td><div className="rowActions">
              <button disabled={busy} onClick={() => setForm({ original: team.name, name: team.name })}>Đổi tên</button>
              <button disabled={busy || (team.active && assigned.length > 0)} onClick={() => void save(
                { action: "team-status", team: team.name, active: !team.active },
                team.active ? "Đã ngừng sử dụng team." : "Đã mở lại team.",
              )}>{team.active ? "Ngừng sử dụng" : "Mở lại"}</button>
            </div>{team.active && assigned.length > 0 && <small>Chuyển nhân sự sang team khác trước khi ngừng.</small>}</td>
          </tr>;
        })}</tbody>
      </table></div>}
  </section>;
}
