import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AppShell } from "./app-shell";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "نظام إدارة مكتبة",
  description: "إدارة الكتب والقراء والموردين والتقارير",
};

const isAppLocked = process.env.NEXT_PUBLIC_APP_LOCKED === "true";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  if (isAppLocked) {
    return (
      <html lang="ar" dir="rtl" className={`${geistSans.variable} ${geistMono.variable}`}>
        <body className="min-h-screen bg-slate-950 flex items-center justify-center p-6 font-sans text-slate-900">
          <div className="w-full max-w-md rounded-[2rem] border border-white/10 bg-white p-8 text-center shadow-2xl">
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-3xl bg-rose-50 text-3xl font-black text-rose-600">
              !
            </div>
            <h1 className="text-3xl font-black text-slate-950 mb-4">النظام متوقف مؤقتا</h1>
            <p className="text-slate-600 font-bold leading-relaxed mb-6">
              النسخة الحالية غير مفعلة. غير قيمة NEXT_PUBLIC_APP_LOCKED إلى false ثم أعد النشر.
            </p>
            <div className="text-[10px] text-slate-400 font-black uppercase tracking-[0.2em]">
              Contact Developer for Activation
            </div>
          </div>
        </body>
      </html>
    );
  }

  return (
    <html lang="ar" dir="rtl" className={`${geistSans.variable} ${geistMono.variable} h-full`}>
      <AppShell>{children}</AppShell>
    </html>
  );
}
