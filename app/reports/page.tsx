"use client";

import Link from "next/link";
import {
  BarChart3,
  Boxes,
  ClipboardCheck,
  Filter,
  PackageSearch,
  ReceiptText,
  ShieldCheck,
  Truck,
  UsersRound,
  WalletCards,
} from "lucide-react";

const reportGroups = [
  {
    title: "المبيعات والأطراف",
    description: "متابعة العملاء والموردين وحركة البيع والتوريد في فترة محددة.",
    icon: BarChart3,
    tone: "bg-emerald-600",
    links: [
      { href: "/reports/invoices", title: "كل فواتير اليوم", description: "فواتير البيع والشراء في يوم محدد مع بحث وإجماليات واضحة." },
      { href: "/reports/customers", title: "تقرير العملاء", description: "مبيعات، تحصيل، أرباح، ديون، وآخر حركة لكل عميل." },
      { href: "/reports/suppliers", title: "تقرير الموردين", description: "توريدات، سداد، متبقيات، ورصيد كل مورد." },
      { href: "/reports/filter", title: "التصفية العامة", description: "مقارنة يومية أو شهرية أو سنوية بين البيع والتوريد." },
    ],
  },
  {
    title: "المخزون والتوريد",
    description: "مكان واحد لصحة المخزون والنواقص وتوصيات الشراء.",
    icon: Boxes,
    tone: "bg-indigo-700",
    links: [
      { href: "/reports/inventory", title: "تحليل المخزون والتوريد", description: "صحة المخزون، مشاكل الباركود والتسعير، ونواقص الشراء." },
    ],
  },
  {
    title: "الخزنة والورديات",
    description: "مراجعة الورديات وحركات الداخل والخارج وفروق العهدة.",
    icon: WalletCards,
    tone: "bg-teal-700",
    links: [
      { href: "/reports/cash-sessions", title: "تقرير الورديات والخزنة", description: "فتح وقفل الورديات وحركات الخزنة والرصيد المتوقع." },
    ],
  },
  {
    title: "الرقابة",
    description: "مراجعة نشاط الموظفين ومن نفذ كل عملية ومتى.",
    icon: ShieldCheck,
    tone: "bg-rose-600",
    links: [
      { href: "/reports/staff-activity", title: "نشاط الموظفين", description: "الدخول والفواتير والمرتجعات وحركات الخزنة والتسويات." },
    ],
  },
];

const quickReports = [
  { href: "/reports/invoices", label: "الفواتير", icon: ReceiptText },
  { href: "/reports/customers", label: "العملاء", icon: UsersRound },
  { href: "/reports/suppliers", label: "الموردين", icon: Truck },
  { href: "/reports/filter", label: "تصفية عامة", icon: Filter },
  { href: "/reports/inventory", label: "المخزون", icon: PackageSearch },
  { href: "/reports/cash-sessions", label: "الخزنة", icon: WalletCards },
  { href: "/reports/staff-activity", label: "الرقابة", icon: ClipboardCheck },
];

export default function ReportsHomePage() {
  return (
    <div className="min-h-screen bg-[#f4f7fb] px-4 py-6 text-right text-slate-900" dir="rtl">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="rounded-[1.5rem] border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-black uppercase tracking-widest text-emerald-600">مركز التقارير</p>
          <div className="mt-2 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-3xl font-black text-slate-950">اختار التقرير حسب نوع القرار</h1>
              <p className="mt-2 max-w-2xl text-sm font-bold leading-7 text-slate-500">
                التقارير هنا للمراجعة والتحليل فقط. تنفيذ التسويات والورديات وحركات الخزنة موجود في الأماكن المخصصة له.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {quickReports.map((report) => {
                const Icon = report.icon;
                return (
                  <Link
                    key={report.href}
                    href={report.href}
                    className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-black text-slate-600 hover:bg-slate-100"
                  >
                    <Icon className="h-4 w-4" />
                    {report.label}
                  </Link>
                );
              })}
            </div>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          {reportGroups.map((group) => {
            const Icon = group.icon;
            return (
              <div key={group.title} className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-5 flex items-start gap-3">
                  <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-white ${group.tone}`}>
                    <Icon className="h-6 w-6" />
                  </div>
                  <div>
                    <h2 className="text-xl font-black text-slate-950">{group.title}</h2>
                    <p className="mt-1 text-xs font-bold leading-6 text-slate-500">{group.description}</p>
                  </div>
                </div>

                <div className="grid gap-3">
                  {group.links.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="rounded-2xl border border-slate-100 bg-slate-50 p-4 transition hover:border-slate-300 hover:bg-white hover:shadow-sm"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <h3 className="font-black text-slate-950">{item.title}</h3>
                          <p className="mt-1 text-xs font-bold leading-6 text-slate-500">{item.description}</p>
                        </div>
                        <span className="shrink-0 rounded-xl bg-slate-950 px-3 py-2 text-xs font-black text-white">
                          فتح
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </section>
      </div>
    </div>
  );
}
