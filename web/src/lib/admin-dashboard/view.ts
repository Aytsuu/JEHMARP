import type { AdminOrder } from "./data";

export function fullName(customer: { first_name: string; last_name: string } | null) {
  return customer ? `${customer.first_name} ${customer.last_name}` : "Unassigned customer";
}

export function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
  }).format(value);
}

export function formatDate(value: string | null) {
  return value ? new Intl.DateTimeFormat("en-PH", { dateStyle: "medium" }).format(new Date(value)) : "Not set";
}

export function orderTotal(order: AdminOrder, quantityKey: "partial_quantity" | "final_quantity") {
  return order.customer_order_item.reduce((total, item) => {
    return total + item[quantityKey] * item.unit_price;
  }, 0);
}

export function orderPaymentTotal(order: AdminOrder) {
  return order.payment.reduce((total, payment) => total + payment.amount, 0);
}

export function orderBalance(order: AdminOrder) {
  return Math.max(orderTotal(order, "final_quantity") - orderPaymentTotal(order), 0);
}

export function canManageOrderCommissions(order: AdminOrder) {
  return Boolean(order.agent_id);
}

export function selected(value: string | null | undefined, option: string) {
  return value === option;
}

export function jsonTextareaValue(value: Record<string, unknown>) {
  return JSON.stringify(value, null, 2);
}

export function escapeTextareaValue(value: string | null) {
  return (value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
