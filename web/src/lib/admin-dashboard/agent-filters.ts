export const agentStatuses = ["active", "inactive", "suspended"] as const;

export type AdminAgentStatus = (typeof agentStatuses)[number];

export type AdminAgentFilters = {
  search?: string;
  status?: AdminAgentStatus;
};

export function parseAdminAgentFilters(url: URL): AdminAgentFilters {
  return {
    ...optionalSearchFilter(url.searchParams.get("search")),
    ...optionalFilter("status", url.searchParams.get("status"), agentStatuses),
  };
}

export function serializeAdminAgentFilters(filters: AdminAgentFilters): string {
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
  key: keyof AdminAgentFilters,
  value: string | null,
  allowedValues: readonly T[],
) {
  const normalized = value?.trim();

  return normalized && allowedValues.includes(normalized as T)
    ? { [key]: normalized as T }
    : {};
}
