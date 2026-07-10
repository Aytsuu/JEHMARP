export const invoiceBalanceStatuses = ["unpaid", "partial", "paid"] as const;

export type AdminInvoiceBalanceStatus = (typeof invoiceBalanceStatuses)[number];

export type AdminInvoiceFilters = {
  search?: string;
  balanceStatus?: AdminInvoiceBalanceStatus;
  minTotal?: number;
  maxTotal?: number;
};

export function parseAdminInvoiceFilters(url: URL): AdminInvoiceFilters {
  return {
    ...optionalSearchFilter(url.searchParams.get("search")),
    ...optionalFilter("balanceStatus", url.searchParams.get("balanceStatus"), invoiceBalanceStatuses),
    ...optionalNumberFilter("minTotal", url.searchParams.get("minTotal")),
    ...optionalNumberFilter("maxTotal", url.searchParams.get("maxTotal")),
  };
}

export function serializeAdminInvoiceFilters(filters: AdminInvoiceFilters): string {
  const params = new URLSearchParams();

  if (filters.search) params.set("search", filters.search);
  if (filters.balanceStatus) params.set("balanceStatus", filters.balanceStatus);
  if (typeof filters.minTotal === "number") params.set("minTotal", String(filters.minTotal));
  if (typeof filters.maxTotal === "number") params.set("maxTotal", String(filters.maxTotal));

  return params.toString();
}

function optionalSearchFilter(value: string | null) {
  const normalized = value?.trim().replace(/\s+/g, " ").slice(0, 80);

  return normalized ? { search: normalized } : {};
}

function optionalFilter<T extends string>(
  key: keyof AdminInvoiceFilters,
  value: string | null,
  allowedValues: readonly T[],
) {
  const normalized = value?.trim();

  return normalized && allowedValues.includes(normalized as T)
    ? { [key]: normalized as T }
    : {};
}

function optionalNumberFilter(
  key: "minTotal" | "maxTotal",
  value: string | null,
) {
  const normalized = value?.trim();
  if (!normalized) return {};

  const parsed = Number(normalized);

  return Number.isFinite(parsed) && parsed >= 0
    ? { [key]: parsed }
    : {};
}
