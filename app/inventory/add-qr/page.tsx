"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PRODUCT_CATEGORIES, ProductCategory, normalizeProductCategory, productCategoryLabel } from "@/lib/product-category";

// ─── Types ────────────────────────────────────────────────────────────────────
type ScanMode = "camera" | "manual" | null;

const UNITS = ["قطعة", "نسخة", "كتاب", "علبة", "دستة", "مجموعة", "مجلد", "سلسلة", "كرتونة"];

function generateCode() {
  return "PRD-" + Math.random().toString(36).substring(2, 8).toUpperCase();
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function AddProductPage() {
  const router = useRouter();

  const [form, setForm] = useState({
    barcode:        "",
    name:           "",
    unit:           "قطعة",
    stock_quantity: "",
    purchase_price: "",
    sale_price:     "",
    product_category: "books" as ProductCategory,
  });

  const [scanMode, setScanMode]         = useState<ScanMode>(null);
  const [scanning, setScanning]         = useState(false);
  const [scanError, setScanError]       = useState("");
  const [saving, setSaving]             = useState(false);
  const [savedProduct, setSavedProduct] = useState<any>(null); // للـ QR label
  const [showQR, setShowQR]             = useState(false);
  const [existingProduct, setExistingProduct] = useState<any>(null); // لو الباركود موجود

  const videoRef    = useRef<HTMLVideoElement>(null);
  const streamRef   = useRef<MediaStream | null>(null);
  const readerRef   = useRef<any>(null);

  // ── تنظيف الكاميرا عند الخروج ──
  useEffect(() => {
    return () => stopCamera();
  }, []);

  async function startCamera() {
    setScanError("");
    setScanning(true);
    setScanMode("camera");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      // تحميل ZXing ديناميكياً
      const ZXing = await import("@zxing/browser" as any).catch(() => null);
      if (!ZXing) {
        setScanError("مكتبة الـ Scanner غير متاحة — ادخل الكود يدوياً");
        stopCamera();
        return;
      }
      const codeReader = new ZXing.BrowserMultiFormatReader();
      readerRef.current = codeReader;
      codeReader.decodeFromVideoElement(videoRef.current, (result: any, err: any) => {
        if (result) {
          handleScanResult(result.getText());
        }
      });
    } catch (e: any) {
      setScanError("تعذر الوصول للكاميرا — تأكد من السماح للموقع");
      setScanning(false);
    }
  }

  function stopCamera() {
    if (readerRef.current) {
      try { readerRef.current.reset?.(); } catch {}
      readerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setScanning(false);
    setScanMode(null);
  }

  async function handleScanResult(code: string) {
    stopCamera();
    setForm(f => ({ ...f, barcode: code }));

    // تحقق لو الكود موجود في الأصناف
    const { data } = await supabase.from("products").select("*").eq("barcode", code).maybeSingle();
    if (data) {
      setExistingProduct(data);
    } else {
      setExistingProduct(null);
    }
  }

  function handleBarcodeInput(val: string) {
    setForm(f => ({ ...f, barcode: val }));
    setExistingProduct(null);
  }

  // ── حفظ الصنف ──
  async function handleSave() {
    if (!form.name.trim())           return alert("اسم الصنف مطلوب!");
    if (!form.purchase_price)        return alert("سعر الشراء مطلوب!");
    if (!form.sale_price)            return alert("سعر البيع مطلوب!");

    // لو ما فيش باركود → ولّد كود تلقائي
    const barcode = form.barcode.trim() || generateCode();

    setSaving(true);
    try {
      const { data, error } = await supabase.from("products").insert([{
        name:           form.name.trim(),
        unit:           form.unit,
        stock_quantity: Number(form.stock_quantity) || 0,
        purchase_price: Number(form.purchase_price),
        sale_price:     Number(form.sale_price),
        barcode:        barcode,
        product_category: normalizeProductCategory(form.product_category),
      }]).select().single();

      if (error) throw error;

      setSavedProduct({ ...data, barcode });

      // لو الكود كان تلقائي → اسأل عن الطباعة
      if (!form.barcode.trim()) {
        setShowQR(true);
      } else {
        router.push("/inventory");
      }
    } catch (e: any) {
      // لو الـ barcode column مش موجود في الداتابيز، احفظ بدونه
      if (e?.message?.includes("barcode")) {
        const { data, error2 } = await supabase.from("products").insert([{
          name:           form.name.trim(),
          unit:           form.unit,
          stock_quantity: Number(form.stock_quantity) || 0,
          purchase_price: Number(form.purchase_price),
        sale_price:     Number(form.sale_price),
        product_category: normalizeProductCategory(form.product_category),
      }]).select().single() as any;
        if (!error2 && data) {
          setSavedProduct({ ...data, barcode: generateCode() });
          setShowQR(!form.barcode.trim());
          if (form.barcode.trim()) router.push("/inventory");
        } else {
          alert("خطأ في الحفظ");
        }
      } else {
        alert("خطأ في الحفظ: " + e?.message);
      }
    } finally {
      setSaving(false);
    }
  }

  const margin = form.purchase_price && form.sale_price
    ? Math.round(((Number(form.sale_price) - Number(form.purchase_price)) / Number(form.sale_price)) * 100)
    : null;

  return (
    <div className="min-h-screen bg-[#f1f5f9] text-right font-sans text-slate-900 pb-16" dir="rtl">

      {/* ══ Header ══ */}
      <header className="bg-[#0f172a] text-white p-5 shadow-xl sticky top-0 z-40 mb-6">
        <div className="max-w-xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Link href="/inventory" className="bg-white/10 hover:bg-white/20 px-4 py-2 rounded-xl text-xs font-black transition-all">⬅️ رجوع</Link>
            <div>
              <h1 className="text-lg font-black">إضافة صنف جديد 📦</h1>
              <p className="text-[10px] text-slate-400 font-bold mt-0.5">سكان الباركود أو إدخال يدوي</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-xl mx-auto px-4 space-y-5">

        {/* ══ خانة الباركود ══ */}
        <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-100">
            <p className="font-black text-slate-900">كود الصنف / الباركود</p>
            <p className="text-[10px] text-slate-400 font-bold mt-0.5">سكان بالكاميرا أو ادخله يدوياً — لو فاضي هيتولد تلقائي</p>
          </div>

          <div className="p-5 space-y-4">
            {/* Scanner / Input */}
            <div className="flex gap-3">
              <input
                placeholder="اسكان أو اكتب الكود هنا..."
                className="flex-1 p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-900 outline-none focus:border-indigo-400 transition-all text-sm tracking-widest"
                value={form.barcode}
                onChange={e => handleBarcodeInput(e.target.value)}
              />
              <button
                onClick={scanning ? stopCamera : startCamera}
                className={`px-5 py-4 rounded-2xl font-black text-sm transition-all active:scale-95 ${scanning ? "bg-rose-500 text-white" : "bg-[#0f172a] text-white hover:bg-indigo-700"}`}
              >
                {scanning ? "⏹ إيقاف" : "📷 سكان"}
              </button>
            </div>

            {/* Camera View */}
            {scanMode === "camera" && (
              <div className="relative rounded-2xl overflow-hidden bg-black" style={{ aspectRatio: "16/9" }}>
                <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
                {/* إطار التصويب */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-48 h-32 border-2 border-amber-400 rounded-xl opacity-80">
                    <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-amber-400 rounded-tr-xl" />
                    <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-amber-400 rounded-tl-xl" />
                    <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-amber-400 rounded-br-xl" />
                    <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-amber-400 rounded-bl-xl" />
                  </div>
                </div>
                <p className="absolute bottom-3 w-full text-center text-white text-xs font-black">وجّه الكاميرا على الباركود</p>
              </div>
            )}

            {/* Error */}
            {scanError && (
              <div className="bg-rose-50 border border-rose-200 text-rose-700 rounded-xl p-3 text-xs font-bold">
                ⚠️ {scanError}
              </div>
            )}

            {/* لو الباركود موجود */}
            {existingProduct && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-2">
                <p className="font-black text-amber-800 text-sm">⚠️ الكود ده موجود بالفعل في الأصناف!</p>
                <p className="text-xs text-amber-700 font-bold">الصنف: {existingProduct.name} — المتاح: {existingProduct.stock_quantity} {existingProduct.unit}</p>
                <Link
                  href="/inventory"
                  className="inline-block bg-amber-500 text-white px-4 py-2 rounded-xl text-xs font-black hover:bg-amber-600 transition-all"
                >
                  عرض الصنف في الأصناف
                </Link>
              </div>
            )}

            {/* لو الباركود فاضي */}
            {!form.barcode && (
              <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3 flex items-center gap-2">
                <span className="text-lg">🔖</span>
                <p className="text-xs text-indigo-600 font-bold">لو سبت الخانة فاضية، هيتولد كود تلقائي وتقدر تطبعه كـ QR</p>
              </div>
            )}
          </div>
        </div>

        {/* ══ بيانات الصنف ══ */}
        <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm p-6 space-y-5">
            <p className="font-black text-slate-900 border-r-4 border-indigo-500 pr-3">بيانات الصنف</p>

          <div>
            <label className="text-xs font-black text-slate-400 mb-1.5 block">القسم</label>
            <div className="grid grid-cols-2 gap-2">
              {PRODUCT_CATEGORIES.map((category) => (
                <button
                  key={category.key}
                  type="button"
                  onClick={() => setForm(f => ({...f, product_category: category.key}))}
                  className={`px-4 py-3 rounded-xl text-sm font-black transition-all ${
                    normalizeProductCategory(form.product_category) === category.key
                      ? "bg-[#0f172a] text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {category.label}
                </button>
              ))}
            </div>
          </div>

          {/* اسم الصنف */}
          <div>
            <label className="text-xs font-black text-slate-400 mb-1.5 block">اسم الصنف *</label>
            <input
              className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-900 outline-none focus:border-indigo-400 transition-all"
              placeholder="اسم الصنف"
              value={form.name}
              onChange={e => setForm(f => ({...f, name: e.target.value}))}
            />
          </div>

          {/* وحدة القياس */}
          <div>
            <label className="text-xs font-black text-slate-400 mb-1.5 block">وحدة القياس</label>
            <div className="flex gap-2 flex-wrap">
              {UNITS.map(u => (
                <button
                  key={u}
                  onClick={() => setForm(f => ({...f, unit: u}))}
                  className={`px-4 py-2 rounded-xl text-sm font-black transition-all ${form.unit === u ? "bg-[#0f172a] text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
                >
                  {u}
                </button>
              ))}
            </div>
          </div>

          {/* الكمية */}
          <div>
            <label className="text-xs font-black text-slate-400 mb-1.5 block">الكمية المتاحة</label>
            <input
              type="number" step="any"
              className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-900 outline-none focus:border-indigo-400 transition-all"
              placeholder="0"
              value={form.stock_quantity}
              onChange={e => setForm(f => ({...f, stock_quantity: e.target.value}))}
            />
          </div>

          {/* الأسعار */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-black text-slate-400 mb-1.5 block">سعر الشراء *</label>
              <input
                type="number" step="any"
                className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-rose-600 outline-none focus:border-rose-400 transition-all"
                placeholder="0"
                value={form.purchase_price}
                onChange={e => setForm(f => ({...f, purchase_price: e.target.value}))}
              />
            </div>
            <div>
              <label className="text-xs font-black text-slate-400 mb-1.5 block">سعر البيع *</label>
              <input
                type="number" step="any"
                className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-emerald-600 outline-none focus:border-emerald-400 transition-all"
                placeholder="0"
                value={form.sale_price}
                onChange={e => setForm(f => ({...f, sale_price: e.target.value}))}
              />
            </div>
          </div>

          {/* هامش الربح live */}
          {margin !== null && (
            <div className={`p-4 rounded-2xl flex items-center gap-3 ${margin >= 15 ? "bg-emerald-50 border border-emerald-200" : margin >= 5 ? "bg-amber-50 border border-amber-200" : "bg-rose-50 border border-rose-200"}`}>
              <span className="text-2xl">{margin >= 15 ? "📈" : margin >= 5 ? "📊" : "⚠️"}</span>
              <div>
                <p className={`font-black text-sm ${margin >= 15 ? "text-emerald-700" : margin >= 5 ? "text-amber-700" : "text-rose-700"}`}>
                  هامش الربح: {margin}%
                </p>
                <p className={`text-xs font-bold ${margin >= 15 ? "text-emerald-600" : margin >= 5 ? "text-amber-600" : "text-rose-600"}`}>
                  {margin >= 15 ? "ممتاز! ربح جيد" : margin >= 5 ? "معقول — يمكن تراجع السعر" : "منخفض — فكر في رفع سعر البيع"}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* ══ زر الحفظ ══ */}
        <button
          onClick={handleSave}
          disabled={saving || !!existingProduct}
          className="w-full bg-[#0f172a] hover:bg-indigo-700 disabled:opacity-50 text-white py-5 rounded-[2rem] font-black text-xl transition-all active:scale-[0.99] shadow-xl"
        >
          {saving ? "⏳ جاري الحفظ..." : "حفظ الصنف ✅"}
        </button>

      </main>

      {/* ══ Modal: QR Label ══ */}
      {showQR && savedProduct && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] p-8 w-full max-w-sm shadow-2xl text-center space-y-5" dir="rtl">
            <div className="text-5xl">🖨️</div>
            <h3 className="text-xl font-black text-slate-900">هل تريد طباعة ملصق QR؟</h3>
            <p className="text-sm text-slate-500 font-bold">
              الكود المولّد: <span className="font-black text-indigo-600 tracking-widest">{savedProduct.barcode}</span>
            </p>
            <p className="text-xs text-slate-400 font-bold">الصقه على الصنف عشان تقدر تسكنه بالكاميرا بعدين</p>

            {/* QR Code مولّد بـ CSS + API */}
            <div className="flex justify-center">
              <div className="bg-white p-3 rounded-2xl border-2 border-slate-200 shadow-inner">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(savedProduct.barcode)}&bgcolor=ffffff&color=0f172a&qzone=1`}
                  alt="QR Code"
                  width={180}
                  height={180}
                  className="rounded-xl"
                />
              </div>
            </div>

            {/* بيانات الملصق */}
            <div className="bg-slate-50 rounded-2xl p-4 text-right space-y-1">
              <p className="font-black text-slate-900">{savedProduct.name}</p>
            <p className="text-xs text-slate-500 font-bold">سعر البيع: {savedProduct.sale_price} ج.م / {savedProduct.unit}</p>
              <p className="text-xs text-slate-500 font-bold">القسم: {productCategoryLabel(savedProduct.product_category)}</p>
            <p className="text-[10px] text-slate-400 font-bold tracking-widest">{savedProduct.barcode}</p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  // فتح الطباعة
                  const printWindow = window.open("", "_blank");
                  if (!printWindow) return;
                  printWindow.document.write(`
                    <html dir="rtl">
                    <head>
                      <title>ملصق QR — ${savedProduct.name}</title>
                      <style>
                        @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@700;900&display=swap');
                        * { margin: 0; padding: 0; box-sizing: border-box; }
                        body { font-family: 'Cairo', sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; background: white; }
                        .label { border: 2px solid #0f172a; border-radius: 16px; padding: 20px; text-align: center; width: 220px; }
                        .label img { width: 160px; height: 160px; }
                        .label h2 { font-size: 14px; font-weight: 900; margin: 8px 0 4px; color: #0f172a; }
                        .label p { font-size: 10px; color: #64748b; font-weight: 700; }
                        .label .code { font-size: 9px; letter-spacing: 2px; color: #94a3b8; margin-top: 4px; }
                      </style>
                    </head>
                    <body>
                      <div class="label">
                        <img src="https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(savedProduct.barcode)}&bgcolor=ffffff&color=0f172a" />
                        <h2>${savedProduct.name}</h2>
                        <p>${savedProduct.sale_price} ج.م / ${savedProduct.unit}</p>
                        <p class="code">${savedProduct.barcode}</p>
                      </div>
                    </body>
                    </html>
                  `);
                  printWindow.document.close();
                  printWindow.print();
                }}
                className="flex-1 bg-[#0f172a] hover:bg-indigo-700 text-white py-4 rounded-2xl font-black transition-all active:scale-95"
              >
                🖨️ طباعة الملصق
              </button>
              <button
                onClick={() => { setShowQR(false); router.push("/inventory"); }}
                className="px-5 py-4 bg-slate-100 text-slate-500 rounded-2xl font-black hover:bg-slate-200 transition-all"
              >
                تخطي
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
