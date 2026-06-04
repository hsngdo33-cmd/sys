import { createClient } from "@supabase/supabase-js";

const DEFAULT_TIME_ZONE = "Africa/Cairo";
const SALE_TYPES = new Set(["sale", "بيع"]);
const CUSTOMER_PAYMENT_TYPES = new Set(["payment", "تحصيل نقدي", "دفع", "تحصيل"]);

type CustomerTransaction = {
  id: string;
  amount: number | string | null;
  profit: number | string | null;
  type: string | null;
  created_at: string;
};

type SupplierTransaction = {
  id: string;
  amount: number | string | null;
  type: string | null;
  created_at: string;
};

type BalanceRow = {
  balance: number | string | null;
};

type ProductRow = {
  name: string | null;
  stock_quantity: number | string | null;
};

export type DailyReport = {
  dateLabel: string;
  timeZone: string;
  customerSalesCount: number;
  customerRevenue: number;
  customerProfit: number;
  customerCollected: number;
  supplierInvoicesCount: number;
  supplierPurchases: number;
  supplierPaid: number;
  totalCustomerDebt: number;
  totalSupplierDebt: number;
  lowStockCount: number;
  lowStockNames: string[];
};

function env(name: string) {
  return process.env[name]?.trim();
}

function createSupabaseServerClient() {
  const supabaseUrl = env("NEXT_PUBLIC_SUPABASE_URL");
  const supabaseKey = env("SUPABASE_SERVICE_ROLE_KEY") ?? env("NEXT_PUBLIC_SUPABASE_ANON_KEY");

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Supabase environment variables are missing.");
  }

  return createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function numberValue(value: number | string | null | undefined) {
  return Number(value) || 0;
}

function formatMoney(value: number) {
  return value.toLocaleString("ar-EG", {
    maximumFractionDigits: 0,
  });
}

function getDateParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  return {
    year: parts.find((part) => part.type === "year")?.value ?? "1970",
    month: parts.find((part) => part.type === "month")?.value ?? "01",
    day: parts.find((part) => part.type === "day")?.value ?? "01",
  };
}

function getTimeZoneOffset(date: Date, timeZone: string) {
  const part = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "shortOffset",
  })
    .formatToParts(date)
    .find((item) => item.type === "timeZoneName")?.value;

  const match = part?.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
  if (!match) return "+00:00";

  const sign = match[1];
  const hours = match[2].padStart(2, "0");
  const minutes = match[3] ?? "00";
  return `${sign}${hours}:${minutes}`;
}

function getDayRange(date: Date, timeZone: string) {
  const parts = getDateParts(date, timeZone);
  const localDate = `${parts.year}-${parts.month}-${parts.day}`;
  const offset = getTimeZoneOffset(date, timeZone);

  return {
    localDate,
    start: `${localDate}T00:00:00${offset}`,
    end: `${localDate}T23:59:59.999${offset}`,
  };
}

