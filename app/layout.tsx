import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "2026 AI시대의 서비스 디자인",
  description: "AI시대의 서비스 디자인 수업 기록",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
