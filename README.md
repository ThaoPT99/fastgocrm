# Fastgo CRM

CRM cá nhân theo dõi đối tác B2B, lịch follow-up, nhật ký làm việc và hồ sơ tiếp nhận.

## Chạy ứng dụng

1. Cài thư viện bằng `npm ci`.
2. Tạo `.env.local` dựa trên `.env.example`. Dùng cơ sở dữ liệu Turso hoặc tệp SQLite cục bộ qua `file:local.db`.
3. Chạy `npm run db:migrate` để tạo và cập nhật cấu trúc dữ liệu.
4. Chạy `npm run dev` để mở bản phát triển.

Trên Vercel, kết nối Turso để cung cấp `TURSO_DATABASE_URL` và `TURSO_AUTH_TOKEN`. Đặt `CRM_ADMIN_EMAIL` thành email của chủ CRM, `CRM_ADMIN_PASSWORD` thành mật mã quản trị ngẫu nhiên dài ít nhất 32 ký tự, và `CRM_PIN_PEPPER` thành một chuỗi bí mật ngẫu nhiên độc lập. Chạy cập nhật cấu trúc dữ liệu trước khi mở dự án cho người dùng.

Quản trị viên nhập mật mã quản trị trên cùng màn hình đăng nhập, sau đó vào **Nhân sự** để đặt mã 8 chữ số riêng cho từng người. Dữ liệu, mật mã và phiên đăng nhập nằm ngoài GitHub.
