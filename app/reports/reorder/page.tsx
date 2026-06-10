"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Download,
  PackagePlus,
  RefreshCw,
  ShoppingBasket,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { normalizeProductCategory, productCategoryLabel } from "@/lib/product-category";

type ProductRow = {
  id: string;
  name: string;
  unit: string | null;
  barcode: string | null;
  supplier_id: string | null;
  purchase_price: number | string | null;
  stock_quantity: number | string | null;
  reorder_point: number | string | null;
  reorder_target: number | string | null;
  product_category: string | null;
};

type SupplierRow = {
  id: string;
  name: string;
  phone: string | null;
};

type ReorderRow = ProductRow & {
  currentStock: number;
  reorderPoint: number;
  reorderTarget: number;
  suggestedQty: number;
  estimatedCost: number;
  supplierName: string;
  supplierPhone: string | null;
};

const DEFAULT_REORDER_POINT = 5;
const DEFAULT_REORDER_TARGET = 10;

function num(value: unknown) {
  return Number(value || 0);
}

function money(value: unknown) {
  return num(value).toLocaleString("ar-EG", { maximumFractionDigits: 2 });
}

function csvCell(value: unknown) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function downloadCsv(rows: ReorderRow[]) {
  const headers = ["الصنف", "القسم", "المورد", "تليفون المورد", "المتاح", "حد الطلب", "الهدف", "المقترح", "الوحدة", "سعر الشراء", "التكلفة المتوقعة", "الباركود"];
  const body = rows.map((row) => [
    row.name,
    productCategoryLabel(normalizeProductCategory(row.product_category)),
    row.supplierName,
    row.supplierPhone || "",
    row.currentStock,
    row.reorderPoint,
    row.reorderTarget,
    row.suggestedQty,
    row.unit || "",
    row.purchase_price || 0,
    row.estimatedCost,
    row.barcode || "",
  ]);
  const csv = [headers, ...body].map((line) => line.map(csvCell).join(",")).join("\n");
  const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `reorder-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export default function ReorderReportPage() {
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierRow[]>([]);
  const [selectedSupplier, setSelectedSupplier] = useState("all");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [productsResult, suppliersResult] = await Promise.all([
        supabase
          .from("products")
          .select("id,name,unit,barcode,supplier_id,purchase_price,stock_quantity,reorder_point,reorder_target,product_category")
          .order("name"),
        supabase.from("suppliers").select("id,name,phone").order("name"),
      ]);

      if (productsResult.error) throw productsResult.error;
      if (suppliersResult.error) throw suppliersResult.error;

      setProducts((productsResult.data || []) as ProductRow[]);
      setSuppliers((suppliersResult.data || []) as SupplierRow[]);
    } catch (loadError) {
      setProducts([]);
      setSuppliers([]);
      const message =
        loadError instanceof Error
          ? loadError.message
          : typeof loadError === "object" && loadError && "message" in loadError
            ? String(loadError.message)
            : "";
      setError(
        message.includes("reorder_point") || message.includes("reorder_target") || message.includes("schema cache")
          ? "إعدادات إعادة التوريد غير مفعلة على قاعدة البيانات. تواصل مع مسؤول النظام ثم اضغط تحديث."
          : message || "تعذر تحميل توصيات إعادة التوريد.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const supplierMap = useMemo(() => {
    return new Map(suppliers.map((supplier) => [supplier.id, supplier]));
  }, [suppliers]);

  const reorderRows = useMemo(() => {
    const safeQuery = query.trim().toLowerCase();

    return products
      .map((product) => {
        const currentStock = num(product.stock_quantity);
        const reorderPoint = num(product.reorder_point || DEFAULT_REORDER_POINT);
        const reorderTarget = Math.max(num(product.reorder_target || DEFAULT_REORDER_TARGET), reorderPoint);
        const suggestedQty = Math.max(reorderTarget - currentStock, 0);
        const supplier = product.supplier_id ? supplierMap.get(product.supplier_id) : null;

        return {
          ...product,
          currentStock,
          reorderPoint,
          reorderTarget,
          suggestedQty,
          estimatedCost: suggestedQty * num(product.purchase_price),
          supplierName: supplier?.name || "بدون مورد",
          supplierPhone: supplier?.phone || null,
        };
      })
      .filter((row) => row.currentStock <= row.reorderPoint && row.suggestedQty > 0)
      .filter((row) => selectedSupplier === "all" || row.supplier_id === selectedSupplier)
      .filter((row) => {
        if (!safeQuery) return true;
        return [
          row.name,
          row.barcode || "",
          row.supplierName,
          row.unit || "",
          productCategoryLabel(normalizeProductCategory(row.product_category)),
        ]
          .join(" ")
          .toLowerCase()
          .includes(safeQuery);
      })
      .sort((a, b) => a.supplierName.localeCompare(b.supplierName, "ar") || a.currentStock - b.currentStock);
  }, [products, query, selectedSupplier, supplierMap]);

  const totals = useMemo(() => {
    return reorderRows.reduce(
      (acc, row) => {
        acc.items += 1;
        acc.qty += row.suggestedQty;
        acc.cost += row.estimatedCost;
        if (!row.supplier_id) acc.withoutSupplier += 1;
        return acc;
      },
      { items: 0, qty: 0, cost: 0, withoutSupplier: 0 },
    );
  }, [reorderRows]);

  return (
    <div className="min-h-[calc(100vh-8rem)] bg-slate-50 text-right" dir="rtl">
      <div className="mx-auto max-w-7xl space-y-5 px-4 py-5">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
                <PackagePlus className="h-7 w-7" />
              </div>
              <p className="text-xs font-black text-amber-600">قرارات التوريد</p>
              <h1 className="mt-1 text-2xl font-black text-slate-950">توصيات إعادة التوريد</h1>
              <p className="mt-2 max-w-3xl text-sm font-bold leading-7 text-slate-500">
                قائمة شراء مقترحة حسب حد إعادة الطلب والكمية المستهدفة المسجلة لكل صنف، مع تكلفة تقريبية وتجميع حسب المورد.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => downloadCsv(reorderRows)}
                disabled={reorderRows.length === 0}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-amber-600 px-5 text-sm font-black text-white hover:bg-amber-500 disabled:bg-slate-300"
              >
                <Download className="h-5 w-5" />
                تصدير CSV
              </button>
              <button
                type="button"
                onClick={loadData}
                disabled={loading}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 text-sm font-black text-white hover:bg-amber-600 disabled:opacity-60"
              >
                <RefreshCw className={`h-5 w-5 ${loading ? "animate-spin" : ""}`} />
                تحديث
              </button>
              <Link
                href="/reports/inventory"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-slate-100 px-5 text-sm font-black text-slate-700 hover:bg-slate-200"
              >
                <ArrowRight className="h-5 w-5" />
                رجوع للتقارير
              </Link>
            </div>
          </div>
        </section>

        {error && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-black text-rose-700">
            {error}
          </div>
        )}

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-4">
            <h2 className="text-lg font-black text-slate-950">ملخص النواقص</h2>
            <p className="mt-1 text-xs font-bold text-slate-500">فلتر حسب المورد وراجع الكمية المقترحة والتكلفة قبل الشراء.</p>
          </div>
          <div className="grid gap-3 lg:grid-cols-[1fr_3fr]">
            <label className="block">
              <span className="mb-1 block text-xs font-black text-slate-500">فلترة المورد</span>
              <select
                value={selectedSupplier}
                onChange={(event) => setSelectedSupplier(event.target.value)}
                className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold outline-none focus:border-amber-400"
              >
                <option value="all">كل الموردين</option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </select>
            </label>

            <div className="grid gap-3 md:grid-cols-4">
              <SummaryCard title="أصناف مطلوبة" value={totals.items.toLocaleString("ar-EG")} />
              <SummaryCard title="كمية مقترحة" value={totals.qty.toLocaleString("ar-EG")} />
              <SummaryCard title="تكلفة تقديرية" value={`${money(totals.cost)} ج`} />
              <SummaryCard title="بدون مورد" value={totals.withoutSupplier.toLocaleString("ar-EG")} />
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="text-xl font-black text-slate-950">قائمة التوريد</h2>
              <p className="text-xs font-bold text-slate-500">كل الأصناف المطلوبة في جدول واحد مع بحث وفلتر المورد.</p>
            </div>
            <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto lg:items-center">
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="ابحث بالاسم أو الباركود أو المورد"
                className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold text-slate-800 outline-none focus:border-amber-400 sm:w-80"
              />
              <span className="inline-flex h-11 items-center justify-center rounded-xl bg-slate-100 px-4 text-xs font-black text-slate-600">
                {reorderRows.length.toLocaleString("ar-EG")} صنف ظاهر
              </span>
            </div>
          </div>

          {loading ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm font-black text-slate-400 shadow-sm">
              جاري تجهيز توصيات التوريد...
            </div>
          ) : error ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-10 text-center text-sm font-black leading-7 text-amber-800">
              حدّث قاعدة البيانات من ملف الترقية ثم اضغط تحديث لعرض توصيات إعادة التوريد.
            </div>
          ) : reorderRows.length === 0 ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-10 text-center text-sm font-black text-emerald-700">
              لا توجد أصناف تحتاج توريد حسب الحد الحالي.
            </div>
          ) : (
            <div className="max-h-[560px] overflow-auto rounded-2xl border border-slate-100">
              <table className="w-full min-w-[1040px] text-right text-sm">
                <thead className="sticky top-0 z-10 bg-slate-50 text-[11px] font-black text-slate-500">
                  <tr>
                    <th className="p-3">الصنف</th>
                    <th className="p-3">المورد</th>
                    <th className="p-3">المتاح</th>
                    <th className="p-3">حد الطلب</th>
                    <th className="p-3">الهدف</th>
                    <th className="p-3">المطلوب</th>
                    <th className="p-3">سعر الشراء</th>
                    <th className="p-3">التكلفة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {reorderRows.map((row) => (
                    <tr key={row.id} className="align-top hover:bg-slate-50/70">
                      <td className="p-3">
                        <p className="font-black text-slate-950">{row.name}</p>
                        <p className="mt-1 text-xs font-bold text-slate-400">
                          {productCategoryLabel(normalizeProductCategory(row.product_category))} - {row.barcode || "بدون باركود"}
                        </p>
                      </td>
                      <td className="p-3">
                        <span className={`inline-flex rounded-xl px-3 py-1 text-xs font-black ${row.supplier_id ? "bg-amber-50 text-amber-700" : "bg-rose-50 text-rose-700"}`}>
                          {row.supplierName}
                        </span>
                        {row.supplierPhone && <p className="mt-2 text-xs font-bold text-slate-400">{row.supplierPhone}</p>}
                      </td>
                      <td className="p-3 font-black text-slate-900">{money(row.currentStock)} {row.unit || ""}</td>
                      <td className="p-3 font-black text-slate-700">{money(row.reorderPoint)} {row.unit || ""}</td>
                      <td className="p-3 font-black text-slate-700">{money(row.reorderTarget)} {row.unit || ""}</td>
                      <td className="p-3 font-black text-amber-700">{money(row.suggestedQty)} {row.unit || ""}</td>
                      <td className="p-3 font-black text-slate-700">{money(row.purchase_price)} ج</td>
                      <td className="p-3 font-black text-slate-950">{money(row.estimatedCost)} ج</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm font-bold leading-7 text-amber-900">
          <div className="flex items-start gap-3">
            <ShoppingBasket className="mt-1 h-5 w-5 shrink-0" />
            <p>
              التوصيات تقرأ حد إعادة الطلب والكمية المستهدفة من بيانات كل صنف. لو الصنف لسه ملوش إعدادات، السيستم يستخدم افتراضيا حد {DEFAULT_REORDER_POINT} وهدف {DEFAULT_REORDER_TARGET}. راجع سرعة البيع والمواسم قبل تنفيذ الشراء.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}

function SummaryCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 p-4">
      <p className="text-xs font-black text-slate-400">{title}</p>
      <p className="mt-2 text-xl font-black text-slate-950">{value}</p>
    </div>
  );
}
