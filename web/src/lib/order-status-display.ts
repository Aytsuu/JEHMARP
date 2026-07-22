import { autoCapitalize } from "@/lib/formatters";

export function getOrderStatusBadgeLabel(status: string): string {
  return autoCapitalize(status);
}

export function getOrderStatusOptionLabel(
  currentStatus: string,
  targetStatus: string,
): string {
  if (currentStatus === "closed" && targetStatus === "processing") {
    return "Open";
  }

  return autoCapitalize(targetStatus);
}

export function isAdminOrderDetailNavOrder(
  order: { order_status: string; payment_status?: string | null },
) {
  return (
    (order.order_status === "pending" || order.order_status === "processing") &&
    order.payment_status !== "paid"
  );
}
