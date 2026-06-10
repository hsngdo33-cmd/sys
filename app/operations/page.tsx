"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowDownCircle,
  ArrowUpCircle,
  BadgeCheck,
  Boxes,
  ClipboardList,
  Loader2,
  MinusCircle,
  PlusCircle,
  RefreshCw,
  RotateCcw,
  Save,
  WalletCards,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { recordStaffActivity } from "@/app/staff-activity";
import { useStaffSession } from "@/app/staff-session";
import { UiModal } from "@/app/ui-modal";
import { getActiveCashSession, requireOpenShiftForCash } from "@/app/cash-session";

type Product = {
  id: string;
  name: string;
  unit: string | null;
  stock_quantity: number | string | null;
  purchase_price: number | string | null;
  sale_price: number | string | null;
};

type Movement = {
  id: string;
  product_id: string | null;
  movement_type: string;
  quantity: number;
  quantity_before: number | null;
  quantity_after: number | null;
  source_type: string | null;
  note: string | null;
  created_at: string;
  products?: { name: string | null; unit: string | null } | null;
};

type RawMovement = Omit<Movement, "products"> & {
  products?: { name: string | null; unit: string | null } | { name: string | null; unit: string | null }[] | null;
};

type CashSession = {
  id: string;
  opened_by: string | null;
  opening_balance: number;
  expected_balance: number | null;
  status: string;
  opened_at: string;
};

type CashEntry = {
  id: string;
  entry_type: string;
  direction: string;
  payment_method: string;
  amount: number;
  note: string | null;
  created_at: string;
};

const movementTypes = [
  { value: "adjustment_in", label: "تسوية زيادة", icon: PlusCircle, tone: "text-emerald-600 bg-emerald-50" },
  { value: "adjustment_out", label: "تسوية نقص", icon: MinusCircle, tone: "text-rose-600 bg-rose-50" },
  { value: "damage", label: "هالك/تالف", icon: RotateCcw, tone: "text-orange-600 bg-orange-50" },
  { value: "opening_balance", label: "رصيد افتتاحي", icon: Boxes, tone: "text-indigo-600 bg-indigo-50" },
];

const cashTypes = [
  { value: "income", label: "دخل إضافي", direction: "in" },
  { value: "expense", label: "مصروف", direction: "out" },
  { value: "owner_draw", label: "سحب مالك", direction: "out" },
  { value: "capital_in", label: "إضافة رأس مال", direction: "in" },
];

function money(value: unknown) {
  return Number(value || 0).toLocaleString("ar-EG", { maximumFractionDigits: 2 });
}

function signedQuantity(type: string, qty: number) {
  return type === "adjustment_out" || type === "damage" ? -Math.abs(qty) : Math.abs(qty);
}

