"use client";
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

interface Product {
  id: string; name: string; unit: string;
  sale_price: number; purchase_price: number; stock_quantity: number;
  barcode?: string | null;
}
interface CartItem extends Product {
  qty: number | string;
  price: number | string;
  cost: number;
}

interface Customer {
  id: string;
  name: string;
  balance?: number;
}

const cleanBarcode = (value: unknown) => value?.toString().trim() || "";

export default function CustomerInvoicePage() {
  const { id } = useParams();
  const router  = useRouter();

  const [customer, setCustomer]       = useState<Customer | null>(null);
  const [products, setProducts]       = useState<Product[]>([]);
  const [searchTerm, setSearchTerm]   = useState("");
  const [cart, setCart]               = useState<CartItem[]>([]);
  const [cashPaid, setCashPaid]       = useState<number | string>(0);
  const [discountPercent, setDiscountPercent] = useState<number | string>(0);
  const [isSaving, setIsSaving]       = useState(false);
  const [note, setNote]               = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const scanControlsRef = useRef<{ stop?: () => void } | null>(null);
  const scanLockedRef = useRef(false);

  const loadData = useCallback(async () => {
    const [{ data: cust }, { data: prods }] = await Promise.all([
      supabase.from("customers").select("*").eq("id", id).single(),
      supabase.from("products").select("id,name,unit,sale_price,purchase_price,stock_quantity,barcode").order("name"),
    ]);
    setCustomer(cust);
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
    if (p.stock_quantity <= 0) return alert("الكتاب ده نسخه خلصت!");
    if (cart.find(i => i.id === p.id)) return;
    setCart(prev => [...prev, { ...p, qty: 1, price: p.sale_price, cost: p.purchase_price }]);
  };

  const handleBarcodeEntry = (value: string) => {
    const barcode = cleanBarcode(value);

    if (!barcode) return;

    const found = products.find(p => cleanBarcode(p.barcode) === barcode);

    if (!found) {
      return alert("الباركود غير مسجل في فهرس الكتب");
    }

    addToCart(found);
    setSearchTerm(barcode);
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

  const updateCart = (id: string, field: "qty" | "price", val: string) =>
    setCart(prev => prev.map(i => i.id === id ? { ...i, [field]: val } : i));

  // ── Totals ──
  const subtotal   = cart.reduce((s, i) => s + Number(i.qty || 0) * Number(i.price || 0), 0);
  const totalCost  = cart.reduce((s, i) => s + Number(i.qty || 0) * Number(i.cost || 0), 0);
  const discountRate = Math.min(Math.max(Number(discountPercent) || 0, 0), 100);
  const discountAmount = subtotal * (discountRate / 100);
  const total      = Math.max(subtotal - discountAmount, 0);
  const profit     = total - totalCost;
  const cash       = Number(cashPaid) || 0;
  const remaining  = total - cash;
  const margin     = total > 0 ? Math.round((profit / total) * 100) : 0;

  const saveInvoice = async (printAfterSave = false) => {
    if (!customer) return alert("بيانات القارئ لم تحمل بعد");
    if (cart.length === 0) return alert("الفاتورة فاضية!");
    setIsSaving(true);
    try {
      const itemsToSave = cart.map(i => ({
        id: i.id, name: i.name, unit: i.unit,
        qty: Number(i.qty), price: Number(i.price), cost: Number(i.cost),
      }));

      const { data: invoice, error: invoiceError } = await supabase.from("customer_transactions").insert([{
        customer_id: id, amount: total, type: "sale",
        items: itemsToSave, profit,
        description: note || `بيع كتب لـ ${customer.name}${discountRate > 0 ? ` - خصم ${discountRate}%` : ""}`,
      }]).select("id").single();
      if (invoiceError) throw invoiceError;

      if (cash > 0) {
        await supabase.from("customer_transactions").insert([{
          customer_id: id, amount: cash, type: "payment", description: `سداد من فاتورة #${invoice?.id}`,
        }]);
      }

      await supabase.from("customers")
        .update({ balance: (customer.balance || 0) + remaining })
        .eq("id", id);

      for (const item of cart)
        await supabase.rpc("decrement_stock", { row_id: item.id, amount: Number(item.qty) });

      if (printAfterSave) {
        window.print();
      }
      router.push(`/customer/${id}/history`);
    } catch { alert("خطأ في الحفظ"); }
    finally { setIsSaving(false); }
  };

  return (
    <div className="min-h-screen bg-[#f1f5f9] text-right font-sans text-slate-900 pb-10" dir="rtl">

      {/* ══ Header ══ */}
      <header className="bg-[#0f172a] text-white px-5 py-4 flex justify-between items-center shadow-xl sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <Link href="/customer" className="bg-white/10 hover:bg-white/20 px-4 py-2 rounded-xl text-xs font-black transition-all">⬅️ رجوع</Link>
          <div>
            <h1 className="text-lg font-black">فاتورة قارئ: {customer?.name}</h1>
            <p className="text-[10px] text-slate-400 font-bold">{new Date().toLocaleDateString("ar-EG", { weekday:"long", day:"numeric", month:"long" })}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {cart.length > 0 && (
            <span className="bg-indigo-600 px-3 py-1 rounded-lg text-[10px] font-black">{cart.length} كتاب</span>
          )}
          <div className={`px-4 py-1.5 rounded-lg text-[10px] font-black ${(customer?.balance || 0) > 0 ? "bg-rose-600" : "bg-emerald-600"}`}>
            مديونية: {customer?.balance?.toLocaleString("ar-EG")} ج.م
          </div>
        </div>
      </header>

      <main className="app-invoice-layout max-w-[1500px] mx-auto p-4 mt-3">

        {/* ══ قائمة الكتب ══ */}
        <aside className="app-invoice-sidebar bg-white border border-slate-200 shadow-sm flex flex-col">
          <div className="p-4 border-b border-slate-100 space-y-3">
            <h3 className="font-black text-slate-400 text-[10px] uppercase tracking-widest">📚 اختيار الكتب</h3>
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
          </div>
          <div className="overflow-y-auto flex-1 p-3 space-y-2">
            {filteredProducts.map(p => {
              const inCart = !!cart.find(i => i.id === p.id);
              return (
                <div
                  key={p.id}
                  onClick={() => !inCart && addToCart(p)}
                  className={`p-3 rounded-xl border flex justify-between items-center transition-all
                    ${p.stock_quantity <= 0 ? "opacity-40 grayscale cursor-not-allowed border-slate-100" :
                      inCart ? "border-indigo-300 bg-indigo-50 cursor-default" :
                               "border-slate-100 hover:border-indigo-400 hover:bg-slate-50 cursor-pointer"}`}
                >
                  <div>
                    <p className="font-black text-slate-900 text-sm">{p.name}</p>
                    <p className="text-[10px] font-bold text-emerald-600 mt-0.5">{p.sale_price} ج.م</p>
                  </div>
                  <div className="text-left">
                    <div className={`px-3 py-1.5 rounded-xl text-center ${p.stock_quantity <= 5 ? "bg-rose-100" : "bg-slate-100"}`}>
                      <p className={`text-xs font-black ${p.stock_quantity <= 5 ? "text-rose-600" : "text-slate-700"}`}>{p.stock_quantity}</p>
                      <p className="text-[8px] font-black text-slate-400 uppercase">{p.unit}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </aside>

        {/* ══ الفاتورة ══ */}
        <section className="min-w-0">

          {/* جدول الكتب */}
          <div className="app-invoice-table bg-white border border-slate-200 shadow-sm overflow-auto">
            {cart.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-slate-300 space-y-3">
                <span className="text-5xl">🧾</span>
                <p className="font-black">اختار كتب من الجانب</p>
              </div>
            ) : (
              <table className="w-full text-right border-collapse">
                <thead className="bg-slate-50 text-slate-400 font-black text-[10px] uppercase border-b border-slate-100">
                  <tr>
                    <th className="p-4">الكتاب</th>
                    <th className="p-4 text-center">الكمية</th>
                    <th className="p-4 text-center">السعر <span className="text-indigo-400 normal-case font-normal">(قابل للتعديل)</span></th>
                    <th className="p-4 text-center">الربح</th>
                    <th className="p-4 text-left">الإجمالي</th>
                    <th className="p-4 w-8"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {cart.map(item => {
                    const lineTotal  = Number(item.qty || 0) * Number(item.price || 0);
                    const lineCost   = Number(item.qty || 0) * Number(item.cost || 0);
                    const lineProfit = lineTotal - lineCost;
                    const m = lineTotal > 0 ? Math.round((lineProfit / lineTotal) * 100) : 0;
                    return (
                      <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="p-4">
                          <p className="font-black text-sm">{item.name}</p>
                          <p className="text-[9px] text-slate-400 font-bold">تكلفة: {item.cost} ج.م</p>
                        </td>
                        <td className="p-4 text-center">
                          <input
                            type="number" step="any"
                            value={item.qty}
                            onChange={e => updateCart(item.id, "qty", e.target.value)}
                            className="w-20 p-2 border border-slate-200 rounded-xl text-center font-black bg-slate-50 outline-none focus:border-indigo-400 transition-all"
                          />
                        </td>
                        <td className="p-4 text-center">
                          <input
                            type="number" step="any"
                            value={item.price}
                            onChange={e => updateCart(item.id, "price", e.target.value)}
                            className="w-24 p-2 border border-slate-200 rounded-xl text-center font-black text-indigo-600 bg-slate-50 outline-none focus:border-indigo-400 transition-all"
                          />
                        </td>
                        <td className="p-4 text-center">
                          <span className={`text-[10px] font-black px-2 py-1 rounded-lg block text-center ${lineProfit >= 0 ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-600"}`}>
                            {lineProfit.toFixed(1)} ج<br/>
                            <span className="text-[8px] opacity-70">{m}%</span>
                          </span>
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
        </section>

        <aside className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-2.5">
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

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-2.5">
            <input
              placeholder="📝 ملاحظة على الفاتورة (اختياري)..."
              className="w-full bg-transparent font-bold text-slate-700 outline-none text-sm placeholder:text-slate-300"
              value={note}
              onChange={e => setNote(e.target.value)}
            />
          </div>

          {/* ══ فوتر الفاتورة ══ */}
          <div className="app-invoice-footer bg-[#0f172a] border border-slate-700 shadow-xl">
            <div className="grid grid-cols-2 gap-3 mb-4 text-white">
              <div>
                <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest mb-1">الإجمالي</p>
                <p className="text-xl font-black">{total.toLocaleString("ar-EG", { maximumFractionDigits: 2 })} <small className="text-xs opacity-50">ج</small></p>
              </div>
              <div>
                <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest mb-1">الربح المتوقع</p>
                <p className={`text-xl font-black ${profit >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                  {profit.toFixed(1)} <small className="text-xs opacity-70">ج ({margin}%)</small>
                </p>
              </div>
              <div>
                <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest mb-1">دفع كاش</p>
                <input
                  type="number" step="any"
                  value={cashPaid}
                  onChange={e => setCashPaid(e.target.value)}
                  className="bg-white/10 border border-white/20 text-white text-xl font-black w-full rounded-xl px-3 py-1.5 outline-none focus:border-emerald-400 transition-all text-center"
                  placeholder="0"
                />
              </div>
              <div>
                <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest mb-1">المتبقي (دين)</p>
                <p className={`text-xl font-black ${remaining > 0 ? "text-rose-400" : "text-emerald-400"}`}>
                  {remaining.toLocaleString("ar-EG", { maximumFractionDigits: 2 })} <small className="text-xs opacity-70">ج</small>
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3">
              <button
                onClick={() => saveInvoice(true)}
                disabled={isSaving || cart.length === 0}
                className="app-btn app-btn-ghost app-btn-lg w-full"
              >
                {isSaving ? "جاري الحفظ..." : "حفظ وطباعة"}
              </button>
              <button
                onClick={() => saveInvoice(false)}
                disabled={isSaving || cart.length === 0}
                className="app-btn app-btn-success app-btn-lg w-full"
              >
                {isSaving ? "جاري الحفظ..." : "حفظ واعتماد الفاتورة"}
              </button>
            </div>
          </div>
        </aside>
      </main>

      <section className="print-invoice hidden" dir="rtl">
        <div className="print-card">
          <div className="print-header">
            <div>
              <p className="print-eyebrow">فاتورة بيع</p>
              <h1>منظومة إدارة المكتبة</h1>
              <p>إدارة القراء والكتب</p>
            </div>
            <div className="print-meta">
              <p>التاريخ: {new Date().toLocaleDateString("ar-EG")}</p>
              <p>القارئ: {customer?.name || "-"}</p>
              <p>الرصيد السابق: {(customer?.balance || 0).toLocaleString("ar-EG")} ج.م</p>
            </div>
          </div>
          <table className="print-table">
            <thead>
              <tr>
                <th>الكتاب</th>
                <th>الوحدة</th>
                <th>الكمية</th>
                <th>السعر</th>
                <th>الإجمالي</th>
              </tr>
            </thead>
            <tbody>
              {cart.map(item => (
                <tr key={item.id}>
                  <td>{item.name}</td>
                  <td>{item.unit}</td>
                  <td>{Number(item.qty || 0).toLocaleString("ar-EG")}</td>
                  <td>{Number(item.price || 0).toLocaleString("ar-EG")} ج</td>
                  <td>{(Number(item.qty || 0) * Number(item.price || 0)).toLocaleString("ar-EG")} ج</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="print-summary">
            <p><span>الإجمالي قبل الخصم</span><b>{subtotal.toLocaleString("ar-EG", { maximumFractionDigits: 2 })} ج</b></p>
            <p><span>الخصم ({discountRate}%)</span><b>{discountAmount.toLocaleString("ar-EG", { maximumFractionDigits: 2 })} ج</b></p>
            <p><span>الصافي</span><b>{total.toLocaleString("ar-EG", { maximumFractionDigits: 2 })} ج</b></p>
            <p><span>المدفوع</span><b>{cash.toLocaleString("ar-EG", { maximumFractionDigits: 2 })} ج</b></p>
            <p className="print-total"><span>المتبقي</span><b>{remaining.toLocaleString("ar-EG", { maximumFractionDigits: 2 })} ج</b></p>
          </div>
          {note && <p className="print-note">ملاحظة: {note}</p>}
        </div>
      </section>

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
