"use client";
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

interface Product {
  id: string; name: string; unit: string;
  purchase_price: number; sale_price: number; stock_quantity: number;
  barcode?: string | null;
}
interface CartItem extends Product {
  qty: number | string;
  p_price: number | string;
}

interface Supplier {
  id: string;
  name: string;
  balance?: number;
}

const UNITS = ["كيلو","جرام","لتر","ملي","عبوة","شكارة","طن","وحدة"];

const INVOICE_UNITS = ["كيلو", "جرام", "مللي", "لتر", "كرتونة", "شكارة", "عبوة", "حبة"];

void UNITS;

const generateBarcode = () => {
  const randomPart =
    typeof crypto !== "undefined"
      ? Array.from(crypto.getRandomValues(new Uint8Array(10))).map((value) => value % 10).join("")
      : Math.floor(Math.random() * 10_000_000_000).toString().padStart(10, "0");

  return `20${randomPart}`;
};

const cleanBarcode = (value: unknown) => value?.toString().trim() || "";

const isPrintableBarcode = (value: string) => /^[A-Za-z0-9-]{4,24}$/.test(value);

export default function SupplierInvoicePage() {
  const { id } = useParams();
  const router  = useRouter();

  const [supplier, setSupplier]     = useState<Supplier | null>(null);
  const [products, setProducts]     = useState<Product[]>([]);
  const [cart, setCart]             = useState<CartItem[]>([]);
  const [cashPaid, setCashPaid]     = useState<number | string>(0);
  const [discountPercent, setDiscountPercent] = useState<number | string>(0);
  const [searchTerm, setSearchTerm] = useState("");
  const [isSaving, setIsSaving]     = useState(false);
  const [note, setNote]             = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [newProd, setNewProd]       = useState({ name: "", unit: "كيلو", purchase_price: "", sale_price: "" });
  const [addingSaving, setAddingSaving] = useState(false);
  const [newProdBarcode, setNewProdBarcode] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const scanControlsRef = useRef<{ stop?: () => void } | null>(null);
  const scanLockedRef = useRef(false);

  const loadData = useCallback(async () => {
    const [{ data: supp }, { data: prods }] = await Promise.all([
      supabase.from("suppliers").select("*").eq("id", id).single(),
      supabase.from("products").select("*").order("name"),
    ]);
    setSupplier(supp);
    setProducts(prods || []);
  }, [id]);

  useEffect(() => {
    if (id) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      loadData();
    }
  }, [id, loadData]);

  const filteredProducts = useMemo(() =>
    products.filter(p =>
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cleanBarcode(p.barcode).includes(searchTerm)
    ),
    [products, searchTerm]
  );

  const addToCart = (p: Product) => {
    if (cart.find(i => i.id === p.id)) return;
    setCart(prev => [...prev, { ...p, qty: 1, p_price: p.purchase_price }]);
  };

  const handleBarcodeEntry = (value: string) => {
    const barcode = cleanBarcode(value);

    if (!barcode) return;

    const found = products.find(p => cleanBarcode(p.barcode) === barcode);

    if (found) {
      addToCart(found);
      setSearchTerm(barcode);
      return;
    }

    setNewProdBarcode(barcode);
    setShowAddModal(true);
  };

  const startBarcodeScanner = async () => {
    if (scannerOpen) return;

    scanLockedRef.current = false;
    setScannerOpen(true);

    setTimeout(async () => {
      try {
        if (!videoRef.current) return;

        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        const reader = new BrowserMultiFormatReader();
        const controls = await reader.decodeFromConstraints(
          { video: { facingMode: "environment" } },
          videoRef.current,
          (result, _error, controls) => {
            if (!result || scanLockedRef.current) return;

            scanLockedRef.current = true;
            controls.stop();
            setScannerOpen(false);
            handleBarcodeEntry(result.getText());
          }
        );

        scanControlsRef.current = controls;
      } catch {
        setScannerOpen(false);
        alert("تعذر تشغيل الكاميرا");
      }
    }, 250);
  };

  const stopBarcodeScanner = () => {
    scanControlsRef.current?.stop?.();
    scanControlsRef.current = null;
    scanLockedRef.current = false;

    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }

    setScannerOpen(false);
  };

  const removeFromCart = (pid: string) => setCart(prev => prev.filter(i => i.id !== pid));

  const updateCart = (pid: string, field: "qty" | "p_price", val: string) =>
    setCart(prev => prev.map(i => i.id === pid ? { ...i, [field]: val } : i));

  const subtotalInvoice = cart.reduce((s, i) => s + Number(i.qty || 0) * Number(i.p_price || 0), 0);
  const discountRate = Math.min(Math.max(Number(discountPercent) || 0, 0), 100);
  const discountAmount = subtotalInvoice * (discountRate / 100);
  const totalInvoice = Math.max(subtotalInvoice - discountAmount, 0);
  const cash         = Number(cashPaid) || 0;
  const remaining    = totalInvoice - cash;

  const printInvoice = () => {
    if (cart.length === 0) return alert("الفاتورة فارغة!");
    window.print();
  };

  async function handleAddNewProduct() {
    if (!newProd.name.trim() || !newProd.purchase_price) return alert("اكمل البيانات!");
    const barcode = cleanBarcode(newProdBarcode) || generateBarcode();

    if (!isPrintableBarcode(barcode)) {
      return alert("الباركود لازم يكون 4 إلى 24 رقم/حرف إنجليزي فقط.");
    }

    if (products.some(product => cleanBarcode(product.barcode) === barcode)) {
      return alert("الباركود مستخدم بالفعل");
    }

    setAddingSaving(true);
    const { data } = await supabase.from("products").insert([{
      name: newProd.name, unit: newProd.unit,
      purchase_price: Number(newProd.purchase_price),
      sale_price: Number(newProd.sale_price) || Number(newProd.purchase_price),
      stock_quantity: 0,
      barcode,
    }]).select().single();
    if (data) {
      setProducts(prev => [...prev, data]);
      addToCart(data);
      setShowAddModal(false);
      setNewProdBarcode("");
      setNewProd({ name: "", unit: "كيلو", purchase_price: "", sale_price: "" });
    }
    setAddingSaving(false);
  }

  async function saveInvoice() {
    if (!supplier) return alert("بيانات المورد لم تحمل بعد");
    if (cart.length === 0) return alert("الفاتورة فارغة!");
    setIsSaving(true);
    try {
      await supabase.from("transactions").insert([{
        supplier_id: id,
        amount: totalInvoice,
        type: "فاتورة توريد",
        items: cart.map(i => ({ id: i.id, name: i.name, unit: i.unit, qty: Number(i.qty), price: Number(i.p_price) })),
        description: note || `توريد بضاعة من ${supplier?.name}${discountRate > 0 ? ` - خصم ${discountRate}%` : ""}`,
      }]);

      if (cash > 0) {
        await supabase.from("transactions").insert([{
          supplier_id: id, amount: cash, type: "سداد نقدي", description: "دفعة من الفاتورة",
        }]);
      }

      await supabase.from("suppliers")
        .update({ balance: (supplier.balance || 0) + remaining })
        .eq("id", id);

      for (const item of cart)
        await supabase.rpc("increment_stock", { row_id: item.id, amount: Number(item.qty) });

      router.push("/suppliers");
    } catch { alert("خطأ في الحفظ"); }
    finally { setIsSaving(false); }
  }

  return (
    <div className="min-h-screen bg-[#f1f5f9] text-right font-sans text-slate-900 pb-10" dir="rtl">

      {/* ══ Header ══ */}
      <header className="bg-[#0f172a] text-white p-5 flex justify-between items-center shadow-xl sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <Link href="/suppliers" className="bg-white/10 hover:bg-white/20 px-4 py-2 rounded-xl text-xs font-black transition-all">⬅️ رجوع</Link>
          <div>
            <h1 className="text-lg font-black">📥 فاتورة توريد: {supplier?.name}</h1>
            <p className="text-[10px] text-slate-400 font-bold mt-0.5">
              {new Date().toLocaleDateString("ar-EG", { weekday:"long", day:"numeric", month:"long" })}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {cart.length > 0 && (
            <span className="bg-amber-500 px-3 py-1 rounded-lg text-[10px] font-black">{cart.length} صنف</span>
          )}
          <div className={`px-4 py-1.5 rounded-lg text-[10px] font-black ${(supplier?.balance || 0) > 0 ? "bg-rose-600" : "bg-emerald-600"}`}>
            مديونية: {supplier?.balance?.toLocaleString("ar-EG")} ج.م
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-4 grid grid-cols-12 gap-5 mt-4">

        {/* ══ قائمة المنتجات ══ */}
        <aside className="col-span-12 lg:col-span-4 bg-white rounded-[2.5rem] border border-slate-200 shadow-sm flex flex-col" style={{ height: "82vh" }}>
          <div className="p-5 border-b border-slate-100 space-y-3">
            <h3 className="font-black text-slate-400 text-[10px] uppercase tracking-widest">📦 اختيار الأصناف</h3>
            <input
              type="text"
              placeholder="🔍 ابحث..."
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-900 outline-none focus:border-indigo-400 transition-all text-sm"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter") handleBarcodeEntry(searchTerm);
              }}
            />
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => handleBarcodeEntry(searchTerm)}
                className="bg-slate-900 text-white py-2.5 rounded-xl text-xs font-black transition-all"
              >
                إدخال باركود
              </button>
              <button
                onClick={startBarcodeScanner}
                className="bg-indigo-600 text-white py-2.5 rounded-xl text-xs font-black transition-all"
              >
                سكان كاميرا
              </button>
            </div>
            <button
              onClick={() => setShowAddModal(true)}
              className="w-full bg-amber-50 hover:bg-amber-100 text-amber-700 border border-dashed border-amber-300 py-2.5 rounded-xl text-xs font-black transition-all"
            >
              ➕ صنف جديد مش متسجل
            </button>
          </div>
          <div className="overflow-y-auto flex-1 p-3 space-y-2">
            {filteredProducts.map(p => {
              const inCart = !!cart.find(i => i.id === p.id);
              return (
                <div
                  key={p.id}
                  onClick={() => !inCart && addToCart(p)}
                  className={`p-4 rounded-2xl border flex justify-between items-center transition-all
                    ${inCart
                      ? "border-amber-300 bg-amber-50 cursor-default"
                      : "border-slate-100 hover:border-amber-400 hover:bg-slate-50 cursor-pointer"}`}
                >
                  <div>
                    <p className="font-black text-slate-900 text-sm">{p.name}</p>
                    <p className="text-[10px] font-bold text-slate-400 mt-0.5">
                      شراء: {p.purchase_price} ج — مخزن: {p.stock_quantity} {p.unit}
                    </p>
                  </div>
                  <div className={`px-3 py-1.5 rounded-xl text-center ${p.stock_quantity <= 5 ? "bg-rose-100" : "bg-slate-100"}`}>
                    <p className={`text-xs font-black ${p.stock_quantity <= 5 ? "text-rose-600" : "text-slate-700"}`}>{p.stock_quantity}</p>
                    <p className="text-[8px] font-black text-slate-400 uppercase">{p.unit}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </aside>

        {/* ══ الفاتورة ══ */}
        <div className="col-span-12 lg:col-span-8 space-y-4">
          <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden" style={{ minHeight: 380 }}>
            {cart.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-slate-300 space-y-3">
                <span className="text-5xl">📥</span>
                <p className="font-black">اختار أصناف من الجانب</p>
              </div>
            ) : (
              <table className="w-full text-right border-collapse">
                <thead className="bg-slate-50 text-slate-400 font-black text-[10px] uppercase border-b border-slate-100">
                  <tr>
                    <th className="p-4">الصنف</th>
                    <th className="p-4 text-center">الكمية</th>
                    <th className="p-4 text-center">سعر الشراء <span className="text-amber-400 normal-case font-normal">(قابل للتعديل)</span></th>
                    <th className="p-4 text-left">الإجمالي</th>
                    <th className="p-4 w-8"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {cart.map(item => {
                    const lineTotal = Number(item.qty || 0) * Number(item.p_price || 0);
                    return (
                      <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="p-4">
                          <p className="font-black text-sm">{item.name}</p>
                          <p className="text-[9px] text-slate-400 font-bold">{item.unit}</p>
                        </td>
                        <td className="p-4 text-center">
                          <input
                            type="number" step="any"
                            value={item.qty}
                            onChange={e => updateCart(item.id, "qty", e.target.value)}
                            className="w-20 p-2 border border-slate-200 rounded-xl text-center font-black bg-slate-50 outline-none focus:border-amber-400 transition-all"
                          />
                        </td>
                        <td className="p-4 text-center">
                          <input
                            type="number" step="any"
                            value={item.p_price}
                            onChange={e => updateCart(item.id, "p_price", e.target.value)}
                            className="w-24 p-2 border border-slate-200 rounded-xl text-center font-black text-amber-600 bg-slate-50 outline-none focus:border-amber-400 transition-all"
                          />
                        </td>
                        <td className="p-4 text-left font-black">{lineTotal.toLocaleString("ar-EG", { maximumFractionDigits: 2 })}</td>
                        <td className="p-4">
                          <button onClick={() => removeFromCart(item.id)} className="text-slate-300 hover:text-rose-500 transition-colors text-lg font-black">✕</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* ملاحظة */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-5 py-3">
            <label className="block text-[10px] font-black text-slate-400 mb-1">نسبة خصم على الفاتورة كلها</label>
            <div className="flex items-center gap-3">
              <input
                type="number"
                min="0"
                max="100"
                step="any"
                value={discountPercent}
                onChange={e => setDiscountPercent(e.target.value)}
                className="w-full bg-transparent font-black text-slate-900 outline-none text-lg"
                placeholder="0"
              />
              <span className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-black text-slate-500">%</span>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-5 py-3">
            <input
              placeholder="📝 ملاحظة على الفاتورة (اختياري)..."
              className="w-full bg-transparent font-bold text-slate-700 outline-none text-sm placeholder:text-slate-300"
              value={note}
              onChange={e => setNote(e.target.value)}
            />
          </div>

          {/* ══ فوتر الفاتورة ══ */}
          <div className="bg-[#0f172a] p-7 rounded-[2.5rem] shadow-2xl">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 text-white">
              <div>
                <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest mb-1">إجمالي الفاتورة</p>
                <p className="text-2xl font-black">{totalInvoice.toLocaleString("ar-EG", { maximumFractionDigits: 2 })} <small className="text-xs opacity-50">ج</small></p>
              </div>
              <div>
                <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest mb-1">دفع كاش</p>
                <input
                  type="number" step="any"
                  value={cashPaid}
                  onChange={e => setCashPaid(e.target.value)}
                  className="bg-white/10 border border-white/20 text-white text-2xl font-black w-full rounded-2xl px-3 py-1.5 outline-none focus:border-amber-400 transition-all text-center"
                  placeholder="0"
                />
              </div>
              <div>
                <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest mb-1">المتبقي (دين للمورد)</p>
                <p className={`text-2xl font-black ${remaining > 0 ? "text-rose-400" : "text-emerald-400"}`}>
                  {remaining.toLocaleString("ar-EG", { maximumFractionDigits: 2 })} <small className="text-xs opacity-70">ج</small>
                </p>
              </div>
            </div>
            <button
              onClick={printInvoice}
              disabled={cart.length === 0}
              className="mb-3 w-full bg-white/10 hover:bg-white/20 disabled:opacity-50 text-white py-4 rounded-2xl font-black text-sm transition-all"
            >
              طباعة الفاتورة
            </button>
            <button
              onClick={saveInvoice}
              disabled={isSaving || cart.length === 0}
              className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-white py-5 rounded-2xl font-black text-xl transition-all active:scale-[0.99] shadow-xl shadow-amber-900/20"
            >
              {isSaving ? "⏳ جاري الحفظ..." : "اعتماد وتحديث المخزن ✅"}
            </button>
          </div>
        </div>
      </main>

      <section className="print-invoice hidden" dir="rtl">
        <div className="print-card">
          <div className="print-header">
            <div>
              <p className="print-eyebrow">فاتورة توريد</p>
              <h1>منظومة المحاسبة</h1>
              <p>إدارة الموردين والمخازن</p>
            </div>
            <div className="print-meta">
              <p>التاريخ: {new Date().toLocaleDateString("ar-EG")}</p>
              <p>المورد: {supplier?.name || "-"}</p>
              <p>الرصيد السابق: {(supplier?.balance || 0).toLocaleString("ar-EG")} ج.م</p>
            </div>
          </div>
          <table className="print-table">
            <thead>
              <tr>
                <th>الصنف</th>
                <th>الوحدة</th>
                <th>الكمية</th>
                <th>سعر الشراء</th>
                <th>الإجمالي</th>
              </tr>
            </thead>
            <tbody>
              {cart.map(item => (
                <tr key={item.id}>
                  <td>{item.name}</td>
                  <td>{item.unit}</td>
                  <td>{Number(item.qty || 0).toLocaleString("ar-EG")}</td>
                  <td>{Number(item.p_price || 0).toLocaleString("ar-EG")} ج</td>
                  <td>{(Number(item.qty || 0) * Number(item.p_price || 0)).toLocaleString("ar-EG")} ج</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="print-summary">
            <p><span>الإجمالي قبل الخصم</span><b>{subtotalInvoice.toLocaleString("ar-EG", { maximumFractionDigits: 2 })} ج</b></p>
            <p><span>الخصم ({discountRate}%)</span><b>{discountAmount.toLocaleString("ar-EG", { maximumFractionDigits: 2 })} ج</b></p>
            <p><span>الصافي</span><b>{totalInvoice.toLocaleString("ar-EG", { maximumFractionDigits: 2 })} ج</b></p>
            <p><span>المدفوع</span><b>{cash.toLocaleString("ar-EG", { maximumFractionDigits: 2 })} ج</b></p>
            <p className="print-total"><span>المتبقي للمورد</span><b>{remaining.toLocaleString("ar-EG", { maximumFractionDigits: 2 })} ج</b></p>
          </div>
          {note && <p className="print-note">ملاحظة: {note}</p>}
        </div>
      </section>

      {/* ══ Modal: صنف جديد ══ */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4" onClick={() => setShowAddModal(false)}>
          <div className="bg-white rounded-[2.5rem] p-8 w-full max-w-md shadow-2xl space-y-5" onClick={e => e.stopPropagation()}>
            <div className="border-r-4 border-amber-500 pr-3">
              <h3 className="text-xl font-black text-slate-900">إضافة صنف جديد</h3>
              <p className="text-xs text-slate-400 font-bold mt-0.5">هيتضاف للمخزن وللفاتورة فوراً</p>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-black text-slate-400 mb-1 block">اسم الصنف *</label>
                <input
                  className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-900 outline-none focus:border-amber-400 transition-all"
                  placeholder="مثال: أرز بسمتي"
                  value={newProd.name}
                  onChange={e => setNewProd({...newProd, name: e.target.value})}
                  autoFocus
                />
              </div>
              <div>
                <label className="text-xs font-black text-slate-400 mb-1 block">الباركود</label>
                <input
                  className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-900 outline-none focus:border-amber-400 transition-all font-mono"
                  placeholder="اتركه فارغًا للتوليد التلقائي"
                  value={newProdBarcode}
                  onChange={e => setNewProdBarcode(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs font-black text-slate-400 mb-1 block">وحدة القياس</label>
                <select
                  className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-900 outline-none focus:border-amber-400 transition-all"
                  value={newProd.unit}
                  onChange={e => setNewProd({...newProd, unit: e.target.value})}
                >
                  {INVOICE_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-black text-slate-400 mb-1 block">سعر الشراء *</label>
                  <input
                    type="number" step="any"
                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-rose-600 outline-none focus:border-amber-400 transition-all"
                    placeholder="0"
                    value={newProd.purchase_price}
                    onChange={e => setNewProd({...newProd, purchase_price: e.target.value})}
                  />
                </div>
                <div>
                  <label className="text-xs font-black text-slate-400 mb-1 block">سعر البيع</label>
                  <input
                    type="number" step="any"
                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-emerald-600 outline-none focus:border-amber-400 transition-all"
                    placeholder="0"
                    value={newProd.sale_price}
                    onChange={e => setNewProd({...newProd, sale_price: e.target.value})}
                  />
                </div>
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button
                onClick={handleAddNewProduct}
                disabled={addingSaving || !newProd.name.trim() || !newProd.purchase_price}
                className="flex-1 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-white py-4 rounded-2xl font-black transition-all active:scale-95"
              >
                {addingSaving ? "جاري الإضافة..." : "حفظ وإضافة للفاتورة ✅"}
              </button>
              <button onClick={() => setShowAddModal(false)} className="px-6 py-4 bg-slate-100 text-slate-500 rounded-2xl font-black hover:bg-slate-200 transition-all">إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {scannerOpen && (
        <div className="fixed inset-0 bg-black/80 z-[110] flex items-center justify-center p-4">
          <div className="bg-white rounded-[2rem] p-4 w-full max-w-md">
            <h3 className="font-black text-center mb-3">وجه الكاميرا للباركود</h3>
            <video ref={videoRef} className="w-full rounded-2xl bg-black" muted playsInline />
            <button
              onClick={stopBarcodeScanner}
              className="w-full bg-rose-500 text-white py-4 rounded-2xl mt-4 font-black"
            >
              إغلاق
            </button>
          </div>
        </div>
      )}

      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;900&display=swap');
        body { font-family: 'Cairo', sans-serif; background-color: #f1f5f9; }
        @media print {
          body * { visibility: hidden !important; }
          .print-invoice, .print-invoice * { visibility: visible !important; }
          .print-invoice { display: block !important; position: absolute; inset: 0; padding: 24px; background: white; color: #0f172a; }
          .print-card { max-width: 900px; margin: 0 auto; border: 1px solid #dbe3ef; padding: 28px; border-radius: 16px; }
          .print-header { display: flex; justify-content: space-between; gap: 24px; border-bottom: 2px solid #0f172a; padding-bottom: 18px; margin-bottom: 22px; }
          .print-eyebrow { font-size: 12px; font-weight: 900; color: #d97706; margin: 0 0 6px; }
          .print-header h1 { margin: 0; font-size: 28px; font-weight: 900; }
          .print-header p { margin: 4px 0; font-weight: 700; }
          .print-meta { text-align: left; font-size: 13px; }
          .print-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
          .print-table th { background: #0f172a; color: white; padding: 10px; font-size: 12px; }
          .print-table td { border-bottom: 1px solid #e2e8f0; padding: 10px; font-weight: 700; font-size: 12px; }
          .print-summary { margin-right: auto; width: 320px; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; }
          .print-summary p { display: flex; justify-content: space-between; margin: 0; padding: 10px 14px; border-bottom: 1px solid #e2e8f0; font-weight: 800; }
          .print-summary p:last-child { border-bottom: 0; }
          .print-total { background: #fffbeb; color: #b45309; font-size: 16px; }
          .print-note { margin-top: 18px; padding: 12px; background: #f8fafc; border-radius: 12px; font-weight: 700; }
        }
      `}</style>
    </div>
  );
}
