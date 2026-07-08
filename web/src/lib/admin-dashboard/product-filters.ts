import type { ProductCategory, StockStatus } from "./actions";
import { getProductCategories, getStockStatuses } from "./actions";

export type AdminProductFilters = {
  search?: string;
  category?: ProductCategory;
  stockStatus?: StockStatus;
  minPrice?: number;
  maxPrice?: number;
};

export function parseAdminProductFilters(url: URL): AdminProductFilters {
  return {
    ...optionalSearchFilter(url.searchParams.get("search")),
    ...optionalFilter("category", url.searchParams.get("category"), getProductCategories()),
    ...optionalFilter("stockStatus", url.searchParams.get("stockStatus"), getStockStatuses()),
    ...optionalNumberFilter("minPrice", url.searchParams.get("minPrice")),
    ...optionalNumberFilter("maxPrice", url.searchParams.get("maxPrice")),
  };
}

export function serializeAdminProductFilters(filters: AdminProductFilters): string {
  const params = new URLSearchParams();

  if (filters.search) params.set("search", filters.search);
  if (filters.category) params.set("category", filters.category);
  if (filters.stockStatus) params.set("stockStatus", filters.stockStatus);
  if (typeof filters.minPrice === "number") params.set("minPrice", String(filters.minPrice));
  if (typeof filters.maxPrice === "number") params.set("maxPrice", String(filters.maxPrice));

  return params.toString();
}

function optionalSearchFilter(value: string | null) {
  const normalized = value?.trim().replace(/\s+/g, " ").slice(0, 80);

  return normalized ? { search: normalized } : {};
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

function optionalNumberFilter(
  key: "minPrice" | "maxPrice",
  value: string | null,
) {
  const normalized = value?.trim();
  if (!normalized) return {};

  const parsed = Number(normalized);

  return Number.isFinite(parsed) && parsed >= 0
    ? { [key]: parsed }
    : {};
}
