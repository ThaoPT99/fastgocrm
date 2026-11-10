"use client";

import { useState } from "react";
import { partnerAiModes, type CrmAiOutput, type PartnerAiMode } from "./ai-contract";
import { followupChannels } from "./crm";
import type { FollowupUpdate } from "./partner-followup";

export type AssistantRequest =
  | { action: "partner-ai"; centerId: string; mode: PartnerAiMode; note: string; channel: FollowupUpdate["channel"] }
  | { action: "weekly-ai"; teamReview: boolean; team?: string; owner?: string; from: string; to: string };
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
    <p>Khi bấm tạo gợi ý, tên trung tâm, ghi chú và tối đa 30 hoạt động liên hệ, lịch hẹn gần nhất được gửi tới AI.</p>
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

export function WeeklyAssistant({ team, canReviewTeam, ask, range: { from, to }, owner, personLabel }: {
  team: string; canReviewTeam: boolean; ask: AskAssistant;
  range: { from: string; to: string }; owner?: string; personLabel?: string;
}) {
  const [report, setReport] = useState("");
  const [copyStatus, setCopyStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function run() {
    if (busy) return;
    setBusy(true); setError(""); setCopyStatus("");
    try {
      const result = await ask({ action: "weekly-ai", teamReview: canReviewTeam,
        team: canReviewTeam ? team : undefined, owner: canReviewTeam ? undefined : owner, from, to });
      setReport(result.summary);
    }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Chưa nhận được kết quả từ AI."); }
    finally { setBusy(false); }
  }
  return <section className="policy planAi" aria-busy={busy}>
    <h2>Báo cáo tuần bằng AI</h2>
    <p>Khi bấm tạo, số liệu và ghi chú gần nhất của {personLabel || team || "phạm vi đang xem"} trong tuần đã chọn sẽ được gửi tới AI.</p>
    <div className="rowActions">
      <button className="primary" type="button" disabled={busy} onClick={() => void run()}>
        {busy ? "AI đang tổng hợp…" : report ? "Tạo lại báo cáo" : "Tạo báo cáo tuần"}
      </button>
    </div>
    {error && <p className="notice error" role="alert">{error}</p>}
    {report && <div className="aiResult">
      <label>Bản nháp báo cáo<textarea rows={7} disabled={busy} value={report}
        onChange={(event) => { setReport(event.target.value); setCopyStatus(""); }} /></label>
      <button type="button" disabled={busy || !report.trim()} onClick={async () => {
        try { await navigator.clipboard.writeText(report.trim()); setCopyStatus("Đã sao chép báo cáo."); }
        catch { setCopyStatus("Bạn có thể chọn và sao chép đoạn văn trong ô báo cáo."); }
      }}>Sao chép báo cáo</button>
      {copyStatus && <p role="status">{copyStatus}</p>}
    </div>}
  </section>;
}
