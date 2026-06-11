export type CustomFieldType = "text" | "number" | "date";

export type CustomCategoryField = {
  key: string;
  label: string;
  type: CustomFieldType;
  placeholder?: string;
  required?: boolean;
};

export type UnitConversion = {
  id: string;
  fromUnit: string;
  toUnit: string;
  factor: number;
};

export type CategoryConfig = {
  key: string;
  label: string;
  shortLabel: string;
  active: boolean;
  units: string[];
  unitConversions: UnitConversion[];
  fields: CustomCategoryField[];
};

export const CATEGORY_SETTINGS_STORAGE_KEY = "productCategorySettings";
export const CATEGORY_SETTINGS_EVENT = "productCategorySettingsChanged";

export const DEFAULT_UNITS = ["قطعة", "علبة", "كرتونة", "كيلو", "جرام", "لتر", "متر", "زوج", "طقم", "عبوة", "شريط", "خدمة"];

export const DEFAULT_CATEGORY_CONFIGS: CategoryConfig[] = [
  { key: "general", label: "منتجات عامة", shortLabel: "عام", active: true, units: DEFAULT_UNITS, unitConversions: [], fields: [] },
  {
    key: "food",
    label: "مواد غذائية",
    shortLabel: "غذائي",
    active: true,
    units: ["قطعة", "علبة", "كرتونة", "كيلو", "جرام", "عبوة"],
    unitConversions: [
      { id: "food-carton-piece", fromUnit: "كرتونة", toUnit: "قطعة", factor: 12 },
      { id: "food-kg-gram", fromUnit: "كيلو", toUnit: "جرام", factor: 1000 },
    ],
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
    unitConversions: [
      { id: "drinks-carton-piece", fromUnit: "كرتونة", toUnit: "قطعة", factor: 12 },
      { id: "drinks-liter-piece", fromUnit: "لتر", toUnit: "قطعة", factor: 1 },
    ],
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
    unitConversions: [],
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
    unitConversions: [],
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
    unitConversions: [
      { id: "cosmetics-box-piece", fromUnit: "علبة", toUnit: "قطعة", factor: 1 },
    ],
    fields: [
      { key: "expiry_date", label: "تاريخ الصلاحية", type: "date" },
      { key: "shade", label: "الدرجة/اللون", type: "text", placeholder: "Shade 01" },
      { key: "skin_type", label: "نوع الاستخدام", type: "text", placeholder: "دهني / جاف / كل الأنواع" },
    ],
  },
  { key: "household", label: "منزلية", shortLabel: "منزلية", active: true, units: ["قطعة", "طقم", "عبوة", "لتر"], unitConversions: [], fields: [
    { key: "size", label: "المقاس/السعة", type: "text", placeholder: "2L / كبير / صغير" },
    { key: "color", label: "اللون", type: "text", placeholder: "اختياري" },
  ] },
  { key: "tools", label: "عدد وأدوات", shortLabel: "أدوات", active: true, units: ["قطعة", "طقم", "متر"], unitConversions: [], fields: [
    { key: "size", label: "المقاس", type: "text", placeholder: "10mm / 2 inch" },
    { key: "material", label: "الخامة", type: "text", placeholder: "حديد / ستانلس" },
  ] },
  { key: "pharmacy", label: "صيدلية", shortLabel: "صيدلية", active: true, units: ["علبة", "شريط", "قرص", "أمبول", "عبوة"], unitConversions: [
    { id: "pharmacy-box-strip", fromUnit: "علبة", toUnit: "شريط", factor: 2 },
    { id: "pharmacy-strip-pill", fromUnit: "شريط", toUnit: "قرص", factor: 10 },
  ], fields: [
    { key: "expiry_date", label: "تاريخ الصلاحية", type: "date", required: true },
    { key: "batch_number", label: "Batch No.", type: "text", placeholder: "رقم التشغيلة" },
    { key: "dosage", label: "التركيز", type: "text", placeholder: "500mg / 10ml" },
  ] },
  { key: "services", label: "خدمات", shortLabel: "خدمات", active: true, units: ["خدمة"], unitConversions: [], fields: [
    { key: "duration", label: "مدة الخدمة", type: "text", placeholder: "30 دقيقة / شهر" },
    { key: "service_code", label: "كود الخدمة", type: "text", placeholder: "اختياري" },
  ] },
  { key: "books", label: "كتب", shortLabel: "كتب", active: true, units: ["قطعة"], unitConversions: [], fields: [
    { key: "author", label: "المؤلف", type: "text", placeholder: "اسم المؤلف" },
    { key: "publisher", label: "دار النشر", type: "text", placeholder: "اختياري" },
    { key: "grade", label: "الصف/المستوى", type: "text", placeholder: "اختياري" },
  ] },
  { key: "stationery", label: "أدوات مكتبية", shortLabel: "مكتبي", active: true, units: ["قطعة", "علبة", "كرتونة"], unitConversions: [
    { id: "stationery-box-piece", fromUnit: "علبة", toUnit: "قطعة", factor: 12 },
    { id: "stationery-carton-box", fromUnit: "كرتونة", toUnit: "علبة", factor: 12 },
  ], fields: [
    { key: "brand", label: "الماركة", type: "text", placeholder: "اختياري" },
    { key: "color", label: "اللون", type: "text", placeholder: "اختياري" },
  ] },
];

