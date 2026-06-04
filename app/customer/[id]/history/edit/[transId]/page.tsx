"use client";
import { useState, useEffect, use } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

export default function EditInvoicePage({ params }: { params: Promise<any> }) {
  const router          = useRouter();
  const resolvedParams  = use(params);
  const customerId      = resolvedParams.id;
  const transId         = resolvedParams.transId;

  const [transaction, setTransaction] = useState<any>(null);
  const [items, setItems]             = useState<any[]>([]);
  const [products, setProducts]       = useState<any[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [discountPercent, setDiscountPercent] = useState<number | string>(0);
  const [isSaving, setIsSaving]       = useState(false);
  const [loading, setLoading]         = useState(true);
  const [note, setNote]               = useState("");
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => { if (transId) loadTransaction(); }, [transId]);

  async function loadTransaction() {
    setLoading(true);
    const [{ data, error }, { data: prods }] = await Promise.all([
      supabase.from("customer_transactions").select("*").eq("id", transId).single(),
      supabase.from("products").select("id,name,unit,sale_price,purchase_price,stock_quantity,barcode").order("name"),
    ]);
    if (error) { alert("مشكلة في تحميل بيانات الفاتورة"); }
    else {
      const loadedItems = JSON.parse(JSON.stringify(data.items || []));
      const gross = loadedItems.reduce((s: number, i: any) => s + Number(i.qty || 0) * Number(i.price || 0), 0);
      setTransaction(JSON.parse(JSON.stringify(data)));
      setItems(loadedItems);
      setNote(data.description || "");
      setDiscountPercent(gross > 0 && Number(data.amount) < gross ? Number((((gross - Number(data.amount)) / gross) * 100).toFixed(2)) : 0);
    }
    setProducts(prods || []);
    setLoading(false);
  }

  const addProductToInvoice = (product: any) => {
    if (items.some(item => item.id === product.id)) return;
    setItems(prev => [...prev, {
      id: product.id,
      name: product.name,
      unit: product.unit,
      qty: 1,
      price: product.sale_price,
      cost: product.purchase_price,
    }]);
  };

  const removeItem = (index: number) => {
    setItems(prev => prev.filter((_, itemIndex) => itemIndex !== index));
  };

  const handleUpdate = async () => {
    if (isSaving) return;
    setIsSaving(true);
    setShowConfirm(false);
    try {
      const grossTotal = items.reduce((acc, i) => acc + (Number(i.qty) * Number(i.price)), 0);
      const discountRate = Math.min(Math.max(Number(discountPercent) || 0, 0), 100);
      const newTotal = Math.max(grossTotal - (grossTotal * discountRate / 100), 0);
      const diff     = newTotal - transaction.amount;

      // ── حساب التكلفة والربح الجديد ──
      let newTotalCost = 0;
      for (const item of items) {
        if (item.cost !== undefined && item.cost !== null) {
          newTotalCost += Number(item.qty) * Number(item.cost);
        } else {
          const { data: prod } = await supabase
            .from("products").select("purchase_price").eq("id", item.id).single();
          newTotalCost += Number(item.qty) * Number(prod?.purchase_price || 0);
        }
      }
      const newProfit = newTotal - newTotalCost;

      // ── إرجاع الكميات القديمة للمخزن ──
      for (const old of transaction.items) {
        if (old.id) {
          await supabase.rpc("increment_stock", { row_id: String(old.id), amount: Number(old.qty) });
        }
      }

      // ── خصم الكميات الجديدة من الأصناف ──
      for (const newItem of items) {
        if (newItem.id) {
          await supabase.rpc("decrement_stock", { row_id: String(newItem.id), amount: Number(newItem.qty) });
        }
      }

      // ── تحديث رصيد العميل ──
      const { data: currentCust } = await supabase
        .from("customers").select("balance").eq("id", customerId).single();
      await supabase.from("customers")
        .update({ balance: (currentCust?.balance || 0) + diff })
        .eq("id", customerId);

      // ── تحديث الفاتورة ──
      await supabase.from("customer_transactions").update({
        amount:      newTotal,
        items:       items,
        profit:      newProfit,
        description: note || `تم تعديل الفاتورة في: ${new Date().toLocaleString("ar-EG")}`,
      }).eq("id", transId);

      router.push(`/customer/${customerId}/history`);
    } catch (err) {
      console.error(err);
      alert("حصلت مشكلة — راجع الـ Console");
    } finally { setIsSaving(false); }
  };

  // ── Totals ──
  const grossTotal = items.reduce((s, i) => s + Number(i.qty) * Number(i.price), 0);
  const discountRate = Math.min(Math.max(Number(discountPercent) || 0, 0), 100);
  const discountAmount = grossTotal * (discountRate / 100);
  const newTotal   = Math.max(grossTotal - discountAmount, 0);
  const liveProfit = newTotal - items.reduce((s, i) => s + (Number(i.qty) * Number(i.cost ?? 0)), 0);
  const diff       = transaction ? newTotal - transaction.amount : 0;
  const margin     = newTotal > 0 ? Math.round((liveProfit / newTotal) * 100) : 0;
  const filteredProducts = products.filter(product => product.name?.toLowerCase().includes(productSearch.toLowerCase()));

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-[#f1f5f9] font-black text-slate-400 text-xl" dir="rtl">
      ⏳ جاري تحميل الفاتورة...
    </div>
  );

  return (
    <div className="min-h-screen bg-[#f1f5f9] text-right font-sans pb-16" dir="rtl">

      {/* ══ Header ══ */}
      <header className="bg-[#0f172a] text-white p-5 shadow-xl sticky top-0 z-40 mb-6">
        <div className="max-w-3xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.back()}
              className="bg-white/10 hover:bg-white/20 px-4 py-2 rounded-xl text-xs font-black transition-all"
            >
              ⬅️ رجوع
            </button>
            <div>
              <h1 className="text-lg font-black">تعديل الفاتورة 📝</h1>
              <p className="text-[10px] text-slate-400 font-bold mt-0.5">
                {transaction && new Date(transaction.created_at).toLocaleDateString("ar-EG", { day: "numeric", month: "long", year: "numeric" })}
              </p>
            </div>
          </div>
          {/* مؤشر التغيير */}
          {diff !== 0 && (
            <div className={`px-4 py-2 rounded-xl text-sm font-black ${diff > 0 ? "bg-rose-600" : "bg-emerald-600"}`}>
              {diff > 0 ? "▲" : "▼"} {Math.abs(diff).toLocaleString("ar-EG")} ج.م
            </div>
          )}
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 space-y-5">

        <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm p-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-black text-slate-400 mb-1">إضافة صنف للفاتورة</label>
              <input
                value={productSearch}
                onChange={e => setProductSearch(e.target.value)}
                placeholder="ابحث عن صنف واضغط عليه..."
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none focus:border-indigo-400"
              />
              {productSearch && (
                <div className="mt-2 max-h-40 overflow-y-auto rounded-2xl border border-slate-100 bg-slate-50 p-2 space-y-1">
                  {filteredProducts.slice(0, 8).map(product => (
                    <button
                      key={product.id}
                      type="button"
                      onClick={() => { addProductToInvoice(product); setProductSearch(""); }}
                      className="w-full flex justify-between items-center rounded-xl bg-white px-3 py-2 text-sm font-black text-slate-700 hover:bg-indigo-50"
                    >
                      <span>{product.name}</span>
                      <span className="text-[10px] text-slate-400">{product.sale_price} ج</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div>
              <label className="block text-[10px] font-black text-slate-400 mb-1">خصم إجمالي على الفاتورة</label>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="any"
                  value={discountPercent}
                  onChange={e => setDiscountPercent(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl font-black outline-none focus:border-indigo-400"
                />
                <span className="rounded-xl bg-slate-100 px-3 py-3 text-sm font-black text-slate-500">%</span>
              </div>
              <p className="mt-2 text-xs font-bold text-slate-400">قيمة الخصم: {discountAmount.toLocaleString("ar-EG", { maximumFractionDigits: 2 })} ج</p>
            </div>
          </div>
        </div>

        {/* ══ مقارنة الإجمالي (قبل / بعد) ══ */}
        {transaction && (
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white p-5 rounded-[2rem] border border-slate-200 shadow-sm text-center">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">الإجمالي الأصلي</p>
              <p className="text-3xl font-black text-slate-400 line-through decoration-slate-300">
                {transaction.amount.toLocaleString("ar-EG")} <small className="text-xs">ج</small>
              </p>
            </div>
            <div className={`p-5 rounded-[2rem] shadow-sm text-center border-2 ${diff > 0 ? "bg-rose-50 border-rose-200" : diff < 0 ? "bg-emerald-50 border-emerald-200" : "bg-white border-slate-200"}`}>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">الإجمالي الجديد</p>
              <p className={`text-3xl font-black ${diff > 0 ? "text-rose-600" : diff < 0 ? "text-emerald-600" : "text-slate-900"}`}>
                {newTotal.toLocaleString("ar-EG")} <small className="text-xs">ج</small>
              </p>
            </div>
          </div>
        )}

        {/* ══ جدول الأصناف ══ */}
        <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-100">
            <h2 className="font-black text-slate-900">الأصناف</h2>
            <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">عدّل الكميات والأسعار حسب الحاجة</p>
          </div>
          <table className="w-full border-collapse">
            <thead className="bg-slate-50 text-[10px] font-black text-slate-400 uppercase border-b border-slate-100">
              <tr>
                <th className="p-5 text-right">الصنف</th>
                <th className="p-5 text-center">الكمية</th>
                <th className="p-5 text-center">
                  السعر
                  <span className="text-[8px] text-indigo-400 block normal-case font-normal">قابل للتعديل</span>
                </th>
                <th className="p-5 text-center">ربح السطر</th>
                <th className="p-5 text-left">الإجمالي</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {items.map((item, index) => {
                const lineRevenue = Number(item.qty)  * Number(item.price);
                const lineCost    = Number(item.qty)  * Number(item.cost ?? 0);
                const lineProfit  = lineRevenue - lineCost;
                const lineMargin  = lineRevenue > 0 ? Math.round((lineProfit / lineRevenue) * 100) : 0;
                return (
                  <tr key={index} className="hover:bg-slate-50/60 transition-colors">
                    <td className="p-5">
                      <p className="font-black text-slate-900">{item.name}</p>
                      <button
                        type="button"
                        onClick={() => removeItem(index)}
                        className="mt-2 rounded-lg bg-rose-50 px-2 py-1 text-[10px] font-black text-rose-600 hover:bg-rose-100"
                      >
                        حذف السطر
                      </button>
                      <p className="text-[10px] text-slate-400 font-bold mt-0.5">
                        {item.unit}
                        {item.cost != null && (
                          <span className="mr-2 text-slate-300">| تكلفة: {item.cost} ج</span>
                        )}
                      </p>
                    </td>

                    {/* الكمية */}
                    <td className="p-5 text-center">
                      <input
                        type="number" step="any"
                        value={item.qty}
                        onChange={e => {
                          const copy = [...items];
                          copy[index].qty = e.target.value;
                          setItems(copy);
                        }}
                        className="w-20 p-2 border-2 border-slate-100 rounded-xl text-center font-black bg-slate-50 focus:border-indigo-400 outline-none transition-all"
                      />
                    </td>

                    {/* السعر */}
                    <td className="p-5 text-center">
                      <input
                        type="number" step="any"
                        value={item.price}
                        onChange={e => {
                          const copy = [...items];
                          copy[index].price = e.target.value; // cost بيفضل ثابت
                          setItems(copy);
                        }}
                        className="w-24 p-2 border-2 border-slate-100 rounded-xl text-center font-black text-indigo-600 bg-slate-50 focus:border-indigo-400 outline-none transition-all"
                      />
                    </td>

                    {/* ربح السطر */}
                    <td className="p-5 text-center">
                      <span className={`text-[10px] font-black px-2 py-1.5 rounded-xl block text-center ${lineProfit >= 0 ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-600"}`}>
                        {lineProfit >= 0 ? "+" : ""}{lineProfit.toFixed(1)} ج
                        <span className="text-[8px] block opacity-70 mt-0.5">{lineMargin}%</span>
                      </span>
                    </td>

                    {/* الإجمالي */}
                    <td className="p-5 text-left font-black text-slate-900">
                      {lineRevenue.toLocaleString("ar-EG", { maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* ── ملاحظة ── */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-5 py-3">
          <input
            placeholder="📝 ملاحظة على الفاتورة (اختياري)..."
            className="w-full bg-transparent font-bold text-slate-700 outline-none text-sm placeholder:text-slate-300"
            value={note}
            onChange={e => setNote(e.target.value)}
          />
        </div>

        {/* ══ شريط الحساب النهائي ══ */}
        <div className="bg-[#0f172a] p-7 rounded-[2.5rem] text-white shadow-2xl">
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div>
              <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest mb-1">إجمالي جديد</p>
              <p className="text-2xl font-black">{newTotal.toLocaleString("ar-EG")} <small className="text-xs opacity-50">ج</small></p>
            </div>
            <div>
              <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest mb-1">ربح متوقع</p>
              <p className={`text-2xl font-black ${liveProfit >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                {liveProfit >= 0 ? "+" : ""}{liveProfit.toFixed(1)} <small className="text-xs opacity-70">ج ({margin}%)</small>
              </p>
            </div>
            <div>
              <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest mb-1">فرق الدين</p>
              <p className={`text-2xl font-black ${diff > 0 ? "text-rose-400" : diff < 0 ? "text-emerald-400" : "text-slate-400"}`}>
                {diff > 0 ? "+" : ""}{diff.toLocaleString("ar-EG")} <small className="text-xs opacity-70">ج</small>
              </p>
            </div>
          </div>

          <button
            onClick={() => setShowConfirm(true)}
            disabled={isSaving}
            className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-white py-5 rounded-2xl font-black text-xl transition-all active:scale-[0.99] shadow-xl shadow-emerald-900/30"
          >
            {isSaving ? "⏳ جاري الحفظ..." : "حفظ التعديلات ✅"}
          </button>
        </div>
      </div>

      {/* ══ Modal تأكيد الحفظ ══ */}
      {showConfirm && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] p-8 w-full max-w-sm shadow-2xl text-center space-y-5" dir="rtl">
            <div className="text-5xl">⚠️</div>
            <h3 className="text-xl font-black text-slate-900">تأكيد التعديل</h3>
            <p className="text-sm text-slate-500 font-bold leading-relaxed">
              هيتم تحديث الأصناف ورصيد العميل تلقائياً. مش هينفع ترجع للأرقام القديمة.
            </p>
            {diff !== 0 && (
              <div className={`px-4 py-3 rounded-2xl text-sm font-black ${diff > 0 ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}`}>
                {diff > 0
                  ? `⬆️ دين العميل هيزيد ${Math.abs(diff).toLocaleString("ar-EG")} ج.م`
                  : `⬇️ دين العميل هينقص ${Math.abs(diff).toLocaleString("ar-EG")} ج.م`
                }
              </div>
            )}
            <div className="flex gap-3 pt-2">
              <button
                onClick={handleUpdate}
                className="flex-1 bg-[#0f172a] text-white py-4 rounded-2xl font-black hover:bg-indigo-700 transition-all active:scale-95"
              >
                تأكيد ✅
              </button>
              <button
                onClick={() => setShowConfirm(false)}
                className="px-6 py-4 bg-slate-100 text-slate-500 rounded-2xl font-black hover:bg-slate-200 transition-all"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;900&display=swap');
        body { font-family: 'Cairo', sans-serif; background-color: #f1f5f9; }
      `}</style>
    </div>
  );
}
