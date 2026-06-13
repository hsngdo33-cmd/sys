"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  Filter,
  ReceiptText,
  RefreshCw,
  Search,
  ShoppingCart,
  Truck,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

type Customer = {
  id: string;
  name: string | null;
};

type Supplier = {
  id: string;
  name: string | null;
};

type RawInvoice = {
  id: string;
  partyId: string | null;
  amount: number | string | null;
  type: string | null;
  description: string | null;
  created_at: string;
  items: unknown;
  source: "sale" | "purchase";
};

type InvoiceRow = RawInvoice & {
  partyName: string;
  itemsCount: number;
};

type InvoiceItem = {
  name?: string | null;
  qty?: number | string | null;
  stock_qty?: number | string | null;
  unit?: string | null;
  invoice_unit?: string | null;
  price?: number | string | null;
  cost?: number | string | null;
  net_price?: number | string | null;
};

const invoiceTypeLabels = {
  all: "كل الفواتير",
  sale: "بيع",
  purchase: "شراء",
};

function num(value: unknown) {
  return Number(value || 0);
}

function money(value: unknown) {
  return num(value).toLocaleString("ar-EG", { maximumFractionDigits: 2 });
}

function todayInput() {
  const date = new Date();
  const offset = date.getTimezoneOffset();
  const localDate = new Date(date.getTime() - offset * 60 * 1000);
  return localDate.toISOString().slice(0, 10);
}

function startOfLocalDay(value: string) {
  return new Date(`${value}T00:00:00`).toISOString();
}

