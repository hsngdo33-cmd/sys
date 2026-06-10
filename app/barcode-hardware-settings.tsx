"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { supabase } from "@/lib/supabase";
import { BusinessSettings, normalizeBusinessSettings } from "@/app/business-settings";

export type BarcodeHardwareSettings = {
  submitOnTab: boolean;
  labelWidthMm: number;
  labelHeightMm: number;
  labelGapMm: number;
  printDelayMs: number;
};

export const DEFAULT_HARDWARE_SETTINGS: BarcodeHardwareSettings = {
  submitOnTab: true,
  labelWidthMm: 50,
  labelHeightMm: 30,
  labelGapMm: 3,
  printDelayMs: 300,
};

const STORAGE_KEY = "barcodeHardwareSettings";
const STORAGE_EVENT = "barcodeHardwareSettingsChanged";
let lastSnapshotRaw: string | null = null;
let lastSnapshotValue: BarcodeHardwareSettings = DEFAULT_HARDWARE_SETTINGS;

function readHardwareSettings(): BarcodeHardwareSettings {
  if (typeof window === "undefined") return DEFAULT_HARDWARE_SETTINGS;

  const savedSettings = localStorage.getItem(STORAGE_KEY);
  if (savedSettings === lastSnapshotRaw) return lastSnapshotValue;
  if (!savedSettings) {
    lastSnapshotRaw = savedSettings;
    lastSnapshotValue = DEFAULT_HARDWARE_SETTINGS;
    return lastSnapshotValue;
  }

  try {
    const parsedSettings = JSON.parse(savedSettings) as Partial<BarcodeHardwareSettings>;
    lastSnapshotRaw = savedSettings;
    lastSnapshotValue = {
      submitOnTab: parsedSettings.submitOnTab ?? DEFAULT_HARDWARE_SETTINGS.submitOnTab,
      labelWidthMm: Number(parsedSettings.labelWidthMm) || DEFAULT_HARDWARE_SETTINGS.labelWidthMm,
      labelHeightMm: Number(parsedSettings.labelHeightMm) || DEFAULT_HARDWARE_SETTINGS.labelHeightMm,
      labelGapMm: Number(parsedSettings.labelGapMm) || DEFAULT_HARDWARE_SETTINGS.labelGapMm,
      printDelayMs: Number(parsedSettings.printDelayMs) || DEFAULT_HARDWARE_SETTINGS.printDelayMs,
    };
    return lastSnapshotValue;
  } catch {
    lastSnapshotRaw = savedSettings;
    lastSnapshotValue = DEFAULT_HARDWARE_SETTINGS;
    return lastSnapshotValue;
  }
}

export function useBarcodeHardwareSettings() {
  const hardwareSettings = useSyncExternalStore(
    (onStoreChange) => {
      window.addEventListener(STORAGE_EVENT, onStoreChange);
      window.addEventListener("storage", onStoreChange);
      return () => {
        window.removeEventListener(STORAGE_EVENT, onStoreChange);
        window.removeEventListener("storage", onStoreChange);
      };
    },
    readHardwareSettings,
    () => DEFAULT_HARDWARE_SETTINGS
  );

  const setHardwareSettings = (
    next:
      | BarcodeHardwareSettings
      | ((current: BarcodeHardwareSettings) => BarcodeHardwareSettings)
  ) => {
    const nextSettings = typeof next === "function" ? next(readHardwareSettings()) : next;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextSettings));
    window.dispatchEvent(new Event(STORAGE_EVENT));
  };

  return { hardwareSettings, setHardwareSettings };
}

