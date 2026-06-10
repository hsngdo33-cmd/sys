"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export type TaxMode = "none" | "included" | "excluded";

export type BusinessSettings = {
  business_name: string;
  activity_type: string;
  currency: string;
  invoice_paper_size: string;
  tax_mode: TaxMode;
  allow_negative_stock: boolean;
  require_shift_close: boolean;
  default_payment_method: string;
};

export const TAX_RATE = 0.14;

export const defaultBusinessSettings: BusinessSettings = {
  business_name: "محل تجاري",
  activity_type: "general",
  currency: "EGP",
  invoice_paper_size: "thermal_80",
  tax_mode: "none",
  allow_negative_stock: false,
  require_shift_close: true,
  default_payment_method: "cash",
};

function normalizeTaxMode(value: unknown): TaxMode {
  return value === "included" || value === "excluded" ? value : "none";
}

export function normalizeBusinessSettings(data: Partial<BusinessSettings> | null | undefined): BusinessSettings {
  return {
    business_name: data?.business_name || defaultBusinessSettings.business_name,
    activity_type: data?.activity_type || defaultBusinessSettings.activity_type,
    currency: data?.currency || defaultBusinessSettings.currency,
    invoice_paper_size: data?.invoice_paper_size || defaultBusinessSettings.invoice_paper_size,
    tax_mode: normalizeTaxMode(data?.tax_mode),
    allow_negative_stock: Boolean(data?.allow_negative_stock),
    require_shift_close: data?.require_shift_close !== false,
    default_payment_method: data?.default_payment_method || defaultBusinessSettings.default_payment_method,
  };
}

export function useBusinessSettings() {
  const [settings, setSettings] = useState<BusinessSettings>(defaultBusinessSettings);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadSettings() {
      setLoading(true);
      const { data } = await supabase.from("business_settings").select("*").eq("id", "main").maybeSingle();
      if (!cancelled) {
        setSettings(normalizeBusinessSettings(data as Partial<BusinessSettings> | null));
        setLoading(false);
      }
    }

    loadSettings().catch(() => {
      if (!cancelled) {
        setSettings(defaultBusinessSettings);
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return { settings, loading };
}

export function calculateInvoiceTax(netAfterDiscount: number, taxMode: TaxMode) {
  const net = Math.max(Number(netAfterDiscount) || 0, 0);

  if (taxMode === "excluded") {
    const taxAmount = net * TAX_RATE;
    return {
      taxAmount,
      totalWithTax: net + taxAmount,
      taxableSales: net,
      label: "ضريبة مضافة 14%",
    };
  }

  if (taxMode === "included") {
    const taxAmount = net - net / (1 + TAX_RATE);
    return {
      taxAmount,
      totalWithTax: net,
      taxableSales: net - taxAmount,
      label: "ضريبة شاملة 14%",
    };
  }

  return {
    taxAmount: 0,
    totalWithTax: net,
    taxableSales: net,
    label: "بدون ضريبة",
  };
}

export function paperSizeCss(size: string) {
  if (size === "a4") return "A4";
  if (size === "a5") return "A5";
  if (size === "thermal_58") return "58mm auto";
  return "80mm auto";
}
