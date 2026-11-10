export type WeeklyRecord = {
  id?: string; kind: string; title: string; date: string; owner: string; status: string;
  performedBy?: string | null; partnerId?: string | null; partner: string; notes: string;
};
export type WeeklyMember = { email: string; name: string; team: string };

export function summarizeWeek<Record extends WeeklyRecord>(members: WeeklyMember[], records: Record[], from: string, to: string, day: string) {
  const period = records.filter((record) => record.date >= from && record.date <= to);
  return members.map((member) => {
    const activities = period.filter((record) => record.date <= day &&
      (record.kind === "activity" || record.kind === "logwork") && (record.performedBy ?? record.owner) === member.email)
      .sort((a, b) => b.date.localeCompare(a.date));
    const contacts = activities.filter((record) => record.kind === "activity");
    const centers = [...new Set(contacts.map((record) => record.partnerId).filter((id): id is string => Boolean(id)))];
    const days = [...new Set(activities.map((record) => record.date))];
    const internal = activities.filter((record) => record.kind === "logwork");
    const support = internal.filter((record) => record.status === "Cần hỗ trợ");
    const intakes = period.filter((record) => record.kind === "intake" && record.owner === member.email && record.date <= day);
    const meetings = period.filter((record) => record.kind === "meeting" && record.owner === member.email);
    return { member, activities, contacts, centers, days, internal, support, intakes, meetings };
  });
}
