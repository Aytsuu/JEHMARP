import type { AgentDashboardData } from "./data";
import { formatCurrency, fullName } from "./view";

export type AgentActivityCategory =
  | "order"
  | "customer"
  | "payment"
  | "commission"
  | "registration";

export type AgentActivityItem = {
  id: string;
  category: AgentActivityCategory;
  title: string;
  detail: string;
  occurredAt: string;
};

export function buildAgentActivityItems(
  data: AgentDashboardData,
  limit = 100,
): AgentActivityItem[] {
  const items = [
    ...buildAgentOrderClusterActivity(data),
    ...buildCustomerOrderActivity(data),
    ...buildCustomerActivity(data),
    ...buildRegistrationLinkActivity(data),
  ];

  return items
    .sort((left, right) => timestamp(right.occurredAt) - timestamp(left.occurredAt))
    .slice(0, limit);
}

export function filterAgentActivityItems(
  items: AgentActivityItem[],
  search = "",
): AgentActivityItem[] {
  const searchTerms = search
    .toLowerCase()
    .split(/\s+/)
    .filter((term) => term.length > 0);

  if (searchTerms.length === 0) {
    return items;
  }

  return items.filter((item) => {
    const searchText = [item.title, item.detail, item.category]
      .join(" ")
      .toLowerCase();

    return searchTerms.every((term) => searchText.includes(term));
  });
}

function buildAgentOrderClusterActivity(data: AgentDashboardData): AgentActivityItem[] {
  return data.agentOrders.flatMap((agentOrder) => {
    const orderLabel = `Order-${agentOrder.id.slice(0, 6).toUpperCase()}`;
    const created: AgentActivityItem = {
      id: `agent-order-created:${agentOrder.id}`,
      category: "order",
      title: "Submitted distribution order",
      detail: `${orderLabel} with ${agentOrder.agent_order_item.length} product line${agentOrder.agent_order_item.length === 1 ? "" : "s"}`,
      occurredAt: agentOrder.created_at,
    };
    const updated = hasChanged(agentOrder.created_at, agentOrder.updated_at)
      ? [{
          id: `agent-order-updated:${agentOrder.id}`,
          category: "order" as const,
          title: "Updated distribution order",
          detail: `${orderLabel} is ${agentOrder.order_status.replace(/_/g, " ")}`,
          occurredAt: agentOrder.updated_at,
        }]
      : [];
    const commissionUpdates = agentOrder.agent_order_item.flatMap((item) => {
      if (!item.agent_commission_updated_at) {
        return [];
      }

      return [{
        id: `agent-order-commission:${item.id}`,
        category: "commission" as const,
        title: "Commission updated",
        detail: `${item.product?.name ?? "Product"} commission set to ${formatCurrency(item.agent_commission_amount)} on ${orderLabel}`,
        occurredAt: item.agent_commission_updated_at,
      }];
    });

    return [created, ...updated, ...commissionUpdates];
  });
}

function buildCustomerOrderActivity(data: AgentDashboardData): AgentActivityItem[] {
  return data.orders.flatMap((order) => {
    const orderLabel = `Order #${order.id.slice(0, 8)}`;
    const customerName = order.customer ? fullName(order.customer) : "Guest";
    const created: AgentActivityItem = {
      id: `order-created:${order.id}`,
      category: "order",
      title: "Created customer order",
      detail: `${orderLabel} for ${customerName}`,
      occurredAt: order.created_at,
    };
    const updated = hasChanged(order.created_at, order.updated_at)
      ? [{
          id: `order-updated:${order.id}`,
          category: "order" as const,
          title: "Updated customer order",
          detail: `${orderLabel} is ${order.order_status} with payment ${order.payment_status}`,
          occurredAt: order.updated_at,
        }]
      : [];
    const statusHistory = order.customer_order_status_history.map((history) => ({
      id: `order-status:${history.id}`,
      category: "order" as const,
      title: "Order status changed",
      detail: `${orderLabel} moved from ${history.from_status ?? "new"} to ${history.to_status}`,
      occurredAt: history.changed_at,
    }));
    const payments = order.payment.map((payment) => ({
      id: `order-payment:${payment.id}`,
      category: "payment" as const,
      title: "Recorded payment",
      detail: `${formatCurrency(payment.amount)} via ${payment.payment_method} on ${orderLabel}`,
      occurredAt: payment.created_at,
    }));
    const agentReceivedPayments = (order.agent_received_payment ?? []).map((payment) => ({
      id: `agent-received-payment:${payment.id}`,
      category: "payment" as const,
      title:
        payment.status === "pending_admin_confirmation"
          ? "Submitted payment for confirmation"
          : payment.status === "confirmed"
            ? "Payment confirmed by admin"
            : "Payment submission rejected",
      detail: `${formatCurrency(payment.amount)} via ${payment.payment_method} on ${orderLabel}`,
      occurredAt: payment.confirmed_at ?? payment.created_at,
    }));
    const invoices = order.invoice.map((invoice) => ({
      id: `order-invoice:${invoice.id}`,
      category: "payment" as const,
      title: "Invoice issued",
      detail: `${invoice.invoice_number} for ${orderLabel}`,
      occurredAt: invoice.issued_at ?? invoice.created_at,
    }));
    const commissionItems = order.customer_order_item.flatMap((item) => {
      if (!item.agent_commission_paid || item.agent_commission_amount <= 0) {
        return [];
      }

      return [{
        id: `order-commission-paid:${item.id}`,
        category: "commission" as const,
        title: "Commission paid",
        detail: `${formatCurrency(item.agent_commission_amount)} for ${item.product?.name ?? "product"} on ${orderLabel}`,
        occurredAt: order.updated_at,
      }];
    });

    return [
      created,
      ...updated,
      ...statusHistory,
      ...payments,
      ...agentReceivedPayments,
      ...invoices,
      ...commissionItems,
    ];
  });
}

function buildCustomerActivity(data: AgentDashboardData): AgentActivityItem[] {
  return data.customers.map((customer) => ({
    id: `customer-created:${customer.id}`,
    category: "customer",
    title: "Customer added",
    detail: `${fullName(customer)}${customer.is_reseller ? " - reseller" : ""}`,
    occurredAt: customer.created_at,
  }));
}

function buildRegistrationLinkActivity(data: AgentDashboardData): AgentActivityItem[] {
  return (data.registrationLinks ?? []).map((link) => ({
    id: `registration-link:${link.id}`,
    category: "registration",
    title: "Registration link created",
    detail: `Customer registration link expires ${new Date(link.expires_at).toLocaleDateString("en-PH")}`,
    occurredAt: link.created_at,
  }));
}

function hasChanged(createdAt: string, updatedAt: string) {
  return timestamp(updatedAt) > timestamp(createdAt);
}

function timestamp(value: string) {
  return Date.parse(value);
}
