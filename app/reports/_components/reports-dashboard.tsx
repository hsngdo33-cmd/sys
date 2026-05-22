"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Filter,
  LineChart,
  RefreshCw,
  Search,
  TrendingUp,
  Trophy,
  Truck,
  UsersRound,
  WalletCards,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

type Period = "daily" | "monthly" | "yearly";

type CustomerRow = {
  id: string;
  name: string;
  phone: string | null;
  balance: number | null;
};

type SupplierRow = {
  id: string;
  name: string;
  phone: string | null;
  balance: number | null;
};

type CustomerTx = {
  id: string;
  customer_id: string | null;
  created_at: string;
  amount: number | string | null;
  profit: number | string | null;
  type: string | null;
  description: string | null;
};

type SupplierTx = {
  id: number;
  supplier_id: string | null;
  created_at: string;
  amount: number | string | null;
  type: string | null;
  description: string | null;
};

type EntityReport = {
  id: string;
  name: string;
  phone: string;
  balance: number;
  invoices: number;
  invoiceTotal: number;
  paidTotal: number;
  profit?: number;
  lastTx: string | null;
};

type TrendRow = {
  label: string;
  customers: number;
  suppliers: number;
  collected: number;
  paid: number;
};

const REPORT_NAV = [
  {
    key: "customers",
    href: "/reports/customers",
    title: "تقارير العملاء",
    description: "مبيعات وتحصيل وديون العملاء.",
    icon: UsersRound,
    tone: "bg-emerald-600",
  },
  {
    key: "suppliers",
    href: "/reports/suppliers",
    title: "تقارير الموردين",
    description: "توريدات وسداد وديون الموردين.",
    icon: Truck,
    tone: "bg-amber-500",
  },
  {
    key: "overview",
    href: "/reports/filter",
    title: "التصفية العامة",
    description: "فلترة يومية وشهرية وسنوية.",
    icon: Filter,
    tone: "bg-slate-950",
  },
] as const;

const PERIOD_LABELS: Record<Period, string> = {
  daily: "تقرير يومي",
  monthly: "تقرير شهري",
  yearly: "تقرير سنوي",
};

const SALE_TYPES = new Set(["sale", "بيع"]);
const CUSTOMER_PAYMENT_TYPES = new Set(["payment", "تحصيل نقدي", "تحصيل", "دفع"]);

function num(value: unknown) {
  return Number(value) || 0;
}

function money(value: number) {
  return value.toLocaleString("ar-EG", { maximumFractionDigits: 0 });
}

function formatShortDate(value: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("ar-EG", { day: "numeric", month: "short" });
}

function formatRangeDate(date: Date) {
  return date.toLocaleDateString("ar-EG", { day: "numeric", month: "long", year: "numeric" });
}

function isCustomerSale(type: string | null) {
  const safeType = type || "";
  return SALE_TYPES.has(safeType) || safeType.includes("بيع");
}

function isCustomerPayment(type: string | null) {
  const safeType = type || "";
  return CUSTOMER_PAYMENT_TYPES.has(safeType) || safeType.includes("تحصيل") || safeType.includes("دفع");
}

function isSupplierInvoice(type: string | null) {
  const safeType = type || "";
  return safeType.includes("فاتورة") || safeType.includes("توريد");
}

function isSupplierPayment(type: string | null) {
  const safeType = type || "";
  return safeType.includes("سداد") || safeType.includes("دفع");
}

function inputDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function inputMonth(date: Date) {
  return date.toISOString().slice(0, 7);
}

function getRange(period: Period, day: string, month: string, year: number) {
  if (period === "daily") {
    const start = new Date(`${day}T00:00:00`);
    const end = new Date(`${day}T23:59:59.999`);
    return { start, end, label: formatRangeDate(start) };
  }

  if (period === "monthly") {
    const [selectedYear, selectedMonth] = month.split("-").map(Number);
    const start = new Date(selectedYear, selectedMonth - 1, 1, 0, 0, 0, 0);
    const end = new Date(selectedYear, selectedMonth, 0, 23, 59, 59, 999);
    return {
      start,
      end,
      label: start.toLocaleDateString("ar-EG", { month: "long", year: "numeric" }),
    };
  }

  const start = new Date(year, 0, 1, 0, 0, 0, 0);
  const end = new Date(year, 11, 31, 23, 59, 59, 999);
  return { start, end, label: String(year) };
}

