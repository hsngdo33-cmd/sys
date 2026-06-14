"use client";
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ProductCategory, normalizeProductCategory, productCategoryLabel } from "@/lib/product-category";
import { barcodeValidationMessage, cleanBarcode, generateInternalBarcode, isPrintableBarcode } from "@/lib/barcode";
import { CategorySelect, useCategoryUnits, useEnabledCategories } from "@/app/category-select";
import { ProductAttributes, ProductCategoryFields, cleanProductAttributes } from "@/app/product-category-fields";
import { recordStaffActivity } from "@/app/staff-activity";
import { useStaffSession } from "@/app/staff-session";
import { calculateInvoiceTax, paperSizeCss, useBusinessSettings } from "@/app/business-settings";
import { conversionFactorForUnit, hasKnownConversion, invoiceUnitsForBaseUnit, manualConversionHint, productUnitConversions, UnitConversion, unitConversionsForBaseUnit, withProductUnitConversion } from "@/lib/category-settings";
import { formatPriceInput, priceFromPurchase, profitPercentFromPrices, purchaseFromPrice } from "@/lib/pricing";
import { canViewProfitControls } from "@/lib/permissions";

interface Product {
  id: string; name: string; unit: string;
  purchase_price: number; sale_price: number; stock_quantity: number;
  barcode?: string | null;
  product_category?: ProductCategory | string | null;
  product_attributes?: ProductAttributes | null;
}
interface CartItem extends Product {
  qty: number | string;
  p_price: number | string;
  invoiceUnit: string;
  unitFactor: number;
  manualUnitFactor?: boolean;
}

interface Supplier {
  id: string;
  name: string;
  balance?: number;
}

