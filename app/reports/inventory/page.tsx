"use client";

import Link from "next/link";
import { ArrowRight, Barcode, PackagePlus, PackageSearch, TrendingDown } from "lucide-react";

const inventorySections = [
  {
    href: "/reports/inventory-health",
    title: "صحة المخزون",
    description: "راجع الأصناف منخفضة الكمية، المخزون السالب، الباركود الناقص، ومشاكل التسعير.",
    icon: PackageSearch,
    tone: "bg-indigo-700",
    points: ["مخزون منخفض أو سالب", "باركود ناقص", "سعر شراء أو بيع غير منطقي"],
  },
  {
    href: "/reports/reorder",
    title: "نواقص وتوصيات توريد",
    description: "اعرف الأصناف المطلوب توريدها، الكمية المقترحة، والتكلفة المتوقعة حسب المورد.",
    icon: PackagePlus,
    tone: "bg-amber-600",
    points: ["قائمة شراء مقترحة", "تجميع حسب المورد", "تصدير CSV للمراجعة أو الشراء"],
  },
];

const rules = [
  { title: "التنفيذ", text: "أي تعديل كمية أو هالك أو رصيد افتتاحي يتم من العمليات فقط.", icon: TrendingDown },
  { title: "التحليل", text: "مراجعة النواقص ومشاكل التسعير والباركود تتم من هنا.", icon: Barcode },
];

export default function InventoryReportsHubPage() {
  return (
    <div className="min-h-[calc(100vh-8rem)] text-right" dir="rtl">
      <div className="space-y-6">
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-700">
                <PackageSearch className="h-7 w-7" />
              </div>
              <p className="text-xs font-black text-indigo-600">المخزون والتوريد</p>
              <h1 className="mt-1 text-2xl font-black text-slate-950">تحليل المخزون والتوريد</h1>
              <p className="mt-2 max-w-3xl text-sm font-bold leading-7 text-slate-500">
                مكان واحد لكل قرارات المخزون: هل فيه أصناف تحتاج تصحيح؟ وهل فيه نواقص لازم تتطلب من الموردين؟
              </p>
            </div>
            <Link
              href="/reports"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-slate-100 px-5 text-sm font-black text-slate-700 hover:bg-slate-200"
            >
              <ArrowRight className="h-5 w-5" />
              رجوع للتقارير
            </Link>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          {inventorySections.map((section) => {
            const Icon = section.icon;
            return (
              <Link
                key={section.href}
                href={section.href}
                className="group rounded-3xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-xl"
              >
                <div className={`mb-5 flex h-14 w-14 items-center justify-center rounded-2xl text-white ${section.tone}`}>
                  <Icon className="h-7 w-7" />
                </div>
                <h2 className="text-xl font-black text-slate-950">{section.title}</h2>
                <p className="mt-2 text-sm font-bold leading-7 text-slate-500">{section.description}</p>
                <div className="mt-5 grid gap-2">
                  {section.points.map((point) => (
                    <span key={point} className="rounded-2xl bg-slate-50 px-4 py-3 text-xs font-black text-slate-600">
                      {point}
                    </span>
                  ))}
                </div>
                <span className="mt-6 inline-flex rounded-2xl bg-slate-950 px-4 py-3 text-sm font-black text-white transition group-hover:bg-indigo-700">
                  فتح التقرير
                </span>
              </Link>
            );
          })}
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          {rules.map((rule) => {
            const Icon = rule.icon;
            return (
              <div key={rule.title} className="rounded-3xl border border-slate-200 bg-slate-950 p-5 text-white shadow-sm">
                <Icon className="mb-4 h-6 w-6 text-emerald-300" />
                <h3 className="font-black">{rule.title}</h3>
                <p className="mt-2 text-sm font-bold leading-7 text-slate-300">{rule.text}</p>
              </div>
            );
          })}
        </section>
      </div>
    </div>
  );
}