function getTrendLabel(period: Period, date: Date) {
  if (period === "daily") return date.toLocaleTimeString("ar-EG", { hour: "2-digit" });
  if (period === "monthly") return date.toLocaleDateString("ar-EG", { day: "numeric" });
  return date.toLocaleDateString("ar-EG", { month: "short" });
}

function makeTrend(
  period: Period,
  start: Date,
  customerTxs: CustomerTx[],
  supplierTxs: SupplierTx[],
) {
  const buckets = new Map<string, TrendRow>();

  const ensure = (date: Date) => {
    let key: string;
    if (period === "daily") key = String(date.getHours()).padStart(2, "0");
    else if (period === "monthly") key = String(date.getDate()).padStart(2, "0");
    else key = String(date.getMonth() + 1).padStart(2, "0");

    if (!buckets.has(key)) {
      buckets.set(key, {
        label: getTrendLabel(period, date),
        customers: 0,
        suppliers: 0,
        collected: 0,
        paid: 0,
      });
    }
    return buckets.get(key)!;
  };

  const bucketCount =
    period === "daily"
      ? 24
      : period === "monthly"
        ? new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate()
        : 12;

  for (let i = 0; i < bucketCount; i++) {
    const date = new Date(start);
    if (period === "daily") date.setHours(i);
    else if (period === "monthly") date.setDate(i + 1);
    else date.setMonth(i);
    ensure(date);
  }

  for (const tx of customerTxs) {
    const bucket = ensure(new Date(tx.created_at));
    const amount = num(tx.amount);
    if (isCustomerSale(tx.type)) bucket.customers += amount;
    if (isCustomerPayment(tx.type)) bucket.collected += amount;
  }

  for (const tx of supplierTxs) {
    const bucket = ensure(new Date(tx.created_at));
    const amount = num(tx.amount);
    if (isSupplierInvoice(tx.type)) bucket.suppliers += amount;
    if (isSupplierPayment(tx.type)) bucket.paid += amount;
  }

  return Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, value]) => value);
}

