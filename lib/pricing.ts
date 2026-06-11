export function parseNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

export function priceFromPurchase(purchasePrice: unknown, profitPercent: unknown) {
  const purchase = parseNumber(purchasePrice);
  const profit = parseNumber(profitPercent);
  if (purchase <= 0) return "";
  return Number((purchase * (1 + profit / 100)).toFixed(2));
}

export function purchaseFromPrice(salePrice: unknown, profitPercent: unknown) {
  const sale = parseNumber(salePrice);
  const profit = parseNumber(profitPercent);
  if (sale <= 0) return "";
  return Number((sale / (1 + profit / 100)).toFixed(2));
}

export function profitPercentFromPrices(purchasePrice: unknown, salePrice: unknown) {
  const purchase = parseNumber(purchasePrice);
  const sale = parseNumber(salePrice);
  if (purchase <= 0 || sale <= 0) return "";
  return Number((((sale - purchase) / purchase) * 100).toFixed(2));
}

export function formatPriceInput(value: unknown) {
  if (value === "") return "";
  const number = parseNumber(value);
  return Number.isFinite(number) ? String(number) : "";
}