export function BarcodeHardwareSettingsPanel() {
  const { hardwareSettings, setHardwareSettings } = useBarcodeHardwareSettings();
  const [invoicePaperSize, setInvoicePaperSize] = useState("thermal_80");
  const [paperMessage, setPaperMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadPaperSize() {
      const { data } = await supabase
        .from("business_settings")
        .select("invoice_paper_size")
        .eq("id", "main")
        .maybeSingle();

      if (!cancelled && data?.invoice_paper_size) {
        setInvoicePaperSize(data.invoice_paper_size);
      }
    }

    loadPaperSize().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  async function saveInvoicePaperSize(nextSize: string) {
    setInvoicePaperSize(nextSize);
    setPaperMessage(null);

    const { data } = await supabase
      .from("business_settings")
      .select("*")
      .eq("id", "main")
      .maybeSingle();

    const currentSettings = normalizeBusinessSettings(data as Partial<BusinessSettings> | null);

    const { error } = await supabase
      .from("business_settings")
      .upsert(
        {
          id: "main",
          ...currentSettings,
          invoice_paper_size: nextSize,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" },
      )
      .select("id")
      .single();

    setPaperMessage(error ? "تعذر حفظ مقاس الفاتورة." : "تم حفظ مقاس الفاتورة.");
  }

  return (
    <section className="h-full rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-black text-slate-900">إعدادات السكانر والطابعة</h2>
          <p className="mt-1 text-xs font-bold text-slate-500">
            اضبط قارئ USB وطابعة الليبل الحرارية للجهاز الحالي.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setHardwareSettings(DEFAULT_HARDWARE_SETTINGS)}
          className="rounded-2xl bg-slate-100 px-4 py-2 text-xs font-black text-slate-600 hover:bg-slate-200"
        >
          رجوع للافتراضي
        </button>
      </div>

      <div className="mb-4 rounded-2xl border border-indigo-100 bg-indigo-50 p-4">
        <label className="block">
          <span className="mb-1 block text-xs font-black text-indigo-900">مقاس طباعة الفاتورة</span>
          <select
            value={invoicePaperSize}
            onChange={(event) => saveInvoicePaperSize(event.target.value)}
            className="h-12 w-full rounded-2xl border border-indigo-100 bg-white px-4 text-sm font-bold text-slate-900 outline-none focus:border-indigo-400"
          >
            <option value="thermal_80">حراري 80mm</option>
            <option value="thermal_58">حراري 58mm</option>
            <option value="a5">A5</option>
            <option value="a4">A4</option>
          </select>
          <span className="mt-1 block text-[11px] font-bold leading-5 text-indigo-900/70">
            الاختيار ده بيأثر على شكل صفحة الطباعة في فواتير البيع والتوريد.
          </span>
        </label>
        {paperMessage && <p className="mt-2 text-xs font-black text-indigo-800">{paperMessage}</p>}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
        <label className="rounded-2xl border border-slate-200 p-3 text-xs font-black text-slate-500">
          عرض الليبل mm
          <input
            type="number"
            min={20}
            max={120}
            value={hardwareSettings.labelWidthMm}
            onChange={(event) =>
              setHardwareSettings((settings) => ({
                ...settings,
                labelWidthMm: Math.min(Math.max(Number(event.target.value) || 50, 20), 120),
              }))
            }
            className="mt-2 w-full rounded-xl border border-slate-200 p-2 text-center text-base font-black text-slate-900 outline-none focus:border-indigo-400"
          />
        </label>

        <label className="rounded-2xl border border-slate-200 p-3 text-xs font-black text-slate-500">
          طول الليبل mm
          <input
            type="number"
            min={15}
            max={100}
            value={hardwareSettings.labelHeightMm}
            onChange={(event) =>
              setHardwareSettings((settings) => ({
                ...settings,
                labelHeightMm: Math.min(Math.max(Number(event.target.value) || 30, 15), 100),
              }))
            }
            className="mt-2 w-full rounded-xl border border-slate-200 p-2 text-center text-base font-black text-slate-900 outline-none focus:border-indigo-400"
          />
        </label>

        <label className="rounded-2xl border border-slate-200 p-3 text-xs font-black text-slate-500">
          المسافة mm
          <input
            type="number"
            min={0}
            max={20}
            value={hardwareSettings.labelGapMm}
            onChange={(event) =>
              setHardwareSettings((settings) => ({
                ...settings,
                labelGapMm: Math.min(Math.max(Number(event.target.value) || 0, 0), 20),
              }))
            }
            className="mt-2 w-full rounded-xl border border-slate-200 p-2 text-center text-base font-black text-slate-900 outline-none focus:border-indigo-400"
          />
        </label>

        <label className="rounded-2xl border border-slate-200 p-3 text-xs font-black text-slate-500">
          تأخير الطباعة ms
          <input
            type="number"
            min={0}
            max={3000}
            value={hardwareSettings.printDelayMs}
            onChange={(event) =>
              setHardwareSettings((settings) => ({
                ...settings,
                printDelayMs: Math.min(Math.max(Number(event.target.value) || 0, 0), 3000),
              }))
            }
            className="mt-2 w-full rounded-xl border border-slate-200 p-2 text-center text-base font-black text-slate-900 outline-none focus:border-indigo-400"
          />
        </label>

        <label className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 p-3 text-xs font-black text-slate-500">
          قبول Tab من السكانر
          <input
            type="checkbox"
            checked={hardwareSettings.submitOnTab}
            onChange={(event) =>
              setHardwareSettings((settings) => ({
                ...settings,
                submitOnTab: event.target.checked,
              }))
            }
            className="h-5 w-5 accent-indigo-600"
          />
        </label>
      </div>
    </section>
  );
}
