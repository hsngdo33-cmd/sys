"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import {
  CATEGORY_SETTINGS_EVENT,
  CategoryConfig,
  DEFAULT_CATEGORY_CONFIGS,
  DEFAULT_UNITS,
  CustomCategoryField,
  hasSavedCategorySettings,
  hasUsableCategorySettings,
  isGeneratedAllActiveCategorySettings,
  readCategorySettings,
  saveCategorySettings,
  slugifyCategory,
} from "@/lib/category-settings";
import { ProductCategory, productCategoryLabel } from "@/lib/product-category";
import { supabase } from "@/lib/supabase";

const ACTIVE_CATEGORIES_STORAGE_KEY = "activeProductCategories";

type CategorySelectProps = {
  value: ProductCategory;
  onChange: (category: ProductCategory) => void;
  label?: string;
  counts?: Partial<Record<ProductCategory, number>>;
  variant?: "select" | "cards";
};

function settingsWithLegacyActiveFlags() {
  const settings = readCategorySettings();

  if (typeof window === "undefined") return settings;

  const legacy = window.localStorage.getItem(ACTIVE_CATEGORIES_STORAGE_KEY);
  if (!legacy) return settings;

  try {
    const enabled = JSON.parse(legacy) as string[];
    if (!Array.isArray(enabled) || enabled.length === 0) return settings;
    const defaultKeys = new Set(DEFAULT_CATEGORY_CONFIGS.map((category) => category.key));
    const enabledDefaultKeys = enabled.filter((key) => defaultKeys.has(key));
    if (enabledDefaultKeys.length >= DEFAULT_CATEGORY_CONFIGS.length) return settings;
    return settings.map((category) => ({ ...category, active: enabled.includes(category.key) }));
  } catch {
    return settings;
  }
}

