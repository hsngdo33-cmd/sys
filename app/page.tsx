"use client";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import Link from "next/link";

export default function Dashboard() {
  const [stats, setStats] = useState({
    customersCount: 0,
    suppliersCount: 0,
    totalCustomerDebts: 0,
    totalSupplierDebts: 0,
  });

  useEffect(() => {
    async function fetchStats() {
      const { data: customers } = await supabase.from("customers").select("balance");
      const { data: suppliers } = await supabase.from("suppliers").select("balance");

      setStats({
        customersCount: customers?.length || 0,
        suppliersCount: suppliers?.length || 0,
        totalCustomerDebts: customers?.reduce((acc, c) => acc + (c.balance || 0), 0) || 0,
        totalSupplierDebts: suppliers?.reduce((acc, s) => acc + (s.balance || 0), 0) || 0,
      });
    }
    fetchStats();
  }, []);

  return (
    <div className="min-h-screen bg-[#f1f5f9] text-right font-sans pb-10 text-slate-900" dir="rtl">
      
      <header className="bg-[#0f172a] text-white p-6 shadow-xl mb-8">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-black italic text-white">منظومة العمدة  🌾</h1>
            <p className="text-[10px] text-slate-400 mt-1 font-black uppercase tracking-widest">إدارة التجارة والمخازن</p>
          </div>
          <div className="flex gap-3">
             <button className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-xl font-black text-sm shadow-lg transition-all active:scale-95 border border-indigo-400/20">
                📅 حسابات الشهر
             </button>
             <div className="bg-white/10 px-4 py-2 rounded-xl text-center border border-white/5">
                <p className="text-[9px] text-slate-400 font-black uppercase">اليوم</p>
                <p className="text-sm font-bold text-white">{new Date().toLocaleDateString('ar-EG')}</p>
             </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-4">
        
        {/* كروت الإحصائيات - الخطوط سوداء واضحة جداً */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
          <div className="bg-white p-7 rounded-[2rem] border border-slate-200 shadow-sm relative overflow-hidden group">
            <p className="text-slate-500 text-[10px] font-black mb-2 uppercase tracking-[0.2em]">إجمالي ديون العملاء</p>
            <h3 className="text-4xl font-black text-slate-900">{stats.totalCustomerDebts.toLocaleString()} <small className="text-xs font-normal opacity-50">ج.م</small></h3>
            <div className="w-1 h-12 bg-rose-500 absolute left-0 top-1/2 -translate-y-1/2 rounded-r-full"></div>
          </div>

          <div className="bg-white p-7 rounded-[2rem] border border-slate-200 shadow-sm relative overflow-hidden group">
            <p className="text-slate-500 text-[10px] font-black mb-2 uppercase tracking-[0.2em]">ديون الموردين</p>
            <h3 className="text-4xl font-black text-slate-900">{stats.totalSupplierDebts.toLocaleString()} <small className="text-xs font-normal opacity-50">ج.م</small></h3>
            <div className="w-1 h-12 bg-indigo-500 absolute left-0 top-1/2 -translate-y-1/2 rounded-r-full"></div>
          </div>

          <div className="bg-white p-7 rounded-[2rem] border border-slate-200 shadow-sm">
            <p className="text-slate-500 text-[10px] font-black mb-2 uppercase tracking-[0.2em]">عدد العملاء</p>
            <h3 className="text-4xl font-black text-slate-900">{stats.customersCount} <small className="text-xs font-normal opacity-50">عميل</small></h3>
          </div>

          <div className="bg-white p-7 rounded-[2rem] border border-slate-200 shadow-sm">
            <p className="text-slate-500 text-[10px] font-black mb-2 uppercase tracking-[0.2em]">عدد الموردين</p>
            <h3 className="text-4xl font-black text-slate-900">{stats.suppliersCount} <small className="text-xs font-normal opacity-50">مورد</small></h3>
          </div>
        </div>

        {/* الأزرار الكبيرة - تم تعديل اللينك هنا ليكون customer فقط */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          
          {/* تم تعديل اللينك هنا ليكون /customer */}
          <Link href="/customer" className="group bg-white p-10 rounded-[3rem] border border-slate-200 shadow-sm hover:border-emerald-500 transition-all hover:shadow-xl hover:shadow-emerald-500/5">
             <div className="text-5xl mb-6 group-hover:scale-110 transition-transform duration-300">👥</div>
             <h4 className="text-2xl font-black text-slate-900">إدارة العملاء</h4>
             <p className="text-slate-500 text-sm mt-3 font-bold leading-relaxed">تسجيل مبيعات جديدة، تحصيل مبالغ، ومتابعة سجلات البيع.</p>
             <div className="mt-6 flex items-center gap-2 text-emerald-600 font-black text-xs italic">
                افتح الدليل الآن ⬅️
             </div>
          </Link>

          <Link href="/suppliers" className="group bg-white p-10 rounded-[3rem] border border-slate-200 shadow-sm hover:border-indigo-500 transition-all hover:shadow-xl hover:shadow-indigo-500/5">
             <div className="text-5xl mb-6 group-hover:scale-110 transition-transform duration-300">📦</div>
             <h4 className="text-2xl font-black text-slate-900">إدارة الموردين</h4>
             <p className="text-slate-500 text-sm mt-3 font-bold leading-relaxed">إضافة مشتريات للمخزن، سداد دفعات، ومراجعة حساب الموردين.</p>
             <div className="mt-6 flex items-center gap-2 text-indigo-600 font-black text-xs italic">
                افتح السجل الآن ⬅️
             </div>
          </Link>

          <Link href="/inventory" className="group bg-white p-10 rounded-[3rem] border border-slate-200 shadow-sm hover:border-amber-500 transition-all hover:shadow-xl hover:shadow-amber-500/5">
             <div className="text-5xl mb-6 group-hover:scale-110 transition-transform duration-300">🌾</div>
             <h4 className="text-2xl font-black text-slate-900">المخزن العام</h4>
             <p className="text-slate-500 text-sm mt-3 font-bold leading-relaxed">مراقبة كميات البضاعة، تحديث الأسعار، وحرد المخازن.</p>
             <div className="mt-6 flex items-center gap-2 text-amber-600 font-black text-xs italic">
                جرد البضاعة ⬅️
             </div>
          </Link>
        </div>

      </main>

      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;900&display=swap');
        body { font-family: 'Cairo', sans-serif; background-color: #f1f5f9; }
      `}</style>
    </div>
  );
}