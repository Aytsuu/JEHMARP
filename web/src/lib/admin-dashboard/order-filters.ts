import type { OrderStatus } from "./actions";
import { getOrderStatuses } from "./actions";

export const orderSources = ["guest_shop", "agent_submitted", "admin_manual"] as const;
export const paymentStatuses = ["unpaid", "partial", "paid", "refunded"] as const;

export type AdminOrderSource = (typeof orderSources)[number];
export type AdminPaymentStatus = (typeof paymentStatuses)[number];

export type AdminOrderFilters = {
  search?: string;
  source?: AdminOrderSource;
  orderStatus?: OrderStatus;
  paymentStatus?: AdminPaymentStatus;
  minTotal?: number;
  maxTotal?: number;
};

export function parseAdminOrderFilters(url: URL): AdminOrderFilters {
  return {
    ...optionalSearchFilter(url.searchParams.get("search")),
    ...optionalFilter("source", url.searchParams.get("source"), orderSources),
    ...optionalFilter("orderStatus", url.searchParams.get("orderStatus"), getOrderStatuses()),
    ...optionalFilter("paymentStatus", url.searchParams.get("paymentStatus"), paymentStatuses),
    ...optionalNumberFilter("minTotal", url.searchParams.get("minTotal")),
    ...optionalNumberFilter("maxTotal", url.searchParams.get("maxTotal")),
  };
}

export function serializeAdminOrderFilters(filters: AdminOrderFilters): string {
  const params = new URLSearchParams();

  if (filters.search) params.set("search", filters.search);
  if (filters.source) params.set("source", filters.source);
  if (filters.orderStatus) params.set("orderStatus", filters.orderStatus);
  if (filters.paymentStatus) params.set("paymentStatus", filters.paymentStatus);
  if (typeof filters.minTotal === "number") params.set("minTotal", String(filters.minTotal));
  if (typeof filters.maxTotal === "number") params.set("maxTotal", String(filters.maxTotal));

  return params.toString();
}

function optionalSearchFilter(value: string | null) {
  const normalized = value?.trim().replace(/\s+/g, " ").slice(0, 80);

  return normalized ? { search: normalized } : {};
}

function optionalFilter<T extends string>(
  key: keyof AdminOrderFilters,
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
