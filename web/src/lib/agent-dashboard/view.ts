import type { AgentDashboardData, AgentOrder, AgentPaymentSummary } from "./data";

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

export function orderTotal(order: AgentOrder, quantityKey: "partial_quantity" | "final_quantity") {
  const subtotal = order.customer_order_item.reduce((total, item) => {
    return total + item[quantityKey] * item.unit_price;
  }, 0);

  return roundCurrency(subtotal);
}

export function orderPaymentTotal(order: AgentOrder) {
  return roundCurrency(order.payment.reduce((total, payment) => total + payment.amount, 0));
}

export function orderBalance(order: AgentOrder) {
  return roundCurrency(Math.max(orderTotal(order, "final_quantity") - orderPaymentTotal(order), 0));
}

export function orderExpectedCommission(order: AgentOrder) {
  const total = order.customer_order_item.reduce((sum, item) => {
    if (item.agent_commission_status !== "set" && item.agent_commission_status !== "paid") {
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
  data: Pick<AgentDashboardData, "agent" | "customers" | "orders">,
  now = new Date(),
) {
  const agentOrders = data.orders.filter((order) => order.agent_id === data.agent.id);
  const monthKey = monthIdentifier(now);
  const dayKey = dayIdentifier(now);

  return {
    assignedCustomers: data.customers.length,
    submittedOrders: agentOrders.filter((order) => order.source === "agent_submitted").length,
    monthlyEarnings: roundCurrency(agentOrders
      .filter((order) => monthIdentifier(new Date(order.created_at)) === monthKey)
      .reduce((total, order) => total + orderEarnedCommission(order), 0)),
    earnedToday: roundCurrency(agentOrders
      .filter((order) => dayIdentifier(new Date(order.created_at)) === dayKey)
      .reduce((total, order) => total + orderEarnedCommission(order), 0)),
    expectedCommission: roundCurrency(agentOrders
      .filter((order) => order.payment_status === "unpaid" || order.payment_status === "partial")
      .reduce((total, order) => total + Math.max(orderExpectedCommission(order) - orderEarnedCommission(order), 0), 0)),
    outstandingBalance: roundCurrency(data.orders.reduce((total, order) => total + orderBalance(order), 0)),
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
    void: 0,
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
