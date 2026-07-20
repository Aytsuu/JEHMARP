export type StatusBadgeVariant = "success" | "warning" | "danger" | "info" | "neutral";

export type StatusBadgeKind =
  | "order"
  | "payment"
  | "inquiry"
  | "agent"
  | "reseller"
  | "stock"
  | "page"
  | "invoice"
  | "customer-type"
  | "activity"
  | "delivery";

const statusBadgeVariants: Record<StatusBadgeKind, Record<string, StatusBadgeVariant>> = {
  order: {
    pending: "warning",
    pending_customers: "warning",
    pending_order: "warning",
    processing: "info",
    closed: "success",
  },
  payment: {
    unpaid: "danger",
    partial: "warning",
    paid: "success",
    refunded: "neutral",
  },
  inquiry: {
    new: "info",
    reviewing: "warning",
    responded: "success",
    closed: "neutral",
    spam: "danger",
  },
  agent: {
    active: "success",
    inactive: "neutral",
    suspended: "danger",
  },
  reseller: {
    submitted: "info",
    contacted: "warning",
    closed: "success",
  },
  stock: {
    in_stock: "success",
    limited: "warning",
    out_of_stock: "danger",
    low_stock: "warning",
  },
  page: {
    draft: "neutral",
    published: "success",
    archived: "neutral",
  },
  invoice: {
    draft: "neutral",
    issued: "info",
    partially_paid: "warning",
    paid: "success",
  },
  "customer-type": {
    retail: "neutral",
    reseller: "info",
  },
  activity: {
    order: "info",
    customer: "neutral",
    product: "success",
    invoice: "warning",
    content: "neutral",
    inquiry: "info",
    reseller: "warning",
    payment: "warning",
    commission: "success",
    registration: "info",
  },
  delivery: {
    sent: "success",
    failed: "danger",
    pending: "warning",
  },
};

export function normalizeStatusValue(value: string): string {
  return value.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

export function resolveStatusBadgeVariant(
  kind: StatusBadgeKind,
  status: string,
): StatusBadgeVariant {
  const normalized = normalizeStatusValue(status);

  return statusBadgeVariants[kind][normalized] ?? "neutral";
}
