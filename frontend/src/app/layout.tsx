import type { Metadata } from "next";
import localFont from "next/font/local";
import { BRAND_SLOGAN } from "@/lib/brand";
import "./style.css";
const inter = localFont({
  src: "./fonts/InterVariable.woff2",
  variable: "--font-inter",
  weight: "100 900",
  display: "swap",
});
const mono = localFont({
  src: "./fonts/JetBrainsMono-Regular.woff2",
  variable: "--font-mono",
  weight: "400",
  display: "swap",
  preload: false,
});
export const metadata: Metadata = {
  title: "Smart Task Manager",
  description: BRAND_SLOGAN,
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi" className={`${inter.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
