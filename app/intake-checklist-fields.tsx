import { checklistGroups, checklistProgress, emptyChecklist, receivedQuantity, residenceChoices, type IntakeChecklist } from "./intake-checklist";

export default function IntakeChecklistFields({ value, onChange }: {
  value?: IntakeChecklist | null;
  onChange?: (value: IntakeChecklist) => void;
}) {
  const current = value ?? emptyChecklist;
  const { completed, total } = checklistProgress(current);

  return <div className="intakeChecklist">
    <div className="intakeChecklistHeading">
      <div><h2>Checklist hồ sơ ban đầu</h2><p>Nhập số lượng thực tế đã nhận. Giấy tờ photo dùng A4, một mặt.</p></div>
      <span className="pill">{completed}/{total} mục đủ số lượng</span>
    </div>
    <label className="intakeResidence">Giấy tờ cư trú
      <select disabled={!onChange} value={current.residence} onChange={(event) => onChange?.({ ...current, residence: event.target.value as IntakeChecklist["residence"] })}>
        <option value="">Chọn một loại giấy tờ</option>
        {residenceChoices.map((choice) => <option key={choice.id} value={choice.id}>{choice.label}</option>)}
      </select>
    </label>
    {!current.residence && <span className="pill danger">Chưa chọn giấy tờ cư trú</span>}
    {checklistGroups.map((group) => <fieldset key={group.title} className="intakeGroup">
      <legend>{group.title}</legend>
      {group.items.filter((item) => !item.residence || item.residence === current.residence).map((item) => {
        const active = !item.optional || current.optional.includes(item.id);
        const received = receivedQuantity(item, current);
        const shortage = Math.max(0, item.required - received);
        return <div key={item.id} className="intakeItem">
          <span><b>{item.label}</b><small>{item.requirement}</small></span>
          {item.optional && <label className="intakeOptional"><input type="checkbox" disabled={!onChange} checked={active}
            onChange={(event) => onChange?.({ ...current, optional: event.target.checked ? [...current.optional, item.id]
              : current.optional.filter((id) => id !== item.id) })} />
            Áp dụng</label>}
          {active && <div className="intakeQuantity">
            {onChange ? <label>Đã nhận<input aria-label={"Số lượng đã nhận: " + item.label} type="number" inputMode="numeric" min={0} max={999} step={1}
              value={received || ""} placeholder="0" onChange={(event) => {
                const amount = event.target.value === "" ? 0 : event.target.valueAsNumber;
                if (Number.isInteger(amount) && amount >= 0 && amount <= 999) {
                  onChange({ ...current, received: { ...current.received, [item.id]: amount } });
                }
              }} /></label> : <span>Đã nhận {received}/{item.required}</span>}
            <span className={shortage ? "pill danger" : "pill"}>{shortage ? "Thiếu " + shortage + " " + (item.unit ?? "bản") : "Đủ số lượng"}</span>
          </div>}
        </div>;
      })}
    </fieldset>)}
  </div>;
}
