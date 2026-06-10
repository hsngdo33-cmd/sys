"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Barcode,
  Boxes,
  PackageSearch,
  RefreshCw,
  TrendingDown,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { supabase } from "@/lib/supabase";
import { normalizeProductCategory, productCategoryLabel } from "@/lib/product-category";

type ProductRow = {
  id: string;
  name: string;
  unit: string | null;
  barcode: string | null;
  purchase_price: number | string | null;
  sale_price: number | string | null;
  stock_quantity: number | string | null;
  product_category: string | null;
};

type HealthFilter = "all" | "low" | "negative" | "barcode" | "pricing";

const LOW_STOCK_LIMIT = 5;
const CHART_COLORS = ["#059669", "#2563eb", "#d97706", "#dc2626", "#7c3aed", "#475569"];

function num(value: unknown) {
  return Number(value || 0);
}

function money(value: unknown) {
  return num(value).toLocaleString("ar-EG", { maximumFractionDigits: 2 });
}

function margin(product: ProductRow) {
  const sale = num(product.sale_price);
  const purchase = num(product.purchase_price);
  if (sale <= 0) return 0;
  return Math.round(((sale - purchase) / sale) * 100);
}

function productIssues(product: ProductRow) {
  const issues: string[] = [];
  const stock = num(product.stock_quantity);
  const sale = num(product.sale_price);
  const purchase = num(product.purchase_price);

  if (stock < 0) issues.push("مخزون سالب");
  if (stock >= 0 && stock <= LOW_STOCK_LIMIT) issues.push("قرب يخلص");
  if (!product.barcode) issues.push("بدون باركود");
  if (purchase <= 0 || sale <= 0) issues.push("سعر ناقص");
  if (sale > 0 && purchase > sale) issues.push("بيع بخسارة");
  if (sale > 0 && purchase > 0 && margin(product) < 10) issues.push("هامش ضعيف");

  return issues;
}

function filterProduct(product: ProductRow, filter: HealthFilter) {
  const stock = num(product.stock_quantity);
  const sale = num(product.sale_price);
  const purchase = num(product.purchase_price);

  if (filter === "low") return stock >= 0 && stock <= LOW_STOCK_LIMIT;
  if (filter === "negative") return stock < 0;
  if (filter === "barcode") return !product.barcode;
  if (filter === "pricing") return purchase <= 0 || sale <= 0 || purchase > sale || margin(product) < 10;
  return true;
}

