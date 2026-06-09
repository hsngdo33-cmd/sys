"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Activity, ArrowRight, CalendarDays, RefreshCw, ShieldCheck, UserRound } from "lucide-react";
import { supabase } from "@/lib/supabase";

type StaffActivityRow = {
  id: string;
  staff_id: string | null;
  staff_name: string | null;
  staff_role: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  note: string | null;
  created_at: string;
};

type StaffRow = {
  id: string;
  name: string;
  role: string;
};

const actionLabels: Record<string, string> = {
  staff_login: "تسجيل دخول",
  customer_invoice_saved: "حفظ فاتورة بيع",
  supplier_invoice_saved: "حفظ فاتورة توريد",
  customer_return_saved: "حفظ مرتجع عميل",
  supplier_return_saved: "حفظ مرتجع مورد",
  inventory_adjustment: "تسوية مخزون",
  cash_session_open: "فتح وردية",
  cash_session_close: "قفل وردية",
  cash_entry: "حركة خزنة",
};

function formatDate(value: string) {
  return new Date(value).toLocaleString("ar-EG", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function startOfDay(date: string) {
  return date ? `${date}T00:00:00.000Z` : "";
}

function endOfDay(date: string) {
  return date ? `${date}T23:59:59.999Z` : "";
}

function todayInput() {
  return new Date().toISOString().slice(0, 10);
}

export default function StaffActivityReportPage() {
  const [activities, setActivities] = useState<StaffActivityRow[]>([]);
  const [staffRows, setStaffRows] = useState<StaffRow[]>([]);
  const [selectedStaff, setSelectedStaff] = useState("all");
  const [selectedAction, setSelectedAction] = useState("all");
  const [fromDate, setFromDate] = useState(todayInput());
  const [toDate, setToDate] = useState(todayInput());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      let activityQuery = supabase
        .from("staff_activity_logs")
        .select("id,staff_id,staff_name,staff_role,action,entity_type,entity_id,note,created_at")
        .order("created_at", { ascending: false })
        .limit(300);

      if (selectedStaff !== "all") activityQuery = activityQuery.eq("staff_id", selectedStaff);
      if (selectedAction !== "all") activityQuery = activityQuery.eq("action", selectedAction);
      if (fromDate) activityQuery = activityQuery.gte("created_at", startOfDay(fromDate));
      if (toDate) activityQuery = activityQuery.lte("created_at", endOfDay(toDate));

      const [activitiesResult, staffResult] = await Promise.all([
        activityQuery,
        supabase.from("staff_members").select("id,name,role").order("name"),
      ]);

      if (activitiesResult.error) throw activitiesResult.error;

      setActivities((activitiesResult.data || []) as StaffActivityRow[]);
      setStaffRows(staffResult.error ? [] : ((staffResult.data || []) as StaffRow[]));
    } catch (loadError) {
      setActivities([]);
      setError(
        loadError instanceof Error
          ? `${loadError.message}. شغل ملف supabase-staff-activity-upgrade.sql لو جدول النشاط غير موجود.`
          : "تعذر تحميل تقرير نشاط الموظفين.",
      );
    } finally {
      setLoading(false);
    }
  }, [fromDate, selectedAction, selectedStaff, toDate]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadData();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadData]);

  const actionOptions = useMemo(() => {
    const keys = new Set([...Object.keys(actionLabels), ...activities.map((activity) => activity.action)]);
    return Array.from(keys);
  }, [activities]);

  const summary = useMemo(() => {
    const uniqueStaff = new Set(activities.map((activity) => activity.staff_name || "غير مسجل"));
    const cashActions = activities.filter((activity) => activity.action.includes("cash") || activity.action.includes("session")).length;
    const invoiceActions = activities.filter((activity) => activity.action.includes("invoice") || activity.action.includes("return")).length;
    return {
      total: activities.length,
      uniqueStaff: uniqueStaff.size,
      cashActions,
      invoiceActions,
    };
  }, [activities]);

  return (
    <div className="min-h-[calc(100vh-8rem)] text-right" dir="rtl">
      <div className="space-y-6">
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-950 text-white">
                <ShieldCheck className="h-7 w-7" />
              </div>
              <p className="text-xs font-black text-emerald-600">تقارير الإدارة</p>
              <h1 className="text-2xl font-black text-slate-950">تقرير نشاط الموظفين</h1>
              <p className="mt-2 max-w-3xl text-sm font-bold leading-7 text-slate-500">
                راجع تسجيل الدخول والفواتير والمرتجعات وحركات الخزنة والتسويات حسب الموظف والفترة.
              </p>
            </div>

            <Link
              href="/reports"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-slate-100 px-5 text-sm font-black text-slate-700 hover:bg-slate-200"
            >
              <ArrowRight className="h-5 w-5" />
              رجوع للتقارير
            </Link>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="grid gap-3 lg:grid-cols-5">
            <label className="block">
              <span className="mb-1 block text-xs font-black text-slate-500">من تاريخ</span>
              <input
                type="date"
                value={fromDate}
                onChange={(event) => setFromDate(event.target.value)}
                className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold outline-none focus:border-emerald-400"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-black text-slate-500">إلى تاريخ</span>
              <input
                type="date"
                value={toDate}
                onChange={(event) => setToDate(event.target.value)}
                className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold outline-none focus:border-emerald-400"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-black text-slate-500">الموظف</span>
              <select
                value={selectedStaff}
                onChange={(event) => setSelectedStaff(event.target.value)}
                className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold outline-none focus:border-emerald-400"
              >
                <option value="all">كل الموظفين</option>
                {staffRows.map((staff) => (
                  <option key={staff.id} value={staff.id}>
                    {staff.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-black text-slate-500">نوع العملية</span>
              <select
                value={selectedAction}
                onChange={(event) => setSelectedAction(event.target.value)}
                className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold outline-none focus:border-emerald-400"
              >
                <option value="all">كل العمليات</option>
                {actionOptions.map((action) => (
                  <option key={action} value={action}>
                    {actionLabels[action] || action}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={loadData}
              disabled={loading}
              className="mt-auto inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 text-sm font-black text-white hover:bg-emerald-600 disabled:opacity-60"
            >
              <RefreshCw className={`h-5 w-5 ${loading ? "animate-spin" : ""}`} />
              تحديث
            </button>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <Activity className="mb-3 h-6 w-6 text-emerald-600" />
            <p className="text-xs font-black text-slate-400">إجمالي العمليات</p>
            <p className="mt-2 text-2xl font-black text-slate-950">{summary.total.toLocaleString("ar-EG")}</p>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <UserRound className="mb-3 h-6 w-6 text-indigo-600" />
            <p className="text-xs font-black text-slate-400">موظفين نشطوا</p>
            <p className="mt-2 text-2xl font-black text-slate-950">{summary.uniqueStaff.toLocaleString("ar-EG")}</p>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <CalendarDays className="mb-3 h-6 w-6 text-amber-600" />
            <p className="text-xs font-black text-slate-400">عمليات خزنة</p>
            <p className="mt-2 text-2xl font-black text-slate-950">{summary.cashActions.toLocaleString("ar-EG")}</p>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <ShieldCheck className="mb-3 h-6 w-6 text-rose-600" />
            <p className="text-xs font-black text-slate-400">فواتير ومرتجعات</p>
            <p className="mt-2 text-2xl font-black text-slate-950">{summary.invoiceActions.toLocaleString("ar-EG")}</p>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="mb-4 text-xl font-black text-slate-950">سجل النشاط</h2>
          {error && (
            <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-black text-rose-700">
              {error}
            </div>
          )}

          {loading ? (
            <div className="rounded-2xl bg-slate-50 p-8 text-center text-sm font-black text-slate-400">جاري تحميل النشاط...</div>
          ) : activities.length === 0 ? (
            <div className="rounded-2xl bg-slate-50 p-8 text-center text-sm font-black text-slate-400">لا توجد نشاطات في الفترة المحددة.</div>
          ) : (
            <div className="space-y-3">
              {activities.map((activity) => (
                <div key={activity.id} className="rounded-2xl border border-slate-100 p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <p className="text-sm font-black text-slate-950">{actionLabels[activity.action] || activity.action}</p>
                      <p className="mt-1 text-xs font-bold text-slate-400">
                        {activity.staff_name || "غير مسجل"}
                        {activity.staff_role ? ` - ${activity.staff_role}` : ""}
                        {activity.entity_type ? ` - ${activity.entity_type}` : ""}
                      </p>
                    </div>
                    <span className="rounded-xl bg-slate-50 px-3 py-1 text-xs font-black text-slate-500">
                      {formatDate(activity.created_at)}
                    </span>
                  </div>
                  {activity.note && <p className="mt-3 rounded-2xl bg-slate-50 p-3 text-xs font-bold leading-6 text-slate-600">{activity.note}</p>}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
