export type ProductCategory =
  | "general"
  | "food"
  | "drinks"
  | "clothes"
  | "electronics"
  | "cosmetics"
  | "household"
  | "tools"
  | "pharmacy"
  | "services"
  | "books"
  | "stationery";

export const PRODUCT_CATEGORIES: { key: ProductCategory; label: string; shortLabel: string }[] = [
  { key: "general", label: "منتجات عامة", shortLabel: "عام" },
  { key: "food", label: "مواد غذائية", shortLabel: "غذائي" },
  { key: "drinks", label: "مشروبات", shortLabel: "مشروبات" },
  { key: "clothes", label: "ملابس", shortLabel: "ملابس" },
  { key: "electronics", label: "إلكترونيات", shortLabel: "إلكترونيات" },
  { key: "cosmetics", label: "عناية وتجميل", shortLabel: "تجميل" },
  { key: "household", label: "منزلية", shortLabel: "منزلية" },
  { key: "tools", label: "عدد وأدوات", shortLabel: "أدوات" },
  { key: "pharmacy", label: "صيدلية", shortLabel: "صيدلية" },
  { key: "services", label: "خدمات", shortLabel: "خدمات" },
  { key: "books", label: "كتب", shortLabel: "كتب" },
  { key: "stationery", label: "أدوات مكتبية", shortLabel: "مكتبي" },
];

export function normalizeProductCategory(value: unknown): ProductCategory {
  const category = PRODUCT_CATEGORIES.find((item) => item.key === value);
  return category?.key ?? "general";
}

export function productCategoryLabel(value: unknown) {
  const category = PRODUCT_CATEGORIES.find((item) => item.key === normalizeProductCategory(value));
  return category?.label ?? "منتجات عامة";
}
