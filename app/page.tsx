"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Boxes,
  RefreshCw,
  ShoppingCart,
  TrendingUp,
  WalletCards,
} from "lucide-react";
import {
  Area,
  AreaChart,
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
import { CashShiftWidget } from "@/app/cash-shift-widget";
import { useStaffSession } from "@/app/staff-session";
import { canViewProfitControls } from "@/lib/permissions";

type RangeDays = 14 | 30 | 90;
type MetricKey = "sales" | "profit" | "collected";

type CustomerRow = { balance: number | string | null };
type SupplierRow = { balance: number | string | null };
type ProductRow = {
  id: string;
  name: string;
  unit: string | null;
  stock_quantity: number | string | null;
  product_category: string | null;
};
type CustomerTx = {
  created_at: string;
  amount: number | string | null;
  profit: number | string | null;
  type: string | null;
  items: unknown;
};

type TrendPoint = {
  date: string;
  label: string;
  sales: number;
  profit: number;
  collected: number;
  invoices: number;
};

type TopProduct = {
  name: string;
  qty: number;
  revenue: number;
};

const SALE_TYPES = new Set(["sale", "بيع"]);
const PAYMENT_TYPES = new Set(["payment", "تحصيل نقدي", "تحصيل", "دفع"]);
const CHART_COLORS = ["#0f766e", "#2563eb", "#d97706", "#be123c", "#7c3aed", "#475569"];

function num(value: unknown) {
  return Number(value) || 0;
}

function money(value: number) {
  return value.toLocaleString("ar-EG", { maximumFractionDigits: 2 });
}

function shortMoney(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}م`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}ك`;
  return money(value);
}

function inputDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function isSale(type: string | null) {
  const safeType = type || "";
  return SALE_TYPES.has(safeType) || safeType.includes("بيع");
}

function isPayment(type: string | null) {
  const safeType = type || "";
  return PAYMENT_TYPES.has(safeType) || safeType.includes("تحصيل") || safeType.includes("دفع");
}

function parseItems(items: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(items)) return items.filter((item): item is Record<string, unknown> => !!item && typeof item === "object");
  if (typeof items !== "string") return [];

  try {
    const parsed = JSON.parse(items) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
      : [];
  } catch {
    return [];
  }
}

function makeTrend(rangeDays: RangeDays, txs: CustomerTx[]) {
  const today = new Date();
  const points = new Map<string, TrendPoint>();

  for (let offset = rangeDays - 1; offset >= 0; offset -= 1) {
    const day = new Date(today);
    day.setDate(today.getDate() - offset);
    const key = inputDate(day);
    points.set(key, {
      date: key,
      label: day.toLocaleDateString("ar-EG", { day: "numeric", month: "short" }),
      sales: 0,
      profit: 0,
      collected: 0,
      invoices: 0,
    });
  }

  txs.forEach((tx) => {
    const key = inputDate(new Date(tx.created_at));
    const point = points.get(key);
    if (!point) return;

    if (isSale(tx.type)) {
      point.sales += num(tx.amount);
      point.profit += num(tx.profit);
      point.invoices += 1;
    }

    if (isPayment(tx.type)) {
      point.collected += num(tx.amount);
    }
  });

  return [...points.values()];
}

function getTopProducts(txs: CustomerTx[]) {
  const productMap = new Map<string, TopProduct>();

  txs.filter((tx) => isSale(tx.type)).forEach((tx) => {
    parseItems(tx.items).forEach((item) => {
      const name = String(item.name || "صنف غير مسمى");
      const qty = num(item.qty);
      const price = num(item.price || item.sale_price);
      const revenue = price > 0 ? qty * price : num(item.total);
      const current = productMap.get(name) || { name, qty: 0, revenue: 0 };
      current.qty += qty;
      current.revenue += revenue;
      productMap.set(name, current);
    });
  });

  return [...productMap.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 5);
}

