export type CustomFieldType = "text" | "number" | "date";

export type CustomCategoryField = {
  key: string;
  label: string;
  type: CustomFieldType;
  placeholder?: string;
  required?: boolean;
};

export type CategoryConfig = {
  key: string;
  label: string;
  shortLabel: string;
  active: boolean;
  units: string[];
  fields: CustomCategoryField[];
};

export const CATEGORY_SETTINGS_STORAGE_KEY = "productCategorySettings";
export const CATEGORY_SETTINGS_EVENT = "productCategorySettingsChanged";

export const DEFAULT_UNITS = ["قطعة", "علبة", "كرتونة", "كيلو", "جرام", "لتر", "متر", "زوج", "طقم", "عبوة", "شريط", "خدمة"];

export const DEFAULT_CATEGORY_CONFIGS: CategoryConfig[] = [
  { key: "general", label: "منتجات عامة", shortLabel: "عام", active: true, units: DEFAULT_UNITS, fields: [] },
  {
    key: "food",
    label: "مواد غذائية",
    shortLabel: "غذائي",
    active: true,
    units: ["قطعة", "علبة", "كرتونة", "كيلو", "جرام", "عبوة"],
    fields: [
      { key: "expiry_date", label: "تاريخ الصلاحية", type: "date" },
      { key: "batch_number", label: "رقم التشغيلة", type: "text", placeholder: "Batch / Lot" },
      { key: "storage", label: "طريقة التخزين", type: "text", placeholder: "عادي / ثلاجة / فريزر" },
    ],
  },
  {
    key: "drinks",
    label: "مشروبات",
    shortLabel: "مشروبات",
    active: true,
    units: ["قطعة", "عبوة", "كرتونة", "لتر"],
    fields: [
      { key: "expiry_date", label: "تاريخ الصلاحية", type: "date" },
      { key: "volume", label: "الحجم", type: "text", placeholder: "250ml / 1L" },
      { key: "pack_size", label: "العبوة", type: "text", placeholder: "6 قطع / 12 قطعة" },
    ],
  },
  {
    key: "clothes",
    label: "ملابس",
    shortLabel: "ملابس",
    active: true,
    units: ["قطعة", "طقم", "زوج"],
    fields: [
      { key: "size", label: "المقاس", type: "text", placeholder: "S / M / L / XL" },
      { key: "color", label: "اللون", type: "text", placeholder: "أسود / أبيض / أزرق" },
      { key: "material", label: "الخامة", type: "text", placeholder: "قطن / بوليستر" },
    ],
  },
  {
    key: "electronics",
    label: "إلكترونيات",
    shortLabel: "إلكترونيات",
    active: true,
    units: ["قطعة", "طقم"],
    fields: [
      { key: "warranty_months", label: "الضمان بالشهور", type: "number", placeholder: "12" },
      { key: "model", label: "الموديل", type: "text", placeholder: "Model" },
      { key: "serial_number", label: "Serial No.", type: "text", placeholder: "اختياري" },
    ],
  },
  {
    key: "cosmetics",
    label: "عناية وتجميل",
    shortLabel: "تجميل",
    active: true,
    units: ["قطعة", "علبة", "عبوة"],
    fields: [
      { key: "expiry_date", label: "تاريخ الصلاحية", type: "date" },
      { key: "shade", label: "الدرجة/اللون", type: "text", placeholder: "Shade 01" },
      { key: "skin_type", label: "نوع الاستخدام", type: "text", placeholder: "دهني / جاف / كل الأنواع" },
    ],
  },
  { key: "household", label: "منزلية", shortLabel: "منزلية", active: true, units: ["قطعة", "طقم", "عبوة", "لتر"], fields: [
    { key: "size", label: "المقاس/السعة", type: "text", placeholder: "2L / كبير / صغير" },
    { key: "color", label: "اللون", type: "text", placeholder: "اختياري" },
  ] },
  { key: "tools", label: "عدد وأدوات", shortLabel: "أدوات", active: true, units: ["قطعة", "طقم", "متر"], fields: [
    { key: "size", label: "المقاس", type: "text", placeholder: "10mm / 2 inch" },
    { key: "material", label: "الخامة", type: "text", placeholder: "حديد / ستانلس" },
  ] },
  { key: "pharmacy", label: "صيدلية", shortLabel: "صيدلية", active: true, units: ["علبة", "شريط", "قرص", "أمبول", "عبوة"], fields: [
    { key: "expiry_date", label: "تاريخ الصلاحية", type: "date", required: true },
    { key: "batch_number", label: "Batch No.", type: "text", placeholder: "رقم التشغيلة" },
    { key: "dosage", label: "التركيز", type: "text", placeholder: "500mg / 10ml" },
  ] },
  { key: "services", label: "خدمات", shortLabel: "خدمات", active: true, units: ["خدمة"], fields: [
    { key: "duration", label: "مدة الخدمة", type: "text", placeholder: "30 دقيقة / شهر" },
    { key: "service_code", label: "كود الخدمة", type: "text", placeholder: "اختياري" },
  ] },
  { key: "books", label: "كتب", shortLabel: "كتب", active: true, units: ["قطعة"], fields: [
    { key: "author", label: "المؤلف", type: "text", placeholder: "اسم المؤلف" },
    { key: "publisher", label: "دار النشر", type: "text", placeholder: "اختياري" },
    { key: "grade", label: "الصف/المستوى", type: "text", placeholder: "اختياري" },
  ] },
  { key: "stationery", label: "أدوات مكتبية", shortLabel: "مكتبي", active: true, units: ["قطعة", "علبة", "كرتونة"], fields: [
    { key: "brand", label: "الماركة", type: "text", placeholder: "اختياري" },
    { key: "color", label: "اللون", type: "text", placeholder: "اختياري" },
  ] },
];

