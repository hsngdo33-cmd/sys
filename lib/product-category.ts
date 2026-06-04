export type ProductCategory = "books" | "stationery";

export const PRODUCT_CATEGORIES: { key: ProductCategory; label: string; shortLabel: string }[] = [
  { key: "books", label: "كتب", shortLabel: "كتب" },
  { key: "stationery", label: "أدوات مكتبية", shortLabel: "أدوات" },
];

export function normalizeProductCategory(value: unknown): ProductCategory {
  return value === "books" ? "books" : "stationery";
}

export function productCategoryLabel(value: unknown) {
  return normalizeProductCategory(value) === "books" ? "كتب" : "أدوات مكتبية";
}
