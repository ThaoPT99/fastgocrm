const encouragements = [
  "Chúc bạn ngày mới vui vẻ và làm việc hiệu quả. Hãy chọn một việc quan trọng để bắt đầu hôm nay nhé!",
  "Một lời hỏi thăm chân thành có thể mở đầu một mối quan hệ tốt. Chúc bạn có những cuộc trò chuyện thuận lợi hôm nay!",
  "Mỗi việc được hoàn thành đều là một bước tiến. Chúc bạn giữ được sự tập trung và niềm vui trong công việc!",
  "Hôm nay, hãy bắt đầu với một mục tiêu vừa sức. Từng bước nhỏ sẽ giúp bạn tiến gần hơn tới điều mình muốn đạt được.",
  "Chúc bạn có một ngày nhiều năng lượng, những cuộc hẹn thuận lợi và những kết quả đáng vui!",
  "Nếu có việc đang vướng, bạn có thể trao đổi với đồng đội để cùng tìm cách xử lý. Chúc bạn một ngày làm việc nhẹ nhàng!",
  "Sự kiên trì và cách làm chu đáo của bạn có ý nghĩa. Chúc bạn có thêm những kết nối tốt trong hôm nay!",
  "Chúc bạn một ngày làm việc năng suất. Nhớ dành một chút thời gian nghỉ ngơi để giữ sức cho cả ngày nhé!",
  "Hãy ghi nhận cả những tiến bộ nhỏ của mình. Chúc bạn có một ngày làm việc với tinh thần thoải mái!",
  "Một ngày mới để tiếp tục những việc còn dang dở. Chúc bạn và đồng đội phối hợp thật thuận lợi hôm nay!",
  "Chúc bạn có những cuộc trao đổi rõ ràng và nhận được sự hỗ trợ khi cần. Cùng bắt đầu ngày mới nhé!",
  "Bạn đã có mặt và sẵn sàng cho hôm nay. Hãy chọn việc cần ưu tiên và bắt đầu từng bước nhé!",
  "Chúc bạn một ngày vui vẻ, tự tin và có thêm một kết quả khiến mình hài lòng!",
  "Cảm ơn những nỗ lực mỗi ngày của bạn. Chúc bạn làm việc hiệu quả và luôn giữ được tinh thần tích cực!",
];

export default function DailyGreeting({ name, day }: { name: string; day: string }) {
  const date = new Date(day + "T12:00:00Z");
  const index = Math.floor(date.getTime() / 86_400_000) % encouragements.length;
  const dateLabel = new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh", weekday: "long", day: "numeric", month: "numeric", year: "numeric",
  }).format(date);
  return <section className="dailyGreeting" aria-label="Lời chào hôm nay">
    <span className="greetingSun" aria-hidden="true">
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.4 1.4m11.2 11.2L19 19M5 19l1.4-1.4M17.6 6.4L19 5" />
      </svg>
    </span>
    <div><time dateTime={day}>{dateLabel}</time>
      <h2>Xin chào {name.trim() || "bạn"}!</h2>
      <p>{encouragements[index]}</p>
    </div>
  </section>;
}
