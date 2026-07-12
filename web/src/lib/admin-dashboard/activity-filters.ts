export type AdminActivityFilters = {
  search?: string;
};

export function parseAdminActivityFilters(url: URL): AdminActivityFilters {
  return {
    ...optionalSearchFilter(url.searchParams.get("search")),
  };
}

export function serializeAdminActivityFilters(filters: AdminActivityFilters): string {
  const params = new URLSearchParams();

  if (filters.search) params.set("search", filters.search);

  return params.toString();
}

function optionalSearchFilter(value: string | null) {
  const normalized = value?.trim().replace(/\s+/g, " ").slice(0, 80);

  return normalized ? { search: normalized } : {};
}
