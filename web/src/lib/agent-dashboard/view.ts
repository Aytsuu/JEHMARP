import type { AgentDashboardData, AgentOrder, AgentOrderCluster, AgentPaymentSummary, AgentProfile } from "./data";

export type AgentMyOrderCandidate = Pick<
  AgentOrder,
  "agent_id" | "parent_order_id"
>;

export function isAgentMyOrder(
  order: AgentMyOrderCandidate,
  agent: Pick<AgentProfile, "id">,
) {
  return order.agent_id === agent.id;
}

export function isAgentMyStandaloneOrder(
  order: AgentMyOrderCandidate,
  agent: Pick<AgentProfile, "id">,
) {
  if (order.parent_order_id) {
    return false;
  }

  return isAgentMyOrder(order, agent);
}

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
  if (!value) return "Not set";

  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Manila",
  }).format(new Date(value));
}

export function formatPaymentStatus(status: AgentOrder["payment_status"]) {
  switch (status) {
    case "unpaid":
      return "Unpaid";
    case "partial":
      return "Partial";
    case "paid":
      return "Paid";
    case "refunded":
      return "Refunded";
  }
}

export function orderTotal(order: AgentOrder, quantityKey: "partial_quantity" | "final_quantity") {
  const subtotal = order.customer_order_item.reduce((total, item) => {
    return total + item[quantityKey] * item.unit_price;
  }, 0);

  return roundCurrency(subtotal);
}

export function agentOrderTotal(order: AgentOrderCluster) {
  const subtotal = order.agent_order_item.reduce((total, item) => {
    return total + item.quantity * (item.product?.default_price ?? 0);
  }, 0);

  return roundCurrency(subtotal);
}

export function agentOrderCommissionTotal(order: Pick<AgentOrderCluster, "agent_order_item">) {
  return roundCurrency(
    order.agent_order_item.reduce((total, item) => total + item.agent_commission_amount, 0),
  );
}

export function agentOrderRemittanceTotal(order: AgentOrderCluster) {
  return roundCurrency(Math.max(agentOrderTotal(order) - agentOrderCommissionTotal(order), 0));
}

export function orderRemittanceTotal(
  order: AgentOrder,
  quantityKey: "partial_quantity" | "final_quantity",
) {
  return roundCurrency(Math.max(orderTotal(order, quantityKey) - orderExpectedCommission(order), 0));
}

export function agentOrderPaymentStatus(
  order: Pick<AgentOrderCluster, "customer_order">,
): AgentOrder["payment_status"] {
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

export function orderPaymentTotal(order: AgentOrder) {
  return roundCurrency(order.payment.reduce((total, payment) => total + payment.amount, 0));
}

export function orderBalance(order: AgentOrder) {
  return roundCurrency(Math.max(orderTotal(order, "final_quantity") - orderPaymentTotal(order), 0));
}

export function orderExpectedCommission(order: AgentOrder) {
  const total = order.customer_order_item.reduce((sum, item) => {
    if (item.agent_commission_amount <= 0) {
      return sum;
    }

    return sum + item.agent_commission_amount;
  }, 0);

  return roundCurrency(total);
}

export function orderEarnedCommission(order: AgentOrder) {
  const invoiceTotal = orderTotal(order, "final_quantity");
  const expectedCommission = orderExpectedCommission(order);

  if (invoiceTotal <= 0) return 0;

  return roundCurrency(expectedCommission * Math.min(orderPaymentTotal(order) / invoiceTotal, 1));
}

export function buildAgentSummary(
  data: Pick<AgentDashboardData, "agent" | "customers" | "agentOrders" | "orders">,
  now = new Date(),
) {
  const agentOrders = data.orders.filter((order) => isAgentMyOrder(order, data.agent));
  const monthKey = monthIdentifier(now);
  const dayKey = dayIdentifier(now);

  return {
    assignedCustomers: data.customers.length,
    submittedOrders: data.agentOrders.length,
    monthlyEarnings: roundCurrency(agentOrders
      .filter((order) => monthIdentifier(new Date(order.created_at)) === monthKey)
      .reduce((total, order) => total + orderEarnedCommission(order), 0)),
    earnedToday: roundCurrency(agentOrders
      .filter((order) => dayIdentifier(new Date(order.created_at)) === dayKey)
      .reduce((total, order) => total + orderEarnedCommission(order), 0)),
    expectedCommission: roundCurrency(agentOrders
      .filter((order) => order.payment_status === "unpaid" || order.payment_status === "partial")
      .reduce((total, order) => total + Math.max(orderExpectedCommission(order) - orderEarnedCommission(order), 0), 0)),
    outstandingBalance: roundCurrency(data.orders
      .filter((order) => isAgentMyOrder(order, data.agent) && isOutstandingBalanceOrder(order))
      .reduce((total, order) => total + orderBalance(order), 0)),
  };
}

export function buildAgentPaymentSummary(orders: AgentOrder[]): AgentPaymentSummary {
  return orders.reduce<AgentPaymentSummary>((summary, order) => ({
    ...summary,
    [order.payment_status]: summary[order.payment_status] + 1,
  }), {
    unpaid: 0,
    partial: 0,
    paid: 0,
    refunded: 0,
  });
}

function monthIdentifier(value: Date) {
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}`;
}

function dayIdentifier(value: Date) {
  return value.toISOString().slice(0, 10);
}

function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function isOutstandingBalanceOrder(order: AgentOrder): boolean {
  return order.order_status !== "closed" || order.payment_status !== "paid";
}