function unique(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

export function slugifyCategory(value: string) {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^\u0600-\u06ff\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 40);

  return slug || `category-${Date.now()}`;
}

export function normalizeCategoryConfigs(configs: unknown): CategoryConfig[] {
  const source = Array.isArray(configs) ? configs : DEFAULT_CATEGORY_CONFIGS;
  const merged = new Map<string, CategoryConfig>();

  DEFAULT_CATEGORY_CONFIGS.forEach((category) => merged.set(category.key, category));

  source.forEach((item) => {
    if (!item || typeof item !== "object") return;
    const row = item as Partial<CategoryConfig>;
    const key = typeof row.key === "string" ? slugifyCategory(row.key) : "";
    const label = typeof row.label === "string" && row.label.trim() ? row.label.trim() : "";
    if (!key || !label) return;

    const fields: CustomCategoryField[] = Array.isArray(row.fields)
      ? (row.fields as unknown[])
          .map((field) => {
            if (!field || typeof field !== "object") return null;
            const current = field as Partial<CustomCategoryField>;
            const fieldLabel = typeof current.label === "string" ? current.label.trim() : "";
            if (!fieldLabel) return null;
            const normalizedField: CustomCategoryField = {
              key: typeof current.key === "string" && current.key.trim() ? slugifyCategory(current.key) : slugifyCategory(fieldLabel),
              label: fieldLabel,
              type: current.type === "number" || current.type === "date" ? current.type : "text",
              placeholder: typeof current.placeholder === "string" ? current.placeholder : "",
              required: Boolean(current.required),
            };
            return normalizedField;
          })
          .filter((field): field is CustomCategoryField => Boolean(field))
      : [];

    merged.set(key, {
      key,
      label,
      shortLabel: typeof row.shortLabel === "string" && row.shortLabel.trim() ? row.shortLabel.trim() : label,
      active: row.active !== false,
      units: unique(Array.isArray(row.units) ? row.units : DEFAULT_UNITS),
      fields,
    });
  });

  return [...merged.values()];
}

export function readCategorySettings() {
  if (typeof window === "undefined") return DEFAULT_CATEGORY_CONFIGS;

  try {
    const saved = window.localStorage.getItem(CATEGORY_SETTINGS_STORAGE_KEY);
    return normalizeCategoryConfigs(saved ? JSON.parse(saved) : DEFAULT_CATEGORY_CONFIGS);
  } catch {
    return DEFAULT_CATEGORY_CONFIGS;
  }
}

export function saveCategorySettings(configs: CategoryConfig[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(CATEGORY_SETTINGS_STORAGE_KEY, JSON.stringify(normalizeCategoryConfigs(configs)));
  window.dispatchEvent(new Event(CATEGORY_SETTINGS_EVENT));
}

export function categoryLabelFromSettings(value: unknown, configs = readCategorySettings()) {
  const key = typeof value === "string" ? value : "general";
  return configs.find((category) => category.key === key)?.label || configs.find((category) => category.key === "general")?.label || "منتجات عامة";
}

export function unitsForCategory(category: unknown, configs = readCategorySettings()) {
  const key = typeof category === "string" ? category : "general";
  return configs.find((item) => item.key === key)?.units || DEFAULT_UNITS;
}
