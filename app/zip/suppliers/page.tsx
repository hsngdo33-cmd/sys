"use client";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import Link from "next/link";

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [newSupp, setNewSupp] = useState({ name: "", phone: "", balance: "" });

  useEffect(() => { fetchSuppliers(); }, []);

  const fetchSuppliers = async () => {
    const { data } = await supabase.from("suppliers").select("*").order("created_at", { ascending: false });
    setSuppliers(data || []);
    setLoading(false);
  };

  const handleQuickPayment = async (id: string, currentBalance: number, name: string) => {
    const amount = prompt(`تسديد سريع لـ : ${name}\nالمبلغ المدفوع حالياً:`);
    if (!amount || isNaN(Number(amount))) return;
    const pay = Number(amount);
    try {
      await supabase.from("transactions").insert([{
        supplier_id: id, amount: pay, type: "سداد نقدي", description: "سداد سريع"
      }]);
      await supabase.from("suppliers").update({ balance: currentBalance - pay }).eq("id", id);
      fetchSuppliers();
    } catch (e) { alert("خطأ في الاتصال بالسيرفر"); }
  };

  const handleAddSupplier = async () => {
    if (!newSupp.name) return;
    await supabase.from("suppliers").insert([newSupp]);
    setNewSupp({ name: "", phone: "", balance: "" });
    fetchSuppliers();
  };

  return (
    <div className="min-h-screen bg-[#fcfdfe] text-right font-sans selection:bg-indigo-100" dir="rtl">
      
      {/* Header احترافي فخم */}
      <nav className="bg-[#0f172a] text-white px-8 py-6 flex justify-between items-center shadow-2xl shadow-slate-200">
        <div className="flex items-center gap-6">
          <Link href="/" className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center hover:rotate-12 transition-transform shadow-lg shadow-indigo-500/40 font-bold">🏠</Link>
          <div>
            <h1 className="text-2xl font-black tracking-tight leading-none">إدارة الموردين</h1>
            <span className="text-[10px] text-indigo-300 font-bold uppercase tracking-[0.3em]">Accounting System v2.0</span>
          </div>
        </div>
        <div className="bg-white/10 px-6 py-2 rounded-full border border-white/10 text-sm font-bold backdrop-blur-md">
          {new Intl.DateTimeFormat('ar-EG', { dateStyle: 'full' }).format(new Date())}
        </div>
      </nav>

      <div className="max-w-[1400px] mx-auto p-8 grid grid-cols-1 lg:grid-cols-12 gap-10">
        
        {/* الجانب الأيمن: كارت الإضافة بنظام Neumorphism خفيف */}
        <div className="lg:col-span-4">
          <div className="bg-white rounded-[2.5rem] p-8 shadow-[0_20px_50px_rgba(0,0,0,0.05)] border border-slate-50 sticky top-10">
            <h2 className="text-xl font-black text-slate-900 mb-8 border-r-4 border-indigo-600 pr-4">تسجيل مورد</h2>
            <div className="space-y-6">
              <div className="group">
                <label className="block text-[10px] font-black text-slate-400 mb-2 uppercase tracking-widest mr-2 group-focus-within:text-indigo-600 transition-colors">اسم الجهة / المورد</label>
                <input 
                  className="w-full bg-slate-50 border-2 border-transparent rounded-2xl p-4 font-bold text-slate-800 outline-none focus:bg-white focus:border-indigo-500/20 transition-all shadow-inner" 
                  value={newSupp.name} 
                  onChange={(e)=>setNewSupp({...newSupp, name: e.target.value})} 
                  placeholder="اسم المورد"
                />
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 mb-2 uppercase tracking-widest mr-2 italic">رقم التواصل</label>
                <input 
                  className="w-full bg-slate-50 border-2 border-transparent rounded-2xl p-4 font-bold text-slate-800 outline-none focus:bg-white focus:border-indigo-500/20 transition-all shadow-inner" 
                  value={newSupp.phone} 
                  onChange={(e)=>setNewSupp({...newSupp, phone: e.target.value})} 
                />
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 mb-2 uppercase tracking-widest mr-2 italic">الرصيد الافتتاحي (مدين)</label>
                <input 
                  type="number"
                  className="w-full bg-slate-50 border-2 border-transparent rounded-2xl p-4 font-bold text-slate-800 outline-none focus:bg-white focus:border-indigo-500/20 transition-all shadow-inner" 
                  value={newSupp.balance} 
                  onChange={(e)=>setNewSupp({...newSupp, balance: e.target.value})} 
                />
              </div>
              <button 
                onClick={handleAddSupplier} 
                className="w-full bg-indigo-600 text-white py-5 rounded-[1.5rem] font-black text-lg hover:bg-slate-900 transition-all shadow-xl shadow-indigo-100 flex items-center justify-center gap-3 active:scale-95"
              >
                تأكيد الحفظ 📥
              </button>
            </div>
          </div>
        </div>

        {/* الجانب الأيسر: القائمة الاحترافية */}
        <div className="lg:col-span-8 space-y-8">
          
          {/* بار البحث الذكي */}
          <div className="relative group">
            <input 
              type="text" 
              placeholder="ابحث بالاسم أو رقم الهاتف..." 
              className="w-full bg-white shadow-xl shadow-slate-100 rounded-[2rem] p-6 pr-14 font-bold text-slate-700 outline-none border-2 border-transparent focus:border-indigo-500/10 transition-all"
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <span className="absolute right-6 top-6 opacity-30 text-xl">🔍</span>
          </div>

          {/* الجدول المطور */}
          <div className="bg-white rounded-[2.5rem] shadow-2xl shadow-slate-100 overflow-hidden border border-slate-50">
            <table className="w-full text-right border-collapse">
              <thead>
                <tr className="bg-slate-50/50 text-slate-400 text-[10px] font-black uppercase tracking-[0.2em] border-b border-slate-100">
                  <th className="p-6 pr-10">المورد</th>
                  <th className="p-6 text-center">الحالة المالية</th>
                  <th className="p-6 text-left pl-10">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {suppliers.filter(s => s.name.includes(searchTerm)).map(s => (
                  <tr key={s.id} className="group hover:bg-indigo-50/30 transition-all duration-300">
                    <td className="p-6 pr-10">
                      <p className="font-black text-slate-800 text-lg group-hover:text-indigo-600 transition-colors">{s.name}</p>
                      <p className="text-xs font-bold text-slate-400 mt-1">{s.phone || "لا يوجد هاتف مسجل"}</p>
                    </td>
                    <td className="p-6 text-center">
                      <div className={`inline-flex flex-col items-center px-6 py-2 rounded-2xl ${s.balance > 0 ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'}`}>
                        <span className="text-[10px] font-black uppercase mb-1 opacity-60">{s.balance > 0 ? 'مديونية' : 'مستقر'}</span>
                        <span className="text-xl font-black tracking-tighter">{s.balance?.toLocaleString()} <small className="text-[10px]">ج.م</small></span>
                      </div>
                    </td>
                    <td className="p-6 text-left pl-10">
                      <div className="flex gap-2 justify-end opacity-0 group-hover:opacity-100 transition-all translate-x-4 group-hover:translate-x-0">
                        <Link href={`/suppliers/${s.id}`} className="bg-slate-900 text-white w-10 h-10 rounded-xl flex items-center justify-center hover:bg-indigo-600 transition-colors shadow-lg" title="فاتورة">📦</Link>
                        <button onClick={() => handleQuickPayment(s.id, s.balance, s.name)} className="bg-slate-900 text-white w-10 h-10 rounded-xl flex items-center justify-center hover:bg-orange-500 transition-colors shadow-lg" title="سداد">💸</button>
                        <Link href={`/suppliers/${s.id}/history`} className="bg-slate-900 text-white w-10 h-10 rounded-xl flex items-center justify-center hover:bg-blue-600 transition-colors shadow-lg" title="السجل">📜</Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {suppliers.length === 0 && !loading && (
              <div className="p-20 text-center font-black text-slate-200 italic tracking-widest text-2xl">NO DATA FOUND</div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
