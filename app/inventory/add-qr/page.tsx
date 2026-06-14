"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ProductCategory, normalizeProductCategory, productCategoryLabel } from "@/lib/product-category";
import { barcodeValidationMessage, cleanBarcode, generateInternalBarcode, isPrintableBarcode } from "@/lib/barcode";
import { CategorySelect, useCategoryUnits, useEnabledCategories } from "@/app/category-select";
import { ProductAttributes, ProductCategoryFields, cleanProductAttributes } from "@/app/product-category-fields";
import { formatPriceInput, priceFromPurchase, profitPercentFromPrices, purchaseFromPrice } from "@/lib/pricing";
import { useStaffSession } from "@/app/staff-session";
import { canViewProfitControls } from "@/lib/permissions";

// â”€â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
type ScanMode = "camera" | "manual" | null;

type ExistingProduct = {
  id: string;
  name: string;
  unit?: string | null;
  barcode?: string | null;
  stock_quantity?: number | string | null;
  purchase_price?: number | string | null;
  sale_price?: number | string | null;
  product_category?: ProductCategory | string | null;
  product_attributes?: ProductAttributes | null;
};

function generateCode() {
  return generateInternalBarcode();
}

// â”€â”€â”€ Component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export default function AddProductPage() {
  const router = useRouter();
  const staff = useStaffSession();
  const canViewProfit = canViewProfitControls(staff?.role);
  const enabledCategories = useEnabledCategories();
  const defaultActiveCategory = enabledCategories[0] || "general";

  const [form, setForm] = useState({
    barcode:        "",
    name:           "",
    unit:           "ظ‚ط·ط¹ط©",
    stock_quantity: "",
    purchase_price: "",
    sale_price:     "",
    profit_margin: "25",
     product_category: "general" as ProductCategory,
    product_attributes: {} as ProductAttributes,
  });
  const formUnits = useCategoryUnits(form.product_category);

  const [scanMode, setScanMode]         = useState<ScanMode>(null);
  const [scanning, setScanning]         = useState(false);
  const [scanError, setScanError]       = useState("");
  const [saving, setSaving]             = useState(false);
  const [savedProduct, setSavedProduct] = useState<any>(null); // ظ„ظ„ظ€ QR label
  const [showQR, setShowQR]             = useState(false);
  const [existingProduct, setExistingProduct] = useState<ExistingProduct | null>(null); // ظ„ظˆ ط§ظ„ط¨ط§ط±ظƒظˆط¯ ظ…ظˆط¬ظˆط¯
  const [products, setProducts] = useState<ExistingProduct[]>([]);

  const videoRef    = useRef<HTMLVideoElement>(null);
  const streamRef   = useRef<MediaStream | null>(null);
  const readerRef   = useRef<any>(null);

  // â”€â”€ طھظ†ط¸ظٹظپ ط§ظ„ظƒط§ظ…ظٹط±ط§ ط¹ظ†ط¯ ط§ظ„ط®ط±ظˆط¬ â”€â”€
  useEffect(() => {
    return () => stopCamera();
  }, []);

  useEffect(() => {
    supabase
      .from("products")
      .select("id,name,unit,barcode,stock_quantity,purchase_price,sale_price,product_category,product_attributes")
      .order("name")
      .then(({ data }) => setProducts((data || []) as ExistingProduct[]));
  }, []);

  useEffect(() => {
    if (formUnits.length > 0 && !formUnits.includes(form.unit)) {
      setForm((current) => ({ ...current, unit: formUnits[0] }));
    }
  }, [form.product_category, form.unit, formUnits]);

  useEffect(() => {
    if (enabledCategories.length > 0 && !enabledCategories.includes(form.product_category)) {
      setForm((current) => ({ ...current, product_category: defaultActiveCategory, product_attributes: {} }));
    }
  }, [defaultActiveCategory, enabledCategories, form.product_category]);

  const updatePurchasePrice = (value: string) => {
    setForm((current) => ({
      ...current,
      purchase_price: value,
      sale_price: current.profit_margin !== ""
        ? formatPriceInput(priceFromPurchase(value, current.profit_margin))
        : current.sale_price,
    }));
  };

  const updateSalePrice = (value: string) => {
    setForm((current) => ({
      ...current,
      sale_price: value,
      purchase_price: current.profit_margin !== ""
        ? formatPriceInput(purchaseFromPrice(value, current.profit_margin))
        : current.purchase_price,
    }));
  };

  const updateProfitMargin = (value: string) => {
    setForm((current) => ({
      ...current,
      profit_margin: value,
      sale_price: current.purchase_price
        ? formatPriceInput(priceFromPurchase(current.purchase_price, value))
        : current.sale_price,
      purchase_price: (!current.purchase_price && current.sale_price)
        ? formatPriceInput(purchaseFromPrice(current.sale_price, value))
        : current.purchase_price,
    }));
  };

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
      // طھط­ظ…ظٹظ„ ZXing ط¯ظٹظ†ط§ظ…ظٹظƒظٹط§ظ‹
      const ZXing = await import("@zxing/browser" as any).catch(() => null);
      if (!ZXing) {
        setScanError("ظ…ظƒظˆظ‘ظ† ط§ظ„ظ€ Scanner ط؛ظٹط± ظ…طھط§ط­ط© â€” ط§ط¯ط®ظ„ ط§ظ„ظƒظˆط¯ ظٹط¯ظˆظٹط§ظ‹");
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
      setScanError("طھط¹ط°ط± ط§ظ„ظˆطµظˆظ„ ظ„ظ„ظƒط§ظ…ظٹط±ط§ â€” طھط£ظƒط¯ ظ…ظ† ط§ظ„ط³ظ…ط§ط­ ظ„ظ„ظ…ظˆظ‚ط¹");
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

    // طھط­ظ‚ظ‚ ظ„ظˆ ط§ظ„ظƒظˆط¯ ظ…ظˆط¬ظˆط¯ ظپظٹ ط§ظ„ط£طµظ†ط§ظپ
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

  // â”€â”€ ط­ظپط¸ ط§ظ„طµظ†ظپ â”€â”€
  async function handleSave() {
    if (!form.name.trim())           return alert("ط§ط³ظ… ط§ظ„طµظ†ظپ ظ…ط·ظ„ظˆط¨!");
    if (!form.purchase_price)        return alert("ط³ط¹ط± ط§ظ„ط´ط±ط§ط، ظ…ط·ظ„ظˆط¨!");
    if (!form.sale_price)            return alert("ط³ط¹ط± ط§ظ„ط¨ظٹط¹ ظ…ط·ظ„ظˆط¨!");

    // ظ„ظˆ ظ…ط§ ظپظٹط´ ط¨ط§ط±ظƒظˆط¯ â†’ ظˆظ„ظ‘ط¯ ظƒظˆط¯ طھظ„ظ‚ط§ط¦ظٹ
    const barcode = cleanBarcode(form.barcode) || generateCode();

    if (!isPrintableBarcode(barcode)) {
      return alert(barcodeValidationMessage(barcode));
    }

    const { data: duplicateProduct } = await supabase
      .from("products")
      .select("id,name")
      .eq("barcode", barcode)
      .maybeSingle();

    if (duplicateProduct) {
      setExistingProduct(duplicateProduct);
      return alert(`ط§ظ„ط¨ط§ط±ظƒظˆط¯ ظ…ط³طھط®ط¯ظ… ط¨ط§ظ„ظپط¹ظ„ ظ…ط¹ ط§ظ„طµظ†ظپ: ${duplicateProduct.name}`);
    }

    setSaving(true);
    try {
      const { data, error } = await supabase.from("products").insert([{
        name:           form.name.trim(),
        unit:           form.unit,
        stock_quantity: Number(form.stock_quantity) || 0,
        purchase_price: Number(form.purchase_price),
        sale_price:     Number(form.sale_price),
        barcode:        barcode,
        product_category: normalizeProductCategory(form.product_category),
        product_attributes: cleanProductAttributes(form.product_category, form.product_attributes),
      }]).select().single();

      if (error) throw error;

      setSavedProduct({ ...data, barcode });

      // ظ„ظˆ ط§ظ„ظƒظˆط¯ ظƒط§ظ† طھظ„ظ‚ط§ط¦ظٹ â†’ ط§ط³ط£ظ„ ط¹ظ† ط§ظ„ط·ط¨ط§ط¹ط©
      if (!form.barcode.trim()) {
        setShowQR(true);
      } else {
        router.push("/inventory");
      }
    } catch (e: any) {
      // ظ„ظˆ ط§ظ„ظ€ barcode column ظ…ط´ ظ…ظˆط¬ظˆط¯ ظپظٹ ط§ظ„ط¯ط§طھط§ط¨ظٹط²طŒ ط§ط­ظپط¸ ط¨ط¯ظˆظ†ظ‡
      if (e?.message?.includes("barcode")) {
        const { data, error2 } = await supabase.from("products").insert([{
          name:           form.name.trim(),
          unit:           form.unit,
          stock_quantity: Number(form.stock_quantity) || 0,
          purchase_price: Number(form.purchase_price),
        sale_price:     Number(form.sale_price),
        product_category: normalizeProductCategory(form.product_category),
        product_attributes: cleanProductAttributes(form.product_category, form.product_attributes),
      }]).select().single() as any;
        if (!error2 && data) {
          setSavedProduct({ ...data, barcode: generateCode() });
          setShowQR(!form.barcode.trim());
          if (form.barcode.trim()) router.push("/inventory");
        } else {
          alert("ط®ط·ط£ ظپظٹ ط§ظ„ط­ظپط¸");
        }
      } else {
        alert("ط®ط·ط£ ظپظٹ ط§ظ„ط­ظپط¸: " + e?.message);
      }
    } finally {
      setSaving(false);
    }
  }

  const marginValue = form.purchase_price && form.sale_price
    ? profitPercentFromPrices(form.purchase_price, form.sale_price)
    : null;
  const margin = typeof marginValue === "number" ? marginValue : null;

  const productNameSuggestions = products
    .filter((product) => {
      const name = form.name.trim().toLowerCase();
      return name.length >= 2 && product.name.toLowerCase().includes(name);
    })
    .slice(0, 5);

  return (
    <div className="min-h-screen bg-[#f1f5f9] text-right font-sans text-slate-900 pb-16" dir="rtl">

      {/* â•گâ•گ Header â•گâ•گ */}
      <header className="bg-[#0f172a] text-white p-5 shadow-xl sticky top-0 z-40 mb-6">
        <div className="max-w-xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Link href="/inventory" className="bg-white/10 hover:bg-white/20 px-4 py-2 rounded-xl text-xs font-black transition-all">â¬…ï¸ڈ ط±ط¬ظˆط¹</Link>
            <div>
              <h1 className="text-lg font-black">ط¥ط¶ط§ظپط© طµظ†ظپ ط¬ط¯ظٹط¯ ًں“¦</h1>
              <p className="text-[10px] text-slate-400 font-bold mt-0.5">ط³ظƒط§ظ† ط§ظ„ط¨ط§ط±ظƒظˆط¯ ط£ظˆ ط¥ط¯ط®ط§ظ„ ظٹط¯ظˆظٹ</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-xl mx-auto px-4 space-y-5">

        {/* â•گâ•گ ط®ط§ظ†ط© ط§ظ„ط¨ط§ط±ظƒظˆط¯ â•گâ•گ */}
        <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-100">
            <p className="font-black text-slate-900">ظƒظˆط¯ ط§ظ„طµظ†ظپ / ط§ظ„ط¨ط§ط±ظƒظˆط¯</p>
            <p className="text-[10px] text-slate-400 font-bold mt-0.5">ط³ظƒط§ظ† ط¨ط§ظ„ظƒط§ظ…ظٹط±ط§ ط£ظˆ ط§ط¯ط®ظ„ظ‡ ظٹط¯ظˆظٹط§ظ‹ â€” ظ„ظˆ ظپط§ط¶ظٹ ظ‡ظٹطھظˆظ„ط¯ طھظ„ظ‚ط§ط¦ظٹ</p>
          </div>

          <div className="p-5 space-y-4">
            {/* Scanner / Input */}
            <div className="flex gap-3">
              <input
                placeholder="ط§ط³ظƒط§ظ† ط£ظˆ ط§ظƒطھط¨ ط§ظ„ظƒظˆط¯ ظ‡ظ†ط§..."
                className="flex-1 p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-900 outline-none focus:border-indigo-400 transition-all text-sm tracking-widest"
                value={form.barcode}
                onChange={e => handleBarcodeInput(e.target.value)}
              />
              <button
                onClick={scanning ? stopCamera : startCamera}
                className={`px-5 py-4 rounded-2xl font-black text-sm transition-all active:scale-95 ${scanning ? "bg-rose-500 text-white" : "bg-[#0f172a] text-white hover:bg-indigo-700"}`}
              >
                {scanning ? "âڈ¹ ط¥ظٹظ‚ط§ظپ" : "ًں“· ط³ظƒط§ظ†"}
              </button>
            </div>

            {/* Camera View */}
            {scanMode === "camera" && (
              <div className="relative rounded-2xl overflow-hidden bg-black" style={{ aspectRatio: "16/9" }}>
                <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
                {/* ط¥ط·ط§ط± ط§ظ„طھطµظˆظٹط¨ */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-48 h-32 border-2 border-amber-400 rounded-xl opacity-80">
                    <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-amber-400 rounded-tr-xl" />
                    <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-amber-400 rounded-tl-xl" />
                    <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-amber-400 rounded-br-xl" />
                    <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-amber-400 rounded-bl-xl" />
                  </div>
                </div>
                <p className="absolute bottom-3 w-full text-center text-white text-xs font-black">ظˆط¬ظ‘ظ‡ ط§ظ„ظƒط§ظ…ظٹط±ط§ ط¹ظ„ظ‰ ط§ظ„ط¨ط§ط±ظƒظˆط¯</p>
              </div>
            )}

            {/* Error */}
            {scanError && (
              <div className="bg-rose-50 border border-rose-200 text-rose-700 rounded-xl p-3 text-xs font-bold">
                âڑ ï¸ڈ {scanError}
              </div>
            )}

            {/* ظ„ظˆ ط§ظ„ط¨ط§ط±ظƒظˆط¯ ظ…ظˆط¬ظˆط¯ */}
            {existingProduct && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-2">
                <p className="font-black text-amber-800 text-sm">âڑ ï¸ڈ ط§ظ„ظƒظˆط¯ ط¯ظ‡ ظ…ظˆط¬ظˆط¯ ط¨ط§ظ„ظپط¹ظ„ ظپظٹ ط§ظ„ط£طµظ†ط§ظپ!</p>
                <p className="text-xs text-amber-700 font-bold">ط§ظ„طµظ†ظپ: {existingProduct.name} â€” ط§ظ„ظ…طھط§ط­: {existingProduct.stock_quantity} {existingProduct.unit}</p>
                <Link
                  href="/inventory"
                  className="inline-block bg-amber-500 text-white px-4 py-2 rounded-xl text-xs font-black hover:bg-amber-600 transition-all"
                >
                  ط¹ط±ط¶ ط§ظ„طµظ†ظپ ظپظٹ ط§ظ„ط£طµظ†ط§ظپ
                </Link>
              </div>
            )}

            {/* ظ„ظˆ ط§ظ„ط¨ط§ط±ظƒظˆط¯ ظپط§ط¶ظٹ */}
            {!form.barcode && (
              <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3 flex items-center gap-2">
                <span className="text-lg">ًں”–</span>
                <p className="text-xs text-indigo-600 font-bold">ظ„ظˆ ط³ط¨طھ ط§ظ„ط®ط§ظ†ط© ظپط§ط¶ظٹط©طŒ ظ‡ظٹطھظˆظ„ط¯ ظƒظˆط¯ طھظ„ظ‚ط§ط¦ظٹ ظˆطھظ‚ط¯ط± طھط·ط¨ط¹ظ‡ ظƒظ€ QR</p>
              </div>
            )}
          </div>
        </div>

        {/* â•گâ•گ ط¨ظٹط§ظ†ط§طھ ط§ظ„طµظ†ظپ â•گâ•گ */}
        <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm p-6 space-y-5">
            <p className="font-black text-slate-900 border-r-4 border-indigo-500 pr-3">ط¨ظٹط§ظ†ط§طھ ط§ظ„طµظ†ظپ</p>

          <CategorySelect
            value={normalizeProductCategory(form.product_category)}
            onChange={(category) => setForm(f => ({...f, product_category: category, product_attributes: {}}))}
          />

          <ProductCategoryFields
            category={normalizeProductCategory(form.product_category)}
            value={form.product_attributes}
            onChange={(attributes) => setForm(f => ({...f, product_attributes: attributes}))}
          />

          {/* ط§ط³ظ… ط§ظ„طµظ†ظپ */}
          <div>
            <label className="text-xs font-black text-slate-400 mb-1.5 block">ط§ط³ظ… ط§ظ„طµظ†ظپ *</label>
            <input
              className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-900 outline-none focus:border-indigo-400 transition-all"
              placeholder="ط§ط³ظ… ط§ظ„طµظ†ظپ"
              value={form.name}
              onChange={e => setForm(f => ({...f, name: e.target.value}))}
            />
            {productNameSuggestions.length > 0 && (
              <div className="mt-2 rounded-2xl border border-amber-200 bg-amber-50 p-2">
                <p className="px-2 pb-1 text-[10px] font-black text-amber-700">ط£طµظ†ط§ظپ ظ…ط´ط§ط¨ظ‡ط© ظ…ط³ط¬ظ„ط© ظ‚ط¨ظ„ ظƒط¯ظ‡</p>
                <div className="space-y-1">
                  {productNameSuggestions.map((product) => (
                    <button
                      key={product.id}
                      type="button"
                      onClick={() => {
                        setExistingProduct(product);
                        setForm((current) => ({
                          ...current,
                          name: product.name,
                          unit: product.unit || current.unit,
                        purchase_price: String(product.purchase_price || ""),
                        sale_price: String(product.sale_price || ""),
                        profit_margin: formatPriceInput(profitPercentFromPrices(product.purchase_price, product.sale_price)),
                        product_category: normalizeProductCategory(product.product_category),
                          product_attributes: product.product_attributes || {},
                      }));
                      }}
                      className="w-full rounded-xl bg-white px-3 py-2 text-right text-xs font-black text-slate-700 hover:bg-amber-100"
                    >
                      {product.name}
                      <span className="mr-2 font-bold text-slate-400">
                        {product.stock_quantity || 0} {product.unit || "ظˆط­ط¯ط©"} - {productCategoryLabel(product.product_category)}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ظˆط­ط¯ط© ط§ظ„ظ‚ظٹط§ط³ */}
          <div>
            <label className="text-xs font-black text-slate-400 mb-1.5 block">ظˆط­ط¯ط© ط§ظ„ظ‚ظٹط§ط³</label>
            <div className="flex gap-2 flex-wrap">
              {[...new Set([...(formUnits || []), form.unit])].filter(Boolean).map(u => (
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

          {/* ط§ظ„ظƒظ…ظٹط© */}
          <div>
            <label className="text-xs font-black text-slate-400 mb-1.5 block">ط§ظ„ظƒظ…ظٹط© ط§ظ„ظ…طھط§ط­ط©</label>
            <input
              type="number" step="any"
              className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-900 outline-none focus:border-indigo-400 transition-all"
              placeholder="0"
              value={form.stock_quantity}
              onChange={e => setForm(f => ({...f, stock_quantity: e.target.value}))}
            />
          </div>

          {/* ط§ظ„ط£ط³ط¹ط§ط± */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-black text-slate-400 mb-1.5 block">ط³ط¹ط± ط§ظ„ط´ط±ط§ط، *</label>
              <input
                type="number" step="any"
                className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-rose-600 outline-none focus:border-rose-400 transition-all"
                placeholder="0"
                value={form.purchase_price}
                onChange={e => updatePurchasePrice(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-black text-slate-400 mb-1.5 block">ط³ط¹ط± ط§ظ„ط¨ظٹط¹ *</label>
              <input
                type="number" step="any"
                className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-emerald-600 outline-none focus:border-emerald-400 transition-all"
                placeholder="0"
                value={form.sale_price}
                onChange={e => updateSalePrice(e.target.value)}
              />
            </div>
          </div>

          {/* ظ‡ط§ظ…ط´ ط§ظ„ط±ط¨ط­ live */}
          {canViewProfit && (
                          <label className="flex items-center gap-2 rounded-2xl bg-emerald-50 px-4 py-3">
                  <span className="text-xs font-black text-emerald-700">نسبة المكسب</span>
                  <input
                    type="number"
                    step="any"
                    value={form.profit_margin}
                    onChange={e => updateProfitMargin(e.target.value)}
                    className="min-w-0 flex-1 bg-transparent text-center text-sm font-black text-emerald-700 outline-none"
                    placeholder="%"
                  />
                  <span className="text-xs font-black text-emerald-700">%</span>
                </label>
          )}
{canViewProfit && margin !== null && (
            <div className={`p-4 rounded-2xl flex items-center gap-3 ${margin >= 15 ? "bg-emerald-50 border border-emerald-200" : margin >= 5 ? "bg-amber-50 border border-amber-200" : "bg-rose-50 border border-rose-200"}`}>
              <span className="text-2xl">{margin >= 15 ? "ًں“ˆ" : margin >= 5 ? "ًں“ٹ" : "âڑ ï¸ڈ"}</span>
              <div>
                <p className={`font-black text-sm ${margin >= 15 ? "text-emerald-700" : margin >= 5 ? "text-amber-700" : "text-rose-700"}`}>
                  ظ‡ط§ظ…ط´ ط§ظ„ط±ط¨ط­: {margin}%
                </p>
                <p className={`text-xs font-bold ${margin >= 15 ? "text-emerald-600" : margin >= 5 ? "text-amber-600" : "text-rose-600"}`}>
                  {margin >= 15 ? "ظ…ظ…طھط§ط²! ط±ط¨ط­ ط¬ظٹط¯" : margin >= 5 ? "ظ…ط¹ظ‚ظˆظ„ â€” ظٹظ…ظƒظ† طھط±ط§ط¬ط¹ ط§ظ„ط³ط¹ط±" : "ظ…ظ†ط®ظپط¶ â€” ظپظƒط± ظپظٹ ط±ظپط¹ ط³ط¹ط± ط§ظ„ط¨ظٹط¹"}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* â•گâ•گ ط²ط± ط§ظ„ط­ظپط¸ â•گâ•گ */}
        <button
          onClick={handleSave}
          disabled={saving || !!existingProduct}
          className="w-full bg-[#0f172a] hover:bg-indigo-700 disabled:opacity-50 text-white py-5 rounded-[2rem] font-black text-xl transition-all active:scale-[0.99] shadow-xl"
        >
          {saving ? "âڈ³ ط¬ط§ط±ظٹ ط§ظ„ط­ظپط¸..." : "ط­ظپط¸ ط§ظ„طµظ†ظپ âœ…"}
        </button>

      </main>

      {/* â•گâ•گ Modal: QR Label â•گâ•گ */}
      {showQR && savedProduct && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] p-8 w-full max-w-sm shadow-2xl text-center space-y-5" dir="rtl">
            <div className="text-5xl">ًں–¨ï¸ڈ</div>
            <h3 className="text-xl font-black text-slate-900">ظ‡ظ„ طھط±ظٹط¯ ط·ط¨ط§ط¹ط© ظ…ظ„طµظ‚ QRطں</h3>
            <p className="text-sm text-slate-500 font-bold">
              ط§ظ„ظƒظˆط¯ ط§ظ„ظ…ظˆظ„ظ‘ط¯: <span className="font-black text-indigo-600 tracking-widest">{savedProduct.barcode}</span>
            </p>
            <p className="text-xs text-slate-400 font-bold">ط§ظ„طµظ‚ظ‡ ط¹ظ„ظ‰ ط§ظ„طµظ†ظپ ط¹ط´ط§ظ† طھظ‚ط¯ط± طھط³ظƒظ†ظ‡ ط¨ط§ظ„ظƒط§ظ…ظٹط±ط§ ط¨ط¹ط¯ظٹظ†</p>

            {/* QR Code ظ…ظˆظ„ظ‘ط¯ ط¨ظ€ CSS + API */}
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

            {/* ط¨ظٹط§ظ†ط§طھ ط§ظ„ظ…ظ„طµظ‚ */}
            <div className="bg-slate-50 rounded-2xl p-4 text-right space-y-1">
              <p className="font-black text-slate-900">{savedProduct.name}</p>
            <p className="text-xs text-slate-500 font-bold">ط³ط¹ط± ط§ظ„ط¨ظٹط¹: {savedProduct.sale_price} ط¬.ظ… / {savedProduct.unit}</p>
              <p className="text-xs text-slate-500 font-bold">ط§ظ„ظ‚ط³ظ…: {productCategoryLabel(savedProduct.product_category)}</p>
            <p className="text-[10px] text-slate-400 font-bold tracking-widest">{savedProduct.barcode}</p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  // ظپطھط­ ط§ظ„ط·ط¨ط§ط¹ط©
                  const printWindow = window.open("", "_blank");
                  if (!printWindow) return;
                  printWindow.document.write(`
                    <html dir="rtl">
                    <head>
                      <title>ظ…ظ„طµظ‚ QR â€” ${savedProduct.name}</title>
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
                        <p>${savedProduct.sale_price} ط¬.ظ… / ${savedProduct.unit}</p>
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
                ًں–¨ï¸ڈ ط·ط¨ط§ط¹ط© ط§ظ„ظ…ظ„طµظ‚
              </button>
              <button
                onClick={() => { setShowQR(false); router.push("/inventory"); }}
                className="px-5 py-4 bg-slate-100 text-slate-500 rounded-2xl font-black hover:bg-slate-200 transition-all"
              >
                طھط®ط·ظٹ
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