function unique(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function normalizeUnitConversions(value: unknown): UnitConversion[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item, index) => {
      if (!item || typeof item !== "object") return null;
      const source = item as Partial<UnitConversion>;
      const fromUnit = typeof source.fromUnit === "string" ? source.fromUnit.trim() : "";
      const toUnit = typeof source.toUnit === "string" ? source.toUnit.trim() : "";
      const factor = Number(source.factor);
      if (!fromUnit || !toUnit || !Number.isFinite(factor) || factor <= 0) return null;
      return {
        id: typeof source.id === "string" && source.id.trim() ? source.id : `conversion-${index}-${Date.now()}`,
        fromUnit,
        toUnit,
        factor,
      };
    })
    .filter((item): item is UnitConversion => Boolean(item));
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
      unitConversions: normalizeUnitConversions(row.unitConversions),
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

function normalizeUnitName(value: unknown) {
  return typeof value === "string"
    ? value.trim().replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/\s+/g, " ").toLowerCase()
    : "";
}

const STANDARD_UNIT_ALIASES: Record<string, string> = {
  "كيلو": "kg",
  "كجم": "kg",
  "كيلوجرام": "kg",
  "كيلو جرام": "kg",
  "kg": "kg",
  "جرام": "g",
  "جم": "g",
  "g": "g",
  "لتر": "l",
  "ليتر": "l",
  "l": "l",
  "مللي": "ml",
  "ملي": "ml",
  "مل": "ml",
  "ml": "ml",
  "متر": "m",
  "m": "m",
  "سنتي": "cm",
  "سم": "cm",
  "سنتيمتر": "cm",
  "cm": "cm",
};

const STANDARD_UNIT_CONVERSIONS = [
  { fromUnit: "kg", toUnit: "g", factor: 1000 },
  { fromUnit: "l", toUnit: "ml", factor: 1000 },
  { fromUnit: "m", toUnit: "cm", factor: 100 },
];

function canonicalUnit(value: unknown) {
  const normalized = normalizeUnitName(value);
  return STANDARD_UNIT_ALIASES[normalized] || normalized;
}

function normalizeCustomConversions(value: unknown): UnitConversion[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item, index) => {
      if (!item || typeof item !== "object") return null;
      const source = item as Partial<UnitConversion>;
      const fromUnit = typeof source.fromUnit === "string" ? source.fromUnit.trim() : "";
      const toUnit = typeof source.toUnit === "string" ? source.toUnit.trim() : "";
      const factor = Number(source.factor);
      if (!fromUnit || !toUnit || !Number.isFinite(factor) || factor <= 0) return null;
      return {
        id: typeof source.id === "string" && source.id.trim() ? source.id : `product-conversion-${index}`,
        fromUnit,
        toUnit,
        factor,
      };
    })
    .filter((item): item is UnitConversion => Boolean(item));
}

export function productUnitConversions(attributes: unknown): UnitConversion[] {
  if (!attributes || typeof attributes !== "object") return [];
  const source = attributes as { unit_conversions?: unknown };
  return normalizeCustomConversions(source.unit_conversions);
}

