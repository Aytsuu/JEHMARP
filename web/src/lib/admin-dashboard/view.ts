import type { AdminAgentOrder, AdminOrder } from "./data";

export function fullName(customer: { first_name: string; last_name: string } | null) {
  return customer ? `${customer.first_name} ${customer.last_name}` : "Unassigned customer";
}

export function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
  }).format(value);
}

export function formatCompactCurrency(value: number) {
  const normalizedValue = Number.isFinite(value) ? value : 0;
  const absoluteValue = Math.abs(normalizedValue);
  const sign = normalizedValue < 0 ? "-" : "";
  const currencySymbol = new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).formatToParts(0).find((part) => part.type === "currency")?.value ?? "PHP";

  if (absoluteValue >= 1000) {
    const compactValue = new Intl.NumberFormat("en-PH", {
      maximumFractionDigits: 1,
      minimumFractionDigits: 0,
    }).format(absoluteValue / 1000);

    return `${sign}${currencySymbol}${compactValue}k`;
  }

  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(normalizedValue);
}

export function productDisplayLabel(product: { name: string; unit_label: string }) {
  return `${product.name} (${product.unit_label})`;
}

export function productAmountLabel(value: number, type: "value" | "percentage") {
  if (type === "percentage") {
    return `${formatPlainNumber(value)}%`;
  }

  return formatCurrency(value);
}

export function productAgentCommissionLabel(product: {
  agent_commission_type: "value" | "percentage";
  agent_commission_value: number;
  unit_label: string;
}) {
  return `${productAmountLabel(
    product.agent_commission_value,
    product.agent_commission_type,
  )} / ${product.unit_label}`;
}

export function defaultProductCommissionAmount(input: {
  product: {
    agent_commission_type: "value" | "percentage";
    agent_commission_value: number;
  } | null;
  quantity: number;
  unitPrice: number;
}) {
  if (!input.product) {
    return 0;
  }

  const commissionAmount = input.product.agent_commission_type === "percentage"
    ? input.unitPrice * input.quantity * input.product.agent_commission_value / 100
    : input.quantity * input.product.agent_commission_value;

  return roundCurrency(commissionAmount);
}

function formatPlainNumber(value: number) {
  return new Intl.NumberFormat("en-PH", {
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatDate(value: string | null) {
  return value ? new Intl.DateTimeFormat("en-PH", { dateStyle: "medium" }).format(new Date(value)) : "Not set";
}

export function formatDateTime(value: string | null) {
  if (!value) return "Not set";

  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Manila",
  }).format(new Date(value));
}

export function orderTotal(order: AdminOrder, quantityKey: "partial_quantity" | "final_quantity") {
  return order.customer_order_item.reduce((total, item) => {
    return total + item[quantityKey] * item.unit_price;
  }, 0);
}

export function agentOrderTotal(order: AdminAgentOrder) {
  return order.agent_order_item.reduce((total, item) => {
    return total + item.quantity * (item.product?.default_price ?? 0);
  }, 0);
}

export function agentOrderPaymentStatus(
  order: Pick<AdminAgentOrder, "customer_order">,
): AdminOrder["payment_status"] {
  if (order.customer_order.length === 0) {
    return "unpaid";
  }

  if (order.customer_order.every((customerOrder) => customerOrder.payment_status === "paid")) {
    return "paid";
  }

  if (order.customer_order.every((customerOrder) => customerOrder.payment_status === "unpaid")) {
    return "unpaid";
  }

  return "partial";
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

function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
