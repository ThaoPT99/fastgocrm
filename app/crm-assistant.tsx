"use client";

import { useState } from "react";
import { currentWeek, partnerAiModes, type CrmAiOutput, type PartnerAiMode } from "./ai-contract";
import { followupChannels } from "./crm";
import type { FollowupUpdate } from "./partner-followup";

export type AssistantRequest =
  | { action: "partner-ai"; centerId: string; mode: PartnerAiMode; note: string; channel: FollowupUpdate["channel"] }
  | { action: "weekly-ai"; teamReview: boolean; team?: string; from: string; to: string };
export type AskAssistant = (request: AssistantRequest) => Promise<CrmAiOutput>;

function AssistantResult({ result }: { result: CrmAiOutput }) {
  const [copied, setCopied] = useState("");
  return <div className="aiResult" role="status">
    <p>{result.summary}</p>
    {result.points.length > 0 && <ul>{result.points.map((point, index) => <li key={index}>{point}</li>)}</ul>}
    {result.message && <><h3>Tin nhắn nháp</h3><div className="aiMessage">{result.message}</div>
      <button type="button" onClick={async () => {
        try { await navigator.clipboard.writeText(result.message!); setCopied("Đã sao chép."); }
        catch { setCopied("Bạn có thể chọn và sao chép nội dung tin nhắn ở trên."); }
      }}>Sao chép tin nhắn</button><p>{copied}</p></>}
    <small>Gợi ý do AI tạo. Kiểm tra nội dung với dữ liệu thực tế trước khi sử dụng.</small>
  </div>;
}

export function PartnerAssistant({ centerId, ask, apply, disabled }: {
  centerId: string; ask: AskAssistant; apply: (draft: FollowupUpdate) => void; disabled: boolean;
}) {
  const [mode, setMode] = useState<PartnerAiMode>("summary");
  const [note, setNote] = useState("");
  const [channel, setChannel] = useState<FollowupUpdate["channel"]>("Cuộc gọi");
  const [result, setResult] = useState<CrmAiOutput>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const needsNote = mode === "message" || mode === "log";
  async function run() {
    if (busy || disabled || (needsNote && !note.trim())) return;
    setBusy(true); setError(""); setResult(undefined);
    try { setResult(await ask({ action: "partner-ai", centerId, mode, note, channel })); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Chưa nhận được kết quả từ AI."); }
    finally { setBusy(false); }
  }
  return <section className="policy planAi partnerAssistant" aria-busy={busy}>
    <h2>Trợ lý đối tác</h2>
    <p>Khi bấm tạo gợi ý, tên trung tâm, ghi chú và tối đa 30 hoạt động liên hệ, lịch hẹn gần nhất được gửi tới DeepSeek.</p>
    <div className="followupFilters aiTabs">{Object.entries(partnerAiModes).map(([key, label]) => <button type="button"
      key={key} disabled={busy || disabled} aria-pressed={mode === key} onClick={() => {
        setMode(key as PartnerAiMode); setNote(""); setResult(undefined); setError("");
      }}>{label}</button>)}</div>
    <div className="planForm">
      {needsNote && <label>{mode === "log" ? "Ghi nhanh việc vừa làm và kết quả" : "Mục đích tin nhắn"}
        <textarea rows={3} maxLength={2500} disabled={busy || disabled} value={note}
          onChange={(event) => { setNote(event.target.value); setResult(undefined); }} />
      </label>}
      {mode === "log" && <label>Hình thức đã dùng<select disabled={busy || disabled} value={channel} onChange={(event) => {
        setChannel(event.target.value as FollowupUpdate["channel"]); setResult(undefined);
      }}>{followupChannels.map((value) => <option key={value}>{value}</option>)}</select></label>}
      <button type="button" disabled={busy || disabled || (needsNote && !note.trim())} onClick={() => void run()}>
        {busy ? "AI đang xử lý…" : "Tạo gợi ý"}
      </button>
    </div>
    {error && <p className="notice error" role="alert">{error}</p>}
    {result && <AssistantResult result={result} />}
    {result?.draft && <div className="aiResult">
      <h3>Bản ghi đề xuất</h3><p><b>{result.draft.activity}</b></p><p>{result.draft.result}</p>
      {result.draft.nextDate && <p>Follow-up {result.draft.nextDate} · {result.draft.nextAction}</p>}
      <button type="button" disabled={disabled} onClick={() => apply({ ...result.draft!, channel })}>Đưa vào biểu mẫu để kiểm tra</button>
    </div>}
  </section>;
}

export function WeeklyAssistant({ day, team, canReviewTeam, ask }: {
  day: string; team: string; canReviewTeam: boolean; ask: AskAssistant;
}) {
  const [from, setFrom] = useState(currentWeek(day));
  const [to, setTo] = useState(day);
  const [result, setResult] = useState<CrmAiOutput>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function run(teamReview: boolean) {
    if (busy) return;
    if (!from || !to || from > to || Date.parse(to) - Date.parse(from) > 31 * 86_400_000) {
      setError("Chọn khoảng thời gian hợp lệ, tối đa 31 ngày."); return;
    }
    setBusy(true); setError(""); setResult(undefined);
    try { setResult(await ask({ action: "weekly-ai", teamReview, team: teamReview ? team : undefined, from, to })); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Chưa nhận được kết quả từ AI."); }
    finally { setBusy(false); }
  }
  return <section className="panel policy planAi">
    <h2>Trợ lý rà công việc và chuẩn bị họp</h2>
    <p>Gửi số liệu hoạt động, các ghi chú gần nhất và tiến độ KPI trong phạm vi của bạn tới DeepSeek khi bấm phân tích. Dữ liệu chi tiết được rút gọn; có thể đối chiếu đầy đủ ở nhật ký.</p>
    <div className="planForm"><div className="formGrid">
      <label>Từ ngày<input type="date" required disabled={busy} max={to || day} value={from} onChange={(event) => { setFrom(event.target.value); setResult(undefined); }} /></label>
      <label>Đến ngày<input type="date" required disabled={busy} min={from} max={day} value={to} onChange={(event) => { setTo(event.target.value); setResult(undefined); }} /></label>
    </div></div>
    <div className="rowActions">
      <button type="button" disabled={busy} onClick={() => void run(false)}>AI rà tuần của tôi</button>
      {canReviewTeam && <button type="button" disabled={busy} onClick={() => void run(true)}>AI chuẩn bị họp {team || "toàn đội"}</button>}
    </div>
    {busy && <p role="status">AI đang tổng hợp…</p>}
    {error && <p className="notice error" role="alert">{error}</p>}
    {result && <AssistantResult result={result} />}
  </section>;
}
