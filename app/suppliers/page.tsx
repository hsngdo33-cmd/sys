"use client";
import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import Link from "next/link";

interface Supplier {
  id: string;
  name: string;
  phone: string;
  balance: number;
  created_at: string;
}

type SupplierTransactionSummary = {
  supplier_id: string | null;
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

export default function SuppliersPage() {
  const [suppliers, setSuppliers]     = useState<Supplier[]>([]);
  const [transactions, setTransactions] = useState<SupplierTransactionSummary[]>([]);
  const [loading, setLoading]         = useState(true);
  const [searchTerm, setSearchTerm]   = useState("");
  const [sortBy, setSortBy]           = useState<SortKey>("balance");
  const [filterDebt, setFilterDebt]   = useState<FilterKey>("all");
  const [showAddModal, setShowAddModal] = useState(false);
  const [showPayModal, setShowPayModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedSupp, setSelectedSupp] = useState<Supplier | null>(null);
  const [newSupp, setNewSupp]         = useState({ name: "", phone: "", balance: "" });
  const [payAmount, setPayAmount]     = useState(0);
  const [payNote, setPayNote]         = useState("");
  const [saving, setSaving]           = useState(false);

  useEffect(() => { fetchSuppliers(); }, []);

  async function fetchSuppliers() {
    setLoading(true);
    const [suppliersResult, transactionsResult] = await Promise.all([
      supabase.from("suppliers").select("*").order("created_at", { ascending: false }),
      supabase
        .from("transactions")
        .select("supplier_id,created_at")
        .order("created_at", { ascending: false })
        .limit(2000),
    ]);
    setSuppliers(suppliersResult.data || []);
    setTransactions((transactionsResult.data || []) as SupplierTransactionSummary[]);
    setLoading(false);
  }

  async function handleAddSupplier() {
    if (!newSupp.name.trim()) return alert("الاسم مطلوب!");
    const cleanName = newSupp.name.trim().replace(/\s+/g, " ");
    const cleanPhone = normalizePhone(newSupp.phone);
    const duplicate = suppliers.find((supplier) => {
      const sameName = normalizeText(supplier.name) === normalizeText(cleanName);
      const samePhone = cleanPhone && normalizePhone(supplier.phone) === cleanPhone;
      return sameName || samePhone;
    });

    if (duplicate) {
      return alert(`المورد "${duplicate.name}" مسجل قبل كده. افتح بياناته بدل إضافة سجل جديد.`);
    }

    setSaving(true);
    try {
      const { error } = await supabase.from("suppliers").insert([{
        name: cleanName,
        phone: cleanPhone || null,
        balance: newSupp.balance === "" ? 0 : Number(newSupp.balance),
      }]);
      if (error) throw error;
      setNewSupp({ name: "", phone: "", balance: "" });
      setShowAddModal(false);
      fetchSuppliers();
    } catch (addError) {
      alert(addError instanceof Error ? addError.message : "تعذر حفظ المورد.");
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdateSupplier() {
    if (!selectedSupp || !selectedSupp.name.trim()) return alert("الاسم مطلوب!");
    const cleanName = selectedSupp.name.trim().replace(/\s+/g, " ");
    const cleanPhone = normalizePhone(selectedSupp.phone);
    const duplicate = suppliers.find((supplier) => {
      if (supplier.id === selectedSupp.id) return false;
      const sameName = normalizeText(supplier.name) === normalizeText(cleanName);
      const samePhone = cleanPhone && normalizePhone(supplier.phone) === cleanPhone;
      return sameName || samePhone;
    });

    if (duplicate) {
      return alert(`في مورد تاني بنفس البيانات: ${duplicate.name}`);
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from("suppliers")
        .update({ name: cleanName, phone: cleanPhone || null })
        .eq("id", selectedSupp.id);
      if (error) throw error;
      setShowEditModal(false);
      fetchSuppliers();
    } catch (updateError) {
      alert(updateError instanceof Error ? updateError.message : "تعذر تعديل المورد.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteSupplier() {
    if (!selectedSupp) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("suppliers").delete().eq("id", selectedSupp.id);
      if (error) throw error;
      setShowDeleteModal(false);
      fetchSuppliers();
    } catch {
      alert("لا يمكن حذف المورد لأنه مرتبط بفواتير أو حركات مسجلة.");
    } finally {
      setSaving(false);
    }
  }

  async function handlePayment() {
    if (!selectedSupp || payAmount <= 0) return alert("ادخل مبلغ صحيح");
    if (payAmount > Number(selectedSupp.balance || 0)) {
      return alert("مبلغ التحصيل أكبر من مديونية المورد الحالية.");
    }
    setSaving(true);
    try {
      await supabase.from("transactions").insert([{
        supplier_id: selectedSupp.id,
        amount: payAmount,
        type: "تحصيل نقدي",
        description: payNote || "تحصيل بدون فاتورة",
      }]);
      await supabase.from("suppliers")
        .update({ balance: (selectedSupp.balance || 0) - payAmount })
        .eq("id", selectedSupp.id);
      setShowPayModal(false);
      setPayAmount(0);
      setPayNote("");
      fetchSuppliers();
    } catch { alert("خطأ في الاتصال"); }
    finally { setSaving(false); }
  }

  const activityMap = useMemo(() => {
    const map = new Map<string, ActivitySummary>();

    transactions.forEach((transaction) => {
      if (!transaction.supplier_id) return;
      const current = map.get(transaction.supplier_id) || { count: 0, lastDate: null };
      current.count += 1;
      if (!current.lastDate || new Date(transaction.created_at) > new Date(current.lastDate)) {
        current.lastDate = transaction.created_at;
      }
      map.set(transaction.supplier_id, current);
    });

    return map;
  }, [transactions]);

  const formatLastActivity = (supplierId: string) => {
    const activity = activityMap.get(supplierId);
    if (!activity?.lastDate) return "لا توجد حركات";
    return new Date(activity.lastDate).toLocaleDateString("ar-EG");
  };

  const getSupplierStatus = (supplier: Supplier) => {
    if (!activityMap.get(supplier.id)?.count) {
      return { label: "بدون حركة", className: "bg-amber-100 text-amber-700 border-amber-200" };
    }
    if (supplier.balance > 0) {
      return { label: "عليه مديونية", className: "bg-rose-100 text-rose-700 border-rose-200" };
    }
    return { label: "حساب سليم", className: "bg-emerald-100 text-emerald-700 border-emerald-200" };
  };

  const displayed = useMemo(() => {
    let list = [...suppliers];
    if (searchTerm)           list = list.filter(s => matchesDirectorySearch(s.name, s.phone, searchTerm));
    if (filterDebt === "debtors") list = list.filter(s => s.balance > 0);
    if (filterDebt === "clear")   list = list.filter(s => s.balance <= 0);
    if (filterDebt === "inactive") list = list.filter(s => !activityMap.get(s.id)?.count);
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
  }, [activityMap, suppliers, searchTerm, sortBy, filterDebt]);

  const supplierNameSuggestions = useMemo(() => {
    const name = newSupp.name.trim().toLowerCase();
    if (name.length < 2) return [];

    return suppliers
      .filter((supplier) => supplier.name.toLowerCase().includes(name))
      .slice(0, 5);
  }, [newSupp.name, suppliers]);

  const totalDebt   = suppliers.reduce((s, x) => s + Math.max(x.balance, 0), 0);
  const debtorCount = suppliers.filter(s => s.balance > 0).length;
  const clearCount  = suppliers.filter(s => s.balance <= 0).length;
  const inactiveCount = suppliers.filter(s => !activityMap.get(s.id)?.count).length;
  const filterTabs: { key: FilterKey; label: string; count: number }[] = [
    { key: "all", label: "الكل", count: suppliers.length },
    { key: "debtors", label: "مديونية", count: debtorCount },
    { key: "clear", label: "سليم", count: clearCount },
    { key: "inactive", label: "بدون حركة", count: inactiveCount },
  ];

  function exportSuppliers() {
    downloadCsv("suppliers.csv", [
      ["المورد", "الموبايل", "الرصيد", "عدد الحركات", "آخر حركة"],
      ...displayed.map((supplier) => [
        supplier.name,
        supplier.phone || "",
        Number(supplier.balance || 0),
        activityMap.get(supplier.id)?.count || 0,
        formatLastActivity(supplier.id),
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
              <h1 className="text-xl font-black">إدارة الموردين 📦</h1>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">{suppliers.length} مورد مسجل</p>
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
                  onClick={() => setFilterDebt(tab.key)}
                  className={`min-h-10 rounded-lg px-3 text-xs font-black transition-all ${filterDebt === tab.key ? "bg-[#0f172a] text-white shadow-sm" : "text-slate-500 hover:bg-white"}`}
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
              إضافة مورد
            </button>
            <button onClick={exportSuppliers} disabled={displayed.length === 0} className="app-btn app-btn-soft">
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
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">إجمالي المديونية</p>
            <p className="text-2xl font-black">{totalDebt.toLocaleString("ar-EG")}</p>
            <p className="text-xs text-slate-500 font-bold mt-1">جنيه مصري</p>
          </div>
          <div className="app-mini-stat bg-white border border-slate-200 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-widest mb-2 text-slate-400">موردون مدينون</p>
            <p className="text-2xl font-black">{debtorCount}</p>
          </div>
          <div className="app-mini-stat bg-white border border-slate-200 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-widest mb-2 text-slate-400">حساب سليم</p>
            <p className="text-2xl font-black">{clearCount}</p>
          </div>
          <div className="app-mini-stat bg-white border border-slate-200 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-widest mb-2 text-slate-400">بدون حركة</p>
            <p className="text-2xl font-black">{inactiveCount}</p>
          </div>
        </div>

        {/* ══ Table ══ */}
        <p className="text-center text-xs text-slate-400 font-bold">
          يعرض {displayed.length} من {suppliers.length} مورد
        </p>
        </aside>

        <section className="app-directory-table bg-white border border-slate-200 shadow-sm">
          {loading ? (
            <div className="p-10 text-center text-slate-400 font-black animate-pulse">⏳ جاري التحميل...</div>
          ) : displayed.length === 0 ? (
            <div className="p-10 text-center text-slate-300">
              <p className="text-5xl mb-4">🔍</p>
              <p className="font-black">لا توجد نتائج</p>
            </div>
          ) : (
            <table className="w-full text-right">
              <thead className="bg-slate-50 text-[10px] font-black uppercase text-slate-400 border-b border-slate-100">
                <tr>
                  <th className="px-4 py-3">المورد</th>
                  <th className="px-4 py-3">الموبايل</th>
                  <th className="px-4 py-3">المديونية</th>
                  <th className="px-4 py-3 text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {displayed.map(s => {
                  const status = getSupplierStatus(s);
                  return (
                  <tr key={s.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-700 font-black text-sm flex items-center justify-center shrink-0">
                          {s.name.charAt(0)}
                        </div>
                        <div>
                          <Link href={`/suppliers/${s.id}/history`} className="font-black text-slate-900 hover:text-indigo-700 transition-colors">
                            {s.name}
                          </Link>
                          <p className="mt-1 text-[11px] font-bold text-slate-400">
                            آخر حركة: {formatLastActivity(s.id)} · {(activityMap.get(s.id)?.count || 0).toLocaleString("ar-EG")} حركة
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-400 font-bold text-sm">{s.phone || "—"}</td>
                    <td className="px-4 py-3">
                      <div className="grid gap-1">
                        <span className={`w-fit rounded-full border px-3 py-1 text-[10px] font-black ${status.className}`}>
                          {status.label}
                        </span>
                        <span className={`text-lg font-black ${s.balance > 0 ? "text-rose-600" : "text-slate-500"}`}>
                          {s.balance > 0 ? s.balance.toLocaleString("ar-EG") : "0"}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-center gap-2">
                        <Link href={`/suppliers/${s.id}/history`} className="app-btn app-btn-sm app-btn-primary">
                          السجل
                        </Link>
                        <details className="relative">
                          <summary className="app-btn app-btn-sm app-btn-soft list-none cursor-pointer">
                            إجراءات
                          </summary>
                          <div className="absolute left-0 top-10 z-30 w-48 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
                            <Link href={`/suppliers/${s.id}`} className="block rounded-xl px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50">فاتورة توريد</Link>
                            <Link href={`/suppliers/${s.id}/return`} className="block rounded-xl px-3 py-2 text-xs font-black text-amber-700 hover:bg-amber-50">مرتجع</Link>
                            {s.balance > 0 && (
                              <button
                                onClick={() => { setSelectedSupp(s); setPayAmount(0); setPayNote(""); setShowPayModal(true); }}
                                className="block w-full rounded-xl px-3 py-2 text-right text-xs font-black text-emerald-700 hover:bg-emerald-50"
                              >
                                تحصيل بدون فاتورة
                              </button>
                            )}
                            <button
                              onClick={() => { setSelectedSupp(s); setShowEditModal(true); }}
                              className="block w-full rounded-xl px-3 py-2 text-right text-xs font-black text-blue-700 hover:bg-blue-50"
                            >
                              تعديل البيانات
                            </button>
                            <button
                              onClick={() => { setSelectedSupp(s); setShowDeleteModal(true); }}
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

      {/* ══ Modal: تحصيل بدون فاتورة ══ */}
      {showPayModal && selectedSupp && (
        <Modal onClose={() => setShowPayModal(false)}>
          <div className="border-r-4 border-emerald-500 pr-3 mb-6">
            <h3 className="text-xl font-black text-slate-900">تحصيل بدون فاتورة لـ: {selectedSupp.name}</h3>
            <p className="text-xs text-slate-400 font-bold mt-1">
              المديونية الحالية: <span className="text-rose-600 font-black">{selectedSupp.balance.toLocaleString("ar-EG")} ج.م</span>
            </p>
          </div>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-black text-slate-400 mb-1 block">المبلغ المدفوع</label>
              <input
                type="number"
                className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-black text-3xl text-emerald-600 outline-none focus:border-emerald-400 transition-all"
                placeholder="0"
                value={payAmount || ""}
                onChange={e => setPayAmount(Number(e.target.value))}
                autoFocus
              />
              {payAmount > 0 && (
                <p className="text-xs text-slate-400 font-bold mt-2">
                  المتبقي بعد التحصيل:{" "}
                  <span className={`font-black ${selectedSupp.balance - payAmount > 0 ? "text-rose-500" : "text-emerald-600"}`}>
                    {(selectedSupp.balance - payAmount).toLocaleString("ar-EG")} ج.م
                  </span>
                </p>
              )}
            </div>
            <div>
              <label className="text-xs font-black text-slate-400 mb-1 block">ملاحظة (اختياري)</label>
              <input
                className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-slate-900 outline-none text-sm"
                placeholder="ملاحظة اختيارية"
                value={payNote}
                onChange={e => setPayNote(e.target.value)}
              />
            </div>
            <div className="flex gap-3 pt-2">
              <button
                onClick={handlePayment}
                disabled={saving || payAmount <= 0}
                className="flex-1 bg-emerald-500 hover:bg-emerald-400 text-white py-4 rounded-2xl font-black text-lg transition-all active:scale-95 disabled:opacity-50"
              >
                {saving ? "جاري التحصيل..." : "تأكيد التحصيل ✅"}
              </button>
              <button onClick={() => setShowPayModal(false)} className="px-6 py-4 bg-slate-100 text-slate-500 rounded-2xl font-black hover:bg-slate-200 transition-all">إلغاء</button>
            </div>
          </div>
        </Modal>
      )}

      {/* ══ Modal: إضافة مورد ══ */}
      {showAddModal && (
        <Modal onClose={() => setShowAddModal(false)}>
          <div className="border-r-4 border-indigo-500 pr-3 mb-6">
            <h3 className="text-xl font-black text-slate-900">تسجيل مورد جديد</h3>
          </div>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-black text-slate-400 mb-1 block">اسم المورد / الجهة *</label>
              <input
                className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-900 outline-none focus:border-indigo-400 transition-all"
                placeholder="اسم المورد"
                value={newSupp.name}
                onChange={e => setNewSupp({...newSupp, name: e.target.value})}
                autoFocus
              />
              {supplierNameSuggestions.length > 0 && (
                <div className="mt-2 rounded-2xl border border-amber-200 bg-amber-50 p-2">
                  <p className="px-2 pb-1 text-[10px] font-black text-amber-700">أسماء مشابهة مسجلة قبل كده</p>
                  <div className="space-y-1">
                    {supplierNameSuggestions.map((supplier) => (
                      <button
                        key={supplier.id}
                        type="button"
                        onClick={() => setNewSupp({ name: supplier.name, phone: supplier.phone || "", balance: String(supplier.balance || "") })}
                        className="w-full rounded-xl bg-white px-3 py-2 text-right text-xs font-black text-slate-700 hover:bg-amber-100"
                      >
                        {supplier.name}
                        <span className="mr-2 font-bold text-slate-400">{supplier.phone || "بدون موبايل"}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div>
              <label className="text-xs font-black text-slate-400 mb-1 block">رقم التواصل</label>
              <input
                className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-900 outline-none focus:border-indigo-400 transition-all"
                placeholder="01xxxxxxxxx"
                value={newSupp.phone}
                onChange={e => setNewSupp({...newSupp, phone: e.target.value})}
              />
            </div>
            <div>
              <label className="text-xs font-black text-slate-400 mb-1 block">رصيد افتتاحي (لو موجود)</label>
              <input
                type="number"
                className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-rose-600 outline-none focus:border-indigo-400 transition-all"
                placeholder="0"
                value={newSupp.balance}
                onChange={e => setNewSupp({...newSupp, balance: e.target.value})}
              />
            </div>
            <div className="flex gap-3 pt-2">
              <button
                onClick={handleAddSupplier}
                disabled={saving || !newSupp.name.trim()}
                className="flex-1 bg-[#0f172a] hover:bg-indigo-700 text-white py-4 rounded-2xl font-black transition-all active:scale-95 disabled:opacity-50"
              >
                {saving ? "جاري الحفظ..." : "حفظ المورد ✅"}
              </button>
              <button onClick={() => setShowAddModal(false)} className="px-6 py-4 bg-slate-100 text-slate-500 rounded-2xl font-black hover:bg-slate-200 transition-all">إلغاء</button>
            </div>
          </div>
        </Modal>
      )}

      {showEditModal && selectedSupp && (
        <Modal onClose={() => setShowEditModal(false)}>
          <div className="border-r-4 border-blue-500 pr-3 mb-6">
            <h3 className="text-xl font-black text-slate-900">تعديل بيانات المورد</h3>
            <p className="mt-1 text-xs font-bold text-slate-400">تعديل الاسم أو رقم التواصل فقط، بدون تغيير الرصيد المحاسبي.</p>
          </div>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-black text-slate-400 mb-1 block">اسم المورد *</label>
              <input
                className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-900 outline-none focus:border-blue-400 transition-all"
                value={selectedSupp.name}
                onChange={e => setSelectedSupp({...selectedSupp, name: e.target.value})}
                autoFocus
              />
            </div>
            <div>
              <label className="text-xs font-black text-slate-400 mb-1 block">رقم التواصل</label>
              <input
                className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-900 outline-none focus:border-blue-400 transition-all"
                value={selectedSupp.phone || ""}
                onChange={e => setSelectedSupp({...selectedSupp, phone: e.target.value})}
              />
            </div>
            <button
              onClick={handleUpdateSupplier}
              disabled={saving || !selectedSupp.name.trim()}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white py-4 rounded-2xl font-black transition-all disabled:opacity-50"
            >
              {saving ? "جاري الحفظ..." : "حفظ التعديلات"}
            </button>
          </div>
        </Modal>
      )}

      {showDeleteModal && selectedSupp && (
        <Modal onClose={() => setShowDeleteModal(false)}>
          <div className="text-center space-y-4">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-50 text-2xl text-rose-600">!</div>
            <h3 className="text-xl font-black text-slate-950">تأكيد حذف المورد</h3>
            <p className="font-bold leading-7 text-slate-500">
              هل تريد حذف <span className="text-rose-600">{selectedSupp.name}</span>؟ لن يتم الحذف لو المورد مرتبط بفواتير أو حركات.
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleDeleteSupplier}
                disabled={saving}
                className="flex-1 bg-rose-600 text-white py-4 rounded-2xl font-black hover:bg-rose-500 disabled:opacity-50"
              >
                {saving ? "جاري الحذف..." : "حذف نهائي"}
              </button>
              <button onClick={() => setShowDeleteModal(false)} className="flex-1 bg-slate-100 py-4 rounded-2xl font-black text-slate-600">
                تراجع
              </button>
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

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-[1.25rem] p-6 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}
