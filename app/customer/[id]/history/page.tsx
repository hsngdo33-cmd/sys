"use client";
import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { useParams } from "next/navigation";
import Link from "next/link";

type TxType = "all" | "sale" | "return" | "payment" | "تحصيل نقدي";

const SALE_TYPES    = ["sale", "بيع"];
const RETURN_TYPES  = ["return", "مرتجع"];
const PAYMENT_TYPES = ["payment", "تحصيل نقدي"];

function txIcon(type: string) {
  if (SALE_TYPES.includes(type))    return { icon: "📦", bg: "bg-indigo-100", color: "text-indigo-600" };
  if (RETURN_TYPES.includes(type))  return { icon: "↩", bg: "bg-amber-100", color: "text-amber-700" };
  if (type === "تحصيل نقدي")        return { icon: "💵", bg: "bg-emerald-100", color: "text-emerald-600" };
  if (type === "payment")           return { icon: "💳", bg: "bg-blue-100",    color: "text-blue-600" };
  return { icon: "📄", bg: "bg-slate-100", color: "text-slate-600" };
}

function txLabel(type: string) {
  if (type === "sale")          return "فاتورة بيع";
  if (type === "return")        return "مرتجع";
  if (type === "مرتجع")         return "مرتجع";
  if (type === "payment")       return "سداد مع فاتورة";
  if (type === "تحصيل نقدي")   return "تحصيل نقدي";
  return type;
}

