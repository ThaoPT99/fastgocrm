import type { Role } from "./crm";

export type GuideDestination = "workday" | "partner" | "meeting" | "logwork" | "plan" | "intake" | "people";
type Step = { title: string; description: string; label: string; to: GuideDestination };

const partnerStep: Step = {
  title: "Ghi kết quả tại trung tâm",
  description: "Sau khi gặp, gọi hoặc nhắn, mở trung tâm để Ghi kết quả trao đổi. Chọn ngày thực hiện, việc đã làm, kết quả và ai làm bước tiếp theo. Dùng Đặt hoặc đổi bước tiếp theo khi chỉ cần lên lịch. Có thể ghi nhận sau cuộc trao đổi.",
  label: "Mở đối tác B2B",
  to: "partner",
};
const planStep: Step = {
  title: "Lập và cập nhật kế hoạch quý",
  description: "Chọn quý, đi qua 4 bước hướng dẫn để xác nhận số đã đạt, nguồn hiện có và sức làm mỗi ngày. CRM đề xuất lượng trung tâm cần tiếp cận mỗi tuần. Người mới có thể để trống nguồn đang có. Lưu ở bước cuối, rồi bổ sung các trung tâm cụ thể để triển khai.",
  label: "Mở kế hoạch KPI quý",
  to: "plan",
};
const logStep: Step = {
  title: "Xem hoạt động theo ngày",
  description: "Hoạt động đối tác tự vào nhật ký của người thực hiện. Dùng Ghi hoạt động cho việc nội bộ hoặc vướng mắc cần hỗ trợ. Chọn Tổng hợp tuần để xem số liệu, nội dung đã ghi và dùng AI nhận xét theo tuần.",
  label: "Mở nhật ký làm việc",
  to: "logwork",
};
const intakeStep: Step = {
  title: "Tạo hồ sơ theo trung tâm gửi",
  description: "Chọn Tạo hồ sơ mới, nhập tên học sinh hoặc mã hồ sơ và chọn trung tâm đã có. Người phụ trách được lấy từ trung tâm đã chọn.",
  label: "Mở hồ sơ tiếp nhận",
  to: "intake",
};

const guides: Record<Role, { intro: string; steps: Step[] }> = {
  sale: {
    intro: "Mỗi trung tâm có một hồ sơ làm việc chung cho lịch sử liên hệ, lịch hẹn và hồ sơ học sinh.",
    steps: [{
      title: "Bắt đầu ngày ở Việc hôm nay",
      description: "Đến lượt mình làm là việc cần thực hiện. Đang chờ người khác là việc chờ đối tác hoặc hỗ trợ. Đến ngày đã hẹn, việc chờ xuất hiện trong Đến lúc hỏi lại. Mở trung tâm để xem tình hình hoặc ghi kết quả đã diễn ra.",
      label: "Mở Việc hôm nay", to: "workday",
    }, partnerStep, logStep, planStep],
  },
  lead: {
    intro: "Bạn theo dõi hoạt động và kế hoạch của team, đồng thời có nhật ký và KPI cá nhân.",
    steps: [logStep, {
      title: "Rà kế hoạch của team mỗi tuần",
      description: "Mở Kế hoạch KPI quý, xem ai chưa lập kế hoạch và chọn từng nhân sự để kiểm tra phần thiếu nguồn. Cập nhật kế hoạch cá nhân ở cùng màn hình.",
      label: "Xem kế hoạch của team", to: "plan",
    }, partnerStep],
  },
  head: {
    intro: "Bạn xem được toàn khối và có thể ghi nhận công việc, theo dõi KPI cá nhân.",
    steps: [{
      title: "Kiểm tra vai trò và nhóm phụ trách",
      description: "Vào Nhân sự để kiểm tra vai trò, nhóm và cấp mật mã cho thành viên. Thêm hồ sơ nhân sự của chính bạn nếu cần ghi nhật ký hoặc lưu kế hoạch cá nhân.",
      label: "Mở nhân sự", to: "people",
    }, {
      title: "Rà kế hoạch toàn khối",
      description: "Chọn quý và xem ai chưa lập kế hoạch. Mở kế hoạch từng người để thấy phần thiếu D2-6 hoặc D4-1 và nguồn nào cần hỗ trợ.",
      label: "Xem kế hoạch toàn khối", to: "plan",
    }, logStep, partnerStep],
  },
  intake: {
    intro: "Bạn tiếp nhận và cập nhật hồ sơ của các trung tâm trên toàn khối.",
    steps: [intakeStep, {
      title: "Cập nhật đúng số giấy tờ đã nhận",
      description: "Mở Cập nhật số lượng và nhập số thực nhận của từng loại giấy tờ. Lưu sau mỗi lần bàn giao để lần sau tiếp tục trên cùng hồ sơ.",
      label: "Mở danh sách hồ sơ", to: "intake",
    }, {
      title: "Theo dõi hồ sơ cần bổ sung",
      description: "Danh sách đưa hồ sơ còn thiếu lên đầu. Mở checklist để xem giấy tờ nào còn thiếu hoặc dùng Xuất Excel khi cần đối soát.",
      label: "Xem checklist hồ sơ", to: "intake",
    }],
  },
};

export default function WorkGuide({ role, go }: { role: Role; go: (view: GuideDestination) => void }) {
  const guide = guides[role];
  return <>
    <section className="panel policy">
      <h2>Quy trình theo vai trò</h2>
      <p>{guide.intro}</p>
      <ol className="guideSteps">
        {guide.steps.map((step) => <li key={step.title}>
          <div><h3>{step.title}</h3><p>{step.description}</p></div>
          <button onClick={() => go(step.to)}>{step.label}</button>
        </li>)}
      </ol>
    </section>
    {role !== "intake" && <section className="panel policy">
      <h2>Nên ghi ở đâu?</h2>
      <dl className="guideGlossary">
        <div><dt>Follow-up</dt><dd>Việc tiếp theo với trung tâm, có nội dung và ngày thực hiện. Đến hạn sẽ hiện ở Việc hôm nay của Sales phụ trách.</dd></div>
        <div><dt>Lịch hẹn</dt><dd>Buổi gặp đã có lịch. Sau buổi gặp, cập nhật trạng thái lịch và ghi kết quả tại trung tâm để lưu lịch sử liên hệ.</dd></div>
        <div><dt>Nhật ký làm việc</dt><dd>Xem việc đã làm theo ngày. Liên hệ đã ghi ở trung tâm sẽ tự xuất hiện tại đây.</dd></div>
        <div><dt>Hồ sơ đạt chuẩn</dt><dd>Số đã đối soát để tính KPI quý. Số mục đủ trên checklist dùng để kiểm tra giấy tờ tiếp nhận.</dd></div>
      </dl>
    </section>}
  </>;
}
