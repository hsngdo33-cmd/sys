import { createClient } from "@supabase/supabase-js";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const DISCOUNT_PERCENT = 14;
const MULTIPLIER = 1 - DISCOUNT_PERCENT / 100;
const MIGRATION_TAG = "sale_discount_14_v1";
const APPLY = process.argv.includes("--apply");

const envText = await readFile(resolve(".env.local"), "utf8");
const env = Object.fromEntries(
  envText.split(/\r?\n/).filter((line) => /^[A-Za-z_][A-Za-z0-9_]*=/.test(line)).map((line) => {
    const separator = line.indexOf("=");
    return [line.slice(0, separator), line.slice(separator + 1).replace(/^['"]|['"]$/g, "")];
  }),
);

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const round = (value) => Number(Number(value || 0).toFixed(2));
const itemsOf = (value) => Array.isArray(value) ? value : [];
const tagged = (items) => items.length > 0 && items.every((item) => item?._pricing_model === MIGRATION_TAG);
const customerSale = (type) => ["sale", "بيع"].includes(String(type || ""));
const customerReturn = (type) => ["return", "مرتجع"].includes(String(type || ""));
const supplierReturn = (type) => String(type || "") === "supplier_return" || String(type || "").includes("مرتجع مورد");
const supplierInvoice = (type) => !supplierReturn(type) && (String(type || "").includes("فاتورة") || String(type || "").includes("توريد"));

async function allRows(table, columns) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table).select(columns).range(from, from + 999);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < 1000) return rows;
  }
}

const [products, customerTransactions, supplierTransactions, suppliers] = await Promise.all([
  allRows("products", "id,name,purchase_price,sale_price"),
  allRows("customer_transactions", "id,customer_id,type,amount,items,profit"),
  allRows("transactions", "id,supplier_id,type,amount,items"),
  allRows("suppliers", "id,balance"),
]);

const productById = new Map(products.map((product) => [String(product.id), product]));
const productUpdates = products
  .filter((product) => Number(product.sale_price) > 0)
  .map((product) => ({ ...product, nextPurchasePrice: round(Number(product.sale_price) * MULTIPLIER) }))
  .filter((product) => round(product.purchase_price) !== product.nextPurchasePrice);

const customerUpdates = customerTransactions.flatMap((transaction) => {
  const oldItems = itemsOf(transaction.items);
  if ((!customerSale(transaction.type) && !customerReturn(transaction.type)) || oldItems.length === 0 || tagged(oldItems)) return [];
  let oldCost = 0;
  let newCost = 0;
  const items = oldItems.map((item) => {
    const qty = Number(item.qty || 0);
    const unitFactor = Math.max(Number(item.unit_factor || 1), 0.001);
    const product = productById.get(String(item.id));
    const retail = Number(item.price || 0) > 0
      ? Number(item.price)
      : Number(product?.sale_price || 0) * unitFactor;
    const cost = round(retail * MULTIPLIER);
    oldCost += qty * Number(item.cost || 0);
    newCost += qty * cost;
    return { ...item, cost, _pricing_model: MIGRATION_TAG };
  });
  const oldProfit = Number(transaction.profit || 0);
  const profit = round(customerSale(transaction.type)
    ? oldProfit + oldCost - newCost
    : oldProfit + newCost - oldCost);
  return [{ id: transaction.id, items, profit, original: transaction }];
});

const supplierUpdates = supplierTransactions.flatMap((transaction) => {
  const oldItems = itemsOf(transaction.items);
  const isReturn = supplierReturn(transaction.type);
  if ((!supplierInvoice(transaction.type) && !isReturn) || oldItems.length === 0 || tagged(oldItems)) return [];
  const oldGross = oldItems.reduce((sum, item) => sum + Number(item.qty || 0) * Number(item.price || 0), 0);
  const amountFactor = oldGross > 0 ? Number(transaction.amount || 0) / oldGross : 1;
  const items = oldItems.map((item) => {
    const unitFactor = Math.max(Number(item.unit_factor || 1), 0.001);
    const product = productById.get(String(item.id));
    const salePrice = Number(item.sale_price || 0) > 0
      ? Number(item.sale_price)
      : Number(product?.sale_price || 0) * unitFactor;
    const price = salePrice > 0 ? round(salePrice * MULTIPLIER) : round(item.price);
    return {
      ...item,
      price,
      net_price: round(price * amountFactor),
      sale_price: round(salePrice),
      _pricing_model: MIGRATION_TAG,
    };
  });
  const newGross = items.reduce((sum, item) => sum + Number(item.qty || 0) * Number(item.price || 0), 0);
  const amount = round(newGross * amountFactor);
  return [{ id: transaction.id, supplier_id: transaction.supplier_id, isReturn, items, amount, original: transaction }];
});

const supplierDeltas = new Map();
for (const update of supplierUpdates) {
  if (!update.supplier_id) continue;
  const signedDelta = (update.amount - Number(update.original.amount || 0)) * (update.isReturn ? -1 : 1);
  supplierDeltas.set(String(update.supplier_id), round((supplierDeltas.get(String(update.supplier_id)) || 0) + signedDelta));
}

const summary = {
  mode: APPLY ? "apply" : "dry-run",
  discountPercent: DISCOUNT_PERCENT,
  products: productUpdates.length,
  customerInvoices: customerUpdates.length,
  supplierInvoices: supplierUpdates.filter((row) => !row.isReturn).length,
  supplierReturns: supplierUpdates.filter((row) => row.isReturn).length,
  supplierBalances: [...supplierDeltas.values()].filter((delta) => delta !== 0).length,
};
console.log(JSON.stringify(summary, null, 2));
if (APPLY) {
await mkdir(resolve("backups"), { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupPath = resolve("backups", `pricing-before-${MIGRATION_TAG}-${stamp}.json`);
await writeFile(backupPath, JSON.stringify({ products, customerTransactions, supplierTransactions, suppliers }, null, 2));

async function update(table, id, values) {
  const { error } = await supabase.from(table).update(values).eq("id", id);
  if (error) throw new Error(`${table}/${id}: ${error.message}`);
}

try {
  for (const row of productUpdates) await update("products", row.id, { purchase_price: row.nextPurchasePrice });
  for (const row of customerUpdates) await update("customer_transactions", row.id, { items: row.items, profit: row.profit });
  for (const row of supplierUpdates) await update("transactions", row.id, { items: row.items, amount: row.amount });
  for (const [supplierId, delta] of supplierDeltas) {
    if (delta === 0) continue;
    const supplier = suppliers.find((row) => String(row.id) === supplierId);
    await update("suppliers", supplierId, { balance: round(Number(supplier?.balance || 0) + delta) });
  }
} catch (error) {
  console.error(`Migration failed. Backup: ${backupPath}`);
  throw error;
}

console.log(JSON.stringify({ status: "completed", backupPath }, null, 2));
}
