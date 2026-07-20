export const defaultProductCategories = [
  "chicken",
  "pork",
  "egg",
  "frozen foods",
  "rice",
] as const;

export const defaultProductUnitLabels = [
  "kg",
  "pcs",
  "tray",
  "dozen",
  "half dozen",
  "sack",
  "half sack",
] as const;

export const productOtherOptionValue = "__other";

type ProductOptionRecord = {
  category?: string | null;
  unit_label?: string | null;
};

export function buildProductCategoryOptions(
  products: readonly ProductOptionRecord[],
) {
  return appendInferredOptions(defaultProductCategories, products, "category");
}

export function buildProductUnitOptions(products: readonly ProductOptionRecord[]) {
  return appendInferredOptions(defaultProductUnitLabels, products, "unit_label");
}

function appendInferredOptions<const T extends readonly string[]>(
  defaults: T,
  products: readonly ProductOptionRecord[],
  key: keyof ProductOptionRecord,
) {
  const normalizedDefaults = new Set(defaults.map(normalizeProductOptionValue));
  const inferred = products
    .map((product) => normalizeProductOptionValue(product[key]))
    .filter((value) => value && !normalizedDefaults.has(value));

  return [...defaults, ...Array.from(new Set(inferred))];
}

export function normalizeProductOptionValue(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}
