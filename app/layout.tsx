import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Fastgo CRM",
  description: "Không gian quản lý kinh doanh B2B nội bộ của Fastgo",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="vi"><body>{children}</body></html>;
}
