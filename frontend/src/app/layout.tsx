import type { Metadata } from "next";
import "./style.css";
export const metadata: Metadata = {
  title: "Smart Task Manager",
  description: "Collaborative project planning with AI",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
