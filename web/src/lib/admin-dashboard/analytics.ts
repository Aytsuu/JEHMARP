import {
  orderBalance,
  orderPaymentTotal,
  orderTotal,
} from "./view";

import type { AdminDashboardData, AdminOrder, AdminCustomer } from "./data";

export type AnalyticsSummary = {
  totalPaidAmount: number;
  outstandingBalance: number;
  orderCount: number;
  newResellerApplications: number;
  newContactInquiries: number;
  agentMonthlyEarnings: number;
  agentEarnedToday: number;
  agentExpectedCommission: number;
  assignedCustomerCount: number;
};

export type CountMetric = {
  label: string;
  count: number;
};

export type SalesPeriodMetric = {
  label: string;
  orderCount: number;
  grossSales: number;
};

export type ProductSalesMetric = {
  label: string;
  quantitySold: number;
  grossSales: number;
};

export type AgentSalesMetric = {
  label: string;
  orderCount: number;
  grossSales: number;
  paidAmount: number;
  earnedCommission: number;
  expectedCommission: number;
};

export type AdminAnalytics = {
  summary: AnalyticsSummary;
  salesByDay: SalesPeriodMetric[];
  salesByMonth: SalesPeriodMetric[];
  ordersByStatus: CountMetric[];
  paymentsByStatus: CountMetric[];
  topProducts: ProductSalesMetric[];
  salesByCategory: ProductSalesMetric[];
  salesByAgent: AgentSalesMetric[];
  recentCustomers: AdminCustomer[];
};

const orderStatuses = ["pending", "processing", "closed"] as const;

const paymentStatuses = ["unpaid", "partial", "paid", "refunded"] as const;

export function buildAdminAnalytics(
  data: AdminDashboardData,
  now = new Date(),
): AdminAnalytics {
  const agentOrders = data.orders.filter((order) => order.agent_id);
  const currentMonth = monthIdentifier(now);
  const currentDay = dayIdentifier(now);

  return {
    summary: {
      totalPaidAmount: roundCurrency(data.orders.reduce((total, order) => total + orderPaymentTotal(order), 0)),
      outstandingBalance: roundCurrency(data.orders
        .filter(isOutstandingBalanceOrder)
        .reduce((total, order) => total + orderBalance(order), 0)),
      orderCount: data.orders.length,
      newResellerApplications: data.resellerApplications.filter(
        (application) => application.application_status === "submitted",
      ).length,
      newContactInquiries: data.contactInquiries.filter((inquiry) => inquiry.inquiry_status === "new").length,
      agentMonthlyEarnings: roundCurrency(agentOrders
        .filter((order) => monthIdentifier(new Date(order.created_at)) === currentMonth)
        .reduce((total, order) => total + orderEarnedCommission(order), 0)),
      agentEarnedToday: roundCurrency(agentOrders
        .filter((order) => dayIdentifier(new Date(order.created_at)) === currentDay)
        .reduce((total, order) => total + orderEarnedCommission(order), 0)),
      agentExpectedCommission: roundCurrency(agentOrders
        .filter((order) => order.payment_status === "unpaid" || order.payment_status === "partial")
        .reduce((total, order) => total + Math.max(orderExpectedCommission(order) - orderEarnedCommission(order), 0), 0)),
      assignedCustomerCount: data.customers.filter((customer) => customer.assigned_agent_id).length,
    },
    salesByDay: Array.from(buildSalesPeriods(data.orders, "day").values()).sort(byLabel),
    salesByMonth: Array.from(buildSalesPeriods(data.orders, "month").values()).sort(byLabel),
    ordersByStatus: orderStatuses.map((status) => ({
      label: status,
      count: data.orders.filter((order) => order.order_status === status).length,
    })),
    paymentsByStatus: paymentStatuses.map((status) => ({
      label: status,
      count: data.orders.filter((order) => order.payment_status === status).length,
    })),
    topProducts: buildProductSales(data).slice(0, 5),
    salesByCategory: buildCategorySales(data),
    salesByAgent: buildAgentSales(data),
    recentCustomers: data.customers.slice(0, 5),
  };
}

