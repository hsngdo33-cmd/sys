"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  BadgeCheck,
  Boxes,
  ClipboardList,
  Download,
  Loader2,
  MinusCircle,
  PlusCircle,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  ShieldCheck,
  Undo2,
  WalletCards,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { recordStaffActivity } from "@/app/staff-activity";
import { useStaffSession } from "@/app/staff-session";
import { UiModal } from "@/app/ui-modal";
import { getActiveCashSession, requireOpenShiftForCash } from "@/app/cash-session";
import {
  conversionFactorForUnit,
  hasKnownConversion,
  invoiceUnitsForBaseUnit,
  manualConversionHint,
  productUnitConversions,
} from "@/lib/category-settings";
import { normalizeProductCategory, productCategoryLabel } from "@/lib/product-category";

type Product = {
  id: string;
  name: string;
  barcode: string | null;
  unit: string | null;
  stock_quantity: number | string | null;
  purchase_price: number | string | null;
  sale_price: number | string | null;
  product_category?: string | null;
  product_attributes?: unknown;
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
  created_by?: string | null;
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
  source_type?: string | null;
  note: string | null;
  created_by?: string | null;
  created_at: string;
};

type HistoryKind = "all" | "inventory" | "cash";

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

const cashCategories = ["مصروف تشغيلي", "إيجار", "كهرباء", "مرتبات", "صيانة", "خدمات", "فرق خزنة", "أخرى"];

function money(value: unknown) {
  return Number(value || 0).toLocaleString("ar-EG", { maximumFractionDigits: 2 });
}

