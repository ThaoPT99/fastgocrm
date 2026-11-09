"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { categories, needsPartner, nextOwnerOf, nextOwners, partnerActivityKinds, roles, statuses, today, type Kind, type Role, type NextOwner } from "./crm";
import KpiPolicy from "./kpi-policy";
import KpiPlanner from "./kpi-planner";
import { quarterOf, type KpiPlan } from "./kpi-plan";
import PartnerFollowup from "./partner-followup";
import IntakeChecklistFields from "./intake-checklist-fields";
import SalesQueue from "./sales-queue";
import WorkGuide from "./work-guide";
import TodayPlan from "./today-plan";
import DailyGreeting from "./daily-greeting";
import type { PlanAnalysis } from "./plan-analysis";
import { PartnerAssistant, type AskAssistant } from "./crm-assistant";
import WeeklyWorkPanel from "./weekly-work-panel";
import type { FollowupUpdate } from "./partner-followup";
import PlanWatch from "./plan-watch";
import { checklistProgress, type IntakeChecklist } from "./intake-checklist";
import ContactPriorities from "./contact-priorities";
import { PartnerSupport, SituationGuide } from "./partner-tools";
import type { Playbook, SupportRequest } from "./sales-workflow";
import WorkNextSteps from "./work-next-steps";
import { NextStepEditor } from "./next-step";
import TeamDirectory, { type Team } from "./team-directory";

type Member = { email: string; name: string; team: string; role: Role };
type Entry = { id?: string; version?: number; kind: Kind; title: string; owner: string; status: string; date: string; partner: string; province?: string | null; partnerId?: string | null; notes: string; nextOwner?: NextOwner | null; nextParty?: string | null; followupDate?: string | null; followupAction?: string | null; loggedAt?: string | null; performedBy?: string | null; intakeChecklist?: IntakeChecklist | null };
type Data = { members: Member[]; teamDirectory?: Team[]; records: Entry[]; plans: (KpiPlan & { owner: string })[]; support: SupportRequest[]; supportContacts: Member[]; guides: Playbook[]; admin: boolean; ownerAdmin: boolean; salesMode: boolean; role: Role; email: string; demoCleared: boolean; partnersLinked: boolean; followupsReady: boolean; codeEmails: string[]; intakeCenters?: { id: string; title: string; owner: string }[] };
type View = "overview" | "workday" | "people" | "teams" | "kpi" | "plan" | "guide" | Kind;

const icons: Record<View, string> = { workday: "✓", overview: "▦", kpi: "↗", plan: "◫", guide: "?", partner: "◇", task: "✓", activity: "↗", meeting: "◷", intake: "▤", logwork: "▧", people: "◎", teams: "▦" };
const { logwork, ...otherCategories } = categories;
const views = { workday: "Việc hôm nay", overview: "Tổng quan", logwork, plan: "Kế hoạch KPI quý", kpi: "KPI & thưởng", ...otherCategories, people: "Nhân sự", teams: "Quản lý team", guide: "Hướng dẫn sử dụng" };
const navGroups: { label: string; items: View[] }[] = [
  { label: "LÀM VIỆC HẰNG NGÀY", items: ["workday", "partner", "meeting", "intake", "logwork"] },
  { label: "KẾ HOẠCH & BÁO CÁO", items: ["plan", "overview", "kpi"] },
  { label: "NỘI BỘ", items: ["people", "teams", "guide"] },
];
const descriptions: Record<View, string> = {
  workday: "Xử lý liên hệ đến hạn, lịch hẹn và hồ sơ cần bổ sung trong phạm vi của bạn.",
  partner: "Lưu đầu mối, ghi kết quả liên hệ và đặt bước tiếp theo tại từng trung tâm.",
  meeting: "Theo dõi các buổi gặp đã lên lịch với trung tâm và cập nhật trạng thái sau buổi gặp.",
  intake: "Theo dõi hồ sơ theo trung tâm và nhập số giấy tờ thực nhận trong checklist.",
  logwork: "Xem hoạt động theo ngày, tổng hợp công việc theo tuần và ghi việc nội bộ khi cần.",
  plan: "Tính mốc hồ sơ đạt chuẩn theo tuần, kiểm tra nguồn dự kiến và chọn đối tác cần ưu tiên.",
  overview: "Theo dõi hoạt động và kết quả trong phạm vi bạn phụ trách.",
  kpi: "Tra cứu chỉ tiêu hồ sơ và quy chế thưởng theo từng vai trò.",
  people: "Tra cứu nhân sự, vai trò và nhóm phụ trách.",
  teams: "Theo dõi cơ cấu team và quân số hiện tại.",
  guide: "Các bước làm việc trong CRM theo đúng vai trò đang mở.",
  task: "Xem công việc đã ghi tại trung tâm.",
  activity: "Xem lịch sử liên hệ với đối tác.",
};
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
const activityWhen = (entry: Entry) => entry.loggedAt && today(new Date(entry.loggedAt)) === entry.date
  ? entry.date + " · " + timeLabel.format(new Date(entry.loggedAt)) : entry.date;
