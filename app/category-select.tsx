"use client";

import { useEffect, useMemo, useState } from "react";
import { PRODUCT_CATEGORIES, ProductCategory, productCategoryLabel } from "@/lib/product-category";

const ACTIVE_CATEGORIES_STORAGE_KEY = "activeProductCategories";
const ACTIVE_CATEGORIES_EVENT = "activeProductCategoriesChanged";

type CategorySelectProps = {
  value: ProductCategory;
  onChange: (category: ProductCategory) => void;
  label?: string;
  counts?: Partial<Record<ProductCategory, number>>;
};

function readEnabledCategories() {
  if (typeof window === "undefined") return PRODUCT_CATEGORIES.map((category) => category.key);

  const saved = localStorage.getItem(ACTIVE_CATEGORIES_STORAGE_KEY);
  if (!saved) return PRODUCT_CATEGORIES.map((category) => category.key);

  try {
    const parsed = JSON.parse(saved) as ProductCategory[];
    const valid = parsed.filter((key) => PRODUCT_CATEGORIES.some((category) => category.key === key));
    return valid.length > 0 ? valid : PRODUCT_CATEGORIES.map((category) => category.key);
  } catch {
    return PRODUCT_CATEGORIES.map((category) => category.key);
  }
}

function saveEnabledCategories(categories: ProductCategory[]) {
  localStorage.setItem(ACTIVE_CATEGORIES_STORAGE_KEY, JSON.stringify(categories));
  window.dispatchEvent(new Event(ACTIVE_CATEGORIES_EVENT));
}

export function useEnabledCategories() {
  const [enabledCategories, setEnabledCategories] = useState<ProductCategory[]>(
    PRODUCT_CATEGORIES.map((category) => category.key)
  );

  useEffect(() => {
    const refresh = () => setEnabledCategories(readEnabledCategories());
    refresh();
    window.addEventListener(ACTIVE_CATEGORIES_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(ACTIVE_CATEGORIES_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  return enabledCategories;
}

export function CategorySelect({ value, onChange, label = "القسم", counts }: CategorySelectProps) {
  const enabledCategories = useEnabledCategories();
  const visibleCategories = useMemo(() => {
    const enabled = PRODUCT_CATEGORIES.filter((category) => enabledCategories.includes(category.key));
    const current = PRODUCT_CATEGORIES.find((category) => category.key === value);

    if (current && !enabled.some((category) => category.key === current.key)) {
      return [current, ...enabled];
    }

    return enabled;
  }, [enabledCategories, value]);

  useEffect(() => {
    if (visibleCategories.length > 0 && !visibleCategories.some((category) => category.key === value)) {
      onChange(visibleCategories[0].key);
    }
  }, [onChange, value, visibleCategories]);

  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-black text-slate-400">{label}</span>
      <div className="relative">
        <select
          value={value}
          onChange={(event) => onChange(event.target.value as ProductCategory)}
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

export function CategorySettingsPanel() {
  const enabledCategories = useEnabledCategories();

  const toggleCategory = (category: ProductCategory) => {
    const next = enabledCategories.includes(category)
      ? enabledCategories.filter((key) => key !== category)
      : [...enabledCategories, category];

    if (next.length === 0) return;
    saveEnabledCategories(next);
  };

  return (
    <div className="h-full rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-black text-slate-900">الأقسام النشطة</h2>
          <p className="mt-1 text-xs font-bold text-slate-500">
            اختار الأقسام اللي المحل بيشتغل عليها. الباقي مش هيظهر في التكويد والفواتير.
          </p>
        </div>
        <button
          type="button"
          onClick={() => saveEnabledCategories(PRODUCT_CATEGORIES.map((category) => category.key))}
          className="rounded-2xl bg-slate-100 px-4 py-2 text-xs font-black text-slate-600 hover:bg-slate-200"
        >
          إظهار الكل
        </button>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
        {PRODUCT_CATEGORIES.map((category) => {
          const active = enabledCategories.includes(category.key);
          return (
            <button
              key={category.key}
              type="button"
              onClick={() => toggleCategory(category.key)}
              className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-right text-sm font-black transition ${
                active
                  ? "border-indigo-200 bg-indigo-50 text-indigo-700"
                  : "border-slate-200 bg-slate-50 text-slate-400"
              }`}
            >
              {category.label}
              <span className={`h-5 w-5 rounded-full border-2 ${active ? "border-indigo-600 bg-indigo-600" : "border-slate-300"}`} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