export default function OperationsPage() {
  const staff = useStaffSession();
  const [activeOperationsPanel, setActiveOperationsPanel] = useState<"actions" | "history" | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [cashEntries, setCashEntries] = useState<CashEntry[]>([]);
  const [activeSession, setActiveSession] = useState<CashSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [movementForm, setMovementForm] = useState({
    productId: "",
    type: "adjustment_in",
    quantity: "",
    note: "",
  });

  const [sessionForm, setSessionForm] = useState({
    openedBy: "المدير",
    openingBalance: "",
  });

  const [closeForm, setCloseForm] = useState({
    closingBalance: "",
    note: "",
  });

  const [cashForm, setCashForm] = useState({
    type: "expense",
    amount: "",
    paymentMethod: "cash",
    note: "",
  });

  const selectedProduct = products.find((product) => product.id === movementForm.productId);
  const currentStock = Number(selectedProduct?.stock_quantity || 0);
  const quantityDelta = signedQuantity(movementForm.type, Number(movementForm.quantity || 0));
  const expectedStock = selectedProduct ? currentStock + quantityDelta : 0;

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

  const expectedCash =
    Number(activeSession?.opening_balance || 0) + cashSummary.in - cashSummary.out;
  const actualClosingBalance = Number(closeForm.closingBalance || 0);
  const closingVariance = closeForm.closingBalance ? actualClosingBalance - expectedCash : 0;
  const operatorName = staff?.name || "غير مسجل";
  const isCashier = staff?.role === "cashier";

  async function loadData() {
    setLoading(true);
    setError(null);

    try {
      const [productsResult, movementsResult, sessionsResult] = await Promise.all([
        supabase
          .from("products")
          .select("id,name,unit,stock_quantity,purchase_price,sale_price")
          .order("name"),
        supabase
          .from("inventory_movements")
          .select("id,product_id,movement_type,quantity,quantity_before,quantity_after,source_type,note,created_at,products(name,unit)")
          .order("created_at", { ascending: false })
          .limit(12),
        supabase
          .from("cash_sessions")
          .select("id,opened_by,opening_balance,expected_balance,status,opened_at")
          .eq("status", "open")
          .order("opened_at", { ascending: false })
          .limit(1),
      ]);

      if (productsResult.error) throw productsResult.error;
      if (movementsResult.error) throw movementsResult.error;
      if (sessionsResult.error) throw sessionsResult.error;

      const activeCashSession = (sessionsResult.data?.[0] as CashSession | undefined) || null;
      const cashQuery = supabase
        .from("cash_entries")
        .select("id,entry_type,direction,payment_method,amount,note,created_at")
        .order("created_at", { ascending: false })
        .limit(20);
      const cashResult = activeCashSession
        ? await cashQuery.eq("session_id", activeCashSession.id)
        : await cashQuery;
      if (cashResult.error) throw cashResult.error;

      setProducts((productsResult.data || []) as Product[]);
      setMovements(
        ((movementsResult.data || []) as RawMovement[]).map((movement) => ({
          ...movement,
          products: Array.isArray(movement.products) ? movement.products[0] || null : movement.products,
        })),
      );
      setActiveSession(activeCashSession);
      setCashEntries((cashResult.data || []) as CashEntry[]);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "تعذر تحميل مركز العمليات. تواصل مع مسؤول النظام لتجهيز قاعدة البيانات.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadData();
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!activeSession) {
      setCloseForm({ closingBalance: "", note: "" });
      return;
    }

    setCloseForm((current) => ({
      ...current,
      closingBalance: current.closingBalance || String(expectedCash),
    }));
  }, [activeSession, expectedCash]);

  async function saveMovement() {
    if (!selectedProduct) return setError("اختار الصنف الأول.");
    const quantity = Number(movementForm.quantity);
    if (!quantity || quantity <= 0) return setError("اكتب كمية صحيحة.");

    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const nextStock = currentStock + quantityDelta;
      if (nextStock < 0) throw new Error("الكمية بعد التسوية لا يمكن تكون أقل من صفر.");

      const { error: productError } = await supabase
        .from("products")
        .update({ stock_quantity: nextStock })
        .eq("id", selectedProduct.id);
      if (productError) throw productError;

      const { error: movementError } = await supabase.from("inventory_movements").insert([
        {
          product_id: selectedProduct.id,
          movement_type: movementForm.type,
          quantity: quantityDelta,
          quantity_before: currentStock,
          quantity_after: nextStock,
          source_type: "manual_adjustment",
          note: movementForm.note || null,
          created_by: operatorName,
        },
      ]);
      if (movementError) throw movementError;

      await recordStaffActivity({
        staff,
        action: "inventory_adjustment",
        entityType: "product",
        entityId: selectedProduct.id,
        note: `${selectedProduct.name} (${quantityDelta >= 0 ? "+" : ""}${quantityDelta})`,
      });

      setMovementForm({ productId: "", type: "adjustment_in", quantity: "", note: "" });
      setMessage("تم تسجيل حركة المخزون وتحديث كمية الصنف.");
      await loadData();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "فشل حفظ حركة المخزون.");
    } finally {
      setSaving(false);
    }
  }

  async function openSession() {
    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const existingSession = activeSession || (await getActiveCashSession());
      if (existingSession) {
        await loadData();
        throw new Error("توجد وردية مفتوحة بالفعل. اقفل الوردية الحالية قبل فتح وردية جديدة.");
      }

      const { error: sessionError } = await supabase.from("cash_sessions").insert([
        {
          opened_by: sessionForm.openedBy || operatorName,
          opening_balance: Number(sessionForm.openingBalance || 0),
          expected_balance: Number(sessionForm.openingBalance || 0),
          status: "open",
        },
      ]);
      if (sessionError) throw sessionError;

      await recordStaffActivity({
        staff,
        action: "cash_session_open",
        entityType: "cash_session",
        note: `رصيد افتتاحي ${Number(sessionForm.openingBalance || 0)}`,
      });

      setMessage("تم فتح وردية الخزنة.");
      await loadData();
    } catch (sessionError) {
      setError(sessionError instanceof Error ? sessionError.message : "فشل فتح الوردية.");
    } finally {
      setSaving(false);
    }
  }

  async function closeSession() {
    if (!activeSession) return;
    if (!closeForm.closingBalance.trim()) return setError("اكتب الرصيد الفعلي الموجود في الخزنة قبل قفل الوردية.");

    const closingBalance = Number(closeForm.closingBalance);
    if (Number.isNaN(closingBalance) || closingBalance < 0) return setError("الرصيد الفعلي لازم يكون رقم صحيح.");

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
      setMessage("تم قفل وردية الخزنة.");
      await loadData();
    } catch (closeError) {
      setError(closeError instanceof Error ? closeError.message : "فشل قفل الوردية.");
    } finally {
      setSaving(false);
    }
  }

  async function saveCashEntry() {
    const amount = Number(cashForm.amount);
    if (!amount || amount <= 0) return setError("اكتب مبلغ صحيح.");

    const selectedType = cashTypes.find((type) => type.value === cashForm.type);
    if (!selectedType) return setError("اختار نوع حركة الخزنة.");

    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const shiftCheck = await requireOpenShiftForCash(amount);
      if (!shiftCheck.ok) throw new Error(shiftCheck.message);
      const sessionId = shiftCheck.sessionId || activeSession?.id || null;

      const { error: cashError } = await supabase.from("cash_entries").insert([
        {
          session_id: sessionId,
          entry_type: selectedType.value,
          direction: selectedType.direction,
          payment_method: cashForm.paymentMethod,
          amount,
          source_type: "manual_cash_entry",
          note: cashForm.note || selectedType.label,
          created_by: operatorName,
        },
      ]);
      if (cashError) throw cashError;

      if (selectedType.value === "expense") {
        await supabase.from("expenses").insert([
          {
            category: "مصروف تشغيلي",
            amount,
            description: cashForm.note || "مصروف من مركز العمليات",
          },
        ]);
      }

      await recordStaffActivity({
        staff,
        action: "cash_entry",
        entityType: "cash_entry",
        note: `${selectedType.label} - ${amount}`,
      });

      setCashForm({ type: "expense", amount: "", paymentMethod: "cash", note: "" });
      setMessage("تم تسجيل حركة الخزنة.");
      await loadData();
    } catch (cashError) {
      setError(cashError instanceof Error ? cashError.message : "فشل تسجيل حركة الخزنة.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-[calc(100vh-8rem)] text-right" dir="rtl">
      <div className="space-y-6">
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                <ClipboardList className="h-7 w-7" />
              </div>
              <p className="text-xs font-black text-emerald-600">مركز التشغيل اليومي</p>
              <h1 className="mt-1 text-2xl font-black text-slate-950">العمليات الاحترافية</h1>
              <p className="mt-2 max-w-3xl text-sm font-bold leading-7 text-slate-500">
                راقب حركة المخزون والخزنة وسجل التسويات من مكان واحد، بحيث كل رقم في النظام يكون له سبب واضح.
              </p>
            </div>

            <button
              type="button"
              onClick={loadData}
              disabled={loading}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 text-sm font-black text-white hover:bg-emerald-600 disabled:opacity-60"
            >
              {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <RefreshCw className="h-5 w-5" />}
              تحديث البيانات
            </button>
          </div>
        </section>

        {(message || error) && (
          <div
            className={`rounded-2xl border p-4 text-sm font-black ${
              error
                ? "border-rose-200 bg-rose-50 text-rose-700"
                : "border-emerald-200 bg-emerald-50 text-emerald-700"
            }`}
          >
            {error || message}
          </div>
        )}

        <section className={`grid gap-4 ${isCashier ? "lg:grid-cols-3" : "lg:grid-cols-4"}`}>
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-black text-slate-400">حالة الوردية</p>
            <p className={`mt-3 text-2xl font-black ${activeSession ? "text-emerald-600" : "text-amber-600"}`}>
              {activeSession ? "مفتوحة" : "مغلقة"}
            </p>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-black text-slate-400">داخل الخزنة</p>
            <p className="mt-3 text-2xl font-black text-emerald-600">{money(cashSummary.in)} ج</p>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-black text-slate-400">خارج الخزنة</p>
            <p className="mt-3 text-2xl font-black text-orange-600">{money(cashSummary.out)} ج</p>
          </div>
          {!isCashier && (
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-black text-slate-400">حركات مخزون أخيرة</p>
            <p className="mt-3 text-2xl font-black text-indigo-600">{movements.length.toLocaleString("ar-EG")}</p>
          </div>
          )}
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <button
            type="button"
            onClick={() => setActiveOperationsPanel("actions")}
            className="rounded-3xl border border-slate-200 bg-white p-5 text-right shadow-sm transition hover:-translate-y-1 hover:border-emerald-200 hover:shadow-xl"
          >
            <span className="block text-lg font-black text-slate-950">{isCashier ? "وردية وخزنة الكاشير" : "عمليات اليوم"}</span>
            <span className="mt-2 block text-xs font-bold leading-6 text-slate-500">
              {isCashier ? "فتح وقفل الوردية وتسجيل حركة خزنة." : "تسوية مخزون، وردية، وخزنة من مكان واحد."}
            </span>
            <span className="mt-4 inline-flex rounded-2xl bg-slate-950 px-4 py-2 text-xs font-black text-white">فتح التفاصيل</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveOperationsPanel("history")}
            className="rounded-3xl border border-slate-200 bg-white p-5 text-right shadow-sm transition hover:-translate-y-1 hover:border-emerald-200 hover:shadow-xl"
          >
            <span className="block text-lg font-black text-slate-950">{isCashier ? "حركات الخزنة" : "سجلات الحركة"}</span>
            <span className="mt-2 block text-xs font-bold leading-6 text-slate-500">
              {isCashier ? "آخر الحركات المسجلة على الخزنة." : "آخر حركات المخزون والخزنة للمراجعة."}
            </span>
            <span className="mt-4 inline-flex rounded-2xl bg-slate-950 px-4 py-2 text-xs font-black text-white">فتح السجل</span>
          </button>
        </section>

        {activeOperationsPanel === "actions" && (
        <UiModal title={isCashier ? "وردية وخزنة الكاشير" : "عمليات اليوم"} description="نفذ العملية المطلوبة ثم اقفل المودال." onClose={() => setActiveOperationsPanel(null)}>
        <section className={`grid gap-6 ${isCashier ? "xl:grid-cols-1" : "xl:grid-cols-[1.1fr_0.9fr]"}`}>
          {!isCashier && (
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
                <Boxes className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-xl font-black text-slate-950">تسوية وحركة المخزون</h2>
                <p className="text-xs font-bold text-slate-500">استخدمها للجرد، الهالك، الرصيد الافتتاحي، وأي تعديل يدوي.</p>
              </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-4">
              <label className="block lg:col-span-2">
                <span className="mb-1 block text-xs font-black text-slate-500">الصنف</span>
                <select
                  value={movementForm.productId}
                  onChange={(event) => setMovementForm({ ...movementForm, productId: event.target.value })}
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold outline-none focus:border-indigo-400"
                >
                  <option value="">اختار الصنف</option>
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name} - {money(product.stock_quantity)} {product.unit || ""}
                    </option>
                  ))}
                </select>
                <span className="mt-1 block text-[11px] font-bold leading-5 text-slate-400">
                  اختار الصنف اللي عاوز تعدل كميته. الرقم الظاهر هو الكمية الحالية في المخزن.
                </span>
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-black text-slate-500">نوع الحركة</span>
                <select
                  value={movementForm.type}
                  onChange={(event) => setMovementForm({ ...movementForm, type: event.target.value })}
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold outline-none focus:border-indigo-400"
                >
                  {movementTypes.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
                <span className="mt-1 block text-[11px] font-bold leading-5 text-slate-400">
                  زيادة تدخل للمخزون، نقص أو هالك يخصم منه، والرصيد الافتتاحي يستخدم عند بداية التشغيل.
                </span>
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-black text-slate-500">الكمية</span>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={movementForm.quantity}
                  onChange={(event) => setMovementForm({ ...movementForm, quantity: event.target.value })}
                  placeholder="الكمية"
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold outline-none focus:border-indigo-400"
                />
                <span className="mt-1 block text-[11px] font-bold leading-5 text-slate-400">
                  اكتب الرقم فقط. النظام هيحدد موجب أو سالب حسب نوع الحركة المختار.
                </span>
              </label>

              <label className="block lg:col-span-3">
                <span className="mb-1 block text-xs font-black text-slate-500">ملاحظة الحركة</span>
                <input
                  value={movementForm.note}
                  onChange={(event) => setMovementForm({ ...movementForm, note: event.target.value })}
                  placeholder="ملاحظة الحركة"
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold outline-none focus:border-indigo-400"
                />
                <span className="mt-1 block text-[11px] font-bold leading-5 text-slate-400">
                  اكتب سبب واضح مثل: جرد آخر اليوم، تلف، فرق وزن، أو إضافة رصيد افتتاحي.
                </span>
              </label>

              <button
                type="button"
                onClick={saveMovement}
                disabled={saving}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-5 text-sm font-black text-white hover:bg-indigo-500 disabled:opacity-60"
              >
                <Save className="h-5 w-5" />
                حفظ الحركة
              </button>
            </div>

            {selectedProduct && (
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl bg-slate-50 p-4">
                  <p className="text-xs font-black text-slate-400">قبل</p>
                  <p className="mt-1 text-xl font-black text-slate-900">{money(currentStock)}</p>
                </div>
                <div className="rounded-2xl bg-slate-50 p-4">
                  <p className="text-xs font-black text-slate-400">الحركة</p>
                  <p className={`mt-1 text-xl font-black ${quantityDelta >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                    {quantityDelta >= 0 ? "+" : ""}
                    {money(quantityDelta)}
                  </p>
                </div>
                <div className="rounded-2xl bg-slate-50 p-4">
                  <p className="text-xs font-black text-slate-400">بعد</p>
                  <p className="mt-1 text-xl font-black text-slate-900">{money(expectedStock)}</p>
                </div>
              </div>
            )}
          </div>
          )}

          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                <WalletCards className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-xl font-black text-slate-950">الخزنة والوردية</h2>
                <p className="text-xs font-bold text-slate-500">افتح وردية، سجل دخل/مصروف، واقفل اليوم برقم متوقع.</p>
              </div>
            </div>

            {activeSession ? (
              <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-black text-emerald-700">وردية مفتوحة</p>
                    <p className="mt-1 text-2xl font-black text-slate-950">{money(expectedCash)} ج</p>
                  </div>
                  <BadgeCheck className="h-9 w-9 text-emerald-600" />
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1 block text-xs font-black text-emerald-800">الرصيد الفعلي المعدود</span>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={closeForm.closingBalance}
                      onChange={(event) => setCloseForm({ ...closeForm, closingBalance: event.target.value })}
                      placeholder="الرصيد الفعلي"
                      className="h-12 w-full rounded-2xl border border-emerald-200 bg-white px-4 text-sm font-bold outline-none focus:border-emerald-500"
                    />
                    <span className="mt-1 block text-[11px] font-bold leading-5 text-emerald-800/70">
                      اكتب المبلغ الموجود فعليًا في درج الكاشير بعد العد.
                    </span>
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-xs font-black text-emerald-800">ملاحظة القفل</span>
                    <input
                      value={closeForm.note}
                      onChange={(event) => setCloseForm({ ...closeForm, note: event.target.value })}
                      placeholder="مثال: فرق فكة أو مصروف غير مسجل"
                      className="h-12 w-full rounded-2xl border border-emerald-200 bg-white px-4 text-sm font-bold outline-none focus:border-emerald-500"
                    />
                    <span className="mt-1 block text-[11px] font-bold leading-5 text-emerald-800/70">
                      تظهر في تقرير الورديات عند مراجعة فرق العهدة.
                    </span>
                  </label>
                </div>

                <div className={`mt-3 rounded-2xl p-3 text-sm font-black ${
                  Math.abs(closingVariance) > 0 ? "bg-amber-100 text-amber-800" : "bg-white/80 text-emerald-800"
                }`}>
                  فرق العهدة: {money(closingVariance)} ج
                </div>
                <button
                  type="button"
                  onClick={closeSession}
                  disabled={saving || !closeForm.closingBalance.trim()}
                  className="mt-4 h-11 w-full rounded-2xl bg-slate-950 text-sm font-black text-white hover:bg-emerald-600 disabled:opacity-60"
                >
                  قفل الوردية
                </button>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-xs font-black text-slate-500">اسم الموظف</span>
                  <input
                    value={sessionForm.openedBy}
                    onChange={(event) => setSessionForm({ ...sessionForm, openedBy: event.target.value })}
                    placeholder="اسم الموظف"
                    className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold outline-none focus:border-emerald-400"
                  />
                  <span className="mt-1 block text-[11px] font-bold leading-5 text-slate-400">
                    اسم الشخص اللي فتح الوردية عشان يظهر في المراجعة اليومية.
                  </span>
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-black text-slate-500">رصيد افتتاحي</span>
                  <input
                    type="number"
                    value={sessionForm.openingBalance}
                    onChange={(event) => setSessionForm({ ...sessionForm, openingBalance: event.target.value })}
                    placeholder="رصيد افتتاحي"
                    className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold outline-none focus:border-emerald-400"
                  />
                  <span className="mt-1 block text-[11px] font-bold leading-5 text-slate-400">
                    المبلغ الموجود في درج الكاشير قبل بداية البيع أو المصروفات.
                  </span>
                </label>
                <button
                  type="button"
                  onClick={openSession}
                  disabled={saving}
                  className="h-12 rounded-2xl bg-emerald-600 text-sm font-black text-white hover:bg-emerald-500 disabled:opacity-60 sm:col-span-2"
                >
                  فتح وردية
                </button>
              </div>
            )}

            {!activeSession && (
              <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs font-black leading-6 text-amber-800">
                افتح وردية خزنة الأول قبل تسجيل أي دخل أو مصروف يدوي، عشان كل حركة تبقى مرتبطة بورديتها وتظهر في تقرير الخزنة.
              </div>
            )}

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs font-black text-slate-500">نوع حركة الخزنة</span>
                <select
                  value={cashForm.type}
                  onChange={(event) => setCashForm({ ...cashForm, type: event.target.value })}
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold outline-none focus:border-emerald-400"
                >
                  {cashTypes.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
                <span className="mt-1 block text-[11px] font-bold leading-5 text-slate-400">
                  دخل يزيد الخزنة، مصروف أو سحب مالك يقلل الخزنة.
                </span>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-black text-slate-500">المبلغ</span>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={cashForm.amount}
                  onChange={(event) => setCashForm({ ...cashForm, amount: event.target.value })}
                  placeholder="المبلغ"
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold outline-none focus:border-emerald-400"
                />
                <span className="mt-1 block text-[11px] font-bold leading-5 text-slate-400">
                  اكتب المبلغ الفعلي فقط. اتجاه الحركة بيتحدد تلقائيًا من نوعها.
                </span>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-black text-slate-500">طريقة الدفع</span>
                <select
                  value={cashForm.paymentMethod}
                  onChange={(event) => setCashForm({ ...cashForm, paymentMethod: event.target.value })}
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold outline-none focus:border-emerald-400"
                >
                  <option value="cash">نقدي</option>
                  <option value="card">فيزا</option>
                  <option value="wallet">محفظة</option>
                  <option value="bank">تحويل بنكي</option>
                </select>
                <span className="mt-1 block text-[11px] font-bold leading-5 text-slate-400">
                  استخدمها للفصل بين النقدي والفيزا والمحافظ عند تقفيل اليوم.
                </span>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-black text-slate-500">ملاحظة</span>
                <input
                  value={cashForm.note}
                  onChange={(event) => setCashForm({ ...cashForm, note: event.target.value })}
                  placeholder="ملاحظة"
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold outline-none focus:border-emerald-400"
                />
                <span className="mt-1 block text-[11px] font-bold leading-5 text-slate-400">
                  مثال: إيجار، كهرباء، سحب مالك، دخل خدمة، أو فرق خزنة.
                </span>
              </label>
              <button
                type="button"
                onClick={saveCashEntry}
                disabled={saving || !activeSession}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-slate-950 text-sm font-black text-white hover:bg-emerald-600 disabled:opacity-60 sm:col-span-2"
              >
                <Save className="h-5 w-5" />
                تسجيل حركة خزنة
              </button>
            </div>
          </div>
        </section>
        </UiModal>
        )}

        {activeOperationsPanel === "history" && (
        <UiModal title={isCashier ? "حركات الخزنة" : "سجلات الحركة"} description="مراجعة آخر الحركات المسجلة." onClose={() => setActiveOperationsPanel(null)}>
        <section className={`grid gap-6 ${isCashier ? "xl:grid-cols-1" : "xl:grid-cols-2"}`}>
          {!isCashier && (
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <h2 className="mb-4 text-xl font-black text-slate-950">آخر حركات المخزون</h2>
            <div className="space-y-3">
              {loading ? (
                <div className="py-10 text-center text-sm font-black text-slate-400">جاري التحميل...</div>
              ) : movements.length === 0 ? (
                <div className="rounded-2xl bg-slate-50 p-5 text-center text-sm font-black text-slate-400">
                  لا توجد حركات مخزون مسجلة بعد.
                </div>
              ) : (
                movements.map((movement) => {
                  const isIn = Number(movement.quantity || 0) >= 0;
                  return (
                    <div key={movement.id} className="flex items-center gap-3 rounded-2xl border border-slate-100 p-3">
                      <div className={`flex h-10 w-10 items-center justify-center rounded-2xl ${isIn ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"}`}>
                        {isIn ? <ArrowUpCircle className="h-5 w-5" /> : <ArrowDownCircle className="h-5 w-5" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-black text-slate-950">{movement.products?.name || "صنف غير معروف"}</p>
                        <p className="text-xs font-bold text-slate-400">{movement.note || movement.source_type || movement.movement_type}</p>
                      </div>
                      <div className={`text-left text-sm font-black ${isIn ? "text-emerald-600" : "text-rose-600"}`} dir="ltr">
                        {isIn ? "+" : ""}
                        {money(movement.quantity)}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
          )}

          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <h2 className="mb-4 text-xl font-black text-slate-950">آخر حركات الخزنة</h2>
            <div className="space-y-3">
              {cashEntries.length === 0 ? (
                <div className="rounded-2xl bg-slate-50 p-5 text-center text-sm font-black text-slate-400">
                  لا توجد حركات خزنة مسجلة بعد.
                </div>
              ) : (
                cashEntries.map((entry) => {
                  const isIn = entry.direction === "in";
                  return (
                    <div key={entry.id} className="flex items-center gap-3 rounded-2xl border border-slate-100 p-3">
                      <div className={`flex h-10 w-10 items-center justify-center rounded-2xl ${isIn ? "bg-emerald-50 text-emerald-600" : "bg-orange-50 text-orange-600"}`}>
                        {isIn ? <ArrowUpCircle className="h-5 w-5" /> : <ArrowDownCircle className="h-5 w-5" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-black text-slate-950">{entry.note || entry.entry_type}</p>
                        <p className="text-xs font-bold text-slate-400">{entry.payment_method}</p>
                      </div>
                      <div className={`text-left text-sm font-black ${isIn ? "text-emerald-600" : "text-orange-600"}`} dir="ltr">
                        {isIn ? "+" : "-"}
                        {money(entry.amount)} ج
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </section>
        </UiModal>
        )}

        <section className="rounded-3xl border border-slate-200 bg-slate-950 p-5 text-white shadow-sm sm:p-6">
          <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-start">
            <div>
              <h2 className="text-xl font-black">إرشادات استخدام مركز العمليات</h2>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl bg-white/10 p-4">
                  <h3 className="font-black text-emerald-300">{isCashier ? "وردية الكاشير" : "تشغيل يومي"}</h3>
                  <ol className="mt-2 list-inside list-decimal space-y-1 text-sm font-bold leading-7 text-slate-300">
                    <li>افتح وردية الخزنة في بداية اليوم واكتب الرصيد الموجود فعليًا.</li>
                    <li>سجل أي مصروف أو دخل خارج الفواتير من حركة الخزنة.</li>
                    <li>في نهاية اليوم راجع الداخل والخارج ثم اقفل الوردية.</li>
                  </ol>
                </div>
                {!isCashier && (
                <div className="rounded-2xl bg-white/10 p-4">
                  <h3 className="font-black text-indigo-300">تسوية المخزون</h3>
                  <ol className="mt-2 list-inside list-decimal space-y-1 text-sm font-bold leading-7 text-slate-300">
                    <li>اختار الصنف ثم نوع الحركة المناسبة.</li>
                    <li>اكتب الكمية فقط، والنظام يحسب هل هتزيد أو تقل.</li>
                    <li>اكتب سبب الحركة بوضوح عشان تظهر في سجل المراجعة.</li>
                  </ol>
                </div>
                )}
              </div>
            </div>
            <Link
              href="/reports"
              className="inline-flex h-12 items-center justify-center rounded-2xl bg-white px-5 text-sm font-black text-slate-950 hover:bg-emerald-50"
            >
              فتح التقارير
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
