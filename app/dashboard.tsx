"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { categories, needsPartner, partnerActivityKinds, roles, statuses, today, type Kind, type Role } from "./crm";
import KpiPolicy from "./kpi-policy";
import PartnerFollowup from "./partner-followup";

type Member = { email: string; name: string; team: string; role: Role };
type Entry = { id?: string; version?: number; kind: Kind; title: string; owner: string; status: string; date: string; partner: string; partnerId?: string | null; notes: string; followupDate?: string | null; followupAction?: string | null; loggedAt?: string | null; performedBy?: string | null };
type Data = { members: Member[]; records: Entry[]; admin: boolean; ownerAdmin: boolean; salesMode: boolean; role: Role; email: string; demoCleared: boolean; partnersLinked: boolean; followupsReady: boolean; codeEmails: string[] };
type View = "overview" | "people" | "kpi" | Kind;

const icons: Record<View, string> = { overview: "▦", kpi: "↗", partner: "◇", task: "✓", activity: "↗", meeting: "◷", intake: "▤", logwork: "▧", people: "◎" };
const { logwork, ...otherCategories } = categories;
const views = { overview: "Tổng quan", logwork, kpi: "KPI & thưởng", ...otherCategories, people: "Nhân sự" };
const navigation = (Object.keys(views) as View[]).filter((key) => key !== "task" && key !== "activity");
const kinds = Object.keys(categories) as Kind[];
const itemLabels: Record<Kind, string> = { partner: "trung tâm", task: "công việc", activity: "lượt liên hệ", meeting: "lịch hẹn", intake: "hồ sơ", logwork: "nhật ký" };
const emptyMember: Member = { email: "", name: "", role: "sale", team: "" };
const salesModeKey = "fastgo-work-as-sales";
function crmHeaders(json = false) {
  const headers = new Headers();
  if (json) headers.set("Content-Type", "application/json");
  if (sessionStorage.getItem(salesModeKey) === "1") headers.set("x-fastgo-work-mode", "sales");
  return headers;
}
const overdue = (entry: Entry) => entry.kind === "task" && entry.date < today() && entry.status !== "Hoàn tất";
const timeLabel = new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit" });
const activityWhen = (entry: Entry) => entry.loggedAt ? entry.date + " · " + timeLabel.format(new Date(entry.loggedAt)) : entry.date;
const followupFilters = { all: "Tất cả", late: "Quá hạn", today: "Đến hẹn hôm nay", upcoming: "Sắp tới", none: "Chưa đặt lịch" };
type FollowupFilter = keyof typeof followupFilters;
function followupGroup(date: Entry["followupDate"], day: string): Exclude<FollowupFilter, "all"> {
  if (!date) return "none";
  return date < day ? "late" : date === day ? "today" : "upcoming";
}

