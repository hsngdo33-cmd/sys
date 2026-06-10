"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  CalendarDays,
  RefreshCw,
  WalletCards,
  AlertTriangle,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { supabase } from "@/lib/supabase";

type CashSession = {
  id: string;
  opened_by: string | null;
  closed_by: string | null;
  opening_balance: number | string | null;
  closing_balance: number | string | null;
  expected_balance: number | string | null;
  status: string | null;
  opened_at: string;
  closed_at: string | null;
  note: string | null;
};

type CashEntry = {
  id: string;
  session_id: string | null;
  entry_type: string;
  direction: string;
  payment_method: string | null;
  amount: number | string | null;
  note: string | null;
  created_by: string | null;
  created_at: string;
};

const statusLabels: Record<string, string> = {
  all: "كل الورديات",
  open: "مفتوحة",
  closed: "مقفولة",
};

const entryTypeLabels: Record<string, string> = {
  sale_cash: "تحصيل بيع",
  supplier_payment: "سداد مورد",
  income: "دخل إضافي",
  expense: "مصروف",
  owner_draw: "سحب مالك",
  capital_in: "إضافة رأس مال",
};

function num(value: unknown) {
  return Number(value || 0);
}

function money(value: unknown) {
  return num(value).toLocaleString("ar-EG", { maximumFractionDigits: 2 });
}

function inputDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function defaultFromDate() {
  const date = new Date();
  date.setDate(date.getDate() - 29);
  return inputDate(date);
}

function todayInput() {
  return inputDate(new Date());
}

function startOfDay(date: string) {
  return date ? `${date}T00:00:00.000Z` : "";
}

function endOfDay(date: string) {
  return date ? `${date}T23:59:59.999Z` : "";
}