function dateTime(value: string) {
  return new Intl.DateTimeFormat("ar-EG", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function signedQuantity(type: string, qty: number) {
  return type === "adjustment_out" || type === "damage" ? -Math.abs(qty) : Math.abs(qty);
}

function movementLabel(value: string) {
  return movementTypes.find((type) => type.value === value)?.label || value;
}

function cashLabel(value: string) {
  return cashTypes.find((type) => type.value === value)?.label || value;
}

function paymentMethodLabel(value: string) {
  const labels: Record<string, string> = {
    cash: "نقدي",
    card: "فيزا",
    wallet: "محفظة",
    bank: "تحويل بنكي",
  };
  return labels[value] || value;
}

function csvSafe(value: unknown) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function isMissingRpcError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const source = error as { code?: string; message?: string };
  return source.code === "PGRST202" || String(source.message || "").includes("record_inventory_adjustment");
}

export default function OperationsPage() {
  const staff = useStaffSession();
  const [activeOperationsPanel, setActiveOperationsPanel] = useState<"actions" | "history" | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [cashEntries, setCashEntries] = useState<CashEntry[]>([]);
  const [cashHistory, setCashHistory] = useState<CashEntry[]>([]);
  const [activeSession, setActiveSession] = useState<CashSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [movementForm, setMovementForm] = useState({
    productId: "",
    productQuery: "",
    type: "adjustment_in",
    quantity: "",
    unit: "",
    manualFactor: "",
    note: "",
  });

  const [cashForm, setCashForm] = useState({
    type: "expense",
    amount: "",
    paymentMethod: "cash",
    category: "مصروف تشغيلي",
    note: "",
  });

  const [sessionForm, setSessionForm] = useState({
    openedBy: "",
    openingBalance: "",
    closingBalance: "",
    note: "",
  });

  const [historyFilters, setHistoryFilters] = useState({
    kind: "all" as HistoryKind,
    query: "",
    date: "",
    direction: "all",
  });

  const operatorName = staff?.name || "غير مسجل";
  const isCashier = staff?.role === "cashier";
  const canAdjustInventory = !isCashier;
  const canReverse = staff?.role !== "cashier";

  const selectedProduct = products.find((product) => product.id === movementForm.productId);
  const productBaseUnit = selectedProduct?.unit || "وحدة";
  const selectedProductConversions = productUnitConversions(selectedProduct?.product_attributes);
  const unitOptions = selectedProduct
    ? invoiceUnitsForBaseUnit(
        selectedProduct.product_category,
        productBaseUnit,
        selectedProduct.product_attributes,
        movementForm.unit || productBaseUnit,
      )
    : [];
  const currentStock = Number(selectedProduct?.stock_quantity || 0);
  const selectedUnit = movementForm.unit || productBaseUnit;
  const knownUnitConversion = selectedProduct
    ? hasKnownConversion(selectedProduct.product_category, selectedUnit, productBaseUnit, undefined, selectedProductConversions)
    : true;
  const automaticFactor = selectedProduct
    ? conversionFactorForUnit(selectedProduct.product_category, selectedUnit, productBaseUnit, undefined, selectedProductConversions)
    : 1;
  const unitFactor = knownUnitConversion ? automaticFactor : Number(movementForm.manualFactor || 0);
  const enteredQuantity = Number(movementForm.quantity || 0);
  const baseQuantity = enteredQuantity * (unitFactor || 0);
  const quantityDelta = movementForm.type === "opening_balance"
    ? baseQuantity - currentStock
    : signedQuantity(movementForm.type, baseQuantity);
  const expectedStock = selectedProduct ? currentStock + quantityDelta : 0;
  const sensitiveMovement = movementForm.type === "adjustment_out" || movementForm.type === "damage" || movementForm.type === "opening_balance";

  const productMatches = useMemo(() => {
    const query = movementForm.productQuery.trim().toLowerCase();
    if (!query) return products.slice(0, 30);
    return products
      .filter((product) => {
        const name = product.name.toLowerCase();
        const barcode = (product.barcode || "").toLowerCase();
        return name.includes(query) || barcode.includes(query);
      })
      .slice(0, 30);
  }, [movementForm.productQuery, products]);

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
  const closingVariance = sessionForm.closingBalance ? Number(sessionForm.closingBalance || 0) - expectedCash : 0;

  const filteredMovements = useMemo(() => {
    const query = historyFilters.query.trim().toLowerCase();
    return movements.filter((movement) => {
      if (historyFilters.kind === "cash") return false;
      if (historyFilters.date && !movement.created_at.startsWith(historyFilters.date)) return false;
      if (historyFilters.direction === "in" && Number(movement.quantity || 0) < 0) return false;
      if (historyFilters.direction === "out" && Number(movement.quantity || 0) >= 0) return false;
      if (!query) return true;
      return [
        movement.products?.name,
        movement.note,
        movement.source_type,
        movement.movement_type,
        movement.created_by,
      ].some((value) => String(value || "").toLowerCase().includes(query));
    });
  }, [historyFilters, movements]);

  const filteredCashHistory = useMemo(() => {
    const query = historyFilters.query.trim().toLowerCase();
    return cashHistory.filter((entry) => {
      if (historyFilters.kind === "inventory") return false;
      if (historyFilters.date && !entry.created_at.startsWith(historyFilters.date)) return false;
      if (historyFilters.direction === "in" && entry.direction !== "in") return false;
      if (historyFilters.direction === "out" && entry.direction !== "out") return false;
      if (!query) return true;
      return [
        entry.note,
        entry.entry_type,
        entry.payment_method,
        entry.source_type,
        entry.created_by,
      ].some((value) => String(value || "").toLowerCase().includes(query));
    });
  }, [cashHistory, historyFilters]);

  const alerts = useMemo(() => {
    const nextAlerts = [];
    if (!activeSession) nextAlerts.push("لا توجد وردية مفتوحة، حركات الخزنة اليدوية متوقفة.");
    if (products.some((product) => Number(product.stock_quantity || 0) < 0)) nextAlerts.push("يوجد صنف أو أكثر برصيد سالب.");
    if (movements.some((movement) => !movement.note && ["adjustment_out", "damage"].includes(movement.movement_type))) {
      nextAlerts.push("يوجد تسويات نقص/هالك بدون سبب واضح.");
    }
    return nextAlerts;
  }, [activeSession, movements, products]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [productsResult, movementsResult, sessionsResult, cashHistoryResult] = await Promise.all([
        supabase
          .from("products")
          .select("id,name,barcode,unit,stock_quantity,purchase_price,sale_price,product_category,product_attributes")
          .order("name"),
        supabase
          .from("inventory_movements")
          .select("id,product_id,movement_type,quantity,quantity_before,quantity_after,source_type,note,created_by,created_at,products(name,unit)")
          .order("created_at", { ascending: false })
          .limit(80),
        supabase
          .from("cash_sessions")
          .select("id,opened_by,opening_balance,expected_balance,status,opened_at")
          .eq("status", "open")
          .order("opened_at", { ascending: false })
          .limit(1),
        supabase
          .from("cash_entries")
          .select("id,entry_type,direction,payment_method,amount,source_type,note,created_by,created_at")
          .order("created_at", { ascending: false })
          .limit(80),
      ]);

      if (productsResult.error) throw productsResult.error;
      if (movementsResult.error) throw movementsResult.error;
      if (sessionsResult.error) throw sessionsResult.error;
      if (cashHistoryResult.error) throw cashHistoryResult.error;

      const activeCashSession = (sessionsResult.data?.[0] as CashSession | undefined) || null;
      const activeCashResult = activeCashSession
        ? await supabase
            .from("cash_entries")
            .select("id,entry_type,direction,payment_method,amount,source_type,note,created_by,created_at")
            .eq("session_id", activeCashSession.id)
            .order("created_at", { ascending: false })
        : { data: [], error: null };
      if (activeCashResult.error) throw activeCashResult.error;

      setProducts((productsResult.data || []) as Product[]);
      setMovements(
        ((movementsResult.data || []) as RawMovement[]).map((movement) => ({
          ...movement,
          products: Array.isArray(movement.products) ? movement.products[0] || null : movement.products,
        })),
      );
      setActiveSession(activeCashSession);
      setCashEntries((activeCashResult.data || []) as CashEntry[]);
      setCashHistory((cashHistoryResult.data || []) as CashEntry[]);
      setSessionForm((current) => ({
        ...current,
        openedBy: current.openedBy || operatorName,
        closingBalance: activeCashSession ? String(Number(activeCashSession.opening_balance || 0) + (activeCashResult.data || []).reduce((total, entry) => {
          const amount = Number(entry.amount || 0);
          return total + (entry.direction === "in" ? amount : -amount);
        }, 0)) : "",
      }));
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "تعذر تحميل مركز العمليات. تواصل مع مسؤول النظام لتجهيز قاعدة البيانات.",
      );
    } finally {
      setLoading(false);
    }
  }, [operatorName]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadData();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadData]);

  useEffect(() => {
    setSessionForm((current) => ({
      ...current,
      openedBy: current.openedBy && current.openedBy !== "غير مسجل" ? current.openedBy : operatorName,
    }));
  }, [operatorName]);

  useEffect(() => {
    if (!selectedProduct) return;
    setMovementForm((current) => ({
      ...current,
      unit: current.unit || productBaseUnit,
    }));
  }, [productBaseUnit, selectedProduct]);

  async function openSession() {
    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const existingSession = activeSession || (await getActiveCashSession());
      if (existingSession) throw new Error("توجد وردية مفتوحة بالفعل.");

      const openingBalance = Number(sessionForm.openingBalance || 0);
      if (Number.isNaN(openingBalance) || openingBalance < 0) throw new Error("الرصيد الافتتاحي لازم يكون رقم صحيح.");

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
      setSessionForm((current) => ({ ...current, openingBalance: "" }));
      await loadData();
    } catch (sessionError) {
      setError(sessionError instanceof Error ? sessionError.message : "فشل فتح الوردية.");
    } finally {
      setSaving(false);
    }
  }

  async function closeSession() {
    if (!activeSession) return;
    if (!sessionForm.closingBalance.trim()) return setError("اكتب الرصيد الفعلي الموجود في الخزنة قبل قفل الوردية.");

    const closingBalance = Number(sessionForm.closingBalance);
    if (Number.isNaN(closingBalance) || closingBalance < 0) return setError("الرصيد الفعلي لازم يكون رقم صحيح.");

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
          note: sessionForm.note || `فرق العهدة: ${closingBalance - expectedCash}`,
        })
        .eq("id", activeSession.id);
      if (closeError) throw closeError;

      await recordStaffActivity({
        staff,
        action: "cash_session_close",
        entityType: "cash_session",
        entityId: activeSession.id,
        note: `متوقع ${expectedCash} - فعلي ${closingBalance} - فرق ${closingBalance - expectedCash}`,
      });

      setMessage("تم قفل وردية الخزنة.");
      setSessionForm((current) => ({ ...current, closingBalance: "", note: "" }));
      await loadData();
    } catch (closeError) {
      setError(closeError instanceof Error ? closeError.message : "فشل قفل الوردية.");
    } finally {
      setSaving(false);
    }
  }

  async function saveMovement() {
    if (!canAdjustInventory) return setError("صلاحية تسوية المخزون غير متاحة للكاشير.");
    if (!selectedProduct) return setError("اختار الصنف الأول.");

    const quantity = Number(movementForm.quantity);
    if (!quantity || quantity <= 0) return setError("اكتب كمية صحيحة.");
    if (!unitFactor || unitFactor <= 0) return setError(manualConversionHint(selectedUnit, productBaseUnit) || "اكتب معامل تحويل صحيح.");
    if (sensitiveMovement && !movementForm.note.trim()) return setError("اكتب سبب واضح للحركة قبل الحفظ.");

    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const nextStock = currentStock + quantityDelta;
      if (nextStock < 0) throw new Error("الكمية بعد التسوية لا يمكن تكون أقل من صفر.");

      const noteParts = [
        movementForm.note.trim(),
        selectedUnit !== productBaseUnit ? `${money(quantity)} ${selectedUnit} = ${money(baseQuantity)} ${productBaseUnit}` : "",
      ].filter(Boolean);
      const finalNote = noteParts.join(" ") || null;

      const rpcResult = await supabase.rpc("record_inventory_adjustment", {
        p_product_id: selectedProduct.id,
        p_movement_type: movementForm.type,
        p_quantity: quantityDelta,
        p_note: finalNote,
        p_created_by: operatorName,
      });

      if (rpcResult.error && !isMissingRpcError(rpcResult.error)) throw rpcResult.error;

      if (rpcResult.error && isMissingRpcError(rpcResult.error)) {
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
            note: finalNote,
            created_by: operatorName,
          },
        ]);
        if (movementError) throw movementError;
      }

      await recordStaffActivity({
        staff,
        action: "inventory_adjustment",
        entityType: "product",
        entityId: selectedProduct.id,
        note: `${selectedProduct.name} (${quantityDelta >= 0 ? "+" : ""}${quantityDelta})`,
      });

      setMovementForm({ productId: "", productQuery: "", type: "adjustment_in", quantity: "", unit: "", manualFactor: "", note: "" });
      setMessage("تم تسجيل حركة المخزون وتحديث كمية الصنف.");
      await loadData();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "فشل حفظ حركة المخزون.");
    } finally {
      setSaving(false);
    }
  }

  async function reverseMovement(movement: Movement) {
    if (!canReverse) return setError("عكس الحركة يحتاج صلاحية مسؤول أو مدير.");
    if (!movement.product_id) return setError("لا يمكن عكس حركة بدون صنف.");

    const product = products.find((item) => item.id === movement.product_id);
    if (!product) return setError("الصنف غير موجود في قائمة المنتجات الحالية.");

    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const current = Number(product.stock_quantity || 0);
      const reverseQuantity = -Number(movement.quantity || 0);
      const nextStock = current + reverseQuantity;
      if (nextStock < 0) throw new Error("عكس الحركة سيجعل رصيد الصنف أقل من صفر.");

      const { error: productError } = await supabase.from("products").update({ stock_quantity: nextStock }).eq("id", product.id);
      if (productError) throw productError;

      const { error: movementError } = await supabase.from("inventory_movements").insert([
        {
          product_id: product.id,
          movement_type: "reversal",
          quantity: reverseQuantity,
          quantity_before: current,
          quantity_after: nextStock,
          source_type: "manual_reversal",
          note: `عكس حركة: ${movement.note || movementLabel(movement.movement_type)}`,
          created_by: operatorName,
        },
      ]);
      if (movementError) throw movementError;

      await recordStaffActivity({
        staff,
        action: "inventory_movement_reversal",
        entityType: "inventory_movement",
        entityId: movement.id,
        note: product.name,
      });

      setMessage("تم تسجيل حركة عكسية للمخزون.");
      await loadData();
    } catch (reverseError) {
      setError(reverseError instanceof Error ? reverseError.message : "فشل عكس حركة المخزون.");
    } finally {
      setSaving(false);
    }
  }

  async function saveCashEntry() {
    const amount = Number(cashForm.amount);
    if (!amount || amount <= 0) return setError("اكتب مبلغ صحيح.");
    if ((cashForm.type === "expense" || cashForm.type === "owner_draw") && !cashForm.note.trim()) {
      return setError("اكتب سبب المصروف أو السحب قبل الحفظ.");
    }

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
            category: cashForm.category,
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

      setCashForm({ type: "expense", amount: "", paymentMethod: "cash", category: "مصروف تشغيلي", note: "" });
      setMessage("تم تسجيل حركة الخزنة.");
      await loadData();
    } catch (cashError) {
      setError(cashError instanceof Error ? cashError.message : "فشل تسجيل حركة الخزنة.");
    } finally {
      setSaving(false);
    }
  }

  async function reverseCashEntry(entry: CashEntry) {
    if (!canReverse) return setError("عكس الحركة يحتاج صلاحية مسؤول أو مدير.");

    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const shiftCheck = await requireOpenShiftForCash(Number(entry.amount || 0));
      if (!shiftCheck.ok) throw new Error(shiftCheck.message);

      const reverseDirection = entry.direction === "in" ? "out" : "in";
      const { error: cashError } = await supabase.from("cash_entries").insert([
        {
          session_id: shiftCheck.sessionId || activeSession?.id || null,
          entry_type: "reversal",
          direction: reverseDirection,
          payment_method: entry.payment_method,
          amount: entry.amount,
          source_type: "manual_reversal",
          note: `عكس حركة: ${entry.note || cashLabel(entry.entry_type)}`,
          created_by: operatorName,
        },
      ]);
      if (cashError) throw cashError;

      await recordStaffActivity({
        staff,
        action: "cash_entry_reversal",
        entityType: "cash_entry",
        entityId: entry.id,
        note: `${entry.amount}`,
      });

      setMessage("تم تسجيل حركة عكسية للخزنة.");
      await loadData();
    } catch (reverseError) {
      setError(reverseError instanceof Error ? reverseError.message : "فشل عكس حركة الخزنة.");
    } finally {
      setSaving(false);
    }
  }

  function exportHistory() {
    const rows = [
      ["النوع", "التاريخ", "الوصف", "الاتجاه", "القيمة", "الموظف", "ملاحظة"],
      ...filteredMovements.map((movement) => [
        "مخزون",
        dateTime(movement.created_at),
        movement.products?.name || "صنف غير معروف",
        Number(movement.quantity || 0) >= 0 ? "داخل" : "خارج",
        movement.quantity,
        movement.created_by || "",
        movement.note || movement.source_type || movement.movement_type,
      ]),
      ...filteredCashHistory.map((entry) => [
        "خزنة",
        dateTime(entry.created_at),
        cashLabel(entry.entry_type),
        entry.direction === "in" ? "داخل" : "خارج",
        entry.amount,
        entry.created_by || "",
        entry.note || entry.source_type || "",
      ]),
    ];
    const csv = rows.map((row) => row.map(csvSafe).join(",")).join("\n");
    const blob = new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `operations-history-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
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
                سجل حركات المخزون والخزنة مع وردية واضحة وسجل قابل للمراجعة، بحيث كل رقم يبقى له سبب ووقت ومسؤول.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={loadData}
                disabled={loading}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 text-xs font-black text-white hover:bg-emerald-600 disabled:opacity-60"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                تحديث
              </button>
              <Link
                href="/reports/cash-sessions"
                className="inline-flex h-11 items-center justify-center rounded-2xl bg-slate-100 px-4 text-xs font-black text-slate-700 hover:bg-slate-200"
              >
                تقرير الورديات
              </Link>
            </div>
          </div>
        </section>

        {(message || error) && (
          <div className={`rounded-2xl border p-4 text-sm font-black ${error ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
            {error || message}
          </div>
        )}

        <section className={`grid gap-4 ${isCashier ? "lg:grid-cols-3" : "lg:grid-cols-4"}`}>
          <div className={`rounded-3xl border p-5 shadow-sm ${activeSession ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
            <p className="text-xs font-black text-slate-500">حالة الوردية</p>
            <p className={`mt-3 text-2xl font-black ${activeSession ? "text-emerald-700" : "text-amber-700"}`}>
              {activeSession ? "مفتوحة" : "مغلقة"}
            </p>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-black text-slate-400">المتوقع في الوردية</p>
            <p className="mt-3 text-2xl font-black text-slate-950">{activeSession ? `${money(expectedCash)} ج` : "لا توجد وردية"}</p>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-black text-slate-400">داخل / خارج</p>
            <p className="mt-3 text-lg font-black text-emerald-600">{money(cashSummary.in)} ج</p>
            <p className="mt-1 text-sm font-black text-orange-600">{money(cashSummary.out)} ج خارج</p>
          </div>
          {!isCashier && (
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-black text-slate-400">حركات مخزون قابلة للمراجعة</p>
              <p className="mt-3 text-2xl font-black text-indigo-600">{movements.length.toLocaleString("ar-EG")}</p>
            </div>
          )}
        </section>

        {alerts.length > 0 && (
          <section className="grid gap-3 md:grid-cols-3">
            {alerts.map((alert) => (
              <div key={alert} className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs font-black leading-6 text-amber-800">
                {alert}
              </div>
            ))}
          </section>
        )}

        <section className="grid gap-4 lg:grid-cols-2">
          <button
            type="button"
            onClick={() => setActiveOperationsPanel("actions")}
            className="rounded-3xl border border-slate-200 bg-white p-5 text-right shadow-sm transition hover:-translate-y-1 hover:border-emerald-200 hover:shadow-xl"
          >
            <span className="block text-lg font-black text-slate-950">تنفيذ العمليات</span>
            <span className="mt-2 block text-xs font-bold leading-6 text-slate-500">
              وردية الخزنة، حركة دخل أو مصروف، وتسوية مخزون ذكية بالوحدات.
            </span>
            <span className="mt-4 inline-flex rounded-2xl bg-slate-950 px-4 py-2 text-xs font-black text-white">فتح التفاصيل</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveOperationsPanel("history")}
            className="rounded-3xl border border-slate-200 bg-white p-5 text-right shadow-sm transition hover:-translate-y-1 hover:border-emerald-200 hover:shadow-xl"
          >
            <span className="block text-lg font-black text-slate-950">سجل المراجعة</span>
            <span className="mt-2 block text-xs font-bold leading-6 text-slate-500">
              فلترة وتصدير وعكس للحركات الخطأ بدون حذف الأثر المحاسبي.
            </span>
            <span className="mt-4 inline-flex rounded-2xl bg-slate-950 px-4 py-2 text-xs font-black text-white">فتح السجل</span>
          </button>
        </section>

        {activeOperationsPanel === "actions" && (
          <UiModal title="تنفيذ العمليات" description="نفذ حركة الخزنة أو المخزون من نفس الشاشة." onClose={() => setActiveOperationsPanel(null)}>
            <section className={`grid gap-6 ${isCashier ? "xl:grid-cols-1" : "xl:grid-cols-[1fr_1fr]"}`}>
              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                <div className="mb-5 flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                    <WalletCards className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-xl font-black text-slate-950">الخزنة والوردية</h2>
                    <p className="text-xs font-bold text-slate-500">افتح الوردية، سجل حركات نقدية، واقفل اليوم برصيد فعلي.</p>
                  </div>
                </div>

                {activeSession ? (
                  <div className="space-y-4">
                    <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs font-black text-emerald-700">وردية مفتوحة</p>
                          <p className="mt-1 text-2xl font-black text-slate-950">{money(expectedCash)} ج</p>
                          <p className="mt-1 text-[11px] font-bold text-emerald-800/80">الرصيد المتوقع الآن</p>
                        </div>
                        <BadgeCheck className="h-9 w-9 text-emerald-600" />
                      </div>
                      <div className="mt-4 grid grid-cols-3 gap-2 text-xs font-black">
                        <div className="rounded-2xl bg-white/80 p-3">افتتاحي: {money(activeSession.opening_balance)} ج</div>
                        <div className="rounded-2xl bg-white/80 p-3 text-emerald-700">داخل: {money(cashSummary.in)} ج</div>
                        <div className="rounded-2xl bg-white/80 p-3 text-orange-700">خارج: {money(cashSummary.out)} ج</div>
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="block">
                        <span className="mb-1 block text-xs font-black text-slate-500">الرصيد الفعلي عند القفل</span>
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={sessionForm.closingBalance}
                          onChange={(event) => setSessionForm({ ...sessionForm, closingBalance: event.target.value })}
                          className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold outline-none focus:border-emerald-400"
                        />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-xs font-black text-slate-500">فرق العهدة</span>
                        <div className={`flex h-12 items-center rounded-2xl border px-4 text-sm font-black ${closingVariance === 0 ? "border-slate-200 bg-slate-50 text-slate-700" : "border-amber-200 bg-amber-50 text-amber-700"}`}>
                          {money(closingVariance)} ج
                        </div>
                      </label>
                      <label className="block sm:col-span-2">
                        <span className="mb-1 block text-xs font-black text-slate-500">ملاحظة القفل</span>
                        <input
                          value={sessionForm.note}
                          onChange={(event) => setSessionForm({ ...sessionForm, note: event.target.value })}
                          placeholder="سبب الفرق إن وجد"
                          className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold outline-none focus:border-emerald-400"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={closeSession}
                        disabled={saving}
                        className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-slate-950 text-sm font-black text-white hover:bg-emerald-600 disabled:opacity-60 sm:col-span-2"
                      >
                        <ShieldCheck className="h-5 w-5" />
                        قفل الوردية
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-3xl border border-amber-200 bg-amber-50 p-4">
                    <p className="text-sm font-black text-amber-800">لا توجد وردية مفتوحة. افتحها من هنا قبل تسجيل حركات الخزنة.</p>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <label className="block">
                        <span className="mb-1 block text-xs font-black text-slate-600">اسم المسؤول</span>
                        <input
                          value={sessionForm.openedBy}
                          onChange={(event) => setSessionForm({ ...sessionForm, openedBy: event.target.value })}
                          className="h-12 w-full rounded-2xl border border-amber-200 bg-white px-4 text-sm font-bold outline-none focus:border-emerald-400"
                        />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-xs font-black text-slate-600">الرصيد الافتتاحي</span>
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={sessionForm.openingBalance}
                          onChange={(event) => setSessionForm({ ...sessionForm, openingBalance: event.target.value })}
                          placeholder="0"
                          className="h-12 w-full rounded-2xl border border-amber-200 bg-white px-4 text-sm font-bold outline-none focus:border-emerald-400"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={openSession}
                        disabled={saving}
                        className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-emerald-600 text-sm font-black text-white hover:bg-emerald-500 disabled:opacity-60 sm:col-span-2"
                      >
                        <WalletCards className="h-5 w-5" />
                        فتح وردية
                      </button>
                    </div>
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
                        <option key={type.value} value={type.value}>{type.label}</option>
                      ))}
                    </select>
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
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-black text-slate-500">تصنيف المصروف</span>
                    <select
                      value={cashForm.category}
                      onChange={(event) => setCashForm({ ...cashForm, category: event.target.value })}
                      disabled={cashForm.type !== "expense"}
                      className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold outline-none focus:border-emerald-400 disabled:opacity-60"
                    >
                      {cashCategories.map((category) => (
                        <option key={category} value={category}>{category}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block sm:col-span-2">
                    <span className="mb-1 block text-xs font-black text-slate-500">ملاحظة</span>
                    <input
                      value={cashForm.note}
                      onChange={(event) => setCashForm({ ...cashForm, note: event.target.value })}
                      placeholder="مثال: إيجار، كهرباء، سحب مالك، دخل خدمة"
                      className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold outline-none focus:border-emerald-400"
                    />
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

              {!isCashier && (
                <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                  <div className="mb-5 flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
                      <Boxes className="h-5 w-5" />
                    </div>
                    <div>
                      <h2 className="text-xl font-black text-slate-950">تسوية المخزون الذكية</h2>
                      <p className="text-xs font-bold text-slate-500">اختار الصنف بالاسم أو الباركود، ثم سجل الكمية بأي وحدة مرتبطة بالصنف.</p>
                    </div>
                  </div>

                  <div className="grid gap-3">
                    <label className="block">
                      <span className="mb-1 block text-xs font-black text-slate-500">بحث الصنف</span>
                      <div className="relative">
                        <Search className="pointer-events-none absolute right-4 top-3.5 h-5 w-5 text-slate-400" />
                        <input
                          value={movementForm.productQuery}
                          onChange={(event) => setMovementForm({ ...movementForm, productQuery: event.target.value, productId: "" })}
                          placeholder="اكتب اسم الصنف أو الباركود"
                          className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 pr-11 pl-4 text-sm font-bold outline-none focus:border-indigo-400"
                        />
                      </div>
                    </label>

                    <div className="max-h-44 overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50 p-2">
                      {productMatches.length === 0 ? (
                        <div className="p-4 text-center text-xs font-black text-slate-400">لا توجد أصناف مطابقة.</div>
                      ) : productMatches.map((product) => {
                        const selected = product.id === movementForm.productId;
                        return (
                          <button
                            key={product.id}
                            type="button"
                            onClick={() => setMovementForm({
                              ...movementForm,
                              productId: product.id,
                              productQuery: product.name,
                              unit: product.unit || "وحدة",
                              manualFactor: "",
                            })}
                            className={`mb-2 flex w-full items-center justify-between gap-3 rounded-2xl border p-3 text-right transition last:mb-0 ${selected ? "border-indigo-300 bg-indigo-50" : "border-white bg-white hover:border-indigo-200"}`}
                          >
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-black text-slate-950">{product.name}</span>
                              <span className="block text-[11px] font-bold text-slate-400">
                                {product.barcode || "بدون باركود"} - {productCategoryLabel(normalizeProductCategory(product.product_category))}
                              </span>
                            </span>
                            <span className="shrink-0 rounded-xl bg-slate-100 px-3 py-1 text-xs font-black text-slate-700">
                              {money(product.stock_quantity)} {product.unit || "وحدة"}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="block">
                        <span className="mb-1 block text-xs font-black text-slate-500">نوع الحركة</span>
                        <select
                          value={movementForm.type}
                          onChange={(event) => setMovementForm({ ...movementForm, type: event.target.value })}
                          className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold outline-none focus:border-indigo-400"
                        >
                          {movementTypes.map((type) => (
                            <option key={type.value} value={type.value}>{type.label}</option>
                          ))}
                        </select>
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
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-xs font-black text-slate-500">الوحدة</span>
                        <select
                          value={selectedUnit}
                          onChange={(event) => setMovementForm({ ...movementForm, unit: event.target.value, manualFactor: "" })}
                          disabled={!selectedProduct}
                          className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold outline-none focus:border-indigo-400 disabled:opacity-60"
                        >
                          {(unitOptions.length ? unitOptions : [productBaseUnit]).map((unit) => (
                            <option key={unit} value={unit}>{unit}</option>
                          ))}
                        </select>
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-xs font-black text-slate-500">معامل التحويل</span>
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={knownUnitConversion ? automaticFactor : movementForm.manualFactor}
                          onChange={(event) => setMovementForm({ ...movementForm, manualFactor: event.target.value })}
                          disabled={!selectedProduct || knownUnitConversion}
                          className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold outline-none focus:border-indigo-400 disabled:opacity-70"
                        />
                      </label>
                    </div>

                    {selectedProduct && (
                      <div className="grid gap-3 sm:grid-cols-3">
                        <div className="rounded-2xl bg-slate-50 p-4">
                          <p className="text-xs font-black text-slate-400">قبل</p>
                          <p className="mt-1 text-xl font-black text-slate-900">{money(currentStock)} {productBaseUnit}</p>
                        </div>
                        <div className="rounded-2xl bg-slate-50 p-4">
                          <p className="text-xs font-black text-slate-400">الحركة</p>
                          <p className={`mt-1 text-xl font-black ${quantityDelta >= 0 ? "text-emerald-600" : "text-rose-600"}`} dir="ltr">
                            {quantityDelta >= 0 ? "+" : ""}{money(quantityDelta)}
                          </p>
                        </div>
                        <div className="rounded-2xl bg-slate-50 p-4">
                          <p className="text-xs font-black text-slate-400">بعد</p>
                          <p className="mt-1 text-xl font-black text-slate-900">{money(expectedStock)} {productBaseUnit}</p>
                        </div>
                      </div>
                    )}

                    {!knownUnitConversion && selectedProduct && (
                      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs font-black text-amber-800">
                        {manualConversionHint(selectedUnit, productBaseUnit)} قبل الحفظ.
                      </div>
                    )}

                    <label className="block">
                      <span className="mb-1 block text-xs font-black text-slate-500">سبب الحركة</span>
                      <input
                        value={movementForm.note}
                        onChange={(event) => setMovementForm({ ...movementForm, note: event.target.value })}
                        placeholder="مثال: جرد، تلف، فرق وزن"
                        className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold outline-none focus:border-indigo-400"
                      />
                    </label>

                    <button
                      type="button"
                      onClick={saveMovement}
                      disabled={saving}
                      className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-5 text-sm font-black text-white hover:bg-indigo-500 disabled:opacity-60"
                    >
                      <Save className="h-5 w-5" />
                      حفظ حركة المخزون
                    </button>
                  </div>
                </div>
              )}
            </section>
          </UiModal>
        )}

        {activeOperationsPanel === "history" && (
          <UiModal title="سجل المراجعة" description="راجع الحركات، فلترها، صدرها، أو سجل حركة عكسية عند الخطأ." onClose={() => setActiveOperationsPanel(null)}>
            <section className="space-y-4">
              <div className="grid gap-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm lg:grid-cols-[1fr_0.7fr_0.7fr_0.7fr_auto]">
                <label className="block">
                  <span className="mb-1 block text-xs font-black text-slate-500">بحث</span>
                  <input
                    value={historyFilters.query}
                    onChange={(event) => setHistoryFilters({ ...historyFilters, query: event.target.value })}
                    placeholder="صنف، ملاحظة، موظف"
                    className="h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold outline-none focus:border-emerald-400"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-black text-slate-500">نوع السجل</span>
                  <select
                    value={historyFilters.kind}
                    onChange={(event) => setHistoryFilters({ ...historyFilters, kind: event.target.value as HistoryKind })}
                    className="h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold outline-none focus:border-emerald-400"
                  >
                    <option value="all">الكل</option>
                    <option value="inventory">مخزون</option>
                    <option value="cash">خزنة</option>
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-black text-slate-500">الاتجاه</span>
                  <select
                    value={historyFilters.direction}
                    onChange={(event) => setHistoryFilters({ ...historyFilters, direction: event.target.value })}
                    className="h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold outline-none focus:border-emerald-400"
                  >
                    <option value="all">الكل</option>
                    <option value="in">داخل</option>
                    <option value="out">خارج</option>
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-black text-slate-500">اليوم</span>
                  <input
                    type="date"
                    value={historyFilters.date}
                    onChange={(event) => setHistoryFilters({ ...historyFilters, date: event.target.value })}
                    className="h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold outline-none focus:border-emerald-400"
                  />
                </label>
                <button
                  type="button"
                  onClick={exportHistory}
                  className="mt-5 inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 text-xs font-black text-white hover:bg-emerald-600"
                >
                  <Download className="h-4 w-4" />
                  تصدير
                </button>
              </div>

              {!isCashier && historyFilters.kind !== "cash" && (
                <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                  <h2 className="mb-3 text-lg font-black text-slate-950">حركات المخزون</h2>
                  <div className="max-h-[420px] overflow-auto rounded-2xl border border-slate-100">
                    <table className="w-full min-w-[760px] text-right text-sm">
                      <thead className="sticky top-0 bg-slate-50 text-xs font-black text-slate-500">
                        <tr>
                          <th className="px-4 py-3">التاريخ</th>
                          <th className="px-4 py-3">الصنف</th>
                          <th className="px-4 py-3">النوع</th>
                          <th className="px-4 py-3">الكمية</th>
                          <th className="px-4 py-3">قبل/بعد</th>
                          <th className="px-4 py-3">الموظف</th>
                          <th className="px-4 py-3">إجراء</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredMovements.length === 0 ? (
                          <tr><td colSpan={7} className="px-4 py-10 text-center font-black text-slate-400">لا توجد حركات مطابقة.</td></tr>
                        ) : filteredMovements.map((movement) => {
                          const isIn = Number(movement.quantity || 0) >= 0;
                          return (
                            <tr key={movement.id} className="align-top">
                              <td className="whitespace-nowrap px-4 py-3 text-xs font-bold text-slate-500">{dateTime(movement.created_at)}</td>
                              <td className="px-4 py-3">
                                <p className="font-black text-slate-950">{movement.products?.name || "صنف غير معروف"}</p>
                                <p className="mt-1 text-xs font-bold text-slate-400">{movement.note || movement.source_type || "بدون ملاحظة"}</p>
                              </td>
                              <td className="px-4 py-3 text-xs font-black text-slate-600">{movementLabel(movement.movement_type)}</td>
                              <td className={`px-4 py-3 font-black ${isIn ? "text-emerald-600" : "text-rose-600"}`} dir="ltr">
                                {isIn ? "+" : ""}{money(movement.quantity)}
                              </td>
                              <td className="whitespace-nowrap px-4 py-3 text-xs font-bold text-slate-500">
                                {money(movement.quantity_before)} / {money(movement.quantity_after)}
                              </td>
                              <td className="px-4 py-3 text-xs font-bold text-slate-500">{movement.created_by || "غير مسجل"}</td>
                              <td className="px-4 py-3">
                                <button
                                  type="button"
                                  onClick={() => reverseMovement(movement)}
                                  disabled={saving || !canReverse || movement.source_type === "manual_reversal"}
                                  className="inline-flex h-9 items-center justify-center gap-1 rounded-xl bg-slate-100 px-3 text-xs font-black text-slate-700 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50"
                                >
                                  <Undo2 className="h-4 w-4" />
                                  عكس
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {historyFilters.kind !== "inventory" && (
                <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                  <h2 className="mb-3 text-lg font-black text-slate-950">حركات الخزنة</h2>
                  <div className="max-h-[420px] overflow-auto rounded-2xl border border-slate-100">
                    <table className="w-full min-w-[720px] text-right text-sm">
                      <thead className="sticky top-0 bg-slate-50 text-xs font-black text-slate-500">
                        <tr>
                          <th className="px-4 py-3">التاريخ</th>
                          <th className="px-4 py-3">الحركة</th>
                          <th className="px-4 py-3">طريقة الدفع</th>
                          <th className="px-4 py-3">المبلغ</th>
                          <th className="px-4 py-3">الموظف</th>
                          <th className="px-4 py-3">إجراء</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredCashHistory.length === 0 ? (
                          <tr><td colSpan={6} className="px-4 py-10 text-center font-black text-slate-400">لا توجد حركات مطابقة.</td></tr>
                        ) : filteredCashHistory.map((entry) => {
                          const isIn = entry.direction === "in";
                          return (
                            <tr key={entry.id} className="align-top">
                              <td className="whitespace-nowrap px-4 py-3 text-xs font-bold text-slate-500">{dateTime(entry.created_at)}</td>
                              <td className="px-4 py-3">
                                <p className="font-black text-slate-950">{entry.note || cashLabel(entry.entry_type)}</p>
                                <p className="mt-1 text-xs font-bold text-slate-400">{cashLabel(entry.entry_type)}</p>
                              </td>
                              <td className="px-4 py-3 text-xs font-bold text-slate-500">{paymentMethodLabel(entry.payment_method)}</td>
                              <td className={`px-4 py-3 font-black ${isIn ? "text-emerald-600" : "text-orange-600"}`} dir="ltr">
                                {isIn ? "+" : "-"}{money(entry.amount)} ج
                              </td>
                              <td className="px-4 py-3 text-xs font-bold text-slate-500">{entry.created_by || "غير مسجل"}</td>
                              <td className="px-4 py-3">
                                <button
                                  type="button"
                                  onClick={() => reverseCashEntry(entry)}
                                  disabled={saving || !canReverse || entry.source_type === "manual_reversal" || !activeSession}
                                  className="inline-flex h-9 items-center justify-center gap-1 rounded-xl bg-slate-100 px-3 text-xs font-black text-slate-700 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50"
                                >
                                  <Undo2 className="h-4 w-4" />
                                  عكس
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </section>
          </UiModal>
        )}

        <section className="rounded-3xl border border-slate-200 bg-slate-950 p-5 text-white shadow-sm sm:p-6">
          <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-start">
            <div>
              <h2 className="text-xl font-black">إرشادات استخدام مركز العمليات</h2>
              <div className="mt-4 grid gap-4 md:grid-cols-3">
                <div className="rounded-2xl bg-white/10 p-4">
                  <h3 className="font-black text-emerald-300">الوردية</h3>
                  <p className="mt-2 text-sm font-bold leading-7 text-slate-300">افتح الوردية قبل أي حركة خزنة، واقفلها برصيد فعلي بعد مراجعة الداخل والخارج.</p>
                </div>
                {!isCashier && (
                  <div className="rounded-2xl bg-white/10 p-4">
                    <h3 className="font-black text-indigo-300">المخزون</h3>
                    <p className="mt-2 text-sm font-bold leading-7 text-slate-300">استخدم البحث والوحدة المناسبة، واكتب سبب إجباري لأي نقص أو هالك.</p>
                  </div>
                )}
                <div className="rounded-2xl bg-white/10 p-4">
                  <h3 className="font-black text-amber-300">المراجعة</h3>
                  <p className="mt-2 text-sm font-bold leading-7 text-slate-300">لو حصل خطأ استخدم عكس الحركة بدل الحذف، عشان يفضل السجل المحاسبي واضح.</p>
                </div>
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
