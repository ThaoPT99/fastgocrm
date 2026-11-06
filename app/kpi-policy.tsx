import { roles, type Role } from "./crm";

const amountBands = [
  ["Dưới 20%", "0,5000"], ["20% – dưới 25%", "0,5625"], ["25% – dưới 30%", "0,6250"],
  ["30% – dưới 35%", "0,6875"], ["35% – dưới 40%", "0,7500"], ["40% – dưới 45%", "0,8125"],
  ["45% – dưới 50%", "1,0000"], ["50% – dưới 60%", "1,0625"], ["60% – dưới 70%", "1,1250"],
  ["70% – dưới 80%", "1,1875"], ["80% – dưới 90%", "1,2500"], ["Từ 90%", "1,3125"],
];
const visaBands = [
  ["Đến 60%", "0,30"], ["Trên 60% – dưới 65%", "0,60"], ["65% – dưới 70%", "1,00"],
  ["70% – dưới 75%", "1,05"], ["75% – dưới 80%", "1,10"], ["80% – dưới 85%", "1,15"],
  ["85% – dưới 90%", "1,25"], ["Từ 90%", "1,35"],
];

const staffingBands = {
  lead: [
    ["Từ 3 Sales chính thức", "1,00"], ["Dưới 3 Sales chính thức", "0,85"],
  ],
  head: [
    ["Đủ 3 Trưởng nhóm và đủ 12 người", "1,00"],
    ["Thiếu Trưởng nhóm, đủ 12 người", "0,90"],
    ["Đủ 3 Trưởng nhóm, thiếu 12 người", "0,95"],
    ["Thiếu cả Trưởng nhóm và tổng số người", "0,855"],
  ],
};

function Bands({ title, criterion, rows }: { title: string; criterion: string; rows: string[][] }) {
  return <section className="panel">
    <div className="sectionHead"><h2>{title}</h2></div>
    <div className="tableWrap"><table><thead><tr><th>{criterion}</th><th>Hệ số</th></tr></thead>
      <tbody>{rows.map(([label, factor]) => <tr key={label}><td>{label}</td><td><b>{factor}</b></td></tr>)}</tbody>
    </table></div>
  </section>;
}

export default function KpiPolicy({ role }: { role: Exclude<Role, "intake"> }) {
  const sales = role === "sale";
  const lead = role === "lead";
  return <>
    <section className="panel policy">
      <div className="eyebrow">CHỈ TIÊU THEO QUÝ · 16/10/2026</div>
      <h2>{roles[role]}</h2>
      <div className="kpiTargets">
        <div><span>D2-6 cá nhân</span><strong>{sales ? 31 : 25}</strong></div>
        <div><span>D4-1 cá nhân</span><strong>{sales ? 62 : 50}</strong></div>
        <div><span>Tổng hồ sơ đạt chuẩn cá nhân</span><strong>{sales ? 93 : 75}</strong></div>
        {!sales && <div><span>{lead ? "Team đủ 3 Sales" : "Khối đủ 3 Team"}</span><strong>{lead ? "354" : "1.137"}</strong></div>}
      </div>
      {lead && <p>KPI Team = 75 + 93 × số Sales được giao KPI trong quý.</p>}
      {role === "head" && <p>KPI Khối = 75 + tổng KPI các Team trực thuộc. Với 2 Team đủ quân, chỉ tiêu là 783 hồ sơ.</p>}
    </section>
    <section className="panel policy">
      <h2>Cách tính thưởng</h2>
      <p>Thưởng cá nhân = số hồ sơ cá nhân đã bay × 8.000.000 ₫ × hệ số số lượng cá nhân × hệ số visa cá nhân.</p>
      {sales ? <p>Hệ số nhân sự của Sales là 1,00.</p> : <>
        <p>Thưởng quản lý = số hồ sơ cấp dưới đã bay × {lead ? "2.000.000" : "1.500.000"} ₫ × hệ số số lượng {lead ? "Team" : "Khối"} × hệ số visa {lead ? "Team" : "Khối"}.</p>
        <p>Tổng thưởng = (thưởng cá nhân + thưởng quản lý) × hệ số nhân sự quý.</p>
        <p>Hồ sơ cá nhân chỉ được tính một lần vào phần thưởng cá nhân.</p>
      </>}
      <p>Hồ sơ đạt chuẩn dùng để đo mức hoàn thành KPI. Hồ sơ đã bay dùng để tính tiền thưởng. Các kết quả đến sau khi hết quý được đối soát theo quý gốc.</p>
    </section>
    <div className="kpiGrid">
      <Bands title="Hệ số số lượng" criterion="Tỷ lệ đạt KPI quý" rows={amountBands} />
      <Bands title="Hệ số visa" criterion="Tỷ lệ visa đỗ" rows={visaBands} />
    </div>
    {!sales && <>
      <Bands title="Hệ số nhân sự theo quý" criterion="Quân số tại ngày chốt" rows={staffingBands[role]} />
      <p>Ngày chốt nhân sự Q1, Q2, Q3 và Q4 lần lượt là 10/01, 10/04, 10/07 và 10/10.</p>
    </>}
  </>;
}
