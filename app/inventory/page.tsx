"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import Link from "next/link";
import { ProductCategory, normalizeProductCategory, productCategoryLabel } from "@/lib/product-category";
import { barcodeValidationMessage, cleanBarcode, generateInternalBarcode, isPrintableBarcode, isUuidLike } from "@/lib/barcode";
import { CategorySelect, useCategoryUnits, useEnabledCategories } from "@/app/category-select";
import { ProductAttributes, ProductCategoryFields, cleanProductAttributes, productAttributesSummary } from "@/app/product-category-fields";
import { useBarcodeHardwareSettings } from "@/app/barcode-hardware-settings";
import { formatPriceInput, priceFromPurchase, profitPercentFromPrices, purchaseFromPrice } from "@/lib/pricing";
import { productUnitConversions, unitConversionsForBaseUnit, UnitConversion } from "@/lib/category-settings";

type Product = {
  id: string;
  name: string;
  unit: string;
  purchase_price: number | string;
  sale_price: number | string;
  stock_quantity: number | string;
  reorder_point?: number | string | null;
  reorder_target?: number | string | null;
  supplier_id?: string | null;
  barcode?: string | null;
  product_category?: ProductCategory | string | null;
  product_attributes?: ProductAttributes | null;
  profit_margin?: number | string;
};

type Supplier = {
  id: string;
  name: string;
  phone?: string | null;
};

const DEFAULT_PRODUCT_UNIT_CONVERSIONS: UnitConversion[] = [
  { id: "default-carton-piece", fromUnit: "كرتونة", toUnit: "قطعة", factor: 12 },
  { id: "default-dozen-piece", fromUnit: "دستة", toUnit: "قطعة", factor: 12 },
  { id: "default-box-piece", fromUnit: "علبة", toUnit: "قطعة", factor: 1 },
  { id: "default-pack-piece", fromUnit: "عبوة", toUnit: "قطعة", factor: 1 },
  { id: "default-kg-gram", fromUnit: "كيلو", toUnit: "جرام", factor: 1000 },
  { id: "default-liter-ml", fromUnit: "لتر", toUnit: "مللي", factor: 1000 },
  { id: "default-meter-cm", fromUnit: "متر", toUnit: "سنتي", factor: 100 },
  { id: "default-meter-millimeter", fromUnit: "متر", toUnit: "مللي متر", factor: 1000 },
];

type ScannerControls = {
  reset?: () => void;
  stop?: () => void;
};