function buildSalesPeriods(
  orders: AdminOrder[],
  period: "day" | "month",
): Map<string, SalesPeriodMetric> {
  return orders.reduce((metrics, order) => {
    const label = period === "day"
      ? dayIdentifier(new Date(order.created_at))
      : monthIdentifier(new Date(order.created_at));
    const current = metrics.get(label) ?? { label, orderCount: 0, grossSales: 0 };

    metrics.set(label, {
      label,
      orderCount: current.orderCount + 1,
      grossSales: roundCurrency(current.grossSales + orderTotal(order, "final_quantity")),
    });

    return metrics;
  }, new Map<string, SalesPeriodMetric>());
}

function buildProductSales(data: AdminDashboardData): ProductSalesMetric[] {
  const metrics = new Map<string, ProductSalesMetric>();

  for (const order of data.orders) {
    for (const item of order.customer_order_item) {
      const label = item.product?.name ?? productName(data, item.product_id);
      const current = metrics.get(item.product_id) ?? {
        label,
        quantitySold: 0,
        grossSales: 0,
      };

      metrics.set(item.product_id, {
        label: current.label,
        quantitySold: roundQuantity(current.quantitySold + item.final_quantity),
        grossSales: roundCurrency(current.grossSales + item.final_quantity * item.unit_price),
      });
    }
  }

  return Array.from(metrics.values()).sort((left, right) => right.grossSales - left.grossSales);
}

function buildCategorySales(data: AdminDashboardData): ProductSalesMetric[] {
  const metrics = new Map<string, ProductSalesMetric>();

  for (const order of data.orders) {
    for (const item of order.customer_order_item) {
      const label = productCategory(data, item.product_id);
      const current = metrics.get(label) ?? {
        label,
        quantitySold: 0,
        grossSales: 0,
      };

      metrics.set(label, {
        label,
        quantitySold: roundQuantity(current.quantitySold + item.final_quantity),
        grossSales: roundCurrency(current.grossSales + item.final_quantity * item.unit_price),
      });
    }
  }

  return Array.from(metrics.values()).sort((left, right) => right.grossSales - left.grossSales);
}

function buildAgentSales(data: AdminDashboardData): AgentSalesMetric[] {
  const metrics = new Map<string, AgentSalesMetric>();

  for (const order of data.orders) {
    if (!order.agent_id) continue;

    const label = order.agent?.display_name
      ?? data.agents.find((agent) => agent.id === order.agent_id)?.display_name
      ?? "Unassigned agent";
    const current = metrics.get(order.agent_id) ?? {
      label,
      orderCount: 0,
      grossSales: 0,
      paidAmount: 0,
      earnedCommission: 0,
      expectedCommission: 0,
    };

    metrics.set(order.agent_id, {
      label: current.label,
      orderCount: current.orderCount + 1,
      grossSales: roundCurrency(current.grossSales + orderTotal(order, "final_quantity")),
      paidAmount: roundCurrency(current.paidAmount + orderPaymentTotal(order)),
      earnedCommission: roundCurrency(current.earnedCommission + orderEarnedCommission(order)),
      expectedCommission: roundCurrency(current.expectedCommission + Math.max(
        orderExpectedCommission(order) - orderEarnedCommission(order),
        0,
      )),
    });
  }

  return Array.from(metrics.values()).sort((left, right) => right.grossSales - left.grossSales);
}

function orderExpectedCommission(order: AdminOrder): number {
  return roundCurrency(order.customer_order_item.reduce((total, item) => {
    if (item.agent_commission_amount <= 0) {
      return total;
    }

    return total + item.agent_commission_amount;
  }, 0));
}

function orderEarnedCommission(order: AdminOrder): number {
  const invoiceTotal = orderTotal(order, "final_quantity");
  const expectedCommission = orderExpectedCommission(order);

  if (invoiceTotal <= 0) return 0;

  return roundCurrency(expectedCommission * Math.min(orderPaymentTotal(order) / invoiceTotal, 1));
}

function isOutstandingBalanceOrder(order: AdminOrder): boolean {
  return order.order_status !== "closed" || order.payment_status !== "paid";
}

function productName(data: AdminDashboardData, productId: string): string {
  return data.products.find((product) => product.id === productId)?.name ?? "Unknown product";
}

function productCategory(data: AdminDashboardData, productId: string): string {
  return data.products.find((product) => product.id === productId)?.category ?? "uncategorized";
}

function monthIdentifier(value: Date): string {
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}`;
}

function dayIdentifier(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function roundQuantity(value: number): number {
  return Math.round((value + Number.EPSILON) * 1000) / 1000;
}

function byLabel(left: { label: string }, right: { label: string }): number {
  return left.label.localeCompare(right.label);
}
