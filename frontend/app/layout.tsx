import type { Metadata } from "next";
import { headers } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import AppNav from "../components/AppNav";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "送貨單列印工具",
  description: "LQ-310 送貨單編輯與預覽",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // 登入頁不顯示導覽列(其連結都在閘門之後)。pathname 由 proxy 以 header 轉入。
  const pathname = (await headers()).get("x-pathname") ?? "";
  const showNav = pathname !== "/login";

  return (
    <html lang="zh-Hant" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>
        {showNav ? <AppNav /> : null}
        {children}
      </body>
    </html>
  );
}
