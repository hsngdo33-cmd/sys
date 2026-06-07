"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { PRODUCT_CATEGORIES, ProductCategory, normalizeProductCategory, productCategoryLabel } from "@/lib/product-category";

type Customer = {
  id: string;
  name: string;
  balance?: number;
};

type SaleItem = {
  id: string;
  name: string;
  unit?: string;
  qty: number;
  price: number;
  cost: number;
  source_invoice_id: string;
  source_invoice_date: string;
  returnedQty: number;
  availableQty: number;
  product_category?: ProductCategory | string | null;
};

type ReturnItem = SaleItem & {
  returnQty: number | string;
};

const SALE_TYPES = ["sale", "بيع"];
const RETURN_TYPES = ["return", "مرتجع"];

export default function CustomerReturnInvoicePage() {
  const { id } = useParams();
  const router = useRouter();

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [activeCategory, setActiveCategory] = useState<ProductCategory>("general");
  const [searchTerm, setSearchTerm] = useState("");
  const [cart, setCart] = useState<ReturnItem[]>([]);
  const [note, setNote] = useState("");
  const [discountPercent, setDiscountPercent] = useState<number | string>(0);
  const [isSaving, setIsSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [{ data: cust }, { data: trans }] = await Promise.all([
      supabase.from("customers").select("*").eq("id", id).single(),
      supabase
        .from("customer_transactions")
        .select("*")
        .eq("customer_id", id)
        .order("created_at", { ascending: false }),
    ]);

    setCustomer(cust);
    setTransactions(trans || []);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    if (id) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      loadData();
    }
  }, [id, loadData]);

  const soldItems = useMemo<SaleItem[]>(() => {
    const returns = transactions.filter((tx) => RETURN_TYPES.includes(tx.type));

    return transactions
      .filter((tx) => SALE_TYPES.includes(tx.type))
      .flatMap((invoice) =>
        (invoice.items || []).map((item: any) => {
          const sourceInvoiceId = String(invoice.id || "");
          const itemId = String(item.id || "");
          const soldQty = Number(item.qty || 0);
          const returnedQty = returns
            .flatMap((tx) => tx.items || [])
            .filter((returned: any) => String(returned.source_invoice_id || "") === sourceInvoiceId)
            .filter((returned: any) => String(returned.id || "") === itemId)
            .reduce((sum: number, returned: any) => sum + Number(returned.qty || 0), 0);
          const availableQty = Math.max(soldQty - returnedQty, 0);

          return {
            id: itemId,
            name: item.name || "صنف بدون اسم",
            unit: item.unit || "",
            qty: soldQty,
            price: Number(item.price || 0),
            cost: Number(item.cost || 0),
            product_category: normalizeProductCategory(item.product_category),
            source_invoice_id: sourceInvoiceId,
            source_invoice_date: invoice.created_at,
            returnedQty,
            availableQty,
          };
        }),
      )
      .filter((item) => item.availableQty > 0)
      .filter((item) => normalizeProductCategory(item.product_category) === activeCategory);
  }, [transactions, activeCategory]);

  const filteredItems = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return soldItems;

    return soldItems.filter((item) =>
      item.name.toLowerCase().includes(term) ||
      item.source_invoice_id.toLowerCase().includes(term),
    );
  }, [soldItems, searchTerm]);

  const addToCart = (item: SaleItem) => {
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
  const profitImpact = normalizedCart.reduce((sum, item) => {
    return sum + item.qty * (Number(item.price || 0) - Number(item.cost || 0));
  }, 0) - discountAmount;

  const saveReturn = async (printAfterSave = false) => {
    if (!customer) return alert("بيانات العميل لم تحمل بعد");
    if (isSaving) return;

    const itemsToSave = normalizedCart
      .filter((item) => item.qty > 0)
      .map((item) => ({
        id: item.id,
        name: item.name,
        unit: item.unit,
        qty: item.qty,
        price: Number(item.price || 0),
        cost: Number(item.cost || 0),
        product_category: normalizeProductCategory(item.product_category),
        source_invoice_id: item.source_invoice_id,
      }));

    if (itemsToSave.length === 0) {
      alert("اختار صنف واحد على الأقل للمرتجع.");
      return;
    }

    setIsSaving(true);
    try {
      const { data: currentCustomer, error: readError } = await supabase
        .from("customers")
        .select("balance")
        .eq("id", id)
        .single();
      if (readError) throw readError;

      const description = note.trim()
        ? `${note.trim()} - فاتورة مرتجع${discountRate > 0 ? ` - خصم ${discountRate}%` : ""}`
        : `فاتورة مرتجع${discountRate > 0 ? ` - خصم ${discountRate}%` : ""}`;

      const { error: insertError } = await supabase.from("customer_transactions").insert([{
        customer_id: id,
        amount: total,
        type: "return",
        description,
        items: itemsToSave,
        profit: -profitImpact,
      }]);
      if (insertError) throw insertError;

      for (const item of itemsToSave) {
        await supabase.rpc("increment_stock", { row_id: item.id, amount: item.qty });
      }

      const { error: balanceError } = await supabase
        .from("customers")
        .update({ balance: Number(currentCustomer?.balance || 0) - total })
        .eq("id", id);
      if (balanceError) throw balanceError;

      if (printAfterSave) {
        window.print();
        window.setTimeout(() => router.push(`/customer/${id}/history`), 300);
      } else {
        router.push(`/customer/${id}/history`);
      }
    } catch (error) {
      console.error(error);
      alert("حدث خطأ أثناء حفظ فاتورة المرتجع");
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f1f5f9] flex items-center justify-center text-slate-400 font-black" dir="rtl">
        جاري تحميل بيانات المرتجع...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f1f5f9] text-right font-sans text-slate-900 pb-10" dir="rtl">
      <header className="bg-[#0f172a] text-white px-5 py-4 flex justify-between items-center shadow-xl sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <Link href="/customer" className="bg-white/10 hover:bg-white/20 px-4 py-2 rounded-xl text-xs font-black transition-all">
            رجوع
          </Link>
          <div>
            <h1 className="text-lg font-black">فاتورة مرتجع {productCategoryLabel(activeCategory)}: {customer?.name}</h1>
            <p className="text-[10px] text-slate-400 font-bold">
              {new Date().toLocaleDateString("ar-EG", { weekday: "long", day: "numeric", month: "long" })}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {cart.length > 0 && (
            <span className="bg-amber-500 px-3 py-1 rounded-lg text-[10px] font-black">{cart.length} صنف</span>
          )}
          <div className={`px-4 py-1.5 rounded-lg text-[10px] font-black ${(customer?.balance || 0) > 0 ? "bg-rose-600" : "bg-emerald-600"}`}>
            رصيد العميل: {customer?.balance?.toLocaleString("ar-EG")} ج.م
          </div>
        </div>
      </header>

      <main className="app-invoice-layout max-w-[1500px] mx-auto p-4 mt-3">
        <aside className="app-invoice-sidebar bg-white border border-slate-200 shadow-sm flex flex-col">
          <div className="p-4 border-b border-slate-100 space-y-3">
            <h3 className="font-black text-slate-400 text-[10px] uppercase tracking-widest">اختيار الأصناف المرتجعة</h3>
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
              placeholder="ابحث باسم الصنف أو رقم الفاتورة..."
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-900 outline-none focus:border-amber-400 transition-all text-sm"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
          </div>
          <div className="overflow-y-auto flex-1 p-3 space-y-2">
            {filteredItems.length === 0 ? (
              <div className="p-6 text-center text-slate-300 font-black">لا توجد أصناف متاحة للمرتجع</div>
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
                <p className="font-black">اختار أصناف من الجانب لعمل فاتورة مرتجع</p>
              </div>
            ) : (
              <table className="w-full text-right border-collapse">
                <thead className="bg-slate-50 text-slate-400 font-black text-[10px] uppercase border-b border-slate-100">
                  <tr>
                    <th className="p-4">الصنف</th>
                    <th className="p-4 text-center">المتاح</th>
                    <th className="p-4 text-center">كمية المرتجع</th>
                    <th className="p-4 text-center">السعر</th>
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
            <label className="block text-[10px] font-black text-slate-400 mb-1">نسبة خصم على المرتجع</label>
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
              placeholder="ملاحظة على المرتجع (اختياري)..."
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
                <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest mb-1">صافي المرتجع</p>
                <p className="text-3xl font-black text-amber-400">{total.toLocaleString("ar-EG", { maximumFractionDigits: 2 })} <small className="text-xs opacity-70">ج</small></p>
              </div>
              <div>
                <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest mb-1">تأثير الربح</p>
                <p className="text-xl font-black text-rose-300">-{profitImpact.toLocaleString("ar-EG", { maximumFractionDigits: 2 })} <small className="text-xs opacity-70">ج</small></p>
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
              <p className="print-eyebrow">فاتورة مرتجع {productCategoryLabel(activeCategory)}</p>
              <h1>منظومة إدارة المحل التجاري</h1>
              <p>إدارة العملاء والمبيعات</p>
            </div>
            <div className="print-meta">
              <p>التاريخ: {new Date().toLocaleDateString("ar-EG")}</p>
              <p>العميل: {customer?.name || "-"}</p>
              <p>الرصيد الحالي: {(customer?.balance || 0).toLocaleString("ar-EG")} ج.م</p>
            </div>
          </div>
          <table className="print-table">
            <thead>
              <tr>
                <th>الصنف</th>
                <th>الوحدة</th>
                <th>الكمية</th>
                <th>السعر</th>
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
            <p className="print-total"><span>صافي المرتجع</span><b>{total.toLocaleString("ar-EG", { maximumFractionDigits: 2 })} ج</b></p>
          </div>
          {note && <p className="print-note">ملاحظة: {note}</p>}
        </div>
      </section>

      <style jsx global>{`
        @media print {
          @page { size: auto; margin: 6mm; }
          body * { visibility: hidden !important; }
          .print-invoice, .print-invoice * { visibility: visible !important; }
          .print-invoice { display: block !important; position: static !important; width: 100%; background: white; color: #0f172a; font-size: 10px; line-height: 1.35; }
          .print-card { width: 100%; border: 1px solid #dbe3ef; padding: 12px; border-radius: 10px; }
          .print-header { display: flex; justify-content: space-between; gap: 14px; border-bottom: 2px solid #0f172a; padding-bottom: 8px; margin-bottom: 10px; }
          .print-eyebrow { font-size: 9px; font-weight: 900; color: #d97706; margin: 0 0 3px; }
          .print-header h1 { margin: 0; font-size: 18px; font-weight: 900; }
          .print-header p { margin: 2px 0; font-weight: 700; font-size: 10px; }
          .print-meta { text-align: left; font-size: 10px; }
          .print-table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
          .print-table th { background: #0f172a; color: white; padding: 5px 6px; font-size: 9px; }
          .print-table td { border-bottom: 1px solid #e2e8f0; padding: 5px 6px; font-weight: 700; font-size: 9px; }
          .print-summary p { margin: 0; padding: 8px; border: 1px solid #e2e8f0; border-radius: 8px; font-weight: 800; }
          .print-total { background: #fffbeb; color: #b45309; }
          .print-note { margin-top: 8px; padding: 8px; background: #f8fafc; border-radius: 8px; font-weight: 700; font-size: 9px; }
        }
      `}</style>
    </div>
  );
}
