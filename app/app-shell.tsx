"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BarChart3,
  BookOpen,
  ChevronLeft,
  ClipboardList,
  Home,
  LayoutDashboard,
  LogIn,
  LogOut,
  PackagePlus,
  ReceiptText,
  Search,
  Settings,
  Truck,
  UsersRound,
  WalletCards,
} from "lucide-react";
import { clearStaffSession, useStaffSession } from "@/app/staff-session";
import { supabase } from "@/lib/supabase";
import {
  hasPermissionWithConfig,
  permissionForPath,
  permissionSettingsEvent,
  readRolePermissions,
  roleLabels,
  rolePermissions,
  sanitizeRolePermissions,
  writeRolePermissions,
} from "@/lib/permissions";

const navItems = [
  { href: "/", label: "الرئيسية", icon: Home, permission: "dashboard:view" as const },
  { href: "/suppliers", label: "الموردين", icon: Truck, permission: "purchases:manage" as const },
  { href: "/customer", label: "العملاء", icon: UsersRound, permission: "sales:manage" as const },
  { href: "/inventory", label: "الأصناف", icon: BookOpen, permission: "inventory:manage" as const },
  { href: "/operations", label: "العمليات", icon: ClipboardList, permission: "operations:manage" as const },
  { href: "/reports", label: "التقارير", icon: BarChart3, permission: "reports:view" as const },
  { href: "/settings/reports", label: "الإعدادات", icon: Settings, permission: "settings:manage" as const },
];

const quickLinks = [
  { href: "/inventory", label: "إضافة صنف", icon: PackagePlus, permission: "inventory:manage" as const },
  { href: "/suppliers", label: "فاتورة توريد", icon: ReceiptText, permission: "purchases:manage" as const },
  { href: "/customer", label: "فاتورة بيع", icon: WalletCards, permission: "sales:manage" as const },
];

