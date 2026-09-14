import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "臺大道路狀況回報",
  description: "用地圖、照片與驗證碼快速送出臺大公共設施道路報修。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-Hant-TW">
      <body>{children}</body>
    </html>
  );
}
