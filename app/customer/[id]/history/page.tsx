"use client";
import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { useParams } from "next/navigation";
import Link from "next/link";

type TxType = "all" | "sale" | "payment" | "تحصيل نقدي";

const SALE_TYPES    = ["sale", "بيع"];
const PAYMENT_TYPES = ["payment", "تحصيل نقدي"];

function txIcon(type: string) {
  if (SALE_TYPES.includes(type))    return { icon: "📦", bg: "bg-indigo-100", color: "text-indigo-600" };
  if (type === "تحصيل نقدي")        return { icon: "💵", bg: "bg-emerald-100", color: "text-emerald-600" };
  if (type === "payment")           return { icon: "💳", bg: "bg-blue-100",    color: "text-blue-600" };
  return { icon: "📄", bg: "bg-slate-100", color: "text-slate-600" };
}

function txLabel(type: string) {
  if (type === "sale")          return "فاتورة بيع";
  if (type === "payment")       return "سداد مع فاتورة";
  if (type === "تحصيل نقدي")   return "تحصيل نقدي";
  return type;
}

export default function CustomerHistory() {
  const { id } = useParams();
  const [customer, setCustomer]         = useState<any>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading]           = useState(true);
  const [expandedId, setExpandedId]     = useState<string | null>(null);
  const [filterType, setFilterType]     = useState<TxType>("all");
  const [searchTerm, setSearchTerm]     = useState("");
  const [printTransaction, setPrintTransaction] = useState<any | null>(null);
  const [paymentEdit, setPaymentEdit] = useState<any | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentNote, setPaymentNote] = useState("");
  const [paymentSaving, setPaymentSaving] = useState(false);

  useEffect(() => { if (id) loadData(); }, [id]);

  useEffect(() => {
    if (!printTransaction) return;
    window.print();
  }, [printTransaction]);

  async function loadData() {
    setLoading(true);
    const [{ data: cust }, { data: trans }] = await Promise.all([
      supabase.from("customers").select("*").eq("id", id).single(),
      supabase.from("customer_transactions").select("*").eq("customer_id", id).order("created_at", { ascending: false }),
    ]);
    setCustomer(cust);
    setTransactions(trans || []);
    setLoading(false);
  }

  function openPaymentEdit(t: any) {
    setPaymentEdit(t);
    setPaymentAmount(String(Number(t.amount || 0)));
    setPaymentNote(t.description || "");
  }

  async function handlePaymentEditSave() {
    if (paymentSaving || !paymentEdit) return;

    const oldAmount = Number(paymentEdit.amount || 0);
    const newAmount = Number(paymentAmount);
    if (!Number.isFinite(newAmount) || newAmount <= 0) {
      alert("اكتب مبلغ سداد صحيح");
      return;
    }

    setPaymentSaving(true);
    try {
      const balanceDiff = oldAmount - newAmount;
      const { data: curr, error: balanceReadError } = await supabase
        .from("customers")
        .select("balance")
        .eq("id", id)
        .single();
      if (balanceReadError) throw balanceReadError;

      const editedAt = new Date().toLocaleString("ar-EG", {
        day: "numeric",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
      const auditNote = `تم تعديل مبلغ السداد من ${oldAmount.toLocaleString("ar-EG")} ج إلى ${newAmount.toLocaleString("ar-EG")} ج يوم ${editedAt}`;
      const cleanNote = paymentNote.trim();
      const description = cleanNote ? `${cleanNote}\n${auditNote}` : auditNote;

      const { error: transError } = await supabase
        .from("customer_transactions")
        .update({ amount: newAmount, description })
        .eq("id", paymentEdit.id);
      if (transError) throw transError;

      const { error: balanceError } = await supabase
        .from("customers")
        .update({ balance: Number(curr?.balance || 0) + balanceDiff })
        .eq("id", id);
      if (balanceError) throw balanceError;

      setPaymentEdit(null);
      await loadData();
    } catch (error) {
      console.error(error);
      alert("حدث خطأ أثناء تعديل السداد");
    } finally {
      setPaymentSaving(false);
    }
  }

  const filtered = useMemo(() => {
    let list = [...transactions];
    if (filterType !== "all") list = list.filter(t => t.type === filterType);
    if (searchTerm) list = list.filter(t => t.description?.includes(searchTerm) || t.amount?.toString().includes(searchTerm));
    return list;
  }, [transactions, filterType, searchTerm]);

  // ── إحصائيات سريعة ──
  const totalSales    = transactions.filter(t => SALE_TYPES.includes(t.type)).reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const totalPaid     = transactions.filter(t => PAYMENT_TYPES.includes(t.type)).reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const totalProfit   = transactions.filter(t => SALE_TYPES.includes(t.type)).reduce((s, t) => s + (Number(t.profit) || 0), 0);
  const printSubtotal = (printTransaction?.items || []).reduce((sum: number, item: any) => sum + Number(item.qty || 0) * Number(item.price || 0), 0);
  const printNetTotal = Number(printTransaction?.amount || 0);
  const printDiscountAmount = Math.max(printSubtotal - printNetTotal, 0);
  const printDiscountRate = printSubtotal > 0 ? Number(((printDiscountAmount / printSubtotal) * 100).toFixed(2)) : 0;

  const filterTabs: { key: TxType; label: string }[] = [
    { key: "all",          label: `الكل (${transactions.length})` },
    { key: "sale",         label: `فواتير (${transactions.filter(t=>t.type==="sale").length})` },
    { key: "payment",      label: `سداد (${transactions.filter(t=>t.type==="payment").length})` },
    { key: "تحصيل نقدي",  label: `تحصيل (${transactions.filter(t=>t.type==="تحصيل نقدي").length})` },
  ];

  return (
    <div className="min-h-screen bg-[#f1f5f9] text-right font-sans pb-10" dir="rtl">
      <div className="max-w-4xl mx-auto p-4 space-y-5">

        {/* ══ Header ══ */}
        <header className="bg-[#0f172a] text-white p-6 rounded-[2rem] shadow-xl flex justify-between items-center flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <Link href="/customer" className="bg-white/10 hover:bg-white/20 px-4 py-2 rounded-xl text-xs font-black transition-all">⬅️ رجوع</Link>
            <div>
              <h1 className="text-xl font-black">{customer?.name}</h1>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">سجل المعاملات المالي</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className={`px-4 py-2 rounded-xl text-sm font-black ${customer?.balance > 0 ? "bg-rose-600" : "bg-emerald-600"}`}>
              {customer?.balance > 0 ? `دين: ${customer?.balance?.toLocaleString("ar-EG")} ج.م` : "حساب سليم ✅"}
            </div>
            <Link
              href={`/customer/${id}`}
              className="bg-emerald-500 hover:bg-emerald-400 text-white px-5 py-2.5 rounded-xl font-black text-sm transition-all active:scale-95"
            >
              ➕ فاتورة جديدة
            </Link>
          </div>
        </header>

        {/* ══ Summary Cards ══ */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white p-5 rounded-[2rem] border border-slate-200 shadow-sm text-center">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">إجمالي المشتريات</p>
            <p className="text-2xl font-black text-slate-900">{totalSales.toLocaleString("ar-EG")}</p>
            <p className="text-[10px] text-slate-400 font-bold mt-1">ج.م</p>
          </div>
          <div className="bg-white p-5 rounded-[2rem] border border-slate-200 shadow-sm text-center">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">إجمالي المدفوع</p>
            <p className="text-2xl font-black text-emerald-600">{totalPaid.toLocaleString("ar-EG")}</p>
            <p className="text-[10px] text-slate-400 font-bold mt-1">ج.م</p>
          </div>
          <div className="bg-white p-5 rounded-[2rem] border border-slate-200 shadow-sm text-center">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">الربح المحقق</p>
            <p className="text-2xl font-black text-indigo-600">{totalProfit.toLocaleString("ar-EG")}</p>
            <p className="text-[10px] text-slate-400 font-bold mt-1">ج.م</p>
          </div>
        </div>

        {/* ══ Filters ══ */}
        <div className="bg-white p-3 rounded-[2rem] border border-slate-200 shadow-sm space-y-3">
          <div className="flex gap-2 flex-wrap">
            {filterTabs.map(tab => (
              <button
                key={tab.key}
                onClick={() => setFilterType(tab.key)}
                className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${filterType === tab.key ? "bg-[#0f172a] text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <input
            placeholder="🔍 ابحث في المعاملات..."
            className="w-full p-3 bg-slate-50 rounded-xl font-bold text-slate-900 outline-none text-sm"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>

        {/* ══ Transactions ══ */}
        {loading ? (
          <div className="bg-white p-20 rounded-[2rem] text-center text-slate-400 font-black animate-pulse">⏳ جاري التحميل...</div>
        ) : filtered.length === 0 ? (
          <div className="bg-white p-20 rounded-[2rem] border-2 border-dashed border-slate-200 text-center text-slate-300">
            <p className="text-5xl mb-4">📜</p>
            <p className="font-black">لا توجد معاملات</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(t => {
              const { icon, bg, color } = txIcon(t.type);
              const isSale = SALE_TYPES.includes(t.type);
              const isPayment = PAYMENT_TYPES.includes(t.type);
              const isOpen = expandedId === t.id;
              return (
                <div key={t.id} className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden transition-all">
                  {/* رأس المعاملة */}
                  <div
                    onClick={() => setExpandedId(isOpen ? null : t.id)}
                    className="p-5 flex justify-between items-center cursor-pointer hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-xl ${bg}`}>
                        {icon}
                      </div>
                      <div>
                        <p className={`font-black text-sm ${color}`}>{txLabel(t.type)}</p>
                        <p className="text-[10px] font-bold text-slate-400 mt-0.5">
                          {new Date(t.created_at).toLocaleString("ar-EG", { day:"numeric", month:"long", year:"numeric", hour:"2-digit", minute:"2-digit" })}
                        </p>
                      </div>
                    </div>
                    <div className="text-left flex items-center gap-4">
                      <div>
                        <p className={`text-xl font-black ${isSale ? "text-slate-900" : "text-emerald-600"}`}>
                          {isSale ? "+" : "−"} {t.amount?.toLocaleString("ar-EG")} ج.م
                        </p>
                        {isSale && t.profit != null && (
                          <p className="text-[10px] text-emerald-600 font-black text-left">ربح: {Number(t.profit).toFixed(1)} ج</p>
                        )}
                      </div>
                      <span className="text-slate-300 text-lg">{isOpen ? "▲" : "▼"}</span>
                    </div>
                  </div>

                  {/* تفاصيل الفاتورة */}
                  {isOpen && (
                    <div className="bg-slate-50 border-t border-slate-100 p-5">
                      {t.items && t.items.length > 0 ? (
                        <>
                          <table className="w-full text-sm mb-4">
                            <thead>
                              <tr className="text-slate-400 font-black text-[10px] uppercase border-b border-slate-200">
                                <th className="pb-3 text-right">الصنف</th>
                                <th className="pb-3 text-center">الكمية</th>
                                <th className="pb-3 text-center">السعر</th>
                                <th className="pb-3 text-left">الإجمالي</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {t.items.map((item: any, idx: number) => (
                                <tr key={idx}>
                                  <td className="py-3 font-black text-slate-900">{item.name}</td>
                                  <td className="py-3 text-center font-bold text-slate-600">
                                    {item.qty} <span className="text-[9px] text-slate-400">{item.unit}</span>
                                  </td>
                                  <td className="py-3 text-center font-bold text-slate-600">{Number(item.price).toLocaleString("ar-EG")} ج</td>
                                  <td className="py-3 text-left font-black">{(item.qty * item.price).toLocaleString("ar-EG")} ج</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          <div className="flex justify-between items-center border-t border-slate-200 pt-4">
                            <div className="flex gap-2">
                              <Link
                                href={`/customer/${id}/history/edit/${t.id}`}
                                className="bg-slate-200 hover:bg-indigo-600 hover:text-white text-slate-600 px-4 py-2 rounded-xl text-[10px] font-black transition-all"
                              >
                                ✏️ تعديل الفاتورة
                              </Link>
                              <button
                                type="button"
                                onClick={() => setPrintTransaction(t)}
                                className="bg-white border border-slate-200 hover:bg-slate-900 hover:text-white text-slate-600 px-4 py-2 rounded-xl text-[10px] font-black transition-all"
                              >
                                طباعة الفاتورة
                              </button>
                            </div>
                            {t.description && (
                              <p className="text-xs text-slate-400 font-bold italic">{t.description}</p>
                            )}
                          </div>
                        </>
                      ) : (
                        <>
                        <p className="text-slate-400 font-bold text-sm text-center py-4">
                          {t.description || "لا تفاصيل إضافية"}
                        </p>
                        {isPayment && (
                          <div className="flex justify-between items-center border-t border-slate-200 pt-4 mt-4 gap-3">
                            <p className="text-xs text-slate-400 font-bold">يمكن تعديل مبلغ السداد وسيتم تسجيل تاريخ التعديل تلقائيا.</p>
                            <button
                              type="button"
                              onClick={() => openPaymentEdit(t)}
                              className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl text-[10px] font-black transition-all"
                            >
                              تعديل السداد
                            </button>
                          </div>
                        )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {paymentEdit && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-[120] flex items-center justify-center p-4" onClick={() => setPaymentEdit(null)}>
          <div className="bg-white w-full max-w-lg rounded-[2rem] shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="bg-slate-50 p-6 border-b border-slate-100 flex justify-between items-center">
              <div>
                <h2 className="text-xl font-black text-slate-900">تعديل السداد</h2>
                <p className="text-[10px] text-slate-400 font-bold mt-1">سيتم تحديث رصيد العميل وحفظ تنبيه بتاريخ التعديل.</p>
              </div>
              <button onClick={() => setPaymentEdit(null)} className="text-slate-400 hover:text-rose-500 transition-colors text-2xl font-black">×</button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-50 p-4 rounded-2xl text-center">
                  <p className="text-[10px] font-black text-slate-400 mb-1">المبلغ الحالي</p>
                  <p className="text-xl font-black text-slate-500">{Number(paymentEdit.amount || 0).toLocaleString("ar-EG")} ج</p>
                </div>
                <div className="bg-emerald-50 p-4 rounded-2xl text-center border border-emerald-100">
                  <p className="text-[10px] font-black text-emerald-700 mb-1">المبلغ الجديد</p>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={paymentAmount}
                    onChange={e => setPaymentAmount(e.target.value)}
                    className="w-full bg-white border-2 border-emerald-100 rounded-xl p-2 text-center text-xl font-black text-emerald-700 outline-none focus:border-emerald-400"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 mb-2">ملاحظة</label>
                <textarea
                  value={paymentNote}
                  onChange={e => setPaymentNote(e.target.value)}
                  className="w-full min-h-24 bg-slate-50 border-2 border-slate-100 rounded-2xl p-4 text-sm font-bold text-slate-700 outline-none focus:border-emerald-300"
                  placeholder="اكتب سبب التعديل أو اتركها فارغة..."
                />
              </div>
            </div>
            <div className="bg-[#0f172a] p-5 flex justify-between items-center gap-3">
              <button
                type="button"
                onClick={() => setPaymentEdit(null)}
                className="bg-white/10 hover:bg-white/20 text-white px-5 py-3 rounded-xl text-sm font-black transition-all"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handlePaymentEditSave}
                disabled={paymentSaving}
                className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white px-7 py-3 rounded-xl text-sm font-black transition-all"
              >
                {paymentSaving ? "جاري الحفظ..." : "حفظ التعديل"}
              </button>
            </div>
          </div>
        </div>
      )}

      {printTransaction && (
        <section className="print-invoice hidden" dir="rtl">
          <div className="print-card">
            <div className="print-header">
              <div>
                <p className="print-eyebrow">فاتورة بيع</p>
                <h1>منظومة المحاسبة</h1>
                <p>إدارة العملاء والمخازن</p>
              </div>
              <div className="print-meta">
                <p>التاريخ: {new Date(printTransaction.created_at).toLocaleDateString("ar-EG")}</p>
                <p>العميل: {customer?.name || "-"}</p>
                <p>رقم الفاتورة: {printTransaction.id}</p>
              </div>
            </div>
            <table className="print-table">
              <thead>
                <tr>
                  <th>الصنف</th>
                  <th>الوحدة</th>
                  <th>الكمية</th>
                  <th>السعر</th>
                  <th>الإجمالي</th>
                </tr>
              </thead>
              <tbody>
                {(printTransaction.items || []).map((item: any, idx: number) => (
                  <tr key={idx}>
                    <td>{item.name}</td>
                    <td>{item.unit || "-"}</td>
                    <td>{Number(item.qty || 0).toLocaleString("ar-EG")}</td>
                    <td>{Number(item.price || 0).toLocaleString("ar-EG")} ج</td>
                    <td>{(Number(item.qty || 0) * Number(item.price || 0)).toLocaleString("ar-EG")} ج</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="print-summary">
              <p><span>الإجمالي قبل الخصم</span><b>{printSubtotal.toLocaleString("ar-EG")} ج</b></p>
              <p><span>الخصم ({printDiscountRate}%)</span><b>{printDiscountAmount.toLocaleString("ar-EG")} ج</b></p>
              <p className="print-total"><span>صافي الفاتورة</span><b>{printNetTotal.toLocaleString("ar-EG")} ج</b></p>
              {printTransaction.profit != null && <p><span>الربح</span><b>{Number(printTransaction.profit || 0).toLocaleString("ar-EG")} ج</b></p>}
            </div>
            {printTransaction.description && <p className="print-note">ملاحظة: {printTransaction.description}</p>}
          </div>
        </section>
      )}

      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;900&display=swap');
        body { font-family: 'Cairo', sans-serif; }
        @media print {
          body * { visibility: hidden !important; }
          .print-invoice, .print-invoice * { visibility: visible !important; }
          .print-invoice { display: block !important; position: absolute; inset: 0; padding: 24px; background: white; color: #0f172a; }
          .print-card { max-width: 900px; margin: 0 auto; border: 1px solid #dbe3ef; padding: 28px; border-radius: 16px; }
          .print-header { display: flex; justify-content: space-between; gap: 24px; border-bottom: 2px solid #0f172a; padding-bottom: 18px; margin-bottom: 22px; }
          .print-eyebrow { font-size: 12px; font-weight: 900; color: #059669; margin: 0 0 6px; }
          .print-header h1 { margin: 0; font-size: 28px; font-weight: 900; }
          .print-header p { margin: 4px 0; font-weight: 700; }
          .print-meta { text-align: left; font-size: 13px; }
          .print-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
          .print-table th { background: #0f172a; color: white; padding: 10px; font-size: 12px; }
          .print-table td { border-bottom: 1px solid #e2e8f0; padding: 10px; font-weight: 700; font-size: 12px; }
          .print-summary { margin-right: auto; width: 320px; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; }
          .print-summary p { display: flex; justify-content: space-between; margin: 0; padding: 10px 14px; border-bottom: 1px solid #e2e8f0; font-weight: 800; }
          .print-summary p:last-child { border-bottom: 0; }
          .print-total { background: #ecfdf5; color: #047857; font-size: 16px; }
          .print-note { margin-top: 18px; padding: 12px; background: #f8fafc; border-radius: 12px; font-weight: 700; }
        }
      `}</style>
    </div>
  );
}
