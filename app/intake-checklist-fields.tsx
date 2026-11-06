import { checklistGroups, checklistProgress, emptyChecklist, residenceChoices, type IntakeChecklist } from "./intake-checklist";

export default function IntakeChecklistFields({ value, onChange }: {
  value?: IntakeChecklist | null;
  onChange?: (value: IntakeChecklist) => void;
}) {
  const current = value ?? emptyChecklist;
  const { completed, total } = checklistProgress(current);

  return <div className="intakeChecklist">
    <div className="intakeChecklistHeading">
      <div><h2>Checklist hồ sơ ban đầu</h2><p>Tick khi đã kiểm đủ số lượng và đúng loại bản. Giấy tờ photo dùng A4, một mặt.</p></div>
      <span className="pill">{completed}/{total} mục đã kiểm</span>
    </div>
    <label className="intakeResidence">Giấy tờ cư trú
      <select disabled={!onChange} value={current.residence} onChange={(event) => onChange?.({ ...current, residence: event.target.value as IntakeChecklist["residence"] })}>
        <option value="">Chọn một loại giấy tờ</option>
        {residenceChoices.map((choice) => <option key={choice.id} value={choice.id}>{choice.label}</option>)}
      </select>
    </label>
    {checklistGroups.map((group) => <fieldset key={group.title} className="intakeGroup">
      <legend>{group.title}</legend>
      {group.items.filter((item) => !item.residence || item.residence === current.residence).map((item) => {
        const active = !item.optional || current.optional.includes(item.id);
        return <div key={item.id} className="intakeItem">
          <label>
            <input type="checkbox" disabled={!onChange || !active} checked={active && current.checked.includes(item.id)}
              onChange={(event) => onChange?.({ ...current, checked: event.target.checked ? [...current.checked, item.id] : current.checked.filter((id) => id !== item.id) })} />
            <span><b>{item.label}</b><small>{item.requirement}</small></span>
          </label>
          {item.optional && <label className="intakeOptional"><input type="checkbox" disabled={!onChange} checked={active}
            onChange={(event) => onChange?.(event.target.checked ? { ...current, optional: [...current.optional, item.id] }
              : { ...current, optional: current.optional.filter((id) => id !== item.id), checked: current.checked.filter((id) => id !== item.id) })} />
            Áp dụng</label>}
        </div>;
      })}
    </fieldset>)}
  </div>;
}
