"use client";

import { useEffect, useState } from "react";
import { CATEGORY_SETTINGS_EVENT, CustomCategoryField, DEFAULT_CATEGORY_CONFIGS, readCategorySettings } from "@/lib/category-settings";
import { ProductCategory, normalizeProductCategory } from "@/lib/product-category";

export type ProductAttributes = Record<string, unknown>;

function manualOnlyFields(category: unknown, fields: CustomCategoryField[]) {
  const key = normalizeProductCategory(category);
  const defaultKeys = new Set(
    (DEFAULT_CATEGORY_CONFIGS.find((item) => item.key === key)?.fields || []).map((field) => field.key),
  );

  return fields.filter((field) => !defaultKeys.has(field.key));
}

function useConfiguredFields(category: unknown, includeDefaultFields = true) {
  const [fields, setFields] = useState<CustomCategoryField[]>([]);

  useEffect(() => {
    const refresh = () => {
      const key = normalizeProductCategory(category);
      const settings = readCategorySettings();
      const configuredFields = settings.find((item) => item.key === key)?.fields || [];
      setFields(includeDefaultFields ? configuredFields : manualOnlyFields(category, configuredFields));
    };

    refresh();
    window.addEventListener(CATEGORY_SETTINGS_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(CATEGORY_SETTINGS_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [category, includeDefaultFields]);

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
    if (key === "unit_conversions" && Array.isArray(value)) {
      cleaned[key] = value;
      continue;
    }

    const trimmed = value?.toString().trim() || "";
    if (allowedKeys.has(key) && trimmed) cleaned[key] = trimmed;
  }

  return cleaned;
}

export function productAttributesSummary(category: unknown, attributes: unknown) {
  const source = attributes && typeof attributes === "object" ? (attributes as ProductAttributes) : {};
  return fieldsForCategory(category)
    .map((field) => {
      const value = typeof source[field.key] === "string" ? source[field.key] : "";
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
  includeDefaultFields = true,
}: {
  category: ProductCategory | string | null | undefined;
  value: ProductAttributes;
  onChange: (next: ProductAttributes) => void;
  className?: string;
  includeDefaultFields?: boolean;
}) {
  const fields = useConfiguredFields(category, includeDefaultFields);

  if (fields.length === 0) return null;

  return (
    <div className={`${className} rounded-xl border border-slate-200 bg-slate-50 p-3`}>
      <p className="mb-2 text-[11px] font-black text-slate-500">{includeDefaultFields ? "بيانات خاصة بالقسم" : "خانات إضافية"}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {fields.map((field) => (
          <label key={field.key} className="text-xs font-black text-slate-400">
            {field.label}
            {field.required && <span className="mr-1 text-rose-500">*</span>}
            <input
              type={field.type || "text"}
              value={typeof value?.[field.key] === "string" ? String(value[field.key]) : ""}
              placeholder={field.placeholder}
              required={field.required}
              onChange={(event) => onChange({ ...value, [field.key]: event.target.value })}
              className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-900 outline-none focus:border-indigo-400"
            />
          </label>
        ))}
      </div>
    </div>
  );
}