const followupFilters = { all: "Tất cả", late: "Quá hạn", today: "Đến hẹn hôm nay", upcoming: "Sắp tới", none: "Chưa đặt lịch" };
type FollowupFilter = keyof typeof followupFilters;
function followupGroup(date: Entry["followupDate"], day: string): Exclude<FollowupFilter, "all"> {
  if (!date) return "none";
  return date < day ? "late" : date === day ? "today" : "upcoming";
}

export default function Dashboard({ name, initialView }: { name: string; initialView: "overview" | "intake" | "workday" }) {
  const [data, setData] = useState<Data>();
  const [selectedView, setView] = useState<View>(initialView);
  const [planningOwner, setPlanningOwner] = useState<string>();
  const [menuOpen, setMenuOpen] = useState(false);
  const [draft, setDraft] = useState<Entry>();
  const [person, setPerson] = useState<Member>();
  const [query, setQuery] = useState("");
  const [centerId, setCenterId] = useState<string>();
  const [centerOrigin, setCenterOrigin] = useState<View>();
  const [updatingCenter, setUpdatingCenter] = useState(false);
  const [followupDraft, setFollowupDraft] = useState<{ value: FollowupUpdate; revision: number }>();
  const [followupFilter, setFollowupFilter] = useState<FollowupFilter>("all");
  const [logDate, setLogDate] = useState(today);
  const [logMode, setLogMode] = useState<"day" | "week">("day");
  const [logTeam, setLogTeam] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pinTarget, setPinTarget] = useState<Member>();
  const [changingPin, setChangingPin] = useState(false);
  const [pinValue, setPinValue] = useState("");
  const [currentCode, setCurrentCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [exportingIntake, setExportingIntake] = useState(false);
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
    if (prepare && next.salesMode) setView("workday");
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
    if (previewRole) return false;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/crm", { method: "POST", headers: crmHeaders(true), body: JSON.stringify(payload) });
      const body = await res.json() as { error?: string; historicalOnly?: boolean; createdCenterId?: string };
      if (!res.ok) throw new Error(body.error || "Không lưu được dữ liệu.");
      if (signInAgain) {
        window.location.reload();
        return true;
      }
      const action = (payload as { action?: string }).action ?? "";
      if (!["support-create", "support-reply", "playbook"].includes(action)) {
        setDraft(undefined);
        setPerson(undefined);
        setUpdatingCenter(false);
        setFollowupDraft(undefined);
      }
      setMessage(body.historicalOnly ? "Đã ghi hoạt động ngày cũ vào lịch sử. Bước tiếp theo dùng bản cập nhật mới hơn." : notice);
      closePinForm();
      await refresh();
      if (firstCenterDraft && body.createdCenterId) setCenterId(body.createdCenterId);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không kết nối được.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function analyzePlan(plan: KpiPlan, owner: string): Promise<PlanAnalysis> {
    const response = await fetch("/api/crm", {
      method: "POST", headers: crmHeaders(true), signal: AbortSignal.timeout(50_000),
      body: JSON.stringify({ action: "analyze-plan", plan, owner }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Chưa phân tích được kế hoạch. Bạn thử lại sau.");
    return result.analysis;
  }

  const askAssistant: AskAssistant = async (request) => {
    const response = await fetch("/api/crm", {
      method: "POST", headers: crmHeaders(true), signal: AbortSignal.timeout(50_000),
      body: JSON.stringify(request),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Chưa nhận được kết quả từ AI.");
    return result.analysis;
  };

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
      changeView(activate ? "workday" : "overview");
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
    setFollowupDraft(undefined);
    setMenuOpen(false);
    setView(next);
    setCenterId(undefined);
    setCenterOrigin(undefined);
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
  const viewRole = previewRole || data?.role;
  const intakeOnly = viewRole === "intake" || (!data && initialView === "intake");
  const showWorkday = viewRole === "sale" || (!data && initialView === "workday");
  const view = intakeOnly && selectedView !== "guide" ? "intake" : selectedView === "workday" && !showWorkday ? "overview" : selectedView;
  const groups = intakeOnly ? [{ label: "TIẾP NHẬN", items: ["intake", "guide"] as View[] }] : navGroups;
  const readOnly = Boolean(previewRole);
  const managing = Boolean(data?.admin && !readOnly);
  const directory = data?.teamDirectory ?? [];
  const activeTeams = directory.filter((team) => team.active);
  const canSetCodes = !readOnly && data?.role === "head";
  const visible = roster.filter((member) => {
    if (previewRole === "lead") return Boolean(previewScope) && member.team === previewScope;
    if (previewRole === "sale") return member.email === previewScope && member.role === "sale";
    return true;
  });

  function changePreview(role: Role | "", target = "") {
    changeView(role === "sale" ? "workday" : view === "intake" && intakeOnly ? "overview" : view);
    setLogTeam("");
    setPreviewRole(role);
    setPreviewScope(target);
  }
  const people = new Map(visible.map((member) => [member.email, member]));
  const rows = (data?.records ?? []).filter((entry) => people.has(entry.owner));
  const centers = rows.filter((entry) => entry.kind === "partner");
  const intakeCenters = data?.intakeCenters ?? [];
  const centersById = new Map(centers.map((entry) => [entry.id, entry]));
  const selectedCenter = centerId ? centersById.get(centerId) : undefined;
  const firstCenterDraft = viewRole === "sale" && !centers.length && draft?.kind === "partner" && !draft.id;
  const linkedCenterName = (entry: Entry) => centersById.get(entry.partnerId ?? undefined)?.title
    ?? intakeCenters.find((center) => center.id === entry.partnerId)?.title ?? entry.partner;
  const intakeRows = view === "intake" ? rows.filter((entry) => entry.kind === "intake") : [];

  async function exportIntake() {
    setExportingIntake(true);
    setError("");
    try {
      const { intakeWorkbook } = await import("./intake-export");
      const workbook = await intakeWorkbook(intakeRows.map((entry) => {
        const owner = people.get(entry.owner);
        return { id: entry.id ?? "", title: entry.title, center: linkedCenterName(entry),
          owner: owner?.name ?? entry.owner, team: owner?.team ?? "", date: entry.date,
          status: entry.status, notes: entry.notes, checklist: entry.intakeChecklist };
      }));
      const url = URL.createObjectURL(workbook);
      const link = document.createElement("a");
      link.href = url;
      link.download = "fastgo-ho-so-tiep-nhan-" + today() + ".xlsx";
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch {
      setError("Chưa xuất được file Excel. Hãy thử lại.");
    } finally {
      setExportingIntake(false);
    }
  }
  const day = today();
  const latestContact = new Map<string, Entry>();
  for (const activity of rows) {
    if (activity.kind !== "activity" || !activity.partnerId) continue;
    const last = latestContact.get(activity.partnerId);
    if (!last || activity.date > last.date || (activity.date === last.date && (activity.loggedAt ?? "") >= (last.loggedAt ?? ""))) latestContact.set(activity.partnerId, activity);
  }
  const selectedContact = selectedCenter?.id ? latestContact.get(selectedCenter.id) : undefined;
  const lateCenters = centers.filter((center) => followupGroup(center.followupDate, day) === "late");
  const filtered = rows.filter((entry) => entry.kind === view &&
    (view !== "partner" || followupFilter === "all" || followupGroup(entry.followupDate, day) === followupFilter) &&
    [entry.title, linkedCenterName(entry), entry.province, entry.status, people.get(entry.owner)?.name].join(" ").toLocaleLowerCase("vi").includes(query.toLocaleLowerCase("vi").trim()));
  if (view === "partner") filtered.sort((a, b) => (a.followupDate ?? "9999").localeCompare(b.followupDate ?? "9999"));
  const intakeProgress = new Map(view === "intake"
    ? filtered.map((entry) => [entry, checklistProgress(entry.intakeChecklist)] as const) : []);
  if (view === "intake") {
    const incomplete = (entry: Entry) => {
      const progress = intakeProgress.get(entry)!;
      return Number(progress.completed < progress.total);
    };
    filtered.sort((a, b) => incomplete(b) - incomplete(a));
  }

  function openCenter(id: string | undefined, update = false) {
    changeView("partner");
    if (view !== "partner") setCenterOrigin(view);
    setCenterId(id);
    setUpdatingCenter(update);
  }

  function startEntry(kind: Kind, owner: string, partnerId?: string) {
    setDraft({ kind, owner, partnerId, title: "", status: statuses[kind][0], date: today(), partner: "", notes: "" });
  }
  function openFromWorkday(entry: Entry) {
    changeView(entry.kind);
    if (readOnly) setQuery(entry.title);
    else setDraft(entry);
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
      <div className="brandRow"><div className="brand"><b>F</b><div>Fastgo <strong>CRM</strong><small>KINH DOANH B2B</small></div></div>
        <button type="button" className="mobileMenu" aria-expanded={menuOpen} aria-controls="workspace-menu"
          onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? "Đóng menu" : "☰ Menu"}</button></div>
      <nav id="workspace-menu" className={menuOpen ? "workspaceNav menuOpen" : "workspaceNav"} aria-label="Điều hướng chính">{groups.map((group) =>
        <div className="navGroup" key={group.label}><span className="navLabel">{group.label}</span>
          {group.items.filter((key) => (key !== "workday" || showWorkday) && (key !== "teams" || managing)).map((key) =>
            <button key={key} aria-current={key === view ? "page" : undefined} onClick={() => changeView(key)}><span aria-hidden="true">{icons[key]}</span>{views[key]}</button>)}
        </div>)}</nav>
      <div className="sidebarFoot"><i /> Nội bộ Fastgo</div>
    </aside>
    <main>
      <header className="top"><span>Fastgo CRM / <b>{views[view]}</b></span><div><b>{name}</b> {data && !data.ownerAdmin && <>
        {" "}<button className="textButton" disabled={busy} onClick={() => { closePinForm(); setChangingPin(true); }}>Đổi mật mã</button>{" · "}
      </>}<button className="textButton" disabled={busy} onClick={signOutWithCode}>Đăng xuất</button></div></header>
      <div className="content">
        <div className="heading"><div><div className="eyebrow">FASTGO / VẬN HÀNH KINH DOANH</div>
          <h1>{views[view]}</h1><p>{descriptions[view]}</p></div>
          {viewRole && <span className="pill">{roles[viewRole]}</span>}
        </div>
        {error && <div className="notice error" role="alert">{error}</div>}
        {message && <div className="notice" role="status">{message}</div>}
        {data && (view === "overview" || (intakeOnly && view === "intake")) &&
          <DailyGreeting name={roster.find((member) => member.email === data.email)?.name ?? name} day={day} />}
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
          {previewRole && <span>{!previewScope && (previewRole === "lead" || previewRole === "sale") ? "Thêm nhân sự hoặc nhóm thật để xem dữ liệu trong phạm vi này." : "Đang xem thử · Chỉ xem"}</span>}
        </section>}
        {view === "guide" && viewRole && <WorkGuide role={viewRole} go={changeView} />}
        {view === "teams" && managing && <TeamDirectory teams={directory} members={roster} save={save} busy={busy} />}
        {data && (view === "overview" || (intakeOnly && view === "intake")) && <section className="toolbar startHere">
          <div><b>Mới sử dụng CRM?</b> <span>{intakeOnly ? "Xem cách tạo hồ sơ và ghi số giấy tờ đã nhận."
            : "Xem quy trình theo vai trò và cách rà kế hoạch của nhân sự."}</span></div>
          <button onClick={() => changeView("guide")}>Xem hướng dẫn</button>
        </section>}
        {data && view === "overview" && !intakeOnly && <PlanWatch day={day} members={visible}
          centers={centers} records={rows} plans={data.plans ?? []} personal={false}
          openPlan={(owner) => { setPlanningOwner(owner); changeView("plan"); }}
          openCenter={(id) => openCenter(id)} />}
        {data && view === "plan" && <KpiPlanner key={viewRole + previewScope + planningOwner} initialOwner={planningOwner} day={day} members={visible} centers={centers} records={rows}
          plans={data.plans ?? []} email={data.email}
          readOnly={readOnly} busy={busy} save={(plan) => void save({ action: "kpi-plan", plan }, "Đã lưu kế hoạch KPI.")}
          open={openCenter} goPartners={() => changeView("partner")} analyze={analyzePlan} />}
        {data && view === "kpi" && viewRole && viewRole !== "intake" && <KpiPolicy role={viewRole} />}
        {data && view === "workday" && <>
          {!readOnly && !centers.length && <section className="panel">
            <h2>Thêm trung tâm bạn định liên hệ</h2>
            <p>Sau khi lưu, bạn có thể đặt ngày liên hệ hoặc ghi lại cuộc trao đổi đã diễn ra.</p>
            <button className="primary" onClick={() => {
              changeView("partner");
              setCenterOrigin("workday");
              startEntry("partner", data.email);
            }}>Thêm trung tâm đầu tiên</button>
          </section>}
          {centers.length > 0 && <WorkNextSteps day={day} centers={centers} open={(id) => openCenter(id)} />}
          {centers.length > 0 && <ContactPriorities day={day} centers={centers} records={rows}
            plan={data.plans?.find((plan) => plan.owner === (previewRole ? previewScope : data.email) && plan.quarter === quarterOf(day))}
            open={(id) => openCenter(id)} />}
          <details className="panel policy compactDetails"><summary>Tiến độ kế hoạch</summary>
          <PlanWatch day={day} members={visible} centers={centers} records={rows} plans={data.plans ?? []} personal
            openPlan={(owner) => { setPlanningOwner(owner); changeView("plan"); }} openCenter={(id) => openCenter(id)} />
          <TodayPlan day={day} plan={data.plans?.find((plan) => plan.owner === (previewRole ? previewScope : data.email) && plan.quarter === quarterOf(day))}
            centers={centers} records={rows} goPlan={() => changeView("plan")} goPartners={() => changeView("partner")} />
          </details>
          <div className="toolbar">
            <b>{day.split("-").reverse().join("/")}</b>
            <div className="rowActions">
              <button onClick={() => changeView("plan")}>Kế hoạch KPI quý</button>
              <button onClick={() => changeView("logwork")}>Nhật ký làm việc</button>
              {!readOnly && centers.length > 0 && <button className="primary" onClick={() => { changeView("partner"); startEntry("partner", data.email); }}>+ Thêm trung tâm</button>}
            </div>
          </div>
          <DailyGreeting name={roster.find((member) => member.email === data.email)?.name ?? name} day={day} />
          <details className="panel policy compactDetails"><summary>Lịch hẹn và hồ sơ cần bổ sung</summary>
          <div className="salesQueues">
            <SalesQueue title="Lịch hẹn cần xử lý" empty="Không có lịch hẹn đang mở đến hôm nay." items={rows
              .filter((entry) => entry.kind === "meeting" && entry.status === "Đã lên lịch" && entry.date <= day)
              .map((entry) => ({ id: entry.id!, title: entry.title,
                detail: [linkedCenterName(entry), entry.date].filter(Boolean).join(" · "),
                badge: entry.date < day ? "Cần cập nhật" : "Hôm nay", urgent: entry.date < day,
                open: () => openFromWorkday(entry) }))} />
            <SalesQueue title="Hồ sơ cần bổ sung" empty="Không có hồ sơ thiếu giấy tờ." items={rows.flatMap((entry) => {
              if (entry.kind !== "intake") return [];
              const { completed, total } = checklistProgress(entry.intakeChecklist);
              if (completed === total) return [];
              return [{ id: entry.id!, title: entry.title, detail: linkedCenterName(entry) || "Chưa liên kết trung tâm",
                badge: "Thiếu " + (total - completed) + " mục", urgent: true, open: () => openFromWorkday(entry) }];
            })} />
          </div>
          </details>
        </>}
        {data && (view === "workday" || view === "overview") && (data.support ?? []).some((request) => request.status !== "Đã giải quyết" && centersById.has(request.centerId)) &&
          <section className="panel policy"><h2>Yêu cầu hỗ trợ đang mở</h2>
            <ul className="planPriorities">{(data.support ?? []).filter((request) => request.status !== "Đã giải quyết" && centersById.has(request.centerId))
              .sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map((request) => <li key={request.id}><div>
                <b>{centersById.get(request.centerId)?.title}</b><p>{request.problem.slice(0, 180)}</p>
                <small>{request.status} · Người hỗ trợ {data.supportContacts?.find((person) => person.email === request.assignedTo)?.name ?? request.assignedTo}</small>
              </div><button onClick={() => openCenter(request.centerId)}>Xem và phản hồi</button></li>)}</ul>
          </section>}
        {data && view === "logwork" && <div className="followupFilters" aria-label="Chế độ xem nhật ký">
          <button aria-pressed={logMode === "day"} onClick={() => { setLogMode("day"); setDraft(undefined); }}>Theo ngày</button>
          <button aria-pressed={logMode === "week"} onClick={() => { setLogMode("week"); setDraft(undefined); }}>Tổng hợp tuần</button>
        </div>}
        {data && view === "logwork" && logMode === "week" && <WeeklyWorkPanel key={viewRole + previewScope}
          day={day} members={visible} records={rows} team={logTeam} setTeam={setLogTeam} readOnly={readOnly}
          canReviewTeam={viewRole === "head" || viewRole === "lead"} ask={askAssistant} openCenter={(id) => openCenter(id)} />}
        {data && view === "logwork" && logMode === "day" && <section className="panel">
          <div className="sectionHead">
            <div><h2>Hoạt động theo ngày</h2><p>Kết quả trao đổi được ghi vào nhật ký của người thực hiện theo đúng ngày đã làm. Mỗi người có thể ghi thêm hoạt động nội bộ.</p></div>
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
          <div className="tableWrap mobileCards"><table role="table"><thead><tr><th>Nhân sự</th><th>Hoạt động trong ngày</th>{showLogActions && <th>Thao tác</th>}</tr></thead><tbody>
            {logMembers.map((member) => {
              const activities = (dailyActivities.get(member.email) ?? [])
                .sort((a, b) => (b.loggedAt ?? b.date).localeCompare(a.loggedAt ?? a.date));
              const ownLog = showLogActions && member.email === data.email;
              return <tr key={member.email}>
                <td><b>{member.name}</b><small>{roles[member.role]}{member.team && " · " + member.team}</small></td>
                <td data-label="Hoạt động trong ngày">{activities.length ? activities.map((entry) => {
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
                {showLogActions && <td className="rowActions">{ownLog && <button disabled={busy} onClick={() => setDraft({
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
          <div className="tableWrap mobileCards"><table role="table"><thead><tr><th>Nhân sự / Team</th><th>Công việc hoàn tất</th><th>Lượt liên hệ</th><th>Hồ sơ hoàn tất</th></tr></thead><tbody>
            {teams.map((team) => {
              const teamMembers = visible.filter((member) => member.team === team);
              return <tr key={team} className="teamRow"><td>{team}</td><td data-label="Công việc hoàn tất">{teamMembers.reduce((sum, member) => sum + (counts.get(member.email)?.tasks ?? 0), 0)}</td><td data-label="Lượt liên hệ">{teamMembers.reduce((sum, member) => sum + (counts.get(member.email)?.contacts ?? 0), 0)}</td><td data-label="Hồ sơ hoàn tất">{teamMembers.reduce((sum, member) => sum + (counts.get(member.email)?.intakes ?? 0), 0)}</td></tr>;
            })}
            {visible.map((member) => <tr key={member.email}><td>{member.name}<small>{member.team || roles[member.role]}</small></td><td data-label="Công việc hoàn tất">{counts.get(member.email)?.tasks ?? 0}</td><td data-label="Lượt liên hệ">{counts.get(member.email)?.contacts ?? 0}</td><td data-label="Hồ sơ hoàn tất">{counts.get(member.email)?.intakes ?? 0}</td></tr>)}
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
            <label>Team<select required={person.role === "lead" || person.role === "sale"} value={person.team} onChange={(e) => setPerson({ ...person, team: e.target.value })}>
              <option value="">{person.role === "lead" || person.role === "sale" ? "Chọn team" : "Không thuộc team"}</option>
              {activeTeams.map((team) => <option key={team.name} value={team.name}>{team.name}</option>)}
            </select></label>
            {!activeTeams.length && (person.role === "lead" || person.role === "sale") && <div>
              <p>Cần có team hoạt động trước khi gán nhân sự.</p>
              <button type="button" disabled={busy} onClick={() => changeView("teams")}>Đi tới Quản lý team</button>
            </div>}
            <div className="actions"><button type="button" onClick={() => setPerson(undefined)}>Hủy</button><button className="primary" disabled={busy}>Lưu nhân sự</button></div>
          </form>}
          <div className="tableWrap mobileCards"><table role="table"><thead><tr><th>Họ tên</th><th>Email</th><th>Vai trò</th><th>Team</th>{canSetCodes && <th>Thao tác</th>}</tr></thead><tbody>
          {visible.map((member) => <tr key={member.email}><td><b>{member.name}</b></td><td data-label="Email">{member.email}</td><td data-label="Vai trò">{roles[member.role]}</td><td data-label="Nhóm">{member.team || "—"}</td>{canSetCodes && <td className="rowActions">
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
          <div className="sectionHead"><div><div className="eyebrow">HỒ SƠ TRUNG TÂM</div><h2 ref={centerHeading} tabIndex={-1}>{selectedCenter.title}</h2><p>{people.get(selectedCenter.owner)?.name} · {selectedCenter.status}</p><p>Tỉnh/thành phố · {selectedCenter.province || "Chưa cập nhật"}</p></div>
            <div className="rowActions"><button onClick={() => {
              if (centerOrigin) changeView(centerOrigin);
              else { setCenterId(undefined); setUpdatingCenter(false); }
            }}>{centerOrigin ? "Về " + views[centerOrigin] : "Đóng hồ sơ"}</button>
              {!readOnly && <button className="primary" disabled={busy || updatingCenter} onClick={() => { setDraft(undefined); setFollowupDraft(undefined); setUpdatingCenter(true); }}>Ghi kết quả trao đổi</button>}</div></div>
          <div className="currentFollowup"><b>{nextOwners[nextOwnerOf(selectedCenter)]}{selectedCenter.nextParty && " · " + selectedCenter.nextParty}</b>
            {selectedCenter.followupDate ? <span>{selectedCenter.followupAction} · <span className={followupGroup(selectedCenter.followupDate, day) === "late" ? "pill danger" : "pill"}>{selectedCenter.followupDate}</span></span>
              : <span>Chưa đặt lịch</span>}
          </div>
          {selectedContact && <div className="sectionHead">
            <div><b>Lần trao đổi gần nhất</b><p>{activityWhen(selectedContact)} · {selectedContact.title}</p>
              {selectedContact.notes && <div className="notes">{selectedContact.notes}</div>}</div>
          </div>}
          {!readOnly && <NextStepEditor key={selectedCenter.id + ":step:" + selectedCenter.version} center={selectedCenter} save={save} disabled={busy || updatingCenter} />}
          {!readOnly && <details className="policy compactDetails workflowSection"><summary>Trợ lý AI</summary><PartnerAssistant key={selectedCenter.id + ":" + selectedCenter.version} centerId={selectedCenter.id!} ask={askAssistant} disabled={busy} apply={(value) => {
            if (updatingCenter && !window.confirm("Bạn đang mở biểu mẫu cập nhật. Thay nội dung bằng bản nháp AI?")) return;
            setDraft(undefined);
            setFollowupDraft((previous) => ({ value, revision: (previous?.revision ?? 0) + 1 }));
            setUpdatingCenter(true);
          }} /></details>}
          {updatingCenter && <PartnerFollowup key={selectedCenter.id + ":" + (followupDraft?.revision ?? 0)} initial={followupDraft?.value} nextAction={selectedCenter.followupAction} nextDate={selectedCenter.followupDate}
            nextOwner={selectedCenter.nextOwner} nextParty={selectedCenter.nextParty} busy={busy}
            onCancel={() => setUpdatingCenter(false)}
            onSave={(update) => void save({ action: "followup", centerId: selectedCenter.id, version: selectedCenter.version, ...update }, "Đã lưu kết quả và bước tiếp theo.")} />}
          <details className="policy compactDetails workflowSection"><summary>Hướng dẫn theo tình huống</summary>
          <SituationGuide key={selectedCenter.id + ":guide"} team={people.get(selectedCenter.owner)?.team ?? ""} guides={data.guides ?? []}
            manager={viewRole === "head" || viewRole === "lead"} readOnly={readOnly} save={save} busy={busy} />
          </details>
          <details className="policy compactDetails workflowSection"><summary>Yêu cầu hỗ trợ</summary>
          <PartnerSupport key={selectedCenter.id + ":support"} centerId={selectedCenter.id!} ownerTeam={people.get(selectedCenter.owner)?.team ?? ""}
            requests={(data.support ?? []).filter((request) => request.centerId === selectedCenter.id)} contacts={data.supportContacts ?? []}
            people={visible} role={viewRole} readOnly={readOnly} save={save} busy={busy} />
          </details>
          <details className="policy compactDetails workflowSection"><summary>Lịch sử, lịch hẹn và hồ sơ</summary>
          <div className="centerTimeline">{(["activity", ...partnerActivityKinds.filter((kind) => kind !== "activity")] as const).map((kind) => {
            const linked = rows.filter((entry) => entry.partnerId === selectedCenter.id && entry.kind === kind)
              .sort((a, b) => b.date.localeCompare(a.date) || (b.loggedAt ?? "").localeCompare(a.loggedAt ?? ""));
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
          </details>
        </section>}
        {data && kinds.includes(view as Kind) && (view !== "logwork" || draft) && (view !== "partner" || !selectedCenter || draft) && <section className="panel">
          {view !== "logwork" && !firstCenterDraft && <div className="sectionHead"><input className="search" type="search" aria-label="Tìm bản ghi" placeholder={view === "partner" ? "Tìm theo tên, tỉnh/thành phố…" : "Tìm theo tên, đối tác, trạng thái…"} value={query} onChange={(e) => setQuery(e.target.value)} />
            {view === "intake" && <button disabled={exportingIntake || !intakeRows.length} onClick={exportIntake}>
              {exportingIntake ? "Đang xuất Excel…" : "Xuất Excel"}
            </button>}
            {!readOnly && intakeOnly && <button className="primary" disabled={busy || !intakeCenters.length} onClick={() => startEntry("intake", "")}>+ Tạo hồ sơ mới</button>}
            {!readOnly && !intakeOnly && view !== "task" && view !== "activity" && <button className="primary" disabled={busy || !visible.length} onClick={() => {
              const owner = people.has(data.email) ? data.email : visible[0].email;
              setUpdatingCenter(false);
              startEntry(view as Kind, owner);
            }}>+ Thêm {itemLabels[view as Kind]}</button>}</div>}
          {view === "partner" && !firstCenterDraft && <div className="followupFilters" aria-label="Lọc follow-up">
            {(Object.keys(followupFilters) as FollowupFilter[]).map((key) => <button key={key} aria-pressed={key === followupFilter} onClick={() => setFollowupFilter(key)}>
              {followupFilters[key]} <b>{key === "all" ? centers.length : centers.filter((center) => followupGroup(center.followupDate, day) === key).length}</b>
            </button>)}
          </div>}
          {!visible.length && !readOnly && !intakeOnly && <div className="empty"><p>Cần có nhân sự phụ trách trước khi thêm bản ghi.</p>{managing && <button onClick={() => { changeView("people"); setPerson(emptyMember); }}>Thêm nhân sự</button>}</div>}
          {intakeOnly && !readOnly && !intakeCenters.length && <p className="empty">Cần có trung tâm B2B trước khi tạo hồ sơ tiếp nhận.</p>}
          {firstCenterDraft && <h2>Thêm trung tâm đầu tiên</h2>}
          {draft && <form className="form" onSubmit={(event: FormEvent) => { event.preventDefault(); void save({ action: "record", record: draft }, draft.kind === "partner" ? "Đã lưu trung tâm." : "Đã lưu bản ghi."); }}>
            <label>{draft.kind === "logwork" ? draft.id && !draft.loggedAt ? "Việc tiếp theo" : "Hoạt động đã làm" : draft.kind === "partner" ? "Tên trung tâm" : draft.kind === "intake" ? "Tên học sinh / mã hồ sơ" : "Tiêu đề"}<input ref={titleField} required maxLength={180} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></label>
            {draft.kind === "partner" && <label>Tỉnh/thành phố<input maxLength={100} value={draft.province ?? ""}
              onChange={(event) => setDraft({ ...draft, province: event.target.value })} /></label>}
            {!firstCenterDraft && <>
            <label>Người phụ trách<select disabled={draft.kind === "logwork" || intakeOnly} value={draft.owner} onChange={(e) => setDraft({ ...draft, owner: e.target.value, partnerId: undefined })}>{intakeOnly && <option value="">Theo trung tâm đã chọn</option>}{visible.map((member) => <option key={member.email} value={member.email}>{member.name}</option>)}</select></label>
            <label>Trạng thái<select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })}>{statuses[draft.kind].map((status) => <option key={status}>{status}</option>)}</select></label>
            <label>{draft.kind === "task" ? "Hạn xử lý" : "Ngày"}<input type="date" readOnly={draft.kind === "logwork"} required value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} /></label>
            </>}
            {intakeOnly ? <label>Trung tâm B2B{draft.id ? <input value={linkedCenterName(draft)} readOnly />
              : <select required value={draft.partnerId ?? ""} onChange={(event) => {
                const center = intakeCenters.find((item) => item.id === event.target.value);
                setDraft({ ...draft, partnerId: center?.id, owner: center?.owner ?? "" });
              }}>
                <option value="">Chọn trung tâm đã có</option>
                {intakeCenters.map((center) => <option key={center.id} value={center.id}>{center.title} · {people.get(center.owner)?.name}</option>)}
              </select>}</label>
            : needsPartner(draft.kind) ? <label>Trung tâm B2B
              <select required value={draft.partnerId ?? ""} onChange={(event) => setDraft({ ...draft, partnerId: event.target.value || undefined })}>
                <option value="">Chọn trung tâm đã có</option>
                {centers.filter((center) => center.owner === draft.owner).map((center) => <option key={center.id} value={center.id}>{center.title}</option>)}
              </select>
              {draft.partner && !draft.partnerId && <small>Tên trung tâm đã nhập trước đây: {draft.partner}</small>}
              {!centers.some((center) => center.owner === draft.owner) && <small>Người phụ trách chưa có trung tâm. Hãy thêm trung tâm trong mục Đối tác B2B trước.</small>}
            </label> : <label>{draft.kind === "logwork" ? "Vướng mắc / cần hỗ trợ" : "Đầu mối liên hệ"}<input required={draft.kind === "logwork" && draft.status === "Cần hỗ trợ"} maxLength={180} value={draft.partner} onChange={(e) => setDraft({ ...draft, partner: e.target.value })} /></label>}
            <label>{draft.kind === "logwork" ? "Kết quả / ghi chú" : "Ghi chú"}<textarea maxLength={4000} rows={3} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} /></label>
            {draft.kind === "intake" && <IntakeChecklistFields value={draft.intakeChecklist} onChange={(value) => setDraft({ ...draft, intakeChecklist: value })} />}
            <div className="actions"><button type="button" disabled={busy} onClick={() => {
              if (firstCenterDraft && centerOrigin) changeView(centerOrigin);
              else setDraft(undefined);
            }}>Hủy</button><button className="primary" disabled={busy}>{draft.kind === "intake" ? "Lưu hồ sơ" : draft.kind === "partner" ? "Lưu trung tâm" : "Lưu bản ghi"}</button></div>
          </form>}
          {view !== "logwork" && !firstCenterDraft && <div className="tableWrap mobileCards"><table role="table"><thead><tr><th>{view === "partner" ? "Trung tâm" : view === "intake" ? "Hồ sơ học sinh" : "Tiêu đề"}</th><th>Phụ trách</th><th>{view === "partner" ? "Follow-up tiếp theo" : "Ngày"}</th><th>Trạng thái</th>{!readOnly && <th>Thao tác</th>}</tr></thead><tbody>
          {filtered.map((entry) => {
            const progress = intakeProgress.get(entry);
            const missing = progress ? progress.total - progress.completed : 0;
            return <tr key={entry.id}><td>
            {entry.kind === "partner" ? <button className="textButton" onClick={() => openCenter(entry.id)}>{entry.title}</button> : <b>{entry.title}</b>}
            {entry.kind === "partner" && <small>{nextOwners[nextOwnerOf(entry)]}{entry.nextParty && " · " + entry.nextParty}</small>}
            {entry.kind === "partner" && entry.province && <small>{entry.province}</small>}
            {entry.partnerId ? <small>{intakeOnly ? linkedCenterName(entry) : <button className="textButton" onClick={() => openCenter(entry.partnerId ?? undefined)}>{linkedCenterName(entry)}</button>}</small> :
              needsPartner(entry.kind) ? <small>Chưa liên kết trung tâm{entry.partner && " · " + entry.partner}</small> : entry.partner && <small>{entry.partner}</small>}
            {entry.kind === "partner" && latestContact.has(entry.id ?? "") && <small>Lần cuối {activityWhen(latestContact.get(entry.id ?? "")!)} · {latestContact.get(entry.id ?? "")?.title}</small>}
            {entry.notes && <details><summary>Ghi chú</summary><div className="notes">{entry.notes}</div></details>}
            {progress && <details className="intakeDetails"><summary>Checklist · {progress.completed}/{progress.total} mục đủ số lượng
              {missing > 0 && <> <span className="pill danger">Thiếu {missing} mục</span></>}
            </summary>
              <IntakeChecklistFields value={entry.intakeChecklist} /></details>}</td><td data-label="Phụ trách">{people.get(entry.owner)?.name}</td>
            <td data-label={view === "partner" ? "Follow-up" : "Ngày"}>{view === "partner" ? entry.followupDate ? <><span className={followupGroup(entry.followupDate, day) === "late" ? "pill danger" : "pill"}>{entry.followupDate}</span><small>{entry.followupAction}</small></> : "Chưa đặt lịch" : entry.date}</td>
            <td data-label="Trạng thái"><span className={overdue(entry) ? "pill danger" : "pill"}>{overdue(entry) ? "Quá hạn" : entry.status}</span></td>
            {!readOnly && <td className="rowActions">{view === "partner" && <button disabled={busy} onClick={() => openCenter(entry.id, true)}>Ghi kết quả trao đổi</button>}
              {!entry.loggedAt && <><button disabled={busy} onClick={() => { setUpdatingCenter(false); setDraft(entry); }}>{entry.kind === "intake" ? "Cập nhật số lượng" : "Sửa"}</button>{!intakeOnly && <button disabled={busy} onClick={() => { if (window.confirm("Xóa bản ghi này?")) void save({ action: "remove", id: entry.id, version: entry.version }, "Đã xóa bản ghi."); }}>Xóa</button>}</>}
            </td>}</tr>;
          })}
          {!filtered.length && <tr><td colSpan={readOnly ? 4 : 5} className="empty">Chưa có bản ghi phù hợp.</td></tr>}
          </tbody></table></div>}
        </section>}
      </div>
    </main>
  </div>;
}