export default function InventoryHealthReportPage() {
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [filter, setFilter] = useState<HealthFilter>("all");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const { data, error: productsError } = await supabase
        .from("products")
        .select("id,name,unit,barcode,purchase_price,sale_price,stock_quantity,product_category")
        .order("name");

      if (productsError) throw productsError;
      setProducts((data || []) as ProductRow[]);
    } catch (loadError) {
      setProducts([]);
      setError(loadError instanceof Error ? loadError.message : "تعذر تحميل تقرير صحة المخزون.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setMounted(true);
    void loadData();
  }, [loadData]);

  const summary = useMemo(() => {
    const lowStock = products.filter((product) => {
      const stock = num(product.stock_quantity);
      return stock >= 0 && stock <= LOW_STOCK_LIMIT;
    });
    const negativeStock = products.filter((product) => num(product.stock_quantity) < 0);
    const missingBarcode = products.filter((product) => !product.barcode);
    const pricingIssues = products.filter((product) => filterProduct(product, "pricing"));
    const stockValue = products.reduce(
      (sum, product) => sum + num(product.stock_quantity) * num(product.purchase_price),
      0,
    );
    const saleValue = products.reduce(
      (sum, product) => sum + num(product.stock_quantity) * num(product.sale_price),
      0,
    );

    return {
      total: products.length,
      lowStock: lowStock.length,
      negativeStock: negativeStock.length,
      missingBarcode: missingBarcode.length,
      pricingIssues: pricingIssues.length,
      stockValue,
      potentialSaleValue: saleValue,
      potentialMargin: saleValue > 0 ? Math.round(((saleValue - stockValue) / saleValue) * 100) : 0,
    };
  }, [products]);

  const categoryData = useMemo(() => {
    const map = new Map<string, { name: string; value: number; risk: number }>();
    products.forEach((product) => {
      const name = productCategoryLabel(normalizeProductCategory(product.product_category));
      const current = map.get(name) || { name, value: 0, risk: 0 };
      current.value += 1;
      if (productIssues(product).length > 0) current.risk += 1;
      map.set(name, current);
    });
    return [...map.values()].sort((a, b) => b.value - a.value);
  }, [products]);

  const riskRows = useMemo(() => {
    const safeQuery = query.trim().toLowerCase();

    return products
      .map((product) => ({ product, issues: productIssues(product) }))
      .filter((row) => row.issues.length > 0 && filterProduct(row.product, filter))
      .filter(({ product, issues }) => {
        if (!safeQuery) return true;
        return [
          product.name,
          product.barcode || "",
          product.unit || "",
          productCategoryLabel(normalizeProductCategory(product.product_category)),
          issues.join(" "),
        ]
          .join(" ")
          .toLowerCase()
          .includes(safeQuery);
      })
      .sort((a, b) => b.issues.length - a.issues.length || num(a.product.stock_quantity) - num(b.product.stock_quantity))
      .slice(0, 200);
  }, [filter, products, query]);

  const filterCards = [
    { key: "all" as const, title: "كل الأصناف", value: summary.total, icon: Boxes },
    { key: "low" as const, title: "مخزون منخفض", value: summary.lowStock, icon: TrendingDown },
    { key: "negative" as const, title: "مخزون سالب", value: summary.negativeStock, icon: AlertTriangle },
    { key: "barcode" as const, title: "بدون باركود", value: summary.missingBarcode, icon: Barcode },
    { key: "pricing" as const, title: "مشاكل تسعير", value: summary.pricingIssues, icon: PackageSearch },
  ];

  return (
    <div className="min-h-[calc(100vh-8rem)] bg-slate-50 text-right" dir="rtl">
      <div className="mx-auto max-w-7xl space-y-5 px-4 py-5">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700">
                <PackageSearch className="h-7 w-7" />
              </div>
              <p className="text-xs font-black text-indigo-600">تقارير المخزون</p>
              <h1 className="mt-1 text-2xl font-black text-slate-950">تقرير صحة المخزون</h1>
              <p className="mt-2 max-w-3xl text-sm font-bold leading-7 text-slate-500">
                راجع الأصناف التي تحتاج قرار سريع: كمية منخفضة، مخزون سالب، باركود ناقص، أو تسعير غير صحي.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={loadData}
                disabled={loading}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 text-sm font-black text-white hover:bg-indigo-600 disabled:opacity-60"
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
            <h2 className="text-lg font-black text-slate-950">مؤشرات الصحة</h2>
            <p className="mt-1 text-xs font-bold text-slate-500">اضغط على أي مؤشر لتصفية الأصناف التي تحتاج متابعة.</p>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {filterCards.map((card) => {
            const Icon = card.icon;
            const selected = filter === card.key;
            return (
              <button
                key={card.key}
                type="button"
                onClick={() => setFilter(card.key)}
                className={`rounded-xl border p-4 text-right transition ${
                  selected ? "border-indigo-200 bg-indigo-50" : "border-slate-200 bg-white hover:border-indigo-100"
                }`}
              >
                <Icon className={`mb-3 h-6 w-6 ${selected ? "text-indigo-700" : "text-slate-400"}`} />
                <p className="text-xs font-black text-slate-400">{card.title}</p>
                <p className="mt-2 text-2xl font-black text-slate-950">{card.value.toLocaleString("ar-EG")}</p>
              </button>
            );
          })}
          </div>
        </section>

        <section className="grid gap-5 xl:grid-cols-[1fr_1fr]">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-black text-slate-950">قيمة المخزون</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <MiniStat label="تكلفة حالية" value={`${money(summary.stockValue)} ج`} />
              <MiniStat label="قيمة بيع محتملة" value={`${money(summary.potentialSaleValue)} ج`} />
              <MiniStat label="هامش تقديري" value={`${summary.potentialMargin.toLocaleString("ar-EG")}%`} />
            </div>
            <p className="mt-4 rounded-xl bg-slate-50 p-4 text-xs font-bold leading-6 text-slate-500">
              الأرقام دي تقديرية بناءً على الكمية الحالية وسعر الشراء والبيع المسجلين على الصنف.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-black text-slate-950">الأقسام الأكثر مخاطرة</h2>
            <div className="mt-4 grid gap-4 lg:grid-cols-[0.8fr_1fr]">
              <div className="h-56">
                {mounted ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={categoryData} dataKey="risk" nameKey="name" innerRadius={42} outerRadius={78} paddingAngle={4}>
                        {categoryData.map((entry, index) => (
                          <Cell key={entry.name} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value) => [`${value} صنف`, "مخاطر"]} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : null}
              </div>
              <div className="h-56">
                {mounted ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={categoryData.slice(0, 6)} layout="vertical" margin={{ top: 5, right: 8, left: 8, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis type="number" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                      <YAxis type="category" dataKey="name" width={86} tick={{ fontSize: 11 }} stroke="#94a3b8" />
                      <Tooltip formatter={(value) => [`${value} صنف`, "مخاطر"]} />
                      <Bar dataKey="risk" fill="#4f46e5" radius={[8, 8, 8, 8]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : null}
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="text-xl font-black text-slate-950">الأصناف التي تحتاج متابعة</h2>
              <p className="text-xs font-bold text-slate-500">مرتبة حسب عدد المشاكل وخطورة الكمية، مع بحث مباشر داخل الجدول.</p>
            </div>
            <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto lg:items-center">
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="ابحث بالاسم أو الباركود أو نوع المشكلة"
                className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold text-slate-800 outline-none focus:border-indigo-400 sm:w-80"
              />
              <span className="inline-flex h-11 items-center justify-center rounded-xl bg-slate-100 px-4 text-xs font-black text-slate-600">
                {riskRows.length.toLocaleString("ar-EG")} صنف ظاهر
              </span>
            </div>
          </div>

          {loading ? (
            <div className="rounded-xl bg-slate-50 p-8 text-center text-sm font-black text-slate-400">جاري تحميل المخزون...</div>
          ) : riskRows.length === 0 ? (
            <div className="rounded-xl bg-emerald-50 p-8 text-center text-sm font-black text-emerald-700">
              لا توجد مشاكل واضحة في الفلتر الحالي.
            </div>
          ) : (
            <div className="max-h-[540px] overflow-auto rounded-2xl border border-slate-100">
              <table className="w-full min-w-[920px] text-right text-sm">
                <thead className="sticky top-0 z-10 bg-slate-50 text-[11px] font-black text-slate-500">
                  <tr>
                    <th className="p-3">الصنف</th>
                    <th className="p-3">المشاكل</th>
                    <th className="p-3">الكمية</th>
                    <th className="p-3">شراء</th>
                    <th className="p-3">بيع</th>
                    <th className="p-3">هامش</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {riskRows.map(({ product, issues }) => (
                    <tr key={product.id} className="align-top hover:bg-slate-50/70">
                      <td className="p-3">
                        <p className="font-black text-slate-950">{product.name}</p>
                        <p className="mt-1 text-xs font-bold text-slate-400">
                          {productCategoryLabel(normalizeProductCategory(product.product_category))} - {product.unit || "وحدة"}
                          {product.barcode ? ` - ${product.barcode}` : ""}
                        </p>
                      </td>
                      <td className="p-3">
                        <div className="flex max-w-md flex-wrap gap-2">
                          {issues.map((issue) => (
                            <span key={issue} className="rounded-xl bg-amber-50 px-3 py-1 text-xs font-black text-amber-700">
                              {issue}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="p-3 font-black text-slate-900">{money(product.stock_quantity)} {product.unit || ""}</td>
                      <td className="p-3 font-black text-slate-700">{money(product.purchase_price)} ج</td>
                      <td className="p-3 font-black text-slate-700">{money(product.sale_price)} ج</td>
                      <td className={`p-3 font-black ${margin(product) <= 0 ? "text-rose-700" : "text-emerald-700"}`}>
                        {margin(product).toLocaleString("ar-EG")}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <p className="text-[11px] font-black text-slate-400">{label}</p>
      <p className="mt-1 text-sm font-black text-slate-950">{value}</p>
    </div>
  );
}