export default function InventoryPage() {

  // =========================
  // STATES
  // =========================

  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeCategory, setActiveCategory] = useState<ProductCategory>("general");
  const enabledCategories = useEnabledCategories();
  const defaultActiveCategory = enabledCategories[0] || "general";
  const [loading, setLoading] = useState(true);

  // مودالات
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isBarcodeViewOpen, setIsBarcodeViewOpen] = useState(false);
  const { hardwareSettings } = useBarcodeHardwareSettings();

  // الصنف الحالي للعرض
  const [barcodeProduct, setBarcodeProduct] = useState<Product | null>(null);
  const [barcodeLabelCount, setBarcodeLabelCount] = useState(1);

  // تعديل
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Product>>({});
  const [editUnitConversions, setEditUnitConversions] = useState<UnitConversion[] | null>(null);
  const [showNewUnitConversions, setShowNewUnitConversions] = useState(false);

  // منتج جديد
  const [newProduct, setNewProduct] = useState({
    name: "",
    unit: "قطعة",
    purchase_price: "",
    sale_price: "",
    profit_margin: "25",
    stock_quantity: "",
    reorder_point: "5",
    reorder_target: "10",
    supplier_id: "",
    barcode: "",
    product_category: "general" as ProductCategory,
    product_attributes: {} as ProductAttributes,
  });
  const newProductUnits = useCategoryUnits(newProduct.product_category);
  const editFormUnits = useCategoryUnits(editForm.product_category);

  useEffect(() => {
    if (enabledCategories.length > 0 && !enabledCategories.includes(activeCategory)) {
      setActiveCategory(defaultActiveCategory);
    }
  }, [activeCategory, defaultActiveCategory, enabledCategories]);

  useEffect(() => {
    if (enabledCategories.length > 0 && !enabledCategories.includes(newProduct.product_category)) {
      setNewProduct((current) => ({ ...current, product_category: defaultActiveCategory, product_attributes: {} }));
    }
  }, [defaultActiveCategory, enabledCategories, newProduct.product_category]);

  useEffect(() => {
    if (newProductUnits.length > 0 && !newProductUnits.includes(newProduct.unit)) {
      setNewProduct((current) => ({ ...current, unit: newProductUnits[0] }));
    }
  }, [newProduct.product_category, newProduct.unit, newProductUnits]);

  // سكانر USB
  const scannerInputRef = useRef<HTMLInputElement>(null);
  const [scannerValue, setScannerValue] = useState("");

  // سكانر كاميرا
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const readerRef = useRef<ScannerControls | null>(null);
  const scanLockedRef = useRef(false);

  // Canvas للباركود
  const barcodeCanvasRef = useRef<HTMLCanvasElement>(null);

  // =========================
  // FETCH
  // =========================

  const fetchProducts = useCallback(async () => {
    setLoading(true);

    const { data } = await supabase
      .from("products")
      .select("*")
      .order("name", { ascending: true });

    setProducts((data || []) as Product[]);
    setLoading(false);

    setTimeout(() => {
      scannerInputRef.current?.focus();
    }, 100);
  }, []);

  const fetchSuppliers = useCallback(async () => {
    const { data } = await supabase
      .from("suppliers")
      .select("id,name,phone")
      .order("name", { ascending: true });

    setSuppliers((data || []) as Supplier[]);
  }, []);

  // =========================
  // توليد باركود تلقائي
  // =========================

  useEffect(() => {
     
    fetchProducts();
    fetchSuppliers();
  }, [fetchProducts, fetchSuppliers]);

  useEffect(() => {
    scannerInputRef.current?.focus();
  }, []);

  const generateUniqueBarcode = () => {
    return generateInternalBarcode(products.map((product) => product.barcode));
  };

  const escapeHtml = (value: unknown) => {
    return value
      ?.toString()
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;") || "";
  };

  const ensureProductBarcode = (product: Product) => {
    const existingBarcode = cleanBarcode(product.barcode);

    if (existingBarcode && !isUuidLike(existingBarcode) && isPrintableBarcode(existingBarcode)) {
      return { ...product, barcode: existingBarcode };
    }

    const barcode = generateUniqueBarcode();

    setProducts((current) =>
      current.map((item) =>
        item.id === product.id ? { ...item, barcode } : item
      )
    );

    supabase
      .from("products")
      .update({ barcode })
      .eq("id", product.id)
      .then(({ error }) => {
        if (error) {
          alert("تم عرض الباركود، لكن تعذر حفظه على الصنف: " + error.message);
        }
      });

    return { ...product, barcode };
  };

  // =========================
  // رسم BARCODE
  // =========================

  const drawBarcode = async (
    value: string,
    canvas: HTMLCanvasElement
  ) => {
    const JsBarcode = (await import("jsbarcode")).default;

    JsBarcode(canvas, value, {
      format: "CODE128",
      lineColor: "#000",
      width: 1.5,
      height: 55,
      displayValue: true,
      fontSize: 14,
      margin: 6,
    });
  };

  // =========================
  // فتح عرض الباركود
  // =========================

  const openBarcodeView = (product: Product) => {
    const productWithBarcode = ensureProductBarcode(product);
    setBarcodeProduct(productWithBarcode);
    setBarcodeLabelCount(1);
    setIsBarcodeViewOpen(true);

    setTimeout(async () => {
      if (barcodeCanvasRef.current) {
        await drawBarcode(productWithBarcode.barcode, barcodeCanvasRef.current);
      }
    }, 100);
  };

  // =========================
  // طباعة الباركود
  // =========================

  const printBarcode = () => {

    if (!barcodeCanvasRef.current || !barcodeProduct) return;

    const labelCount = Math.min(Math.max(Number(barcodeLabelCount) || 1, 1), 100);
    const dataUrl = barcodeCanvasRef.current.toDataURL("image/png");

    const win = window.open("", "_blank");

    if (!win) return;

    win.document.write(`
      <html dir="rtl">
      <head>
        <title>طباعة باركود</title>

        <style>

          body{
            font-family:Arial;
            text-align:center;
            padding:20px;
          }

          .labels{
            display:flex;
            flex-wrap:wrap;
            gap:${hardwareSettings.labelGapMm}mm;
            align-items:flex-start;
            justify-content:center;
          }

          .label{
            width:${hardwareSettings.labelWidthMm}mm;
            min-height:${hardwareSettings.labelHeightMm}mm;
            border:1px dashed #999;
            padding:4mm;
            border-radius:2mm;
            break-inside:avoid;
          }

          img{
            width:100%;
          }

          h2{
            margin:8px 0 4px;
            font-size:16px;
          }

          p{
            margin:3px 0;
            color:#555;
            font-size:11px;
          }

        </style>

      </head>

      <body>

        <div class="labels">
          ${Array.from({ length: labelCount })
            .map(
              () => `
                <div class="label">
                  <img src="${dataUrl}" />
                  <h2>${escapeHtml(barcodeProduct.name)}</h2>
                  <p>سعر البيع: ${escapeHtml(barcodeProduct.sale_price)} ج.م</p>
                  <p>الوحدة: ${escapeHtml(barcodeProduct.unit)}</p>
                </div>
              `
            )
            .join("")}
        </div>

        <script>
          window.onload = () => {
            setTimeout(() => window.print(), ${hardwareSettings.printDelayMs});
          }
        </script>

      </body>

      </html>
    `);

    win.document.close();
  };

  // =========================
  // SCANNER USB
  // =========================

  const handleScannerInput = async (value: string) => {

    const barcodeValue = cleanBarcode(value);

    if (!barcodeValue) return;

    const found = products.find(
      (p) => cleanBarcode(p.barcode) === barcodeValue
    );

    // صوت نجاح
    const successAudio = new Audio(
      "https://actions.google.com/sounds/v1/cartoon/wood_plank_flicks.ogg"
    );

    // صوت خطأ
    const errorAudio = new Audio(
      "https://actions.google.com/sounds/v1/alarms/beep_short.ogg"
    );

    if (found) {

      successAudio.play();

      setSearchTerm(barcodeValue);

    } else {

      errorAudio.play();

      setNewProduct((prev) => ({
        ...prev,
        barcode: barcodeValue,
      }));

      setShowNewUnitConversions(false);
      setIsModalOpen(true);
    }

    setScannerValue("");

    setTimeout(() => {
      scannerInputRef.current?.focus();
    }, 100);
  };

  // =========================
  // SCANNER CAMERA
  // =========================

  const startScanner = async () => {

    if (isScannerOpen) return;

    scanLockedRef.current = false;
    setIsScannerOpen(true);

    setTimeout(async () => {

      try {

        if (videoRef.current) {

          const { BrowserMultiFormatReader } =
            await import("@zxing/browser");

          const codeReader =
            new BrowserMultiFormatReader();

          const controls = await codeReader.decodeFromConstraints(
            {
              video: {
                facingMode: "environment",
              },
            },
            videoRef.current,
            (result, _error, controls) => {

              if (result && !scanLockedRef.current) {

                scanLockedRef.current = true;
                const code = result.getText();

                controls.stop();
                setIsScannerOpen(false);

                handleScannerInput(code);
              }
            }
          );

          readerRef.current = controls;
        }

      } catch {

        alert("تأكد من السماح للكاميرا");

        setIsScannerOpen(false);
      }

    }, 300);
  };

  const stopScanner = () => {

    try {

      if (readerRef.current?.reset) {
        readerRef.current.reset();
      }

      if (readerRef.current?.stop) {
        readerRef.current.stop();
      }

    } catch {}

    readerRef.current = null;
    scanLockedRef.current = false;

    if (streamRef.current) {

      streamRef.current
        .getTracks()
        .forEach((track) => track.stop());

      streamRef.current = null;
    }

    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;

      stream
        .getTracks()
        .forEach((track) => track.stop());

      videoRef.current.srcObject = null;
    }

    setIsScannerOpen(false);
  };

  // =========================
  // EDIT
  // =========================

  const startEdit = async (product: Product) => {
    const { data } = await supabase
      .from("products")
      .select("*")
      .eq("id", product.id)
      .maybeSingle();
    const freshProduct = ((data as Product | null) || product) as Product;

    setEditingId(freshProduct.id);
    const freshAttributes = normalizedAttributes(freshProduct.product_attributes);
    const freshConversions = storedProductConversions(freshAttributes);
    setEditUnitConversions(freshConversions.length > 0 ? freshConversions : null);
    setEditForm({
      ...freshProduct,
      barcode: freshProduct.barcode || "",
      profit_margin: profitPercentFromPrices(freshProduct.purchase_price, freshProduct.sale_price),
      product_attributes: {
        ...freshAttributes,
        ...(freshConversions.length > 0 ? { unit_conversions: freshConversions } : {}),
      },
    });
  };

  const updateEditPurchasePrice = (value: string) => {
    setEditForm((current) => ({
      ...current,
      purchase_price: value,
      sale_price: current.profit_margin !== "" && current.profit_margin !== undefined
        ? formatPriceInput(priceFromPurchase(value, current.profit_margin))
        : current.sale_price,
    }));
  };

  const updateEditSalePrice = (value: string) => {
    setEditForm((current) => ({
      ...current,
      sale_price: value,
      purchase_price: current.profit_margin !== "" && current.profit_margin !== undefined
        ? formatPriceInput(purchaseFromPrice(value, current.profit_margin))
        : current.purchase_price,
    }));
  };

  const updateEditProfitMargin = (value: string) => {
    setEditForm((current) => ({
      ...current,
      profit_margin: value,
      sale_price: current.purchase_price !== "" && current.purchase_price !== undefined
        ? formatPriceInput(priceFromPurchase(current.purchase_price, value))
        : current.sale_price,
      purchase_price: (!current.purchase_price && current.sale_price)
        ? formatPriceInput(purchaseFromPrice(current.sale_price, value))
        : current.purchase_price,
    }));
  };

  const updateNewPurchasePrice = (value: string) => {
    setNewProduct((current) => ({
      ...current,
      purchase_price: value,
      sale_price: current.profit_margin !== ""
        ? formatPriceInput(priceFromPurchase(value, current.profit_margin))
        : current.sale_price,
    }));
  };

  const updateNewSalePrice = (value: string) => {
    setNewProduct((current) => ({
      ...current,
      sale_price: value,
      purchase_price: current.profit_margin !== ""
        ? formatPriceInput(purchaseFromPrice(value, current.profit_margin))
        : current.purchase_price,
    }));
  };

  const updateNewProfitMargin = (value: string) => {
    setNewProduct((current) => ({
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

  const saveEdit = async () => {

    const barcodeValue = cleanBarcode(editForm.barcode);

    if (barcodeValue && !isPrintableBarcode(barcodeValue)) {
      return alert(barcodeValidationMessage(barcodeValue));
    }

    const exists = products.find(
      (p) =>
        barcodeValue &&
        cleanBarcode(p.barcode) === barcodeValue &&
        p.id !== editingId
    );

    if (exists) {
      return alert("الباركود مستخدم بالفعل");
    }

    const reorderPoint = Number(editForm.reorder_point || 0);
    const reorderTarget = Math.max(Number(editForm.reorder_target || 0), reorderPoint);

    const savedProductAttributes = cleanProductAttributes(editForm.product_category, {
      ...normalizedAttributes(editForm.product_attributes),
      ...(editUnitConversions !== null ? { unit_conversions: editUnitConversions } : {}),
    });
    const updatePayload = {
      name: editForm.name,
      unit: editForm.unit,
      purchase_price: Number(editForm.purchase_price),
      sale_price: Number(editForm.sale_price),
      stock_quantity: Number(editForm.stock_quantity),
      reorder_point: reorderPoint,
      reorder_target: reorderTarget,
      supplier_id: editForm.supplier_id || null,
      barcode: barcodeValue,
      product_category: normalizeProductCategory(editForm.product_category),
      product_attributes: savedProductAttributes,
    };

    const { data: savedProduct, error } = await supabase
      .from("products")
      .update(updatePayload)
      .eq("id", editingId)
      .select("*")
      .maybeSingle();

    if (!error) {

      alert("تم التعديل بنجاح ✅");

      if (editingId) {
        setProducts((current) =>
          current.map((product) =>
            product.id === editingId
              ? ({ ...product, ...updatePayload, ...(savedProduct || {}), product_attributes: savedProduct?.product_attributes || savedProductAttributes } as Product)
              : product,
          ),
        );
      }

      setEditingId(null);
      setEditUnitConversions(null);

      await fetchProducts();

    } else {

      alert(error.message);
    }
  };

  // =========================
  // ADD PRODUCT
  // =========================

  const handleAddProduct = async () => {

    if (!newProduct.name) {
      return alert("اكتب اسم الصنف");
    }

    const barcodeValue =
      cleanBarcode(newProduct.barcode) !== ""
        ? cleanBarcode(newProduct.barcode)
        : generateUniqueBarcode();

    if (!isPrintableBarcode(barcodeValue)) {
      return alert(`${barcodeValidationMessage(barcodeValue)} سيب الخانة فاضية وأنا هولده تلقائيًا.`);
    }

    // منع التكرار
    const exists = products.find(
      (p) => cleanBarcode(p.barcode) === barcodeValue
    );

    if (exists) {
      return alert("الباركود مستخدم بالفعل");
    }

    const reorderPoint = Number(newProduct.reorder_point) || 5;
    const reorderTarget = Math.max(Number(newProduct.reorder_target) || 10, reorderPoint);

    const { error } = await supabase
      .from("products")
      .insert([
        {
          name: newProduct.name,
          unit: newProduct.unit,
          purchase_price:
            Number(newProduct.purchase_price) || 0,
          sale_price:
            Number(newProduct.sale_price) || 0,
          stock_quantity:
            Number(newProduct.stock_quantity) || 0,
          reorder_point: reorderPoint,
          reorder_target: reorderTarget,
          supplier_id: newProduct.supplier_id || null,
          barcode: barcodeValue,
          product_category: normalizeProductCategory(newProduct.product_category),
          product_attributes: cleanProductAttributes(
            newProduct.product_category,
            attributesWithDefaultConversions(
              newProduct.product_attributes,
              newProduct.product_category,
              newProduct.unit,
            ),
          ),
        },
      ]);

    if (!error) {

      alert("تمت الإضافة بنجاح ✅");

      setShowNewUnitConversions(false);
      setIsModalOpen(false);

      setNewProduct({
        name: "",
        unit: "قطعة",
        purchase_price: "",
        sale_price: "",
        profit_margin: "25",
        stock_quantity: "",
        reorder_point: "5",
        reorder_target: "10",
        supplier_id: "",
        barcode: "",
        product_category: activeCategory,
        product_attributes: {},
      });

      fetchProducts();

    } else {

      alert(error.message);
    }
  };

  // =========================
  // FILTER
  // =========================

  const filteredProducts = products.filter((p) => {
    const matchesCategory = normalizeProductCategory(p.product_category) === activeCategory;
    const matchesSearch =
      p.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.barcode?.toString().includes(searchTerm);

    return matchesCategory && matchesSearch;
  });

  const categoryCounts = products.reduce<Partial<Record<ProductCategory, number>>>((counts, product) => {
    const category = normalizeProductCategory(product.product_category);
    counts[category] = (counts[category] || 0) + 1;
    return counts;
  }, {});

  const supplierMap = useMemo(() => {
    return new Map(suppliers.map((supplier) => [supplier.id, supplier]));
  }, [suppliers]);

  const newProductNameSuggestions = products
    .filter((product) => {
      const name = newProduct.name.trim().toLowerCase();
      return name.length >= 2 && product.name.toLowerCase().includes(name);
    })
    .slice(0, 5);

  const getReorderPoint = (product: Product) => Number(product.reorder_point ?? 5);
  const getReorderTarget = (product: Product) => Number(product.reorder_target ?? 10);
  const getSupplierName = (supplierId?: string | null) =>
    supplierId ? supplierMap.get(supplierId)?.name || "مورد غير مسجل" : "بدون مورد";

  const conversionKey = (conversion: Pick<UnitConversion, "fromUnit" | "toUnit">) =>
    `${conversion.fromUnit.trim()}__${conversion.toUnit.trim()}`;

  const normalizedAttributes = (attributes: ProductAttributes | string | null | undefined): ProductAttributes => {
    let source: unknown = attributes;
    if (typeof source === "string") {
      try {
        source = JSON.parse(source) as ProductAttributes;
      } catch {
        source = {};
      }
    }
    return source && typeof source === "object" ? (source as ProductAttributes) : {};
  };

  const storedProductConversions = (attributes: ProductAttributes | string | null | undefined): UnitConversion[] => {
    const source = normalizedAttributes(attributes);
    const rawConversions = (source as { unit_conversions?: unknown }).unit_conversions;
    if (!Array.isArray(rawConversions)) return [];

    return rawConversions
      .map((item, index) => {
        if (!item || typeof item !== "object") return null;
        const conversion = item as Partial<UnitConversion>;
        const fromUnit = typeof conversion.fromUnit === "string" ? conversion.fromUnit.trim() : "";
        const toUnit = typeof conversion.toUnit === "string" ? conversion.toUnit.trim() : "";
        const factor = Number(conversion.factor);
        if (!fromUnit || !toUnit || !Number.isFinite(factor) || factor <= 0) return null;
        return {
          id: typeof conversion.id === "string" && conversion.id.trim() ? conversion.id : `stored-conversion-${index}`,
          fromUnit,
          toUnit,
          factor,
        };
      })
      .filter((conversion): conversion is UnitConversion => Boolean(conversion));
  };

  const unitMatches = (left: unknown, right: unknown) =>
    typeof left === "string" &&
    typeof right === "string" &&
    left.trim() === right.trim();

  const conversionIsRelatedToUnit = (conversion: UnitConversion, unit: unknown) =>
    unitMatches(conversion.fromUnit, unit) || unitMatches(conversion.toUnit, unit);

  const defaultUnitConversions = (unit?: unknown) =>
    unit
      ? DEFAULT_PRODUCT_UNIT_CONVERSIONS.filter((conversion) => conversionIsRelatedToUnit(conversion, unit))
      : DEFAULT_PRODUCT_UNIT_CONVERSIONS;

  const mergedProductConversions = (
    attributes: ProductAttributes | null | undefined,
    category: unknown,
    baseUnit?: unknown,
  ) => {
    const source = normalizedAttributes(attributes);
    const configured = baseUnit
      ? unitConversionsForBaseUnit(category, baseUnit, source)
      : productUnitConversions(source);
    const conversions = [...configured, ...defaultUnitConversions(baseUnit)];
    const unique = new Map<string, UnitConversion>();
    conversions.forEach((conversion) => {
      const key = conversionKey(conversion);
      if (!unique.has(key)) unique.set(key, conversion);
    });
    return Array.from(unique.values());
  };

  const attributesWithDefaultConversions = (
    attributes: ProductAttributes | null | undefined,
    category: unknown,
    baseUnit: unknown,
  ): ProductAttributes => {
    const source = attributes && typeof attributes === "object" ? attributes : {};
    const hasExplicitConversions = Array.isArray((source as { unit_conversions?: unknown }).unit_conversions);
    return {
      ...source,
      unit_conversions: hasExplicitConversions
        ? productUnitConversions(source)
        : mergedProductConversions(source, category, baseUnit),
    };
  };

  const renderUnitConversionsSummary = (
    attributes: ProductAttributes | null | undefined,
    category: unknown,
    baseUnit: unknown,
    onToggle: () => void,
    open: boolean,
  ) => {
    const conversions = mergedProductConversions(attributes, category, baseUnit)
      .filter((conversion) => conversionIsRelatedToUnit(conversion, baseUnit))
      .slice(0, 4);

    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-black text-slate-900">تحويلات الوحدات</p>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {conversions.map((conversion) => (
                <span key={`unit-summary-${conversion.id}`} className="rounded-full bg-white px-2 py-0.5 text-[10px] font-black text-slate-600 shadow-sm">
                  {conversion.fromUnit} = {conversion.factor} {conversion.toUnit}
                </span>
              ))}
            </div>
          </div>
          <button
            type="button"
            onClick={onToggle}
            className="h-9 shrink-0 rounded-xl bg-slate-900 px-3 text-xs font-black text-white hover:bg-slate-700"
          >
            {open ? "إخفاء التفاصيل" : "تعديل التحويلات"}
          </button>
        </div>
      </div>
    );
  };

  const renderUnitConversionsEditor = (
    attributes: ProductAttributes | null | undefined,
    category: unknown,
    baseUnit: unknown,
    unitOptions: string[],
    onChange: (next: ProductAttributes) => void,
    mode: "modal" | "table" = "modal",
  ) => {
    const source = attributes && typeof attributes === "object" ? attributes : {};
    const base = typeof baseUnit === "string" && baseUnit.trim() ? baseUnit.trim() : "قطعة";
    const compact = mode === "table";
    const productConversions = storedProductConversions(source);
    const hasExplicitConversionList = Array.isArray((source as { unit_conversions?: unknown }).unit_conversions);
    const relatedProductConversions = productConversions.filter((conversion) => conversionIsRelatedToUnit(conversion, base));
    const suggestedConversions = mergedProductConversions({}, category, base)
      .filter((conversion) => conversionIsRelatedToUnit(conversion, base));
    const editableConversions = relatedProductConversions.length > 0
      ? relatedProductConversions
      : hasExplicitConversionList
      ? []
      : suggestedConversions.slice(0, compact ? 2 : 3).map((conversion) => ({
          ...conversion,
          id: `draft-${conversion.id || `${conversion.fromUnit}-${conversion.toUnit}`}`,
        }));
    const editableKeys = new Set(editableConversions.map(conversionKey));
    const hiddenProductConversions = productConversions.filter((conversion) => !editableKeys.has(conversionKey(conversion)));
    const options = [
      ...new Set([
        base,
        ...unitOptions,
        ...editableConversions.flatMap((item) => [item.fromUnit, item.toUnit]),
        ...suggestedConversions.flatMap((item) => [item.fromUnit, item.toUnit]),
        ...defaultUnitConversions(base).flatMap((item) => [item.fromUnit, item.toUnit]),
      ]),
    ].filter(Boolean);
    const sanitizeConversions = (items: UnitConversion[]) =>
      items
        .map((conversion, index) => ({
          id: conversion.id || `product-conversion-${Date.now()}-${index}`,
          fromUnit: conversion.fromUnit?.trim(),
          toUnit: conversion.toUnit?.trim(),
          factor: Number(conversion.factor),
        }))
        .filter((conversion): conversion is UnitConversion =>
          Boolean(conversion.fromUnit && conversion.toUnit && conversion.fromUnit !== conversion.toUnit && Number.isFinite(conversion.factor) && conversion.factor > 0),
        );
    const updateConversions = (nextEditableConversions: UnitConversion[]) =>
      onChange({ ...source, unit_conversions: [...hiddenProductConversions, ...sanitizeConversions(nextEditableConversions)] });
    const preferredSmallUnit = ["قطعة", "جرام", "مللي", "سنتي", "علبة", "عبوة"]
      .find((unit) => !unitMatches(unit, base) && options.includes(unit));
    const defaultToUnit = preferredSmallUnit || options.find((unit) => !unitMatches(unit, base)) || "قطعة";
    const suggestedDefault = suggestedConversions.find((conversion) => unitMatches(conversion.fromUnit, base) && unitMatches(conversion.toUnit, defaultToUnit));
    const defaultFactor = suggestedDefault?.factor || (unitMatches(base, "كرتونة") || unitMatches(base, "دستة") ? 12 : 1);
    const visibleConversions = compact ? editableConversions.slice(0, 3) : editableConversions;
    const remainingConversions = Math.max(editableConversions.length - visibleConversions.length, 0);

    return (
      <div className={`${compact ? "mt-2" : "lg:col-span-3"} rounded-2xl border border-slate-100 bg-slate-50 p-3`}>
        <div className="mb-2 flex items-center justify-between gap-2">
          <div>
            <p className="text-xs font-black text-slate-900">قواعد التحويل</p>
            <p className="mt-0.5 text-[10px] font-bold text-slate-400">كل وحدة كبيرة تساوي عدد من وحدة أصغر.</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black text-slate-600">
              {visibleConversions.length} تحويل
            </span>
            <button
              type="button"
              onClick={() => updateConversions([...editableConversions, { id: `conversion-${Date.now()}`, fromUnit: base, toUnit: defaultToUnit, factor: defaultFactor }])}
              className="rounded-full bg-slate-900 px-3 py-1.5 text-[10px] font-black text-white hover:bg-slate-700"
            >
              + تحويل
            </button>
          </div>
        </div>
        <div className={`${compact ? "max-h-44" : "max-h-52"} space-y-2 overflow-y-auto pr-1`}>
          {visibleConversions.length === 0 && (
            <div className="rounded-xl border border-dashed border-slate-200 bg-white p-3 text-center text-xs font-black text-slate-400">
              اضغط + تحويل لإضافة قاعدة جديدة للصنف.
            </div>
          )}
          {visibleConversions.map((conversion, index) => (
            <div key={conversion.id || index} className="grid items-center gap-2 rounded-xl border border-slate-100 bg-white p-2 sm:grid-cols-[auto_1fr_auto_86px_1fr_auto]">
              <span className="hidden text-[10px] font-black text-slate-400 sm:inline">كل</span>
              <label className="block">
                <span className="sr-only">الوحدة الكبيرة</span>
                <select
                  value={conversion.fromUnit}
                  onChange={(event) => {
                    const next = [...editableConversions];
                    next[index] = { ...conversion, fromUnit: event.target.value };
                    updateConversions(next);
                  }}
                  className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs font-bold text-slate-900 outline-none focus:border-slate-400"
                >
                  {options.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
                </select>
              </label>
              <span className="hidden text-center text-sm font-black text-slate-400 sm:inline">=</span>
              <label className="block">
                <span className="sr-only">قيمة التحويل</span>
                <input
                  type="number"
                  min={0.001}
                  step="any"
                  value={conversion.factor}
                  onChange={(event) => {
                    const next = [...editableConversions];
                    next[index] = { ...conversion, factor: Number(event.target.value) };
                    updateConversions(next);
                  }}
                  className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-2 text-center text-xs font-black text-slate-900 outline-none focus:border-slate-400"
                />
              </label>
              <label className="block">
                <span className="sr-only">الوحدة الصغيرة</span>
                <select
                  value={conversion.toUnit}
                  onChange={(event) => {
                    const next = [...editableConversions];
                    next[index] = { ...conversion, toUnit: event.target.value };
                    updateConversions(next);
                  }}
                  className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs font-bold text-slate-900 outline-none focus:border-slate-400"
                >
                  {options.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
                </select>
              </label>
              <button
                type="button"
                onClick={() => updateConversions(editableConversions.filter((_, currentIndex) => currentIndex !== index))}
                className="h-9 rounded-lg bg-rose-50 px-3 text-xs font-black text-rose-600 hover:bg-rose-100"
              >
                حذف
              </button>
            </div>
          ))}
          {compact && remainingConversions > 0 && (
            <div className="rounded-xl bg-slate-100 px-3 py-2 text-center text-[10px] font-black text-slate-500">
              + {remainingConversions} تحويل آخر
            </div>
          )}
        </div>
      </div>
    );
  };
  // =========================
  // UI
  // =========================

  return (

    <div
      className="min-h-screen bg-slate-50 p-6 text-black"
      dir="rtl"
    >

      {/* INPUT مخفي لسكانر USB */}

      <input
        ref={scannerInputRef}
        type="text"
        value={scannerValue}
        onChange={(e) =>
          setScannerValue(e.target.value)
        }
        onKeyDown={(e) => {
          if (e.key === "Enter" || (hardwareSettings.submitOnTab && e.key === "Tab")) {
            e.preventDefault();
            handleScannerInput(scannerValue);
          }
        }}
        className="opacity-0 absolute pointer-events-none"
      />

      <div className="max-w-7xl mx-auto">

        {/* HEADER */}

        <div className="bg-white p-5 rounded-3xl shadow mb-6 flex justify-between items-center">

          <div>
            <h1 className="text-3xl font-black">
              إدارة الأصناف
            </h1>

            <p className="text-slate-500 font-bold mt-1">
              إدارة منتجات المحل بالباركود
            </p>
          </div>

          <div className="flex gap-3">

            <Link
              href="/"
              className="bg-slate-200 px-5 py-3 rounded-2xl font-bold"
            >
              الرئيسية
            </Link>

            <button
              onClick={startScanner}
              className="bg-indigo-600 text-white px-5 py-3 rounded-2xl font-bold"
            >
              📷 سكان بالكاميرا
            </button>

            <button
              onClick={() => {
                setNewProduct((prev) => ({ ...prev, product_category: activeCategory }));
                setShowNewUnitConversions(false);
                setIsModalOpen(true);
              }}
              className="bg-emerald-600 text-white px-5 py-3 rounded-2xl font-bold"
            >
              + إضافة صنف
            </button>

          </div>

        </div>

        {/* SEARCH */}

        <div className="bg-white p-4 rounded-3xl shadow mb-6 space-y-3">
          <CategorySelect
            value={activeCategory}
            onChange={setActiveCategory}
            label="فلترة حسب القسم"
            counts={categoryCounts}
            variant="cards"
          />

          <input
            type="text"
            placeholder="بحث بالاسم أو الباركود..."
            className="w-full p-4 border rounded-2xl font-bold outline-none"
            value={searchTerm}
            onChange={(e) =>
              setSearchTerm(e.target.value)
            }
          />

        </div>

        {/* TABLE */}

        <div className="bg-white rounded-3xl shadow overflow-hidden">

          <table className="w-full text-sm">

            <thead className="bg-slate-900 text-white">

              <tr>

                <th className="p-4">الصنف</th>
                <th className="p-4">القسم</th>
                <th className="p-4">الوحدة</th>
                <th className="p-4">الكمية</th>
                <th className="p-4">شراء</th>
                <th className="p-4">بيع</th>
                <th className="p-4">باركود</th>
                <th className="p-4">إجراءات</th>

              </tr>

            </thead>

            <tbody>

              {loading ? (

                <tr>
                  <td
                    colSpan={8}
                    className="p-10 text-center"
                  >
                    جاري التحميل...
                  </td>
                </tr>

              ) : filteredProducts.map((p) => (

                <tr
                  key={p.id}
                  className="border-b hover:bg-slate-50"
                >

                    <>

                      <td className="p-4 font-bold">
                        {p.name}
                        {productAttributesSummary(p.product_category, p.product_attributes) && (
                          <p className="mt-1 text-[10px] font-bold text-slate-400">
                            {productAttributesSummary(p.product_category, p.product_attributes)}
                          </p>
                        )}
                        <p className="mt-1 text-[10px] font-black text-amber-600">
                          المورد: {getSupplierName(p.supplier_id)}
                        </p>
                      </td>

                      <td className="p-4">
                        <span className={`rounded-full px-3 py-1 text-xs font-black ${
                          normalizeProductCategory(p.product_category) === "general"
                            ? "bg-indigo-100 text-indigo-700"
                            : "bg-emerald-100 text-emerald-700"
                        }`}>
                          {productCategoryLabel(p.product_category)}
                        </span>
                      </td>

                      <td className="p-4">
                        {p.unit}
                      </td>

                      <td
                        className={`p-4 font-bold ${
                          Number(p.stock_quantity) <= 5
                            ? "text-red-600"
                            : "text-emerald-600"
                        }`}
                      >
                        <div>{p.stock_quantity}</div>
                        <div className="mt-1 text-[10px] font-black text-slate-400">
                          حد الطلب: {getReorderPoint(p)} / الهدف: {getReorderTarget(p)}
                        </div>
                      </td>

                      <td className="p-4">
                        {p.purchase_price}
                      </td>

                      <td className="p-4">
                        {p.sale_price}
                        {profitPercentFromPrices(p.purchase_price, p.sale_price) !== "" && (
                          <div className="mt-1 text-[10px] font-black text-emerald-600">
                            مكسب {profitPercentFromPrices(p.purchase_price, p.sale_price)}%
                          </div>
                        )}
                      </td>

                      <td className="p-4">

                        <button
                          onClick={() =>
                            openBarcodeView(p)
                          }
                          className="bg-indigo-100 text-indigo-700 px-3 py-2 rounded-xl text-xs font-bold"
                        >
                          🏷️ عرض
                        </button>

                      </td>

                      <td className="p-4">

                        <div className="flex gap-2 justify-center">

                          <button
                            onClick={() =>
                              startEdit(p)
                            }
                            className="text-blue-600 font-bold"
                          >
                            ✏️ تعديل
                          </button>

                        </div>

                      </td>

                    </>

                </tr>

              ))}

            </tbody>

          </table>

        </div>

      </div>

      {/* مودال تعديل */}

      {editingId && (

        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-6">

          <div className="flex max-h-[calc(100vh-2rem)] w-full max-w-7xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">

            <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 sm:px-7">
              <div>
                <p className="text-xs font-black text-slate-400">تعديل صنف</p>
                <h2 className="text-xl font-black text-slate-900 sm:text-2xl">
                  {editForm.name || "صنف بدون اسم"}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditingId(null);
                  setEditUnitConversions(null);
                }}
                className="rounded-2xl bg-slate-100 px-4 py-2 text-sm font-black text-slate-700 hover:bg-slate-200"
              >
                إغلاق
              </button>
            </div>

            <div className="grid flex-1 gap-4 overflow-y-auto p-5 sm:p-7 lg:grid-cols-[1.1fr_0.9fr]">

              <div className="space-y-4">
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="mb-3 text-sm font-black text-slate-900">البيانات الأساسية</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="text-xs font-black text-slate-500">
                      اسم الصنف
                      <input
                        value={editForm.name || ""}
                        onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                        className="mt-1 w-full rounded-2xl border border-slate-200 p-3 font-bold outline-none focus:border-slate-400"
                      />
                    </label>
                    <label className="text-xs font-black text-slate-500">
                      الباركود
                      <input
                        value={editForm.barcode || ""}
                        onChange={(e) => setEditForm({ ...editForm, barcode: e.target.value })}
                        className="mt-1 w-full rounded-2xl border border-slate-200 p-3 font-mono font-bold outline-none focus:border-slate-400"
                      />
                    </label>
                    <div>
                      <CategorySelect
                        value={normalizeProductCategory(editForm.product_category)}
                        onChange={(category) => setEditForm({ ...editForm, product_category: category, product_attributes: {} })}
                      />
                    </div>
                    <label className="text-xs font-black text-slate-500">
                      المورد
                      <select
                        value={editForm.supplier_id || ""}
                        onChange={(e) => setEditForm({ ...editForm, supplier_id: e.target.value || null })}
                        className="mt-1 w-full rounded-2xl border border-slate-200 bg-white p-3 font-bold outline-none focus:border-slate-400"
                      >
                        <option value="">بدون مورد</option>
                        {suppliers.map((supplier) => (
                          <option key={supplier.id} value={supplier.id}>
                            {supplier.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <ProductCategoryFields
                    category={normalizeProductCategory(editForm.product_category)}
                    value={(editForm.product_attributes as ProductAttributes) || {}}
                    onChange={(attributes) => setEditForm((current) => ({ ...current, product_attributes: attributes }))}
                    className="mt-4"
                  />
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-black text-slate-900">تحويل الوحدات</p>
                      <p className="mt-1 text-[11px] font-bold text-slate-400">كل تحويل عبارة عن وحدة كبيرة وقيمتها من وحدة أصغر.</p>
                    </div>
                  </div>
                  {renderUnitConversionsEditor(
                    {
                      ...normalizedAttributes(editForm.product_attributes),
                      ...(editUnitConversions !== null ? { unit_conversions: editUnitConversions } : {}),
                    },
                    editForm.product_category,
                    editForm.unit,
                    editFormUnits || [],
                    (attributes) => {
                      setEditUnitConversions(storedProductConversions(attributes));
                      setEditForm((current) => ({ ...current, product_attributes: attributes }));
                    },
                  )}
                </div>
              </div>

              <div className="space-y-4">
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="mb-3 text-sm font-black text-slate-900">المخزون والوحدة</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="text-xs font-black text-slate-500">
                      وحدة المخزون
                      <select
                        value={editForm.unit || ""}
                        onChange={(e) => setEditForm({ ...editForm, unit: e.target.value })}
                        className="mt-1 w-full rounded-2xl border border-slate-200 bg-white p-3 font-bold outline-none focus:border-slate-400"
                      >
                        {[...new Set([...(editFormUnits || []), editForm.unit?.toString() || ""])].filter(Boolean).map((unit) => (
                          <option key={unit} value={unit}>{unit}</option>
                        ))}
                      </select>
                    </label>
                    <label className="text-xs font-black text-slate-500">
                      الكمية الحالية
                      <input
                        type="number"
                        value={editForm.stock_quantity || ""}
                        onChange={(e) => setEditForm({ ...editForm, stock_quantity: e.target.value })}
                        className="mt-1 w-full rounded-2xl border border-slate-200 p-3 font-bold outline-none focus:border-slate-400"
                      />
                    </label>
                    <label className="text-xs font-black text-slate-500">
                      حد إعادة الطلب
                      <input
                        type="number"
                        min="0"
                        value={editForm.reorder_point ?? ""}
                        onChange={(e) => setEditForm({ ...editForm, reorder_point: e.target.value })}
                        className="mt-1 w-full rounded-2xl border border-slate-200 p-3 font-bold outline-none focus:border-slate-400"
                      />
                    </label>
                    <label className="text-xs font-black text-slate-500">
                      الكمية المستهدفة
                      <input
                        type="number"
                        min="0"
                        value={editForm.reorder_target ?? ""}
                        onChange={(e) => setEditForm({ ...editForm, reorder_target: e.target.value })}
                        className="mt-1 w-full rounded-2xl border border-slate-200 p-3 font-bold outline-none focus:border-slate-400"
                      />
                    </label>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="mb-3 text-sm font-black text-slate-900">الأسعار</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="text-xs font-black text-slate-500">
                      سعر الشراء
                      <input
                        type="number"
                        value={editForm.purchase_price || ""}
                        onChange={(e) => updateEditPurchasePrice(e.target.value)}
                        className="mt-1 w-full rounded-2xl border border-slate-200 p-3 font-bold outline-none focus:border-slate-400"
                      />
                    </label>
                    <label className="text-xs font-black text-slate-500">
                      سعر البيع
                      <input
                        type="number"
                        value={editForm.sale_price || ""}
                        onChange={(e) => updateEditSalePrice(e.target.value)}
                        className="mt-1 w-full rounded-2xl border border-slate-200 p-3 font-bold outline-none focus:border-slate-400"
                      />
                    </label>
                    <label className="sm:col-span-2 flex items-center gap-2 rounded-2xl bg-emerald-50 px-4 py-3">
                      <span className="text-xs font-black text-emerald-700">نسبة المكسب</span>
                      <input
                        type="number"
                        step="any"
                        value={editForm.profit_margin ?? ""}
                        onChange={(e) => updateEditProfitMargin(e.target.value)}
                        className="min-w-0 flex-1 bg-transparent text-center text-sm font-black text-emerald-700 outline-none"
                        placeholder="%"
                      />
                      <span className="text-xs font-black text-emerald-700">%</span>
                    </label>
                  </div>
                </div>
              </div>

            </div>

            <div className="flex flex-col gap-3 border-t border-slate-100 px-5 py-4 sm:flex-row sm:justify-end sm:px-7">
              <button
                type="button"
                onClick={() => {
                  setEditingId(null);
                  setEditUnitConversions(null);
                }}
                className="rounded-2xl bg-slate-100 px-6 py-3 font-black text-slate-700 hover:bg-slate-200"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={saveEdit}
                className="rounded-2xl bg-emerald-600 px-8 py-3 font-black text-white hover:bg-emerald-500"
              >
                حفظ التعديلات
              </button>
            </div>

          </div>

        </div>

      )}

      {/* مودال إضافة */}

      {isModalOpen && (

        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-3 sm:p-6 z-50">

          <div className="flex max-h-[calc(100vh-2rem)] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">

            <div className="border-b border-slate-100 px-4 py-3 sm:px-5">
              <h2 className="text-lg font-black text-slate-900 sm:text-xl">
              إضافة صنف {productCategoryLabel(newProduct.product_category)}
              </h2>
            </div>

            <div className="grid flex-1 gap-3 overflow-y-auto p-4 text-sm sm:p-5 lg:grid-cols-3">

              <input
                placeholder="اسم الصنف"
                value={newProduct.name}
                onChange={(e) =>
                  setNewProduct({
                    ...newProduct,
                    name: e.target.value,
                  })
                }
                className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-bold outline-none focus:border-slate-400 lg:col-span-2"
              />

              {newProductNameSuggestions.length > 0 && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-2 lg:col-span-2">
                  <p className="px-2 pb-1 text-[10px] font-black text-amber-700">أصناف مشابهة مسجلة قبل كده</p>
                  <div className="space-y-1">
                    {newProductNameSuggestions.map((product) => (
                      <button
                        key={product.id}
                        type="button"
                        onClick={() => {
                          setSearchTerm(product.name);
                          setActiveCategory(normalizeProductCategory(product.product_category));
                          setShowNewUnitConversions(false);
                          setIsModalOpen(false);
                        }}
                        className="w-full rounded-xl bg-white px-3 py-2 text-right text-xs font-black text-slate-700 hover:bg-amber-100"
                      >
                        {product.name}
                        <span className="mr-2 font-bold text-slate-400">
                          {product.stock_quantity} {product.unit} - {productCategoryLabel(product.product_category)}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <CategorySelect
                value={normalizeProductCategory(newProduct.product_category)}
                onChange={(category) => setNewProduct({ ...newProduct, product_category: category, product_attributes: {} })}
              />

              <ProductCategoryFields
                category={normalizeProductCategory(newProduct.product_category)}
                value={newProduct.product_attributes}
                onChange={(attributes) => setNewProduct({ ...newProduct, product_attributes: attributes })}
                className="lg:col-span-3"
              />

              <label className="block">
                <select
                  value={newProduct.supplier_id}
                  onChange={(e) =>
                    setNewProduct({
                      ...newProduct,
                      supplier_id: e.target.value,
                    })
                  }
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold outline-none focus:border-slate-400"
                >
                  <option value="">بدون مورد افتراضي</option>
                  {suppliers.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </option>
                  ))}
                </select>
                <span className="mt-1 block px-1 text-[10px] font-bold text-slate-400">
                  اختيار المورد هنا يخلي تقرير إعادة التوريد يجمع الأصناف المطلوبة حسب المورد.
                </span>
              </label>

              <select
                value={newProduct.unit}
                onChange={(e) =>
                  setNewProduct({
                    ...newProduct,
                    unit: e.target.value,
                  })
                }
                className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold outline-none focus:border-slate-400"
              >
                {[...new Set([...(newProductUnits || []), newProduct.unit])].filter(Boolean).map((unit) => (
                  <option key={unit} value={unit}>{unit}</option>
                ))}
              </select>
              <div className="lg:col-span-3">
                {renderUnitConversionsSummary(
                  newProduct.product_attributes,
                  newProduct.product_category,
                  newProduct.unit,
                  () => setShowNewUnitConversions((current) => !current),
                  showNewUnitConversions,
                )}
                {showNewUnitConversions && renderUnitConversionsEditor(
                  newProduct.product_attributes,
                  newProduct.product_category,
                  newProduct.unit,
                  newProductUnits || [],
                  (attributes) => setNewProduct((current) => ({ ...current, product_attributes: attributes })),
                )}
              </div>

              <input
                type="number"
                placeholder="الكمية"
                value={newProduct.stock_quantity}
                onChange={(e) =>
                  setNewProduct({
                    ...newProduct,
                    stock_quantity:
                      e.target.value,
                  })
                }
                className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-bold outline-none focus:border-slate-400"
              />

              <label className="block">
                <input
                  type="number"
                  min="0"
                  placeholder="حد إعادة الطلب"
                  value={newProduct.reorder_point}
                  onChange={(e) =>
                    setNewProduct({
                      ...newProduct,
                      reorder_point: e.target.value,
                    })
                  }
                  className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-bold outline-none focus:border-slate-400"
                />
                <span className="mt-1 block px-1 text-[10px] font-bold text-slate-400">
                  لما الكمية توصل للرقم ده الصنف يظهر في تقرير إعادة التوريد.
                </span>
              </label>

              <label className="block">
                <input
                  type="number"
                  min="0"
                  placeholder="الكمية المستهدفة"
                  value={newProduct.reorder_target}
                  onChange={(e) =>
                    setNewProduct({
                      ...newProduct,
                      reorder_target: e.target.value,
                    })
                  }
                  className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-bold outline-none focus:border-slate-400"
                />
                <span className="mt-1 block px-1 text-[10px] font-bold text-slate-400">
                  التقرير هيقترح شراء الكمية الناقصة لحد ما الصنف يوصل للهدف ده.
                </span>
              </label>

              <input
                placeholder="الباركود"
                value={newProduct.barcode}
                onChange={(e) =>
                  setNewProduct({
                    ...newProduct,
                    barcode: e.target.value,
                  })
                }
                className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-bold font-mono outline-none focus:border-slate-400"
              />

              <input
                type="number"
                placeholder="سعر الشراء"
                value={newProduct.purchase_price}
                onChange={(e) => updateNewPurchasePrice(e.target.value)}
                className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-bold outline-none focus:border-slate-400"
              />

              <input
                type="number"
                placeholder="سعر البيع"
                value={newProduct.sale_price}
                onChange={(e) => updateNewSalePrice(e.target.value)}
                className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-bold outline-none focus:border-slate-400"
              />

              <label className="flex h-11 items-center gap-2 rounded-xl bg-emerald-50 px-3">
                <span className="text-xs font-black text-emerald-700">نسبة المكسب</span>
                <input
                  type="number"
                  step="any"
                  value={newProduct.profit_margin}
                  onChange={(e) => updateNewProfitMargin(e.target.value)}
                  className="min-w-0 flex-1 bg-transparent text-center text-sm font-black text-emerald-700 outline-none"
                  placeholder="%"
                />
                <span className="text-xs font-black text-emerald-700">%</span>
              </label>

              <button
                onClick={handleAddProduct}
                className="h-11 w-full rounded-xl bg-emerald-600 text-sm font-black text-white hover:bg-emerald-500 lg:col-span-2"
              >
                حفظ الصنف ✅
              </button>

              <button
                onClick={() => {
                  setShowNewUnitConversions(false);
                  setIsModalOpen(false);
                }}
                className="h-11 w-full rounded-xl bg-slate-200 text-sm font-black text-slate-700 hover:bg-slate-300"
              >
                إلغاء
              </button>

            </div>

          </div>

        </div>

      )}

      {/* مودال الكاميرا */}

      {isScannerOpen && (

        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">

          <div className="bg-white p-4 rounded-3xl w-full max-w-md">

            <h2 className="font-black text-center mb-4">
              وجه الكاميرا للباركود
            </h2>

            <video
              ref={videoRef}
              className="w-full rounded-2xl"
              playsInline
            />

            <button
              onClick={stopScanner}
              className="w-full bg-rose-500 text-white py-4 rounded-2xl mt-4 font-bold"
            >
              إغلاق
            </button>

          </div>

        </div>

      )}

      {/* مودال عرض الباركود */}

      {isBarcodeViewOpen && barcodeProduct && (

        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">

          <div className="bg-white p-6 rounded-3xl w-full max-w-md text-center">

            <h2 className="text-2xl font-black mb-2">
              {barcodeProduct.name}
            </h2>

            <div className="bg-white border rounded-2xl p-4 mb-4">

              <canvas ref={barcodeCanvasRef} />

            </div>

            <p className="font-mono text-sm mb-6">
              {barcodeProduct.barcode}
            </p>

            <label className="mb-4 block text-right text-xs font-black text-slate-500">
              عدد الملصقات
              <input
                type="number"
                min={1}
                max={100}
                value={barcodeLabelCount}
                onChange={(e) =>
                  setBarcodeLabelCount(Math.min(Math.max(Number(e.target.value) || 1, 1), 100))
                }
                className="mt-2 w-full rounded-2xl border border-slate-200 p-3 text-center text-lg font-black outline-none focus:border-indigo-400"
              />
            </label>

            <div className="flex gap-3">

              <button
                onClick={printBarcode}
                className="flex-1 bg-slate-900 text-white py-4 rounded-2xl font-bold"
              >
                🖨️ طباعة
              </button>

              <button
                onClick={() => {
                  navigator.clipboard?.writeText(cleanBarcode(barcodeProduct.barcode));
                  alert("تم نسخ الباركود");
                }}
                className="flex-1 bg-indigo-100 text-indigo-700 py-4 rounded-2xl font-bold"
              >
                نسخ الكود
              </button>

              <button
                onClick={() =>
                  setIsBarcodeViewOpen(false)
                }
                className="flex-1 bg-slate-200 py-4 rounded-2xl font-bold"
              >
                إغلاق
              </button>

            </div>

          </div>

        </div>

      )}

    </div>
  );
}
