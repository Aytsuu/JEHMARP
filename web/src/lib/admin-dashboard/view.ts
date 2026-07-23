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

export function formatAgentCode(agentId: string) {
  return `Agent-${agentId.slice(0, 6).toUpperCase()}`;
}

export function formatDate(value: string | null) {
  return formatDateTime(value);
}

export function formatSalePaymentSummary(paymentCount: number) {
  const count = Number.isFinite(paymentCount) ? Math.max(0, Math.trunc(paymentCount)) : 0;

  if (count === 0) {
    return "No payments recorded";
  }

  if (count === 1) {
    return "Paid in full once";
  }

  return `Paid ${count} times`;
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

export function orderDistributionConversionAgentId(
  order: Pick<AdminOrder, "agent_id" | "customer">,
) {
  return order.agent_id ?? order.customer?.promoted_to_agent_id ?? null;
}

export function orderItemEffectiveCommissionAmount(
  item: AdminOrder["customer_order_item"][number],
  quantityKey: "partial_quantity" | "final_quantity" = "final_quantity",
) {
  const commissionAmount = Number(item.agent_commission_amount ?? 0);

  if (commissionAmount > 0) {
    return roundCurrency(commissionAmount);
  }

  return defaultProductCommissionAmount({
    product: item.product,
    quantity: item[quantityKey],
    unitPrice: item.unit_price,
  });
}

export function agentOrderItemEffectiveCommissionAmount(
  item: AdminAgentOrder["agent_order_item"][number],
) {
  const commissionAmount = Number(item.agent_commission_amount ?? 0);

  if (commissionAmount > 0) {
    return roundCurrency(commissionAmount);
  }

  return defaultProductCommissionAmount({
    product: item.product,
    quantity: item.quantity,
    unitPrice: item.product?.default_price ?? 0,
  });
}

export function isOrderCommissionEffective(
  order: Partial<Pick<AdminOrder, "agent_id" | "parent_order_id">>,
) {
  return Boolean(
    order.agent_id ||
    order.parent_order_id,
  );
}

export function orderCommissionTotal(
  order: Pick<AdminOrder, "customer_order_item"> &
    Partial<Pick<AdminOrder, "agent_id" | "parent_order_id" | "customer">>,
) {
  const useDefaultCommission = isOrderCommissionEffective(order);

  if (!useDefaultCommission) {
    return 0;
  }

  return roundCurrency(
    order.customer_order_item.reduce((total, item) => {
      return total + orderItemEffectiveCommissionAmount(item);
    }, 0),
  );
}

export function agentOrderCommissionTotal(order: Pick<AdminAgentOrder, "agent_order_item">) {
  return roundCurrency(
    order.agent_order_item.reduce((total, item) => {
      return total + agentOrderItemEffectiveCommissionAmount(item);
    }, 0),
  );
}

export function orderReceivableTotal(
  order: AdminOrder,
  quantityKey: "partial_quantity" | "final_quantity",
) {
  return roundCurrency(
    Math.max(orderTotal(order, quantityKey) - orderCommissionTotal(order), 0),
  );
}

export function agentOrderReceivableTotal(order: AdminAgentOrder) {
  return roundCurrency(
    Math.max(agentOrderTotal(order) - agentOrderCommissionTotal(order), 0),
  );
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
  return Math.max(
    roundCurrency(orderReceivableTotal(order, "final_quantity") - orderPaymentTotal(order)),
    0,
  );
}

export function agentCustomerBalance(
  orders: AdminOrder[],
  agentCustomerId: string | null | undefined,
) {
  if (!agentCustomerId) {
    return 0;
  }

  return roundCurrency(
    orders
      .filter((order) => order.customer_id === agentCustomerId)
      .reduce((total, order) => total + orderBalance(order), 0),
  );
}

export function canManageOrderCommissions(order: AdminOrder) {
  return Boolean(order.agent_id) && order.order_status === "processing";
}

export function canConvertPromotedCustomerOrderToDistribution(
  order: AdminOrder,
  promotedAgentId: string | null | undefined,
) {
  return getCustomerOrderDistributionConversionBlockReason(order, promotedAgentId) === null;
}

export function shouldShowCustomerOrderDistributionConversionCard(
  order: AdminOrder,
  promotedAgentId: string | null | undefined,
) {
  return Boolean(promotedAgentId) &&
    !order.parent_order_id;
}

export function customerOrderDistributionConversionBlockMessage(
  reason: string | null,
) {
  switch (reason) {
    case null:
      return null;
    case "Has payment":
    case "Has payment record":
      return "This order already has a payment record, so it cannot be converted.";
    case "Closed":
      return "Closed orders cannot be converted.";
    case "No items":
      return "Orders without products cannot be converted.";
    case "Already linked":
      return "This order is already linked to an agent distribution order.";
    case "Converted":
      return "This order was already converted to an agent distribution order.";
    case "Not promoted":
      return "Only orders from promoted customers can be converted.";
    default:
      return "This order cannot be converted right now.";
  }
}

export function getCustomerOrderDistributionConversionBlockReason(
  order: AdminOrder,
  promotedAgentId: string | null | undefined,
) {
  if (!promotedAgentId) {
    return "Not promoted";
  }

  if (order.parent_order_id && order.converted_at) {
    return "Converted";
  }

  if (order.parent_order_id) {
    return "Already linked";
  }

  if (order.order_status === "closed") {
    return "Closed";
  }

  if (order.payment_status !== "unpaid") {
    return "Has payment";
  }

  if (order.payment.length > 0 || (order.agent_received_payment ?? []).length > 0) {
    return "Has payment record";
  }

  if (order.customer_order_item.length === 0) {
    return "No items";
  }

  return null;
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
