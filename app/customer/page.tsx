"use client";
import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import Link from "next/link";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Customer {
  id: string;
  name: string;
  phone: string;
  balance: number;
  created_at: string;
}

type CustomerTransactionSummary = {
  customer_id: string | null;
  created_at: string;
};

type ActivitySummary = {
  count: number;
  lastDate: string | null;
};

type SortKey = "name" | "balance" | "created_at" | "activity";
type FilterKey = "all" | "debtors" | "clear" | "inactive";

function normalizeText(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function normalizePhone(value?: string | null) {
  return (value || "").replace(/[^\d+]/g, "");
}

function matchesDirectorySearch(name: string, phone: string | null | undefined, search: string) {
  const query = normalizeText(search);
  const phoneQuery = normalizePhone(search);
  if (!query && !phoneQuery) return true;
  return normalizeText(name).includes(query) || normalizePhone(phone).includes(phoneQuery);
}

function csvCell(value: unknown) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function downloadCsv(fileName: string, rows: unknown[][]) {
  const csv = rows.map((row) => row.map(csvCell).join(",")).join("\n");
  const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function CustomersListPage() {
  const [customers, setCustomers]         = useState<Customer[]>([]);
  const [transactions, setTransactions]   = useState<CustomerTransactionSummary[]>([]);
  const [loading, setLoading]             = useState(true);
  const [searchTerm, setSearchTerm]       = useState("");
  const [sortBy, setSortBy]               = useState<SortKey>("name");
  const [filter, setFilter]               = useState<FilterKey>("all");
  
  // Modals States
  const [showAddModal, setShowAddModal]   = useState(false);
  const [showPayModal, setShowPayModal]   = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [newCustomer, setNewCustomer]     = useState({ name: "", phone: "", balance: 0 });
  const [payAmount, setPayAmount]         = useState(0);
  const [payNote, setPayNote]             = useState("");
  const [saving, setSaving]               = useState(false);

  useEffect(() => { fetchCustomers(); }, []);

  async function fetchCustomers() {
    setLoading(true);
    const [customersResult, transactionsResult] = await Promise.all([
      supabase.from("customers").select("*").order("name"),
      supabase
        .from("customer_transactions")
        .select("customer_id,created_at")
        .order("created_at", { ascending: false })
        .limit(2000),
    ]);
    setCustomers(customersResult.data || []);
    setTransactions((transactionsResult.data || []) as CustomerTransactionSummary[]);
    setLoading(false);
  }

  async function handleAddCustomer() {
    if (!newCustomer.name.trim()) return alert("الاسم مطلوب!");
    const cleanName = newCustomer.name.trim().replace(/\s+/g, " ");
    const cleanPhone = normalizePhone(newCustomer.phone);
    const duplicate = customers.find((customer) => {
      const sameName = normalizeText(customer.name) === normalizeText(cleanName);
      const samePhone = cleanPhone && normalizePhone(customer.phone) === cleanPhone;
      return sameName || samePhone;
    });

    if (duplicate) {
      return alert(`العميل "${duplicate.name}" مسجل قبل كده. افتح بياناته بدل إضافة سجل جديد.`);
    }

    setSaving(true);
    try {
      const { error } = await supabase.from("customers").insert([{
        name: cleanName,
        phone: cleanPhone || null,
        balance: Number(newCustomer.balance || 0),
      }]);
      if (error) throw error;
      setNewCustomer({ name: "", phone: "", balance: 0 });
      setShowAddModal(false);
      fetchCustomers();
    } catch (addError) {
      alert(addError instanceof Error ? addError.message : "تعذر حفظ العميل.");
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdateCustomer() {
    if (!selectedCustomer || !selectedCustomer.name.trim()) return alert("الاسم مطلوب!");
    const cleanName = selectedCustomer.name.trim().replace(/\s+/g, " ");
    const cleanPhone = normalizePhone(selectedCustomer.phone);
    const duplicate = customers.find((customer) => {
      if (customer.id === selectedCustomer.id) return false;
      const sameName = normalizeText(customer.name) === normalizeText(cleanName);
      const samePhone = cleanPhone && normalizePhone(customer.phone) === cleanPhone;
      return sameName || samePhone;
    });

    if (duplicate) {
      return alert(`في عميل تاني بنفس البيانات: ${duplicate.name}`);
    }

    setSaving(true);
    try {
      await supabase
        .from("customers")
        .update({ name: cleanName, phone: cleanPhone || null })
        .eq("id", selectedCustomer.id);
      setShowEditModal(false);
      fetchCustomers();
    } catch { alert("حدث خطأ أثناء التعديل"); }
    finally { setSaving(false); }
  }

  async function handleDeleteCustomer() {
    if (!selectedCustomer) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("customers").delete().eq("id", selectedCustomer.id);
      if (error) throw error;
      setShowDeleteModal(false);
      fetchCustomers();
    } catch { alert("عفواً: لا يمكن حذف العميل لأنه مرتبط بعمليات مسجلة."); }
    finally { setSaving(false); }
  }

  async function handleCollection() {
    if (payAmount <= 0 || !selectedCustomer) return alert("ادخل مبلغ صحيح");
    if (payAmount > Number(selectedCustomer.balance || 0)) {
      return alert("مبلغ التحصيل أكبر من مديونية العميل الحالية.");
    }
    setSaving(true);
    try {
      await supabase.from("customer_transactions").insert([{
        customer_id: selectedCustomer.id,
        amount: payAmount,
        type: "تحصيل نقدي",
        description: payNote || "تحصيل نقدي من العميل",
      }]);
      await supabase.from("customers")
        .update({ balance: (selectedCustomer.balance || 0) - payAmount })
        .eq("id", selectedCustomer.id);
      setShowPayModal(false);
      setPayAmount(0);
      setPayNote("");
      fetchCustomers();
    } catch { alert("حدث خطأ"); }
    finally { setSaving(false); }
  }

  const activityMap = useMemo(() => {
    const map = new Map<string, ActivitySummary>();

    transactions.forEach((transaction) => {
      if (!transaction.customer_id) return;
      const current = map.get(transaction.customer_id) || { count: 0, lastDate: null };
      current.count += 1;
      if (!current.lastDate || new Date(transaction.created_at) > new Date(current.lastDate)) {
        current.lastDate = transaction.created_at;
      }
      map.set(transaction.customer_id, current);
    });

    return map;
  }, [transactions]);

  const formatLastActivity = (customerId: string) => {
    const activity = activityMap.get(customerId);
    if (!activity?.lastDate) return "لا توجد حركات";
    return new Date(activity.lastDate).toLocaleDateString("ar-EG");
  };

  const getCustomerStatus = (customer: Customer) => {
    if (!activityMap.get(customer.id)?.count) {
      return { label: "بدون حركة", className: "bg-amber-100 text-amber-700 border-amber-200" };
    }
    if (customer.balance > 0) {
      return { label: "عليه مديونية", className: "bg-rose-100 text-rose-700 border-rose-200" };
    }
    return { label: "حساب سليم", className: "bg-emerald-100 text-emerald-700 border-emerald-200" };
  };

  const displayed = useMemo(() => {
    let list = [...customers];
    if (searchTerm) list = list.filter(c => matchesDirectorySearch(c.name, c.phone, searchTerm));
    if (filter === "debtors") list = list.filter(c => c.balance > 0);
    if (filter === "clear")   list = list.filter(c => c.balance <= 0);
    if (filter === "inactive") list = list.filter(c => !activityMap.get(c.id)?.count);
    list.sort((a, b) => {
      if (sortBy === "balance")    return b.balance - a.balance;
      if (sortBy === "created_at") return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      if (sortBy === "activity") {
        const bActivity = activityMap.get(b.id)?.lastDate || "";
        const aActivity = activityMap.get(a.id)?.lastDate || "";
        return new Date(bActivity || 0).getTime() - new Date(aActivity || 0).getTime();
      }
      return a.name.localeCompare(b.name, "ar");
    });
    return list;
  }, [activityMap, customers, searchTerm, sortBy, filter]);

  const customerNameSuggestions = useMemo(() => {
    const name = newCustomer.name.trim().toLowerCase();
    if (name.length < 2) return [];

    return customers
      .filter((customer) => customer.name.toLowerCase().includes(name))
      .slice(0, 5);
  }, [customers, newCustomer.name]);

  const totalDebt   = customers.reduce((s, c) => s + Math.max(c.balance, 0), 0);
  const debtorCount = customers.filter(c => c.balance > 0).length;
  const clearCount  = customers.filter(c => c.balance <= 0).length;
  const inactiveCount = customers.filter(c => !activityMap.get(c.id)?.count).length;
  const filterTabs: { key: FilterKey; label: string; count: number }[] = [
    { key: "all", label: "الكل", count: customers.length },
    { key: "debtors", label: "مديونية", count: debtorCount },
    { key: "clear", label: "سليم", count: clearCount },
    { key: "inactive", label: "بدون حركة", count: inactiveCount },
  ];

  function exportCustomers() {
    downloadCsv("customers.csv", [
      ["العميل", "الموبايل", "الرصيد", "عدد الحركات", "آخر حركة"],
      ...displayed.map((customer) => [
        customer.name,
        customer.phone || "",
        Number(customer.balance || 0),
        activityMap.get(customer.id)?.count || 0,
        formatLastActivity(customer.id),
      ]),
    ]);
  }

  return (
    <div className="min-h-screen bg-[#f1f5f9] text-right font-sans text-slate-900 pb-4" dir="rtl">

      {/* ══ Header ══ */}
      <header className="bg-[#0f172a] text-white px-6 py-4 shadow-xl mb-4 sticky top-0 z-40">
        <div className="max-w-6xl mx-auto flex justify-between items-center flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <Link href="/" className="bg-white/10 hover:bg-white/20 px-4 py-2 rounded-xl text-xs font-black transition-all">⬅️ الرئيسية</Link>
            <div>
              <h1 className="text-xl font-black">دليل العملاء 👥</h1>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">{customers.length} عميل مسجل</p>
            </div>
          </div>
        </div>
      </header>

      <section className="max-w-[1500px] mx-auto px-4 mb-4">
        <div className="bg-white border border-slate-200 shadow-sm rounded-[1.25rem] p-3 grid gap-3 lg:grid-cols-[1fr_auto]">
          <div className="grid gap-3 xl:grid-cols-[minmax(260px,1fr)_auto_auto]">
            <div className="relative">
              <input
                placeholder="ابحث بالاسم أو الموبايل..."
                className="w-full h-12 bg-slate-50 border border-slate-200 rounded-xl pr-4 pl-11 font-bold text-slate-900 outline-none focus:border-indigo-400 focus:ring-2 ring-indigo-100 transition-all"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm("")}
                  className="absolute left-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-lg bg-white text-slate-400 border border-slate-200 hover:text-rose-600"
                  aria-label="مسح البحث"
                >
                  ×
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-2 rounded-xl bg-slate-50 p-1">
              {filterTabs.map(tab => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setFilter(tab.key)}
                  className={`min-h-10 rounded-lg px-3 text-xs font-black transition-all ${filter === tab.key ? "bg-[#0f172a] text-white shadow-sm" : "text-slate-500 hover:bg-white"}`}
                >
                  {tab.label} <span className="opacity-70">({tab.count.toLocaleString("ar-EG")})</span>
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {(["name","balance","created_at","activity"] as SortKey[]).map(k => (
                <button
                  key={k}
                  onClick={() => setSortBy(k)}
                  className={`app-btn app-btn-sm ${sortBy === k ? "app-btn-primary" : "app-btn-soft"}`}
                >
                  {k === "name" ? "الاسم" : k === "balance" ? "الدين" : k === "activity" ? "آخر نشاط" : "الأحدث"}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-2 justify-end">
            <button onClick={() => setShowAddModal(true)} className="app-btn app-btn-success">
              إضافة عميل
            </button>
            <button onClick={exportCustomers} disabled={displayed.length === 0} className="app-btn app-btn-soft">
              تصدير CSV
            </button>
          </div>
        </div>
      </section>

      <main className="app-directory-layout max-w-[1500px] mx-auto px-4">
        <aside className="app-directory-side">
        
        {/* ══ Summary Cards ══ */}
        <div className="grid gap-3">
          <div className="app-mini-stat bg-[#0f172a] text-white shadow-lg">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">إجمالي الديون</p>
            <p className="text-2xl font-black">{totalDebt.toLocaleString("ar-EG")}</p>
            <p className="text-xs text-slate-500 font-bold mt-1">جنيه مصري</p>
          </div>
          <div className="app-mini-stat bg-white border border-slate-200 shadow-sm">
            <p className="text-[10px] font-black mb-2 uppercase">عملاء مدينون</p>
            <p className="text-2xl font-black">{debtorCount}</p>
          </div>
          <div className="app-mini-stat bg-white border border-slate-200 shadow-sm">
            <p className="text-[10px] font-black mb-2 uppercase">حساب سليم</p>
            <p className="text-2xl font-black">{clearCount}</p>
          </div>
          <div className="app-mini-stat bg-white border border-slate-200 shadow-sm">
            <p className="text-[10px] font-black mb-2 uppercase">بدون حركة</p>
            <p className="text-2xl font-black">{inactiveCount}</p>
          </div>
        </div>

        {/* ══ Table ══ */}
        <p className="text-center text-xs text-slate-400 font-bold">
          يعرض {displayed.length} من {customers.length} عميل
        </p>
        </aside>

        <section className="app-directory-table bg-white border border-slate-200 shadow-sm">
          {loading ? (
            <div className="p-10 text-center text-slate-400 font-black animate-pulse">⏳ جاري التحميل...</div>
          ) : displayed.length === 0 ? (
            <div className="p-10 text-center text-slate-300 font-black">لا توجد نتائج</div>
          ) : (
            <table className="w-full text-right">
              <thead className="bg-slate-50 text-[10px] font-black text-slate-400 border-b">
                <tr>
                  <th className="px-4 py-3">العميل</th>
                  <th className="px-4 py-3">الموبايل</th>
                  <th className="px-4 py-3">المديونية</th>
                  <th className="px-4 py-3 text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {displayed.map(c => {
                  const status = getCustomerStatus(c);
                  return (
                  <tr key={c.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-4 py-3">
                      <Link href={`/customer/${c.id}/history`} className="font-black text-slate-900 hover:text-indigo-700 transition-colors">
                        {c.name}
                      </Link>
                      <p className="mt-1 text-[11px] font-bold text-slate-400">
                        آخر حركة: {formatLastActivity(c.id)} · {(activityMap.get(c.id)?.count || 0).toLocaleString("ar-EG")} حركة
                      </p>
                    </td>
                    <td className="px-4 py-3 text-slate-400 font-bold">{c.phone || "—"}</td>
                    <td className="px-4 py-3">
                      <div className="grid gap-1">
                        <span className={`w-fit rounded-full border px-3 py-1 text-[10px] font-black ${status.className}`}>
                          {status.label}
                        </span>
                        <span className={`text-lg font-black ${c.balance > 0 ? "text-rose-600" : "text-slate-500"}`}>
                          {c.balance > 0 ? c.balance.toLocaleString("ar-EG") : "0"}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-center gap-2">
                        <Link href={`/customer/${c.id}/history`} className="app-btn app-btn-sm app-btn-primary">
                          السجل
                        </Link>
                        <details className="relative">
                          <summary className="app-btn app-btn-sm app-btn-soft list-none cursor-pointer">
                            إجراءات
                          </summary>
                          <div className="absolute left-0 top-10 z-30 w-44 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
                            <Link href={`/customer/${c.id}`} className="block rounded-xl px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50">فاتورة بيع</Link>
                            <Link href={`/customer/${c.id}/return`} className="block rounded-xl px-3 py-2 text-xs font-black text-amber-700 hover:bg-amber-50">مرتجع</Link>
                            {c.balance > 0 && (
                              <button
                                onClick={() => { setSelectedCustomer(c); setPayAmount(0); setPayNote(""); setShowPayModal(true); }}
                                className="block w-full rounded-xl px-3 py-2 text-right text-xs font-black text-emerald-700 hover:bg-emerald-50"
                              >
                                تحصيل
                              </button>
                            )}
                            <button
                              onClick={() => { setSelectedCustomer(c); setShowEditModal(true); }}
                              className="block w-full rounded-xl px-3 py-2 text-right text-xs font-black text-blue-700 hover:bg-blue-50"
                            >
                              تعديل البيانات
                            </button>
                            <button
                              onClick={() => { setSelectedCustomer(c); setShowDeleteModal(true); }}
                              className="block w-full rounded-xl px-3 py-2 text-right text-xs font-black text-rose-700 hover:bg-rose-50"
                            >
                              حذف
                            </button>
                          </div>
                        </details>
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>
      </main>

      {/* ══ Modal: إضافة عميل ══ */}
      {showAddModal && (
        <Modal onClose={() => setShowAddModal(false)}>
          <div className="border-r-4 border-indigo-500 pr-3 mb-6">
            <h3 className="text-xl font-black text-slate-900">تسجيل عميل جديد</h3>
          </div>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-black text-slate-400 mb-1 block">اسم العميل *</label>
              <input className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none focus:border-indigo-400 transition-all" placeholder="اسم العميل" value={newCustomer.name} onChange={e => setNewCustomer({...newCustomer, name: e.target.value})} />
              {customerNameSuggestions.length > 0 && (
                <div className="mt-2 rounded-2xl border border-amber-200 bg-amber-50 p-2">
                  <p className="px-2 pb-1 text-[10px] font-black text-amber-700">أسماء مشابهة مسجلة قبل كده</p>
                  <div className="space-y-1">
                    {customerNameSuggestions.map((customer) => (
                      <button
                        key={customer.id}
                        type="button"
                        onClick={() => setNewCustomer({ name: customer.name, phone: customer.phone || "", balance: customer.balance || 0 })}
                        className="w-full rounded-xl bg-white px-3 py-2 text-right text-xs font-black text-slate-700 hover:bg-amber-100"
                      >
                        {customer.name}
                        <span className="mr-2 font-bold text-slate-400">{customer.phone || "بدون موبايل"}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div>
              <label className="text-xs font-black text-slate-400 mb-1 block">رقم الموبايل</label>
              <input className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none focus:border-indigo-400 transition-all" placeholder="01xxxxxxxxx" value={newCustomer.phone} onChange={e => setNewCustomer({...newCustomer, phone: e.target.value})} />
            </div>
            <div>
              <label className="text-xs font-black text-slate-400 mb-1 block">رصيد افتتاحي / مديونية قديمة</label>
              <input className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none text-rose-600 focus:border-indigo-400 transition-all" type="number" placeholder="0" value={newCustomer.balance || ""} onChange={e => setNewCustomer({...newCustomer, balance: Number(e.target.value)})} />
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={handleAddCustomer} disabled={saving || !newCustomer.name.trim()} className="flex-1 bg-[#0f172a] hover:bg-indigo-700 text-white py-4 rounded-2xl font-black transition-all disabled:opacity-50">{saving ? "جاري الحفظ..." : "حفظ العميل"}</button>
              <button onClick={() => setShowAddModal(false)} className="px-6 bg-slate-100 rounded-2xl font-black text-slate-600">إلغاء</button>
            </div>
          </div>
        </Modal>
      )}

      {/* ══ Modal: تحصيل ══ */}
      {showPayModal && selectedCustomer && (
        <Modal onClose={() => setShowPayModal(false)}>
          <div className="border-r-4 border-emerald-500 pr-3 mb-6">
            <h3 className="text-xl font-black text-slate-900">تحصيل من: {selectedCustomer.name}</h3>
            <p className="text-xs text-slate-400 font-bold mt-1">
              المديونية الحالية: <span className="text-rose-600 font-black">{selectedCustomer.balance.toLocaleString("ar-EG")} ج.م</span>
            </p>
          </div>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-black text-slate-400 mb-1 block">المبلغ المحصل</label>
              <input type="number" className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-black text-3xl text-emerald-600 outline-none focus:border-emerald-400 transition-all" placeholder="0" value={payAmount || ""} onChange={e => setPayAmount(Number(e.target.value))} />
              {payAmount > 0 && (
                <p className="text-xs text-slate-400 font-bold mt-2">
                  المتبقي بعد التحصيل:{" "}
                  <span className={`font-black ${selectedCustomer.balance - payAmount > 0 ? "text-rose-500" : "text-emerald-600"}`}>
                    {(selectedCustomer.balance - payAmount).toLocaleString("ar-EG")} ج.م
                  </span>
                </p>
              )}
            </div>
            <div>
              <label className="text-xs font-black text-slate-400 mb-1 block">ملاحظة اختيارية</label>
              <input className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-slate-900 outline-none" placeholder="ملاحظة" value={payNote} onChange={e => setPayNote(e.target.value)} />
            </div>
            <button onClick={handleCollection} disabled={saving || payAmount <= 0} className="w-full bg-emerald-500 hover:bg-emerald-400 text-white py-4 rounded-2xl font-black transition-all disabled:opacity-50">{saving ? "جاري التحصيل..." : "تأكيد التحصيل"}</button>
          </div>
        </Modal>
      )}

      {/* ══ Modal: تعديل ══ */}
      {showEditModal && selectedCustomer && (
        <Modal onClose={() => setShowEditModal(false)}>
          <div className="border-r-4 border-blue-500 pr-3 mb-6">
            <h3 className="text-xl font-black text-slate-900">تعديل بيانات العميل</h3>
            <p className="mt-1 text-xs font-bold text-slate-400">تعديل الاسم أو رقم التواصل فقط، بدون تغيير الرصيد المحاسبي.</p>
          </div>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-black text-slate-400 mb-1 block">اسم العميل *</label>
              <input className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none focus:border-blue-400 transition-all" value={selectedCustomer.name} onChange={e => setSelectedCustomer({...selectedCustomer, name: e.target.value})} />
            </div>
            <div>
              <label className="text-xs font-black text-slate-400 mb-1 block">رقم الموبايل</label>
              <input className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none focus:border-blue-400 transition-all" value={selectedCustomer.phone || ""} onChange={e => setSelectedCustomer({...selectedCustomer, phone: e.target.value})} />
            </div>
            <button onClick={handleUpdateCustomer} disabled={saving || !selectedCustomer.name.trim()} className="w-full bg-blue-600 hover:bg-blue-500 text-white py-4 rounded-2xl font-black transition-all disabled:opacity-50">{saving ? "جاري الحفظ..." : "حفظ التعديلات"}</button>
          </div>
        </Modal>
      )}

      {/* ══ Modal: حذف ══ */}
      {showDeleteModal && selectedCustomer && (
        <Modal onClose={() => setShowDeleteModal(false)}>
          <div className="text-center space-y-4">
            <div className="text-4xl">⚠️</div>
            <h3 className="text-xl font-black">تأكيد الحذف</h3>
            <p className="font-bold text-slate-500">هل أنت متأكد من حذف <span className="text-rose-600">«{selectedCustomer.name}»</span>؟</p>
            <div className="flex gap-3">
              <button onClick={handleDeleteCustomer} disabled={saving} className="flex-1 bg-rose-600 text-white py-4 rounded-2xl font-black">حذف نهائي</button>
              <button onClick={() => setShowDeleteModal(false)} className="flex-1 bg-slate-100 py-4 rounded-2xl font-black">تراجع</button>
            </div>
          </div>
        </Modal>
      )}

      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;900&display=swap');
        body { font-family: 'Cairo', sans-serif; }
      `}</style>
    </div>
  );
}

// ─── Modal Wrapper ────────────────────────────────────────────────────────────
function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-[1.25rem] p-6 w-full max-w-md shadow-2xl relative" onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}
