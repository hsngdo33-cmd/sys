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

type SortKey = "name" | "balance" | "created_at";
type FilterKey = "all" | "debtors" | "clear";

// ─── Component ────────────────────────────────────────────────────────────────
export default function CustomersListPage() {
  const [customers, setCustomers]         = useState<Customer[]>([]);
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
    const { data } = await supabase.from("customers").select("*").order("name");
    setCustomers(data || []);
    setLoading(false);
  }

  async function handleAddCustomer() {
    if (!newCustomer.name.trim()) return alert("الاسم مطلوب!");
    setSaving(true);
    await supabase.from("customers").insert([newCustomer]);
    setNewCustomer({ name: "", phone: "", balance: 0 });
    setShowAddModal(false);
    setSaving(false);
    fetchCustomers();
  }

  async function handleUpdateCustomer() {
    if (!selectedCustomer || !selectedCustomer.name.trim()) return alert("الاسم مطلوب!");
    setSaving(true);
    try {
      await supabase
        .from("customers")
        .update({ name: selectedCustomer.name, phone: selectedCustomer.phone })
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

  const displayed = useMemo(() => {
    let list = [...customers];
    if (searchTerm) list = list.filter(c => c.name.includes(searchTerm) || c.phone?.includes(searchTerm));
    if (filter === "debtors") list = list.filter(c => c.balance > 0);
    if (filter === "clear")   list = list.filter(c => c.balance <= 0);
    list.sort((a, b) => {
      if (sortBy === "balance")    return b.balance - a.balance;
      if (sortBy === "created_at") return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      return a.name.localeCompare(b.name, "ar");
    });
    return list;
  }, [customers, searchTerm, sortBy, filter]);

  const totalDebt   = customers.reduce((s, c) => s + Math.max(c.balance, 0), 0);
  const debtorCount = customers.filter(c => c.balance > 0).length;
  const clearCount  = customers.filter(c => c.balance <= 0).length;

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
          <button
            onClick={() => setShowAddModal(true)}
            className="app-btn app-btn-success"
          >
            ➕ إضافة عميل
          </button>
        </div>
      </header>

      <main className="app-directory-layout max-w-[1500px] mx-auto px-4">
        <aside className="app-directory-side">
        
        {/* ══ Summary Cards ══ */}
        <div className="grid gap-3">
          <div className="app-mini-stat bg-[#0f172a] text-white shadow-lg">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">إجمالي الديون</p>
            <p className="text-2xl font-black">{totalDebt.toLocaleString("ar-EG")}</p>
            <p className="text-xs text-slate-500 font-bold mt-1">جنيه مصري</p>
          </div>
          <div
            onClick={() => setFilter(filter === "debtors" ? "all" : "debtors")}
            className={`app-mini-stat shadow-sm cursor-pointer transition-all border-2 ${filter === "debtors" ? "bg-rose-500 text-white border-rose-500" : "bg-white border-slate-200 hover:border-rose-300"}`}
          >
            <p className="text-[10px] font-black mb-2 uppercase">عملاء مدينون</p>
            <p className="text-2xl font-black">{debtorCount}</p>
          </div>
          <div
            onClick={() => setFilter(filter === "clear" ? "all" : "clear")}
            className={`app-mini-stat shadow-sm cursor-pointer transition-all border-2 ${filter === "clear" ? "bg-emerald-500 text-white border-emerald-500" : "bg-white border-slate-200 hover:border-emerald-300"}`}
          >
            <p className="text-[10px] font-black mb-2 uppercase">حساب سليم</p>
            <p className="text-2xl font-black">{clearCount}</p>
          </div>
        </div>

        {/* ══ Search & Sort ══ */}
        <div className="bg-white p-3 rounded-[1.25rem] border border-slate-200 shadow-sm grid gap-3">
          <input
            placeholder="🔍 ابحث بالاسم أو الموبايل..."
            className="w-full p-3 bg-slate-50 rounded-xl font-bold text-slate-900 outline-none text-sm"
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
                {displayed.map(c => (
                  <tr key={c.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-4 py-3 font-black text-slate-900">{c.name}</td>
                    <td className="px-4 py-3 text-slate-400 font-bold">{c.phone || "—"}</td>
                    <td className="px-4 py-3">
                      {c.balance > 0 ? (
                        <span className="text-xl font-black text-rose-600">{c.balance.toLocaleString("ar-EG")}</span>
                      ) : (
                        <span className="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full text-[10px] font-black">سدّد ✅</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-center gap-2 flex-wrap">
  {/* زر التعديل */}
  <button
    onClick={() => { setSelectedCustomer(c); setShowEditModal(true); }}
    className="app-btn app-btn-sm app-btn-primary"
  >
    ✏️ تعديل
  </button>

  {/* زر الحذف */}
  <button
    onClick={() => { setSelectedCustomer(c); setShowDeleteModal(true); }}
    className="app-btn app-btn-sm app-btn-danger"
  >
    🗑️ حذف
  </button>

  {/* زر التحصيل (يظهر فقط لو عليه دين) */}
  {c.balance > 0 && (
    <button
      onClick={() => { setSelectedCustomer(c); setPayAmount(0); setPayNote(""); setShowPayModal(true); }}
      className="app-btn app-btn-sm app-btn-success"
    >
      💰 تحصيل
    </button>
  )}

  {/* زر البيع */}
  <Link 
    href={`/customer/${c.id}`} 
    className="app-btn app-btn-sm app-btn-primary"
  >
    🧾 بيع
  </Link>

  {/* زر السجل (اللي كان ناقص) */}
  <Link 
    href={`/customer/${c.id}/history`} 
    className="app-btn app-btn-sm app-btn-soft"
  >
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

      {/* ══ Modal: إضافة عميل ══ */}
      {showAddModal && (
        <Modal onClose={() => setShowAddModal(false)}>
          <h3 className="text-xl font-black mb-6">تسجيل عميل جديد</h3>
          <div className="space-y-4">
            <input className="w-full p-4 bg-slate-50 border rounded-2xl font-bold outline-none" placeholder="الاسم *" value={newCustomer.name} onChange={e => setNewCustomer({...newCustomer, name: e.target.value})} />
            <input className="w-full p-4 bg-slate-50 border rounded-2xl font-bold outline-none" placeholder="الموبايل" value={newCustomer.phone} onChange={e => setNewCustomer({...newCustomer, phone: e.target.value})} />
            <input className="w-full p-4 bg-slate-50 border rounded-2xl font-bold outline-none text-rose-600" type="number" placeholder="مديونية قديمة" value={newCustomer.balance || ""} onChange={e => setNewCustomer({...newCustomer, balance: Number(e.target.value)})} />
            <div className="flex gap-3">
              <button onClick={handleAddCustomer} disabled={saving} className="flex-1 bg-[#0f172a] text-white py-4 rounded-2xl font-black">{saving ? "جاري الحفظ..." : "حفظ ✅"}</button>
              <button onClick={() => setShowAddModal(false)} className="px-6 bg-slate-100 rounded-2xl font-black">إلغاء</button>
            </div>
          </div>
        </Modal>
      )}

      {/* ══ Modal: تحصيل ══ */}
      {showPayModal && selectedCustomer && (
        <Modal onClose={() => setShowPayModal(false)}>
          <h3 className="text-xl font-black mb-4">تحصيل من: {selectedCustomer.name}</h3>
          <div className="space-y-4">
            <input type="number" className="w-full p-4 bg-slate-50 border rounded-2xl font-black text-3xl text-emerald-600 text-center" placeholder="0" value={payAmount || ""} onChange={e => setPayAmount(Number(e.target.value))} />
            <input className="w-full p-4 bg-slate-50 border rounded-2xl font-bold" placeholder="ملاحظة" value={payNote} onChange={e => setPayNote(e.target.value)} />
            <button onClick={handleCollection} disabled={saving} className="w-full bg-emerald-500 text-white py-4 rounded-2xl font-black">تأكيد التحصيل ✅</button>
          </div>
        </Modal>
      )}

      {/* ══ Modal: تعديل ══ */}
      {showEditModal && selectedCustomer && (
        <Modal onClose={() => setShowEditModal(false)}>
          <h3 className="text-xl font-black mb-6">تعديل بيانات العميل</h3>
          <div className="space-y-4">
            <input className="w-full p-4 bg-slate-50 border rounded-2xl font-bold" value={selectedCustomer.name} onChange={e => setSelectedCustomer({...selectedCustomer, name: e.target.value})} />
            <input className="w-full p-4 bg-slate-50 border rounded-2xl font-bold" value={selectedCustomer.phone || ""} onChange={e => setSelectedCustomer({...selectedCustomer, phone: e.target.value})} />
            <button onClick={handleUpdateCustomer} disabled={saving} className="w-full bg-blue-600 text-white py-4 rounded-2xl font-black">حفظ التعديلات ✅</button>
          </div>
        </Modal>
      )}

      {/* ══ Modal: حذف ══ */}
      {showDeleteModal && selectedCustomer && (
        <Modal onClose={() => setShowDeleteModal(false)}>
          <div className="text-center space-y-4">
            <div className="text-4xl">⚠️</div>
            <h3 className="text-xl font-black">تأكيد الحذف</h3>
            <p className="font-bold text-slate-500">هل أنت متأكد من حذف <span className="text-rose-600">"{selectedCustomer.name}"</span>؟</p>
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
