"use client";

import Link from "next/link";
import { BarChart3, Filter, Truck, UsersRound } from "lucide-react";

const reportPages = [
  {
    href: "/reports/customers",
    title: "تقارير العملاء",
    description: "مبيعات، تحصيل، أرباح، ديون، وآخر حركة لكل عميل.",
    icon: UsersRound,
    tone: "bg-emerald-600",
  },
  {
    href: "/reports/suppliers",
    title: "تقارير الموردين",
    description: "توريدات، سداد، متبقيات، ورصيد كل مورد.",
    icon: Truck,
    tone: "bg-amber-500",
  },
  {
    href: "/reports/filter",
    title: "التصفية العامة",
    description: "فلترة يومية وشهرية وسنوية مع مقارنة حركة العملاء والموردين.",
    icon: Filter,
    tone: "bg-slate-950",
  },
];

export default function ReportsHomePage() {
  return (
    <div className="min-h-screen bg-[#f4f7fb] px-4 py-6 text-right text-slate-900" dir="rtl">
      <div className="mx-auto max-w-6xl space-y-6">
        <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-black uppercase tracking-widest text-emerald-600">مركز التقارير</p>
          <h1 className="mt-2 text-3xl font-black text-slate-950">اختار نوع التقرير</h1>
          <p className="mt-2 max-w-2xl text-sm font-bold leading-7 text-slate-500">
          </p>
        </section>

        <section className="rounded-[2rem] border border-emerald-100 bg-emerald-50/60 p-4">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-600 text-white">
              <BarChart3 className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-black text-slate-950">الكروت الثلاثة للتقارير</h2>
              <p className="text-xs font-bold text-slate-500">اختار الكارت اللي محتاجه وافتح الصفحة الخاصة به.</p>
            </div>
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
          {reportPages.map((page) => {
            const Icon = page.icon;
            return (
              <Link
                key={page.href}
                href={page.href}
                className="group rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-xl"
              >
                <div className={`mb-6 flex h-14 w-14 items-center justify-center rounded-2xl text-white ${page.tone}`}>
                  <Icon className="h-7 w-7" />
                </div>
                <h2 className="text-xl font-black text-slate-950">{page.title}</h2>
                <p className="mt-2 min-h-14 text-sm font-bold leading-7 text-slate-500">{page.description}</p>
                <div className="mt-6 inline-flex items-center rounded-2xl bg-slate-950 px-4 py-3 text-sm font-black text-white transition group-hover:bg-emerald-600">
                  فتح التقرير
                </div>
              </Link>
            );
          })}
          </div>
        </section>

        <section className="rounded-[2rem] border border-slate-200 bg-slate-950 p-6 text-white shadow-sm">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10">
              <BarChart3 className="h-6 w-6" />
            </div>
            <div>
              <h2 className="font-black">تنظيم أسرع للمتابعة اليومية</h2>
              <p className="mt-1 text-sm font-bold text-slate-400">
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