export default function SupplierInvoicePage() {
  const { id } = useParams();
  const router  = useRouter();
  const staff = useStaffSession();
  const operatorName = staff?.name || "الكاشير";
  const canViewProfit = canViewProfitControls(staff?.role);
  const { settings: businessSettings } = useBusinessSettings();

  const [supplier, setSupplier]     = useState<Supplier | null>(null);
  const [products, setProducts]     = useState<Product[]>([]);
  const [activeCategory, setActiveCategory] = useState<ProductCategory>("general");
  const enabledCategories = useEnabledCategories();
  const defaultActiveCategory = enabledCategories[0] || "general";
  const [cart, setCart]             = useState<CartItem[]>([]);
  const [cashPaid, setCashPaid]     = useState<number | string>(0);
  const [discountPercent, setDiscountPercent] = useState<number | string>(0);
  const [searchTerm, setSearchTerm] = useState("");
  const [isSaving, setIsSaving]     = useState(false);
  const [note, setNote]             = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [showNewProductUnitConversions, setShowNewProductUnitConversions] = useState(false);
  const [newProd, setNewProd]       = useState({ name: "", unit: "قطعة", purchase_price: "", sale_price: "", profit_margin: "25", product_category: "general" as ProductCategory, product_attributes: {} as ProductAttributes });
  const newProdUnits = useCategoryUnits(newProd.product_category);
  const [addingSaving, setAddingSaving] = useState(false);
  const [newProdBarcode, setNewProdBarcode] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
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
       
      loadData();
    }
  }, [id, loadData]);

  useEffect(() => {
    if (enabledCategories.length > 0 && !enabledCategories.includes(activeCategory)) {
      setActiveCategory(defaultActiveCategory);
      setCart([]);
      setSearchTerm("");
      setNewProd((current) => ({ ...current, product_category: defaultActiveCategory, product_attributes: {} }));
    }
  }, [activeCategory, defaultActiveCategory, enabledCategories]);

  useEffect(() => {
    if (enabledCategories.length > 0 && !enabledCategories.includes(newProd.product_category)) {
      setNewProd((current) => ({ ...current, product_category: defaultActiveCategory, product_attributes: {} }));
    }
  }, [defaultActiveCategory, enabledCategories, newProd.product_category]);

  const filteredProducts = useMemo(() =>
    products.filter(p =>
      normalizeProductCategory(p.product_category) === activeCategory &&
      (p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cleanBarcode(p.barcode).includes(searchTerm))
    ),
    [products, searchTerm, activeCategory]
  );

  const addToCart = (p: Product) => {
    if (cart.find(i => i.id === p.id)) return;
    setCart(prev => [...prev, { ...p, qty: 1, p_price: p.purchase_price, invoiceUnit: p.unit, unitFactor: 1, manualUnitFactor: false }]);
  };

  const handleBarcodeEntry = (value: string) => {
    const barcode = cleanBarcode(value);

    if (!barcode) return;

    const found = products.find(p =>
      normalizeProductCategory(p.product_category) === activeCategory &&
      cleanBarcode(p.barcode) === barcode
    );

    if (found) {
      addToCart(found);
      setSearchTerm(barcode);
      return;
    }

    setNewProdBarcode(barcode);
    setNewProd((current) => ({ ...current, product_category: activeCategory, product_attributes: {} }));
    setShowNewProductUnitConversions(false);
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

  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (newProdUnits.length > 0 && !newProdUnits.includes(newProd.unit)) {
      setNewProd((current) => ({ ...current, unit: newProdUnits[0] }));
    }
  }, [newProd.product_category, newProd.unit, newProdUnits]);

  const removeFromCart = (pid: string) => setCart(prev => prev.filter(i => i.id !== pid));

  const updateCart = (pid: string, field: "qty" | "p_price", val: string) =>
    setCart(prev => prev.map(i => i.id === pid ? { ...i, [field]: val } : i));

  const updateCartUnit = (pid: string, unit: string) =>
    setCart(prev => prev.map((item) => {
      if (item.id !== pid) return item;
      const productConversions = productUnitConversions(item.product_attributes);
      const factor = conversionFactorForUnit(item.product_category, unit, item.unit, undefined, productConversions);
      const manualUnitFactor = !hasKnownConversion(item.product_category, unit, item.unit, undefined, productConversions);
      return {
        ...item,
        invoiceUnit: unit,
        unitFactor: factor,
        manualUnitFactor,
        p_price: Number(item.purchase_price || 0) * factor,
      };
    }));

  const updateCartUnitFactor = (pid: string, factorValue: string) =>
    setCart(prev => prev.map((item) => {
      if (item.id !== pid) return item;
      const factor = Math.max(Number(factorValue) || 1, 0.001);
      return {
        ...item,
        unitFactor: factor,
        manualUnitFactor: true,
        p_price: Number(item.purchase_price || 0) * factor,
      };
    }));

  const invoiceUnitOptions = (item: CartItem) =>
    invoiceUnitsForBaseUnit(item.product_category, item.unit, item.product_attributes, item.invoiceUnit);

  const newProductUnitConversions = () =>
    unitConversionsForBaseUnit(newProd.product_category, newProd.unit, newProd.product_attributes);

  const newProductUnitOptions = () => [
    ...new Set([
      newProd.unit,
      ...(newProdUnits || []),
      ...invoiceUnitsForBaseUnit(newProd.product_category, newProd.unit, newProd.product_attributes, newProd.unit),
      ...newProductUnitConversions().flatMap((conversion) => [conversion.fromUnit, conversion.toUnit]),
    ]),
  ].filter(Boolean);

  const updateNewProductUnitConversions = (nextConversions: UnitConversion[]) => {
    const current = newProd.product_attributes && typeof newProd.product_attributes === "object" ? newProd.product_attributes : {};
    const relatedKeys = new Set(newProductUnitConversions().map((conversion) => `${conversion.fromUnit}__${conversion.toUnit}`));
    const hiddenConversions = productUnitConversions(current).filter(
      (conversion) => !relatedKeys.has(`${conversion.fromUnit}__${conversion.toUnit}`),
    );
    setNewProd({
      ...newProd,
      product_attributes: {
        ...current,
        unit_conversions: [...hiddenConversions, ...nextConversions],
      },
    });
  };

  const productAttributesWithCurrentUnitConversions = () => {
    const current = newProd.product_attributes && typeof newProd.product_attributes === "object" ? newProd.product_attributes : {};
    return {
      ...current,
      unit_conversions: [
        ...productUnitConversions(current),
        ...newProductUnitConversions().filter((conversion) => {
          const key = `${conversion.fromUnit}__${conversion.toUnit}`;
          return !productUnitConversions(current).some((saved) => `${saved.fromUnit}__${saved.toUnit}` === key);
        }),
      ],
    };
  };

  const renderNewProductUnitConversionsSummary = () => {
    const conversions = newProductUnitConversions().slice(0, 4);

    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5 lg:col-span-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-black text-slate-900">تحويلات الوحدات</p>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {conversions.length === 0 ? (
                <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-black text-slate-400 shadow-sm">
                  مفيش تحويلات افتراضية
                </span>
              ) : conversions.map((conversion) => (
                <span key={`supplier-new-unit-summary-${conversion.id}`} className="rounded-full bg-white px-2 py-0.5 text-[10px] font-black text-slate-600 shadow-sm">
                  {conversion.fromUnit} = {conversion.factor} {conversion.toUnit}
                </span>
              ))}
              {newProductUnitConversions().length > conversions.length && (
                <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-black text-amber-700">
                  +{newProductUnitConversions().length - conversions.length}
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowNewProductUnitConversions((current) => !current)}
            className="h-9 shrink-0 rounded-xl bg-slate-900 px-3 text-xs font-black text-white hover:bg-slate-700"
          >
            {showNewProductUnitConversions ? "إخفاء التفاصيل" : "تعديل التحويلات"}
          </button>
        </div>
      </div>
    );
  };

  const renderNewProductUnitConversionsEditor = () => {
    const conversions = newProductUnitConversions();
    const unitOptions = newProductUnitOptions();
    const defaultFromUnit = ["كرتونة", "علبة", "عبوة", "دستة"].find((unit) => unitOptions.includes(unit) && unit !== newProd.unit) || unitOptions.find((unit) => unit !== newProd.unit) || "كرتونة";
    const defaultToUnit = unitOptions.includes(newProd.unit) ? newProd.unit : unitOptions.find((unit) => unit !== defaultFromUnit) || "قطعة";
    const defaultFactor = defaultFromUnit === "كرتونة" || defaultFromUnit === "دستة" ? 12 : 1;

    return (
      <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3 lg:col-span-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div>
            <p className="text-xs font-black text-slate-900">قواعد التحويل</p>
            <p className="mt-0.5 text-[10px] font-bold text-slate-400">اختار الوحدة الكبيرة وقيمتها من الوحدة الأصغر.</p>
          </div>
          <button
            type="button"
            onClick={() => updateNewProductUnitConversions([...conversions, { id: `supplier-new-conversion-${Date.now()}`, fromUnit: defaultFromUnit, toUnit: defaultToUnit, factor: defaultFactor }])}
            className="rounded-full bg-slate-900 px-3 py-1.5 text-[10px] font-black text-white hover:bg-slate-700"
          >
            + تحويل
          </button>
        </div>
        <div className="max-h-52 space-y-2 overflow-y-auto pr-1">
          {conversions.length === 0 ? (
            <div className="rounded-xl bg-white px-3 py-2 text-xs font-bold text-slate-400">
              مفيش تحويلات للوحدة دي. اضغط + تحويل لإضافة قاعدة جديدة.
            </div>
          ) : conversions.map((conversion, index) => (
            <div key={conversion.id || index} className="grid items-center gap-2 rounded-xl border border-slate-100 bg-white p-2 sm:grid-cols-[auto_1fr_auto_86px_1fr_auto]">
              <span className="hidden text-[10px] font-black text-slate-400 sm:inline">كل</span>
              <select
                value={conversion.fromUnit}
                onChange={(event) => {
                  const next = [...conversions];
                  next[index] = { ...conversion, fromUnit: event.target.value };
                  updateNewProductUnitConversions(next);
                }}
                className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs font-bold text-slate-900 outline-none focus:border-slate-400"
              >
                {unitOptions.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
              </select>
              <span className="hidden text-center text-sm font-black text-slate-400 sm:inline">=</span>
              <input
                type="number"
                min={0.001}
                step="any"
                value={conversion.factor}
                onChange={(event) => {
                  const next = [...conversions];
                  next[index] = { ...conversion, factor: Math.max(Number(event.target.value) || 1, 0.001) };
                  updateNewProductUnitConversions(next);
                }}
                className="h-9 w-full rounded-lg border border-slate-200 px-2 text-center text-xs font-black text-slate-900 outline-none focus:border-slate-400"
              />
              <select
                value={conversion.toUnit}
                onChange={(event) => {
                  const next = [...conversions];
                  next[index] = { ...conversion, toUnit: event.target.value };
                  updateNewProductUnitConversions(next);
                }}
                className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs font-bold text-slate-900 outline-none focus:border-slate-400"
              >
                {unitOptions.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
              </select>
              <button
                type="button"
                onClick={() => updateNewProductUnitConversions(conversions.filter((_, currentIndex) => currentIndex !== index))}
                className="h-9 rounded-lg bg-rose-50 px-3 text-xs font-black text-rose-600 hover:bg-rose-100"
              >
                حذف
              </button>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const updateNewProdPurchasePrice = (value: string) => {
    setNewProd((current) => ({
      ...current,
      purchase_price: value,
      sale_price: current.profit_margin !== ""
        ? formatPriceInput(priceFromPurchase(value, current.profit_margin))
        : current.sale_price,
    }));
  };

  const updateNewProdSalePrice = (value: string) => {
    setNewProd((current) => ({
      ...current,
      sale_price: value,
      purchase_price: current.profit_margin !== ""
        ? formatPriceInput(purchaseFromPrice(value, current.profit_margin))
        : current.purchase_price,
    }));
  };

  const updateNewProdProfitMargin = (value: string) => {
    setNewProd((current) => ({
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

  const subtotalInvoice = cart.reduce((s, i) => s + Number(i.qty || 0) * Number(i.p_price || 0), 0);
  const discountRate = Math.min(Math.max(Number(discountPercent) || 0, 0), 100);
  const discountAmount = subtotalInvoice * (discountRate / 100);
  const netBeforeTax = Math.max(subtotalInvoice - discountAmount, 0);
  const taxInfo = calculateInvoiceTax(netBeforeTax, businessSettings.tax_mode);
  const taxAmount = taxInfo.taxAmount;
  const totalInvoice = taxInfo.totalWithTax;
  const purchasePriceFactor = subtotalInvoice > 0 ? taxInfo.taxableSales / subtotalInvoice : 1;
  const cash         = Number(cashPaid) || 0;
  const remaining    = totalInvoice - cash;
  const printPageSize = paperSizeCss(businessSettings.invoice_paper_size);


  async function handleAddNewProduct() {
    if (!newProd.name.trim() || !newProd.purchase_price) return alert("اكمل البيانات!");
    const barcode = cleanBarcode(newProdBarcode) || generateInternalBarcode(products.map(product => product.barcode));

    if (!isPrintableBarcode(barcode)) {
      return alert(barcodeValidationMessage(barcode));
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
      product_category: normalizeProductCategory(newProd.product_category),
      product_attributes: cleanProductAttributes(newProd.product_category, productAttributesWithCurrentUnitConversions()),
    }]).select().single();
    if (data) {
      setProducts(prev => [...prev, data]);
      addToCart(data);
      setShowNewProductUnitConversions(false);
      setShowAddModal(false);
      setNewProdBarcode("");
      setNewProd({ name: "", unit: "قطعة", purchase_price: "", sale_price: "", profit_margin: "25", product_category: activeCategory, product_attributes: {} });
    }
    setAddingSaving(false);
  }

  async function saveInvoice(printAfterSave = false) {
    if (!supplier) return alert("بيانات المورد لم تحمل بعد");
    if (cart.length === 0) return alert("الفاتورة فارغة!");
    setIsSaving(true);
    try {
      const { data: invoice, error: invoiceError } = await supabase.from("transactions").insert([{
        supplier_id: id,
        amount: totalInvoice,
        type: "فاتورة توريد",
        items: cart.map(i => ({
          id: i.id,
          name: i.name,
          unit: i.unit,
          invoice_unit: i.invoiceUnit,
          unit_factor: Number(i.unitFactor || 1),
          qty: Number(i.qty),
          stock_qty: Number(i.qty) * Number(i.unitFactor || 1),
          price: Number(i.p_price),
          net_price: Number((Number(i.p_price || 0) * purchasePriceFactor).toFixed(2)),
          product_category: normalizeProductCategory(i.product_category),
        })),
        description: note || `توريد ${productCategoryLabel(activeCategory)} من ${supplier?.name}${discountRate > 0 ? ` - خصم ${discountRate}%` : ""}${taxAmount > 0 ? ` - ${taxInfo.label}` : ""}`,
      }]).select("id").single();
      if (invoiceError) throw invoiceError;

      if (cash > 0) {
        await supabase.from("transactions").insert([{
          supplier_id: id, amount: cash, type: "سداد نقدي", description: "دفعة من الفاتورة",
        }]);
      }

      await supabase.from("suppliers")
        .update({ balance: (supplier.balance || 0) + remaining })
        .eq("id", id);

      for (const item of cart) {
        const basePurchasePrice = Number(((Number(item.p_price || 0) * purchasePriceFactor) / Number(item.unitFactor || 1)).toFixed(2));
        const currentProfitMargin = profitPercentFromPrices(item.purchase_price, item.sale_price);
        const currentProfitMarginValue = Number(currentProfitMargin);
        const nextProfitMargin = Number.isFinite(currentProfitMarginValue) && currentProfitMarginValue > 0
          ? currentProfitMargin
          : "25";
        const nextSalePrice = Number(formatPriceInput(priceFromPurchase(basePurchasePrice, nextProfitMargin)));
        const nextAttributes = item.manualUnitFactor && item.invoiceUnit !== item.unit
          ? withProductUnitConversion(item.product_attributes, {
              fromUnit: item.invoiceUnit,
              toUnit: item.unit,
              factor: Number(item.unitFactor || 1),
            })
          : item.product_attributes;

        await supabase.rpc("increment_stock", { row_id: item.id, amount: Number(item.qty) * Number(item.unitFactor || 1) });
        await supabase
          .from("products")
          .update({ purchase_price: basePurchasePrice, sale_price: nextSalePrice, product_attributes: nextAttributes || {} })
          .eq("id", item.id);
      }

      await supabase.from("inventory_movements").insert(
        cart.map((item) => {
          const before = Number(item.stock_quantity || 0);
          const quantity = Math.abs(Number(item.qty || 0) * Number(item.unitFactor || 1));
          return {
            product_id: item.id,
            movement_type: "purchase",
            quantity,
            quantity_before: before,
            quantity_after: before + quantity,
            unit_cost: Number(((Number(item.p_price || 0) * purchasePriceFactor) / Number(item.unitFactor || 1)).toFixed(2)),
            source_type: "supplier_invoice",
            source_id: invoice?.id?.toString(),
            note: `فاتورة توريد - ${supplier.name}`,
            created_by: operatorName,
          };
        }),
      );

      await recordStaffActivity({
        staff,
        action: "supplier_invoice_saved",
        entityType: "supplier_invoice",
        entityId: invoice?.id,
        note: `فاتورة توريد - ${supplier.name} - ${totalInvoice.toLocaleString("ar-EG")} ج`,
      });

      if (printAfterSave) {
        window.print();
        window.setTimeout(() => router.push("/suppliers"), 300);
      } else {
        router.push("/suppliers");
      }
    } catch { alert("خطأ في الحفظ"); }
    finally { setIsSaving(false); }
  }

  return (
    <div className="min-h-screen bg-[#f1f5f9] text-right font-sans text-slate-900 pb-10" dir="rtl">

      {/* ══ Header ══ */}
      <header className="bg-[#0f172a] text-white px-5 py-4 flex justify-between items-center shadow-xl sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <Link href="/suppliers" className="bg-white/10 hover:bg-white/20 px-4 py-2 rounded-xl text-xs font-black transition-all">⬅️ رجوع</Link>
          <div>
            <h1 className="text-lg font-black">📥 فاتورة توريد {productCategoryLabel(activeCategory)}: {supplier?.name || "جاري تحميل المورد"}</h1>
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
            مديونية: {supplier ? supplier.balance?.toLocaleString("ar-EG") : "..."} ج.م
          </div>
        </div>
      </header>

      <main className="app-invoice-layout max-w-[1500px] mx-auto p-4 mt-3">

        {/* ══ قائمة الأصناف ══ */}
        <aside className="app-invoice-sidebar bg-white border border-slate-200 shadow-sm flex flex-col">
          <div className="p-4 border-b border-slate-100 space-y-3">
            <h3 className="font-black text-slate-400 text-[10px] uppercase tracking-widest">📦 اختيار الأصناف</h3>
            <CategorySelect
              value={activeCategory}
              label="قسم الشراء"
              variant="cards"
              onChange={(category) => {
                setActiveCategory(category);
                setCart([]);
                setSearchTerm("");
                setNewProd((prev) => ({ ...prev, product_category: category, product_attributes: {} }));
              }}
            />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="🔍 ابحث..."
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-900 outline-none focus:border-indigo-400 transition-all text-sm"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter" || e.key === "Tab") {
                  e.preventDefault();
                  handleBarcodeEntry(searchTerm);
                }
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
              onClick={() => {
                setNewProd((prev) => ({ ...prev, product_category: activeCategory, product_attributes: {} }));
                setShowNewProductUnitConversions(false);
                setShowAddModal(true);
              }}
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
                  className={`p-3 rounded-xl border flex justify-between items-center transition-all
                    ${inCart
                      ? "border-amber-300 bg-amber-50 cursor-default"
                      : "border-slate-100 hover:border-amber-400 hover:bg-slate-50 cursor-pointer"}`}
                >
                  <div>
                    <p className="font-black text-slate-900 text-sm">{p.name}</p>
                    <p className="text-[10px] font-bold text-slate-400 mt-0.5">
                      شراء: {p.purchase_price} ج — مخزن: {p.stock_quantity} {p.unit} — {productCategoryLabel(p.product_category)}
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
        <section className="min-w-0">
          <div className="app-invoice-table bg-white border border-slate-200 shadow-sm overflow-auto">
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
                    <th className="p-4 text-center">الوحدة</th>
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
                          <select
                            value={item.invoiceUnit || item.unit}
                            onChange={(event) => updateCartUnit(item.id, event.target.value)}
                            className="w-24 rounded-xl border border-slate-200 bg-slate-50 p-2 text-center text-xs font-black outline-none focus:border-amber-400"
                          >
                            {invoiceUnitOptions(item).map((unit) => (
                              <option key={unit} value={unit}>{unit}</option>
                            ))}
                          </select>
                          {item.manualUnitFactor && (
                            <label className="mt-2 block">
                              <span className="mb-1 block text-[9px] font-black text-amber-600">
                                {manualConversionHint(item.invoiceUnit, item.unit)}
                              </span>
                              <input
                                type="number"
                                min={0.001}
                                step="any"
                                value={item.unitFactor}
                                onChange={(event) => updateCartUnitFactor(item.id, event.target.value)}
                                className="w-24 rounded-xl border border-amber-200 bg-amber-50 p-2 text-center text-xs font-black text-amber-700 outline-none focus:border-amber-400"
                              />
                            </label>
                          )}
                          {Number(item.unitFactor || 1) !== 1 && (
                            <p className="mt-1 text-[9px] font-bold text-slate-400">
                              = {(Number(item.qty || 0) * Number(item.unitFactor || 1)).toLocaleString("ar-EG")} {item.unit}
                            </p>
                          )}
                          {Number(item.unitFactor || 1) > 0 && (
                            <p className="mt-1 text-[9px] font-bold text-emerald-600">
                              تكلفة {item.unit}: {(Number(item.p_price || 0) / Number(item.unitFactor || 1)).toLocaleString("ar-EG", { maximumFractionDigits: 2 })} ج
                            </p>
                          )}
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
          <div className="app-invoice-footer bg-[#0f172a] shadow-xl">
            <div className="grid grid-cols-2 gap-3 mb-4 text-white">
              <div>
                <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest mb-1">إجمالي الفاتورة</p>
                <p className="text-xl font-black">{totalInvoice.toLocaleString("ar-EG", { maximumFractionDigits: 2 })} <small className="text-xs opacity-50">ج</small></p>
                {businessSettings.tax_mode !== "none" && (
                  <p className="mt-1 text-[10px] font-bold text-slate-400">
                    {taxInfo.label}: {taxAmount.toLocaleString("ar-EG", { maximumFractionDigits: 2 })} ج
                  </p>
                )}
              </div>
              <div>
                <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest mb-1">دفع كاش</p>
                <input
                  type="number" step="any"
                  value={cashPaid}
                  onChange={e => setCashPaid(e.target.value)}
                  className="bg-white/10 border border-white/20 text-white text-xl font-black w-full rounded-xl px-3 py-1.5 outline-none focus:border-amber-400 transition-all text-center"
                  placeholder="0"
                />
              </div>
              <div>
                <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest mb-1">المتبقي (دين للمورد)</p>
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
                className="app-btn app-btn-warning app-btn-lg w-full"
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
              <p className="print-eyebrow">فاتورة توريد {productCategoryLabel(activeCategory)}</p>
              <h1>منظومة إدارة المحل التجاري</h1>
              <p>إدارة الموردين والأصناف</p>
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
                  <td>{item.invoiceUnit || item.unit}</td>
                  <td>
                    {Number(item.qty || 0).toLocaleString("ar-EG")}
                    {Number(item.unitFactor || 1) !== 1 ? ` = ${(Number(item.qty || 0) * Number(item.unitFactor || 1)).toLocaleString("ar-EG")} ${item.unit}` : ""}
                  </td>
                  <td>{Number(item.p_price || 0).toLocaleString("ar-EG")} ج</td>
                  <td>{(Number(item.qty || 0) * Number(item.p_price || 0)).toLocaleString("ar-EG")} ج</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="print-summary">
            <p><span>الإجمالي قبل الخصم</span><b>{subtotalInvoice.toLocaleString("ar-EG", { maximumFractionDigits: 2 })} ج</b></p>
            <p><span>الخصم ({discountRate}%)</span><b>{discountAmount.toLocaleString("ar-EG", { maximumFractionDigits: 2 })} ج</b></p>
            {businessSettings.tax_mode !== "none" && (
              <p><span>{taxInfo.label}</span><b>{taxAmount.toLocaleString("ar-EG", { maximumFractionDigits: 2 })} ج</b></p>
            )}
            <p><span>الصافي</span><b>{totalInvoice.toLocaleString("ar-EG", { maximumFractionDigits: 2 })} ج</b></p>
            <p><span>المدفوع</span><b>{cash.toLocaleString("ar-EG", { maximumFractionDigits: 2 })} ج</b></p>
            <p className="print-total"><span>المتبقي للمورد</span><b>{remaining.toLocaleString("ar-EG", { maximumFractionDigits: 2 })} ج</b></p>
          </div>
          {note && <p className="print-note">ملاحظة: {note}</p>}
        </div>
      </section>

      {/* ══ Modal: صنف جديد ══ */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-3 sm:p-6" onClick={() => { setShowNewProductUnitConversions(false); setShowAddModal(false); }}>
          <div className="flex max-h-[calc(100vh-2rem)] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="border-b border-slate-100 px-4 py-3 sm:px-5">
              <h3 className="text-lg font-black text-slate-900 sm:text-xl">إضافة صنف جديد</h3>
              <p className="mt-0.5 text-xs font-bold text-slate-400">هيتضاف للمخزن وللفاتورة فورًا</p>
            </div>

            <div className="grid flex-1 gap-3 overflow-y-auto p-4 text-sm sm:p-5 lg:grid-cols-3">
              <input
                className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-bold text-slate-900 outline-none focus:border-slate-400 lg:col-span-2"
                placeholder="اسم الصنف *"
                value={newProd.name}
                onChange={e => setNewProd({...newProd, name: e.target.value})}
                autoFocus
              />

              <CategorySelect
                value={normalizeProductCategory(newProd.product_category)}
                onChange={(category) => setNewProd({...newProd, product_category: category, product_attributes: {}, unit: newProdUnits[0] || newProd.unit})}
              />
              <ProductCategoryFields
                category={normalizeProductCategory(newProd.product_category)}
                value={newProd.product_attributes}
                onChange={(attributes) => setNewProd({...newProd, product_attributes: attributes})}
                className="lg:col-span-3"
                includeDefaultFields={false}
              />

              <input
                className="h-11 w-full rounded-xl border border-slate-200 px-3 font-mono text-sm font-bold text-slate-900 outline-none focus:border-slate-400"
                placeholder="الباركود - اتركه فارغًا للتوليد"
                value={newProdBarcode}
                onChange={e => setNewProdBarcode(e.target.value)}
              />

              <select
                className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-900 outline-none focus:border-slate-400"
                value={newProd.unit}
                onChange={e => setNewProd({...newProd, unit: e.target.value})}
              >
                {[...new Set([...(newProdUnits || []), newProd.unit])].filter(Boolean).map(u => <option key={u} value={u}>{u}</option>)}
              </select>

              {renderNewProductUnitConversionsSummary()}
              {showNewProductUnitConversions && renderNewProductUnitConversionsEditor()}

              <input
                type="number"
                step="any"
                className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-bold text-rose-600 outline-none focus:border-slate-400"
                placeholder="سعر الشراء *"
                value={newProd.purchase_price}
                onChange={e => updateNewProdPurchasePrice(e.target.value)}
              />

              <input
                type="number"
                step="any"
                className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-bold text-emerald-600 outline-none focus:border-slate-400"
                placeholder="سعر البيع"
                value={newProd.sale_price}
                onChange={e => updateNewProdSalePrice(e.target.value)}
              />

              {canViewProfit && (
                <label className="flex h-11 items-center gap-2 rounded-xl bg-emerald-50 px-3">
                  <span className="text-xs font-black text-emerald-700">نسبة المكسب</span>
                  <input
                    type="number"
                    step="any"
                    value={newProd.profit_margin}
                    onChange={e => updateNewProdProfitMargin(e.target.value)}
                    className="min-w-0 flex-1 bg-transparent text-center text-sm font-black text-emerald-700 outline-none"
                    placeholder="%"
                  />
                  <span className="text-xs font-black text-emerald-700">%</span>
                </label>
              )}

              <button
                onClick={handleAddNewProduct}
                disabled={addingSaving || !newProd.name.trim() || !newProd.purchase_price}
                className="h-11 w-full rounded-xl bg-amber-500 text-sm font-black text-white transition-all hover:bg-amber-400 disabled:opacity-50 lg:col-span-2"
              >
                {addingSaving ? "جاري الإضافة..." : "حفظ وإضافة للفاتورة"}
              </button>

              <button
                onClick={() => { setShowNewProductUnitConversions(false); setShowAddModal(false); }}
                className="h-11 w-full rounded-xl bg-slate-200 text-sm font-black text-slate-700 transition-all hover:bg-slate-300"
              >
                إلغاء
              </button>
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
          @page { size: ${printPageSize}; margin: 6mm; }
          html, body { width: auto !important; height: auto !important; margin: 0 !important; padding: 0 !important; overflow: visible !important; background: #fff !important; }
          body * { visibility: hidden !important; }
          body > div > aside, body > div > nav, body > div > main > header { display: none !important; }
          body > div, body > div > main, body > div > main > div, body > div > main > div > div { display: block !important; width: 100% !important; max-width: none !important; min-height: 0 !important; margin: 0 !important; padding: 0 !important; }
          main > div > div > div > :not(.print-invoice):not(style) { display: none !important; }
          .print-invoice, .print-invoice * { visibility: visible !important; }
          .print-invoice { display: block !important; position: static !important; inset: auto !important; width: 100%; min-height: 0; padding: 0; background: white; color: #0f172a; font-size: 10px; line-height: 1.35; break-after: auto; page-break-after: auto; }
          .print-card { width: 100%; max-width: 100%; margin: 0 auto; border: 1px solid #dbe3ef; padding: 12px; border-radius: 10px; }
          .print-header { display: flex; justify-content: space-between; gap: 14px; border-bottom: 2px solid #0f172a; padding-bottom: 8px; margin-bottom: 10px; }
          .print-eyebrow { font-size: 9px; font-weight: 900; color: #d97706; margin: 0 0 3px; }
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
          .print-total { background: #fffbeb; color: #b45309; font-size: 11px; }
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
