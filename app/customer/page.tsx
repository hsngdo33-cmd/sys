"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { ProductCategory, normalizeProductCategory, productCategoryLabel } from "@/lib/product-category";
import { CategorySelect, useEnabledCategories } from "@/app/category-select";
import { calculateInvoiceTax, paperSizeCss, useBusinessSettings } from "@/app/business-settings";
import { requireOpenShiftForCash } from "@/app/cash-session";
import { recordStaffActivity } from "@/app/staff-activity";
import { useStaffSession } from "@/app/staff-session";
import {
  conversionFactorForUnit,
  hasKnownConversion,
  invoiceUnitsForBaseUnit,
  manualConversionHint,
  productUnitConversions,
} from "@/lib/category-settings";

interface Customer {
  id: string;
  name: string;
  phone: string | null;
  balance: number;
  created_at: string;
}

interface Product {
  id: string;
  name: string;
  unit: string;
  sale_price: number;
  purchase_price: number;
  stock_quantity: number;
  barcode?: string | null;
  product_category?: ProductCategory | string | null;
  product_attributes?: Record<string, unknown> | null;
}

interface CartItem extends Product {
  qty: number | string;
  price: number | string;
  cost: number;
  invoiceUnit: string;
  unitFactor: number;
  manualUnitFactor?: boolean;
}

type CustomerTransactionSummary = {
  customer_id: string | null;
  created_at: string;
};

type ActivitySummary = {
  count: number;
  lastDate: string | null;
};

type SortKey = "name" | "balance" | "created_at" | "activity";
type FilterKey = "all" | "debtors" | "clear" | "inactive";

const cleanBarcode = (value: unknown) => value?.toString().trim() || "";

