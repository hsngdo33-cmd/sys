export function parseNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

export function priceFromPurchase(purchasePrice: unknown, discountPercent: unknown) {
  const purchase = parseNumber(purchasePrice);
  const discount = Math.min(Math.max(parseNumber(discountPercent), 0), 100);
  const saleShare = 1 - discount / 100;
  if (purchase <= 0 || saleShare <= 0) return "";
  return Number((purchase / saleShare).toFixed(2));
}

export function purchaseFromPrice(salePrice: unknown, discountPercent: unknown) {
  const sale = parseNumber(salePrice);
  const discount = Math.min(Math.max(parseNumber(discountPercent), 0), 100);
  if (sale <= 0) return "";
  return Number((sale * (1 - discount / 100)).toFixed(2));
}

export function profitPercentFromPrices(purchasePrice: unknown, salePrice: unknown) {
  const purchase = parseNumber(purchasePrice);
  const sale = parseNumber(salePrice);
  if (purchase <= 0 || sale <= 0) return "";
  return Number((((sale - purchase) / sale) * 100).toFixed(2));
}

export function formatPriceInput(value: unknown) {
  if (value === "") return "";
  const number = parseNumber(value);
  return Number.isFinite(number) ? String(number) : "";
}
