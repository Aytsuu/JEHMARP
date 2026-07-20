import type { ProductCategory, StockStatus } from "./actions";
import { getStockStatuses } from "./actions";
import { normalizeProductOptionValue } from "./product-options";

export type AdminProductFilters = {
  search?: string;
  category?: ProductCategory;
  stockStatus?: StockStatus;
};

export function parseAdminProductFilters(url: URL): AdminProductFilters {
  return {
    ...optionalSearchFilter(url.searchParams.get("search")),
    ...optionalCategoryFilter(url.searchParams.get("category")),
    ...optionalFilter("stockStatus", url.searchParams.get("stockStatus"), getStockStatuses()),
  };
}

export function serializeAdminProductFilters(filters: AdminProductFilters): string {
  const params = new URLSearchParams();

  if (filters.search) params.set("search", filters.search);
  if (filters.category) params.set("category", filters.category);
  if (filters.stockStatus) params.set("stockStatus", filters.stockStatus);

  return params.toString();
}

function optionalSearchFilter(value: string | null) {
  const normalized = value?.trim().replace(/\s+/g, " ").slice(0, 80);

  return normalized ? { search: normalized } : {};
}

function optionalCategoryFilter(value: string | null) {
  const normalized = normalizeProductOptionValue(value).slice(0, 60);

  return normalized ? { category: normalized } : {};
}

function optionalFilter<T extends string>(
  key: keyof AdminProductFilters,
  value: string | null,
  allowedValues: readonly T[],
) {
  const normalized = value?.trim();

  return normalized && allowedValues.includes(normalized as T)
    ? { [key]: normalized as T }
    : {};
}