function normalizeText(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function normalizePhone(value?: string | null) {
  return (value || "").replace(/[^\d+]/g, "");
}

function matchesDirectorySearch(name: string, phone: string | null | undefined, search: string) {
  const query = normalizeText(search);
  const phoneQuery = normalizePhone(search);
  if (!query && !phoneQuery) return true;
  return normalizeText(name).includes(query) || normalizePhone(phone).includes(phoneQuery);
}

function csvCell(value: unknown) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function downloadCsv(fileName: string, rows: unknown[][]) {
  const csv = rows.map((row) => row.map(csvCell).join(",")).join("\n");
  const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

export default function CustomersListPage() {
  const staff = useStaffSession();
  const operatorName = staff?.name || "الكاشير";
  const { settings: businessSettings } = useBusinessSettings();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [transactions, setTransactions] = useState<CustomerTransactionSummary[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("name");
  const [filter, setFilter] = useState<FilterKey>("all");

  const [activeCategory, setActiveCategory] = useState<ProductCategory>("general");
  const enabledCategories = useEnabledCategories();
  const defaultActiveCategory = enabledCategories[0] || "general";
  const [invoiceProductSearch, setInvoiceProductSearch] = useState("");
  const [invoiceCustomerId, setInvoiceCustomerId] = useState("");
  const [manualCustomerName, setManualCustomerName] = useState("");
  const [manualCustomerPhone, setManualCustomerPhone] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cashPaid, setCashPaid] = useState<number | string>(0);
  const [discountPercent, setDiscountPercent] = useState<number | string>(0);
  const [note, setNote] = useState("");
  const [invoiceSaving, setInvoiceSaving] = useState(false);
  const [printDateLabel, setPrintDateLabel] = useState("");
  const barcodeInputRef = useRef<HTMLInputElement>(null);

  const [showAddModal, setShowAddModal] = useState(false);
  const [showPayModal, setShowPayModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [newCustomer, setNewCustomer] = useState({ name: "", phone: "", balance: 0 });
  const [payAmount, setPayAmount] = useState(0);
  const [payNote, setPayNote] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    const [customersResult, transactionsResult, productsResult] = await Promise.all([
      supabase.from("customers").select("*").order("name"),
      supabase
        .from("customer_transactions")
        .select("customer_id,created_at")
        .order("created_at", { ascending: false })
        .limit(2000),
      supabase
        .from("products")
        .select("id,name,unit,sale_price,purchase_price,stock_quantity,barcode,product_category,product_attributes")
        .order("name"),
    ]);

    setCustomers((customersResult.data || []) as Customer[]);
    setTransactions((transactionsResult.data || []) as CustomerTransactionSummary[]);
    setProducts((productsResult.data || []) as Product[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  useEffect(() => {
    barcodeInputRef.current?.focus();
    setPrintDateLabel(new Date().toLocaleDateString("ar-EG"));
  }, []);

  useEffect(() => {
    if (enabledCategories.length > 0 && !enabledCategories.includes(activeCategory)) {
      setActiveCategory(defaultActiveCategory);
      setCart([]);
      setInvoiceProductSearch("");
    }
  }, [activeCategory, defaultActiveCategory, enabledCategories]);

  const selectedInvoiceCustomer = customers.find((customer) => customer.id === invoiceCustomerId) || null;

  const filteredProducts = useMemo(
    () =>
      products.filter((product) => {
        const categoryMatch = normalizeProductCategory(product.product_category) === activeCategory;
        const query = invoiceProductSearch.trim().toLowerCase();
        const searchMatch =
          !query ||
          product.name.toLowerCase().includes(query) ||
          cleanBarcode(product.barcode).includes(invoiceProductSearch.trim());
        return categoryMatch && searchMatch;
      }),
    [activeCategory, invoiceProductSearch, products],
  );

  const customerNameSuggestions = useMemo(() => {
    const name = newCustomer.name.trim().toLowerCase();
    if (name.length < 2) return [];
    return customers.filter((customer) => customer.name.toLowerCase().includes(name)).slice(0, 5);
  }, [customers, newCustomer.name]);

  const invoiceCustomerSuggestions = useMemo(() => {
    const name = manualCustomerName.trim().toLowerCase();
    const phone = normalizePhone(manualCustomerPhone);
    if (name.length < 2 && phone.length < 4) return [];
    return customers
      .filter((customer) => {
        const matchesName = name && customer.name.toLowerCase().includes(name);
        const matchesPhone = phone && normalizePhone(customer.phone).includes(phone);
        return matchesName || matchesPhone;
      })
      .slice(0, 5);
  }, [customers, manualCustomerName, manualCustomerPhone]);

  const activityMap = useMemo(() => {
    const map = new Map<string, ActivitySummary>();

    transactions.forEach((transaction) => {
      if (!transaction.customer_id) return;
      const current = map.get(transaction.customer_id) || { count: 0, lastDate: null };
      current.count += 1;
      if (!current.lastDate || new Date(transaction.created_at) > new Date(current.lastDate)) {
        current.lastDate = transaction.created_at;
      }
      map.set(transaction.customer_id, current);
    });

    return map;
  }, [transactions]);

  const displayed = useMemo(() => {
    let list = [...customers];
    if (searchTerm) list = list.filter((customer) => matchesDirectorySearch(customer.name, customer.phone, searchTerm));
    if (filter === "debtors") list = list.filter((customer) => customer.balance > 0);
    if (filter === "clear") list = list.filter((customer) => customer.balance <= 0);
    if (filter === "inactive") list = list.filter((customer) => !activityMap.get(customer.id)?.count);
    list.sort((a, b) => {
      if (sortBy === "balance") return b.balance - a.balance;
      if (sortBy === "created_at") return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      if (sortBy === "activity") {
        const bActivity = activityMap.get(b.id)?.lastDate || "";
        const aActivity = activityMap.get(a.id)?.lastDate || "";
        return new Date(bActivity || 0).getTime() - new Date(aActivity || 0).getTime();
      }
      return a.name.localeCompare(b.name, "ar");
    });
    return list;
  }, [activityMap, customers, filter, searchTerm, sortBy]);

  const totalDebt = customers.reduce((sum, customer) => sum + Math.max(customer.balance, 0), 0);
  const debtorCount = customers.filter((customer) => customer.balance > 0).length;
  const clearCount = customers.filter((customer) => customer.balance <= 0).length;
  const inactiveCount = customers.filter((customer) => !activityMap.get(customer.id)?.count).length;
  const filterTabs: { key: FilterKey; label: string; count: number }[] = [
    { key: "all", label: "الكل", count: customers.length },
    { key: "debtors", label: "مديونية", count: debtorCount },
    { key: "clear", label: "سليم", count: clearCount },
    { key: "inactive", label: "بدون حركة", count: inactiveCount },
  ];

  const subtotal = cart.reduce((sum, item) => sum + Number(item.qty || 0) * Number(item.price || 0), 0);
  const totalCost = cart.reduce((sum, item) => sum + Number(item.qty || 0) * Number(item.cost || 0), 0);
  const discountRate = Math.min(Math.max(Number(discountPercent) || 0, 0), 100);
  const discountAmount = subtotal * (discountRate / 100);
  const netBeforeTax = Math.max(subtotal - discountAmount, 0);
  const taxInfo = calculateInvoiceTax(netBeforeTax, businessSettings.tax_mode);
  const taxAmount = taxInfo.taxAmount;
  const total = taxInfo.totalWithTax;
  const profit = taxInfo.taxableSales - totalCost;
  const cash = Number(cashPaid) || 0;
  const remaining = total - cash;
  const margin = taxInfo.taxableSales > 0 ? Math.round((profit / taxInfo.taxableSales) * 100) : 0;
  const printPageSize = paperSizeCss(businessSettings.invoice_paper_size);

  const formatLastActivity = (customerId: string) => {
    const activity = activityMap.get(customerId);
    if (!activity?.lastDate) return "لا توجد حركات";
    return new Date(activity.lastDate).toLocaleDateString("ar-EG");
  };

  const getCustomerStatus = (customer: Customer) => {
    if (!activityMap.get(customer.id)?.count) {
      return { label: "بدون حركة", className: "bg-amber-100 text-amber-700 border-amber-200" };
    }
    if (customer.balance > 0) {
      return { label: "عليه مديونية", className: "bg-rose-100 text-rose-700 border-rose-200" };
    }
    return { label: "حساب سليم", className: "bg-emerald-100 text-emerald-700 border-emerald-200" };
  };

  function exportCustomers() {
    downloadCsv("customers.csv", [
      ["العميل", "الموبايل", "الرصيد", "عدد الحركات", "آخر حركة"],
      ...displayed.map((customer) => [
        customer.name,
        customer.phone || "",
        Number(customer.balance || 0),
        activityMap.get(customer.id)?.count || 0,
        formatLastActivity(customer.id),
      ]),
    ]);
  }

  function addToCart(product: Product) {
    if (product.stock_quantity <= 0) return alert("الصنف ده خلص من المخزون.");
    if (cart.find((item) => item.id === product.id)) return;
    setCart((prev) => [
      ...prev,
      {
        ...product,
        qty: 1,
        price: product.sale_price,
        cost: product.purchase_price,
        invoiceUnit: product.unit,
        unitFactor: 1,
        manualUnitFactor: false,
      },
    ]);
  }

  function handleBarcodeEntry(value: string) {
    const barcode = cleanBarcode(value);
    if (!barcode) return;

    const found = products.find(
      (product) =>
        normalizeProductCategory(product.product_category) === activeCategory && cleanBarcode(product.barcode) === barcode,
    );

    if (!found) return alert("الباركود غير مسجل في أصناف القسم الحالي.");
    addToCart(found);
    setInvoiceProductSearch("");
    window.setTimeout(() => barcodeInputRef.current?.focus(), 50);
  }

  const removeFromCart = (productId: string) => setCart((prev) => prev.filter((item) => item.id !== productId));

  const updateCart = (id: string, field: "qty" | "price", value: string) =>
    setCart((prev) => prev.map((item) => (item.id === id ? { ...item, [field]: value } : item)));

  const updateCartUnit = (id: string, unit: string) =>
    setCart((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const productConversions = productUnitConversions(item.product_attributes);
        const factor = conversionFactorForUnit(item.product_category, unit, item.unit, undefined, productConversions);
        const manualUnitFactor = !hasKnownConversion(item.product_category, unit, item.unit, undefined, productConversions);
        return {
          ...item,
          invoiceUnit: unit,
          unitFactor: factor,
          manualUnitFactor,
          price: Number(item.sale_price || 0) * factor,
          cost: Number(item.purchase_price || 0) * factor,
        };
      }),
    );

  const updateCartUnitFactor = (id: string, factorValue: string) =>
    setCart((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const factor = Math.max(Number(factorValue) || 1, 0.001);
        return {
          ...item,
          unitFactor: factor,
          manualUnitFactor: true,
          price: Number(item.sale_price || 0) * factor,
          cost: Number(item.purchase_price || 0) * factor,
        };
      }),
    );

  const invoiceUnitOptions = (item: CartItem) =>
    invoiceUnitsForBaseUnit(item.product_category, item.unit, item.product_attributes, item.invoiceUnit);

  function selectInvoiceCustomer(customer: Customer) {
    setInvoiceCustomerId(customer.id);
    setManualCustomerName(customer.name);
    setManualCustomerPhone(customer.phone || "");
  }

  async function resolveInvoiceCustomer() {
    if (selectedInvoiceCustomer) return selectedInvoiceCustomer;

    const cleanName = manualCustomerName.trim().replace(/\s+/g, " ");
    const cleanPhone = normalizePhone(manualCustomerPhone);
    if (!cleanName) throw new Error("اختار عميل أو اكتب اسم العميل قبل حفظ الفاتورة.");

    const duplicate = customers.find((customer) => {
      const sameName = normalizeText(customer.name) === normalizeText(cleanName);
      const samePhone = cleanPhone && normalizePhone(customer.phone) === cleanPhone;
      return sameName || samePhone;
    });
    if (duplicate) return duplicate;

    const { data, error } = await supabase
      .from("customers")
      .insert([{ name: cleanName, phone: cleanPhone || null, balance: 0 }])
      .select("*")
      .single();
    if (error) throw error;
    return data as Customer;
  }

  async function saveQuickInvoice(printAfterSave = false) {
    if (cart.length === 0) return alert("الفاتورة فاضية.");
    if (cash > total) return alert("المبلغ المدفوع أكبر من إجمالي الفاتورة.");

    setInvoiceSaving(true);
    try {
      const customer = await resolveInvoiceCustomer();
      const shiftCheck = await requireOpenShiftForCash(cash);
      if (!shiftCheck.ok) {
        alert(shiftCheck.message);
        return;
      }

      const itemsToSave = cart.map((item) => ({
        id: item.id,
        name: item.name,
        unit: item.unit,
        invoice_unit: item.invoiceUnit,
        unit_factor: Number(item.unitFactor || 1),
        qty: Number(item.qty || 0),
        stock_qty: Number(item.qty || 0) * Number(item.unitFactor || 1),
        price: Number(item.price || 0),
        cost: Number(item.cost || 0),
        product_category: normalizeProductCategory(item.product_category),
      }));

      const { data: invoice, error: invoiceError } = await supabase
        .from("customer_transactions")
        .insert([
          {
            customer_id: customer.id,
            amount: total,
            type: "sale",
            items: itemsToSave,
            profit,
            description:
              note ||
              `بيع ${productCategoryLabel(activeCategory)} لـ ${customer.name}${
                discountRate > 0 ? ` - خصم ${discountRate}%` : ""
              }${taxAmount > 0 ? ` - ${taxInfo.label}` : ""}`,
          },
        ])
        .select("id")
        .single();
      if (invoiceError) throw invoiceError;

      if (cash > 0) {
        await supabase.from("customer_transactions").insert([
          {
            customer_id: customer.id,
            amount: cash,
            type: "payment",
            description: `سداد من فاتورة #${invoice?.id}`,
          },
        ]);

        await supabase.from("cash_entries").insert([
          {
            session_id: shiftCheck.sessionId,
            entry_type: "sale_payment",
            direction: "in",
            payment_method: "cash",
            amount: cash,
            source_type: "customer_invoice",
            source_id: invoice?.id,
            note: `تحصيل من فاتورة بيع - ${customer.name}`,
            created_by: operatorName,
          },
        ]);
      }

      await supabase
        .from("customers")
        .update({ balance: Number(customer.balance || 0) + remaining })
        .eq("id", customer.id);

      for (const item of cart) {
        await supabase.rpc("decrement_stock", {
          row_id: item.id,
          amount: Number(item.qty || 0) * Number(item.unitFactor || 1),
        });
      }

      await supabase.from("inventory_movements").insert(
        cart.map((item) => {
          const before = Number(item.stock_quantity || 0);
          const quantity = -Math.abs(Number(item.qty || 0) * Number(item.unitFactor || 1));
          return {
            product_id: item.id,
            movement_type: "sale",
            quantity,
            quantity_before: before,
            quantity_after: before + quantity,
            unit_cost: Number(item.cost || 0),
            source_type: "customer_invoice",
            source_id: invoice?.id,
            note: `فاتورة بيع - ${customer.name}`,
            created_by: operatorName,
          };
        }),
      );

      await recordStaffActivity({
        staff,
        action: "customer_invoice_saved",
        entityType: "customer_invoice",
        entityId: invoice?.id,
        note: `فاتورة بيع - ${customer.name} - ${total.toLocaleString("ar-EG")} ج`,
      });

      if (printAfterSave) window.print();

      setInvoiceCustomerId("");
      setManualCustomerName("");
      setManualCustomerPhone("");
      setCart([]);
      setCashPaid(0);
      setDiscountPercent(0);
      setNote("");
      setInvoiceProductSearch("");
      await fetchCustomers();
      window.setTimeout(() => barcodeInputRef.current?.focus(), 100);
    } catch (error) {
      alert(error instanceof Error ? error.message : "خطأ في حفظ الفاتورة.");
    } finally {
      setInvoiceSaving(false);
    }
  }

  async function handleAddCustomer() {
    if (!newCustomer.name.trim()) return alert("الاسم مطلوب.");
    const cleanName = newCustomer.name.trim().replace(/\s+/g, " ");
    const cleanPhone = normalizePhone(newCustomer.phone);
    const duplicate = customers.find((customer) => {
      const sameName = normalizeText(customer.name) === normalizeText(cleanName);
      const samePhone = cleanPhone && normalizePhone(customer.phone) === cleanPhone;
      return sameName || samePhone;
    });

    if (duplicate) return alert(`العميل "${duplicate.name}" مسجل قبل كده.`);

    setSaving(true);
    try {
      const { error } = await supabase.from("customers").insert([
        {
          name: cleanName,
          phone: cleanPhone || null,
          balance: Number(newCustomer.balance || 0),
        },
      ]);
      if (error) throw error;
      setNewCustomer({ name: "", phone: "", balance: 0 });
      setShowAddModal(false);
      fetchCustomers();
    } catch (addError) {
      alert(addError instanceof Error ? addError.message : "تعذر حفظ العميل.");
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdateCustomer() {
    if (!selectedCustomer || !selectedCustomer.name.trim()) return alert("الاسم مطلوب.");
    const cleanName = selectedCustomer.name.trim().replace(/\s+/g, " ");
    const cleanPhone = normalizePhone(selectedCustomer.phone);
    const duplicate = customers.find((customer) => {
      if (customer.id === selectedCustomer.id) return false;
      const sameName = normalizeText(customer.name) === normalizeText(cleanName);
      const samePhone = cleanPhone && normalizePhone(customer.phone) === cleanPhone;
      return sameName || samePhone;
    });

    if (duplicate) return alert(`في عميل تاني بنفس البيانات: ${duplicate.name}`);

    setSaving(true);
    try {
      await supabase
        .from("customers")
        .update({ name: cleanName, phone: cleanPhone || null })
        .eq("id", selectedCustomer.id);
      setShowEditModal(false);
      fetchCustomers();
    } catch {
      alert("حدث خطأ أثناء التعديل.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteCustomer() {
    if (!selectedCustomer) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("customers").delete().eq("id", selectedCustomer.id);
      if (error) throw error;
      setShowDeleteModal(false);
      fetchCustomers();
    } catch {
      alert("لا يمكن حذف العميل لأنه مرتبط بعمليات مسجلة.");
    } finally {
      setSaving(false);
    }
  }

  async function handleCollection() {
    if (payAmount <= 0 || !selectedCustomer) return alert("ادخل مبلغ صحيح.");
    if (payAmount > Number(selectedCustomer.balance || 0)) {
      return alert("مبلغ التحصيل أكبر من مديونية العميل الحالية.");
    }
    setSaving(true);
    try {
      const shiftCheck = await requireOpenShiftForCash(payAmount);
      if (!shiftCheck.ok) {
        alert(shiftCheck.message);
        return;
      }

      const { data: transaction, error: transactionError } = await supabase
        .from("customer_transactions")
        .insert([
          {
            customer_id: selectedCustomer.id,
            amount: payAmount,
            type: "تحصيل نقدي",
            description: payNote || "تحصيل نقدي من العميل",
          },
        ])
        .select("id")
        .single();
      if (transactionError) throw transactionError;

      const { error: cashError } = await supabase.from("cash_entries").insert([
        {
          session_id: shiftCheck.sessionId,
          entry_type: "customer_collection",
          direction: "in",
          payment_method: "cash",
          amount: payAmount,
          source_type: "customer_collection",
          source_id: transaction?.id?.toString(),
          note: payNote || `تحصيل نقدي من العميل - ${selectedCustomer.name}`,
        },
      ]);
      if (cashError) throw cashError;

      await supabase
        .from("customers")
        .update({ balance: (selectedCustomer.balance || 0) - payAmount })
        .eq("id", selectedCustomer.id);
      setShowPayModal(false);
      setPayAmount(0);
      setPayNote("");
      fetchCustomers();
    } catch {
      alert("حدث خطأ أثناء التحصيل.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#f1f5f9] pb-6 text-right font-sans text-slate-900" dir="rtl">
      <header className="sticky top-0 z-40 mb-4 bg-[#0f172a] px-6 py-4 text-white shadow-xl">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link href="/" className="rounded-xl bg-white/10 px-4 py-2 text-xs font-black transition hover:bg-white/20">
              رجوع
            </Link>
            <div>
              <h1 className="text-xl font-black">العملاء وفاتورة البيع</h1>
              <p className="mt-0.5 text-[10px] font-bold text-slate-400">
                فاتورة سريعة بجانب دليل العملاء المسجلين
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[10px] font-black">
            <span className="rounded-lg bg-white/10 px-3 py-1.5">{customers.length.toLocaleString("ar-EG")} عميل</span>
            <span className="rounded-lg bg-rose-500/20 px-3 py-1.5 text-rose-100">
              ديون {totalDebt.toLocaleString("ar-EG")} ج
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-[1500px] gap-5 px-4">
        <section className="min-w-0 overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white shadow-sm ring-1 ring-white">
          <div className="border-b border-slate-100 bg-white p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-indigo-500">فاتورة بيع سريعة</p>
                <h2 className="mt-1 text-lg font-black text-slate-900">
                  {selectedInvoiceCustomer?.name || manualCustomerName || "اختار العميل وابدأ البيع"}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => {
                  setInvoiceCustomerId("");
                  setManualCustomerName("");
                  setManualCustomerPhone("");
                  setCart([]);
                  setCashPaid(0);
                  setDiscountPercent(0);
                  setNote("");
                  setInvoiceProductSearch("");
                }}
                className="app-btn app-btn-soft app-btn-sm"
              >
                تفريغ
              </button>
            </div>

            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
              <p className="mb-3 text-[10px] font-black uppercase tracking-widest text-slate-400">بيانات العميل</p>
              <div className="grid gap-3 lg:grid-cols-[1fr_1fr_1fr_160px]">
              <label className="block">
                <span className="mb-1 block text-[10px] font-black text-slate-400">عميل مسجل</span>
                <select
                  value={invoiceCustomerId}
                  onChange={(event) => {
                    const customer = customers.find((item) => item.id === event.target.value);
                    if (customer) selectInvoiceCustomer(customer);
                    else setInvoiceCustomerId("");
                  }}
                  className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-bold outline-none focus:border-indigo-400"
                >
                  <option value="">بيع لعميل جديد / يدوي</option>
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-[10px] font-black text-slate-400">اسم العميل</span>
                <input
                  value={manualCustomerName}
                  onChange={(event) => {
                    setManualCustomerName(event.target.value);
                    setInvoiceCustomerId("");
                  }}
                  placeholder="اكتب اسم العميل أو اختاره من الاقتراحات"
                  className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-bold outline-none focus:border-indigo-400"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[10px] font-black text-slate-400">موبايل العميل</span>
                <input
                  value={manualCustomerPhone}
                  onChange={(event) => {
                    setManualCustomerPhone(event.target.value);
                    setInvoiceCustomerId("");
                  }}
                  placeholder="اختياري"
                  className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-bold outline-none focus:border-indigo-400"
                />
              </label>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-[10px] font-black text-slate-400">الرصيد الحالي</p>
                <p className={`mt-1 text-lg font-black ${(selectedInvoiceCustomer?.balance || 0) > 0 ? "text-rose-600" : "text-emerald-600"}`}>
                  {(selectedInvoiceCustomer?.balance || 0).toLocaleString("ar-EG")} ج
                </p>
              </div>
              </div>
            </div>

            {!invoiceCustomerId && invoiceCustomerSuggestions.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2 rounded-xl border border-amber-200 bg-amber-50 p-2">
                {invoiceCustomerSuggestions.map((customer) => (
                  <button
                    key={customer.id}
                    type="button"
                    onClick={() => selectInvoiceCustomer(customer)}
                    className="rounded-lg bg-white px-3 py-2 text-xs font-black text-slate-700 shadow-sm hover:bg-amber-100"
                  >
                    {customer.name}
                    <span className="mr-2 font-bold text-slate-400">{customer.phone || "بدون موبايل"}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="grid gap-4 bg-slate-50/60 p-4 xl:grid-cols-[280px_minmax(0,1fr)]">
            <aside className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
              <p className="mb-3 text-[10px] font-black uppercase tracking-widest text-slate-400">اختيار الأصناف</p>
              <CategorySelect
                value={activeCategory}
                label="قسم البيع"
                variant="cards"
                onChange={(category) => {
                  setActiveCategory(category);
                  setCart([]);
                  setInvoiceProductSearch("");
                }}
              />
              <input
                ref={barcodeInputRef}
                value={invoiceProductSearch}
                onChange={(event) => setInvoiceProductSearch(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === "Tab") {
                    event.preventDefault();
                    handleBarcodeEntry(invoiceProductSearch);
                  }
                }}
                placeholder="باركود USB أو بحث"
                className="mt-3 h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-bold outline-none focus:border-indigo-400"
              />
              <button
                type="button"
                onClick={() => handleBarcodeEntry(invoiceProductSearch)}
                className="mt-2 h-10 w-full rounded-xl bg-slate-900 text-xs font-black text-white"
              >
                إضافة بالباركود
              </button>
              <div className="mt-3 max-h-[360px] space-y-2 overflow-y-auto pr-1">
                {filteredProducts.slice(0, 80).map((product) => {
                  const inCart = !!cart.find((item) => item.id === product.id);
                  return (
                    <button
                      key={product.id}
                      type="button"
                      onClick={() => !inCart && addToCart(product)}
                      disabled={product.stock_quantity <= 0 || inCart}
                      className={`w-full rounded-xl border p-3 text-right transition ${
                        product.stock_quantity <= 0
                          ? "cursor-not-allowed border-slate-100 bg-slate-50 opacity-50"
                          : inCart
                            ? "border-indigo-200 bg-indigo-50"
                            : "border-slate-100 hover:border-indigo-300 hover:bg-slate-50"
                      }`}
                    >
                      <p className="line-clamp-1 text-sm font-black text-slate-900">{product.name}</p>
                      <p className="mt-1 text-[10px] font-bold text-slate-400">
                        {Number(product.sale_price || 0).toLocaleString("ar-EG")} ج - مخزون{" "}
                        {Number(product.stock_quantity || 0).toLocaleString("ar-EG")} {product.unit}
                      </p>
                    </button>
                  );
                })}
                {filteredProducts.length === 0 && (
                  <p className="rounded-xl bg-slate-50 p-4 text-center text-xs font-black text-slate-400">لا توجد أصناف مطابقة</p>
                )}
              </div>
            </aside>

            <section className="min-w-0 space-y-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">تفاصيل الفاتورة</p>
                  <span className="rounded-lg bg-slate-100 px-3 py-1 text-[10px] font-black text-slate-500">
                    {cart.length.toLocaleString("ar-EG")} صنف
                  </span>
                </div>
                <div className="max-h-[380px] overflow-auto rounded-xl border border-slate-200">
                {cart.length === 0 ? (
                  <div className="grid h-60 place-items-center text-center text-slate-300">
                    <div>
                      <p className="text-3xl font-black">فاتورة فارغة</p>
                      <p className="mt-2 text-xs font-bold">اسحب الباركود أو اختار صنف من القائمة</p>
                    </div>
                  </div>
                ) : (
                  <table className="w-full min-w-[720px] text-right">
                    <thead className="sticky top-0 z-10 border-b bg-slate-50 text-[10px] font-black text-slate-400">
                      <tr>
                        <th className="p-3">الصنف</th>
                        <th className="p-3 text-center">الكمية</th>
                        <th className="p-3 text-center">الوحدة</th>
                        <th className="p-3 text-center">السعر</th>
                        <th className="p-3 text-left">الإجمالي</th>
                        <th className="p-3"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {cart.map((item) => {
                        const lineTotal = Number(item.qty || 0) * Number(item.price || 0);
                        return (
                          <tr key={item.id} className="align-top">
                            <td className="p-3">
                              <p className="text-sm font-black text-slate-900">{item.name}</p>
                              <p className="mt-1 text-[10px] font-bold text-slate-400">
                                تكلفة {Number(item.cost || 0).toLocaleString("ar-EG", { maximumFractionDigits: 2 })} ج
                              </p>
                            </td>
                            <td className="p-3 text-center">
                              <input
                                type="number"
                                step="any"
                                value={item.qty}
                                onChange={(event) => updateCart(item.id, "qty", event.target.value)}
                                className="h-10 w-20 rounded-xl border border-slate-200 bg-slate-50 text-center text-sm font-black outline-none focus:border-indigo-400"
                              />
                            </td>
                            <td className="p-3 text-center">
                              <select
                                value={item.invoiceUnit || item.unit}
                                onChange={(event) => updateCartUnit(item.id, event.target.value)}
                                className="h-10 w-28 rounded-xl border border-slate-200 bg-slate-50 text-center text-xs font-black outline-none focus:border-indigo-400"
                              >
                                {invoiceUnitOptions(item).map((unit) => (
                                  <option key={unit} value={unit}>
                                    {unit}
                                  </option>
                                ))}
                              </select>
                              {item.manualUnitFactor && (
                                <label className="mt-2 block">
                                  <span className="mb-1 block text-[9px] font-black text-indigo-600">
                                    {manualConversionHint(item.invoiceUnit, item.unit)}
                                  </span>
                                  <input
                                    type="number"
                                    min={0.001}
                                    step="any"
                                    value={item.unitFactor}
                                    onChange={(event) => updateCartUnitFactor(item.id, event.target.value)}
                                    className="h-9 w-28 rounded-xl border border-indigo-200 bg-indigo-50 text-center text-xs font-black text-indigo-700 outline-none focus:border-indigo-400"
                                  />
                                </label>
                              )}
                              {Number(item.unitFactor || 1) !== 1 && (
                                <p className="mt-1 text-[9px] font-bold text-slate-400">
                                  = {(Number(item.qty || 0) * Number(item.unitFactor || 1)).toLocaleString("ar-EG")} {item.unit}
                                </p>
                              )}
                            </td>
                            <td className="p-3 text-center">
                              <input
                                type="number"
                                step="any"
                                value={item.price}
                                onChange={(event) => updateCart(item.id, "price", event.target.value)}
                                className="h-10 w-24 rounded-xl border border-slate-200 bg-slate-50 text-center text-sm font-black text-indigo-600 outline-none focus:border-indigo-400"
                              />
                            </td>
                            <td className="p-3 text-left text-sm font-black">
                              {lineTotal.toLocaleString("ar-EG", { maximumFractionDigits: 2 })}
                            </td>
                            <td className="p-3">
                              <button
                                type="button"
                                onClick={() => removeFromCart(item.id)}
                                className="h-8 w-8 rounded-lg bg-rose-50 text-sm font-black text-rose-600 hover:bg-rose-100"
                              >
                                ×
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
                <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:grid-cols-2">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 sm:col-span-2">الدفع والخصم</p>
                  <label className="block rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <span className="block text-[10px] font-black text-slate-400">خصم على الفاتورة</span>
                    <div className="mt-1 flex items-center gap-2">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="any"
                        value={discountPercent}
                        onChange={(event) => setDiscountPercent(event.target.value)}
                        className="w-full bg-transparent text-lg font-black outline-none"
                        placeholder="0"
                      />
                      <span className="font-black text-slate-400">%</span>
                    </div>
                  </label>
                  <label className="block rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <span className="block text-[10px] font-black text-slate-400">المدفوع كاش</span>
                    <input
                      type="number"
                      step="any"
                      value={cashPaid}
                      onChange={(event) => setCashPaid(event.target.value)}
                      className="mt-1 w-full bg-transparent text-lg font-black text-emerald-600 outline-none"
                      placeholder="0"
                    />
                  </label>
                  <label className="block sm:col-span-2">
                    <input
                      value={note}
                      onChange={(event) => setNote(event.target.value)}
                      placeholder="ملاحظة على الفاتورة"
                      className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-bold outline-none focus:border-indigo-400"
                    />
                  </label>
                </div>
                <div className="rounded-2xl bg-[#0f172a] p-4 text-white shadow-sm">
                  <p className="mb-3 text-[10px] font-black uppercase tracking-widest text-slate-500">ملخص الفاتورة</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-[9px] font-black text-slate-500">الإجمالي</p>
                      <p className="text-lg font-black">{total.toLocaleString("ar-EG", { maximumFractionDigits: 2 })} ج</p>
                    </div>
                    <div>
                      <p className="text-[9px] font-black text-slate-500">المتبقي</p>
                      <p className={`text-lg font-black ${remaining > 0 ? "text-rose-300" : "text-emerald-300"}`}>
                        {remaining.toLocaleString("ar-EG", { maximumFractionDigits: 2 })} ج
                      </p>
                    </div>
                    <div>
                      <p className="text-[9px] font-black text-slate-500">الربح</p>
                      <p className={`text-sm font-black ${profit >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                        {profit.toLocaleString("ar-EG", { maximumFractionDigits: 2 })} ج ({margin}%)
                      </p>
                    </div>
                    <div>
                      <p className="text-[9px] font-black text-slate-500">{taxInfo.label}</p>
                      <p className="text-sm font-black">{taxAmount.toLocaleString("ar-EG", { maximumFractionDigits: 2 })} ج</p>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-2">
                    <button
                      type="button"
                      onClick={() => saveQuickInvoice(false)}
                      disabled={invoiceSaving || cart.length === 0}
                      className="h-11 rounded-xl bg-emerald-500 text-sm font-black text-white disabled:opacity-50"
                    >
                      {invoiceSaving ? "جاري الحفظ..." : "حفظ واعتماد"}
                    </button>
                    <button
                      type="button"
                      onClick={() => saveQuickInvoice(true)}
                      disabled={invoiceSaving || cart.length === 0}
                      className="h-11 rounded-xl bg-white/10 text-sm font-black text-white disabled:opacity-50"
                    >
                      حفظ وطباعة
                    </button>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </section>

        <section className="min-w-0 overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white shadow-sm ring-1 ring-white">
          <div className="border-b border-slate-100 bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">دليل العملاء</p>
                <h2 className="text-lg font-black">العملاء المسجلين والفلاتر</h2>
              </div>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => setShowAddModal(true)} className="app-btn app-btn-success app-btn-sm">
                  إضافة عميل
                </button>
                <button onClick={exportCustomers} disabled={displayed.length === 0} className="app-btn app-btn-soft app-btn-sm">
                  تصدير CSV
                </button>
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
              <p className="mb-3 text-[10px] font-black uppercase tracking-widest text-slate-400">بحث وفلاتر</p>
              <div className="grid gap-3 xl:grid-cols-[minmax(220px,1fr)_auto]">
              <div className="relative">
                <input
                  placeholder="ابحث بالاسم أو الموبايل..."
                  className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 pl-10 text-sm font-bold outline-none focus:border-indigo-400"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                />
                {searchTerm && (
                  <button
                    type="button"
                    onClick={() => setSearchTerm("")}
                    className="absolute left-2 top-1/2 h-7 w-7 -translate-y-1/2 rounded-lg border border-slate-200 bg-white text-slate-400 hover:text-rose-600"
                    aria-label="مسح البحث"
                  >
                    ×
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-2 rounded-xl bg-slate-50 p-1">
                {filterTabs.map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setFilter(tab.key)}
                    className={`min-h-9 rounded-lg px-3 text-xs font-black transition ${
                      filter === tab.key ? "bg-[#0f172a] text-white shadow-sm" : "text-slate-500 hover:bg-white"
                    }`}
                  >
                    {tab.label} <span className="opacity-70">({tab.count.toLocaleString("ar-EG")})</span>
                  </button>
                ))}
              </div>
              </div>
            </div>

            <div className="mt-3 grid gap-2 sm:grid-cols-4">
              <MiniStat label="إجمالي الديون" value={`${totalDebt.toLocaleString("ar-EG")} ج`} tone="dark" />
              <MiniStat label="مديونون" value={debtorCount.toLocaleString("ar-EG")} />
              <MiniStat label="حساب سليم" value={clearCount.toLocaleString("ar-EG")} />
              <MiniStat label="بدون حركة" value={inactiveCount.toLocaleString("ar-EG")} />
            </div>

            <div className="mt-3 flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-slate-50/70 p-2">
              {(["name", "balance", "created_at", "activity"] as SortKey[]).map((key) => (
                <button
                  key={key}
                  onClick={() => setSortBy(key)}
                  className={`app-btn app-btn-sm ${sortBy === key ? "app-btn-primary" : "app-btn-soft"}`}
                >
                  {key === "name" ? "الاسم" : key === "balance" ? "الدين" : key === "activity" ? "آخر نشاط" : "الأحدث"}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-slate-50/60 p-4">
            <div className="max-h-[620px] overflow-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
            {loading ? (
              <div className="p-10 text-center font-black text-slate-400">جاري التحميل...</div>
            ) : displayed.length === 0 ? (
              <div className="p-10 text-center font-black text-slate-300">لا توجد نتائج</div>
            ) : (
              <table className="w-full min-w-[760px] text-right">
                <thead className="sticky top-0 z-10 border-b bg-slate-50 text-[10px] font-black text-slate-400">
                  <tr>
                    <th className="px-4 py-3">العميل</th>
                    <th className="px-4 py-3">الموبايل</th>
                    <th className="px-4 py-3">المديونية</th>
                    <th className="px-4 py-3 text-center">الإجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {displayed.map((customer) => {
                    const status = getCustomerStatus(customer);
                    return (
                      <tr key={customer.id} className="hover:bg-slate-50/70">
                        <td className="px-4 py-3">
                          <Link
                            href={`/customer/${customer.id}/history`}
                            className="font-black text-slate-900 transition hover:text-indigo-700"
                          >
                            {customer.name}
                          </Link>
                          <p className="mt-1 text-[11px] font-bold text-slate-400">
                            آخر حركة: {formatLastActivity(customer.id)} · {(activityMap.get(customer.id)?.count || 0).toLocaleString("ar-EG")} حركة
                          </p>
                        </td>
                        <td className="px-4 py-3 font-bold text-slate-400">{customer.phone || "—"}</td>
                        <td className="px-4 py-3">
                          <div className="grid gap-1">
                            <span className={`w-fit rounded-full border px-3 py-1 text-[10px] font-black ${status.className}`}>
                              {status.label}
                            </span>
                            <span className={`text-lg font-black ${customer.balance > 0 ? "text-rose-600" : "text-slate-500"}`}>
                              {customer.balance > 0 ? customer.balance.toLocaleString("ar-EG") : "0"}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-center gap-2">
                            <button
                              type="button"
                              onClick={() => selectInvoiceCustomer(customer)}
                              className="app-btn app-btn-sm app-btn-success"
                            >
                              بيع
                            </button>
                            <Link href={`/customer/${customer.id}/history`} className="app-btn app-btn-sm app-btn-primary">
                              السجل
                            </Link>
                            <details className="relative">
                              <summary className="app-btn app-btn-sm app-btn-soft list-none cursor-pointer">إجراءات</summary>
                              <div className="absolute left-0 top-10 z-30 w-44 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
                                <Link
                                  href={`/customer/${customer.id}/return`}
                                  className="block rounded-xl px-3 py-2 text-xs font-black text-amber-700 hover:bg-amber-50"
                                >
                                  مرتجع
                                </Link>
                                <button
                                  onClick={() => {
                                    if (customer.balance > 0) {
                                      setSelectedCustomer(customer);
                                      setPayAmount(0);
                                      setPayNote("");
                                      setShowPayModal(true);
                                    }
                                  }}
                                  disabled={customer.balance <= 0}
                                  className={`block w-full rounded-xl px-3 py-2 text-right text-xs font-black ${
                                    customer.balance > 0
                                      ? "text-emerald-700 hover:bg-emerald-50"
                                      : "cursor-not-allowed text-slate-300"
                                  }`}
                                >
                                  تحصيل
                                </button>
                                <button
                                  onClick={() => {
                                    setSelectedCustomer(customer);
                                    setShowEditModal(true);
                                  }}
                                  className="block w-full rounded-xl px-3 py-2 text-right text-xs font-black text-blue-700 hover:bg-blue-50"
                                >
                                  تعديل البيانات
                                </button>
                                <button
                                  onClick={() => {
                                    setSelectedCustomer(customer);
                                    setShowDeleteModal(true);
                                  }}
                                  className="block w-full rounded-xl px-3 py-2 text-right text-xs font-black text-rose-700 hover:bg-rose-50"
                                >
                                  حذف
                                </button>
                              </div>
                            </details>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            </div>
          </div>
        </section>
      </main>

      <section className="print-invoice hidden" dir="rtl">
        <div className="print-card">
          <div className="print-header">
            <div>
              <p className="print-eyebrow">فاتورة بيع {productCategoryLabel(activeCategory)}</p>
              <h1>منظومة إدارة المحل التجاري</h1>
              <p>إدارة العملاء والمبيعات</p>
            </div>
            <div className="print-meta">
              <p>التاريخ: {printDateLabel || "-"}</p>
              <p>العميل: {selectedInvoiceCustomer?.name || manualCustomerName || "-"}</p>
              <p>الرصيد السابق: {(selectedInvoiceCustomer?.balance || 0).toLocaleString("ar-EG")} ج.م</p>
            </div>
          </div>
          <table className="print-table">
            <thead>
              <tr>
                <th>الصنف</th>
                <th>الوحدة</th>
                <th>الكمية</th>
                <th>السعر</th>
                <th>الإجمالي</th>
              </tr>
            </thead>
            <tbody>
              {cart.map((item) => (
                <tr key={item.id}>
                  <td>{item.name}</td>
                  <td>{item.invoiceUnit || item.unit}</td>
                  <td>
                    {Number(item.qty || 0).toLocaleString("ar-EG")}
                    {Number(item.unitFactor || 1) !== 1
                      ? ` = ${(Number(item.qty || 0) * Number(item.unitFactor || 1)).toLocaleString("ar-EG")} ${item.unit}`
                      : ""}
                  </td>
                  <td>{Number(item.price || 0).toLocaleString("ar-EG")} ج</td>
                  <td>{(Number(item.qty || 0) * Number(item.price || 0)).toLocaleString("ar-EG")} ج</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="print-summary">
            <p>
              <span>الإجمالي قبل الخصم</span>
              <b>{subtotal.toLocaleString("ar-EG", { maximumFractionDigits: 2 })} ج</b>
            </p>
            <p>
              <span>الخصم ({discountRate}%)</span>
              <b>{discountAmount.toLocaleString("ar-EG", { maximumFractionDigits: 2 })} ج</b>
            </p>
            {businessSettings.tax_mode !== "none" && (
              <p>
                <span>{taxInfo.label}</span>
                <b>{taxAmount.toLocaleString("ar-EG", { maximumFractionDigits: 2 })} ج</b>
              </p>
            )}
            <p>
              <span>الصافي</span>
              <b>{total.toLocaleString("ar-EG", { maximumFractionDigits: 2 })} ج</b>
            </p>
            <p>
              <span>المدفوع</span>
              <b>{cash.toLocaleString("ar-EG", { maximumFractionDigits: 2 })} ج</b>
            </p>
            <p className="print-total">
              <span>المتبقي</span>
              <b>{remaining.toLocaleString("ar-EG", { maximumFractionDigits: 2 })} ج</b>
            </p>
          </div>
          {note && <p className="print-note">ملاحظة: {note}</p>}
        </div>
      </section>

      {showAddModal && (
        <Modal onClose={() => setShowAddModal(false)}>
          <div className="mb-6 border-r-4 border-indigo-500 pr-3">
            <h3 className="text-xl font-black text-slate-900">تسجيل عميل جديد</h3>
          </div>
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-black text-slate-400">اسم العميل *</label>
              <input
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-4 font-bold outline-none transition focus:border-indigo-400"
                placeholder="اسم العميل"
                value={newCustomer.name}
                onChange={(event) => setNewCustomer({ ...newCustomer, name: event.target.value })}
              />
              {customerNameSuggestions.length > 0 && (
                <div className="mt-2 rounded-2xl border border-amber-200 bg-amber-50 p-2">
                  <p className="px-2 pb-1 text-[10px] font-black text-amber-700">أسماء مشابهة مسجلة قبل كده</p>
                  <div className="space-y-1">
                    {customerNameSuggestions.map((customer) => (
                      <button
                        key={customer.id}
                        type="button"
                        onClick={() =>
                          setNewCustomer({ name: customer.name, phone: customer.phone || "", balance: customer.balance || 0 })
                        }
                        className="w-full rounded-xl bg-white px-3 py-2 text-right text-xs font-black text-slate-700 hover:bg-amber-100"
                      >
                        {customer.name}
                        <span className="mr-2 font-bold text-slate-400">{customer.phone || "بدون موبايل"}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div>
              <label className="mb-1 block text-xs font-black text-slate-400">رقم الموبايل</label>
              <input
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-4 font-bold outline-none transition focus:border-indigo-400"
                placeholder="01xxxxxxxxx"
                value={newCustomer.phone}
                onChange={(event) => setNewCustomer({ ...newCustomer, phone: event.target.value })}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-black text-slate-400">رصيد افتتاحي / مديونية قديمة</label>
              <input
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-4 font-bold text-rose-600 outline-none transition focus:border-indigo-400"
                type="number"
                placeholder="0"
                value={newCustomer.balance || ""}
                onChange={(event) => setNewCustomer({ ...newCustomer, balance: Number(event.target.value) })}
              />
            </div>
            <div className="flex gap-3 pt-2">
              <button
                onClick={handleAddCustomer}
                disabled={saving || !newCustomer.name.trim()}
                className="flex-1 rounded-2xl bg-[#0f172a] py-4 font-black text-white transition hover:bg-indigo-700 disabled:opacity-50"
              >
                {saving ? "جاري الحفظ..." : "حفظ العميل"}
              </button>
              <button onClick={() => setShowAddModal(false)} className="rounded-2xl bg-slate-100 px-6 font-black text-slate-600">
                إلغاء
              </button>
            </div>
          </div>
        </Modal>
      )}

      {showPayModal && selectedCustomer && (
        <Modal onClose={() => setShowPayModal(false)}>
          <div className="mb-6 border-r-4 border-emerald-500 pr-3">
            <h3 className="text-xl font-black text-slate-900">تحصيل من: {selectedCustomer.name}</h3>
            <p className="mt-1 text-xs font-bold text-slate-400">
              المديونية الحالية: <span className="font-black text-rose-600">{selectedCustomer.balance.toLocaleString("ar-EG")} ج.م</span>
            </p>
          </div>
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-black text-slate-400">المبلغ المحصل</label>
              <input
                type="number"
                className="w-full rounded-2xl border border-slate-100 bg-slate-50 p-4 text-3xl font-black text-emerald-600 outline-none transition focus:border-emerald-400"
                placeholder="0"
                value={payAmount || ""}
                onChange={(event) => setPayAmount(Number(event.target.value))}
              />
              {payAmount > 0 && (
                <p className="mt-2 text-xs font-bold text-slate-400">
                  المتبقي بعد التحصيل:{" "}
                  <span className={`font-black ${selectedCustomer.balance - payAmount > 0 ? "text-rose-500" : "text-emerald-600"}`}>
                    {(selectedCustomer.balance - payAmount).toLocaleString("ar-EG")} ج.م
                  </span>
                </p>
              )}
            </div>
            <div>
              <label className="mb-1 block text-xs font-black text-slate-400">ملاحظة اختيارية</label>
              <input
                className="w-full rounded-2xl border border-slate-100 bg-slate-50 p-4 font-bold text-slate-900 outline-none"
                placeholder="ملاحظة"
                value={payNote}
                onChange={(event) => setPayNote(event.target.value)}
              />
            </div>
            <button
              onClick={handleCollection}
              disabled={saving || payAmount <= 0}
              className="w-full rounded-2xl bg-emerald-500 py-4 font-black text-white transition hover:bg-emerald-400 disabled:opacity-50"
            >
              {saving ? "جاري التحصيل..." : "تأكيد التحصيل"}
            </button>
          </div>
        </Modal>
      )}

      {showEditModal && selectedCustomer && (
        <Modal onClose={() => setShowEditModal(false)}>
          <div className="mb-6 border-r-4 border-blue-500 pr-3">
            <h3 className="text-xl font-black text-slate-900">تعديل بيانات العميل</h3>
            <p className="mt-1 text-xs font-bold text-slate-400">تعديل الاسم أو رقم التواصل فقط بدون تغيير الرصيد المحاسبي.</p>
          </div>
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-black text-slate-400">اسم العميل *</label>
              <input
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-4 font-bold outline-none transition focus:border-blue-400"
                value={selectedCustomer.name}
                onChange={(event) => setSelectedCustomer({ ...selectedCustomer, name: event.target.value })}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-black text-slate-400">رقم الموبايل</label>
              <input
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-4 font-bold outline-none transition focus:border-blue-400"
                value={selectedCustomer.phone || ""}
                onChange={(event) => setSelectedCustomer({ ...selectedCustomer, phone: event.target.value })}
              />
            </div>
            <button
              onClick={handleUpdateCustomer}
              disabled={saving || !selectedCustomer.name.trim()}
              className="w-full rounded-2xl bg-blue-600 py-4 font-black text-white transition hover:bg-blue-500 disabled:opacity-50"
            >
              {saving ? "جاري الحفظ..." : "حفظ التعديلات"}
            </button>
          </div>
        </Modal>
      )}

      {showDeleteModal && selectedCustomer && (
        <Modal onClose={() => setShowDeleteModal(false)}>
          <div className="space-y-4 text-center">
            <div className="text-4xl">!</div>
            <h3 className="text-xl font-black">تأكيد الحذف</h3>
            <p className="font-bold text-slate-500">
              هل أنت متأكد من حذف <span className="text-rose-600">«{selectedCustomer.name}»</span>؟
            </p>
            <div className="flex gap-3">
              <button onClick={handleDeleteCustomer} disabled={saving} className="flex-1 rounded-2xl bg-rose-600 py-4 font-black text-white">
                حذف نهائي
              </button>
              <button onClick={() => setShowDeleteModal(false)} className="flex-1 rounded-2xl bg-slate-100 py-4 font-black">
                تراجع
              </button>
            </div>
          </div>
        </Modal>
      )}

      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;900&display=swap');
        body { font-family: 'Cairo', sans-serif; background-color: #f1f5f9; }
        @media print {
          @page { size: ${printPageSize}; margin: 6mm; }
          html, body { width: auto !important; height: auto !important; margin: 0 !important; padding: 0 !important; overflow: visible !important; background: #fff !important; }
          body * { visibility: hidden !important; }
          .print-invoice, .print-invoice * { visibility: visible !important; }
          .print-invoice { display: block !important; position: static !important; width: 100%; min-height: 0; padding: 0; background: white; color: #0f172a; font-size: 10px; line-height: 1.35; }
          .print-card { width: 100%; max-width: 100%; margin: 0 auto; border: 1px solid #dbe3ef; padding: 12px; border-radius: 10px; }
          .print-header { display: flex; justify-content: space-between; gap: 14px; border-bottom: 2px solid #0f172a; padding-bottom: 8px; margin-bottom: 10px; }
          .print-eyebrow { font-size: 9px; font-weight: 900; color: #059669; margin: 0 0 3px; }
          .print-header h1 { margin: 0; font-size: 18px; font-weight: 900; }
          .print-header p { margin: 2px 0; font-weight: 700; font-size: 10px; }
          .print-meta { text-align: left; font-size: 10px; }
          .print-table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
          .print-table th { background: #0f172a; color: white; padding: 5px 6px; font-size: 9px; }
          .print-table td { border-bottom: 1px solid #e2e8f0; padding: 5px 6px; font-weight: 700; font-size: 9px; }
          .print-summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(78px, 1fr)); gap: 6px; width: 100%; }
          .print-summary p { display: grid; gap: 3px; margin: 0; padding: 7px 8px; border: 1px solid #e2e8f0; border-radius: 8px; font-weight: 800; break-inside: avoid; }
          .print-summary span { font-size: 8px; color: #64748b; }
          .print-summary b { font-size: 10px; }
          .print-total { background: #ecfdf5; color: #047857; font-size: 11px; }
          .print-note { margin-top: 8px; padding: 8px; background: #f8fafc; border-radius: 8px; font-weight: 700; font-size: 9px; }
        }
        @media print and (max-width: 90mm) {
          @page { margin: 3mm; }
          .print-card { border: 0; padding: 4px; border-radius: 0; }
          .print-header { display: block; text-align: center; padding-bottom: 5px; margin-bottom: 6px; }
          .print-header h1 { font-size: 13px; }
          .print-header p, .print-meta { text-align: center; font-size: 8px; }
          .print-table th, .print-table td { padding: 3px 2px; font-size: 7px; }
          .print-summary { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 3px; }
          .print-summary p { padding: 4px; border-radius: 5px; }
          .print-summary span { font-size: 7px; }
          .print-summary b { font-size: 8px; }
          .print-note { margin-top: 5px; padding: 5px; font-size: 7px; }
        }
      `}</style>
    </div>
  );
}

function MiniStat({ label, value, tone = "light" }: { label: string; value: string; tone?: "light" | "dark" }) {
  return (
    <div className={`rounded-xl border p-3 ${tone === "dark" ? "border-slate-800 bg-[#0f172a] text-white" : "border-slate-200 bg-slate-50"}`}>
      <p className={`text-[9px] font-black uppercase tracking-widest ${tone === "dark" ? "text-slate-400" : "text-slate-400"}`}>
        {label}
      </p>
      <p className="mt-1 text-lg font-black">{value}</p>
    </div>
  );
}

function Modal({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="relative w-full max-w-md rounded-[1.25rem] bg-white p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}
