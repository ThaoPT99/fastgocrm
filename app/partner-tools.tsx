"use client";

import { useState } from "react";
import { situations, type Playbook, type Situation, type SupportRequest, supportStatuses } from "./sales-workflow";

type Person = { email: string; name: string; team: string; role: string };
export type WorkflowSave = (payload: object, notice: string) => Promise<boolean>;

export function SituationGuide({ team, guides, manager, readOnly, save, busy }: {
  team: string; guides: Playbook[]; manager: boolean; readOnly: boolean; save: WorkflowSave; busy: boolean;
}) {
  const [selected, setSelected] = useState<Situation>("unanswered");
  const guide = guides.find((item) => item.team === team && item.key === selected);
  const global = guides.find((item) => item.team === "" && item.key === selected);
  return <section className="policy workflowSection">
    <h2>Hướng dẫn theo tình huống</h2>
    <div className="planForm"><label>Tình huống đang gặp<select value={selected} onChange={(event) => setSelected(event.target.value as Situation)}>
      {Object.entries(situations).map(([key, value]) => <option key={key} value={key}>{value.title}</option>)}
    </select></label></div>
    <p className="weeklyNotes">{guide?.published || global?.published || situations[selected].content}</p>
    <small>{guide?.published || global?.published ? "Nội dung đã được quản lý duyệt." : "Hướng dẫn tham khảo để bắt đầu trao đổi."}</small>
    {manager && !readOnly && <GuideEditor key={team + selected + guide?.version} team={team} situation={selected} guide={guide} save={save} busy={busy} />}
  </section>;
}

function GuideEditor({ team, situation, guide, save, busy }: {
  team: string; situation: Situation; guide?: Playbook; save: WorkflowSave; busy: boolean;
}) {
  const [content, setContent] = useState(guide?.draft ?? guide?.published ?? situations[situation].content);
  const unchanged = content.trim() === guide?.draft;
  return <details className="weeklyDetails">
    <summary>Biên tập và duyệt hướng dẫn {team || "dùng chung"}</summary>
    <form className="planForm" onSubmit={(event) => {
      event.preventDefault();
      void save({ action: "playbook", team, key: situation, version: guide?.version ?? 0, operation: "draft", content }, "Đã lưu bản nháp hướng dẫn.");
    }}>
      <label>Nội dung hướng dẫn<textarea required rows={5} maxLength={4000} value={content} disabled={busy} onChange={(event) => setContent(event.target.value)} /></label>
      <p>Lưu bản nháp rồi duyệt để nhân viên trong nhóm sử dụng. Bản đã duyệt trước đó được dùng trong lúc biên tập.</p>
      <div className="rowActions"><button disabled={busy || !content.trim() || unchanged}>Lưu bản nháp</button>
        <button type="button" disabled={busy || !guide || !unchanged} onClick={() => void save({
          action: "playbook", team, key: situation, version: guide!.version, operation: "publish", content,
        }, "Đã duyệt hướng dẫn cho nhân viên.")}>Duyệt và sử dụng</button></div>
    </form>
  </details>;
}

export function PartnerSupport({ centerId, ownerTeam, requests, contacts, people, role, readOnly, save, busy }: {
  centerId: string; ownerTeam: string; requests: SupportRequest[]; contacts: Person[]; people: Person[];
  role?: string; readOnly: boolean; save: WorkflowSave; busy: boolean;
}) {
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [problem, setProblem] = useState("");
  const [assignee, setAssignee] = useState("");
  const eligible = contacts.filter((person) => person.role === "head" || person.team === ownerTeam);
  const chosen = eligible.some((person) => person.email === assignee) ? assignee : eligible.find((person) => person.role === "lead")?.email ?? eligible[0]?.email ?? "";
  const names = new Map([...contacts, ...people].map((person) => [person.email, person.name]));
  return <section className="policy workflowSection">
    <h2>Hỗ trợ xử lý đối tác</h2>
    <p>Ghi rõ vướng mắc và chọn người cần hỗ trợ. Các phản hồi được giữ trong cùng yêu cầu tới khi xử lý xong.</p>
    {!readOnly && <form className="planForm" onSubmit={async (event) => {
      event.preventDefault();
      if (await save({ action: "support-create", id: requestId, centerId, assignedTo: chosen, problem }, "Đã gửi yêu cầu hỗ trợ.")) {
        setProblem(""); setRequestId(crypto.randomUUID());
      }
    }}>
      <label>Vướng mắc cần hỗ trợ<textarea required rows={3} maxLength={2000} disabled={busy} value={problem} onChange={(event) => setProblem(event.target.value)} /></label>
      <label>Người hỗ trợ<select required value={chosen} disabled={busy || !eligible.length} onChange={(event) => setAssignee(event.target.value)}>
        {!eligible.length && <option value="">Chưa có người quản lý phù hợp</option>}
        {eligible.map((person) => <option key={person.email} value={person.email}>{person.name} · {person.team || "Trưởng khối"}</option>)}
      </select></label>
      {!eligible.length && <p>Trưởng khối cần thêm nhân sự quản lý và kiểm tra nhóm phụ trách để nhận yêu cầu.</p>}
      <button className="primary" disabled={busy || !chosen || !problem.trim()}>Gửi yêu cầu hỗ trợ</button>
    </form>}
    {!requests.length && <p>Chưa có yêu cầu hỗ trợ tại trung tâm này.</p>}
    {requests.map((request) => <details className="weeklyDetails" key={request.id} open={request.status !== "Đã giải quyết"}>
      <summary><span className="pill">{request.status}</span> {request.problem.slice(0, 90)}</summary>
      <p className="weeklyNotes">{request.problem}</p><small>Người hỗ trợ · {names.get(request.assignedTo) ?? request.assignedTo}</small>
      <ul className="weeklyTimeline">{request.messages.map((message, index) => <li key={index}>
        <small>{names.get(message.by) ?? message.by} · {new Date(message.at).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}</small>
        <p className="weeklyNotes">{message.text}</p>
      </li>)}</ul>
      {!readOnly && <SupportReply key={request.version} request={request} manager={role === "head" || role === "lead"} save={save} busy={busy} />}
    </details>)}
  </section>;
}

function SupportReply({ request, manager, save, busy }: { request: SupportRequest; manager: boolean; save: WorkflowSave; busy: boolean }) {
  const [note, setNote] = useState("");
  const [status, setStatus] = useState(request.status);
  return <form className="planForm" onSubmit={(event) => {
    event.preventDefault();
    void save({ action: "support-reply", id: request.id, version: request.version, note, ...(manager ? { status } : {}) }, "Đã lưu phản hồi hỗ trợ.");
  }}>
    <label>Phản hồi / hướng xử lý<textarea required maxLength={2000} rows={2} disabled={busy} value={note} onChange={(event) => setNote(event.target.value)} /></label>
    {manager && <label>Trạng thái xử lý<select disabled={busy} value={status} onChange={(event) => setStatus(event.target.value)}>
      {supportStatuses.map((value) => <option key={value}>{value}</option>)}
    </select></label>}
    <button disabled={busy || !note.trim()}>Lưu phản hồi</button>
  </form>;
}
