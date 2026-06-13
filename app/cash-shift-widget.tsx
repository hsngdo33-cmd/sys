"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BadgeCheck, Loader2, RefreshCw, WalletCards } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { getActiveCashSession } from "@/app/cash-session";
import { recordStaffActivity } from "@/app/staff-activity";
import { useStaffSession } from "@/app/staff-session";

type CashSession = {
  id: string;
  opened_by: string | null;
  opening_balance: number;
  status: string;
  opened_at: string;
};

type CashEntry = {
  direction: string;
  amount: number;
};

function money(value: unknown) {
  return Number(value || 0).toLocaleString("ar-EG", { maximumFractionDigits: 2 });
}

export function CashShiftWidget() {
  const staff = useStaffSession();
  const operatorName = staff?.name || "غير مسجل";
  const [activeSession, setActiveSession] = useState<CashSession | null>(null);
  const [cashEntries, setCashEntries] = useState<CashEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sessionForm, setSessionForm] = useState({
    openedBy: operatorName,
    openingBalance: "",
  });
  const [closeForm, setCloseForm] = useState({
    closingBalance: "",
    note: "",
  });
  const [closingBalanceTouched, setClosingBalanceTouched] = useState(false);

  const cashSummary = useMemo(() => {
    return cashEntries.reduce(
      (totals, entry) => {
        const amount = Number(entry.amount || 0);
        if (entry.direction === "in") totals.in += amount;
        if (entry.direction === "out") totals.out += amount;
        return totals;
      },
      { in: 0, out: 0 },
    );
  }, [cashEntries]);

  const expectedCash = Number(activeSession?.opening_balance || 0) + cashSummary.in - cashSummary.out;
  const actualClosingBalance = Number(closeForm.closingBalance || 0);
  const closingVariance = closeForm.closingBalance ? actualClosingBalance - expectedCash : 0;

  async function loadShift() {
    setLoading(true);
    setError(null);

    try {
      const session = await getActiveCashSession();
      setActiveSession(session as CashSession | null);

      if (!session) {
        setCashEntries([]);
        return;
      }

      const { data, error: entriesError } = await supabase
        .from("cash_entries")
        .select("direction,amount")
        .eq("session_id", session.id);

      if (entriesError) throw entriesError;
      setCashEntries((data || []) as CashEntry[]);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "تعذر تحميل حالة الوردية.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setSessionForm((current) => ({
      ...current,
      openedBy: current.openedBy === "غير مسجل" ? operatorName : current.openedBy,
    }));
  }, [operatorName]);

  useEffect(() => {
    void loadShift();
  }, []);

  useEffect(() => {
    if (!activeSession) {
      setCloseForm({ closingBalance: "", note: "" });
      setClosingBalanceTouched(false);
      return;
    }

    setCloseForm((current) => ({
      ...current,
      closingBalance: closingBalanceTouched ? current.closingBalance : String(expectedCash),
    }));
  }, [activeSession, closingBalanceTouched, expectedCash]);

  async function openSession() {
    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const existingSession = activeSession || (await getActiveCashSession());
      if (existingSession) {
        await loadShift();
        throw new Error("توجد وردية مفتوحة بالفعل. اقفل الوردية الحالية قبل فتح وردية جديدة.");
      }

      const openingBalance = Number(sessionForm.openingBalance || 0);
      const { error: sessionError } = await supabase.from("cash_sessions").insert([
        {
          opened_by: sessionForm.openedBy || operatorName,
          opening_balance: openingBalance,
          expected_balance: openingBalance,
          status: "open",
        },
      ]);
      if (sessionError) throw sessionError;

      await recordStaffActivity({
        staff,
        action: "cash_session_open",
        entityType: "cash_session",
        note: `رصيد افتتاحي ${openingBalance}`,
      });

      setMessage("تم فتح وردية الخزنة.");
      await loadShift();
    } catch (sessionError) {
      setError(sessionError instanceof Error ? sessionError.message : "فشل فتح الوردية.");
    } finally {
      setSaving(false);
    }
  }

  async function closeSession() {
    if (!activeSession) return;
    if (!closeForm.closingBalance.trim()) {
      setError("اكتب الرصيد الفعلي الموجود في الخزنة قبل قفل الوردية.");
      return;
    }

    const closingBalance = Number(closeForm.closingBalance);
    if (Number.isNaN(closingBalance) || closingBalance < 0) {
      setError("الرصيد الفعلي لازم يكون رقم صحيح.");
      return;
    }

    const variance = closingBalance - expectedCash;
    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const { error: closeError } = await supabase
        .from("cash_sessions")
        .update({
          status: "closed",
          closed_by: operatorName,
          closing_balance: closingBalance,
          expected_balance: expectedCash,
          closed_at: new Date().toISOString(),
          note: closeForm.note || `فرق العهدة: ${variance}`,
        })
        .eq("id", activeSession.id);
      if (closeError) throw closeError;

      await recordStaffActivity({
        staff,
        action: "cash_session_close",
        entityType: "cash_session",
        entityId: activeSession.id,
        note: `رصيد متوقع ${expectedCash} - فعلي ${closingBalance} - فرق ${variance}`,
      });

      setCloseForm({ closingBalance: "", note: "" });
      setClosingBalanceTouched(false);
      setMessage("تم قفل وردية الخزنة.");
      await loadShift();
    } catch (closeError) {
      setError(closeError instanceof Error ? closeError.message : "فشل قفل الوردية.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
            <WalletCards className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-black text-slate-950">وردية الخزنة</h2>
            <p className="text-xs font-bold text-slate-500">افتح الوردية في بداية اليوم واقفلها بعد مراجعة العهدة.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={loadShift}
          disabled={loading || saving}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl bg-slate-100 px-4 text-xs font-black text-slate-700 hover:bg-slate-200 disabled:opacity-60"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          تحديث
        </button>
      </div>

      {(message || error) && (
        <div className={`mb-4 rounded-2xl border p-3 text-xs font-black ${error ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
          {error || message}
        </div>
      )}

      {activeSession ? (
        <div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
          <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-black text-emerald-700">وردية مفتوحة</p>
                <p className="mt-1 text-2xl font-black text-slate-950">{money(expectedCash)} ج</p>
                <p className="mt-1 text-[11px] font-bold text-emerald-800/80">المتوقع في الخزنة الآن</p>
              </div>
              <BadgeCheck className="h-9 w-9 text-emerald-600" />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 text-xs font-black">
              <div className="rounded-2xl bg-white/80 p-3 text-emerald-700">داخل: {money(cashSummary.in)} ج</div>
              <div className="rounded-2xl bg-white/80 p-3 text-orange-700">خارج: {money(cashSummary.out)} ج</div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs font-black text-slate-500">الرصيد الفعلي المعدود</span>
              <input
                type="number"
                min="0"
                step="any"
                value={closeForm.closingBalance}
                onChange={(event) => {
                  setClosingBalanceTouched(true);
                  setCloseForm({ ...closeForm, closingBalance: event.target.value });
                }}
                className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold outline-none focus:border-emerald-400"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-black text-slate-500">ملاحظة القفل</span>
              <input
                value={closeForm.note}
                onChange={(event) => setCloseForm({ ...closeForm, note: event.target.value })}
                placeholder="اختياري"
                className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold outline-none focus:border-emerald-400"
              />
            </label>
            <div className={`rounded-2xl p-3 text-sm font-black sm:col-span-2 ${Math.abs(closingVariance) > 0 ? "bg-amber-50 text-amber-800" : "bg-slate-50 text-slate-600"}`}>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <span>فرق العهدة: {money(closingVariance)} ج</span>
                <button
                  type="button"
                  onClick={() => {
                    setClosingBalanceTouched(false);
                    setCloseForm((current) => ({ ...current, closingBalance: String(expectedCash) }));
                  }}
                  className="rounded-xl bg-white px-3 py-1.5 text-xs font-black text-slate-700 shadow-sm hover:bg-slate-100"
                >
                  مطابقة المتوقع
                </button>
              </div>
            </div>
            <button
              type="button"
              onClick={closeSession}
              disabled={saving || !closeForm.closingBalance.trim()}
              className="h-12 rounded-2xl bg-slate-950 text-sm font-black text-white hover:bg-emerald-600 disabled:opacity-60 sm:col-span-2"
            >
              {saving ? "جاري الحفظ..." : "قفل الوردية"}
            </button>
          </div>
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-[1fr_1fr_auto]">
          <label className="block">
            <span className="mb-1 block text-xs font-black text-slate-500">اسم الموظف</span>
            <input
              value={sessionForm.openedBy}
              onChange={(event) => setSessionForm({ ...sessionForm, openedBy: event.target.value })}
              className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold outline-none focus:border-emerald-400"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-black text-slate-500">رصيد افتتاحي</span>
            <input
              type="number"
              value={sessionForm.openingBalance}
              onChange={(event) => setSessionForm({ ...sessionForm, openingBalance: event.target.value })}
              placeholder="0"
              className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold outline-none focus:border-emerald-400"
            />
          </label>
          <button
            type="button"
            onClick={openSession}
            disabled={saving}
            className="h-12 self-end rounded-2xl bg-emerald-600 px-6 text-sm font-black text-white hover:bg-emerald-500 disabled:opacity-60"
          >
            {saving ? "جاري الحفظ..." : "فتح وردية"}
          </button>
        </div>
      )}
      <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
        <Link
          href="/reports/invoices"
          className="rounded-xl bg-slate-950 px-4 py-2 text-xs font-black text-white hover:bg-slate-700"
        >
          مراجعة الفواتير
        </Link>
        <Link
          href="/reports/cash-sessions"
          className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-black text-slate-700 hover:bg-slate-100"
        >
          تقرير الخزنة
        </Link>
      </div>
    </section>
  );
}
