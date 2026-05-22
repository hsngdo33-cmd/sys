"use client";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import Link from "next/link";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Stats {
  customersCount: number;
  suppliersCount: number;
  totalCustomerDebts: number;
  totalSupplierDebts: number;
  monthRevenue: number;
  monthProfit: number;
  monthCollected: number;
  lowStockCount: number;
  todayTransactions: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const SALE_TYPES = ["sale", "بيع"];

function fmt(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "م";
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + "ك";
  return n.toLocaleString("ar-EG", { maximumFractionDigits: 0 });
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "صباح الخير 🌅";
  if (h < 17) return "مساء النور 🌤";
  return "مساء الخير 🌙";
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const [stats, setStats] = useState<Stats>({
    customersCount: 0, suppliersCount: 0,
    totalCustomerDebts: 0, totalSupplierDebts: 0,
    monthRevenue: 0, monthProfit: 0, monthCollected: 0,
    lowStockCount: 0, todayTransactions: 0,
  });
  const [loading, setLoading] = useState(true);
  const [alerts, setAlerts] = useState<string[]>([]);
  const [alertIdx, setAlertIdx] = useState(0);

  useEffect(() => {
    fetchStats();
  }, []);

  // تدوير التنبيهات
  useEffect(() => {
    if (alerts.length <= 1) return;
    const t = setInterval(() => setAlertIdx(i => (i + 1) % alerts.length), 4000);
    return () => clearInterval(t);
  }, [alerts]);

  async function fetchStats() {
    setLoading(true);
    try {
      const now   = new Date();
      const start = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2,"0")}-01`;
      const end   = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2,"0")}-31`;
      const today = now.toISOString().split("T")[0];

      const [
        { data: customers },
        { data: suppliers },
        { data: monthTx },
        { data: products },
        { data: todayTx },
      ] = await Promise.all([
        supabase.from("customers").select("balance"),
        supabase.from("suppliers").select("balance"),
        supabase.from("customer_transactions").select("amount, profit, type").gte("created_at", start).lte("created_at", end),
        supabase.from("products").select("name, stock_quantity"),
        supabase.from("customer_transactions").select("id").gte("created_at", today),
      ]);

      const monthRevenue  = (monthTx ?? []).filter(t => SALE_TYPES.includes(t.type)).reduce((s, t) => s + (Number(t.amount) || 0), 0);
      const monthProfit   = (monthTx ?? []).filter(t => SALE_TYPES.includes(t.type)).reduce((s, t) => s + (Number(t.profit) || 0), 0);
      const monthCollected = (monthTx ?? []).filter(t => t.type === "payment" || t.type === "تحصيل نقدي").reduce((s, t) => s + (Number(t.amount) || 0), 0);
      const lowStock      = (products ?? []).filter(p => Number(p.stock_quantity) <= 5);

      // تنبيهات ذكية
      const newAlerts: string[] = [];
      if (lowStock.length > 0) newAlerts.push(`⚠️ ${lowStock.length} أصناف على وشك النفاد: ${lowStock.slice(0,2).map(p=>p.name).join("، ")}...`);
      const totalDebts = (customers ?? []).reduce((s, c) => s + (Number(c.balance) || 0), 0);
      if (totalDebts > 50000) newAlerts.push(`🔴 إجمالي ديون العملاء تجاوز ${fmt(totalDebts)} ج.م — راجع التحصيل`);
      const margin = monthRevenue > 0 ? Math.round((monthProfit / monthRevenue) * 100) : 0;
      if (margin > 0 && margin < 10) newAlerts.push(`📉 هامش الربح هذا الشهر ${margin}% — راجع الأسعار`);
      if (margin >= 25) newAlerts.push(`📈 أداء ممتاز! هامش الربح ${margin}% هذا الشهر 🎉`);
      if (newAlerts.length === 0) newAlerts.push("✅ كل حاجة تمام — مفيش تنبيهات دلوقتي");

      setAlerts(newAlerts);
      setStats({
        customersCount:    customers?.length || 0,
        suppliersCount:    suppliers?.length || 0,
        totalCustomerDebts: (customers ?? []).reduce((s, c) => s + (Number(c.balance) || 0), 0),
        totalSupplierDebts: (suppliers ?? []).reduce((s, c) => s + (Number(c.balance) || 0), 0),
        monthRevenue, monthProfit, monthCollected,
        lowStockCount: lowStock.length,
        todayTransactions: todayTx?.length || 0,
      });
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  const profitMargin = stats.monthRevenue > 0
    ? Math.round((stats.monthProfit / stats.monthRevenue) * 100)
    : 0;

  const now = new Date();
  const monthName = now.toLocaleDateString("ar-EG", { month: "long", year: "numeric" });

  return (
    <div className="min-h-screen bg-[#f1f5f9] text-right font-sans pb-6 text-slate-900" dir="rtl">

      {/* ══ Header ══ */}
      <header className="hidden">
        <div className="max-w-[1500px] mx-auto px-6 py-4">
          <div className="flex justify-between items-start flex-wrap gap-4">
            <div>
              <p className="text-slate-400 text-xs font-black uppercase tracking-widest mb-1">{getGreeting()}</p>
              <h1 className="text-2xl font-black text-white">منظومة المحاسبة الذكية </h1>
              <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mt-1">إدارة التجارة والمخازن</p>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <div className="bg-white/5 border border-white/10 px-5 py-2.5 rounded-2xl text-center">
                <p className="text-[9px] text-slate-500 font-black uppercase">اليوم</p>
                <p className="text-sm font-black text-white mt-0.5">{now.toLocaleDateString("ar-EG", { weekday:"long", day:"numeric", month:"long" })}</p>
              </div>
              <Link
                href="/reports"
                className="bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-3 rounded-2xl font-black text-sm transition-all active:scale-95 flex items-center gap-2 shadow-lg shadow-indigo-900/40"
              >
                📊 التقارير
              </Link>
              <button
                onClick={fetchStats}
                className="bg-white/10 hover:bg-white/20 text-white px-4 py-3 rounded-2xl font-black text-sm transition-all active:scale-95"
              >
                🔄
              </button>
            </div>
          </div>

          {/* شريط التنبيهات المتحرك */}
          {alerts.length > 0 && (
            <div className="mt-4 bg-white/5 border border-white/10 rounded-2xl px-4 py-2.5 flex items-center gap-3 overflow-hidden">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest shrink-0">تنبيه</span>
              <div className="h-4 w-px bg-white/10 shrink-0" />
              <p
                key={alertIdx}
                className="text-sm font-bold text-slate-300 transition-all duration-500 truncate"
                style={{ animation: "fadeSlide 0.4s ease" }}
              >
                {alerts[alertIdx]}
              </p>
              {alerts.length > 1 && (
                <div className="flex gap-1 shrink-0 mr-auto">
                  {alerts.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setAlertIdx(i)}
                      className={`w-1.5 h-1.5 rounded-full transition-all ${i === alertIdx ? "bg-indigo-400 w-4" : "bg-white/20"}`}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      <main className="app-home-layout max-w-[1500px] mx-auto px-4 pt-2">

        {loading ? (
          <div className="bg-white rounded-[1.5rem] p-12 text-center border border-slate-200 shadow-sm">
            <p className="text-slate-400 font-black text-xl animate-pulse">⏳ جاري تحميل البيانات...</p>
          </div>
        ) : (
          <>
            {/* ══ كروت الشهر الحالي ══ */}
            <section className="app-home-performance">
              <div className="flex items-center gap-3 mb-3">
                <h2 className="font-black text-slate-500 text-[10px] uppercase tracking-widest">أداء {monthName}</h2>
                <div className="flex-1 h-px bg-slate-200" />
              </div>
              <div className="grid grid-cols-2 gap-3">

                {/* إيرادات الشهر */}
                <div className="bg-[#0f172a] text-white app-home-card shadow-lg col-span-2">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">إيرادات الشهر</p>
                  <p className="text-3xl font-black">{fmt(stats.monthRevenue)}</p>
                  <p className="text-xs text-slate-500 font-bold mt-1">جنيه مصري</p>
                </div>

                {/* الربح */}
                <div className="bg-emerald-500 text-white app-home-card shadow-lg shadow-emerald-500/20">
                  <p className="text-[10px] font-black uppercase tracking-widest text-emerald-100 mb-3">صافي الربح</p>
                  <p className="text-3xl font-black">{fmt(stats.monthProfit)}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <div className="flex-1 bg-emerald-400/30 rounded-full h-1.5">
                      <div className="bg-white h-1.5 rounded-full" style={{ width: `${Math.min(profitMargin * 2, 100)}%` }} />
                    </div>
                    <span className="text-[10px] font-black text-emerald-100">{profitMargin}%</span>
                  </div>
                </div>

                {/* التحصيل */}
                <div className="bg-indigo-600 text-white app-home-card shadow-lg shadow-indigo-500/20">
                  <p className="text-[10px] font-black uppercase tracking-widest text-indigo-200 mb-3">تم تحصيله</p>
                  <p className="text-3xl font-black">{fmt(stats.monthCollected)}</p>
                  <p className="text-xs text-indigo-300 font-bold mt-1">هذا الشهر</p>
                </div>

                {/* معاملات اليوم */}
                <div className="bg-amber-500 text-white app-home-card shadow-lg shadow-amber-500/20 col-span-2">
                  <p className="text-[10px] font-black uppercase tracking-widest text-amber-100 mb-3">معاملات اليوم</p>
                  <p className="text-3xl font-black">{stats.todayTransactions}</p>
                  <p className="text-xs text-amber-200 font-bold mt-1">عملية مسجلة</p>
                </div>

              </div>
            </section>

            {/* ══ كروت الإجماليات ══ */}
            <section className="app-home-summary">
              <div className="flex items-center gap-3 mb-3">
                <h2 className="font-black text-slate-500 text-[10px] uppercase tracking-widest">الإجماليات</h2>
                <div className="flex-1 h-px bg-slate-200" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <StatCard label="ديون العملاء" value={fmt(stats.totalCustomerDebts)} sub="ج.م" accent="rose" emoji="🔴" />
                <StatCard label="ديون الموردين" value={fmt(stats.totalSupplierDebts)} sub="ج.م" accent="indigo" emoji="📦" />
                <StatCard label="عدد العملاء" value={String(stats.customersCount)} sub="عميل" accent="slate" emoji="👥" />
                <StatCard label="عدد الموردين" value={String(stats.suppliersCount)} sub="مورد" accent="slate" emoji="🏭" />
              </div>
            </section>

            {alerts.length > 0 && (
              <section className="app-home-alerts app-home-card bg-white border border-slate-200 shadow-sm">
                <div className="flex items-center gap-3 mb-2">
                  <h2 className="font-black text-slate-500 text-[10px] uppercase tracking-widest">تنبيه</h2>
                  <div className="flex-1 h-px bg-slate-200" />
                  <button onClick={fetchStats} className="app-btn app-btn-soft app-btn-sm">تحديث</button>
                </div>
                <p
                  key={alertIdx}
                  className="text-sm font-bold text-slate-700 leading-6"
                  style={{ animation: "fadeSlide 0.4s ease" }}
                >
                  {alerts[alertIdx]}
                </p>
                {alerts.length > 1 && (
                  <div className="flex gap-1 mt-3">
                    {alerts.map((_, i) => (
                      <button
                        key={i}
                        onClick={() => setAlertIdx(i)}
                        className={`h-1.5 rounded-full transition-all ${i === alertIdx ? "bg-indigo-500 w-5" : "bg-slate-200 w-1.5"}`}
                      />
                    ))}
                  </div>
                )}
              </section>
            )}

            {/* ══ تحذير المخزن ══ */}
            {stats.lowStockCount > 0 && (
              <div className="app-home-low-stock bg-amber-50 border-2 border-amber-200 rounded-[1.25rem] p-4 flex items-center gap-3">
                <span className="text-3xl shrink-0">⚠️</span>
                <div className="flex-1">
                  <p className="font-black text-amber-800">تحذير: {stats.lowStockCount} أصناف كميتها منخفضة جداً</p>
                  <p className="text-amber-600 text-sm font-bold mt-0.5">راجع المخزن وأعد الطلب قبل النفاد</p>
                </div>
                <Link
                  href="/inventory"
                  className="bg-amber-500 hover:bg-amber-600 text-white px-5 py-2.5 rounded-xl font-black text-sm transition-all shrink-0"
                >
                  جرد المخزن
                </Link>
              </div>
            )}

            {/* ══ أزرار التنقل ══ */}
            <section className="app-home-sections">
              <div className="flex items-center gap-3 mb-3">
                <h2 className="font-black text-slate-500 text-[10px] uppercase tracking-widest">الأقسام الرئيسية</h2>
                <div className="flex-1 h-px bg-slate-200" />
              </div>
              <div className="grid grid-cols-1 gap-3">
                <NavCard
                  href="/customer"
                  emoji="👥"
                  title="إدارة العملاء"
                  desc="تسجيل مبيعات، تحصيل مبالغ، ومتابعة سجلات البيع"
                  color="emerald"
                  badge={stats.customersCount > 0 ? `${stats.customersCount} عميل` : undefined}
                />
                <NavCard
                  href="/suppliers"
                  emoji="📦"
                  title="إدارة الموردين"
                  desc="إضافة مشتريات، سداد دفعات، ومراجعة حسابات الموردين"
                  color="indigo"
                  badge={stats.suppliersCount > 0 ? `${stats.suppliersCount} مورد` : undefined}
                />
                <NavCard
                  href="/inventory"
                  emoji="🌾"
                  title="المخزن العام"
                  desc="مراقبة الكميات، تحديث الأسعار، وحرد البضاعة"
                  color="amber"
                  badge={stats.lowStockCount > 0 ? `${stats.lowStockCount} صنف ينفد` : undefined}
                  badgeAlert={stats.lowStockCount > 0}
                />
              </div>
            </section>

          </>
        )}
      </main>

      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;900&display=swap');
        body { font-family: 'Cairo', sans-serif; background-color: #f1f5f9; }
        @keyframes fadeSlide {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({ label, value, sub, accent, emoji }: {
  label: string; value: string; sub: string;
  accent: "rose" | "indigo" | "slate"; emoji: string;
}) {
  const bar = { rose: "bg-rose-500", indigo: "bg-indigo-500", slate: "bg-slate-400" };
  return (
    <div className="bg-white app-home-card border border-slate-200 shadow-sm relative overflow-hidden">
      <div className={`w-1 h-10 ${bar[accent]} absolute left-0 top-1/2 -translate-y-1/2 rounded-r-full`} />
      <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest mb-2">{emoji} {label}</p>
      <p className="text-2xl font-black text-slate-900">{value}</p>
      <p className="text-[10px] text-slate-400 font-bold mt-1">{sub}</p>
    </div>
  );
}

function NavCard({ href, emoji, title, desc, color, badge, badgeAlert }: {
  href: string; emoji: string; title: string; desc: string;
  color: "emerald" | "indigo" | "amber";
  badge?: string; badgeAlert?: boolean;
}) {
  const hover = {
    emerald: "hover:border-emerald-400 hover:shadow-emerald-500/10",
    indigo:  "hover:border-indigo-400 hover:shadow-indigo-500/10",
    amber:   "hover:border-amber-400 hover:shadow-amber-500/10",
  };
  const txt = {
    emerald: "text-emerald-600",
    indigo:  "text-indigo-600",
    amber:   "text-amber-600",
  };
  const badgeColor = {
    emerald: "bg-emerald-100 text-emerald-700",
    indigo:  "bg-indigo-100 text-indigo-700",
    amber:   "bg-amber-100 text-amber-700",
  };
  return (
    <Link
      href={href}
      className={`group bg-white app-home-card border border-slate-200 shadow-sm ${hover[color]} transition-all hover:shadow-xl flex flex-col`}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-3xl group-hover:scale-110 transition-transform duration-300">{emoji}</span>
        {badge && (
          <span className={`text-[10px] font-black px-3 py-1 rounded-full ${badgeAlert ? "bg-rose-100 text-rose-600" : badgeColor[color]}`}>
            {badge}
          </span>
        )}
      </div>
      <h4 className="mt-3 text-base font-black text-slate-900 mb-1">{title}</h4>
      <p className="text-slate-500 text-xs font-bold leading-6 flex-1">{desc}</p>
      <div className={`mt-3 flex items-center gap-1 ${txt[color]} font-black text-xs`}>
        افتح الآن ⬅️
      </div>
    </Link>
  );
}