function shortInvoiceNumber(id: unknown) {
  const cleanId = String(id || "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  return cleanId ? `C-${cleanId.slice(0, 8)}` : "-";
}

function csvCell(value: unknown) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function downloadCsv(fileName: string, rows: unknown[][]) {
  const csv = rows.map(row => row.map(csvCell).join(",")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
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
  const [returnInvoice, setReturnInvoice] = useState<any | null>(null);
  const [returnItems, setReturnItems] = useState<any[]>([]);
  const [returnNote, setReturnNote] = useState("");
  const [returnSaving, setReturnSaving] = useState(false);
  const [internalNote, setInternalNote] = useState("");
  const [noteSaved, setNoteSaved] = useState(false);
  const [printStatement, setPrintStatement] = useState(false);

  useEffect(() => { if (id) loadData(); }, [id]);

  useEffect(() => {
    if (!id) return;
    setInternalNote(window.localStorage.getItem(`sys.customer-note.${id}`) || "");
  }, [id]);

  useEffect(() => {
    if (!printTransaction) return;
    const timer = window.setTimeout(() => window.print(), 50);
    return () => window.clearTimeout(timer);
  }, [printTransaction]);

  useEffect(() => {
    if (!printStatement) return;
    const timer = window.setTimeout(() => window.print(), 50);
    return () => window.clearTimeout(timer);
  }, [printStatement]);

  useEffect(() => {
    const resetStatementPrint = () => setPrintStatement(false);
    window.addEventListener("afterprint", resetStatementPrint);
    return () => window.removeEventListener("afterprint", resetStatementPrint);
  }, []);

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

  function getReturnedQty(invoiceId: string, productId: string) {
    return transactions
      .filter(t => RETURN_TYPES.includes(t.type))
      .flatMap(t => t.items || [])
      .filter(item => String(item.source_invoice_id || "") === String(invoiceId))
      .filter(item => String(item.id || "") === String(productId))
      .reduce((sum, item) => sum + Number(item.qty || 0), 0);
  }

  function openReturnModal(invoice: any) {
    const items = (invoice.items || [])
      .map((item: any) => {
        const soldQty = Number(item.qty || 0);
        const returnedQty = getReturnedQty(invoice.id, item.id);
        const availableQty = Math.max(soldQty - returnedQty, 0);
        return {
          ...item,
          soldQty,
          returnedQty,
          availableQty,
          returnQty: availableQty > 0 ? 1 : 0,
          price: Number(item.price || 0),
          cost: Number(item.cost || 0),
        };
      })
      .filter((item: any) => item.availableQty > 0);

    if (items.length === 0) {
      alert("الفاتورة دي مفيش فيها كميات متاحة للمرتجع.");
      return;
    }

    setReturnInvoice(invoice);
    setReturnItems(items);
    setReturnNote("");
  }

  const returnTotal = returnItems.reduce((sum, item) => {
    const qty = Math.min(Math.max(Number(item.returnQty || 0), 0), Number(item.availableQty || 0));
    return sum + qty * Number(item.price || 0);
  }, 0);

  const returnProfitImpact = returnItems.reduce((sum, item) => {
    const qty = Math.min(Math.max(Number(item.returnQty || 0), 0), Number(item.availableQty || 0));
    return sum + qty * (Number(item.price || 0) - Number(item.cost || 0));
  }, 0);

  async function handleReturnSave() {
    if (returnSaving || !returnInvoice) return;

    const selectedItems = returnItems
      .map(item => {
        const qty = Math.min(Math.max(Number(item.returnQty || 0), 0), Number(item.availableQty || 0));
        return {
          id: item.id,
          name: item.name,
          unit: item.unit,
          qty,
          price: Number(item.price || 0),
          cost: Number(item.cost || 0),
          source_invoice_id: returnInvoice.id,
        };
      })
      .filter(item => item.qty > 0);

    if (selectedItems.length === 0) {
      alert("اختار كمية مرتجعة على الأقل.");
      return;
    }

    setReturnSaving(true);
    try {
      const { data: curr, error: balanceReadError } = await supabase
        .from("customers")
        .select("balance")
        .eq("id", id)
        .single();
      if (balanceReadError) throw balanceReadError;

      const description = returnNote.trim()
        ? `${returnNote.trim()} - مرتجع من فاتورة #${returnInvoice.id}`
        : `مرتجع من فاتورة #${returnInvoice.id}`;

      const { error: returnError } = await supabase
        .from("customer_transactions")
        .insert([{
          customer_id: id,
          amount: returnTotal,
          type: "return",
          description,
          items: selectedItems,
          profit: -returnProfitImpact,
        }]);
      if (returnError) throw returnError;

      for (const item of selectedItems) {
        await supabase.rpc("increment_stock", { row_id: String(item.id), amount: Number(item.qty) });
      }

      const { error: balanceError } = await supabase
        .from("customers")
        .update({ balance: Number(curr?.balance || 0) - returnTotal })
        .eq("id", id);
      if (balanceError) throw balanceError;

      setReturnInvoice(null);
      setReturnItems([]);
      setReturnNote("");
      await loadData();
    } catch (error) {
      console.error(error);
      alert("حدث خطأ أثناء حفظ المرتجع");
    } finally {
      setReturnSaving(false);
    }
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

  function saveInternalNote() {
    window.localStorage.setItem(`sys.customer-note.${id}`, internalNote);
    setNoteSaved(true);
    window.setTimeout(() => setNoteSaved(false), 1800);
  }

  function exportStatement() {
    downloadCsv(`customer-statement-${shortInvoiceNumber(id)}.csv`, [
      ["التاريخ", "النوع", "الوصف", "المبلغ"],
      ...filtered.map(t => [
        new Date(t.created_at).toLocaleString("ar-EG"),
        txLabel(t.type),
        t.description || "",
        Number(t.amount || 0),
      ]),
    ]);
  }

  const filtered = useMemo(() => {
    let list = [...transactions];
    if (filterType !== "all") list = list.filter(t => t.type === filterType);
    if (searchTerm) list = list.filter(t => t.description?.includes(searchTerm) || t.amount?.toString().includes(searchTerm));
    return list;
  }, [transactions, filterType, searchTerm]);

  // ── إحصائيات سريعة ──
  const totalSales    = transactions.filter(t => SALE_TYPES.includes(t.type)).reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const totalReturns  = transactions.filter(t => RETURN_TYPES.includes(t.type)).reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const totalPaid     = transactions.filter(t => PAYMENT_TYPES.includes(t.type)).reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const printSubtotal = (printTransaction?.items || []).reduce((sum: number, item: any) => sum + Number(item.qty || 0) * Number(item.price || 0), 0);
  const printNetTotal = Number(printTransaction?.amount || 0);
  const printDiscountAmount = Math.max(printSubtotal - printNetTotal, 0);
  const printDiscountRate = printSubtotal > 0 ? Number(((printDiscountAmount / printSubtotal) * 100).toFixed(2)) : 0;
  const printPaid = printTransaction ? transactions
    .filter(t => PAYMENT_TYPES.includes(t.type))
    .filter(t => {
      const description = String(t.description || "");
      const invoiceId = String(printTransaction.id || "");
      if (invoiceId && description.includes(invoiceId)) return true;

      const invoiceTime = new Date(printTransaction.created_at).getTime();
      const paymentTime = new Date(t.created_at).getTime();
      return paymentTime >= invoiceTime && paymentTime - invoiceTime <= 120000 && description.includes("فاتورة");
    })
    .reduce((sum, t) => sum + Number(t.amount || 0), 0) : 0;
  const printRemaining = Math.max(printNetTotal - printPaid, 0);
  const lastTransaction = transactions[0] || null;
  const daysFromLastActivity = lastTransaction
    ? Math.floor((Date.now() - new Date(lastTransaction.created_at).getTime()) / 86400000)
    : null;
  const averageTransaction = transactions.length
    ? transactions.reduce((sum, t) => sum + Number(t.amount || 0), 0) / transactions.length
    : 0;
  const followupAlerts = [
    Number(customer?.balance || 0) > 0 ? `متابعة تحصيل: على العميل ${Number(customer?.balance || 0).toLocaleString("ar-EG")} ج.م` : "",
    transactions.length === 0 ? "العميل لم يسجل أي حركة حتى الآن" : "",
    daysFromLastActivity != null && daysFromLastActivity > 30 ? `لا توجد حركة منذ ${daysFromLastActivity.toLocaleString("ar-EG")} يوم` : "",
  ].filter(Boolean);

  const filterTabs: { key: TxType; label: string }[] = [
    { key: "all",          label: `الكل (${transactions.length})` },
    { key: "sale",         label: `فواتير (${transactions.filter(t=>t.type==="sale").length})` },
    { key: "return",       label: `مرتجعات (${transactions.filter(t=>RETURN_TYPES.includes(t.type)).length})` },
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
            <Link
              href={`/customer/${id}/return`}
              className="bg-amber-500 hover:bg-amber-400 text-white px-5 py-2.5 rounded-xl font-black text-sm transition-all active:scale-95"
            >
              ↩ فاتورة مرتجع
            </Link>
            <button
              type="button"
              onClick={exportStatement}
              disabled={filtered.length === 0}
              className="bg-white/10 hover:bg-white/20 disabled:opacity-40 text-white px-5 py-2.5 rounded-xl font-black text-sm transition-all active:scale-95"
            >
              تصدير CSV
            </button>
            <button
              type="button"
              onClick={() => {
                setPrintTransaction(null);
                setPrintStatement(true);
              }}
              disabled={filtered.length === 0}
              className="bg-white text-slate-900 hover:bg-slate-100 disabled:opacity-40 px-5 py-2.5 rounded-xl font-black text-sm transition-all active:scale-95"
            >
              طباعة كشف حساب
            </button>
          </div>
        </header>

        <section className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm p-5">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">بروفايل العميل</p>
                <h2 className="text-lg font-black text-slate-900 mt-1">{customer?.name || "-"}</h2>
              </div>
              <span className={`px-3 py-1 rounded-full text-[10px] font-black ${followupAlerts.length ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>
                {followupAlerts.length ? "يحتاج متابعة" : "متابعة مستقرة"}
              </span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="rounded-2xl bg-slate-50 p-3">
                <p className="text-[10px] font-black text-slate-400 mb-1">عدد الحركات</p>
                <p className="text-lg font-black text-slate-900">{transactions.length.toLocaleString("ar-EG")}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-3">
                <p className="text-[10px] font-black text-slate-400 mb-1">آخر حركة</p>
                <p className="text-sm font-black text-slate-900">{lastTransaction ? new Date(lastTransaction.created_at).toLocaleDateString("ar-EG") : "-"}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-3">
                <p className="text-[10px] font-black text-slate-400 mb-1">متوسط الحركة</p>
                <p className="text-lg font-black text-slate-900">{averageTransaction.toLocaleString("ar-EG", { maximumFractionDigits: 0 })}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-3">
                <p className="text-[10px] font-black text-slate-400 mb-1">الرصيد</p>
                <p className={`text-lg font-black ${Number(customer?.balance || 0) > 0 ? "text-rose-600" : "text-emerald-600"}`}>
                  {Number(customer?.balance || 0).toLocaleString("ar-EG")}
                </p>
              </div>
            </div>
            <div className="mt-4 space-y-2">
              {(followupAlerts.length ? followupAlerts : ["لا توجد تنبيهات متابعة حالية"]).map((alert, index) => (
                <div key={index} className={`rounded-2xl px-4 py-3 text-xs font-black ${followupAlerts.length ? "bg-amber-50 text-amber-800 border border-amber-100" : "bg-emerald-50 text-emerald-700 border border-emerald-100"}`}>
                  {alert}
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm p-5">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">ملاحظات داخلية</p>
                <h2 className="text-lg font-black text-slate-900 mt-1">متابعة إدارية</h2>
              </div>
              {noteSaved && <span className="text-[10px] font-black text-emerald-600">تم الحفظ</span>}
            </div>
            <textarea
              value={internalNote}
              onChange={e => setInternalNote(e.target.value)}
              className="w-full min-h-28 bg-slate-50 border-2 border-slate-100 rounded-2xl p-4 text-sm font-bold text-slate-700 outline-none focus:border-indigo-300"
              placeholder="اكتب ملاحظة داخلية عن طريقة التعامل، ميعاد متابعة، أو أي تنبيه للفريق..."
            />
            <button
              type="button"
              onClick={saveInternalNote}
              className="mt-3 w-full bg-[#0f172a] hover:bg-slate-700 text-white px-5 py-3 rounded-xl text-sm font-black transition-all"
            >
              حفظ الملاحظة
            </button>
          </div>
        </section>

        {/* ══ Summary Cards ══ */}
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-[2rem] border border-slate-200 shadow-sm text-center">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">إجمالي المبيعات</p>
            <p className="text-2xl font-black text-slate-900">{totalSales.toLocaleString("ar-EG")}</p>
            <p className="text-[10px] text-slate-400 font-bold mt-1">ج.م</p>
          </div>
          <div className="bg-white p-5 rounded-[2rem] border border-slate-200 shadow-sm text-center">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">إجمالي المرتجعات</p>
            <p className="text-2xl font-black text-amber-600">{totalReturns.toLocaleString("ar-EG")}</p>
            <p className="text-[10px] text-slate-400 font-bold mt-1">ج.م</p>
          </div>
          <div className="bg-white p-5 rounded-[2rem] border border-slate-200 shadow-sm text-center">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">إجمالي المدفوع</p>
            <p className="text-2xl font-black text-emerald-600">{totalPaid.toLocaleString("ar-EG")}</p>
            <p className="text-[10px] text-slate-400 font-bold mt-1">ج.م</p>
          </div>
          <div className="bg-white p-5 rounded-[2rem] border border-slate-200 shadow-sm text-center">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">دين العميل الحالي</p>
            <p className={`text-2xl font-black ${(customer?.balance || 0) > 0 ? "text-rose-600" : "text-emerald-600"}`}>
              {Number(customer?.balance || 0).toLocaleString("ar-EG")}
            </p>
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
              const isReturn = RETURN_TYPES.includes(t.type);
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
                        <p className={`text-xl font-black ${isSale ? "text-slate-900" : isReturn ? "text-amber-600" : "text-emerald-600"}`}>
                          {isSale ? "+" : "−"} {t.amount?.toLocaleString("ar-EG")} ج.م
                        </p>
                        {isSale && t.profit != null && (
                          <p className="text-[10px] text-emerald-600 font-black text-left">ربح: {Number(t.profit).toFixed(1)} ج</p>
                        )}
                      </div>
                      {isSale && t.items?.length > 0 && (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            openReturnModal(t);
                          }}
                          className="bg-amber-100 hover:bg-amber-500 hover:text-white text-amber-700 px-4 py-2 rounded-xl text-[10px] font-black transition-all"
                        >
                          ↩ مرتجع
                        </button>
                      )}
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
                              {isSale && (
                                <Link
                                  href={`/customer/${id}/history/edit/${t.id}`}
                                  className="bg-slate-200 hover:bg-indigo-600 hover:text-white text-slate-600 px-4 py-2 rounded-xl text-[10px] font-black transition-all"
                                >
                                  ✏️ تعديل الفاتورة
                                </Link>
                              )}
                              {isSale && (
                                <button
                                  type="button"
                                  onClick={() => openReturnModal(t)}
                                  className="bg-amber-100 hover:bg-amber-500 hover:text-white text-amber-700 px-4 py-2 rounded-xl text-[10px] font-black transition-all"
                                >
                                  ↩ عمل مرتجع
                                </button>
                              )}
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

      {returnInvoice && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-[130] flex items-center justify-center p-4" onClick={() => setReturnInvoice(null)}>
          <div className="bg-white w-full max-w-3xl rounded-[2rem] shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="bg-amber-50 p-6 border-b border-amber-100 flex justify-between items-center gap-4">
              <div>
                <h2 className="text-xl font-black text-slate-900">تسجيل مرتجع</h2>
                <p className="text-[10px] text-amber-700 font-bold mt-1">فاتورة #{returnInvoice.id} - اختر الكميات المرتجعة فقط.</p>
              </div>
              <button onClick={() => setReturnInvoice(null)} className="text-slate-400 hover:text-rose-500 transition-colors text-2xl font-black">×</button>
            </div>

            <div className="p-6 space-y-4">
              <div className="overflow-auto rounded-2xl border border-slate-100">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-[10px] font-black text-slate-400">
                    <tr>
                      <th className="p-3 text-right">الصنف</th>
                      <th className="p-3 text-center">المباع</th>
                      <th className="p-3 text-center">مرتجع سابق</th>
                      <th className="p-3 text-center">المتاح</th>
                      <th className="p-3 text-center">كمية المرتجع</th>
                      <th className="p-3 text-left">القيمة</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {returnItems.map((item, index) => {
                      const qty = Math.min(Math.max(Number(item.returnQty || 0), 0), Number(item.availableQty || 0));
                      return (
                        <tr key={`${item.id}-${index}`}>
                          <td className="p-3 font-black text-slate-900">{item.name}</td>
                          <td className="p-3 text-center font-bold text-slate-500">{item.soldQty}</td>
                          <td className="p-3 text-center font-bold text-slate-500">{item.returnedQty}</td>
                          <td className="p-3 text-center font-black text-amber-700">{item.availableQty}</td>
                          <td className="p-3 text-center">
                            <input
                              type="number"
                              min="0"
                              max={item.availableQty}
                              step="any"
                              value={item.returnQty}
                              onChange={e => {
                                const copy = [...returnItems];
                                copy[index].returnQty = e.target.value;
                                setReturnItems(copy);
                              }}
                              className="w-24 rounded-xl border border-slate-200 bg-slate-50 p-2 text-center font-black outline-none focus:border-amber-400"
                            />
                          </td>
                          <td className="p-3 text-left font-black text-slate-900">{(qty * Number(item.price || 0)).toLocaleString("ar-EG")} ج</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <textarea
                value={returnNote}
                onChange={e => setReturnNote(e.target.value)}
                className="w-full min-h-20 bg-slate-50 border-2 border-slate-100 rounded-2xl p-4 text-sm font-bold text-slate-700 outline-none focus:border-amber-300"
                placeholder="ملاحظة المرتجع (اختياري)..."
              />

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-amber-50 border border-amber-100 p-4 text-center">
                  <p className="text-[10px] font-black text-amber-700 mb-1">قيمة المرتجع</p>
                  <p className="text-2xl font-black text-amber-700">{returnTotal.toLocaleString("ar-EG")} ج</p>
                </div>
                <div className="rounded-2xl bg-slate-50 border border-slate-100 p-4 text-center">
                  <p className="text-[10px] font-black text-slate-400 mb-1">تأثير الربح</p>
                  <p className="text-2xl font-black text-slate-700">-{returnProfitImpact.toLocaleString("ar-EG")} ج</p>
                </div>
              </div>
            </div>

            <div className="bg-[#0f172a] p-5 flex justify-between items-center gap-3">
              <button
                type="button"
                onClick={() => setReturnInvoice(null)}
                className="bg-white/10 hover:bg-white/20 text-white px-5 py-3 rounded-xl text-sm font-black transition-all"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleReturnSave}
                disabled={returnSaving || returnTotal <= 0}
                className="bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-white px-7 py-3 rounded-xl text-sm font-black transition-all"
              >
                {returnSaving ? "جاري حفظ المرتجع..." : "حفظ المرتجع"}
              </button>
            </div>
          </div>
        </div>
      )}

      {printStatement && (
        <section className="print-invoice hidden" dir="rtl">
          <div className="print-card">
            <div className="print-header">
              <div>
                <p className="print-eyebrow">كشف حساب عميل</p>
                <h1>{customer?.name || "-"}</h1>
                <p>كشف حساب حسب الفلتر الحالي</p>
              </div>
              <div className="print-meta">
                <p>التاريخ: {new Date().toLocaleDateString("ar-EG")}</p>
                <p>عدد الحركات: {filtered.length.toLocaleString("ar-EG")}</p>
                <p>الرصيد الحالي: {Number(customer?.balance || 0).toLocaleString("ar-EG")} ج</p>
              </div>
            </div>
            <div className="print-summary">
              <p><span>إجمالي المبيعات</span><b>{totalSales.toLocaleString("ar-EG")} ج</b></p>
              <p><span>إجمالي المرتجعات</span><b>{totalReturns.toLocaleString("ar-EG")} ج</b></p>
              <p><span>إجمالي المدفوع</span><b>{totalPaid.toLocaleString("ar-EG")} ج</b></p>
              <p className="print-total"><span>الرصيد الحالي</span><b>{Number(customer?.balance || 0).toLocaleString("ar-EG")} ج</b></p>
            </div>
            <table className="print-table" style={{ marginTop: 10 }}>
              <thead>
                <tr>
                  <th>التاريخ</th>
                  <th>النوع</th>
                  <th>الوصف</th>
                  <th>المبلغ</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(t => (
                  <tr key={t.id}>
                    <td>{new Date(t.created_at).toLocaleDateString("ar-EG")}</td>
                    <td>{txLabel(t.type)}</td>
                    <td>{t.description || "-"}</td>
                    <td>{Number(t.amount || 0).toLocaleString("ar-EG")} ج</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {internalNote.trim() && <p className="print-note">ملاحظة داخلية: {internalNote}</p>}
          </div>
        </section>
      )}

      {printTransaction && (
        <section className="print-invoice hidden" dir="rtl">
          <div className="print-card">
            <div className="print-header">
              <div>
                <p className="print-eyebrow">فاتورة بيع</p>
                <h1>منظومة إدارة المحل التجاري</h1>
                <p>إدارة العملاء والمبيعات</p>
              </div>
              <div className="print-meta">
                <p>التاريخ: {new Date(printTransaction.created_at).toLocaleDateString("ar-EG")}</p>
                <p>العميل: {customer?.name || "-"}</p>
                <p>رقم الفاتورة: {shortInvoiceNumber(printTransaction.id)}</p>
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
              <p><span>صافي الفاتورة</span><b>{printNetTotal.toLocaleString("ar-EG")} ج</b></p>
              <p><span>المدفوع</span><b>{printPaid.toLocaleString("ar-EG")} ج</b></p>
              <p className="print-total"><span>المتبقي</span><b>{printRemaining.toLocaleString("ar-EG")} ج</b></p>
            </div>
            {printTransaction.description && <p className="print-note">ملاحظة: {printTransaction.description}</p>}
          </div>
        </section>
      )}

      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;900&display=swap');
        body { font-family: 'Cairo', sans-serif; }
        @media print {
          @page { size: auto; margin: 6mm; }
          html, body { width: auto !important; height: auto !important; margin: 0 !important; padding: 0 !important; overflow: visible !important; background: #fff !important; }
          body * { visibility: hidden !important; }
          body > div > aside, body > div > nav, body > div > main > header { display: none !important; }
          body > div, body > div > main, body > div > main > div, body > div > main > div > div { display: block !important; width: 100% !important; max-width: none !important; min-height: 0 !important; margin: 0 !important; padding: 0 !important; }
          main > div > div > div > :not(.print-invoice):not(style) { display: none !important; }
          .print-invoice, .print-invoice * { visibility: visible !important; }
          .print-invoice { display: block !important; position: static !important; inset: auto !important; width: 100%; min-height: 0; padding: 0; background: white; color: #0f172a; font-size: 10px; line-height: 1.35; break-after: auto; page-break-after: auto; }
          .print-card { width: 100%; max-width: 100%; margin: 0 auto; border: 1px solid #dbe3ef; padding: 12px; border-radius: 10px; }
          .print-header { display: flex; justify-content: space-between; gap: 14px; border-bottom: 2px solid #0f172a; padding-bottom: 8px; margin-bottom: 10px; }
          .print-eyebrow { font-size: 9px; font-weight: 900; color: #059669; margin: 0 0 3px; }
          .print-header h1 { margin: 0; font-size: 18px; font-weight: 900; }
          .print-header p { margin: 2px 0; font-weight: 700; font-size: 10px; }
          .print-meta { text-align: left; font-size: 10px; }
          .print-table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
          .print-table th { background: #0f172a; color: white; padding: 5px 6px; font-size: 9px; }
          .print-table td { border-bottom: 1px solid #e2e8f0; padding: 5px 6px; font-weight: 700; font-size: 9px; }
          .print-summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(78px, 1fr)); gap: 6px; width: 100%; margin: 0; border: 0; border-radius: 0; overflow: visible; }
          .print-summary p { display: grid; gap: 3px; justify-content: stretch; margin: 0; padding: 7px 8px; border: 1px solid #e2e8f0; border-radius: 8px; font-weight: 800; break-inside: avoid; }
          .print-summary span { font-size: 8px; color: #64748b; }
          .print-summary b { font-size: 10px; }
          .print-total { background: #ecfdf5; color: #047857; font-size: 11px; }
          .print-note { margin-top: 8px; padding: 8px; background: #f8fafc; border-radius: 8px; font-weight: 700; font-size: 9px; }
        }
        @media print and (max-width: 90mm) {
          @page { margin: 3mm; }
          .print-invoice { font-size: 8px; line-height: 1.25; }
          .print-card { border: 0; padding: 4px; border-radius: 0; }
          .print-header { display: block; text-align: center; gap: 0; padding-bottom: 5px; margin-bottom: 6px; }
          .print-header h1 { font-size: 13px; }
          .print-header p, .print-meta { text-align: center; font-size: 8px; }
          .print-table { margin-bottom: 6px; }
          .print-table th { padding: 3px 2px; font-size: 7px; }
          .print-table td { padding: 3px 2px; font-size: 7px; }
          .print-summary { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 3px; }
          .print-summary p { padding: 4px; border-radius: 5px; }
          .print-summary span { font-size: 7px; }
          .print-summary b { font-size: 8px; }
          .print-note { margin-top: 5px; padding: 5px; font-size: 7px; }
        }
      `}</style>
    </div>
  );
}
