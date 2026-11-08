"use client";

import { useState } from "react";
import { nextOwnerOf, nextOwners, type NextOwner, type NextStep } from "./crm";
import type { WorkflowSave } from "./partner-tools";

export type StepValue = { nextOwner: NextOwner; nextParty: string; nextAction: string; nextDate: string };
export function stepValue(step: NextStep): StepValue {
  return { nextOwner: nextOwnerOf(step), nextParty: step.nextParty ?? "", nextAction: step.followupAction ?? "", nextDate: step.followupDate ?? "" };
}
export function readStep(form: HTMLFormElement): StepValue {
  const fields = new FormData(form);
  return { nextOwner: String(fields.get("nextOwner") ?? "none") as NextOwner,
    nextParty: String(fields.get("nextParty") ?? "").trim(),
    nextAction: String(fields.get("nextAction") ?? "").trim(), nextDate: String(fields.get("nextDate") ?? "") };
}

export function NextStepFields({ value, change }: { value: StepValue; change: (value: StepValue) => void }) {
  return <>
    <label>Bước tiếp theo thuộc về ai?<select name="nextOwner" value={value.nextOwner} onChange={(event) => {
      const nextOwner = event.target.value as NextOwner;
      change({ ...value, nextOwner, nextParty: nextOwner === "support" ? value.nextParty : "",
        ...(nextOwner === "none" ? { nextAction: "", nextDate: "" } : {}) });
    }}>{Object.entries(nextOwners).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
    {value.nextOwner !== "none" && <>
      {value.nextOwner === "support" && <label>Đang chờ ai hoặc bộ phận nào?<input name="nextParty" required maxLength={100}
        value={value.nextParty} onChange={(event) => change({ ...value, nextParty: event.target.value })} /></label>}
      <label>{value.nextOwner === "self" ? "Việc cần làm tiếp theo" : "Đang chờ việc gì?"}<input name="nextAction" required maxLength={180}
        value={value.nextAction} onChange={(event) => change({ ...value, nextAction: event.target.value })} /></label>
      <label>{value.nextOwner === "self" ? "Ngày cần làm" : "Ngày cần hỏi lại nếu chưa có kết quả"}<input name="nextDate" type="date" required
        value={value.nextDate} onInput={(event) => change({ ...value, nextDate: event.currentTarget.value })}
        onChange={(event) => change({ ...value, nextDate: event.target.value })} /></label>
      <small className="wideField">{value.nextOwner === "self" ? "Đến ngày này, việc xuất hiện trong Đến lượt mình làm."
        : "Trước ngày hẹn, trung tâm nằm trong Đang chờ người khác. Đến ngày hẹn, CRM đưa vào Đến lúc hỏi lại."}</small>
    </>}
  </>;
}

export function NextStepEditor({ center, save, disabled }: {
  center: NextStep & { id?: string; version?: number }; save: WorkflowSave; disabled: boolean;
}) {
  const [value, setValue] = useState(() => stepValue(center));
  return <details className="policy workflowSection">
    <summary>Đặt hoặc đổi bước tiếp theo</summary>
    <p>Dùng khi lên lịch hoặc đổi người đang chờ xử lý. Ghi việc đã diễn ra bằng Ghi kết quả trao đổi.</p>
    <form className="form" onSubmit={(event) => {
      event.preventDefault();
      void save({ action: "next-step", centerId: center.id, version: center.version, ...readStep(event.currentTarget) }, "Đã cập nhật bước tiếp theo.");
    }}>
      <fieldset className="nextStepGrid" disabled={disabled}><NextStepFields value={value} change={setValue} /></fieldset>
      <div className="actions"><button className="primary" disabled={disabled}>Lưu bước tiếp theo</button></div>
    </form>
  </details>;
}