function getPageTitle(pathname: string) {
  if (pathname.startsWith("/login")) return "دخول الموظفين";
  if (pathname.startsWith("/suppliers")) return "إدارة الموردين";
  if (pathname.startsWith("/customer")) return "إدارة العملاء";
  if (pathname.startsWith("/inventory")) return "الأصناف والباركود";
  if (pathname.startsWith("/operations")) return "مركز العمليات";
  if (pathname.startsWith("/reports")) return "التقارير والتحليلات";
  if (pathname.startsWith("/settings")) return "إعدادات النظام";
  return "لوحة المحل";
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const pageTitle = getPageTitle(pathname);
  const staff = useStaffSession();
  const [permissionConfig, setPermissionConfig] = useState(rolePermissions);
  const isLoginPage = pathname.startsWith("/login");
  const visibleNavItems = staff ? navItems.filter((item) => hasPermissionWithConfig(staff.role, item.permission, permissionConfig)) : navItems;
  const visibleQuickLinks = staff ? quickLinks.filter((item) => hasPermissionWithConfig(staff.role, item.permission, permissionConfig)) : quickLinks;
  const requiredPermission = permissionForPath(pathname);
  const isAllowed = !staff || isLoginPage || hasPermissionWithConfig(staff.role, requiredPermission, permissionConfig);
  const isCleanCustomerPage = pathname === "/customer";

  useEffect(() => {
    const refreshPermissions = () => setPermissionConfig(readRolePermissions());

    async function loadRemotePermissions() {
      try {
        const { data, error } = await supabase
          .from("business_settings")
          .select("role_permissions")
          .eq("id", "main")
          .maybeSingle();
        if (error) return;

        const remotePermissions = (data as { role_permissions?: unknown } | null)?.role_permissions;
        if (remotePermissions) {
          const sanitized = sanitizeRolePermissions(remotePermissions);
          setPermissionConfig(sanitized);
          writeRolePermissions(sanitized);
        } else {
          setPermissionConfig(rolePermissions);
        }
      } catch {
        setPermissionConfig(rolePermissions);
      }
    }

    void loadRemotePermissions();

    window.addEventListener(permissionSettingsEvent, refreshPermissions);
    window.addEventListener("storage", refreshPermissions);
    return () => {
      window.removeEventListener(permissionSettingsEvent, refreshPermissions);
      window.removeEventListener("storage", refreshPermissions);
    };
  }, []);

  function logout() {
    clearStaffSession();
    window.location.href = "/login";
  }

  if (isCleanCustomerPage) {
    return (
      <body className="min-h-screen overflow-x-hidden bg-slate-50 text-slate-900 font-sans">
        <nav className="fixed left-1/2 top-4 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/50 bg-white/75 p-1.5 shadow-2xl shadow-slate-900/10 backdrop-blur-xl">
          <Link
            href="/"
            aria-label="الرجوع للرئيسية"
            title="الرئيسية"
            className="group inline-flex h-10 items-center gap-2 overflow-hidden rounded-full bg-slate-950 px-2 text-xs font-black text-white shadow-lg shadow-slate-900/20 transition-all duration-300 hover:w-32 hover:bg-slate-900 focus-visible:w-32 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-300/30"
          >
            <span className="relative grid h-7 w-7 shrink-0 place-items-center rounded-full bg-emerald-500 text-white transition-transform duration-300 group-hover:scale-110">
              <span className="absolute inset-0 rounded-full bg-emerald-300/30 opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-hover:animate-ping" />
              <Home className="relative h-3.5 w-3.5" />
            </span>
            <span className="w-0 translate-x-2 whitespace-nowrap opacity-0 transition-all duration-300 group-hover:w-14 group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:w-14 group-focus-visible:translate-x-0 group-focus-visible:opacity-100">
              الرئيسية
            </span>
          </Link>

          <Link
            href="/reports/invoices"
            aria-label="فتح صفحة الفواتير"
            title="الفواتير"
            className="group inline-flex h-10 items-center gap-2 overflow-hidden rounded-full bg-indigo-600 px-2 text-xs font-black text-white shadow-lg shadow-indigo-900/20 transition-all duration-300 hover:w-32 hover:bg-indigo-500 focus-visible:w-32 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-300/30"
          >
            <span className="relative grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white/20 text-white transition-transform duration-300 group-hover:scale-110">
              <span className="absolute inset-0 rounded-full bg-white/20 opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-hover:animate-ping" />
              <ReceiptText className="relative h-3.5 w-3.5" />
            </span>
            <span className="w-0 translate-x-2 whitespace-nowrap opacity-0 transition-all duration-300 group-hover:w-14 group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:w-14 group-focus-visible:translate-x-0 group-focus-visible:opacity-100">
              الفواتير
            </span>
          </Link>
        </nav>

        {isAllowed ? (
          children
        ) : (
          <div className="flex min-h-screen items-center justify-center p-4">
            <section className="w-full max-w-xl rounded-3xl border border-rose-200 bg-rose-50 p-8 text-center text-rose-700">
              <h2 className="text-2xl font-black">لا توجد صلاحية لفتح الصفحة</h2>
              <p className="mt-2 text-sm font-bold">سجل دخول بموظف له صلاحية مناسبة أو راجع المدير.</p>
              <Link href="/login" className="mt-5 inline-flex h-12 items-center justify-center rounded-2xl bg-rose-600 px-5 text-sm font-black text-white">
                تسجيل دخول آخر
              </Link>
            </section>
          </div>
        )}
      </body>
    );
  }

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
                <p className="text-lg font-black">نظام إدارة محل تجاري</p>
                <p className="text-xs text-slate-400 font-bold">مبيعات، مخزون، عملاء، موردين</p>
              </div>
            </Link>
          </div>

          <nav className="flex-1 px-4 py-5 space-y-2">
            {visibleNavItems.map((item) => {
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
              {visibleQuickLinks.map((item) => {
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
              <span className="font-black">الموظف</span>
              {staff ? (
                <span className="rounded-full bg-emerald-400/15 px-3 py-1 text-emerald-300 font-black">
                  {staff.name}
                </span>
              ) : (
                <Link href="/login" className="rounded-full bg-amber-400/15 px-3 py-1 text-amber-300 font-black">
                  دخول
                </Link>
              )}
            </div>
            {staff && (
              <button
                type="button"
                onClick={logout}
                className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-white/5 px-3 py-2 font-black text-slate-300 hover:bg-white/10"
              >
                <LogOut className="h-4 w-4" />
                خروج
              </button>
            )}
          </div>
        </aside>

        <main className="w-full min-w-0 flex-1 pb-24 lg:mr-64 lg:pb-0 xl:mr-72">
          <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/85 backdrop-blur-xl">
            <div className="px-3 py-3 sm:px-6 sm:py-4 lg:px-8">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                <div className="min-w-0">
                  <p className="text-xs font-black text-emerald-600">المحل</p>
                  <h1 className="truncate text-xl font-black text-slate-950 sm:text-2xl">{pageTitle}</h1>
                </div>

                <div className="flex min-w-0 flex-col gap-3 md:flex-row md:items-center">
                  <div className="relative min-w-0 md:w-72 xl:w-80">
                    <Search className="absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      type="search"
                      placeholder="بحث سريع في الأصناف أو العملاء..."
                      className="h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 pr-11 pl-4 text-sm font-bold outline-none transition focus:border-emerald-400 focus:bg-white sm:h-12"
                    />
                  </div>

                  <div className="flex min-w-0 gap-2 overflow-x-auto pb-1 md:pb-0">
                    {visibleQuickLinks.map((item) => {
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

                  <div className="flex shrink-0 items-center gap-2">
                    {staff ? (
                      <>
                        <div className="rounded-2xl bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700">
                          {staff.name} - {roleLabels[staff.role]}
                        </div>
                        <button
                          type="button"
                          onClick={logout}
                          className="inline-flex h-11 items-center justify-center rounded-2xl bg-slate-100 px-3 text-xs font-black text-slate-600 hover:bg-slate-200"
                        >
                          <LogOut className="h-4 w-4" />
                        </button>
                      </>
                    ) : (
                      <Link
                        href="/login"
                        className="inline-flex h-11 items-center gap-2 rounded-2xl bg-emerald-600 px-3 text-xs font-black text-white hover:bg-emerald-500"
                      >
                        <LogIn className="h-4 w-4" />
                        دخول
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </header>

          <div className="px-3 py-4 sm:px-6 sm:py-6 lg:px-8">
            <div className="mx-auto max-w-7xl min-w-0">
              {isAllowed ? (
                children
              ) : (
                <section className="rounded-3xl border border-rose-200 bg-rose-50 p-8 text-center text-rose-700">
                  <h2 className="text-2xl font-black">لا توجد صلاحية لفتح الصفحة</h2>
                  <p className="mt-2 text-sm font-bold">سجل دخول بموظف له صلاحية مناسبة أو راجع المدير.</p>
                  <Link href="/login" className="mt-5 inline-flex h-12 items-center justify-center rounded-2xl bg-rose-600 px-5 text-sm font-black text-white">
                    تسجيل دخول آخر
                  </Link>
                </section>
              )}
            </div>
          </div>
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white/95 px-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-2 shadow-2xl backdrop-blur-xl lg:hidden">
        <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${visibleNavItems.length}, minmax(0, 1fr))` }}>
          {visibleNavItems.map((item) => {
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
