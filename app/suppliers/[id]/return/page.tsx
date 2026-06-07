"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { PRODUCT_CATEGORIES, ProductCategory, normalizeProductCategory, productCategoryLabel } from "@/lib/product-category";

type Supplier = {
  id: string;
  name: string;
  balance?: number;
};

type PurchaseItem = {
  id: string;
  name: string;
  unit?: string;
  qty: number;
  price: number;
  source_invoice_id: string;
  source_invoice_date: string;
  returnedQty: number;
  stockQty: number;
  availableQty: number;
  product_category?: ProductCategory | string | null;
};

type ReturnItem = PurchaseItem & {
  returnQty: number | string;
};

const INVOICE_TYPES = ["فاتورة توريد"];
const RETURN_TYPES = ["supplier_return", "مرتجع مورد"];

function isSupplierInvoice(type: string) {
  return INVOICE_TYPES.includes(type) || (type?.includes("فاتورة") && type?.includes("توريد"));
}

function isSupplierReturn(type: string) {
  return RETURN_TYPES.includes(type) || type?.includes("مرتجع مورد");
}

export default function SupplierReturnInvoicePage() {
  const { id } = useParams();
  const router = useRouter();

  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [activeCategory, setActiveCategory] = useState<ProductCategory>("general");
  const [stockById, setStockById] = useState<Record<string, number>>({});
  const [searchTerm, setSearchTerm] = useState("");
  const [cart, setCart] = useState<ReturnItem[]>([]);
  const [note, setNote] = useState("");
  const [discountPercent, setDiscountPercent] = useState<number | string>(0);
  const [isSaving, setIsSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [{ data: supp }, { data: trans }, { data: products }] = await Promise.all([
      supabase.from("suppliers").select("*").eq("id", id).single(),
      supabase.from("transactions").select("*").eq("supplier_id", id).order("created_at", { ascending: false }),
      supabase.from("products").select("id,stock_quantity"),
    ]);

    const stockMap = Object.fromEntries(
      (products || []).map((product: any) => [String(product.id), Number(product.stock_quantity || 0)]),
    );

    setSupplier(supp);
    setTransactions(trans || []);
    setStockById(stockMap);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    if (id) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      loadData();
    }
  }, [id, loadData]);

  const purchasedItems = useMemo<PurchaseItem[]>(() => {
    const returns = transactions.filter((tx) => isSupplierReturn(tx.type));

    return transactions
      .filter((tx) => isSupplierInvoice(tx.type))
      .flatMap((invoice) =>
        (invoice.items || []).map((item: any) => {
          const sourceInvoiceId = String(invoice.id || "");
          const itemId = String(item.id || "");
          const purchasedQty = Number(item.qty || 0);
          const returnedQty = returns
            .flatMap((tx) => tx.items || [])
            .filter((returned: any) => String(returned.source_invoice_id || "") === sourceInvoiceId)
            .filter((returned: any) => String(returned.id || "") === itemId)
            .reduce((sum: number, returned: any) => sum + Number(returned.qty || 0), 0);
          const invoiceAvailableQty = Math.max(purchasedQty - returnedQty, 0);
          const stockQty = Number(stockById[itemId] || 0);
          const availableQty = Math.max(Math.min(invoiceAvailableQty, stockQty), 0);

          return {
            id: itemId,
            name: item.name || "صنف بدون اسم",
            unit: item.unit || "",
            qty: purchasedQty,
            price: Number(item.net_price ?? item.price ?? 0),
            product_category: normalizeProductCategory(item.product_category),
            source_invoice_id: sourceInvoiceId,
            source_invoice_date: invoice.created_at,
            returnedQty,
            stockQty,
            availableQty,
          };
        }),
      )
      .filter((item) => item.availableQty > 0)
      .filter((item) => normalizeProductCategory(item.product_category) === activeCategory);
  }, [transactions, stockById, activeCategory]);

  const filteredItems = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return purchasedItems;

    return purchasedItems.filter((item) =>
      item.name.toLowerCase().includes(term) ||
      item.source_invoice_id.toLowerCase().includes(term),
    );
  }, [purchasedItems, searchTerm]);

  const addToCart = (item: PurchaseItem) => {
    const key = `${item.source_invoice_id}-${item.id}`;
    if (cart.some((cartItem) => `${cartItem.source_invoice_id}-${cartItem.id}` === key)) return;
    setCart((current) => [...current, { ...item, returnQty: 1 }]);
  };

  const removeFromCart = (index: number) => {
    setCart((current) => current.filter((_, itemIndex) => itemIndex !== index));
  };

  const updateCartQty = (index: number, value: string) => {
    setCart((current) => {
      const copy = [...current];
      copy[index] = { ...copy[index], returnQty: value };
      return copy;
    });
  };

  const normalizedCart = cart.map((item) => {
    const qty = Math.min(Math.max(Number(item.returnQty || 0), 0), Number(item.availableQty || 0));
    return { ...item, qty };
  });

  const subtotal = normalizedCart.reduce((sum, item) => sum + item.qty * Number(item.price || 0), 0);
  const discountRate = Math.min(Math.max(Number(discountPercent) || 0, 0), 100);
  const discountAmount = subtotal * (discountRate / 100);
  const total = Math.max(subtotal - discountAmount, 0);

  const saveReturn = async (printAfterSave = false) => {
    if (!supplier) return alert("بيانات المورد لم تحمل بعد");
    if (isSaving) return;

    const itemsToSave = normalizedCart
      .filter((item) => item.qty > 0)
      .map((item) => ({
        id: item.id,
        name: item.name,
        unit: item.unit,
        qty: item.qty,
        price: Number(item.price || 0),
        product_category: normalizeProductCategory(item.product_category),
        source_invoice_id: item.source_invoice_id,
      }));

    if (itemsToSave.length === 0) {
      alert("اختار صنف واحد على الأقل لمرتجع المورد.");
      return;
    }

    setIsSaving(true);
    try {
      const { data: currentSupplier, error: readError } = await supabase
        .from("suppliers")
        .select("balance")
        .eq("id", id)
        .single();
      if (readError) throw readError;

      const description = note.trim()
        ? `${note.trim()} - فاتورة مرتجع مورد${discountRate > 0 ? ` - خصم ${discountRate}%` : ""}`
        : `فاتورة مرتجع مورد${discountRate > 0 ? ` - خصم ${discountRate}%` : ""}`;

      const { error: insertError } = await supabase.from("transactions").insert([{
        supplier_id: id,
        amount: total,
        type: "supplier_return",
        description,
        items: itemsToSave,
      }]);
      if (insertError) throw insertError;

      for (const item of itemsToSave) {
        await supabase.rpc("decrement_stock", { row_id: String(item.id), amount: Number(item.qty) });
      }

      const { error: balanceError } = await supabase
        .from("suppliers")
        .update({ balance: Number(currentSupplier?.balance || 0) - total })
        .eq("id", id);
      if (balanceError) throw balanceError;

      if (printAfterSave) {
        window.print();
        window.setTimeout(() => router.push(`/suppliers/${id}/history`), 300);
      } else {
        router.push(`/suppliers/${id}/history`);
      }
    } catch (error) {
      console.error(error);
      alert("حدث خطأ أثناء حفظ فاتورة مرتجع المورد");
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f1f5f9] flex items-center justify-center text-slate-400 font-black" dir="rtl">
        جاري تحميل بيانات مرتجع المورد...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f1f5f9] text-right font-sans text-slate-900 pb-10" dir="rtl">
      <header className="bg-[#0f172a] text-white px-5 py-4 flex justify-between items-center shadow-xl sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <Link href="/suppliers" className="bg-white/10 hover:bg-white/20 px-4 py-2 rounded-xl text-xs font-black transition-all">
            رجوع
          </Link>
          <div>
            <h1 className="text-lg font-black">فاتورة مرتجع مورد {productCategoryLabel(activeCategory)}: {supplier?.name}</h1>
            <p className="text-[10px] text-slate-400 font-bold">
              {new Date().toLocaleDateString("ar-EG", { weekday: "long", day: "numeric", month: "long" })}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {cart.length > 0 && (
            <span className="bg-amber-500 px-3 py-1 rounded-lg text-[10px] font-black">{cart.length} صنف</span>
          )}
          <div className={`px-4 py-1.5 rounded-lg text-[10px] font-black ${(supplier?.balance || 0) > 0 ? "bg-rose-600" : "bg-emerald-600"}`}>
            رصيد المورد: {supplier?.balance?.toLocaleString("ar-EG")} ج.م
          </div>
        </div>
      </header>

      <main className="app-invoice-layout max-w-[1500px] mx-auto p-4 mt-3">
        <aside className="app-invoice-sidebar bg-white border border-slate-200 shadow-sm flex flex-col">
          <div className="p-4 border-b border-slate-100 space-y-3">
            <h3 className="font-black text-slate-400 text-[10px] uppercase tracking-widest">اختيار الأصناف المرتجعة للمورد</h3>
            <div className="grid grid-cols-2 gap-2">
              {PRODUCT_CATEGORIES.map((category) => (
                <button
                  key={category.key}
                  type="button"
                  onClick={() => {
                    setActiveCategory(category.key);
                    setCart([]);
                    setSearchTerm("");
                  }}
                  className={`rounded-xl px-3 py-2 text-xs font-black transition-all ${
                    activeCategory === category.key
                      ? "bg-slate-900 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  مرتجع {category.label}
                </button>
              ))}
            </div>
            <input
              type="text"
              placeholder="ابحث باسم الصنف أو رقم فاتورة التوريد..."
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-900 outline-none focus:border-amber-400 transition-all text-sm"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
          </div>
          <div className="overflow-y-auto flex-1 p-3 space-y-2">
            {filteredItems.length === 0 ? (
              <div className="p-6 text-center text-slate-300 font-black">لا توجد أصناف متاحة لمرتجع المورد</div>
            ) : filteredItems.map((item) => {
              const inCart = cart.some((cartItem) =>
                cartItem.id === item.id && cartItem.source_invoice_id === item.source_invoice_id,
              );
              return (
                <button
                  key={`${item.source_invoice_id}-${item.id}`}
                  type="button"
                  onClick={() => addToCart(item)}
                  className={`w-full rounded-xl border p-3 text-right transition-all ${
                    inCart ? "border-amber-300 bg-amber-50" : "border-slate-100 hover:border-amber-400 hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-black text-sm text-slate-900">{item.name}</p>
                      <p className="mt-1 text-[10px] font-bold text-slate-400">
                        فاتورة #{item.source_invoice_id.slice(0, 8)} - {new Date(item.source_invoice_date).toLocaleDateString("ar-EG")}
                      </p>
                    </div>
                    <div className="text-left">
                      <p className="text-xs font-black text-amber-700">متاح {item.availableQty}</p>
                      <p className="text-[10px] font-bold text-slate-400">مخزن {item.stockQty}</p>
                      <p className="text-[10px] font-bold text-slate-400">{item.price.toLocaleString("ar-EG")} ج</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        <section className="min-w-0">
          <div className="app-invoice-table bg-white border border-slate-200 shadow-sm overflow-auto">
            {cart.length === 0 ? (
              <div className="flex h-64 flex-col items-center justify-center space-y-3 text-slate-300">
                <span className="text-5xl">↩</span>
                <p className="font-black">اختار أصناف من فواتير التوريد لعمل فاتورة مرتجع مورد</p>
              </div>
            ) : (
              <table className="w-full text-right border-collapse">
                <thead className="bg-slate-50 text-slate-400 font-black text-[10px] uppercase border-b border-slate-100">
                  <tr>
                    <th className="p-4">الصنف</th>
                    <th className="p-4 text-center">المتاح</th>
                    <th className="p-4 text-center">كمية المرتجع</th>
                    <th className="p-4 text-center">سعر الشراء</th>
                    <th className="p-4 text-left">الإجمالي</th>
                    <th className="p-4 w-8"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {cart.map((item, index) => {
                    const qty = Math.min(Math.max(Number(item.returnQty || 0), 0), item.availableQty);
                    const lineTotal = qty * item.price;
                    return (
                      <tr key={`${item.source_invoice_id}-${item.id}`}>
                        <td className="p-4">
                          <p className="font-black text-sm">{item.name}</p>
                          <p className="text-[9px] text-slate-400 font-bold">فاتورة #{item.source_invoice_id.slice(0, 8)}</p>
                        </td>
                        <td className="p-4 text-center font-black text-amber-700">{item.availableQty}</td>
                        <td className="p-4 text-center">
                          <input
                            type="number"
                            step="any"
                            min="0"
                            max={item.availableQty}
                            value={item.returnQty}
                            onChange={(event) => updateCartQty(index, event.target.value)}
                            className="w-24 rounded-xl border border-slate-200 bg-slate-50 p-2 text-center font-black outline-none focus:border-amber-400"
                          />
                        </td>
                        <td className="p-4 text-center font-bold text-slate-600">{item.price.toLocaleString("ar-EG")} ج</td>
                        <td className="p-4 text-left font-black">{lineTotal.toLocaleString("ar-EG")} ج</td>
                        <td className="p-4">
                          <button onClick={() => removeFromCart(index)} className="text-slate-300 hover:text-rose-500 transition-colors text-lg font-black">
                            x
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </section>

        <aside className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-2.5">
            <label className="block text-[10px] font-black text-slate-400 mb-1">نسبة خصم على مرتجع المورد</label>
            <div className="flex items-center gap-3">
              <input
                type="number"
                min="0"
                max="100"
                step="any"
                value={discountPercent}
                onChange={(event) => setDiscountPercent(event.target.value)}
                className="w-full bg-transparent font-black text-slate-900 outline-none text-lg"
                placeholder="0"
              />
              <span className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-black text-slate-500">%</span>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-2.5">
            <input
              placeholder="ملاحظة على مرتجع المورد (اختياري)..."
              className="w-full bg-transparent font-bold text-slate-700 outline-none text-sm placeholder:text-slate-300"
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </div>

          <div className="app-invoice-footer bg-[#0f172a] border border-slate-700 shadow-xl">
            <div className="grid grid-cols-1 gap-3 mb-4 text-white">
              <div>
                <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest mb-1">قبل الخصم</p>
                <p className="text-xl font-black text-slate-200">{subtotal.toLocaleString("ar-EG", { maximumFractionDigits: 2 })} <small className="text-xs opacity-70">ج</small></p>
              </div>
              <div>
                <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest mb-1">الخصم</p>
                <p className="text-xl font-black text-amber-200">{discountAmount.toLocaleString("ar-EG", { maximumFractionDigits: 2 })} <small className="text-xs opacity-70">ج ({discountRate}%)</small></p>
              </div>
              <div>
                <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest mb-1">صافي مرتجع المورد</p>
                <p className="text-3xl font-black text-amber-400">{total.toLocaleString("ar-EG", { maximumFractionDigits: 2 })} <small className="text-xs opacity-70">ج</small></p>
              </div>
              <div>
                <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest mb-1">تأثير رصيد المورد</p>
                <p className="text-xl font-black text-emerald-300">-{total.toLocaleString("ar-EG", { maximumFractionDigits: 2 })} <small className="text-xs opacity-70">ج</small></p>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3">
              <button
                onClick={() => saveReturn(true)}
                disabled={isSaving || total <= 0}
                className="app-btn app-btn-ghost app-btn-lg w-full"
              >
                {isSaving ? "جاري الحفظ..." : "حفظ وطباعة المرتجع"}
              </button>
              <button
                onClick={() => saveReturn(false)}
                disabled={isSaving || total <= 0}
                className="app-btn app-btn-warning app-btn-lg w-full"
              >
                {isSaving ? "جاري الحفظ..." : "حفظ واعتماد المرتجع"}
              </button>
            </div>
          </div>
        </aside>
      </main>

      <section className="print-invoice hidden" dir="rtl">
        <div className="print-card">
          <div className="print-header">
            <div>
              <p className="print-eyebrow">فاتورة مرتجع مورد {productCategoryLabel(activeCategory)}</p>
              <h1>منظومة إدارة المحل التجاري</h1>
              <p>إدارة الموردين والأصناف</p>
            </div>
            <div className="print-meta">
              <p>التاريخ: {new Date().toLocaleDateString("ar-EG")}</p>
              <p>المورد: {supplier?.name || "-"}</p>
              <p>الرصيد الحالي: {(supplier?.balance || 0).toLocaleString("ar-EG")} ج.م</p>
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
              {normalizedCart.filter((item) => item.qty > 0).map((item) => (
                <tr key={`${item.source_invoice_id}-${item.id}`}>
                  <td>{item.name}</td>
                  <td>{item.unit || "-"}</td>
                  <td>{item.qty.toLocaleString("ar-EG")}</td>
                  <td>{item.price.toLocaleString("ar-EG")} ج</td>
                  <td>{(item.qty * item.price).toLocaleString("ar-EG")} ج</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="print-summary">
            <p><span>إجمالي قبل الخصم</span><b>{subtotal.toLocaleString("ar-EG", { maximumFractionDigits: 2 })} ج</b></p>
            <p><span>الخصم ({discountRate}%)</span><b>{discountAmount.toLocaleString("ar-EG", { maximumFractionDigits: 2 })} ج</b></p>
            <p className="print-total"><span>صافي مرتجع المورد</span><b>{total.toLocaleString("ar-EG", { maximumFractionDigits: 2 })} ج</b></p>
          </div>
          {note && <p className="print-note">ملاحظة: {note}</p>}
        </div>
      </section>
    </div>
  );
}
