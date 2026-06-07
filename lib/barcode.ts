export const BARCODE_MIN_LENGTH = 4;
export const BARCODE_MAX_LENGTH = 24;

export function cleanBarcode(value: unknown) {
  return value?.toString().trim().replace(/\s+/g, "") || "";
}

export function isUuidLike(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function isPrintableBarcode(value: string) {
  return new RegExp(`^[A-Za-z0-9-]{${BARCODE_MIN_LENGTH},${BARCODE_MAX_LENGTH}}$`).test(value);
}

function ean13CheckDigit(firstTwelveDigits: string) {
  const sum = firstTwelveDigits
    .split("")
    .reduce((total, digit, index) => total + Number(digit) * (index % 2 === 0 ? 1 : 3), 0);

  return String((10 - (sum % 10)) % 10);
}

export function generateInternalBarcode(existingBarcodes: unknown[] = []) {
  const existing = new Set(existingBarcodes.map(cleanBarcode).filter(Boolean));

  for (let attempt = 0; attempt < 50; attempt += 1) {
    const randomPart =
      typeof crypto !== "undefined"
        ? Array.from(crypto.getRandomValues(new Uint8Array(10)))
            .map((value) => value % 10)
            .join("")
        : Math.floor(Math.random() * 10_000_000_000)
            .toString()
            .padStart(10, "0");

    const firstTwelveDigits = `20${randomPart}`;
    const barcode = `${firstTwelveDigits}${ean13CheckDigit(firstTwelveDigits)}`;

    if (!existing.has(barcode)) return barcode;
  }

  const fallback = Date.now().toString().slice(-12);
  return `${fallback}${ean13CheckDigit(fallback)}`;
}

export function barcodeValidationMessage(value: string) {
  if (!value) return "";
  if (isPrintableBarcode(value)) return "";
  return `الباركود لازم يكون ${BARCODE_MIN_LENGTH} إلى ${BARCODE_MAX_LENGTH} رقم/حرف إنجليزي أو شرطة، بدون مسافات.`;
}
