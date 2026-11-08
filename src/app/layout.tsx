import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ONEKalbe EWS - Sistem AI Prediksi Retur & Obsolete",
  description: "Early Warning System Prediksi Retur & Obsolete PT Kalbe Farma Tbk & PT Saka Farma Laboratories",
  icons: {
    icon: "/kalbe-logo.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id" className="h-full antialiased">
      <body className="min-h-full flex flex-col font-sans bg-slate-100 text-slate-900">{children}</body>
    </html>
  );
}