function endOfLocalDay(value: string) {
  return new Date(`${value}T23:59:59.999`).toISOString();
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("ar-EG", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function countItems(items: unknown) {
  return Array.isArray(items) ? items.length : 0;
}

function invoiceItems(items: unknown): InvoiceItem[] {
  return Array.isArray(items) ? (items as InvoiceItem[]) : [];
}

export default function InvoicesReportPage() {
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [invoiceType, setInvoiceType] = useState<"all" | "sale" | "purchase">("all");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceRow | null>(null);

  const loadData = useCallback(async () => {
    if (!invoiceDate) return;

    setLoading(true);
    setError(null);

    try {
      const fromIso = startOfLocalDay(invoiceDate);
      const toIso = endOfLocalDay(invoiceDate);

      const [customersResult, suppliersResult, salesResult, purchasesResult] = await Promise.all([
        supabase.from("customers").select("id,name").order("name", { ascending: true }),
        supabase.from("suppliers").select("id,name").order("name", { ascending: true }),
        supabase
          .from("customer_transactions")
          .select("id,customer_id,amount,type,description,created_at,items")
          .eq("type", "sale")
          .gte("created_at", fromIso)
          .lte("created_at", toIso)
          .order("created_at", { ascending: false })
          .limit(500),
        supabase
          .from("transactions")
          .select("id,supplier_id,amount,type,description,created_at,items")
          .eq("type", "فاتورة توريد")
          .gte("created_at", fromIso)
          .lte("created_at", toIso)
          .order("created_at", { ascending: false })
          .limit(500),
      ]);

      const requestError =
        customersResult.error ?? suppliersResult.error ?? salesResult.error ?? purchasesResult.error;

      if (requestError) throw requestError;

      const customers = new Map(
        ((customersResult.data || []) as Customer[]).map((customer) => [
          customer.id,
          customer.name || "عميل بدون اسم",
        ]),
      );
      const suppliers = new Map(
        ((suppliersResult.data || []) as Supplier[]).map((supplier) => [
          supplier.id,
          supplier.name || "مورد بدون اسم",
        ]),
      );

      const sales = (salesResult.data || []).map((invoice) => ({
        id: String(invoice.id),
        partyId: invoice.customer_id || null,
        amount: invoice.amount,
        type: invoice.type,
        description: invoice.description,
        created_at: invoice.created_at,
        items: invoice.items,
        source: "sale" as const,
        partyName: customers.get(invoice.customer_id || "") || "عميل غير مسجل",
        itemsCount: countItems(invoice.items),
      }));

      const purchases = (purchasesResult.data || []).map((invoice) => ({
        id: String(invoice.id),
        partyId: invoice.supplier_id || null,
        amount: invoice.amount,
        type: invoice.type,
        description: invoice.description,
        created_at: invoice.created_at,
        items: invoice.items,
        source: "purchase" as const,
        partyName: suppliers.get(invoice.supplier_id || "") || "مورد غير مسجل",
        itemsCount: countItems(invoice.items),
      }));

      setInvoices([...sales, ...purchases].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));
    } catch (loadError) {
      setInvoices([]);
      setError(loadError instanceof Error ? loadError.message : "تعذر تحميل الفواتير.");
    } finally {
      setLoading(false);
    }
  }, [invoiceDate]);

  useEffect(() => {
    setInvoiceDate(todayInput());
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const visibleInvoices = useMemo(() => {
    const search = query.trim().toLowerCase();
    return invoices.filter((invoice) => {
      const matchesType = invoiceType === "all" || invoice.source === invoiceType;
      const matchesSearch =
        search.length === 0 ||
        invoice.partyName.toLowerCase().includes(search) ||
        invoice.id.toLowerCase().includes(search) ||
        (invoice.description || "").toLowerCase().includes(search);
      return matchesType && matchesSearch;
    });
  }, [invoiceType, invoices, query]);

  const totals = useMemo(() => {
    return visibleInvoices.reduce(
      (acc, invoice) => {
        if (invoice.source === "sale") {
          acc.sales += num(invoice.amount);
          acc.salesCount += 1;
        } else {
          acc.purchases += num(invoice.amount);
          acc.purchasesCount += 1;
        }
        return acc;
      },
      { sales: 0, purchases: 0, salesCount: 0, purchasesCount: 0 },
    );
  }, [visibleInvoices]);

  return (
    <div className="min-h-[calc(100vh-8rem)] bg-slate-50 text-right" dir="rtl">
      <div className="mx-auto max-w-7xl space-y-5 px-4 py-5">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                <ReceiptText className="h-7 w-7" />
              </div>
              <p className="text-xs font-black text-emerald-600">مراجعة الفواتير اليومية</p>
              <h1 className="mt-1 text-2xl font-black text-slate-950">كل فواتير البيع والشراء</h1>
              <p className="mt-2 max-w-3xl text-sm font-bold leading-7 text-slate-500">
                استخدم الصفحة دي لمراجعة أصل الفواتير في يوم محدد، وافصل بين البيع والشراء قبل مقارنة الأرقام بتقرير الخزنة.
              </p>
            </div>

            <Link
              href="/reports"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-slate-100 px-5 text-sm font-black text-slate-700 hover:bg-slate-200"
            >
              <ArrowRight className="h-5 w-5" />
              رجوع للتقارير
            </Link>
          </div>
        </section>

        <section className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:grid-cols-[1fr_auto_auto] lg:items-end">
          <label className="block">
            <span className="mb-1 block text-xs font-black text-slate-500">بحث</span>
            <span className="flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3">
              <Search className="h-4 w-4 text-slate-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="اسم العميل أو المورد أو رقم الفاتورة"
                className="min-w-0 flex-1 bg-transparent text-sm font-bold outline-none placeholder:text-slate-400"
              />
            </span>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-black text-slate-500">اليوم</span>
            <span className="flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3">
              <CalendarDays className="h-4 w-4 text-slate-400" />
              <input
                type="date"
                value={invoiceDate}
                onChange={(event) => setInvoiceDate(event.target.value)}
                className="bg-transparent text-sm font-black text-slate-900 outline-none"
              />
            </span>
          </label>

          <div className="flex flex-wrap gap-2">
            {(["all", "sale", "purchase"] as const).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setInvoiceType(type)}
                className={`inline-flex h-11 items-center gap-2 rounded-xl px-4 text-xs font-black transition ${
                  invoiceType === type
                    ? "bg-slate-950 text-white"
                    : "border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
                }`}
              >
                <Filter className="h-4 w-4" />
                {invoiceTypeLabels[type]}
              </button>
            ))}
            <button
              type="button"
              onClick={loadData}
              disabled={loading || !invoiceDate}
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-emerald-600 px-4 text-xs font-black text-white hover:bg-emerald-500 disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              تحديث
            </button>
          </div>
        </section>

        {error && (
          <section className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-700">
            {error}
          </section>
        )}

        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm">
            <p className="text-xs font-black text-slate-500">إجمالي البيع</p>
            <p className="mt-2 text-2xl font-black text-emerald-700">{money(totals.sales)} ج</p>
            <p className="mt-1 text-xs font-bold text-slate-400">{totals.salesCount.toLocaleString("ar-EG")} فاتورة</p>
          </div>
          <div className="rounded-2xl border border-amber-100 bg-white p-4 shadow-sm">
            <p className="text-xs font-black text-slate-500">إجمالي الشراء</p>
            <p className="mt-2 text-2xl font-black text-amber-700">{money(totals.purchases)} ج</p>
            <p className="mt-1 text-xs font-bold text-slate-400">{totals.purchasesCount.toLocaleString("ar-EG")} فاتورة</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-black text-slate-500">عدد الفواتير المعروضة</p>
            <p className="mt-2 text-2xl font-black text-slate-950">{visibleInvoices.length.toLocaleString("ar-EG")}</p>
            <p className="mt-1 text-xs font-bold text-slate-400">بعد الفلتر والبحث</p>
          </div>
          <div className="rounded-2xl border border-sky-100 bg-white p-4 shadow-sm">
            <p className="text-xs font-black text-slate-500">فرق البيع والشراء</p>
            <p className="mt-2 text-2xl font-black text-sky-700">{money(totals.sales - totals.purchases)} ج</p>
            <p className="mt-1 text-xs font-bold text-slate-400">ليس رصيد الخزنة، لكنه مؤشر مراجعة</p>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 p-4">
            <div>
              <h2 className="font-black text-slate-950">الفواتير</h2>
              <p className="mt-1 text-xs font-bold text-slate-400">الجدول قابل للتمرير بدون ما الصفحة تطول زيادة.</p>
            </div>
          </div>

          <div className="max-h-[560px] overflow-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="sticky top-0 z-10 bg-slate-50 text-xs font-black text-slate-500">
                <tr>
                  <th className="p-3 text-right">النوع</th>
                  <th className="p-3 text-right">التاريخ</th>
                  <th className="p-3 text-right">الطرف</th>
                  <th className="p-3 text-right">رقم الفاتورة</th>
                  <th className="p-3 text-right">الأصناف</th>
                  <th className="p-3 text-right">الإجمالي</th>
                  <th className="p-3 text-right">الوصف</th>
                  <th className="p-3 text-right">فتح</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="p-10 text-center text-sm font-black text-slate-400">
                      جاري تحميل الفواتير...
                    </td>
                  </tr>
                ) : visibleInvoices.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-10 text-center text-sm font-black text-slate-400">
                      لا توجد فواتير مطابقة للفلاتر الحالية.
                    </td>
                  </tr>
                ) : (
                  visibleInvoices.map((invoice) => {
                    const isSale = invoice.source === "sale";
                    return (
                      <tr key={`${invoice.source}-${invoice.id}`} className="hover:bg-slate-50">
                        <td className="p-3">
                          <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-black ${
                            isSale ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                          }`}>
                            {isSale ? <ShoppingCart className="h-4 w-4" /> : <Truck className="h-4 w-4" />}
                            {isSale ? "بيع" : "شراء"}
                          </span>
                        </td>
                        <td className="p-3 font-bold text-slate-600">{formatDate(invoice.created_at)}</td>
                        <td className="p-3 font-black text-slate-900">{invoice.partyName}</td>
                        <td className="p-3 font-mono text-xs font-bold text-slate-500">{invoice.id}</td>
                        <td className="p-3 font-bold text-slate-600">{invoice.itemsCount.toLocaleString("ar-EG")}</td>
                        <td className="p-3 font-black text-slate-950">{money(invoice.amount)} ج</td>
                        <td className="max-w-[260px] truncate p-3 font-bold text-slate-500">{invoice.description || "-"}</td>
                        <td className="p-3">
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => setSelectedInvoice(invoice)}
                              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50"
                            >
                              تفاصيل
                            </button>
                          {invoice.partyId ? (
                            <Link
                              href={isSale ? `/customer/${invoice.partyId}/history` : `/suppliers/${invoice.partyId}/history`}
                              className="rounded-xl bg-slate-950 px-3 py-2 text-xs font-black text-white hover:bg-slate-700"
                            >
                              فتح السجل
                            </Link>
                          ) : (
                            <span className="text-xs font-bold text-slate-400">غير متاح</span>
                          )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>

        {selectedInvoice && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
              <div className="flex items-start justify-between gap-4 border-b border-slate-100 p-5">
                <div>
                  <p className="text-xs font-black text-emerald-600">
                    {selectedInvoice.source === "sale" ? "فاتورة بيع" : "فاتورة شراء"}
                  </p>
                  <h2 className="mt-1 text-xl font-black text-slate-950">{selectedInvoice.partyName}</h2>
                  <p className="mt-1 text-xs font-bold text-slate-400">
                    {formatDate(selectedInvoice.created_at)} - {money(selectedInvoice.amount)} ج
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedInvoice(null)}
                  className="rounded-xl bg-slate-100 px-4 py-2 text-xs font-black text-slate-700 hover:bg-slate-200"
                >
                  إغلاق
                </button>
              </div>

              <div className="overflow-auto p-5">
                {invoiceItems(selectedInvoice.items).length === 0 ? (
                  <div className="rounded-2xl bg-slate-50 p-8 text-center text-sm font-black text-slate-400">
                    لا توجد تفاصيل أصناف محفوظة لهذه الفاتورة.
                  </div>
                ) : (
                  <table className="w-full min-w-[720px] text-sm">
                    <thead className="bg-slate-50 text-xs font-black text-slate-500">
                      <tr>
                        <th className="p-3 text-right">الصنف</th>
                        <th className="p-3 text-right">الكمية</th>
                        <th className="p-3 text-right">الوحدة</th>
                        <th className="p-3 text-right">كمية المخزون</th>
                        <th className="p-3 text-right">السعر</th>
                        <th className="p-3 text-right">الإجمالي</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {invoiceItems(selectedInvoice.items).map((item, index) => {
                        const qty = num(item.qty);
                        const stockQty = num(item.stock_qty);
                        const price = num(item.net_price ?? item.price ?? item.cost);
                        return (
                          <tr key={`${item.name || "item"}-${index}`}>
                            <td className="p-3 font-black text-slate-950">{item.name || "-"}</td>
                            <td className="p-3 font-bold text-slate-600">{money(qty)}</td>
                            <td className="p-3 font-bold text-slate-600">{item.invoice_unit || item.unit || "-"}</td>
                            <td className="p-3 font-bold text-slate-600">{stockQty ? `${money(stockQty)} ${item.unit || ""}` : "-"}</td>
                            <td className="p-3 font-bold text-slate-600">{money(price)} ج</td>
                            <td className="p-3 font-black text-slate-950">{money(qty * price)} ج</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