function useCategorySettings() {
  const [settings, setSettings] = useState<CategoryConfig[]>(DEFAULT_CATEGORY_CONFIGS);

  useEffect(() => {
    const refresh = () => setSettings(settingsWithLegacyActiveFlags());
    refresh();
    async function loadRemoteSettings() {
      try {
        const { data } = await supabase
          .from("business_settings")
          .select("category_settings")
          .eq("id", "main")
          .maybeSingle();
        const remoteSettings = (data as { category_settings?: unknown } | null)?.category_settings;
        if (hasUsableCategorySettings(remoteSettings) && !isGeneratedAllActiveCategorySettings(remoteSettings)) {
          saveCategorySettings(remoteSettings as CategoryConfig[]);
          setSettings(readCategorySettings());
          return;
        }

        if (hasSavedCategorySettings()) {
          const localSettings = settingsWithLegacyActiveFlags();
          await supabase
            .from("business_settings")
            .upsert(
              {
                id: "main",
                category_settings: localSettings,
                updated_at: new Date().toISOString(),
              },
              { onConflict: "id" },
            )
            .select("id")
            .single();
        }
      } catch {
        // Local settings remain available when the database is not upgraded yet.
      }
    }
    void loadRemoteSettings();
    window.addEventListener(CATEGORY_SETTINGS_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(CATEGORY_SETTINGS_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  return settings;
}

export function useEnabledCategories() {
  const settings = useCategorySettings();
  return useMemo(
    () => settings.filter((category) => category.active).map((category) => category.key),
    [settings],
  );
}

export function useCategoryUnits(category: unknown) {
  const settings = useCategorySettings();
  const key = typeof category === "string" && category.trim() ? category : "general";
  return settings.find((item) => item.key === key)?.units || DEFAULT_UNITS;
}

export function CategorySelect({ value, onChange, label = "القسم", counts, variant = "select" }: CategorySelectProps) {
  const categories = useCategorySettings();
  const visibleCategories = useMemo(() => {
    const enabled = categories.filter((category) => category.active);

    return enabled.length > 0 ? enabled : categories;
  }, [categories]);

  useEffect(() => {
    if (visibleCategories.length > 0 && !visibleCategories.some((category) => category.key === value)) {
      onChange(visibleCategories[0].key);
    }
  }, [onChange, value, visibleCategories]);

  if (variant === "cards") {
    return (
      <div className="block">
        <div className="mb-2 flex items-center justify-between gap-3">
          <span className="block text-xs font-black text-slate-400">{label}</span>
          <span className="hidden rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black text-slate-500 sm:inline-flex">
            {visibleCategories.length} قسم
          </span>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible">
          {visibleCategories.map((category) => {
            const selected = category.key === value;
            const count = counts ? counts[category.key] || 0 : null;

            return (
              <button
                key={category.key}
                type="button"
                onClick={() => onChange(category.key)}
                className={`min-h-10 shrink-0 rounded-xl border px-3 py-2 text-right text-xs font-black transition-all ${
                  selected
                    ? "border-slate-900 bg-slate-900 text-white shadow-sm"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                }`}
              >
                <span className="whitespace-nowrap">{category.label}</span>
                {counts && (
                  <span className={`mr-2 inline-flex min-w-5 justify-center rounded-full px-1.5 py-0.5 text-[10px] ${selected ? "bg-white/15 text-white" : "bg-slate-100 text-slate-500"}`}>
                    ({count})
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-black text-slate-400">{label}</span>
      <div className="relative">
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-12 w-full appearance-none rounded-2xl border border-slate-200 bg-white px-4 pl-10 text-sm font-black text-slate-900 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50"
        >
          {visibleCategories.map((category) => (
            <option key={category.key} value={category.key}>
              {category.label}
              {counts ? ` (${counts[category.key] || 0})` : ""}
            </option>
          ))}
        </select>
        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-xs font-black text-slate-400">
          ▼
        </span>
      </div>
      <span className="mt-2 inline-flex rounded-full bg-indigo-50 px-3 py-1 text-[11px] font-black text-indigo-700">
        {productCategoryLabel(value)}
      </span>
    </label>
  );
}

function newCategory(existing: CategoryConfig[]): CategoryConfig {
  const nextNumber = existing.length + 1;
  return {
    key: `custom-${nextNumber}`,
    label: `قسم جديد ${nextNumber}`,
    shortLabel: `قسم ${nextNumber}`,
    active: true,
    units: ["قطعة"],
    unitConversions: [],
    fields: [],
  };
}

function emptyField(): CustomCategoryField {
  return { key: `field-${Date.now()}`, label: "", type: "text", placeholder: "", required: false };
}

function emptyConversion(selected: CategoryConfig) {
  return {
    id: `conversion-${Date.now()}`,
    fromUnit: selected.units[1] || selected.units[0] || "كرتونة",
    toUnit: selected.units[0] || "قطعة",
    factor: 1,
  };
}

export function CategorySettingsPanel() {
  const liveSettings = useCategorySettings();
  const [draft, setDraft] = useState<CategoryConfig[]>(liveSettings);
  const [selectedKey, setSelectedKey] = useState("general");
  const selected = draft.find((category) => category.key === selectedKey) || draft[0];

  useEffect(() => {
    setDraft(liveSettings);
    setSelectedKey((current) => (liveSettings.some((category) => category.key === current) ? current : liveSettings[0]?.key || "general"));
  }, [liveSettings]);

  const updateSelected = (patch: Partial<CategoryConfig>) => {
    if (!selected) return;
    setDraft((current) =>
      current.map((category) => (category.key === selected.key ? { ...category, ...patch } : category)),
    );
  };

  const save = async () => {
    const normalized = draft.map((category) => ({
      ...category,
      key: slugifyCategory(category.key || category.label),
      shortLabel: category.shortLabel || category.label,
      units: category.units.length > 0 ? category.units : ["قطعة"],
      unitConversions: category.unitConversions.filter((conversion) => conversion.fromUnit && conversion.toUnit && Number(conversion.factor) > 0),
      fields: category.fields.filter((field) => field.label.trim()),
    }));
    saveCategorySettings(normalized);
    window.localStorage.removeItem(ACTIVE_CATEGORIES_STORAGE_KEY);
    setDraft(readCategorySettings());

    try {
      await supabase
        .from("business_settings")
        .upsert(
          {
            id: "main",
            category_settings: normalized,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "id" },
        )
        .select("id")
        .single();
    } catch {
      // The local copy is already saved; remote sync waits until the database is upgraded.
    }
  };

  return (
    <div className="h-full rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-xl font-black text-slate-900">إعدادات الأقسام والحقول</h2>
          <p className="mt-1 text-xs font-bold leading-6 text-slate-500">
            عرف الأقسام حسب نشاط العميل، وحدد وحدات القياس والبيانات الإضافية التي تظهر عند إضافة صنف.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              const next = [...draft, newCategory(draft)];
              setDraft(next);
              setSelectedKey(next[next.length - 1].key);
            }}
            className="inline-flex h-11 items-center gap-2 rounded-2xl bg-indigo-600 px-4 text-xs font-black text-white hover:bg-indigo-500"
          >
            <Plus className="h-4 w-4" />
            قسم جديد
          </button>
          <button
            type="button"
            onClick={() => {
              setDraft(DEFAULT_CATEGORY_CONFIGS);
              setSelectedKey("general");
            }}
            className="inline-flex h-11 items-center gap-2 rounded-2xl bg-slate-100 px-4 text-xs font-black text-slate-600 hover:bg-slate-200"
          >
            <RotateCcw className="h-4 w-4" />
            استرجاع القوالب
          </button>
          <button
            type="button"
            onClick={save}
            className="inline-flex h-11 items-center gap-2 rounded-2xl bg-slate-950 px-4 text-xs font-black text-white hover:bg-slate-800"
          >
            <Save className="h-4 w-4" />
            حفظ الإعدادات
          </button>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[320px_1fr]">
        <div className="max-h-[620px] overflow-auto rounded-2xl border border-slate-200 bg-slate-50 p-3">
          <div className="space-y-2">
            {draft.map((category) => (
              <button
                key={category.key}
                type="button"
                onClick={() => setSelectedKey(category.key)}
                className={`w-full rounded-2xl border p-4 text-right transition ${
                  selected?.key === category.key
                    ? "border-indigo-200 bg-white shadow-sm"
                    : "border-transparent bg-transparent hover:bg-white"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-black text-slate-950">{category.label}</span>
                  <span className={`h-3 w-3 rounded-full ${category.active ? "bg-emerald-500" : "bg-slate-300"}`} />
                </div>
                <p className="mt-1 text-xs font-bold text-slate-400">
                  {category.units.length} وحدة - {category.fields.length} خانة
                </p>
              </button>
            ))}
          </div>
        </div>

        {selected && (
          <div className="space-y-4 rounded-2xl border border-slate-200 p-4">
            <div className="grid gap-3 md:grid-cols-3">
              <label className="block">
                <span className="mb-1 block text-xs font-black text-slate-500">اسم القسم</span>
                <input
                  value={selected.label}
                  onChange={(event) =>
                    updateSelected({
                      label: event.target.value,
                      shortLabel: selected.shortLabel || event.target.value,
                    })
                  }
                  className="h-12 w-full rounded-2xl border border-slate-200 px-4 text-sm font-bold outline-none focus:border-indigo-400"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-black text-slate-500">كود داخلي</span>
                <input
                  value={selected.key}
                  onChange={(event) => updateSelected({ key: slugifyCategory(event.target.value) })}
                  className="h-12 w-full rounded-2xl border border-slate-200 px-4 text-left text-sm font-bold outline-none focus:border-indigo-400"
                  dir="ltr"
                />
              </label>
              <button
                type="button"
                onClick={() => updateSelected({ active: !selected.active })}
                className={`mt-5 h-12 rounded-2xl border px-4 text-sm font-black ${
                  selected.active
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-slate-200 bg-slate-50 text-slate-500"
                }`}
              >
                {selected.active ? "القسم نشط" : "القسم غير نشط"}
              </button>
            </div>

            <div className="rounded-2xl bg-slate-50 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h3 className="font-black text-slate-950">وحدات القياس</h3>
                  <p className="text-xs font-bold text-slate-500">اكتب كل وحدة واضغط إضافة، أو احذف غير المستخدم.</p>
                </div>
                <button
                  type="button"
                  onClick={() => updateSelected({ units: [...selected.units, ""] })}
                  className="rounded-xl bg-white px-3 py-2 text-xs font-black text-indigo-700 shadow-sm"
                >
                  إضافة وحدة
                </button>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {selected.units.map((unit, index) => (
                  <div key={`${unit}-${index}`} className="flex gap-2">
                    <input
                      value={unit}
                      onChange={(event) => {
                        const units = [...selected.units];
                        units[index] = event.target.value;
                        updateSelected({ units });
                      }}
                      className="h-11 min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold outline-none focus:border-indigo-400"
                    />
                    <button
                      type="button"
                      onClick={() => updateSelected({ units: selected.units.filter((_, currentIndex) => currentIndex !== index) })}
                      className="h-11 w-11 rounded-xl bg-white text-rose-600 shadow-sm"
                      title="حذف الوحدة"
                    >
                      <Trash2 className="mx-auto h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl bg-slate-50 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h3 className="font-black text-slate-950">تحويلات الوحدات</h3>
                  <p className="text-xs font-bold text-slate-500">مثال: كرتونة = 12 قطعة. المخزون يتحرك بالوحدة الأساسية.</p>
                </div>
                <button
                  type="button"
                  onClick={() => updateSelected({ unitConversions: [...(selected.unitConversions || []), emptyConversion(selected)] })}
                  className="rounded-xl bg-white px-3 py-2 text-xs font-black text-indigo-700 shadow-sm"
                >
                  إضافة تحويل
                </button>
              </div>

              <div className="space-y-2">
                {(selected.unitConversions || []).length === 0 && (
                  <div className="rounded-xl bg-white p-5 text-center text-xs font-black text-slate-400">
                    لا توجد تحويلات وحدات لهذا القسم.
                  </div>
                )}
                {(selected.unitConversions || []).map((conversion, index) => (
                  <div key={conversion.id || index} className="grid gap-2 rounded-2xl border border-slate-200 bg-white p-3 md:grid-cols-[1fr_120px_1fr_44px]">
                    <select
                      value={conversion.fromUnit}
                      onChange={(event) => {
                        const unitConversions = [...(selected.unitConversions || [])];
                        unitConversions[index] = { ...conversion, fromUnit: event.target.value };
                        updateSelected({ unitConversions });
                      }}
                      className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold outline-none focus:border-indigo-400"
                    >
                      {selected.units.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
                    </select>
                    <input
                      type="number"
                      min={0.001}
                      step="any"
                      value={conversion.factor}
                      onChange={(event) => {
                        const unitConversions = [...(selected.unitConversions || [])];
                        unitConversions[index] = { ...conversion, factor: Number(event.target.value) || 1 };
                        updateSelected({ unitConversions });
                      }}
                      className="h-11 rounded-xl border border-slate-200 px-3 text-center text-sm font-bold outline-none focus:border-indigo-400"
                    />
                    <select
                      value={conversion.toUnit}
                      onChange={(event) => {
                        const unitConversions = [...(selected.unitConversions || [])];
                        unitConversions[index] = { ...conversion, toUnit: event.target.value };
                        updateSelected({ unitConversions });
                      }}
                      className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold outline-none focus:border-indigo-400"
                    >
                      {selected.units.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
                    </select>
                    <button
                      type="button"
                      onClick={() => updateSelected({ unitConversions: (selected.unitConversions || []).filter((_, currentIndex) => currentIndex !== index) })}
                      className="h-11 rounded-xl bg-rose-50 text-rose-600"
                      title="حذف التحويل"
                    >
                      <Trash2 className="mx-auto h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl bg-slate-50 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h3 className="font-black text-slate-950">الخانات الإضافية</h3>
                  <p className="text-xs font-bold text-slate-500">الخانات دي هتظهر في إضافة/تعديل الصنف لهذا القسم.</p>
                </div>
                <button
                  type="button"
                  onClick={() => updateSelected({ fields: [...selected.fields, emptyField()] })}
                  className="rounded-xl bg-white px-3 py-2 text-xs font-black text-indigo-700 shadow-sm"
                >
                  إضافة خانة
                </button>
              </div>

              <div className="space-y-3">
                {selected.fields.length === 0 && (
                  <div className="rounded-xl bg-white p-5 text-center text-xs font-black text-slate-400">
                    لا توجد خانات إضافية لهذا القسم.
                  </div>
                )}
                {selected.fields.map((field, index) => (
                  <div key={field.key || index} className="grid gap-2 rounded-2xl border border-slate-200 bg-white p-3 md:grid-cols-[1fr_140px_1fr_44px]">
                    <input
                      value={field.label}
                      onChange={(event) => {
                        const fields = [...selected.fields];
                        fields[index] = { ...field, label: event.target.value, key: field.key || slugifyCategory(event.target.value) };
                        updateSelected({ fields });
                      }}
                      placeholder="اسم الخانة"
                      className="h-11 rounded-xl border border-slate-200 px-3 text-sm font-bold outline-none focus:border-indigo-400"
                    />
                    <select
                      value={field.type}
                      onChange={(event) => {
                        const fields = [...selected.fields];
                        fields[index] = { ...field, type: event.target.value as CustomCategoryField["type"] };
                        updateSelected({ fields });
                      }}
                      className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold outline-none focus:border-indigo-400"
                    >
                      <option value="text">كتابة</option>
                      <option value="number">رقم</option>
                      <option value="date">تاريخ</option>
                    </select>
                    <input
                      value={field.placeholder || ""}
                      onChange={(event) => {
                        const fields = [...selected.fields];
                        fields[index] = { ...field, placeholder: event.target.value };
                        updateSelected({ fields });
                      }}
                      placeholder="ملاحظة داخل الخانة"
                      className="h-11 rounded-xl border border-slate-200 px-3 text-sm font-bold outline-none focus:border-indigo-400"
                    />
                    <button
                      type="button"
                      onClick={() => updateSelected({ fields: selected.fields.filter((_, currentIndex) => currentIndex !== index) })}
                      className="h-11 rounded-xl bg-rose-50 text-rose-600"
                      title="حذف الخانة"
                    >
                      <Trash2 className="mx-auto h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
