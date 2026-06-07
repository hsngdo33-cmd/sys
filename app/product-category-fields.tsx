"use client";

import { ProductCategory, normalizeProductCategory } from "@/lib/product-category";

export type ProductAttributes = Record<string, string>;

type ProductField = {
  key: string;
  label: string;
  placeholder?: string;
  type?: "text" | "date" | "number";
  options?: string[];
};

const CATEGORY_FIELDS: Partial<Record<ProductCategory, ProductField[]>> = {
  pharmacy: [
    { key: "expiry_date", label: "تاريخ الصلاحية", type: "date" },
    { key: "batch_number", label: "Batch No.", placeholder: "رقم التشغيلة" },
    { key: "dosage", label: "التركيز", placeholder: "500mg / 10ml" },
  ],
  clothes: [
    { key: "size", label: "المقاس", options: ["XS", "S", "M", "L", "XL", "XXL", "Free Size"] },
    { key: "color", label: "اللون", placeholder: "أسود / أبيض / أزرق" },
    { key: "material", label: "الخامة", placeholder: "قطن / بوليستر" },
  ],
  food: [
    { key: "expiry_date", label: "تاريخ الصلاحية", type: "date" },
    { key: "batch_number", label: "رقم التشغيلة", placeholder: "Batch / Lot" },
    { key: "storage", label: "طريقة التخزين", options: ["عادي", "ثلاجة", "فريزر", "جاف"] },
  ],
  drinks: [
    { key: "expiry_date", label: "تاريخ الصلاحية", type: "date" },
    { key: "volume", label: "الحجم", placeholder: "250ml / 1L" },
    { key: "pack_size", label: "العبوة", placeholder: "6 قطع / 12 قطعة" },
  ],
  cosmetics: [
    { key: "expiry_date", label: "تاريخ الصلاحية", type: "date" },
    { key: "shade", label: "الدرجة/اللون", placeholder: "Shade 01" },
    { key: "skin_type", label: "نوع الاستخدام", placeholder: "دهني / جاف / كل الأنواع" },
  ],
  electronics: [
    { key: "warranty_months", label: "الضمان بالشهور", type: "number", placeholder: "12" },
    { key: "model", label: "الموديل", placeholder: "Model" },
    { key: "serial_number", label: "Serial No.", placeholder: "اختياري" },
  ],
  household: [
    { key: "size", label: "المقاس/السعة", placeholder: "2L / كبير / صغير" },
    { key: "color", label: "اللون", placeholder: "اختياري" },
  ],
  tools: [
    { key: "size", label: "المقاس", placeholder: "10mm / 2 inch" },
    { key: "material", label: "الخامة", placeholder: "حديد / ستانلس" },
  ],
  services: [
    { key: "duration", label: "مدة الخدمة", placeholder: "30 دقيقة / شهر" },
    { key: "service_code", label: "كود الخدمة", placeholder: "اختياري" },
  ],
  books: [
    { key: "author", label: "المؤلف", placeholder: "اسم المؤلف" },
    { key: "publisher", label: "دار النشر", placeholder: "اختياري" },
    { key: "grade", label: "الصف/المستوى", placeholder: "اختياري" },
  ],
  stationery: [
    { key: "brand", label: "الماركة", placeholder: "اختياري" },
    { key: "color", label: "اللون", placeholder: "اختياري" },
  ],
};

export function fieldsForCategory(category: unknown) {
  return CATEGORY_FIELDS[normalizeProductCategory(category)] || [];
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
  const fields = fieldsForCategory(category);

  if (fields.length === 0) return null;

  return (
    <div className={`${className} rounded-2xl border border-slate-200 bg-slate-50 p-4`}>
      <p className="mb-3 text-xs font-black text-slate-500">بيانات خاصة بالقسم</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {fields.map((field) => (
          <label key={field.key} className="text-xs font-black text-slate-400">
            {field.label}
            {field.options ? (
              <select
                value={value?.[field.key] || ""}
                onChange={(event) => onChange({ ...value, [field.key]: event.target.value })}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white p-3 font-bold text-slate-900 outline-none focus:border-indigo-400"
              >
                <option value="">اختار</option>
                {field.options.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type={field.type || "text"}
                value={value?.[field.key] || ""}
                placeholder={field.placeholder}
                onChange={(event) => onChange({ ...value, [field.key]: event.target.value })}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white p-3 font-bold text-slate-900 outline-none focus:border-indigo-400"
              />
            )}
          </label>
        ))}
      </div>
    </div>
  );
}