export default function Dashboard() {
  const staff = useStaffSession();
  const canViewProfit = canViewProfitControls(staff?.role);
  const [rangeDays, setRangeDays] = useState<RangeDays>(30);
  const [metric, setMetric] = useState<MetricKey>("sales");
  const [loading, setLoading] = useState(true);
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierRow[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [transactions, setTransactions] = useState<CustomerTx[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchDashboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeDays]);

  useEffect(() => {
    if (!canViewProfit && metric === "profit") {
      setMetric("sales");
    }
  }, [canViewProfit, metric]);

  async function fetchDashboard() {
    setLoading(true);
    setError(null);

    const since = new Date();
    since.setDate(since.getDate() - rangeDays + 1);
    since.setHours(0, 0, 0, 0);

    try {
      const [{ data: customersData }, { data: suppliersData }, { data: productsData }, { data: txData }] =
        await Promise.all([
          supabase.from("customers").select("balance"),
          supabase.from("suppliers").select("balance"),
          supabase.from("products").select("id,name,unit,stock_quantity,product_category"),
          supabase
            .from("customer_transactions")
            .select("created_at,amount,profit,type,items")
            .gte("created_at", since.toISOString())
            .order("created_at", { ascending: true }),
        ]);

      setCustomers((customersData || []) as CustomerRow[]);
      setSuppliers((suppliersData || []) as SupplierRow[]);
      setProducts((productsData || []) as ProductRow[]);
      setTransactions((txData || []) as CustomerTx[]);
    } catch (dashboardError) {
      console.error(dashboardError);
      setError("تعذر تحميل بيانات الداشبورد");
    } finally {
      setLoading(false);
    }
  }

  const trend = useMemo(() => makeTrend(rangeDays, transactions), [rangeDays, transactions]);
  const topProducts = useMemo(() => getTopProducts(transactions), [transactions]);

  const stats = useMemo(() => {
    const salesTxs = transactions.filter((tx) => isSale(tx.type));
    const paymentTxs = transactions.filter((tx) => isPayment(tx.type));
    const revenue = salesTxs.reduce((sum, tx) => sum + num(tx.amount), 0);
    const profit = salesTxs.reduce((sum, tx) => sum + num(tx.profit), 0);
    const collected = paymentTxs.reduce((sum, tx) => sum + num(tx.amount), 0);
    const customerDebts = customers.reduce((sum, row) => sum + Math.max(num(row.balance), 0), 0);
    const supplierDebts = suppliers.reduce((sum, row) => sum + Math.max(num(row.balance), 0), 0);
    const lowStock = products.filter((product) => num(product.stock_quantity) <= 5);
    const previous = trend.slice(0, Math.floor(trend.length / 2)).reduce((sum, point) => sum + point.sales, 0);
    const current = trend.slice(Math.floor(trend.length / 2)).reduce((sum, point) => sum + point.sales, 0);
    const growth = previous > 0 ? Math.round(((current - previous) / previous) * 100) : current > 0 ? 100 : 0;

    return {
      revenue,
      profit,
      collected,
      customerDebts,
      supplierDebts,
      lowStock,
      invoices: salesTxs.length,
      margin: revenue > 0 ? Math.round((profit / revenue) * 100) : 0,
      growth,
    };
  }, [customers, products, suppliers, transactions, trend]);

  const categoryData = useMemo(() => {
    const categoryMap = new Map<string, number>();
    products.forEach((product) => {
      const category = productCategoryLabel(normalizeProductCategory(product.product_category));
      categoryMap.set(category, (categoryMap.get(category) || 0) + 1);
    });
    return [...categoryMap.entries()].map(([name, value]) => ({ name, value }));
  }, [products]);

  const insights = useMemo(() => {
    const notes: Array<{ title: string; body: string; tone: "good" | "warn" | "risk" }> = [];

    if (canViewProfit && stats.margin > 0 && stats.margin < 12) {
      notes.push({ title: "هامش الربح منخفض", body: `الهامش ${stats.margin}% فقط. راجع أسعار البيع أو تكلفة الشراء.`, tone: "risk" });
    } else if (canViewProfit && stats.margin >= 25) {
      notes.push({ title: "ربحية قوية", body: `هامش الربح ${stats.margin}% خلال آخر ${rangeDays} يوم. حافظ على نفس سياسة التسعير.`, tone: "good" });
    }

    if (stats.lowStock.length > 0) {
      notes.push({ title: "أصناف قربت تخلص", body: `${stats.lowStock.length} صنف كميته 5 أو أقل. ابدأ طلب توريد للأهم.`, tone: "warn" });
    }

    if (stats.customerDebts > stats.revenue && stats.revenue > 0) {
      notes.push({ title: "التحصيل محتاج متابعة", body: "ديون العملاء أعلى من مبيعات الفترة. راجع العملاء المتأخرين.", tone: "risk" });
    }

    if (stats.growth < -10) {
      notes.push({ title: "هبوط في المبيعات", body: `المبيعات نازلة ${Math.abs(stats.growth)}% مقارنة ببداية الفترة. راجع العروض وحركة الأصناف.`, tone: "warn" });
    }

    if (notes.length === 0) {
      notes.push({ title: "الأداء مستقر", body: "الأرقام الحالية لا تظهر مخاطر واضحة. راقب المخزون والتحصيل باستمرار.", tone: "good" });
    }

    return notes.slice(0, 4);
  }, [canViewProfit, rangeDays, stats]);

  const metricLabel: Record<MetricKey, string> = {
    sales: "المبيعات",
    profit: "الربح",
    collected: "التحصيل",
  };

  return (
    <div className="min-h-screen bg-[#f4f7fb] pb-8 text-right text-slate-900" dir="rtl">
      <main className="mx-auto max-w-7xl space-y-5 px-2 sm:px-4">
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-black text-emerald-600">لوحة القرار</p>
              <h1 className="mt-1 text-2xl font-black text-slate-950">مؤشرات المحل وتحليل الأداء</h1>
              <p className="mt-2 text-sm font-bold text-slate-500">
                تابع المبيعات والربح والمخزون والتحصيل في مكان واحد.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {([14, 30, 90] as RangeDays[]).map((days) => (
                <button
                  key={days}
                  type="button"
                  onClick={() => setRangeDays(days)}
                  className={`h-11 rounded-2xl px-4 text-sm font-black transition ${
                    rangeDays === days ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  آخر {days} يوم
                </button>
              ))}
              <button
                type="button"
                onClick={fetchDashboard}
                className="inline-flex h-11 items-center gap-2 rounded-2xl bg-emerald-600 px-4 text-sm font-black text-white hover:bg-emerald-500"
              >
                <RefreshCw className="h-4 w-4" />
                تحديث
              </button>
            </div>
          </div>
        </section>

        {error && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-black text-rose-700">
            {error}
          </div>
        )}

        <CashShiftWidget />

        {loading ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center text-lg font-black text-slate-400 shadow-sm">
            جاري تحميل التحليلات...
          </div>
        ) : (
          <>
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard title="مبيعات الفترة" value={`${money(stats.revenue)} ج`} hint={`${stats.invoices} فاتورة`} icon={ShoppingCart} tone="emerald" delta={stats.growth} />
              {canViewProfit && (
                <MetricCard title="صافي الربح" value={`${money(stats.profit)} ج`} hint={`هامش ${stats.margin}%`} icon={TrendingUp} tone="blue" />
              )}
              <MetricCard title="التحصيل" value={`${money(stats.collected)} ج`} hint="مدفوعات العملاء" icon={WalletCards} tone="amber" />
              <MetricCard title="مخزون منخفض" value={`${stats.lowStock.length}`} hint="صنف يحتاج متابعة" icon={Boxes} tone="rose" />
            </section>

            <section className="grid gap-5 xl:grid-cols-[1.5fr_1fr]">
              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-black text-slate-950">اتجاه الأداء</h2>
                    <p className="text-xs font-bold text-slate-500">تغير المؤشرات خلال الفترة المختارة</p>
                  </div>
                  <div className="flex rounded-2xl bg-slate-100 p-1">
                    {(["sales", ...(canViewProfit ? ["profit" as const] : []), "collected"] as MetricKey[]).map((key) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setMetric(key)}
                        className={`h-9 rounded-xl px-3 text-xs font-black transition ${
                          metric === key ? "bg-white text-slate-950 shadow-sm" : "text-slate-500"
                        }`}
                      >
                        {metricLabel[key]}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={trend} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="metricFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#0f766e" stopOpacity={0.35} />
                          <stop offset="95%" stopColor="#0f766e" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                      <YAxis tickFormatter={shortMoney} tick={{ fontSize: 11 }} stroke="#94a3b8" />
                      <Tooltip formatter={(value) => [`${money(num(value))} ج`, metricLabel[metric]]} labelStyle={{ fontWeight: 900 }} />
                      <Area type="monotone" dataKey={metric} stroke="#0f766e" strokeWidth={3} fill="url(#metricFill)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-black text-slate-950">قرارات مقترحة</h2>
                <p className="mb-4 text-xs font-bold text-slate-500">تنبيهات مبنية على الأرقام الحالية</p>
                <div className="space-y-3">
                  {insights.map((insight) => (
                    <InsightCard key={insight.title} {...insight} />
                  ))}
                </div>
              </div>
            </section>

            <section className="grid gap-5 xl:grid-cols-3">
              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm xl:col-span-1">
                <h2 className="text-lg font-black text-slate-950">توزيع الأقسام</h2>
                <p className="mb-3 text-xs font-bold text-slate-500">عدد الأصناف حسب القسم</p>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={categoryData} dataKey="value" nameKey="name" innerRadius={48} outerRadius={86} paddingAngle={4}>
                        {categoryData.map((entry, index) => (
                          <Cell key={entry.name} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value) => [`${value} صنف`, "العدد"]} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="grid gap-2">
                  {categoryData.slice(0, 5).map((item, index) => (
                    <div key={item.name} className="flex items-center justify-between text-xs font-bold text-slate-600">
                      <span className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }} />
                        {item.name}
                      </span>
                      <span>{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm xl:col-span-1">
                <h2 className="text-lg font-black text-slate-950">أفضل الأصناف</h2>
                <p className="mb-3 text-xs font-bold text-slate-500">حسب قيمة المبيعات في الفترة</p>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={topProducts} layout="vertical" margin={{ top: 10, right: 8, left: 8, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis type="number" tickFormatter={shortMoney} tick={{ fontSize: 11 }} stroke="#94a3b8" />
                      <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 11 }} stroke="#94a3b8" />
                      <Tooltip formatter={(value) => [`${money(num(value))} ج`, "مبيعات"]} />
                      <Bar dataKey="revenue" fill="#2563eb" radius={[8, 8, 8, 8]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-black text-slate-950">متابعة سريعة</h2>
                <div className="mt-4 space-y-3">
                  <QuickLink href="/inventory" title="راجع المخزون المنخفض" value={`${stats.lowStock.length} صنف`} tone="rose" />
                  <QuickLink href="/customer" title="ديون العملاء" value={`${money(stats.customerDebts)} ج`} tone="emerald" />
                  <QuickLink href="/suppliers" title="ديون الموردين" value={`${money(stats.supplierDebts)} ج`} tone="blue" />
                  <QuickLink href="/reports" title="افتح التقارير التفصيلية" value="تحليل كامل" tone="slate" />
                </div>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}

function MetricCard({
  title,
  value,
  hint,
  icon: Icon,
  tone,
  delta,
}: {
  title: string;
  value: string;
  hint: string;
  icon: typeof BarChart3;
  tone: "emerald" | "blue" | "amber" | "rose";
  delta?: number;
}) {
  const tones = {
    emerald: "bg-emerald-50 text-emerald-700",
    blue: "bg-blue-50 text-blue-700",
    amber: "bg-amber-50 text-amber-700",
    rose: "bg-rose-50 text-rose-700",
  };

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black text-slate-400">{title}</p>
          <p className="mt-2 text-2xl font-black text-slate-950">{value}</p>
          <p className="mt-1 text-xs font-bold text-slate-500">{hint}</p>
        </div>
        <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${tones[tone]}`}>
          <Icon className="h-6 w-6" />
        </div>
      </div>
      {typeof delta === "number" && (
        <div className={`mt-4 inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-black ${delta >= 0 ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
          {delta >= 0 ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
          {Math.abs(delta)}%
        </div>
      )}
    </div>
  );
}

function InsightCard({ title, body, tone }: { title: string; body: string; tone: "good" | "warn" | "risk" }) {
  const tones = {
    good: "border-emerald-200 bg-emerald-50 text-emerald-800",
    warn: "border-amber-200 bg-amber-50 text-amber-800",
    risk: "border-rose-200 bg-rose-50 text-rose-800",
  };

  return (
    <div className={`rounded-2xl border p-4 ${tones[tone]}`}>
      <div className="mb-1 flex items-center gap-2">
        <AlertTriangle className="h-4 w-4" />
        <p className="text-sm font-black">{title}</p>
      </div>
      <p className="text-xs font-bold leading-6 opacity-80">{body}</p>
    </div>
  );
}

function QuickLink({ href, title, value, tone }: { href: string; title: string; value: string; tone: "rose" | "emerald" | "blue" | "slate" }) {
  const tones = {
    rose: "bg-rose-50 text-rose-700",
    emerald: "bg-emerald-50 text-emerald-700",
    blue: "bg-blue-50 text-blue-700",
    slate: "bg-slate-100 text-slate-700",
  };

  return (
    <Link href={href} className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-slate-300 hover:shadow-sm">
      <span className="text-sm font-black text-slate-800">{title}</span>
      <span className={`rounded-full px-3 py-1 text-xs font-black ${tones[tone]}`}>{value}</span>
    </Link>
  );
}
