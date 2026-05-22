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

type SortKey = "name" | "balance" | "created_at";

export default function SuppliersPage() {
  const [suppliers, setSuppliers]     = useState<Supplier[]>([]);
  const [loading, setLoading]         = useState(true);
  const [searchTerm, setSearchTerm]   = useState("");
  const [sortBy, setSortBy]           = useState<SortKey>("balance");
  const [filterDebt, setFilterDebt]   = useState<"all" | "debtors" | "clear">("all");
  const [showAddModal, setShowAddModal] = useState(false);
  const [showPayModal, setShowPayModal] = useState(false);
  const [selectedSupp, setSelectedSupp] = useState<Supplier | null>(null);
  const [newSupp, setNewSupp]         = useState({ name: "", phone: "", balance: "" });
  const [payAmount, setPayAmount]     = useState(0);
  const [payNote, setPayNote]         = useState("");
  const [saving, setSaving]           = useState(false);

  useEffect(() => { fetchSuppliers(); }, []);

  async function fetchSuppliers() {
    setLoading(true);
    const { data } = await supabase.from("suppliers").select("*").order("created_at", { ascending: false });
    setSuppliers(data || []);
    setLoading(false);
  }

  async function handleAddSupplier() {
    if (!newSupp.name.trim()) return alert("الاسم مطلوب!");
    setSaving(true);
    await supabase.from("suppliers").insert([{
      name:    newSupp.name,
      phone:   newSupp.phone || null,
      balance: newSupp.balance === "" ? 0 : Number(newSupp.balance),
    }]);
    setNewSupp({ name: "", phone: "", balance: "" });
    setShowAddModal(false);
    setSaving(false);
    fetchSuppliers();
  }

  async function handlePayment() {
    if (!selectedSupp || payAmount <= 0) return alert("ادخل مبلغ صحيح");
    setSaving(true);
    try {
      await supabase.from("transactions").insert([{
        supplier_id: selectedSupp.id,
        amount: payAmount,
        type: "سداد نقدي",
        description: payNote || "سداد سريع",
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

  const displayed = useMemo(() => {
    let list = [...suppliers];
    if (searchTerm)           list = list.filter(s => s.name.includes(searchTerm) || s.phone?.includes(searchTerm));
    if (filterDebt === "debtors") list = list.filter(s => s.balance > 0);
    if (filterDebt === "clear")   list = list.filter(s => s.balance <= 0);
    list.sort((a, b) => {
      if (sortBy === "balance")    return b.balance - a.balance;
      if (sortBy === "created_at") return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      return a.name.localeCompare(b.name, "ar");
    });
    return list;
  }, [suppliers, searchTerm, sortBy, filterDebt]);

  const totalDebt   = suppliers.reduce((s, x) => s + Math.max(x.balance, 0), 0);
  const debtorCount = suppliers.filter(s => s.balance > 0).length;
  const clearCount  = suppliers.filter(s => s.balance <= 0).length;

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
          <button
            onClick={() => setShowAddModal(true)}
            className="app-btn app-btn-primary"
          >
            ➕ إضافة مورد
          </button>
        </div>
      </header>

      <main className="app-directory-layout max-w-[1500px] mx-auto px-4">
        <aside className="app-directory-side">

        {/* ══ Summary Cards ══ */}
        <div className="grid gap-3">
          <div className="app-mini-stat bg-[#0f172a] text-white shadow-lg">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">إجمالي المديونية</p>
            <p className="text-2xl font-black">{totalDebt.toLocaleString("ar-EG")}</p>
            <p className="text-xs text-slate-500 font-bold mt-1">جنيه مصري</p>
          </div>
          <div
            onClick={() => setFilterDebt(filterDebt === "debtors" ? "all" : "debtors")}
            className={`app-mini-stat shadow-sm cursor-pointer transition-all border-2 ${filterDebt === "debtors" ? "bg-rose-500 text-white border-rose-500" : "bg-white border-slate-200 hover:border-rose-300"}`}
          >
            <p className={`text-[10px] font-black uppercase tracking-widest mb-2 ${filterDebt === "debtors" ? "text-rose-100" : "text-slate-400"}`}>موردون مدينون</p>
            <p className="text-2xl font-black">{debtorCount}</p>
            <p className={`text-xs font-bold mt-1 ${filterDebt === "debtors" ? "text-rose-100" : "text-slate-400"}`}>اضغط للتصفية</p>
          </div>
          <div
            onClick={() => setFilterDebt(filterDebt === "clear" ? "all" : "clear")}
            className={`app-mini-stat shadow-sm cursor-pointer transition-all border-2 ${filterDebt === "clear" ? "bg-emerald-500 text-white border-emerald-500" : "bg-white border-slate-200 hover:border-emerald-300"}`}
          >
            <p className={`text-[10px] font-black uppercase tracking-widest mb-2 ${filterDebt === "clear" ? "text-emerald-100" : "text-slate-400"}`}>حساب سليم</p>
            <p className="text-2xl font-black">{clearCount}</p>
            <p className={`text-xs font-bold mt-1 ${filterDebt === "clear" ? "text-emerald-100" : "text-slate-400"}`}>اضغط للتصفية</p>
          </div>
        </div>

        {/* ══ Search & Sort ══ */}
        <div className="bg-white p-3 rounded-[1.25rem] border border-slate-200 shadow-sm grid gap-3">
          <input
            placeholder="🔍 ابحث بالاسم أو الموبايل..."
            className="w-full p-3 bg-slate-50 rounded-xl font-bold text-slate-900 outline-none text-sm focus:ring-2 ring-indigo-200 transition-all"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
          <div className="grid grid-cols-3 gap-2">
            {(["name","balance","created_at"] as SortKey[]).map(k => (
              <button
                key={k}
                onClick={() => setSortBy(k)}
                className={`app-btn app-btn-sm ${sortBy === k ? "app-btn-primary" : "app-btn-soft"}`}
              >
                {k === "name" ? "الاسم" : k === "balance" ? "الدين" : "الأحدث"}
              </button>
            ))}
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
                {displayed.map(s => (
                  <tr key={s.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-700 font-black text-sm flex items-center justify-center shrink-0">
                          {s.name.charAt(0)}
                        </div>
                        <span className="font-black text-slate-900">{s.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-400 font-bold text-sm">{s.phone || "—"}</td>
                    <td className="px-4 py-3">
                      {s.balance > 0 ? (
                        <span className="text-xl font-black text-rose-600">
                          {s.balance.toLocaleString("ar-EG")} <small className="text-xs font-normal text-slate-400">ج.م</small>
                        </span>
                      ) : (
                        <span className="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full text-xs font-black">مسدد ✅</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-center gap-2 flex-wrap">
                        {s.balance > 0 && (
                          <button
                            onClick={() => { setSelectedSupp(s); setPayAmount(0); setPayNote(""); setShowPayModal(true); }}
                            className="app-btn app-btn-sm app-btn-success"
                          >
                            💸 سداد
                          </button>
                        )}
                        <Link href={`/suppliers/${s.id}`}
                          className="app-btn app-btn-sm app-btn-primary">
                          📥 فاتورة
                        </Link>
                        <Link href={`/suppliers/${s.id}/history`}
                          className="app-btn app-btn-sm app-btn-soft">
                          📂 سجل
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

      </main>

      {/* ══ Modal: سداد سريع ══ */}
      {showPayModal && selectedSupp && (
        <Modal onClose={() => setShowPayModal(false)}>
          <div className="border-r-4 border-emerald-500 pr-3 mb-6">
            <h3 className="text-xl font-black text-slate-900">سداد لـ: {selectedSupp.name}</h3>
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
                  المتبقي بعد السداد:{" "}
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
                placeholder="مثال: دفعة تحت الحساب"
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
                {saving ? "جاري السداد..." : "تأكيد السداد ✅"}
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
                placeholder="مثال: شركة النور للتجارة"
                value={newSupp.name}
                onChange={e => setNewSupp({...newSupp, name: e.target.value})}
                autoFocus
              />
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
