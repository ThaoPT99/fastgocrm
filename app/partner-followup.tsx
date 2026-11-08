"use client";

import { useState } from "react";
import { followupChannels, today, type NextOwner } from "./crm";
import { NextStepFields, readStep, stepValue, type StepValue } from "./next-step";

export type FollowupUpdate = {
  channel: (typeof followupChannels)[number];
  activity: string;
  result: string;
  nextAction: string;
  nextDate: string;
  nextOwner?: NextOwner;
  nextParty?: string;
  performedDate?: string;
};

export default function PartnerFollowup({ nextAction, nextDate, nextOwner, nextParty, initial, busy, onSave, onCancel }: {
  nextAction?: string | null; nextDate?: string | null; nextOwner?: NextOwner | null; nextParty?: string | null;
  initial?: FollowupUpdate; busy: boolean;
  onSave: (value: FollowupUpdate) => void; onCancel: () => void;
}) {
  const day = today();
  const [value, setValue] = useState({
    channel: initial?.channel ?? "Cuộc gọi", activity: initial?.activity ?? "", result: initial?.result ?? "",
    performedDate: initial?.performedDate ?? day,
  });
  const [step, setStep] = useState<StepValue>(() => initial ? {
    nextOwner: initial.nextOwner ?? (initial.nextAction ? "self" : "none"),
    nextParty: initial.nextParty ?? "", nextAction: initial.nextAction, nextDate: initial.nextDate,
  } : stepValue({ nextOwner, nextParty, followupAction: nextAction, followupDate: nextDate }));
  return <form className="form followupForm" onSubmit={(event) => {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    onSave({
      channel: String(fields.get("channel")) as FollowupUpdate["channel"],
      activity: String(fields.get("activity") ?? "").trim(),
      result: String(fields.get("result") ?? "").trim(),
      performedDate: String(fields.get("performedDate") ?? day),
      ...readStep(event.currentTarget),
    });
  }}>
    <div className="wideField"><h2>Ghi kết quả trao đổi</h2><p>Ghi lại việc đã diễn ra, kết quả và ai cần làm bước tiếp theo. Có thể cập nhật sau cuộc gặp hoặc cuộc gọi.</p></div>
    <div className="wideField"><small>Điền nhanh theo kết quả thực tế, rồi kiểm tra trước khi lưu.</small>
      <div className="rowActions">
        <button type="button" disabled={busy} onClick={() => {
          setValue({ ...value, activity: "Liên hệ trung tâm", result: "Chưa kết nối được với người phụ trách." });
          setStep({ nextOwner: "self", nextParty: "", nextAction: "Liên hệ lại người phụ trách", nextDate: "" });
        }}>Chưa kết nối được</button>
        <button type="button" disabled={busy} onClick={() => {
          setValue({ ...value, activity: "Trao đổi nhu cầu hợp tác", result: "Trung tâm đề nghị bổ sung thông tin trước khi trao đổi tiếp." });
          setStep({ nextOwner: "self", nextParty: "", nextAction: "Gửi thông tin trung tâm đang cần", nextDate: "" });
        }}>Cần thêm thông tin</button>
      </div>
    </div>
    <label>Ngày thực hiện<input name="performedDate" type="date" required max={day} value={value.performedDate}
      onInput={(event) => setValue({ ...value, performedDate: event.currentTarget.value })}
      onChange={(event) => setValue({ ...value, performedDate: event.target.value })} /></label>
    <label>Hình thức<select name="channel" value={value.channel} onChange={(event) => setValue({ ...value, channel: event.target.value as FollowupUpdate["channel"] })}>
      {followupChannels.map((channel) => <option key={channel}>{channel}</option>)}
    </select></label>
    <label>Đã làm gì<input name="activity" autoFocus required maxLength={180} value={value.activity}
      onChange={(event) => setValue({ ...value, activity: event.target.value })} /></label>
    <label className="wideField">Kết quả<textarea name="result" required rows={3} maxLength={4000} value={value.result}
      onChange={(event) => setValue({ ...value, result: event.target.value })} /></label>
    <NextStepFields value={step} change={setStep} />
    <div className="actions">
      <button type="button" disabled={busy} onClick={onCancel}>Hủy</button>
      <button className="primary" disabled={busy}>Lưu kết quả và bước tiếp theo</button>
    </div>
  </form>;
}
