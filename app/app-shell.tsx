"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  BookOpen,
  ChevronLeft,
  Home,
  LayoutDashboard,
  PackagePlus,
  ReceiptText,
  Search,
  Settings,
  Truck,
  UsersRound,
  WalletCards,
} from "lucide-react";

const navItems = [
  { href: "/", label: "الرئيسية", icon: Home },
  { href: "/suppliers", label: "الموردين", icon: Truck },
  { href: "/customer", label: "القراء", icon: UsersRound },
  { href: "/inventory", label: "الكتب", icon: BookOpen },
  { href: "/reports", label: "التقارير", icon: BarChart3 },
  { href: "/settings/reports", label: "الإعدادات", icon: Settings },
];

const quickLinks = [
  { href: "/inventory", label: "إضافة كتاب", icon: PackagePlus },
  { href: "/suppliers", label: "فاتورة توريد", icon: ReceiptText },
  { href: "/customer", label: "بيع/إعارة", icon: WalletCards },
];

function getPageTitle(pathname: string) {
  if (pathname.startsWith("/suppliers")) return "إدارة الموردين";
  if (pathname.startsWith("/customer")) return "دليل القراء";
  if (pathname.startsWith("/inventory")) return "فهرس الكتب والباركود";
  if (pathname.startsWith("/reports")) return "التقارير والتحليلات";
  if (pathname.startsWith("/settings")) return "إعدادات النظام";
  return "لوحة المكتبة";
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const pageTitle = getPageTitle(pathname);

  return (
    <body className="min-h-screen overflow-x-hidden bg-[#f4f7fb] text-slate-900 font-sans">
      <div className="flex min-h-screen min-w-0">
        <aside className="hidden lg:flex fixed right-0 top-0 z-50 h-screen w-64 xl:w-72 flex-col border-l border-slate-200 bg-slate-950 text-white shadow-2xl">
          <div className="px-6 py-6 border-b border-white/10">
            <Link href="/" className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-2xl bg-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-900/30">
                <LayoutDashboard className="h-6 w-6" />
              </div>
              <div>
                <p className="text-lg font-black">نظام إدارة مكتبة</p>
                <p className="text-xs text-slate-400 font-bold">كتب، قراء، موردين</p>
              </div>
            </Link>
          </div>

          <nav className="flex-1 px-4 py-5 space-y-2">
            {navItems.map((item) => {
              const active =
                item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
              const Icon = item.icon;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center justify-between rounded-2xl px-4 py-3 font-black transition-all ${
                    active
                      ? "bg-emerald-500 text-white shadow-lg shadow-emerald-950/30"
                      : "text-slate-300 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  <span className="flex items-center gap-3">
                    <Icon className="h-5 w-5" />
                    {item.label}
                  </span>
                  {active && <ChevronLeft className="h-4 w-4" />}
                </Link>
              );
            })}
          </nav>

          <div className="mx-4 mb-4 rounded-3xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs font-black text-slate-400 mb-3">اختصارات سريعة</p>
            <div className="space-y-2">
              {quickLinks.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.label}
                    href={item.href}
                    className="flex items-center gap-3 rounded-2xl bg-white/5 px-3 py-2 text-sm font-bold text-slate-200 hover:bg-white/10"
                  >
                    <Icon className="h-4 w-4 text-emerald-300" />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>

          <div className="px-6 py-4 border-t border-white/10 text-xs text-slate-400">
            <div className="flex items-center justify-between">
              <span className="font-black">حالة النظام</span>
              <span className="rounded-full bg-emerald-400/15 px-3 py-1 text-emerald-300 font-black">
                يعمل
              </span>
            </div>
          </div>
        </aside>

        <main className="w-full min-w-0 flex-1 pb-24 lg:mr-64 lg:pb-0 xl:mr-72">
          <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/85 backdrop-blur-xl">
            <div className="px-3 py-3 sm:px-6 sm:py-4 lg:px-8">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                <div className="min-w-0">
                  <p className="text-xs font-black text-emerald-600">المكتبة</p>
                  <h1 className="truncate text-xl font-black text-slate-950 sm:text-2xl">{pageTitle}</h1>
                </div>

                <div className="flex min-w-0 flex-col gap-3 md:flex-row md:items-center">
                  <div className="relative min-w-0 md:w-72 xl:w-80">
                    <Search className="absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      type="search"
                      placeholder="بحث سريع في الكتب أو القراء..."
                      className="h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 pr-11 pl-4 text-sm font-bold outline-none transition focus:border-emerald-400 focus:bg-white sm:h-12"
                    />
                  </div>

                  <div className="flex min-w-0 gap-2 overflow-x-auto pb-1 md:pb-0">
                    {quickLinks.map((item) => {
                      const Icon = item.icon;
                      return (
                        <Link
                          key={item.label}
                          href={item.href}
                          className="inline-flex h-11 shrink-0 items-center gap-2 rounded-2xl bg-slate-950 px-3 text-xs font-black text-white hover:bg-emerald-600 sm:h-12 sm:px-4 sm:text-sm"
                        >
                          <Icon className="h-4 w-4" />
                          {item.label}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </header>

          <div className="px-3 py-4 sm:px-6 sm:py-6 lg:px-8">
            <div className="mx-auto max-w-7xl min-w-0">{children}</div>
          </div>
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white/95 px-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-2 shadow-2xl backdrop-blur-xl lg:hidden">
        <div className="grid grid-cols-6 gap-1">
          {navItems.map((item) => {
            const active =
              item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex min-w-0 flex-col items-center justify-center rounded-2xl px-1 py-2 text-[10px] font-black sm:text-[11px] ${
                  active ? "bg-emerald-50 text-emerald-700" : "text-slate-500"
                }`}
              >
                <Icon className="mb-1 h-5 w-5" />
                <span className="w-full truncate text-center">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </body>
  );
}