function formatDate(value: string | null) {
  if (!value) return "لم تغلق";
  return new Date(value).toLocaleString("ar-EG", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function durationText(start: string, end: string | null) {
  const endDate = end ? new Date(end) : new Date();
  const minutes = Math.max(0, Math.round((endDate.getTime() - new Date(start).getTime()) / 60000));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours <= 0) return `${rest} دقيقة`;
  return `${hours} ساعة${rest ? ` و${rest} دقيقة` : ""}`;
}

function buildSummaries(sessions: CashSession[], entries: CashEntry[]) {
  const entriesBySession = new Map<string, CashEntry[]>();
  entries.forEach((entry) => {
    if (!entry.session_id) return;
    const group = entriesBySession.get(entry.session_id) || [];
    group.push(entry);
    entriesBySession.set(entry.session_id, group);
  });

  return sessions.map((session) => {
    const sessionEntries = entriesBySession.get(session.id) || [];
    const totalIn = sessionEntries
      .filter((entry) => entry.direction === "in")
      .reduce((sum, entry) => sum + num(entry.amount), 0);
    const totalOut = sessionEntries
      .filter((entry) => entry.direction === "out")
      .reduce((sum, entry) => sum + num(entry.amount), 0);
    const expected = num(session.opening_balance) + totalIn - totalOut;
    const actual = session.closing_balance === null || session.closing_balance === undefined ? null : num(session.closing_balance);

    return {
      ...session,
      totalIn,
      totalOut,
      expected,
      actual,
      variance: actual === null ? 0 : actual - expected,
      entriesCount: sessionEntries.length,
    };
  });
}

export default function CashSessionsReportPage() {
  const [sessions, setSessions] = useState<CashSession[]>([]);
  const [entries, setEntries] = useState<CashEntry[]>([]);
  const [fromDate, setFromDate] = useState(defaultFromDate());
  const [toDate, setToDate] = useState(todayInput());
  const [status, setStatus] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      let sessionsQuery = supabase
        .from("cash_sessions")
        .select("id,opened_by,closed_by,opening_balance,closing_balance,expected_balance,status,opened_at,closed_at,note")
        .order("opened_at", { ascending: false })
        .limit(200);

      if (status !== "all") sessionsQuery = sessionsQuery.eq("status", status);
      if (fromDate) sessionsQuery = sessionsQuery.gte("opened_at", startOfDay(fromDate));
      if (toDate) sessionsQuery = sessionsQuery.lte("opened_at", endOfDay(toDate));

      const [sessionsResult, entriesResult] = await Promise.all([
        sessionsQuery,
        supabase
          .from("cash_entries")
          .select("id,session_id,entry_type,direction,payment_method,amount,note,created_by,created_at")
          .gte("created_at", startOfDay(fromDate))
          .lte("created_at", endOfDay(toDate))
          .order("created_at", { ascending: false })
          .limit(1000),
      ]);

      if (sessionsResult.error) throw sessionsResult.error;
      if (entriesResult.error) throw entriesResult.error;

      setSessions((sessionsResult.data || []) as CashSession[]);
      setEntries((entriesResult.data || []) as CashEntry[]);
    } catch (loadError) {
      setSessions([]);
      setEntries([]);
      setError(
        loadError instanceof Error
          ? `${loadError.message}. تواصل مع مسؤول النظام لتفعيل تقارير الورديات والخزنة.`
          : "تعذر تحميل تقرير الورديات والخزنة.",
      );
    } finally {
      setLoading(false);
    }
  }, [fromDate, status, toDate]);

  useEffect(() => {
    setMounted(true);
    const timer = window.setTimeout(() => {
      void loadData();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadData]);

  const summaries = useMemo(() => buildSummaries(sessions, entries), [entries, sessions]);

  const totals = useMemo(() => {
    return summaries.reduce(
      (acc, session) => {
        acc.in += session.totalIn;
        acc.out += session.totalOut;
        acc.open += session.status === "open" ? 1 : 0;
        acc.closed += session.status === "closed" ? 1 : 0;
        acc.variance += session.variance;
        acc.entries += session.entriesCount;
        return acc;
      },
      { in: 0, out: 0, open: 0, closed: 0, variance: 0, entries: 0 },
    );
  }, [summaries]);

  const chartData = useMemo(() => {
    return summaries
      .slice(0, 8)
      .reverse()
      .map((session) => ({
        name: session.opened_by || "وردية",
        دخل: session.totalIn,
        خارج: session.totalOut,
      }));
  }, [summaries]);

  const latestEntries = useMemo(() => entries.slice(0, 12), [entries]);

  return (
    <div className="min-h-[calc(100vh-8rem)] bg-slate-50 text-right" dir="rtl">
      <div className="mx-auto max-w-7xl space-y-5 px-4 py-5">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                <WalletCards className="h-7 w-7" />
              </div>
              <p className="text-xs font-black text-emerald-600">تقارير التشغيل المالي</p>
              <h1 className="mt-1 text-2xl font-black text-slate-950">تقرير الورديات والخزنة</h1>
              <p className="mt-2 max-w-3xl text-sm font-bold leading-7 text-slate-500">
                راجع كل وردية من لحظة الفتح حتى القفل، واعرف الداخل والخارج والرصيد المتوقع وأي فرق محتاج مراجعة.
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

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-black text-slate-950">نطاق التقرير</h2>
              <p className="mt-1 text-xs font-bold text-slate-500">حدد الفترة وحالة الوردية ثم حدث البيانات.</p>
            </div>
            <CalendarDays className="h-5 w-5 text-slate-400" />
          </div>
          <div className="grid gap-3 lg:grid-cols-4">
            <label className="block">
              <span className="mb-1 block text-xs font-black text-slate-500">من تاريخ</span>
              <input
                type="date"
                value={fromDate}
                onChange={(event) => setFromDate(event.target.value)}
                className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold outline-none focus:border-emerald-400"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-black text-slate-500">إلى تاريخ</span>
              <input
                type="date"
                value={toDate}
                onChange={(event) => setToDate(event.target.value)}
                className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold outline-none focus:border-emerald-400"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-black text-slate-500">حالة الوردية</span>
              <select
                value={status}
                onChange={(event) => setStatus(event.target.value)}
                className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold outline-none focus:border-emerald-400"
              >
                {Object.entries(statusLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={loadData}
              disabled={loading}
              className="mt-auto inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 text-sm font-black text-white hover:bg-emerald-600 disabled:opacity-60"
            >
              <RefreshCw className={`h-5 w-5 ${loading ? "animate-spin" : ""}`} />
              تحديث
            </button>
          </div>
        </section>

        {error && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-black text-rose-700">
            {error}
          </div>
        )}

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-4">
            <h2 className="text-lg font-black text-slate-950">ملخص الفترة</h2>
            <p className="mt-1 text-xs font-bold text-slate-500">أهم أرقام الخزنة والورديات في النطاق المحدد.</p>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <SummaryCard title="داخل الخزنة" value={`${money(totals.in)} ج`} tone="emerald" />
            <SummaryCard title="خارج الخزنة" value={`${money(totals.out)} ج`} tone="rose" />
            <SummaryCard title="ورديات مفتوحة" value={totals.open.toLocaleString("ar-EG")} tone="amber" />
            <SummaryCard title="ورديات مقفولة" value={totals.closed.toLocaleString("ar-EG")} tone="blue" />
            <SummaryCard title="فرق العهدة" value={`${money(totals.variance)} ج`} tone={Math.abs(totals.variance) > 0 ? "rose" : "slate"} />
          </div>
        </section>

        <section className="grid gap-5 xl:grid-cols-[1.25fr_0.75fr]">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-black text-slate-950">مقارنة آخر الورديات</h2>
                <p className="text-xs font-bold text-slate-500">الداخل والخارج لكل وردية في الفترة المختارة</p>
              </div>
              <CalendarDays className="h-5 w-5 text-slate-400" />
            </div>
            <div className="h-72 rounded-2xl bg-slate-50/50 p-2">
              {mounted ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 10, right: 8, left: 8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                    <YAxis tickFormatter={(value) => money(value)} tick={{ fontSize: 11 }} stroke="#94a3b8" />
                    <Tooltip formatter={(value) => [`${money(value)} ج`, ""]} labelStyle={{ fontWeight: 900 }} />
                    <Bar dataKey="دخل" fill="#059669" radius={[8, 8, 0, 0]} />
                    <Bar dataKey="خارج" fill="#e11d48" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center rounded-2xl bg-slate-50 text-sm font-black text-slate-400">
                  جاري تجهيز الرسم...
                </div>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-black text-slate-950">آخر حركات الخزنة</h2>
            <p className="mb-4 text-xs font-bold text-slate-500">أحدث العمليات المسجلة داخل الفترة</p>
            <div className="max-h-[360px] space-y-3 overflow-y-auto pr-1">
              {latestEntries.length === 0 ? (
                <div className="rounded-xl bg-slate-50 p-6 text-center text-sm font-black text-slate-400">لا توجد حركات خزنة.</div>
              ) : (
                latestEntries.map((entry) => (
                  <div key={entry.id} className="rounded-xl border border-slate-100 bg-white p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-black text-slate-950">{entryTypeLabels[entry.entry_type] || entry.entry_type}</p>
                        <p className="mt-1 text-xs font-bold text-slate-400">{entry.created_by || "غير مسجل"} - {formatDate(entry.created_at)}</p>
                      </div>
                      <span className={`rounded-lg px-3 py-1 text-xs font-black ${entry.direction === "in" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
                        {entry.direction === "in" ? "+" : "-"}{money(entry.amount)} ج
                      </span>
                    </div>
                    {entry.note && <p className="mt-2 text-xs font-bold leading-6 text-slate-500">{entry.note}</p>}
                  </div>
                ))
              )}
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-xl font-black text-slate-950">تفاصيل الورديات</h2>
              <p className="mt-1 text-xs font-bold text-slate-500">كل وردية في صف واضح مع الرصيد المتوقع والفعلي وفروق العهدة.</p>
            </div>
            <span className="text-xs font-black text-slate-400">{summaries.length.toLocaleString("ar-EG")} وردية</span>
          </div>
          {loading ? (
            <div className="rounded-xl bg-slate-50 p-8 text-center text-sm font-black text-slate-400">جاري تحميل الورديات...</div>
          ) : summaries.length === 0 ? (
            <div className="rounded-xl bg-slate-50 p-8 text-center text-sm font-black text-slate-400">لا توجد ورديات في الفترة المحددة.</div>
          ) : (
            <div className="max-h-[520px] overflow-auto rounded-2xl border border-slate-100">
              <table className="w-full min-w-[980px] text-right text-sm">
                <thead className="sticky top-0 z-10 bg-slate-50 text-[11px] font-black text-slate-500">
                  <tr>
                    <th className="p-3">الوردية</th>
                    <th className="p-3">الوقت</th>
                    <th className="p-3">داخل</th>
                    <th className="p-3">خارج</th>
                    <th className="p-3">متوقع</th>
                    <th className="p-3">فعلي</th>
                    <th className="p-3">الفرق</th>
                    <th className="p-3">حركات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {summaries.map((session) => (
                    <tr key={session.id} className="align-top hover:bg-slate-50/70">
                      <td className="p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-black ${session.status === "open" ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>
                            <BadgeCheck className="h-3.5 w-3.5" />
                            {statusLabels[session.status || "closed"] || session.status}
                          </span>
                          {Math.abs(session.variance) > 0 && (
                            <span className="inline-flex items-center gap-1 rounded-lg bg-rose-50 px-2.5 py-1 text-[11px] font-black text-rose-700">
                              <AlertTriangle className="h-3.5 w-3.5" />
                              مراجعة
                            </span>
                          )}
                        </div>
                        <p className="mt-2 font-black text-slate-950">{session.opened_by || "غير مسجل"}</p>
                        {session.note && <p className="mt-1 max-w-xs text-xs font-bold leading-5 text-slate-500">{session.note}</p>}
                      </td>
                      <td className="p-3 text-xs font-bold leading-6 text-slate-500">
                        <p>فتح: {formatDate(session.opened_at)}</p>
                        <p>قفل: {formatDate(session.closed_at)}</p>
                        <p>مدة: {durationText(session.opened_at, session.closed_at)}</p>
                      </td>
                      <td className="p-3 font-black text-emerald-700">{money(session.totalIn)} ج</td>
                      <td className="p-3 font-black text-rose-700">{money(session.totalOut)} ج</td>
                      <td className="p-3 font-black text-slate-900">{money(session.expected)} ج</td>
                      <td className="p-3 font-black text-slate-900">{session.actual === null ? "لم يغلق" : `${money(session.actual)} ج`}</td>
                      <td className={`p-3 font-black ${Math.abs(session.variance) > 0 ? "text-rose-700" : "text-emerald-700"}`}>
                        {money(session.variance)} ج
                      </td>
                      <td className="p-3 font-black text-slate-700">{session.entriesCount.toLocaleString("ar-EG")}</td>
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

function SummaryCard({
  title,
  value,
  tone,
}: {
  title: string;
  value: string;
  tone: "emerald" | "rose" | "amber" | "blue" | "slate";
}) {
  const tones = {
    emerald: "bg-emerald-50 text-emerald-700",
    rose: "bg-rose-50 text-rose-700",
    amber: "bg-amber-50 text-amber-700",
    blue: "bg-blue-50 text-blue-700",
    slate: "bg-slate-100 text-slate-700",
  };

  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
      <p className="text-xs font-black text-slate-400">{title}</p>
      <p className={`mt-3 inline-flex rounded-xl px-3 py-2 text-xl font-black ${tones[tone]}`}>{value}</p>
    </div>
  );
}
