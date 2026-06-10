"use client";

import { useEffect, useState } from "react";
import { CATEGORY_SETTINGS_EVENT, CustomCategoryField, readCategorySettings } from "@/lib/category-settings";
import { ProductCategory, normalizeProductCategory } from "@/lib/product-category";

export type ProductAttributes = Record<string, string>;

function useConfiguredFields(category: unknown) {
  const [fields, setFields] = useState<CustomCategoryField[]>([]);

  useEffect(() => {
    const refresh = () => {
      const key = normalizeProductCategory(category);
      const settings = readCategorySettings();
      setFields(settings.find((item) => item.key === key)?.fields || []);
    };

    refresh();
    window.addEventListener(CATEGORY_SETTINGS_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(CATEGORY_SETTINGS_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [category]);

  return fields;
}

export function fieldsForCategory(category: unknown) {
  const key = normalizeProductCategory(category);
  return readCategorySettings().find((item) => item.key === key)?.fields || [];
}

export function cleanProductAttributes(category: unknown, attributes: unknown): ProductAttributes {
  const source = attributes && typeof attributes === "object" ? (attributes as ProductAttributes) : {};
  const allowedKeys = new Set(fieldsForCategory(category).map((field) => field.key));
  const cleaned: ProductAttributes = {};

  for (const [key, value] of Object.entries(source)) {
    const trimmed = value?.toString().trim() || "";
    if (allowedKeys.has(key) && trimmed) cleaned[key] = trimmed;
  }

  return cleaned;
}

export function productAttributesSummary(category: unknown, attributes: unknown) {
  const source = attributes && typeof attributes === "object" ? (attributes as ProductAttributes) : {};
  return fieldsForCategory(category)
    .map((field) => {
      const value = source[field.key];
      return value ? `${field.label}: ${value}` : "";
    })
    .filter(Boolean)
    .join(" - ");
}

export function ProductCategoryFields({
  category,
  value,
  onChange,
  className = "",
}: {
  category: ProductCategory | string | null | undefined;
  value: ProductAttributes;
  onChange: (next: ProductAttributes) => void;
  className?: string;
}) {
  const fields = useConfiguredFields(category);

  if (fields.length === 0) return null;

  return (
    <div className={`${className} rounded-2xl border border-slate-200 bg-slate-50 p-4`}>
      <p className="mb-3 text-xs font-black text-slate-500">بيانات خاصة بالقسم</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {fields.map((field) => (
          <label key={field.key} className="text-xs font-black text-slate-400">
            {field.label}
            {field.required && <span className="mr-1 text-rose-500">*</span>}
            <input
              type={field.type || "text"}
              value={value?.[field.key] || ""}
              placeholder={field.placeholder}
              required={field.required}
              onChange={(event) => onChange({ ...value, [field.key]: event.target.value })}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white p-3 font-bold text-slate-900 outline-none focus:border-indigo-400"
            />
          </label>
        ))}
      </div>
    </div>
  );
}
