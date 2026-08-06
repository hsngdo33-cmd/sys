"use client";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useParams } from "next/navigation";
import Link from "next/link";

export default function SupplierHistoryCards() {
  const { id } = useParams();
  const [transactions, setTransactions] = useState<any[]>([]);
  const [supplier, setSupplier] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchHistory() {
      if (!id) return;
      setLoading(true);
      try {
        const { data: supp } = await supabase.from("suppliers").select("*").eq("id", id).single();
        setSupplier(supp);

        const { data: trans } = await supabase
          .from("transactions")
          .select("*")
          .eq("supplier_id", id)
          .order("created_at", { ascending: false });
        
        setTransactions(trans || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    fetchHistory();
  }, [id]);

  if (loading) return <div className="h-screen flex items-center justify-center font-black text-blue-600 italic animate-pulse">جاري تحميل السجل...</div>;

  return (
    <div className="min-h-screen bg-[#f3f4f6] text-right font-sans pb-20" dir="rtl">
      
      {/* Header */}
      <nav className="no-print sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-200 px-6 py-5 mb-10 shadow-sm">
        <div className="max-w-4xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Link href={`/suppliers/${id}`} className="w-12 h-12 bg-slate-900 text-white rounded-2xl flex items-center justify-center hover:scale-105 transition-all shadow-lg">
              ⬅️
            </Link>
            <div>
               <h1 className="text-2xl font-black text-slate-800 tracking-tight">كشف حساب المورد</h1>
               <p className="text-[10px] text-blue-500 font-bold uppercase tracking-widest leading-none mt-1">Supplier Ledger</p>
            </div>
          </div>
          <button onClick={() => window.print()} className="bg-blue-600 text-white px-6 py-2.5 rounded-xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-100">
            طباعة الكشف
          </button>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-4">
        
        {/* المورد الحالي */}
        <div className="bg-white rounded-[2.5rem] p-8 shadow-sm border border-slate-100 mb-10 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-5">
             <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-[1.8rem] flex items-center justify-center text-3xl font-black italic">
                {supplier?.name?.charAt(0)}
             </div>
             <div>
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">اسم المورد</span>
                <h2 className="text-3xl font-black text-slate-900 leading-tight">{supplier?.name}</h2>
             </div>
          </div>
          <div className="bg-slate-900 p-6 rounded-[2rem] text-center min-w-[240px] shadow-xl shadow-slate-200">
            <p className="text-slate-400 font-bold text-xs mb-1">الرصيد المتبقي له</p>
            <p className="text-3xl font-black text-amber-400 tracking-tighter">
               {supplier?.balance?.toLocaleString()} <small className="text-sm text-white/50">ج.م</small>
            </p>
          </div>
        </div>

        {/* قائمة الكروت */}
        <div className="space-y-6">
          <h3 className="text-slate-400 font-black text-xs uppercase tracking-[0.3em] mb-4 mr-4">المعاملات الأخيرة</h3>
          
          {transactions.map((t) => (
            <div key={t.id} className="bg-white rounded-[2.2rem] border border-slate-100 shadow-sm hover:shadow-md transition-shadow overflow-hidden group">
               <div className="p-8 flex flex-col md:flex-row justify-between items-center gap-6">
                  
                  {/* بيانات الحركة */}
                  <div className="flex items-center gap-6 flex-grow">
                     <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-2xl transition-transform group-hover:scale-110 ${
                        t.type === 'فاتورة توريد' ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'
                     }`}>
                        {t.type === 'فاتورة توريد' ? '📦' : '💸'}
                     </div>
                     <div>
                        <div className="flex items-center gap-3 mb-1">
                           <span className={`text-[10px] font-black px-3 py-1 rounded-full uppercase ${
                              t.type === 'فاتورة توريد' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
                           }`}>
                              {t.type}
                           </span>
                           <span className="text-[11px] font-bold text-slate-400 italic">
                              {new Date(t.created_at).toLocaleDateString('ar-EG-u-nu-latn')}
                           </span>
                        </div>
                        <h4 className="font-black text-slate-800 text-lg leading-snug">
                           {t.description || "معاملة تجارية مسجلة"}
                        </h4>
                     </div>
                  </div>

                  {/* المبلغ */}
                  <div className="text-left md:border-r border-slate-100 pr-8 min-w-[180px]">
                     <p className="text-[10px] font-black text-slate-400 uppercase mb-1">المبلغ المالي</p>
                     <p className={`text-3xl font-black tracking-tighter ${
                        t.type === 'فاتورة توريد' ? 'text-slate-900' : 'text-emerald-600'
                     }`}>
                        {t.type === 'فاتورة توريد' ? '+' : '-'} {t.amount?.toLocaleString()}
                        <small className="text-[10px] mr-1 opacity-40">ج.م</small>
                     </p>
                  </div>
               </div>

               {/* تفاصيل الأصناف (لو كانت فاتورة توريد) */}
               {t.items && t.items.length > 0 && (
                  <div className="bg-slate-50/50 px-8 py-5 border-t border-slate-50 flex flex-wrap gap-2">
                     {t.items.map((item: any, i: number) => (
                        <span key={i} className="bg-white border border-slate-200 px-4 py-2 rounded-xl text-xs font-black text-slate-600 shadow-sm">
                           {item.name} <span className="text-blue-500 mr-2">x{item.qty}</span>
                        </span>
                     ))}
                  </div>
               )}
            </div>
          ))}

          {transactions.length === 0 && (
            <div className="text-center py-20 bg-white rounded-[3rem] border border-dashed border-slate-200">
               <p className="text-slate-300 font-black italic">لا توجد سجلات حالية للمورد</p>
            </div>
          )}
        </div>

      </div>

      <style jsx global>{`
        body { background-color: #f3f4f6 !important; }
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          .bg-white { border: 1px solid #eee !important; box-shadow: none !important; }
        }
      `}</style>
    </div>
  );
}