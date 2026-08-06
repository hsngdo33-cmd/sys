"use client";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useParams } from "next/navigation";
import Link from "next/link";

export default function GlobalHistoryUI() {
  const { id } = useParams();
  const [trans, setTrans] = useState<any[]>([]);
  const [customer, setCustomer] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      if (!id) return;
      setLoading(true);
      const { data: cust } = await supabase.from("customers").select("*").eq("id", id).single();
      setCustomer(cust);

      const { data: history } = await supabase
        .from("customer_transactions")
        .select("*")
        .eq("customer_id", id)
        .order("created_at", { ascending: false });
      
      setTrans(history || []);
      setLoading(false);
    }
    load();
  }, [id]);

  if (loading) return <div className="h-screen flex items-center justify-center font-black animate-pulse text-slate-400 tracking-tighter">FETCHING LEDGER...</div>;

  return (
    <div className="min-h-screen bg-[#f8fafc] text-right font-sans pb-20" dir="rtl">
      
      {/* Header Bar */}
      <nav className="no-print sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-200 px-6 py-4 mb-8">
        <div className="max-w-5xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center text-white shadow-lg font-black italic">H</div>
            <div>
              <h1 className="text-lg font-black text-slate-800">كشف الحساب الذكي</h1>
              <p className="text-[9px] text-slate-400 font-bold uppercase tracking-[0.2em]">Transaction Ledger</p>
            </div>
          </div>
          <div className="flex gap-3">
             <button onClick={() => window.print()} className="bg-emerald-600 text-white px-5 py-2 rounded-xl font-bold hover:bg-emerald-700 transition-all flex items-center gap-2 text-sm shadow-lg shadow-emerald-200">
               طباعة الكشف 🖨️
             </button>
             <Link href={`/customer/${id}`} className="bg-white border border-slate-200 text-slate-600 px-5 py-2 rounded-xl font-bold hover:bg-slate-50 transition-all text-sm shadow-sm">
               العودة للفاتورة ←
             </Link>
          </div>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-4">
        
        {/* Customer Info Card */}
        <div className="bg-slate-900 rounded-[3rem] p-8 md:p-12 mb-12 shadow-2xl shadow-slate-300 relative overflow-hidden">
           <div className="relative z-10 flex flex-col md:flex-row justify-between items-center gap-6">
              <div>
                 <p className="text-slate-400 font-black text-xs uppercase tracking-[0.3em] mb-2">اسم العميل</p>
                 <h2 className="text-4xl font-black text-white tracking-tighter">{customer?.name}</h2>
                 <p className="text-emerald-400 font-bold mt-2 flex items-center gap-2">
                    <span className="w-2 h-2 bg-emerald-400 rounded-full animate-ping"></span>
                    حساب نشط
                 </p>
              </div>
              <div className="text-center md:text-left bg-white/5 backdrop-blur-xl p-6 rounded-[2rem] border border-white/10 min-w-[200px]">
                 <p className="text-slate-400 font-bold text-[10px] uppercase mb-1">الرصيد المتبقي (الذمة)</p>
                 <h3 className="text-4xl font-black text-white leading-none">
                    {customer?.balance?.toLocaleString()}
                    <span className="text-sm font-normal text-slate-500 mr-2 uppercase">EGP</span>
                 </h3>
              </div>
           </div>
           {/* Abstract background shapes */}
           <div className="absolute top-[-20%] left-[-10%] w-64 h-64 bg-blue-600/20 rounded-full blur-[80px]"></div>
           <div className="absolute bottom-[-20%] right-[-10%] w-64 h-64 bg-emerald-600/10 rounded-full blur-[80px]"></div>
        </div>

        {/* Transactions Timeline */}
        <div className="relative border-r-2 border-slate-200 mr-4 md:mr-8 pr-8 pb-10">
          {trans.length > 0 ? (
            trans.map((t, idx) => (
              <div key={t.id} className="relative mb-12 group">
                
                {/* Timeline Dot */}
                <div className={`absolute right-[-41px] top-0 w-5 h-5 rounded-full border-4 border-[#f8fafc] shadow-sm z-10 transition-transform group-hover:scale-125 ${t.type === 'صادر' ? 'bg-red-500' : 'bg-emerald-500'}`}></div>

                {/* Date Label */}
                <div className="mb-3">
                   <span className="text-[10px] font-black text-slate-400 bg-slate-100 px-3 py-1 rounded-lg uppercase">
                     {new Date(t.created_at).toLocaleString('ar-EG-u-nu-latn', { dateStyle: 'full' })}
                   </span>
                   <span className="text-[10px] font-bold text-slate-300 mr-3 italic">
                      {new Date(t.created_at).toLocaleTimeString('ar-EG-u-nu-latn', { hour: '2-digit', minute: '2-digit' })}
                   </span>
                </div>

                {/* Transaction Card */}
                <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm hover:shadow-xl hover:translate-y-[-5px] transition-all duration-300 overflow-hidden">
                   <div className="p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                      <div className="flex items-center gap-4">
                         <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-2xl ${t.type === 'صادر' ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'}`}>
                            {t.type === 'صادر' ? '📑' : '💸'}
                         </div>
                         <div>
                            <h4 className="font-black text-slate-800 text-lg">
                               {t.type === 'صادر' ? 'فاتورة مبيعات جديدة' : 'استلام دفعة نقدية'}
                            </h4>
                            <p className="text-xs font-bold text-slate-400">{t.description}</p>
                         </div>
                      </div>
                      <div className="text-left">
                         <p className={`text-2xl font-black tracking-tighter ${t.type === 'صادر' ? 'text-red-600' : 'text-emerald-600'}`}>
                            {t.type === 'صادر' ? '+' : '-'} {t.amount?.toLocaleString()}
                            <span className="text-[10px] mr-1 uppercase">ج.م</span>
                         </p>
                      </div>
                   </div>

                   {/* Items Detail Section */}
                   {t.items && t.items.length > 0 && (
                      <div className="px-6 pb-6 pt-2">
                         <div className="bg-slate-50/50 rounded-2xl p-4 border border-slate-100 grid grid-cols-1 md:grid-cols-2 gap-3">
                            {t.items.map((item: any, i: number) => (
                               <div key={i} className="flex justify-between items-center bg-white p-3 rounded-xl shadow-sm border border-slate-50">
                                  <div className="flex items-center gap-3">
                                     <span className="bg-slate-900 text-white w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-black">{item.qty}</span>
                                     <span className="font-black text-slate-700 text-sm">{item.name}</span>
                                  </div>
                                  <span className="text-xs font-bold text-slate-400">{(item.sale_price * item.qty).toLocaleString()} ج.م</span>
                               </div>
                            ))}
                         </div>
                      </div>
                   )}
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-20 bg-white rounded-[3rem] border border-dashed border-slate-300">
               <p className="text-slate-300 font-black italic">لا توجد حركات مسجلة لهذا العميل حتى الآن</p>
            </div>
          )}
        </div>

        <p className="text-center text-[10px] font-black text-slate-300 tracking-[0.5em] mt-10 uppercase">Global Ledger System Final Build</p>
      </div>

      <style jsx global>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          .bg-slate-900 { background: #0f172a !important; -webkit-print-color-adjust: exact; }
          .rounded-[3rem], .rounded-[2rem] { border-radius: 1rem !important; }
        }
        .custom-scrollbar::-webkit-scrollbar { width: 5px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }
      `}</style>
    </div>
  );
}