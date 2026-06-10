import { DEFAULT_CATEGORY_CONFIGS, categoryLabelFromSettings, readCategorySettings } from "@/lib/category-settings";

export type ProductCategory = string;

export const PRODUCT_CATEGORIES = DEFAULT_CATEGORY_CONFIGS.map((category) => ({
  key: category.key,
  label: category.label,
  shortLabel: category.shortLabel,
}));

export function normalizeProductCategory(value: unknown): ProductCategory {
  const key = typeof value === "string" && value.trim() ? value.trim() : "general";
  const settings = readCategorySettings();
  return settings.some((category) => category.key === key) ? key : "general";
}

export function productCategoryLabel(value: unknown) {
  return categoryLabelFromSettings(normalizeProductCategory(value));
}