export default function Dashboard({ name }: { name: string }) {
  const [data, setData] = useState<Data>();
  const [view, setView] = useState<View>("overview");
  const [draft, setDraft] = useState<Entry>();
  const [person, setPerson] = useState<Member>();
  const [query, setQuery] = useState("");
  const [centerId, setCenterId] = useState<string>();
  const [updatingCenter, setUpdatingCenter] = useState(false);
  const [followupFilter, setFollowupFilter] = useState<FollowupFilter>("all");
  const [logDate, setLogDate] = useState(today);
  const [logTeam, setLogTeam] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pinTarget, setPinTarget] = useState<Member>();
  const [changingPin, setChangingPin] = useState(false);
  const [pinValue, setPinValue] = useState("");
  const [currentCode, setCurrentCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [previewRole, setPreviewRole] = useState<Role | "">("");
  const [previewScope, setPreviewScope] = useState("");
  const titleField = useRef<HTMLInputElement>(null);
  const centerHeading = useRef<HTMLHeadingElement>(null);
  const draftKey = draft ? draft.id ?? "new" : undefined;

  async function refresh(prepare = false) {
    const res = await fetch("/api/crm", { cache: "no-store", headers: crmHeaders() });
    const body = await res.json() as { error?: string };
    if (!res.ok) throw new Error(body.error || "Không tải được dữ liệu.");
    const next = body as Data;
    if (prepare && next.admin && (!next.demoCleared || !next.partnersLinked || !next.followupsReady)) {
      const actions = [
        ...(!next.demoCleared ? ["clear-demo"] : []),
        ...(!next.partnersLinked ? ["link-partners"] : []),
        ...(!next.followupsReady ? ["initialize-followups"] : []),
      ];
      for (const action of actions) {
        const response = await fetch("/api/crm", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }),
        });
        if (!response.ok) throw new Error(action === "clear-demo" ? "Chưa dọn xong dữ liệu mẫu. Hãy tải lại trang." : "Chưa chuyển xong dữ liệu cũ. Hãy tải lại trang.");
      }
      return refresh();
    }
    setData(next);
  }
  useEffect(() => { void refresh(true).catch((err) => setError(err.message)); }, []);
  useEffect(() => {
    if (draftKey) titleField.current?.focus();
  }, [draftKey]);
  useEffect(() => {
    if (centerId) centerHeading.current?.focus();
  }, [centerId]);

  async function save(payload: object, notice: string, signInAgain = false) {
    if (previewRole) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/crm", { method: "POST", headers: crmHeaders(true), body: JSON.stringify(payload) });
      const body = await res.json() as { error?: string };
      if (!res.ok) throw new Error(body.error || "Không lưu được dữ liệu.");
      if (signInAgain) {
        window.location.reload();
        return;
      }
      setDraft(undefined);
      setPerson(undefined);
      setUpdatingCenter(false);
      setMessage(notice);
      closePinForm();
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không kết nối được.");
    } finally {
      setBusy(false);
    }
  }

  function closePinForm() {
    setPinTarget(undefined);
    setChangingPin(false);
    setPinValue("");
    setCurrentCode("");
  }

  async function signOutWithCode() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/access", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "logout" }),
      });
      if (!res.ok) throw new Error();
      window.location.reload();
    } catch {
      setError("Chưa đăng xuất được. Hãy thử lại.");
      setBusy(false);
    }
  }

  async function switchSalesMode(activate: boolean) {
    setBusy(true);
    setError("");
    try {
      if (activate) {
        const res = await fetch("/api/crm", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "start-sales-mode" }),
        });
        if (!res.ok) throw new Error("Chưa mở được chế độ Sales. Hãy thử lại.");
        sessionStorage.setItem(salesModeKey, "1");
      } else {
        sessionStorage.removeItem(salesModeKey);
      }
      setPreviewRole("");
      setPreviewScope("");
      setLogTeam("");
      changeView(activate ? "partner" : view);
      await refresh(true);
    } catch (err) {
      if (activate) sessionStorage.removeItem(salesModeKey);
      else sessionStorage.setItem(salesModeKey, "1");
      setError(err instanceof Error ? err.message : "Chưa đổi được chế độ làm việc.");
    } finally {
      setBusy(false);
    }
  }

  function changeView(next: View) {
    setView(next);
    setCenterId(undefined);
    setUpdatingCenter(false);
    setFollowupFilter("all");
    setQuery("");
    setDraft(undefined);
    setPerson(undefined);
    closePinForm();
    setMessage("");
    setError("");
  }

  const roster = data?.members ?? [];
  const previewTeams = [...new Set(roster.map((member) => member.team).filter(Boolean))];
  const previewSales = roster.filter((member) => member.role === "sale");
  const readOnly = Boolean(previewRole);
  const managing = Boolean(data?.admin && !readOnly);
  const canSetCodes = !readOnly && data?.role === "head";
  const viewRole = previewRole || data?.role;
  const visible = roster.filter((member) => {
    if (previewRole === "lead") return Boolean(previewScope) && member.team === previewScope;
    if (previewRole === "sale") return member.email === previewScope && member.role === "sale";
    return true;
  });

  function changePreview(role: Role | "", target = "") {
    changeView(view);
    setLogTeam("");
    setPreviewRole(role);
    setPreviewScope(target);
  }
  const people = new Map(visible.map((member) => [member.email, member]));
  const rows = (data?.records ?? []).filter((entry) => people.has(entry.owner));
  const centers = rows.filter((entry) => entry.kind === "partner");
  const centersById = new Map(centers.map((entry) => [entry.id, entry]));
  const selectedCenter = centerId ? centersById.get(centerId) : undefined;
  const linkedCenterName = (entry: Entry) => centersById.get(entry.partnerId ?? undefined)?.title ?? entry.partner;
  const day = today();
  const latestContact = new Map<string, Entry>();
  for (const activity of rows) {
    if (activity.kind !== "activity" || !activity.partnerId) continue;
    const last = latestContact.get(activity.partnerId);
    if (!last || (activity.loggedAt ?? activity.date) >= (last.loggedAt ?? last.date)) latestContact.set(activity.partnerId, activity);
  }
  const lateCenters = centers.filter((center) => followupGroup(center.followupDate, day) === "late");
  const filtered = rows.filter((entry) => entry.kind === view &&
    (view !== "partner" || followupFilter === "all" || followupGroup(entry.followupDate, day) === followupFilter) &&
    [entry.title, linkedCenterName(entry), entry.status, people.get(entry.owner)?.name].join(" ").toLocaleLowerCase("vi").includes(query.toLocaleLowerCase("vi").trim()));
  if (view === "partner") filtered.sort((a, b) => (a.followupDate ?? "9999").localeCompare(b.followupDate ?? "9999"));

  function openCenter(id: string | undefined, update = false) {
    changeView("partner");
    setCenterId(id);
    setUpdatingCenter(update);
  }

  function startEntry(kind: Kind, owner: string, partnerId?: string) {
    setDraft({ kind, owner, partnerId, title: "", status: statuses[kind][0], date: today(), partner: "", notes: "" });
  }
  const logMembers = visible.filter((member) => !logTeam || member.team === logTeam);
  const dailyActivities = new Map<string, Entry[]>();
  for (const entry of rows) {
    if (entry.date !== logDate || (entry.kind !== "activity" && entry.kind !== "logwork")) continue;
    const actor = entry.performedBy ?? entry.owner;
    const entries = dailyActivities.get(actor) ?? [];
    entries.push(entry);
    dailyActivities.set(actor, entries);
  }
  const membersWithLog = logMembers.filter((member) => dailyActivities.has(member.email)).length;
  const membersNeedingHelp = logMembers.filter((member) => dailyActivities.get(member.email)
    ?.some((entry) => entry.status === "Cần hỗ trợ")).length;
  const showLogActions = !readOnly && logMembers.some((member) => member.email === data?.email);
  const stats = [
    { label: "Đối tác B2B", value: rows.filter((r) => r.kind === "partner").length, view: "partner" },
    { label: "Follow-up quá hạn", value: lateCenters.length, view: "partner", filter: "late" },
    { label: "Lịch hẹn sắp tới", value: rows.filter((r) => r.kind === "meeting" && r.status === "Đã lên lịch" && r.date >= today()).length, view: "meeting" },
    { label: "Hồ sơ đang mở", value: rows.filter((r) => r.kind === "intake" && r.status !== "Hoàn tất").length, view: "intake" },
  ] as const;
  const teams = [...new Set(visible.map((member) => member.team).filter(Boolean))];
  const counts = new Map<string, { tasks: number; contacts: number; intakes: number }>();
  for (const row of rows) {
    const total = counts.get(row.owner) ?? { tasks: 0, contacts: 0, intakes: 0 };
    if (row.kind === "task" && row.status === "Hoàn tất") total.tasks++;
    if (row.kind === "activity") total.contacts++;
    if (row.kind === "intake" && row.status === "Hoàn tất") total.intakes++;
    counts.set(row.owner, total);
  }

  return <div className="shell">
    <aside>
      <div className="brand"><b>F</b><div>Fastgo <strong>CRM</strong><small>KINH DOANH B2B</small></div></div>
      <span className="navLabel">KHÔNG GIAN LÀM VIỆC</span>
      <nav aria-label="Điều hướng chính">{navigation.map((key) =>
        <button key={key} aria-current={key === view ? "page" : undefined} onClick={() => changeView(key)}><span>{icons[key]}</span>{views[key]}</button>)}</nav>
      <div className="sidebarFoot"><i /> Nội bộ Fastgo</div>
    </aside>
    <main>
      <header className="top"><span>Fastgo CRM / <b>{views[view]}</b></span><div><b>{name}</b> {data && !data.ownerAdmin && <>
        {" "}<button className="textButton" disabled={busy} onClick={() => { closePinForm(); setChangingPin(true); }}>Đổi mật mã</button>{" · "}
      </>}<button className="textButton" disabled={busy} onClick={signOutWithCode}>Đăng xuất</button></div></header>
      <div className="content">
        <div className="heading"><div><div className="eyebrow">FASTGO / VẬN HÀNH KINH DOANH</div>
          <h1>{views[view]}</h1><p>{view === "overview" ? "Theo dõi hoạt động, công việc và hiệu suất đội kinh doanh." : view === "people" ? "Danh sách nhân sự, vai trò và team phụ trách." : view === "kpi" ? "Chỉ tiêu hồ sơ và quy chế thưởng theo từng vai trò." : "Theo dõi và cập nhật dữ liệu trong phạm vi của bạn."}</p></div>
          {viewRole && <span className="pill">{roles[viewRole]}</span>}
        </div>
        {error && <div className="notice error" role="alert">{error}</div>}
        {message && <div className="notice" role="status">{message}</div>}
        {changingPin && <section className="panel"><form className="form" onSubmit={(event) => {
          event.preventDefault();
          void save({ action: "change-passcode", currentCode, newCode: pinValue }, "", true);
        }}>
          <label>Mật mã hiện tại<input type="password" autoComplete="current-password" required maxLength={100} value={currentCode}
            onChange={(event) => setCurrentCode(event.target.value)} /></label>
          <label>Mật mã mới<input type="password" inputMode="numeric" pattern="[0-9]{8}" autoComplete="new-password" required maxLength={8} value={pinValue}
            onChange={(event) => setPinValue(event.target.value)} /><small>Nhập 8 chữ số. Bạn sẽ đăng nhập lại bằng mã mới.</small></label>
          <div className="actions"><button type="button" onClick={closePinForm}>Hủy</button><button className="primary" disabled={busy}>Lưu mật mã</button></div>
        </form></section>}
        {!data && !error && <div className="panel">Đang tải dữ liệu…</div>}
        {data?.ownerAdmin && <section className="toolbar">
          <span>{data.salesMode ? "Đang làm việc như Sales · Chỉ hồ sơ bạn phụ trách" : "Dùng tài khoản này để trực tiếp làm việc với đối tác dưới vai trò Sales."}</span>
          <button className="primary" disabled={busy} onClick={() => switchSalesMode(!data.salesMode)}>
            {data.salesMode ? "Về Quản trị viên" : "Làm việc như Sales"}
          </button>
        </section>}
        {data?.admin && <section className="toolbar previewToolbar">
          <label>Xem theo vai trò <select value={previewRole} disabled={busy} onChange={(event) => {
            const role = event.target.value as Role | "";
            changePreview(role, role === "lead" ? previewTeams[0] : role === "sale" ? previewSales[0]?.email : "");
          }}>
            <option value="">Quản trị viên</option>
            {Object.entries(roles).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select></label>
          {previewRole === "lead" && <label>Nhóm <select value={previewScope} onChange={(event) => changePreview("lead", event.target.value)}>
            {!previewTeams.length && <option value="">Chưa có nhóm</option>}
            {previewTeams.map((team) => <option key={team}>{team}</option>)}
          </select></label>}
          {previewRole === "sale" && <label>Nhân sự <select value={previewScope} onChange={(event) => changePreview("sale", event.target.value)}>
            {!previewSales.length && <option value="">Chưa có Sales</option>}
            {previewSales.map((member) => <option key={member.email} value={member.email}>{member.name} · {member.team}</option>)}
          </select></label>}
          {readOnly && <span>{!previewScope && previewRole !== "head" ? "Thêm nhân sự hoặc nhóm thật để xem dữ liệu trong phạm vi này." : "Đang xem thử · Chỉ xem"}</span>}
        </section>}
        {data && view === "kpi" && <KpiPolicy role={previewRole || data.role} />}
        {data && view === "logwork" && <section className="panel">
          <div className="sectionHead">
            <div><h2>Hoạt động theo ngày</h2><p>Cập nhật đối tác tự vào nhật ký của người thao tác. Mỗi người có thể ghi thêm từng hoạt động nội bộ trong ngày.</p></div>
            <div className="logFilters">
              <label>Ngày <input type="date" required value={logDate} onChange={(event) => {
                if (event.target.value) { setLogDate(event.target.value); setDraft(undefined); }
              }} /></label>
              {teams.length > 1 && <label>Nhóm <select value={logTeam} onChange={(event) => { setLogTeam(event.target.value); setDraft(undefined); }}>
                <option value="">Tất cả nhóm</option>{teams.map((team) => <option key={team}>{team}</option>)}
              </select></label>}
            </div>
          </div>
          <div className="logSummary">
            <span className="pill">Đã có cập nhật {membersWithLog}/{logMembers.length}</span>
            <span className="pill">Chưa có cập nhật {logMembers.length - membersWithLog}</span>
            <span className="pill danger">Cần hỗ trợ {membersNeedingHelp}</span>
          </div>
          {managing && !people.has(data.email) && <div className="sectionHead">
            <p>Thêm tài khoản của bạn vào Nhân sự để ghi nhật ký Trưởng khối.</p>
            <button onClick={() => { changeView("people"); setPerson({ email: data.email, name, role: "head", team: "" }); }}>Thêm hồ sơ của tôi</button>
          </div>}
          <div className="tableWrap"><table><thead><tr><th>Nhân sự</th><th>Hoạt động trong ngày</th>{showLogActions && <th>Thao tác</th>}</tr></thead><tbody>
            {logMembers.map((member) => {
              const activities = (dailyActivities.get(member.email) ?? [])
                .sort((a, b) => (b.loggedAt ?? b.date).localeCompare(a.loggedAt ?? a.date));
              const ownLog = showLogActions && member.email === data.email;
              return <tr key={member.email}>
                <td><b>{member.name}</b><small>{roles[member.role]}{member.team && " · " + member.team}</small></td>
                <td>{activities.length ? activities.map((entry) => {
                  const contact = entry.kind === "activity";
                  const time = entry.loggedAt && today(new Date(entry.loggedAt)) === logDate ? timeLabel.format(new Date(entry.loggedAt)) : "";
                  return <div className="logContact" key={entry.id}>
                    <small>{[time, contact ? entry.status : entry.loggedAt ? "Hoạt động nội bộ" : "Nhật ký cũ"].filter(Boolean).join(" · ")}</small>
                    <b>{entry.kind === "logwork" && !entry.loggedAt ? "Việc tiếp theo · " : ""}{entry.title}</b>
                    {contact && entry.partnerId && <small><button className="textButton" onClick={() => openCenter(entry.partnerId ?? undefined)}>{linkedCenterName(entry)}</button></small>}
                    {contact && !entry.performedBy && <small>Bản ghi cũ · Theo người phụ trách</small>}
                    {entry.notes && <div className="notes">{entry.notes}</div>}
                    {contact && entry.followupDate && <small>Hẹn {entry.followupDate} · {entry.followupAction}</small>}
                    {!contact && entry.partner && <div className="notes"><b>Vướng mắc</b> {entry.partner}</div>}
                    {!contact && entry.status === "Cần hỗ trợ" && <span className="pill danger">Cần hỗ trợ</span>}
                    {!contact && ownLog && <small><button className="textButton" disabled={busy} onClick={() => setDraft(entry)}>Sửa hoạt động</button></small>}
                  </div>;
                }) : <span className="pill">Chưa ghi hoạt động</span>}</td>
                {showLogActions && <td>{ownLog && <button disabled={busy} onClick={() => setDraft({
                  kind: "logwork", owner: member.email, date: logDate, title: "", notes: "", partner: "", status: "Đã cập nhật",
                })}>+ Ghi hoạt động</button>}</td>}
              </tr>;
            })}
            {!logMembers.length && <tr><td colSpan={showLogActions ? 3 : 2} className="empty">Chưa có nhân sự trong phạm vi này.</td></tr>}
          </tbody></table></div>
        </section>}
        {data && view === "overview" && <>
          <div className="metrics">{stats.map((stat) => <button key={stat.label} className="metric" onClick={() => { changeView(stat.view); if ("filter" in stat) setFollowupFilter(stat.filter); }}><span className="metricIcon">{icons[stat.view]}</span><span>{stat.label}</span><strong>{stat.value}</strong></button>)}</div>
          <section className="panel"><div className="sectionHead"><div><h2>Hiệu suất kinh doanh</h2><p>Tổng hợp dữ liệu trong phạm vi bạn được xem</p></div></div>
          <div className="tableWrap"><table><thead><tr><th>Nhân sự / Team</th><th>Công việc hoàn tất</th><th>Lượt liên hệ</th><th>Hồ sơ hoàn tất</th></tr></thead><tbody>
            {teams.map((team) => {
              const teamMembers = visible.filter((member) => member.team === team);
              return <tr key={team} className="teamRow"><td>{team}</td><td>{teamMembers.reduce((sum, member) => sum + (counts.get(member.email)?.tasks ?? 0), 0)}</td><td>{teamMembers.reduce((sum, member) => sum + (counts.get(member.email)?.contacts ?? 0), 0)}</td><td>{teamMembers.reduce((sum, member) => sum + (counts.get(member.email)?.intakes ?? 0), 0)}</td></tr>;
            })}
            {visible.map((member) => <tr key={member.email}><td>{member.name}<small>{member.team || roles[member.role]}</small></td><td>{counts.get(member.email)?.tasks ?? 0}</td><td>{counts.get(member.email)?.contacts ?? 0}</td><td>{counts.get(member.email)?.intakes ?? 0}</td></tr>)}
            {!visible.length && <tr><td colSpan={4} className="empty">Chưa có nhân sự trong phạm vi này.</td></tr>}
          </tbody></table></div></section>
          <section className="panel"><div className="sectionHead"><h2>Follow-up quá hạn</h2></div>{lateCenters.length ? <ul className="alerts">{lateCenters.map((center) => <li key={center.id}><button className="textButton" onClick={() => openCenter(center.id)}>{center.title}</button> · {center.followupAction} <span className="pill danger">{center.followupDate}</span></li>)}</ul> : <p className="empty">Không có trung tâm trễ hẹn follow-up.</p>}</section>
        </>}
        {data && view === "people" && <section className="panel">
          <div className="sectionHead"><div><h2>{visible.length} nhân sự</h2>{canSetCodes && <p>Đặt mã riêng gồm 8 chữ số. Khi đổi mã, các phiên đăng nhập bằng mã cũ sẽ kết thúc.</p>}</div>{managing && <button className="primary" onClick={() => { closePinForm(); setPerson(emptyMember); }}>+ Thêm nhân sự</button>}</div>
          {canSetCodes && pinTarget && <form className="form" onSubmit={(event) => {
            event.preventDefault();
            void save({ action: "passcode", email: pinTarget.email, operation: "assign", code: pinValue }, "Đã đặt mật mã cho " + pinTarget.name + ".");
          }}>
            <label>Mật mã của {pinTarget.name}<input type="password" inputMode="numeric" pattern="[0-9]{8}" required maxLength={8} autoComplete="new-password" value={pinValue}
              onChange={(event) => setPinValue(event.target.value)} /><small>Nhập 8 chữ số và gửi riêng cho nhân sự.</small></label>
            <div className="actions"><button type="button" onClick={closePinForm}>Hủy</button><button className="primary" disabled={busy}>Đặt mật mã</button></div>
          </form>}
          {person && <form className="form" onSubmit={(event: FormEvent) => { event.preventDefault(); void save({ action: "member", member: person }, "Đã lưu nhân sự."); }}>
            <label>Họ tên<input required maxLength={100} value={person.name} onChange={(e) => setPerson({ ...person, name: e.target.value })} /></label>
            <label>Email<input type="email" required maxLength={254} value={person.email} onChange={(e) => setPerson({ ...person, email: e.target.value })} /></label>
            <label>Vai trò<select value={person.role} onChange={(e) => setPerson({ ...person, role: e.target.value as Role })}>{Object.entries(roles).map(([key, role]) => <option key={key} value={key}>{role}</option>)}</select></label>
            <label>Team<input required={person.role !== "head"} maxLength={60} placeholder="Ví dụ Team 01" value={person.team} onChange={(e) => setPerson({ ...person, team: e.target.value })} /></label>
            <div className="actions"><button type="button" onClick={() => setPerson(undefined)}>Hủy</button><button className="primary" disabled={busy}>Lưu nhân sự</button></div>
          </form>}
          <div className="tableWrap"><table><thead><tr><th>Họ tên</th><th>Email</th><th>Vai trò</th><th>Team</th>{canSetCodes && <th>Thao tác</th>}</tr></thead><tbody>
          {visible.map((member) => <tr key={member.email}><td><b>{member.name}</b></td><td>{member.email}</td><td>{roles[member.role]}</td><td>{member.team || "—"}</td>{canSetCodes && <td className="rowActions">
            {managing && <button disabled={busy} onClick={() => { closePinForm(); setPerson(member); }}>Đổi vai trò</button>}
            {(managing || member.role !== "head") && <>
              <button disabled={busy} onClick={() => { closePinForm(); setPerson(undefined); setPinTarget(member); }}>
                {data.codeEmails.includes(member.email) ? "Đặt mã mới" : "Đặt mật mã"}
              </button>
              {data.codeEmails.includes(member.email) && <button disabled={busy} onClick={() => save({ action: "passcode", email: member.email, operation: "revoke" }, "Đã thu hồi mật mã.")}>Thu hồi mã</button>}
            </>}
          </td>}</tr>)}
          </tbody></table></div>
        </section>}
        {data && view === "partner" && selectedCenter && <section className="panel">
          <div className="sectionHead"><div><div className="eyebrow">HỒ SƠ TRUNG TÂM</div><h2 ref={centerHeading} tabIndex={-1}>{selectedCenter.title}</h2><p>{people.get(selectedCenter.owner)?.name} · {selectedCenter.status}</p></div>
            <div className="rowActions"><button onClick={() => { setCenterId(undefined); setUpdatingCenter(false); }}>Đóng hồ sơ</button>
              {!readOnly && <button className="primary" disabled={busy || updatingCenter} onClick={() => { setDraft(undefined); setUpdatingCenter(true); }}>Cập nhật đối tác</button>}</div></div>
          <div className="currentFollowup"><b>Follow-up tiếp theo</b>
            {selectedCenter.followupDate ? <span>{selectedCenter.followupAction} · <span className={followupGroup(selectedCenter.followupDate, day) === "late" ? "pill danger" : "pill"}>{selectedCenter.followupDate}</span></span>
              : <span>Chưa đặt lịch</span>}
          </div>
          {updatingCenter && <PartnerFollowup key={selectedCenter.id} nextAction={selectedCenter.followupAction} nextDate={selectedCenter.followupDate} busy={busy}
            onCancel={() => setUpdatingCenter(false)}
            onSave={(update) => save({ action: "followup", centerId: selectedCenter.id, version: selectedCenter.version, ...update }, "Đã lưu hoạt động và cập nhật follow-up.")} />}
          <div className="centerTimeline">{(["activity", ...partnerActivityKinds.filter((kind) => kind !== "activity")] as const).map((kind) => {
            const linked = rows.filter((entry) => entry.partnerId === selectedCenter.id && entry.kind === kind)
              .sort((a, b) => (b.loggedAt ?? b.date).localeCompare(a.loggedAt ?? a.date));
            return <section key={kind}>
              <div className="sectionHead"><h2>{kind === "activity" ? "Lịch sử hoạt động" : kind === "task" ? "Công việc đã ghi" : categories[kind]} <span className="pill">{linked.length}</span></h2>
                {!readOnly && (kind === "meeting" || kind === "intake") && <button disabled={busy} onClick={() => { changeView(kind); startEntry(kind, selectedCenter.owner, selectedCenter.id); }}>+ Thêm {itemLabels[kind]}</button>}</div>
              {linked.length ? <ul>{linked.map((entry) => <li key={entry.id}>
                {entry.loggedAt || readOnly ? <b>{entry.title}</b> : <button className="textButton" disabled={busy} onClick={() => { changeView(kind); setDraft(entry); }}>{entry.title}</button>}
                <small>{activityWhen(entry)} · {overdue(entry) ? "Quá hạn" : entry.status}</small>
                {kind === "activity" && entry.notes && <div className="notes">{entry.notes}</div>}
                {entry.followupDate && <small>Hẹn {entry.followupDate} · {entry.followupAction}</small>}
              </li>)}</ul> : <p className="empty">Chưa có bản ghi.</p>}
            </section>;
          })}</div>
        </section>}
        {data && kinds.includes(view as Kind) && (view !== "logwork" || draft) && <section className="panel">
          {view !== "logwork" && <div className="sectionHead"><input className="search" type="search" aria-label="Tìm bản ghi" placeholder="Tìm theo tên, đối tác, trạng thái…" value={query} onChange={(e) => setQuery(e.target.value)} />
            {!readOnly && view !== "task" && view !== "activity" && <button className="primary" disabled={busy || !visible.length} onClick={() => {
              const owner = people.has(data.email) ? data.email : visible[0].email;
              setUpdatingCenter(false);
              startEntry(view as Kind, owner);
            }}>+ Thêm {itemLabels[view as Kind]}</button>}</div>}
          {view === "partner" && <div className="followupFilters" aria-label="Lọc follow-up">
            {(Object.keys(followupFilters) as FollowupFilter[]).map((key) => <button key={key} aria-pressed={key === followupFilter} onClick={() => setFollowupFilter(key)}>
              {followupFilters[key]} <b>{key === "all" ? centers.length : centers.filter((center) => followupGroup(center.followupDate, day) === key).length}</b>
            </button>)}
          </div>}
          {!visible.length && !readOnly && <div className="empty"><p>Cần có nhân sự phụ trách trước khi thêm bản ghi.</p>{managing && <button onClick={() => { changeView("people"); setPerson(emptyMember); }}>Thêm nhân sự</button>}</div>}
          {draft && <form className="form" onSubmit={(event: FormEvent) => { event.preventDefault(); void save({ action: "record", record: draft }, "Đã lưu bản ghi."); }}>
            <label>{draft.kind === "logwork" ? draft.id && !draft.loggedAt ? "Việc tiếp theo" : "Hoạt động đã làm" : draft.kind === "partner" ? "Tên trung tâm" : "Tiêu đề"}<input ref={titleField} required maxLength={180} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></label>
            <label>Người phụ trách<select disabled={draft.kind === "logwork"} value={draft.owner} onChange={(e) => setDraft({ ...draft, owner: e.target.value, partnerId: undefined })}>{visible.map((member) => <option key={member.email} value={member.email}>{member.name}</option>)}</select></label>
            <label>Trạng thái<select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })}>{statuses[draft.kind].map((status) => <option key={status}>{status}</option>)}</select></label>
            <label>{draft.kind === "task" ? "Hạn xử lý" : "Ngày"}<input type="date" readOnly={draft.kind === "logwork"} required value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} /></label>
            {needsPartner(draft.kind) ? <label>Trung tâm B2B
              <select required value={draft.partnerId ?? ""} onChange={(event) => setDraft({ ...draft, partnerId: event.target.value || undefined })}>
                <option value="">Chọn trung tâm đã có</option>
                {centers.filter((center) => center.owner === draft.owner).map((center) => <option key={center.id} value={center.id}>{center.title}</option>)}
              </select>
              {draft.partner && !draft.partnerId && <small>Tên trung tâm đã nhập trước đây: {draft.partner}</small>}
              {!centers.some((center) => center.owner === draft.owner) && <small>Người phụ trách chưa có trung tâm. Hãy thêm trung tâm trong mục Đối tác B2B trước.</small>}
            </label> : <label>{draft.kind === "logwork" ? "Vướng mắc / cần hỗ trợ" : "Đầu mối liên hệ"}<input required={draft.kind === "logwork" && draft.status === "Cần hỗ trợ"} maxLength={180} value={draft.partner} onChange={(e) => setDraft({ ...draft, partner: e.target.value })} /></label>}
            <label>{draft.kind === "logwork" ? "Kết quả / ghi chú" : "Ghi chú"}<textarea maxLength={4000} rows={3} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} /></label>
            <div className="actions"><button type="button" onClick={() => setDraft(undefined)}>Hủy</button><button className="primary" disabled={busy}>Lưu bản ghi</button></div>
          </form>}
          {view !== "logwork" && <div className="tableWrap"><table><thead><tr><th>{view === "partner" ? "Trung tâm" : "Tiêu đề"}</th><th>Phụ trách</th><th>{view === "partner" ? "Follow-up tiếp theo" : "Ngày"}</th><th>Trạng thái</th>{!readOnly && <th>Thao tác</th>}</tr></thead><tbody>
          {filtered.map((entry) => <tr key={entry.id}><td>
            {entry.kind === "partner" ? <button className="textButton" onClick={() => openCenter(entry.id)}>{entry.title}</button> : <b>{entry.title}</b>}
            {entry.partnerId ? <small><button className="textButton" onClick={() => openCenter(entry.partnerId ?? undefined)}>{linkedCenterName(entry)}</button></small> :
              needsPartner(entry.kind) ? <small>Chưa liên kết trung tâm{entry.partner && " · " + entry.partner}</small> : entry.partner && <small>{entry.partner}</small>}
            {entry.kind === "partner" && latestContact.has(entry.id ?? "") && <small>Lần cuối {activityWhen(latestContact.get(entry.id ?? "")!)} · {latestContact.get(entry.id ?? "")?.title}</small>}
            {entry.notes && <details><summary>Ghi chú</summary><div className="notes">{entry.notes}</div></details>}</td><td>{people.get(entry.owner)?.name}</td>
            <td>{view === "partner" ? entry.followupDate ? <><span className={followupGroup(entry.followupDate, day) === "late" ? "pill danger" : "pill"}>{entry.followupDate}</span><small>{entry.followupAction}</small></> : "Chưa đặt lịch" : entry.date}</td>
            <td><span className={overdue(entry) ? "pill danger" : "pill"}>{overdue(entry) ? "Quá hạn" : entry.status}</span></td>
            {!readOnly && <td className="rowActions">{view === "partner" && <button disabled={busy} onClick={() => openCenter(entry.id, true)}>Cập nhật đối tác</button>}
              {!entry.loggedAt && <><button disabled={busy} onClick={() => { setUpdatingCenter(false); setDraft(entry); }}>Sửa</button><button disabled={busy} onClick={() => { if (window.confirm("Xóa bản ghi này?")) void save({ action: "remove", id: entry.id, version: entry.version }, "Đã xóa bản ghi."); }}>Xóa</button></>}
            </td>}</tr>)}
          {!filtered.length && <tr><td colSpan={readOnly ? 4 : 5} className="empty">Chưa có bản ghi phù hợp.</td></tr>}
          </tbody></table></div>}
        </section>}
      </div>
    </main>
  </div>;
}
