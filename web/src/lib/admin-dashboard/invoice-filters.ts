export const invoiceBalanceStatuses = ["unpaid", "partial", "paid"] as const;

export type AdminInvoiceBalanceStatus = (typeof invoiceBalanceStatuses)[number];

export type AdminInvoiceFilters = {
  search?: string;
  balanceStatus?: AdminInvoiceBalanceStatus;
};

export function parseAdminInvoiceFilters(url: URL): AdminInvoiceFilters {
  return {
    ...optionalSearchFilter(url.searchParams.get("search")),
    ...optionalFilter("balanceStatus", url.searchParams.get("balanceStatus"), invoiceBalanceStatuses),
  };
}

export function serializeAdminInvoiceFilters(filters: AdminInvoiceFilters): string {
  const params = new URLSearchParams();

  if (filters.search) params.set("search", filters.search);
  if (filters.balanceStatus) params.set("balanceStatus", filters.balanceStatus);

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
