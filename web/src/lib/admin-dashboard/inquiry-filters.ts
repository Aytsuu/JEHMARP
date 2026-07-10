import { getInquiryStatuses } from "./actions";

export type AdminInquiryFilterStatus = ReturnType<typeof getInquiryStatuses>[number];

export type AdminInquiryFilters = {
  search?: string;
  status?: AdminInquiryFilterStatus;
};

export function parseAdminInquiryFilters(url: URL): AdminInquiryFilters {
  return {
    ...optionalSearchFilter(url.searchParams.get("search")),
    ...optionalFilter("status", url.searchParams.get("status"), getInquiryStatuses()),
  };
}

export function serializeAdminInquiryFilters(filters: AdminInquiryFilters): string {
  const params = new URLSearchParams();

  if (filters.search) params.set("search", filters.search);
  if (filters.status) params.set("status", filters.status);

  return params.toString();
}

function optionalSearchFilter(value: string | null) {
  const normalized = value?.trim().replace(/\s+/g, " ").slice(0, 80);

  return normalized ? { search: normalized } : {};
}

function optionalFilter<T extends string>(
  key: keyof AdminInquiryFilters,
  value: string | null,
  allowedValues: readonly T[],
) {
  const normalized = value?.trim();

  return normalized && allowedValues.includes(normalized as T)
    ? { [key]: normalized as T }
    : {};
}
