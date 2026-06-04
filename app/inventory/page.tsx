"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import Link from "next/link";
import { PRODUCT_CATEGORIES, ProductCategory, normalizeProductCategory, productCategoryLabel } from "@/lib/product-category";

type Product = {
  id: string;
  name: string;
  unit: string;
  purchase_price: number | string;
  sale_price: number | string;
  stock_quantity: number | string;
  barcode?: string | null;
  product_category?: ProductCategory | string | null;
};

type ScannerControls = {
  reset?: () => void;
  stop?: () => void;
};

const generateBarcode = () => {
  const randomPart =
    typeof crypto !== "undefined"
      ? Array.from(crypto.getRandomValues(new Uint8Array(10)))
          .map((value) => value % 10)
          .join("")
      : Math.floor(Math.random() * 10_000_000_000)
          .toString()
          .padStart(10, "0");

  return `20${randomPart}`;
};

const isUuid = (value: string) => {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
};

const isPrintableBarcode = (value: string) => {
  return /^[A-Za-z0-9-]{4,24}$/.test(value);
};

const UNITS = ["قطعة", "نسخة", "كتاب", "علبة", "دستة", "مجموعة", "مجلد", "سلسلة", "كرتونة"];

export default function InventoryPage() {

  // =========================
  // STATES
  // =========================

  const [products, setProducts] = useState<Product[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeCategory, setActiveCategory] = useState<ProductCategory>("books");
  const [loading, setLoading] = useState(true);

  // مودالات
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isBarcodeViewOpen, setIsBarcodeViewOpen] = useState(false);

  // الصنف الحالي للعرض
  const [barcodeProduct, setBarcodeProduct] = useState<Product | null>(null);

  // تعديل
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Product>>({});

  // منتج جديد
  const [newProduct, setNewProduct] = useState({
    name: "",
    unit: "قطعة",
    purchase_price: "",
    sale_price: "",
    stock_quantity: "",
    barcode: "",
    product_category: "books" as ProductCategory,
  });

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

  // =========================
  // توليد باركود تلقائي
  // =========================

  const cleanBarcode = (value: unknown) => {
    return value?.toString().trim() || "";
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchProducts();
  }, [fetchProducts]);

  useEffect(() => {
    scannerInputRef.current?.focus();
  }, []);

  const generateUniqueBarcode = () => {
    let barcode = generateBarcode();

    while (
      products.some(
        (product) => cleanBarcode(product.barcode) === barcode
      )
    ) {
      barcode = generateBarcode();
    }

    return barcode;
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

    if (existingBarcode && !isUuid(existingBarcode) && existingBarcode.length <= 24) {
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

          .label{
            width:230px;
            margin:auto;
            border:1px dashed #999;
            padding:10px;
            border-radius:10px;
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

        <div class="label">

          <img src="${dataUrl}" />

          <h2>${escapeHtml(barcodeProduct.name)}</h2>

          <p>
            سعر البيع:
            ${escapeHtml(barcodeProduct.sale_price)}
            ج.م
          </p>

          <p>
            الوحدة:
            ${escapeHtml(barcodeProduct.unit)}
          </p>

        </div>

        <script>
          window.onload = () => {
            window.print();
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

  const startEdit = (product: Product) => {
    setEditingId(product.id);
    setEditForm({
  ...product,
  barcode: product.barcode || "",
});
  };

  const saveEdit = async () => {

    const barcodeValue = cleanBarcode(editForm.barcode);

    if (barcodeValue && !isPrintableBarcode(barcodeValue)) {
      return alert("الباركود لازم يكون 4 إلى 24 رقم/حرف إنجليزي فقط عشان يطبع ويتسكن بسهولة.");
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

    const { error } = await supabase
      .from("products")
      .update({
        name: editForm.name,
        unit: editForm.unit,
        purchase_price: Number(editForm.purchase_price),
        sale_price: Number(editForm.sale_price),
        stock_quantity: Number(editForm.stock_quantity),
        barcode: barcodeValue,
        product_category: normalizeProductCategory(editForm.product_category),
      })
      .eq("id", editingId);

    if (!error) {

      alert("تم التعديل بنجاح ✅");

      setEditingId(null);

      fetchProducts();

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
      return alert("الباركود لازم يكون 4 إلى 24 رقم/حرف إنجليزي فقط. سيب الخانة فاضية وأنا هولده تلقائيًا.");
    }

    // منع التكرار
    const exists = products.find(
      (p) => cleanBarcode(p.barcode) === barcodeValue
    );

    if (exists) {
      return alert("الباركود مستخدم بالفعل");
    }

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
          barcode: barcodeValue,
          product_category: normalizeProductCategory(newProduct.product_category),
        },
      ]);

    if (!error) {

      alert("تمت الإضافة بنجاح ✅");

      setIsModalOpen(false);

      setNewProduct({
        name: "",
        unit: "قطعة",
        purchase_price: "",
        sale_price: "",
        stock_quantity: "",
        barcode: "",
        product_category: activeCategory,
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
          if (e.key === "Enter") {
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
              إدارة الكتب والأدوات المكتبية بالباركود
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
          <div className="grid grid-cols-2 gap-2">
            {PRODUCT_CATEGORIES.map((category) => (
              <button
                key={category.key}
                type="button"
                onClick={() => setActiveCategory(category.key)}
                className={`rounded-2xl px-4 py-3 text-sm font-black transition-all ${
                  activeCategory === category.key
                    ? "bg-slate-900 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {category.label} ({products.filter((p) => normalizeProductCategory(p.product_category) === category.key).length})
              </button>
            ))}
          </div>

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

                  {editingId === p.id ? (

                    <>

                      <td className="p-2">
                        <input
                          value={editForm.name}
                          onChange={(e) =>
                            setEditForm({
                              ...editForm,
                              name: e.target.value,
                            })
                          }
                          className="w-full border p-2 rounded"
                        />
                      </td>

                      <td className="p-2">
                        <select
                          value={normalizeProductCategory(editForm.product_category)}
                          onChange={(e) =>
                            setEditForm({
                              ...editForm,
                              product_category: e.target.value as ProductCategory,
                            })
                          }
                          className="w-full border p-2 rounded"
                        >
                          {PRODUCT_CATEGORIES.map((category) => (
                            <option key={category.key} value={category.key}>{category.label}</option>
                          ))}
                        </select>
                      </td>

                      <td className="p-2">

                        <select
                          value={editForm.unit}
                          onChange={(e) =>
                            setEditForm({
                              ...editForm,
                              unit: e.target.value,
                            })
                          }
                          className="w-full border p-2 rounded"
                        >
                          {UNITS.map((unit) => (
                            <option key={unit} value={unit}>{unit}</option>
                          ))}
                        </select>

                      </td>

                      <td className="p-2">
                        <input
                          type="number"
                          value={editForm.stock_quantity}
                          onChange={(e) =>
                            setEditForm({
                              ...editForm,
                              stock_quantity:
                                e.target.value,
                            })
                          }
                          className="w-full border p-2 rounded"
                        />
                      </td>

                      <td className="p-2">
                        <input
                          type="number"
                          value={editForm.purchase_price}
                          onChange={(e) =>
                            setEditForm({
                              ...editForm,
                              purchase_price:
                                e.target.value,
                            })
                          }
                          className="w-full border p-2 rounded"
                        />
                      </td>

                      <td className="p-2">
                        <input
                          type="number"
                          value={editForm.sale_price}
                          onChange={(e) =>
                            setEditForm({
                              ...editForm,
                              sale_price:
                                e.target.value,
                            })
                          }
                          className="w-full border p-2 rounded"
                        />
                      </td>

                      <td className="p-2">

                        <input
                          value={editForm.barcode || ""}
                          onChange={(e) =>
                            setEditForm({
                              ...editForm,
                              barcode:
                                e.target.value,
                            })
                          }
                          className="w-full border p-2 rounded font-mono"
                        />

                      </td>

                      <td className="p-2">

                        <div className="flex gap-2 justify-center">

                          <button
                            onClick={saveEdit}
                            className="bg-emerald-500 text-white px-3 py-1 rounded-lg"
                          >
                            حفظ
                          </button>

                          <button
                            onClick={() =>
                              setEditingId(null)
                            }
                            className="bg-slate-300 px-3 py-1 rounded-lg"
                          >
                            إلغاء
                          </button>

                        </div>

                      </td>

                    </>

                  ) : (

                    <>

                      <td className="p-4 font-bold">
                        {p.name}
                      </td>

                      <td className="p-4">
                        <span className={`rounded-full px-3 py-1 text-xs font-black ${
                          normalizeProductCategory(p.product_category) === "books"
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
                        {p.stock_quantity}
                      </td>

                      <td className="p-4">
                        {p.purchase_price}
                      </td>

                      <td className="p-4">
                        {p.sale_price}
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

                  )}

                </tr>

              ))}

            </tbody>

          </table>

        </div>

      </div>

      {/* مودال إضافة */}

      {isModalOpen && (

        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">

          <div className="bg-white rounded-3xl p-6 w-full max-w-md">

            <h2 className="text-2xl font-black mb-6 text-center">
              إضافة صنف {productCategoryLabel(newProduct.product_category)}
            </h2>

            <div className="space-y-4">

              <input
                placeholder="اسم الصنف"
                value={newProduct.name}
                onChange={(e) =>
                  setNewProduct({
                    ...newProduct,
                    name: e.target.value,
                  })
                }
                className="w-full border p-4 rounded-2xl"
              />

              <div className="grid grid-cols-2 gap-2">
                {PRODUCT_CATEGORIES.map((category) => (
                  <button
                    key={category.key}
                    type="button"
                    onClick={() => setNewProduct({ ...newProduct, product_category: category.key })}
                    className={`rounded-2xl px-4 py-3 text-sm font-black transition-all ${
                      normalizeProductCategory(newProduct.product_category) === category.key
                        ? "bg-slate-900 text-white"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    {category.label}
                  </button>
                ))}
              </div>

              <select
                value={newProduct.unit}
                onChange={(e) =>
                  setNewProduct({
                    ...newProduct,
                    unit: e.target.value,
                  })
                }
                className="w-full border p-4 rounded-2xl bg-white font-bold"
              >
                {UNITS.map((unit) => (
                  <option key={unit} value={unit}>{unit}</option>
                ))}
              </select>

              <input
                placeholder="الباركود"
                value={newProduct.barcode}
                onChange={(e) =>
                  setNewProduct({
                    ...newProduct,
                    barcode: e.target.value,
                  })
                }
                className="w-full border p-4 rounded-2xl font-mono"
              />

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
                className="w-full border p-4 rounded-2xl"
              />

              <input
                type="number"
                placeholder="سعر الشراء"
                value={newProduct.purchase_price}
                onChange={(e) =>
                  setNewProduct({
                    ...newProduct,
                    purchase_price:
                      e.target.value,
                  })
                }
                className="w-full border p-4 rounded-2xl"
              />

              <input
                type="number"
                placeholder="سعر البيع"
                value={newProduct.sale_price}
                onChange={(e) =>
                  setNewProduct({
                    ...newProduct,
                    sale_price:
                      e.target.value,
                  })
                }
                className="w-full border p-4 rounded-2xl"
              />

              <button
                onClick={handleAddProduct}
                className="w-full bg-emerald-600 text-white py-4 rounded-2xl font-bold"
              >
                حفظ الصنف ✅
              </button>

              <button
                onClick={() =>
                  setIsModalOpen(false)
                }
                className="w-full bg-slate-200 py-4 rounded-2xl font-bold"
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

            <div className="flex gap-3">

              <button
                onClick={printBarcode}
                className="flex-1 bg-slate-900 text-white py-4 rounded-2xl font-bold"
              >
                🖨️ طباعة
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