function formatDateLabel(localDate: string, timeZone: string) {
  return new Intl.DateTimeFormat("ar-EG", {
    timeZone,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(`${localDate}T12:00:00`));
}

export async function buildDailyReport(date = new Date(), timeZone = env("DAILY_REPORT_TIMEZONE") ?? DEFAULT_TIME_ZONE) {
  const supabase = createSupabaseServerClient();
  const range = getDayRange(date, timeZone);

  const [
    customerTransactionsResult,
    supplierTransactionsResult,
    customersResult,
    suppliersResult,
    productsResult,
  ] = await Promise.all([
    supabase
      .from("customer_transactions")
      .select("id, amount, profit, type, created_at")
      .gte("created_at", range.start)
      .lte("created_at", range.end),
    supabase
      .from("transactions")
      .select("id, amount, type, created_at")
      .gte("created_at", range.start)
      .lte("created_at", range.end),
    supabase.from("customers").select("balance"),
    supabase.from("suppliers").select("balance"),
    supabase.from("products").select("name, stock_quantity"),
  ]);

  const firstError =
    customerTransactionsResult.error ??
    supplierTransactionsResult.error ??
    customersResult.error ??
    suppliersResult.error ??
    productsResult.error;

  if (firstError) {
    throw firstError;
  }

  const customerTransactions = (customerTransactionsResult.data ?? []) as CustomerTransaction[];
  const supplierTransactions = (supplierTransactionsResult.data ?? []) as SupplierTransaction[];
  const customers = (customersResult.data ?? []) as BalanceRow[];
  const suppliers = (suppliersResult.data ?? []) as BalanceRow[];
  const products = (productsResult.data ?? []) as ProductRow[];

  const sales = customerTransactions.filter((tx) => SALE_TYPES.has(tx.type ?? ""));
  const customerPayments = customerTransactions.filter((tx) => CUSTOMER_PAYMENT_TYPES.has(tx.type ?? ""));
  const supplierInvoices = supplierTransactions.filter((tx) => (tx.type ?? "").includes("فاتورة") || (tx.type ?? "").includes("توريد"));
  const supplierPayments = supplierTransactions.filter((tx) => (tx.type ?? "").includes("سداد") || (tx.type ?? "").includes("دفع"));
  const lowStock = products
    .filter((product) => numberValue(product.stock_quantity) <= 5)
    .sort((a, b) => numberValue(a.stock_quantity) - numberValue(b.stock_quantity));

  return {
    dateLabel: formatDateLabel(range.localDate, timeZone),
    timeZone,
    customerSalesCount: sales.length,
    customerRevenue: sales.reduce((sum, tx) => sum + numberValue(tx.amount), 0),
    customerProfit: sales.reduce((sum, tx) => sum + numberValue(tx.profit), 0),
    customerCollected: customerPayments.reduce((sum, tx) => sum + numberValue(tx.amount), 0),
    supplierInvoicesCount: supplierInvoices.length,
    supplierPurchases: supplierInvoices.reduce((sum, tx) => sum + numberValue(tx.amount), 0),
    supplierPaid: supplierPayments.reduce((sum, tx) => sum + numberValue(tx.amount), 0),
    totalCustomerDebt: customers.reduce((sum, customer) => sum + Math.max(numberValue(customer.balance), 0), 0),
    totalSupplierDebt: suppliers.reduce((sum, supplier) => sum + Math.max(numberValue(supplier.balance), 0), 0),
    lowStockCount: lowStock.length,
    lowStockNames: lowStock.map((product) => product.name).filter((name): name is string => Boolean(name)).slice(0, 5),
  } satisfies DailyReport;
}

export function formatDailyReportMessage(report: DailyReport) {
  const profitMargin = report.customerRevenue > 0 ? Math.round((report.customerProfit / report.customerRevenue) * 100) : 0;
  const netCash = report.customerCollected - report.supplierPaid;
  const stockLine =
    report.lowStockCount > 0
      ? `${report.lowStockCount} صنف منخفض${report.lowStockNames.length ? `: ${report.lowStockNames.join("، ")}` : ""}`
      : "المخزون مستقر";

  return [
    `تقرير اليوم - ${report.dateLabel}`,
    "",
    "المبيعات والعملاء:",
    `- عدد فواتير البيع: ${report.customerSalesCount}`,
    `- إجمالي المبيعات: ${formatMoney(report.customerRevenue)} ج.م`,
    `- صافي الربح: ${formatMoney(report.customerProfit)} ج.م (${profitMargin}%)`,
    `- التحصيلات: ${formatMoney(report.customerCollected)} ج.م`,
    "",
    "الموردين والمخزون:",
    `- فواتير التوريد: ${report.supplierInvoicesCount}`,
    `- مشتريات الموردين: ${formatMoney(report.supplierPurchases)} ج.م`,
    `- المدفوع للموردين: ${formatMoney(report.supplierPaid)} ج.م`,
    `- ${stockLine}`,
    "",
    "الأرصدة الحالية:",
    `- ديون العملاء: ${formatMoney(report.totalCustomerDebt)} ج.م`,
    `- ديون الموردين: ${formatMoney(report.totalSupplierDebt)} ج.م`,
    `- صافي حركة الكاش اليوم: ${formatMoney(netCash)} ج.م`,
  ].join("\n");
}
