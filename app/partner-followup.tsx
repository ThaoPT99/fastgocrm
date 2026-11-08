"use client";

import { useState } from "react";
import { followupChannels } from "./crm";

export type FollowupUpdate = {
  channel: (typeof followupChannels)[number];
  activity: string;
  result: string;
  nextAction: string;
  nextDate: string;
};

export default function PartnerFollowup({ nextAction, nextDate, initial, busy, onSave, onCancel }: {
  nextAction?: string | null;
  nextDate?: string | null;
  initial?: FollowupUpdate;
  busy: boolean;
  onSave: (value: FollowupUpdate) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState<FollowupUpdate>({
    channel: initial?.channel ?? "Cuộc gọi", activity: initial?.activity ?? "", result: initial?.result ?? "",
    nextAction: initial?.nextAction ?? nextAction ?? "", nextDate: initial?.nextDate ?? nextDate ?? "",
  });
  return <form className="form followupForm" onSubmit={(event) => { event.preventDefault(); onSave(value); }}>
    <div className="wideField"><h2>Cập nhật đối tác</h2><p>Ghi việc vừa làm và kết quả. CRM sẽ lưu vào lịch sử trung tâm và Nhật ký làm việc. Nếu cần liên hệ tiếp, ghi rõ việc cần làm và ngày thực hiện.</p></div>
    <label>Hình thức<select value={value.channel} onChange={(event) => setValue({ ...value, channel: event.target.value as FollowupUpdate["channel"] })}>
      {followupChannels.map((channel) => <option key={channel}>{channel}</option>)}
    </select></label>
    <label>Đã làm gì<input autoFocus required maxLength={180} value={value.activity}
      onChange={(event) => setValue({ ...value, activity: event.target.value })} /></label>
    <label className="wideField">Kết quả<textarea required rows={3} maxLength={4000} placeholder="Ví dụ Trung tâm quan tâm D2-6 và đề nghị gửi bảng phí" value={value.result}
      onChange={(event) => setValue({ ...value, result: event.target.value })} /></label>
    <label>Việc follow-up tiếp theo<input required={Boolean(value.nextDate)} maxLength={180} placeholder="Ví dụ Gửi bảng phí D2-6" value={value.nextAction}
      onChange={(event) => setValue({ ...value, nextAction: event.target.value })} /></label>
    <label>Ngày follow-up<input type="date" required={Boolean(value.nextAction.trim())} value={value.nextDate}
      onChange={(event) => setValue({ ...value, nextDate: event.target.value })} />
      {nextDate && <small>Đang điền ngày đã hẹn trước. Đổi ngày nếu bạn đã xử lý lần hẹn này.</small>}
    </label>
    <div className="actions">
      {(value.nextAction || value.nextDate) && <button type="button" onClick={() => setValue({ ...value, nextAction: "", nextDate: "" })}>Bỏ lịch follow-up</button>}
      <button type="button" disabled={busy} onClick={onCancel}>Hủy</button>
      <button className="primary" disabled={busy}>Lưu cập nhật</button>
    </div>
  </form>;
}
