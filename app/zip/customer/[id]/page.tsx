"use client";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

export default function GlobalInvoiceSystem() {
  const { id } = useParams();
  const router = useRouter();
  
  // State Management
  const [customer, setCustomer] = useState<any>(null);
  const [products, setProducts] = useState<any[]>([]);
  const [cart, setCart] = useState<any[]>([]);
  const [cashPaid, setCashPaid] = useState(0);
  const [searchTerm, setSearchTerm] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // Initial Data Fetch
  useEffect(() => {
    async function loadData() {
      if (!id) return;
      
      // جلب بيانات العميل
      const { data: cust } = await supabase.from("customers").select("*").eq("id", id).single();
      setCustomer(cust);
      
      // جلب المنتجات
      const { data: prods } = await supabase.from("products").select("*").order("name");
      setProducts(prods || []);
    }
    loadData();
  }, [id]);

  // Cart Operations
  const addToCart = (p: any) => {
    const exist = cart.find(item => item.id === p.id);
    if (exist) {
      setCart(cart.map(item => item.id === p.id ? { ...item, qty: item.qty + 1 } : item));
    } else {
      setCart([...cart, { ...p, qty: 1, custom_price: p.sale_price, unit: p.unit || "وحدة" }]);
    }
  };

  const removeFromCart = (productId: string) => {
    setCart(cart.filter(item => item.id !== productId));
  };

  const updateCartItem = (productId: string, field: string, value: number) => {
    setCart(cart.map(item => item.id === productId ? { ...item, [field]: value } : item));
  };

  const totalInvoice = cart.reduce((sum, i) => sum + (i.qty * (i.custom_price || i.sale_price)), 0);

  // Save Functionality (The Logic)
  const saveInvoice = async () => {
    if (cart.length === 0) return alert("السلة فارغة!");
    setIsSaving(true);
    
    try {
      // 1. تسجيل الفاتورة (حركة صادر)
      const { error: invErr } = await supabase.from("customer_transactions").insert([{
        customer_id: id,
        amount: totalInvoice,
        type: "صادر",
        description: `فاتورة مبيعات تفصيلية لعدد ${cart.length} أصناف`,
        items: cart.map(i => ({ 
          name: i.name, 
          qty: i.qty, 
          unit: i.unit, 
          sale_price: i.custom_price 
        }))
      }]);
      if (invErr) throw invErr;

      // 2. تسجيل المبلغ المدفوع كاش (حركة وارد) لضمان ظهوره في السجل
      if (cashPaid > 0) {
        const { error: payErr } = await supabase.from("customer_transactions").insert([{
          customer_id: id,
          amount: cashPaid,
          type: "وارد",
          description: `سداد نقدي مرتبط بالفاتورة الحالية`,
          items: [] 
        }]);
        if (payErr) throw payErr;
      }

      // 3. تحديث رصيد العميل النهائي
      const newBalance = (customer.balance || 0) + (totalInvoice - cashPaid);
      await supabase.from("customers").update({ balance: newBalance }).eq("id", id);

      alert("تم الحفظ والاعتماد بنجاح ✅");
      router.push(`/customer/${id}/history`);
    } catch (err: any) {
      alert("خطأ في النظام: " + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  if (!customer) return (
    <div className="h-screen flex items-center justify-center bg-slate-50">
      <div className="text-center font-black animate-bounce text-blue-600 tracking-tighter text-2xl">SYSTEM LOADING...</div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#f8fafc] text-right font-sans pb-10" dir="rtl">
      
      {/* --- Global Navbar --- */}
      <nav className="no-print sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-200 px-6 py-4 mb-8">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          
          <div className="flex items-center gap-6">
            {/* زرار الهوم العالمي */}
            <Link 
              href="/" 
              className="w-11 h-11 bg-slate-100 hover:bg-slate-900 hover:text-white text-slate-600 rounded-2xl flex items-center justify-center transition-all shadow-sm group"
            >
              <span className="text-xl group-hover:scale-110 transition-transform">🏠</span>
            </Link>

            <div className="flex items-center gap-4 border-r pr-6 border-slate-200">
              <div className="w-12 h-12 bg-blue-600 rounded-[1.2rem] flex items-center justify-center text-white shadow-lg shadow-blue-200 font-black italic text-xl">G</div>
              <div>
                <h1 className="text-xl font-black text-slate-800 tracking-tight leading-none">نظام المبيعات الذكي</h1>
                <p className="text-[10px] text-blue-500 font-bold uppercase tracking-widest mt-1">Terminal Dashboard v3.0</p>
              </div>
            </div>
          </div>

          <div className="flex gap-3">
             <button onClick={() => window.print()} className="bg-white border border-slate-200 text-slate-600 px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 hover:bg-slate-50 transition-all shadow-sm">
               <span>طباعة</span> 🖨️
             </button>
             <Link href={`/customer/${id}/history`} className="bg-slate-900 text-white px-5 py-2.5 rounded-xl font-bold hover:shadow-xl transition-all shadow-blue-900/20">
               سجل العمليات 📋
             </Link>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* --- Left Side: Inventory Search --- */}
        <div className="lg:col-span-4 no-print">
          <div className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-slate-100 sticky top-28">
            <h3 className="text-lg font-black text-slate-800 mb-4 flex items-center gap-2">📦 المخزن السريع</h3>
            <div className="relative mb-6">
              <input 
                type="text" 
                placeholder="ابحث عن صنف..." 
                className="w-full bg-slate-50 border-none rounded-2xl p-4 pr-12 font-bold text-slate-700 focus:ring-2 ring-blue-500 transition-all outline-none"
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              <span className="absolute right-4 top-4 opacity-30 text-xl">🔍</span>
            </div>
            
            <div className="grid grid-cols-1 gap-2 max-h-[500px] overflow-y-auto custom-scrollbar">
              {products.filter(p => p.name.includes(searchTerm)).map(p => (
                <button 
                  key={p.id} 
                  onClick={() => addToCart(p)}
                  className="group flex justify-between items-center p-4 rounded-[1.3rem] border border-transparent bg-slate-50/50 hover:bg-blue-600 transition-all duration-300"
                >
                  <div className="text-right">
                    <p className="font-black text-slate-700 group-hover:text-white transition-colors">{p.name}</p>
                    <p className="text-[10px] font-bold text-slate-400 group-hover:text-blue-100 italic lowercase">{p.unit || 'وحدة'}</p>
                  </div>
                  <div className="bg-white px-3 py-1 rounded-lg shadow-sm font-black text-blue-600 group-hover:scale-110 transition-transform">
                    {p.sale_price} <small className="text-[8px]">ج.م</small>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* --- Right Side: Main Invoice Terminal --- */}
        <div className="lg:col-span-8">
          <div className="bg-white rounded-[3rem] shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden flex flex-col min-h-[750px] print:shadow-none print:border-none">
            
            {/* Invoice Header */}
            <div className="p-10 border-b border-slate-50 flex justify-between items-start bg-gradient-to-l from-white to-slate-50/50">
               <div>
                  <h2 className="text-4xl font-black text-slate-900 mb-1 tracking-tighter">فاتورة مبيعات</h2>
                  <p className="text-slate-400 font-bold text-sm">تاريخ العملية: {new Date().toLocaleDateString('ar-EG-u-nu-latn', { dateStyle: 'full' })}</p>
               </div>
               <div className="text-left bg-blue-50 p-5 rounded-[2rem] border border-blue-100 min-w-[200px]">
                  <p className="text-[9px] font-black text-blue-400 uppercase mb-1 tracking-[0.2em]">العميل</p>
                  <p className="text-xl font-black text-blue-900">{customer.name}</p>
                  <div className="flex justify-between items-center mt-2 border-t border-blue-100 pt-2">
                     <span className="text-[10px] font-bold text-slate-400 uppercase">المديونية السابقة</span>
                     <span className="text-sm font-black text-red-500">{customer.balance} ج.م</span>
                  </div>
               </div>
            </div>

            {/* Cart Table */}
            <div className="p-8 flex-grow overflow-y-auto">
              <table className="w-full text-right border-separate border-spacing-y-3">
                <thead>
                  <tr className="text-slate-400 text-[10px] font-black uppercase tracking-widest px-4">
                    <th className="pb-4 pr-6">الصنف / الوحدة</th>
                    <th className="pb-4 text-center">سعر البيع</th>
                    <th className="pb-4 text-center">الكمية</th>
                    <th className="pb-4 text-left pl-6">الإجمالي</th>
                    <th className="pb-4 no-print w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {cart.map((item) => (
                    <tr key={item.id} className="bg-slate-50/70 rounded-2xl group transition-all hover:bg-slate-100/50">
                      <td className="py-5 pr-6 rounded-r-3xl">
                        <p className="font-black text-slate-800">{item.name}</p>
                        <p className="text-[10px] text-slate-400 font-black uppercase tracking-tighter">{item.unit}</p>
                      </td>
                      <td className="py-5 text-center">
                        <input 
                          type="number" 
                          value={item.custom_price} 
                          onChange={(e) => updateCartItem(item.id, "custom_price", Number(e.target.value))}
                          className="no-print w-20 p-2 text-center bg-white border border-slate-200 rounded-xl font-black text-blue-600 focus:ring-2 ring-blue-500 outline-none"
                        />
                        <span className="print-only hidden font-black">{item.custom_price}</span>
                      </td>
                      <td className="py-5 text-center">
                        <div className="no-print flex items-center justify-center gap-3 bg-white border border-slate-200 rounded-xl p-1 w-28 mx-auto">
                          <button onClick={() => updateCartItem(item.id, "qty", Math.max(1, item.qty - 1))} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 font-bold transition-colors">-</button>
                          <span className="font-black text-slate-800 text-lg">{item.qty}</span>
                          <button onClick={() => updateCartItem(item.id, "qty", item.qty + 1)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 font-bold transition-colors">+</button>
                        </div>
                        <span className="print-only hidden font-black">{item.qty}</span>
                      </td>
                      <td className="py-5 text-left pl-6 font-black text-slate-900 text-xl tracking-tighter">
                        {(item.qty * (item.custom_price || item.sale_price)).toLocaleString()}
                      </td>
                      <td className="py-5 text-center no-print pl-4 rounded-l-3xl">
                        <button onClick={() => removeFromCart(item.id)} className="w-10 h-10 text-red-200 hover:text-red-600 hover:bg-red-50 rounded-full transition-all text-xl font-light">✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {cart.length === 0 && (
                <div className="text-center py-28 border-2 border-dashed border-slate-100 rounded-[3rem]">
                  <div className="text-7xl mb-4 opacity-5 grayscale">🛒</div>
                  <p className="text-slate-300 font-black italic tracking-widest text-sm">البطاقة فارغة.. بانتظار إدخال البيانات</p>
                </div>
              )}
            </div>

            {/* --- Global Checkout Area --- */}
            <div className="p-10 bg-slate-900 text-white rounded-t-[4rem] shadow-2xl">
              <div className="flex flex-col md:flex-row justify-between items-end gap-8 mb-10">
                <div>
                  <p className="text-slate-500 font-black text-[10px] mb-2 uppercase tracking-[0.3em]">Total Balance Due</p>
                  <h2 className="text-6xl font-black text-emerald-400 tracking-tighter">
                    {totalInvoice.toLocaleString()} <span className="text-xl text-white/30 font-normal uppercase">EGP</span>
                  </h2>
                </div>
                
                <div className="no-print w-full md:w-auto bg-white/5 p-6 rounded-[2rem] border border-white/10 backdrop-blur-md">
                  <label className="block text-[10px] font-black text-emerald-400 mb-3 uppercase text-center tracking-[0.2em]">المبلغ المدفوع كاش (وارد)</label>
                  <div className="relative">
                    <input 
                      type="number" 
                      value={cashPaid}
                      onChange={(e) => setCashPaid(Number(e.target.value))}
                      className="w-full md:w-56 bg-white text-slate-900 p-5 rounded-2xl text-center text-3xl font-black focus:ring-4 ring-emerald-500 transition-all outline-none"
                    />
                    <span className="absolute left-4 top-5 text-slate-300 font-bold text-xs uppercase">Cash</span>
                  </div>
                </div>
                
                <div className="print-only hidden">
                   <div className="border-t border-white/20 pt-4 w-64">
                      <p className="flex justify-between font-black text-2xl uppercase"><span>Paid:</span> <span>{cashPaid}</span></p>
                   </div>
                </div>
              </div>

              <button 
                onClick={saveInvoice}
                disabled={cart.length === 0 || isSaving}
                className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white py-7 rounded-[1.8rem] font-black text-2xl shadow-3xl shadow-blue-500/40 transition-all active:scale-[0.97] flex items-center justify-center gap-4 group"
              >
                {isSaving ? (
                  <span className="animate-spin text-3xl">⏳</span>
                ) : (
                  <>
                    <span>اعتماد وحفظ العملية</span>
                    <span className="text-3xl group-hover:translate-x-[-10px] transition-transform">⚡</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Printing & Layout Styling */}
      <style jsx global>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; padding: 0 !important; }
          .print-only { display: block !important; }
          .bg-slate-900 { background: white !important; color: black !important; border-top: 3px solid black !important; padding: 2rem 0 !important; }
          .text-emerald-400, .text-white { color: black !important; }
          .rounded-[3rem], .rounded-[4rem], .rounded-t-[4rem] { border-radius: 0 !important; }
        }
        .custom-scrollbar::-webkit-scrollbar { width: 5px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 20px; }
      `}</style>
    </div>
  );
}