export function withProductUnitConversion(attributes: unknown, conversion: Omit<UnitConversion, "id">) {
  const current = attributes && typeof attributes === "object" ? { ...(attributes as Record<string, unknown>) } : {};
  const conversions = productUnitConversions(current).filter(
    (item) => !(item.fromUnit === conversion.fromUnit && item.toUnit === conversion.toUnit),
  );

  return {
    ...current,
    unit_conversions: [
      ...conversions,
      {
        id: `${conversion.fromUnit}-${conversion.toUnit}-${Date.now()}`,
        fromUnit: conversion.fromUnit,
        toUnit: conversion.toUnit,
        factor: conversion.factor,
      },
    ],
  };
}

function conversionEdges(category: unknown, configs = readCategorySettings(), customConversions: UnitConversion[] = []) {
  const key = typeof category === "string" ? category : "general";
  const categoryConfig = configs.find((item) => item.key === key);
  const customEdges = [...(categoryConfig?.unitConversions || []), ...customConversions].flatMap((conversion) => {
    const fromUnit = canonicalUnit(conversion.fromUnit);
    const toUnit = canonicalUnit(conversion.toUnit);
    const factor = Number(conversion.factor);
    if (!fromUnit || !toUnit || !Number.isFinite(factor) || factor <= 0) return [];
    return [
      { fromUnit, toUnit, factor },
      { fromUnit: toUnit, toUnit: fromUnit, factor: 1 / factor },
    ];
  });

  const standardEdges = STANDARD_UNIT_CONVERSIONS.flatMap((conversion) => [
    conversion,
    { fromUnit: conversion.toUnit, toUnit: conversion.fromUnit, factor: 1 / conversion.factor },
  ]);

  return [...customEdges, ...standardEdges];
}

function findConversionFactor(fromUnit: string, toUnit: string, edges: { fromUnit: string; toUnit: string; factor: number }[]) {
  if (!fromUnit || !toUnit || fromUnit === toUnit) return 1;

  const queue = [{ unit: fromUnit, factor: 1 }];
  const visited = new Set<string>([fromUnit]);

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;

    for (const edge of edges.filter((item) => item.fromUnit === current.unit)) {
      if (visited.has(edge.toUnit)) continue;
      const nextFactor = current.factor * edge.factor;
      if (edge.toUnit === toUnit) return nextFactor;
      visited.add(edge.toUnit);
      queue.push({ unit: edge.toUnit, factor: nextFactor });
    }
  }

  return null;
}

export function conversionFactorForUnit(category: unknown, fromUnit: unknown, baseUnit: unknown, configs = readCategorySettings(), customConversions: UnitConversion[] = []) {
  const from = typeof fromUnit === "string" && fromUnit.trim() ? fromUnit.trim() : "";
  const base = typeof baseUnit === "string" && baseUnit.trim() ? baseUnit.trim() : from;
  if (!from || from === base) return 1;

  return findConversionFactor(canonicalUnit(from), canonicalUnit(base), conversionEdges(category, configs, customConversions)) ?? 1;
}

export function hasKnownConversion(category: unknown, fromUnit: unknown, baseUnit: unknown, configs = readCategorySettings(), customConversions: UnitConversion[] = []) {
  const from = typeof fromUnit === "string" && fromUnit.trim() ? fromUnit.trim() : "";
  const base = typeof baseUnit === "string" && baseUnit.trim() ? baseUnit.trim() : from;
  if (!from || from === base) return true;
  return findConversionFactor(canonicalUnit(from), canonicalUnit(base), conversionEdges(category, configs, customConversions)) !== null;
}

export function relatedStandardUnits(unit: unknown) {
  const current = canonicalUnit(unit);
  const related = STANDARD_UNIT_CONVERSIONS
    .filter((conversion) => conversion.fromUnit === current || conversion.toUnit === current)
    .flatMap((conversion) => [conversion.fromUnit, conversion.toUnit]);

  const displayNames: Record<string, string> = {
    kg: "كيلو",
    g: "جرام",
    l: "لتر",
    ml: "مللي",
    m: "متر",
    cm: "سنتي",
  };

  return [...new Set(related.map((item) => displayNames[item] || item))];
}

export function manualConversionHint(fromUnit: unknown, baseUnit: unknown) {
  const from = typeof fromUnit === "string" && fromUnit.trim() ? fromUnit.trim() : "";
  const base = typeof baseUnit === "string" && baseUnit.trim() ? baseUnit.trim() : "";
  if (!from || !base || from === base) return "";
  return `كل ${from} = كام ${base}`;
}