export function ReportsDashboard({ view }: { view: "overview" | "customers" | "suppliers" }) {
  const today = new Date();
  const [period, setPeriod] = useState<Period>("monthly");
  const [selectedDay, setSelectedDay] = useState(inputDate(today));
  const [selectedMonth, setSelectedMonth] = useState(inputMonth(today));
  const [selectedYear, setSelectedYear] = useState(today.getFullYear());
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierRow[]>([]);
  const [customerTxs, setCustomerTxs] = useState<CustomerTx[]>([]);
  const [supplierTxs, setSupplierTxs] = useState<SupplierTx[]>([]);

  const range = useMemo(
    () => getRange(period, selectedDay, selectedMonth, selectedYear),
    [period, selectedDay, selectedMonth, selectedYear],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const startIso = range.start.toISOString();
      const endIso = range.end.toISOString();

      const [
        customersResult,
        suppliersResult,
        customerTxResult,
        supplierTxResult,
      ] = await Promise.all([
        supabase.from("customers").select("id, name, phone, balance").order("name"),
        supabase.from("suppliers").select("id, name, phone, balance").order("name"),
        supabase
          .from("customer_transactions")
          .select("id, customer_id, created_at, amount, profit, type, description")
          .gte("created_at", startIso)
          .lte("created_at", endIso)
          .order("created_at", { ascending: false }),
        supabase
          .from("transactions")
          .select("id, supplier_id, created_at, amount, type, description")
          .gte("created_at", startIso)
          .lte("created_at", endIso)
          .order("created_at", { ascending: false }),
      ]);

      const requestError =
        customersResult.error ??
        suppliersResult.error ??
        customerTxResult.error ??
        supplierTxResult.error;

      if (requestError) throw requestError;

      setCustomers((customersResult.data ?? []) as CustomerRow[]);
      setSuppliers((suppliersResult.data ?? []) as SupplierRow[]);
      setCustomerTxs((customerTxResult.data ?? []) as CustomerTx[]);
      setSupplierTxs((supplierTxResult.data ?? []) as SupplierTx[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "حدث خطأ أثناء تحميل التقارير");
    } finally {
      setLoading(false);
    }
  }, [range.end, range.start]);

  useEffect(() => {
    load();
  }, [load]);

  const customerReports = useMemo<EntityReport[]>(() => {
    const map = new Map<string, EntityReport>();
    for (const customer of customers) {
      map.set(customer.id, {
        id: customer.id,
        name: customer.name,
        phone: customer.phone || "-",
        balance: num(customer.balance),
        invoices: 0,
        invoiceTotal: 0,
        paidTotal: 0,
        profit: 0,
        lastTx: null,
      });
    }

    for (const tx of customerTxs) {
      if (!tx.customer_id) continue;
      const row = map.get(tx.customer_id);
      if (!row) continue;

      if (isCustomerSale(tx.type)) {
        row.invoices += 1;
        row.invoiceTotal += num(tx.amount);
        row.profit = num(row.profit) + num(tx.profit);
      }

      if (isCustomerPayment(tx.type)) {
        row.paidTotal += num(tx.amount);
      }

      if (!row.lastTx || tx.created_at > row.lastTx) row.lastTx = tx.created_at;
    }

    return Array.from(map.values())
      .filter((row) => row.name.includes(query) || row.phone.includes(query))
      .sort((a, b) => b.invoiceTotal - a.invoiceTotal);
  }, [customers, customerTxs, query]);

  const supplierReports = useMemo<EntityReport[]>(() => {
    const map = new Map<string, EntityReport>();
    for (const supplier of suppliers) {
      map.set(supplier.id, {
        id: supplier.id,
        name: supplier.name,
        phone: supplier.phone || "-",
        balance: num(supplier.balance),
        invoices: 0,
        invoiceTotal: 0,
        paidTotal: 0,
        lastTx: null,
      });
    }

    for (const tx of supplierTxs) {
      if (!tx.supplier_id) continue;
      const row = map.get(tx.supplier_id);
      if (!row) continue;

      if (isSupplierInvoice(tx.type)) {
        row.invoices += 1;
        row.invoiceTotal += num(tx.amount);
      }

      if (isSupplierPayment(tx.type)) {
        row.paidTotal += num(tx.amount);
      }

      if (!row.lastTx || tx.created_at > row.lastTx) row.lastTx = tx.created_at;
    }

    return Array.from(map.values())
      .filter((row) => row.name.includes(query) || row.phone.includes(query))
      .sort((a, b) => b.invoiceTotal - a.invoiceTotal);
  }, [suppliers, supplierTxs, query]);

  const customerSales = customerTxs.filter((tx) => isCustomerSale(tx.type));
  const customerPayments = customerTxs.filter((tx) => isCustomerPayment(tx.type));
  const supplierInvoices = supplierTxs.filter((tx) => isSupplierInvoice(tx.type));
  const supplierPayments = supplierTxs.filter((tx) => isSupplierPayment(tx.type));

  const totalSales = customerSales.reduce((sum, tx) => sum + num(tx.amount), 0);
  const totalProfit = customerSales.reduce((sum, tx) => sum + num(tx.profit), 0);
  const totalCollected = customerPayments.reduce((sum, tx) => sum + num(tx.amount), 0);
  const totalPurchases = supplierInvoices.reduce((sum, tx) => sum + num(tx.amount), 0);
  const totalSupplierPaid = supplierPayments.reduce((sum, tx) => sum + num(tx.amount), 0);
  const currentCustomerDebt = customers.reduce((sum, row) => sum + Math.max(num(row.balance), 0), 0);
  const currentSupplierDebt = suppliers.reduce((sum, row) => sum + Math.max(num(row.balance), 0), 0);
  const netCash = totalCollected - totalSupplierPaid;
  const profitMargin = totalSales ? Math.round((totalProfit / totalSales) * 100) : 0;
  const supplierPayRate = totalPurchases ? Math.round((totalSupplierPaid / totalPurchases) * 100) : 0;
  const topProfitCustomers = [...customerReports]
    .filter((row) => num(row.profit) > 0)
    .sort((a, b) => num(b.profit) - num(a.profit))
    .slice(0, 5);
  const topDebtCustomers = [...customerReports]
    .filter((row) => row.balance > 0)
    .sort((a, b) => b.balance - a.balance)
    .slice(0, 5);
  const customerCollectionRate = totalSales > 0 ? Math.min(Math.round((totalCollected / totalSales) * 100), 100) : 0;
  const activeCustomersCount = customerReports.filter((row) => row.invoices > 0 || row.paidTotal > 0).length;

  const trend = useMemo(
    () => makeTrend(period, range.start, customerTxs, supplierTxs),
    [customerTxs, period, range.start, supplierTxs],
  );
  const activeTrend = trend.filter((row) => row.customers > 0 || row.suppliers > 0 || row.collected > 0 || row.paid > 0);

  const maxTrendValue = Math.max(
    ...activeTrend.map((row) => Math.max(row.customers, row.suppliers, row.collected, row.paid)),
    1,
  );

  const years = Array.from({ length: 6 }, (_, index) => today.getFullYear() - index);

  return (
    <div className="min-h-screen bg-[#f4f7fb] px-4 py-6 text-right text-slate-900" dir="rtl">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-emerald-600">
                التقارير والتحليلات
              </p>
              <h1 className="mt-2 text-2xl font-black text-slate-950">
                متابعة العملاء والموردين حسب الفترة
              </h1>
              <p className="mt-1 text-sm font-bold text-slate-500">
                {PERIOD_LABELS[period]} عن {range.label}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Link
                href="/"
                className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-black text-slate-600 transition hover:bg-slate-100"
              >
                الرئيسية
              </Link>
              <button
                type="button"
                onClick={load}
                className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-black text-white transition hover:bg-slate-800"
              >
                <RefreshCw className="h-4 w-4" />
                تحديث
              </button>
            </div>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-3">
          {REPORT_NAV.map((item) => {
            const Icon = item.icon;
            const active = item.key === view;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`group rounded-[2rem] border p-5 shadow-sm transition hover:-translate-y-1 hover:shadow-xl ${
                  active
                    ? "border-slate-950 bg-slate-950 text-white"
                    : "border-slate-200 bg-white text-slate-950"
                }`}
              >
                <div className="mb-5 flex items-start justify-between gap-3">
                  <div className={`flex h-12 w-12 items-center justify-center rounded-2xl text-white ${item.tone}`}>
                    <Icon className="h-6 w-6" />
                  </div>
                  {active && (
                    <span className="rounded-full bg-white/10 px-3 py-1 text-[10px] font-black text-white">
                      الصفحة الحالية
                    </span>
                  )}
                </div>
                <h2 className={`text-lg font-black ${active ? "text-white" : "text-slate-950"}`}>{item.title}</h2>
                <p className={`mt-2 text-sm font-bold leading-6 ${active ? "text-slate-300" : "text-slate-500"}`}>
                  {item.description}
                </p>
              </Link>
            );
          })}
        </section>

        <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-white">
              <Filter className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-black text-slate-950">التصفية</h2>
              <p className="text-xs font-bold text-slate-400">اختار يوم أو شهر أو سنة، وابحث باسم العميل أو المورد.</p>
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-[auto_1fr_1fr]">
            <div className="grid grid-cols-3 gap-2 rounded-2xl bg-slate-100 p-1">
              {(["daily", "monthly", "yearly"] as Period[]).map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setPeriod(item)}
                  className={`rounded-xl px-4 py-3 text-xs font-black transition ${
                    period === item ? "bg-white text-slate-950 shadow-sm" : "text-slate-500 hover:text-slate-900"
                  }`}
                >
                  {item === "daily" ? "يومي" : item === "monthly" ? "شهري" : "سنوي"}
                </button>
              ))}
            </div>

            <div className="grid gap-2 sm:grid-cols-3">
              {period === "daily" && (
                <FilterInput
                  icon={CalendarDays}
                  type="date"
                  value={selectedDay}
                  onChange={setSelectedDay}
                />
              )}
              {period === "monthly" && (
                <FilterInput
                  icon={CalendarDays}
                  type="month"
                  value={selectedMonth}
                  onChange={setSelectedMonth}
                />
              )}
              {period === "yearly" && (
                <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                  <CalendarDays className="h-5 w-5 text-slate-400" />
                  <select
                    value={selectedYear}
                    onChange={(event) => setSelectedYear(Number(event.target.value))}
                    className="w-full bg-transparent py-1 text-sm font-black text-slate-900 outline-none"
                  >
                    {years.map((year) => (
                      <option key={year} value={year}>{year}</option>
                    ))}
                  </select>
                </label>
              )}
            </div>

            <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
              <Search className="h-5 w-5 text-slate-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="بحث باسم العميل أو المورد أو رقم الهاتف"
                className="w-full bg-transparent py-1 text-sm font-bold text-slate-900 outline-none placeholder:text-slate-400"
              />
            </label>
          </div>
        </section>

        {error && (
          <section className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-700">
            {error}
          </section>
        )}

        {loading ? (
          <section className="rounded-[2rem] border border-slate-200 bg-white p-16 text-center shadow-sm">
            <p className="font-black text-slate-400">جاري تحميل التقارير...</p>
          </section>
        ) : (
          <>
            {view === "overview" && (
            <>
            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                title="مبيعات العملاء"
                value={totalSales}
                helper={`${customerSales.length} فاتورة في الفترة`}
                tone="emerald"
                icon={UsersRound}
              />
              <MetricCard
                title="تحصيل العملاء"
                value={totalCollected}
                helper={`هامش الربح ${profitMargin}%`}
                tone="sky"
                icon={WalletCards}
              />
              <MetricCard
                title="فواتير الموردين"
                value={totalPurchases}
                helper={`${supplierInvoices.length} فاتورة توريد`}
                tone="amber"
                icon={Truck}
              />
              <MetricCard
                title="صافي النقدية"
                value={netCash}
                helper={netCash >= 0 ? "الداخل أكبر من الخارج" : "المدفوعات أعلى من التحصيل"}
                tone={netCash >= 0 ? "slate" : "rose"}
                icon={LineChart}
              />
            </section>

            <section className="grid gap-4 lg:grid-cols-3">
              <InsightStrip
                icon={TrendingUp}
                title="صافي ربح العملاء"
                value={`${money(totalProfit)} ج`}
                helper={totalProfit >= 0 ? "أداء موجب في الفترة المحددة" : "راجع أسعار البيع والتكلفة"}
                tone="emerald"
              />
              <InsightStrip
                icon={ArrowUpRight}
                title="ديون العملاء الحالية"
                value={`${money(currentCustomerDebt)} ج`}
                helper={`${customers.filter((row) => num(row.balance) > 0).length} عميل عليه رصيد`}
                tone="rose"
              />
              <InsightStrip
                icon={ArrowDownRight}
                title="ديون الموردين الحالية"
                value={`${money(currentSupplierDebt)} ج`}
                helper={`نسبة سداد الفترة ${supplierPayRate}%`}
                tone="amber"
              />
            </section>

            <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-lg font-black text-slate-950">حركة الفترة</h2>
                  <p className="text-xs font-bold text-slate-400">مقارنة بين مبيعات العملاء وفواتير الموردين والتحصيل والسداد.</p>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-500">
                  {PERIOD_LABELS[period]}
                </span>
              </div>
              <div className="grid gap-2">
                {activeTrend.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-10 text-center">
                    <p className="font-black text-slate-400">لا توجد حركة في الفترة المحددة</p>
                    <p className="mt-2 text-xs font-bold text-slate-400">غيّر اليوم أو الشهر أو السنة من التصفية بالأعلى.</p>
                  </div>
                )}
                {activeTrend.map((row) => (
                  <TrendBar key={row.label} row={row} max={maxTrendValue} />
                ))}
              </div>
            </section>
            </>
            )}

            {view === "customers" && (
            <>
            <CustomerInsights
              topProfitCustomers={topProfitCustomers}
              topDebtCustomers={topDebtCustomers}
              profitMargin={profitMargin}
              collectionRate={customerCollectionRate}
              activeCustomersCount={activeCustomersCount}
              totalCustomers={customers.length}
            />
            <ReportSection
              title="تقارير العملاء"
              subtitle={`مبيعات، تحصيل، أرباح وديون العملاء - ${PERIOD_LABELS[period]}`}
              icon={UsersRound}
              accent="emerald"
              totals={[
                { label: "إجمالي المبيعات", value: totalSales },
                { label: "إجمالي التحصيل", value: totalCollected },
                { label: "صافي الربح", value: totalProfit },
                { label: "الرصيد الحالي", value: currentCustomerDebt },
              ]}
            >
              <EntityTable
                rows={customerReports}
                mode="customers"
                emptyText="لا توجد معاملات عملاء في الفترة المحددة"
              />
            </ReportSection>
            </>
            )}

            {view === "suppliers" && (
            <ReportSection
              title="تقارير الموردين"
              subtitle={`توريدات، مدفوعات وديون الموردين - ${PERIOD_LABELS[period]}`}
              icon={Truck}
              accent="amber"
              totals={[
                { label: "إجمالي التوريد", value: totalPurchases },
                { label: "إجمالي السداد", value: totalSupplierPaid },
                { label: "المتبقي للفترة", value: totalPurchases - totalSupplierPaid },
                { label: "الرصيد الحالي", value: currentSupplierDebt },
              ]}
            >
              <EntityTable
                rows={supplierReports}
                mode="suppliers"
                emptyText="لا توجد معاملات موردين في الفترة المحددة"
              />
            </ReportSection>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function CustomerInsights({
  topProfitCustomers,
  topDebtCustomers,
  profitMargin,
  collectionRate,
  activeCustomersCount,
  totalCustomers,
}: {
  topProfitCustomers: EntityReport[];
  topDebtCustomers: EntityReport[];
  profitMargin: number;
  collectionRate: number;
  activeCustomersCount: number;
  totalCustomers: number;
}) {
  return (
    <section className="grid gap-4 xl:grid-cols-3">
      <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm xl:col-span-2">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-black text-slate-950">تحليلات العملاء</h2>
            <p className="mt-1 text-xs font-bold text-slate-400">أكثر العملاء ربحية وأكثر العملاء عليهم ديون في الفترة المختارة.</p>
          </div>
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-600 text-white">
            <Trophy className="h-5 w-5" />
          </div>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <RankedCustomers
            title="أكتر 5 عملاء ربحية"
            emptyText="لا توجد أرباح للعملاء في الفترة المحددة"
            rows={topProfitCustomers}
            valueKey="profit"
            tone="emerald"
          />
          <RankedCustomers
            title="أكتر 5 عملاء عليهم ديون"
            emptyText="لا توجد ديون على العملاء"
            rows={topDebtCustomers}
            valueKey="balance"
            tone="rose"
          />
        </div>
      </div>

      <div className="space-y-4">
        <MiniGauge
          title="هامش الربح"
          value={profitMargin}
          helper={profitMargin >= 20 ? "ممتاز" : profitMargin >= 10 ? "متوسط" : "يحتاج متابعة"}
          tone="emerald"
        />
        <MiniGauge
          title="نسبة التحصيل"
          value={collectionRate}
          helper={collectionRate >= 80 ? "تحصيل قوي" : collectionRate >= 50 ? "مقبول" : "ضعيف"}
          tone="sky"
        />
        <div className="rounded-[2rem] border border-slate-200 bg-slate-950 p-5 text-white shadow-sm">
          <p className="text-xs font-black text-slate-400">عملاء نشطين في الفترة</p>
          <p className="mt-2 text-3xl font-black">{activeCustomersCount}</p>
          <p className="mt-1 text-xs font-bold text-slate-400">من إجمالي {totalCustomers} عميل</p>
        </div>
      </div>
    </section>
  );
}

function RankedCustomers({
  title,
  emptyText,
  rows,
  valueKey,
  tone,
}: {
  title: string;
  emptyText: string;
  rows: EntityReport[];
  valueKey: "profit" | "balance";
  tone: "emerald" | "rose";
}) {
  const maxValue = Math.max(...rows.map((row) => num(row[valueKey])), 1);
  const barColor = tone === "emerald" ? "bg-emerald-500" : "bg-rose-500";
  const chipColor = tone === "emerald" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700";

  return (
    <div className="rounded-[1.5rem] border border-slate-100 bg-slate-50 p-4">
      <h3 className="mb-4 font-black text-slate-900">{title}</h3>
      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-6 text-center text-sm font-bold text-slate-400">
          {emptyText}
        </div>
      ) : (
        <div className="space-y-4">
          {rows.map((row, index) => {
            const value = num(row[valueKey]);
            const width = `${Math.max((value / maxValue) * 100, 8)}%`;
            return (
              <div key={row.id}>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-white text-xs font-black text-slate-500">
                      {index + 1}
                    </span>
                    <span className="truncate font-black text-slate-900">{row.name}</span>
                  </div>
                  <span className={`shrink-0 rounded-xl px-3 py-1 text-xs font-black ${chipColor}`}>
                    {money(value)} ج
                  </span>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-white">
                  <div className={`h-full rounded-full ${barColor}`} style={{ width }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MiniGauge({
  title,
  value,
  helper,
  tone,
}: {
  title: string;
  value: number;
  helper: string;
  tone: "emerald" | "sky";
}) {
  const color = tone === "emerald" ? "bg-emerald-500" : "bg-sky-500";
  const text = tone === "emerald" ? "text-emerald-700" : "text-sky-700";
  const safeValue = Math.min(Math.max(value, 0), 100);

  return (
    <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <p className="font-black text-slate-900">{title}</p>
        <p className={`text-2xl font-black ${text}`}>{safeValue}%</p>
      </div>
      <div className="h-4 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${safeValue}%` }} />
      </div>
      <p className="mt-3 text-xs font-bold text-slate-400">{helper}</p>
    </div>
  );
}

function FilterInput({
  icon: Icon,
  type,
  value,
  onChange,
}: {
  icon: typeof CalendarDays;
  type: "date" | "month";
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 sm:col-span-2">
      <Icon className="h-5 w-5 text-slate-400" />
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full bg-transparent py-1 text-sm font-black text-slate-900 outline-none"
      />
    </label>
  );
}

function MetricCard({
  title,
  value,
  helper,
  tone,
  icon: Icon,
}: {
  title: string;
  value: number;
  helper: string;
  tone: "emerald" | "sky" | "amber" | "rose" | "slate";
  icon: typeof BarChart3;
}) {
  const styles = {
    emerald: "bg-emerald-600 text-white",
    sky: "bg-sky-600 text-white",
    amber: "bg-amber-500 text-white",
    rose: "bg-rose-600 text-white",
    slate: "bg-slate-950 text-white",
  };

  return (
    <div className={`rounded-[2rem] p-5 shadow-sm ${styles[tone]}`}>
      <div className="mb-5 flex items-center justify-between">
        <p className="text-xs font-black uppercase tracking-widest opacity-75">{title}</p>
        <Icon className="h-6 w-6 opacity-80" />
      </div>
      <p className="text-3xl font-black">{money(value)} <span className="text-sm opacity-70">ج</span></p>
      <p className="mt-2 text-xs font-bold opacity-75">{helper}</p>
    </div>
  );
}

function InsightStrip({
  icon: Icon,
  title,
  value,
  helper,
  tone,
}: {
  icon: typeof TrendingUp;
  title: string;
  value: string;
  helper: string;
  tone: "emerald" | "rose" | "amber";
}) {
  const styles = {
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
    rose: "border-rose-200 bg-rose-50 text-rose-700",
    amber: "border-amber-200 bg-amber-50 text-amber-700",
  };

  return (
    <div className={`flex items-center gap-4 rounded-[2rem] border p-5 ${styles[tone]}`}>
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white">
        <Icon className="h-6 w-6" />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-black text-slate-500">{title}</p>
        <p className="mt-1 text-2xl font-black text-slate-950">{value}</p>
        <p className="mt-1 text-xs font-bold text-slate-500">{helper}</p>
      </div>
    </div>
  );
}

function TrendBar({ row, max }: { row: TrendRow; max: number }) {
  const customerWidth = `${Math.max((row.customers / max) * 100, row.customers ? 4 : 0)}%`;
  const supplierWidth = `${Math.max((row.suppliers / max) * 100, row.suppliers ? 4 : 0)}%`;

  return (
    <div className="grid gap-2 rounded-2xl border border-slate-100 bg-slate-50 p-3 lg:grid-cols-[80px_1fr_1fr_160px] lg:items-center">
      <p className="font-black text-slate-500">{row.label}</p>
      <div>
        <div className="mb-1 flex justify-between text-[10px] font-black text-slate-400">
          <span>عملاء</span>
          <span>{money(row.customers)} ج</span>
        </div>
        <div className="h-3 overflow-hidden rounded-full bg-white">
          <div className="h-full rounded-full bg-emerald-500" style={{ width: customerWidth }} />
        </div>
      </div>
      <div>
        <div className="mb-1 flex justify-between text-[10px] font-black text-slate-400">
          <span>موردين</span>
          <span>{money(row.suppliers)} ج</span>
        </div>
        <div className="h-3 overflow-hidden rounded-full bg-white">
          <div className="h-full rounded-full bg-amber-500" style={{ width: supplierWidth }} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs font-black">
        <span className="rounded-xl bg-emerald-100 px-2 py-1 text-emerald-700">تحصيل {money(row.collected)}</span>
        <span className="rounded-xl bg-amber-100 px-2 py-1 text-amber-700">سداد {money(row.paid)}</span>
      </div>
    </div>
  );
}

function ReportSection({
  title,
  subtitle,
  icon: Icon,
  accent,
  totals,
  children,
}: {
  title: string;
  subtitle: string;
  icon: typeof UsersRound;
  accent: "emerald" | "amber";
  totals: Array<{ label: string; value: number }>;
  children: React.ReactNode;
}) {
  const accentStyles = accent === "emerald" ? "bg-emerald-600" : "bg-amber-500";

  return (
    <section className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-4">
            <div className={`flex h-12 w-12 items-center justify-center rounded-2xl text-white ${accentStyles}`}>
              <Icon className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-950">{title}</h2>
              <p className="mt-1 text-xs font-bold text-slate-400">{subtitle}</p>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-4">
            {totals.map((item) => (
              <div key={item.label} className="rounded-2xl bg-slate-50 px-4 py-3">
                <p className="text-[10px] font-black text-slate-400">{item.label}</p>
                <p className="mt-1 font-black text-slate-950">{money(item.value)} ج</p>
              </div>
            ))}
          </div>
        </div>
      </div>
      {children}
    </section>
  );
}

function EntityTable({
  rows,
  mode,
  emptyText,
}: {
  rows: EntityReport[];
  mode: "customers" | "suppliers";
  emptyText: string;
}) {
  const visibleRows = rows.filter((row) => row.invoices > 0 || row.paidTotal > 0 || row.balance > 0);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-right">
        <thead className="bg-slate-50 text-[10px] font-black uppercase text-slate-400">
          <tr>
            <th className="p-4">الاسم</th>
            <th className="p-4">الهاتف</th>
            <th className="p-4">عدد الفواتير</th>
            <th className="p-4">{mode === "customers" ? "إجمالي المبيعات" : "إجمالي التوريد"}</th>
            <th className="p-4">{mode === "customers" ? "المحصل" : "المسدد"}</th>
            {mode === "customers" && <th className="p-4">الربح</th>}
            <th className="p-4">الرصيد الحالي</th>
            <th className="p-4">آخر حركة</th>
            <th className="p-4">الحالة</th>
            <th className="p-4"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {visibleRows.length === 0 && (
            <tr>
              <td colSpan={mode === "customers" ? 10 : 9} className="p-12 text-center font-black text-slate-300">
                {emptyText}
              </td>
            </tr>
          )}
          {visibleRows.map((row) => {
            const isClear = row.balance <= 0;
            const historyHref =
              mode === "customers"
                ? `/customer/${row.id}/history`
                : `/suppliers/${row.id}/history`;

            return (
              <tr key={row.id} className="transition hover:bg-slate-50/70">
                <td className="p-4 font-black text-slate-950">{row.name}</td>
                <td className="p-4 text-sm font-bold text-slate-400">{row.phone}</td>
                <td className="p-4 font-black text-slate-700">{row.invoices}</td>
                <td className="p-4 font-black text-slate-900">{money(row.invoiceTotal)} ج</td>
                <td className="p-4 font-black text-emerald-600">{money(row.paidTotal)} ج</td>
                {mode === "customers" && (
                  <td className="p-4 font-black text-sky-600">{money(row.profit || 0)} ج</td>
                )}
                <td className={`p-4 font-black ${isClear ? "text-emerald-600" : "text-rose-600"}`}>
                  {money(Math.max(row.balance, 0))} ج
                </td>
                <td className="p-4 text-sm font-bold text-slate-400">{formatShortDate(row.lastTx)}</td>
                <td className="p-4">
                  <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-[10px] font-black ${
                    isClear ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
                  }`}>
                    {isClear && <CheckCircle2 className="h-3 w-3" />}
                    {isClear ? "مسدد" : "له رصيد"}
                  </span>
                </td>
                <td className="p-4">
                  <Link
                    href={historyHref}
                    className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-3 py-2 text-xs font-black text-white transition hover:bg-slate-800"
                  >
                    <Clock3 className="h-3.5 w-3.5" />
                    السجل
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

