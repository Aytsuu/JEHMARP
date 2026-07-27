import type { APIContext } from "astro";

import { createSupabasePublicClient } from "@/lib/supabase/public";
import { throwLoadError } from "@/lib/load-error";

export const PRODUCT_PUBLIC_COLUMNS = [
  "id",
  "name",
  "category",
  "description",
  "unit_label",
  "default_price",
  "stock_status",
  "image_path",
  "is_active",
  "created_at",
  "updated_at",
].join(", ");

const categories = ["pork", "chicken", "egg"] as const;
const stockStatuses = ["in_stock", "limited", "out_of_stock"] as const;
const sortOptions = ["name_asc", "name_desc", "price_asc", "price_desc", "newest"] as const;

export type ProductCategory = (typeof categories)[number];
export type ProductStockStatus = (typeof stockStatuses)[number];
export type ProductSort = (typeof sortOptions)[number];

export const SHOP_PAGE_SIZE = 12;

export type ShopFilters = {
  category?: ProductCategory;
  stockStatus?: ProductStockStatus;
  minPrice?: number;
  maxPrice?: number;
  sort: ProductSort;
  page: number;
  pageSize: number;
};

export type PublicProduct = {
  id: string;
  name: string;
  category: ProductCategory;
  description: string | null;
  unit_label: string;
  default_price: number;
  stock_status: ProductStockStatus;
  image_path: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type ProductPagination = {
  count: number;
  currentPage: number;
  totalPages: number;
  previousPage?: number;
  nextPage?: number;
};

export type ProductListResult = {
  products: PublicProduct[];
  pagination: ProductPagination;
};

export function parseShopFilters(url: URL): ShopFilters {
  const category = parseEnum(url.searchParams.get("category"), categories);
  const stockStatus = parseEnum(url.searchParams.get("stockStatus"), stockStatuses);
  const sort = parseEnum(url.searchParams.get("sort"), sortOptions) ?? "name_asc";
  const page = parsePositiveInteger(url.searchParams.get("page")) ?? 1;

  return {
    category,
    stockStatus,
    minPrice: parseNonNegativeNumber(url.searchParams.get("minPrice")),
    maxPrice: parseNonNegativeNumber(url.searchParams.get("maxPrice")),
    sort,
    page,
    pageSize: SHOP_PAGE_SIZE,
  };
}

export function sortPublicProducts(
  products: PublicProduct[],
  sort: ProductSort,
): PublicProduct[] {
  const sorted = [...products];

  switch (sort) {
    case "name_desc":
      return sorted.sort((left, right) => right.name.localeCompare(left.name));
    case "price_asc":
      return sorted.sort((left, right) => left.default_price - right.default_price);
    case "price_desc":
      return sorted.sort((left, right) => right.default_price - left.default_price);
    case "newest":
      return sorted.sort(
        (left, right) =>
          new Date(right.created_at).getTime() - new Date(left.created_at).getTime(),
      );
    case "name_asc":
    default:
      return sorted.sort((left, right) => left.name.localeCompare(right.name));
  }
}

export function applyShopFilters(
  products: PublicProduct[],
  filters: ShopFilters,
): ProductListResult {
  let filtered = [...products];

  if (filters.category) {
    filtered = filtered.filter((product) => product.category === filters.category);
  }

  if (filters.stockStatus) {
    filtered = filtered.filter((product) => product.stock_status === filters.stockStatus);
  }

  if (filters.minPrice !== undefined) {
    filtered = filtered.filter((product) => product.default_price >= filters.minPrice!);
  }

  if (filters.maxPrice !== undefined) {
    filtered = filtered.filter((product) => product.default_price <= filters.maxPrice!);
  }

  filtered = sortPublicProducts(filtered, filters.sort);

  const pagination = buildPagination({
    count: filtered.length,
    page: filters.page,
    pageSize: filters.pageSize,
  });
  const start = (pagination.currentPage - 1) * filters.pageSize;

  return {
    products: filtered.slice(start, start + filters.pageSize),
    pagination,
  };
}

export async function listOrderablePublicProducts(): Promise<PublicProduct[]> {
  const supabase = createSupabasePublicClient();

  const { data, error } = await supabase
    .from("product")
    .select(PRODUCT_PUBLIC_COLUMNS)
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (error) {
    throwLoadError("Unable to load orderable products");
  }

  return (data ?? []) as unknown as PublicProduct[];
}

export async function listPublicProducts(
  _context: Pick<APIContext, "cookies" | "request">,
  filters: ShopFilters,
): Promise<ProductListResult> {
  const supabase = createSupabasePublicClient();
  const from = (filters.page - 1) * filters.pageSize;
  const to = from + filters.pageSize - 1;
  const sort = getSortConfig(filters.sort);

  let query = supabase
    .from("product")
    .select(PRODUCT_PUBLIC_COLUMNS, { count: "exact" })
    .eq("is_active", true);

  if (filters.category) {
    query = query.eq("category", filters.category);
  }

  if (filters.stockStatus) {
    query = query.eq("stock_status", filters.stockStatus);
  }

  if (filters.minPrice !== undefined) {
    query = query.gte("default_price", filters.minPrice);
  }

  if (filters.maxPrice !== undefined) {
    query = query.lte("default_price", filters.maxPrice);
  }

  const { data, error, count } = await query
    .order(sort.column, { ascending: sort.ascending })
    .range(from, to);

  if (error) {
    throwLoadError("Unable to load public products");
  }

  return {
    products: (data ?? []) as unknown as PublicProduct[],
    pagination: buildPagination({
      count: count ?? 0,
      page: filters.page,
      pageSize: filters.pageSize,
    }),
  };
}

export function buildPagination({
  count,
  page,
  pageSize,
}: {
  count: number;
  page: number;
  pageSize: number;
}): ProductPagination {
  const totalPages = Math.max(Math.ceil(count / pageSize), 1);
  const currentPage = Math.min(Math.max(page, 1), totalPages);

  return {
    count,
    currentPage,
    totalPages,
    previousPage: currentPage > 1 ? currentPage - 1 : undefined,
    nextPage: currentPage < totalPages ? currentPage + 1 : undefined,
  };
}

export function buildShopUrl(
  filters: ShopFilters,
  page: number,
  basePath = "/shop",
): string {
  const params = new URLSearchParams();

  if (filters.category) params.set("category", filters.category);
  if (filters.stockStatus) params.set("stockStatus", filters.stockStatus);
  if (filters.minPrice !== undefined) params.set("minPrice", String(filters.minPrice));
  if (filters.maxPrice !== undefined) params.set("maxPrice", String(filters.maxPrice));
  if (filters.sort !== "name_asc") params.set("sort", filters.sort);
  if (page > 1) params.set("page", String(page));

  const query = params.toString();

  return query ? `${basePath}?${query}` : basePath;
}

function getSortConfig(sort: ProductSort) {
  switch (sort) {
    case "name_desc":
      return { column: "name", ascending: false };
    case "price_asc":
      return { column: "default_price", ascending: true };
    case "price_desc":
      return { column: "default_price", ascending: false };
    case "newest":
      return { column: "created_at", ascending: false };
    case "name_asc":
    default:
      return { column: "name", ascending: true };
  }
}

function parseEnum<T extends string>(value: string | null, allowed: readonly T[]): T | undefined {
  return allowed.find((item) => item === value);
}

function parseNonNegativeNumber(value: string | null): number | undefined {
  if (!value) return undefined;

  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function parsePositiveInteger(value: string | null): number | undefined {
  if (!value) return undefined;

  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}
