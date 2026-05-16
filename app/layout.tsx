import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Link from "next/link";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "نظام العمدة الزراعي",
  description: "إدارة احترافية متكاملة",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" className={`${geistSans.variable} ${geistMono.variable} h-full`}>
      <body className="h-full bg-[#f8fafc] text-slate-900 flex overflow-hidden">
        
        {/* Sidebar الاحترافي */}
        <aside className="group fixed right-0 top-0 h-full w-20 hover:w-64 bg-slate-900 text-slate-300 transition-all duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] z-50 shadow-2xl flex flex-col border-l border-slate-800">
          
          <div className="h-20 flex items-center justify-center border-b border-slate-800/50">
            <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center text-2xl shadow-lg shadow-emerald-500/20">
              🚜
            </div>
            <span className="hidden group-hover:block mr-3 font-bold text-white tracking-wide transition-all duration-300">نظام العمدة</span>
          </div>

          <nav className="flex-1 px-3 py-6 space-y-4">
            <SidebarItem href="/" icon="🏠" label="الرئيسية" />
            <SidebarItem href="/suppliers" icon="📦" label="الموردين" />
            <SidebarItem href="/customer" icon="👥" label="العملاء" />
            <SidebarItem href="/inventory" icon="🏗️" label="المخازن" />
          </nav>

          <div className="p-4 border-t border-slate-800/50 text-center text-[10px] text-slate-500 group-hover:block hidden uppercase tracking-widest">
            النسخة التجريبية 1.0
          </div>
        </aside>

        {/* المحتوى الرئيسي */}
        <main className="flex-1 mr-20 overflow-auto transition-all duration-500">
          <header className="h-20 bg-white/80 backdrop-blur-md border-b border-slate-200 sticky top-0 z-40 px-8 flex items-center justify-between">
            <h2 className="text-xl font-bold text-slate-800">لوحة التحكم</h2>
            <div className="w-10 h-10 rounded-full bg-slate-200 border-2 border-white shadow-sm"></div>
          </header>
          
          <div className="p-8 max-w-6xl mx-auto">
            {children}
          </div>
        </main>

      </body>
    </html>
  );
}

function SidebarItem({ href, icon, label }: { href: string; icon: string; label: string }) {
  return (
    <Link href={href} className="flex items-center p-3 rounded-2xl hover:bg-emerald-500 hover:text-white transition-all duration-300 group/item relative overflow-hidden">
      <span className="text-xl min-w-[40px] flex justify-center">{icon}</span>
      <span className="mr-4 font-medium opacity-0 group-hover:opacity-100 transition-opacity duration-300 whitespace-nowrap">
        {label}
      </span>
    </Link>
  );
}