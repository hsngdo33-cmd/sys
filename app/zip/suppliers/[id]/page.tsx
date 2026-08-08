"use client";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

export default function SupplierInvoiceCompact() {
  const { id } = useParams();
  const [supplier, setSupplier] = useState<any>(null);
  const [products, setProducts] = useState<any[]>([]);
  const [cart, setCart] = useState<any[]>([]);
  const [cashPaid, setCashPaid] = useState(0);
  const [searchTerm, setSearchTerm] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    async function loadData() {
      if (!id) return;
      const { data: supp } = await supabase.from("suppliers").select("*").eq("id", id).single();
      setSupplier(supp);
      const { data: prods } = await supabase.from("products").select("*").order("name");
      setProducts(prods || []);
    }
    loadData();
  }, [id]);

  const addToCart = (p: any) => {
    const exist = cart.find(item => item.id === p.id);
    if (exist) {
      setCart(cart.map(item => item.id === p.id ? { ...item, qty: item.qty + 1 } : item));
    } else {
      setCart([...cart, { ...p, qty: 1, cost_price: p.purchase_price || 0 }]);
    }
  };

  const totalInvoice = cart.reduce((sum, i) => sum + (i.qty * i.cost_price), 0);

  const saveInvoice = async () => {
    if (cart.length === 0) return;
    setIsSaving(true);
    try {
      const itemsSummary = cart.map(i => `${i.name} (${i.qty})`).join(' + ');
      await supabase.from("transactions").insert([{
        supplier_id: id, amount: totalInvoice, type: "فاتورة توريد", description: itemsSummary,
        items: cart.map(i => ({ name: i.name, qty: i.qty, price: i.cost_price }))
      }]);
      if (cashPaid > 0) {
        await supabase.from("transactions").insert([{
          supplier_id: id, amount: cashPaid, type: "سداد نقدي", description: `سداد من فاتورة توريد`,
        }]);
      }
      const newBalance = (supplier.balance || 0) + (totalInvoice - cashPaid);
      await supabase.from("suppliers").update({ balance: newBalance }).eq("id", id);
      alert("✅ تم الحفظ");
      window.location.href = `/suppliers/${id}/history`;
    } catch (err: any) { alert("خطأ: " + err.message); } finally { setIsSaving(false); }
  };

  if (!supplier) return <div className="h-screen flex items-center justify-center font-bold text-slate-400">جاري التحميل...</div>;

  return (
    <div className="min-h-screen bg-[#f4f7f6] text-right font-sans p-4 md:p-6" dir="rtl">
      
      {/* Header مصغر جداً */}
      <div className="max-w-[1400px] mx-auto flex justify-between items-center mb-4 bg-white p-3 px-6 rounded-2xl shadow-sm border border-slate-200">
        <div className="flex items-center gap-4">
          <Link href="/" className="text-xl p-2 bg-slate-100 rounded-xl hover:bg-slate-900 hover:text-white transition-all">🏠</Link>
          <div className="border-r pr-4">
            <h1 className="text-lg font-black text-slate-800 tracking-tight">توريد بضاعة</h1>
            <p className="text-[10px] text-blue-600 font-bold uppercase tracking-widest">{supplier.name}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
            <div className="text-left leading-tight ml-4">
                <p className="text-[10px] text-slate-400 font-bold">الرصيد السابق</p>
                <p className="text-sm font-black text-red-600">{supplier.balance?.toLocaleString()} ج.م</p>
            </div>
            <Link href={`/suppliers/${id}/history`} className="bg-slate-800 text-white px-4 py-2 rounded-lg text-xs font-bold transition-all">السجل 📋</Link>
        </div>
      </div>

      <div className="max-w-[1400px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-4">
        
        {/* اختيار الأصناف - مكبس وقوي */}
        <div className="lg:col-span-3">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col h-[calc(100vh-140px)]">
            <div className="p-4 border-b">
              <input 
                type="text" 
                placeholder="بحث سريع..." 
                className="w-full bg-slate-50 border border-slate-100 rounded-xl p-2.5 px-4 text-sm font-bold focus:bg-white focus:ring-2 ring-blue-500/10 outline-none transition-all"
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="flex-grow overflow-y-auto p-2 space-y-1 custom-scrollbar">
              {products.filter(p => p.name.includes(searchTerm)).map(p => (
                <button 
                  key={p.id} 
                  onClick={() => addToCart(p)}
                  className="w-full flex justify-between items-center p-3 rounded-xl hover:bg-blue-50 transition-all group border border-transparent hover:border-blue-100"
                >
                  <span className="font-bold text-slate-700 text-sm group-hover:text-blue-700">{p.name}</span>
                  <span className="text-[10px] bg-white border px-2 py-1 rounded-md font-black text-slate-400 group-hover:text-blue-600">{p.purchase_price}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* الفاتورة - منظمة ومركزة */}
        <div className="lg:col-span-9">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col h-[calc(100vh-140px)] overflow-hidden">
            
            {/* الجدول */}
            <div className="flex-grow overflow-y-auto p-4 custom-scrollbar">
              <table className="w-full text-right border-separate border-spacing-y-2">
                <thead className="bg-white">
                  <tr className="text-slate-400 text-[11px] font-black uppercase">
                    <th className="pb-3 pr-4">الصنف</th>
                    <th className="pb-3 text-center">السعر</th>
                    <th className="pb-3 text-center">الكمية</th>
                    <th className="pb-3 text-left pl-4">الإجمالي</th>
                  </tr>
                </thead>
                <tbody>
                  {cart.map((item, idx) => (
                    <tr key={idx} className="bg-slate-50/50 hover:bg-slate-50 transition-colors">
                      <td className="py-2 pr-4 rounded-r-xl border-y border-r border-slate-100 font-bold text-sm text-slate-800">{item.name}</td>
                      <td className="py-2 text-center border-y border-slate-100">
                        <input 
                          type="number" 
                          value={item.cost_price} 
                          onChange={(e) => setCart(cart.map(i => i.id === item.id ? {...i, cost_price: Number(e.target.value)} : i))}
                          className="w-20 p-1.5 text-center bg-white border border-slate-200 rounded-lg font-bold text-sm text-blue-600 outline-none focus:ring-1 ring-blue-500"
                        />
                      </td>
                      <td className="py-2 text-center border-y border-slate-100">
                        <div className="flex items-center justify-center gap-2">
                          <button onClick={() => setCart(cart.map(i => i.id === item.id ? {...i, qty: Math.max(1, i.qty-1)} : i))} className="w-7 h-7 bg-white border border-slate-200 rounded-md text-slate-400 hover:text-red-500 font-bold">-</button>
                          <span className="font-black text-slate-800 text-sm w-6">{item.qty}</span>
                          <button onClick={() => setCart(cart.map(i => i.id === item.id ? {...i, qty: i.qty+1} : i))} className="w-7 h-7 bg-white border border-slate-200 rounded-md text-slate-400 hover:text-green-500 font-bold">+</button>
                        </div>
                      </td>
                      <td className="py-2 text-left pl-4 rounded-l-xl border-y border-l border-slate-100 font-black text-slate-900 text-sm">
                        {(item.qty * item.cost_price).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {cart.length === 0 && (
                <div className="text-center py-20 opacity-20 font-black text-sm italic">السلة فارغة.. أضف أصنافاً</div>
              )}
            </div>

            {/* فوتر الفاتورة - مجمع ومريح */}
            <div className="bg-slate-900 p-4 px-8 flex justify-between items-center gap-6">
               <div className="flex gap-10">
                  <div>
                    <p className="text-slate-500 text-[10px] font-black uppercase mb-1">إجمالي الفاتورة</p>
                    <p className="text-2xl font-black text-amber-400 leading-none">{totalInvoice.toLocaleString()} <small className="text-[10px] text-white/40">ج.م</small></p>
                  </div>
                  <div className="border-r border-white/10 pr-10">
                    <p className="text-slate-500 text-[10px] font-black uppercase mb-1 tracking-widest">المستحق الجديد</p>
                    <p className="text-2xl font-black text-white leading-none">
                        {((supplier.balance || 0) + (totalInvoice - cashPaid)).toLocaleString()}
                    </p>
                  </div>
               </div>

               <div className="flex items-center gap-4">
                  <div className="bg-white/5 p-2 px-4 rounded-xl border border-white/10">
                    <label className="block text-[9px] font-black text-blue-400 uppercase mb-1">سداد نقدي الآن</label>
                    <input 
                      type="number" 
                      value={cashPaid}
                      onChange={(e) => setCashPaid(Number(e.target.value))}
                      className="bg-transparent text-white text-xl font-black outline-none w-28 text-center"
                    />
                  </div>
                  <button 
                    onClick={saveInvoice}
                    disabled={isSaving || cart.length === 0}
                    className="bg-blue-600 hover:bg-blue-500 text-white px-8 py-4 rounded-xl font-black text-sm shadow-xl transition-all active:scale-95 disabled:opacity-30"
                  >
                    {isSaving ? "جاري الحفظ..." : "حفظ الفاتورة ✅"}
                  </button>
               </div>
            </div>
          </div>
        </div>
      </div>

      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
      `}</style>
    </div>
  );
}
