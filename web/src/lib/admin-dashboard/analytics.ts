import {
  fullName,
  orderBalance,
  orderPaymentTotal,
  orderTotal,
} from "./view";

import type {
  AdminContactInquiry,
  AdminCustomer,
  AdminDashboardData,
  AdminOrder,
  AdminResellerApplication,
} from "./data";

export type AnalyticsSummary = {
  grossSales: number;
  totalPaidAmount: number;
  outstandingBalance: number;
  pendingOrderPayments: number;
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

export type WeeklyProductOrderProductMetric = {
  productId: string;
  label: string;
  currentQuantity: number;
  previousQuantity: number;
  quantityDifference: number;
};

export type WeeklyProductOrderDayMetric = {
  label: string;
  shortLabel: string;
  date: string;
  previousDate: string;
  totalQuantity: number;
  previousTotalQuantity: number;
  quantityDifference: number;
  products: WeeklyProductOrderProductMetric[];
};

export type WeeklyProductOrderSeriesMetric = {
  productId: string;
  label: string;
};

export type WeeklyProductOrdersMetric = {
  days: WeeklyProductOrderDayMetric[];
  peakDay: Omit<WeeklyProductOrderDayMetric, "products">;
  productSeries: WeeklyProductOrderSeriesMetric[];
};

export type AgentSalesMetric = {
  label: string;
  orderCount: number;
  grossSales: number;
  paidAmount: number;
  earnedCommission: number;
  expectedCommission: number;
};

export type PendingCustomerBalanceMetric = {
  customerId: string;
  customerName: string;
  orderCount: number;
  unpaidBalance: number;
};

export type RecentOrderMetric = {
  id: string;
  customerName: string;
  orderStatus: AdminOrder["order_status"];
  paymentStatus: AdminOrder["payment_status"];
  grossSales: number;
  createdAt: string;
};

export type AdminAnalytics = {
  summary: AnalyticsSummary;
  salesByDay: SalesPeriodMetric[];
  salesByMonth: SalesPeriodMetric[];
  ordersByStatus: CountMetric[];
  paymentsByStatus: CountMetric[];
  topProducts: ProductSalesMetric[];
  salesByCategory: ProductSalesMetric[];
  weeklyProductOrders: WeeklyProductOrdersMetric;
  salesByAgent: AgentSalesMetric[];
  pendingCustomerBalances: PendingCustomerBalanceMetric[];
  recentOrders: RecentOrderMetric[];
  recentInquiries: AdminContactInquiry[];
  recentResellerApplications: AdminResellerApplication[];
  recentCustomers: AdminCustomer[];
};

const orderStatuses = ["pending", "processing", "closed"] as const;

const paymentStatuses = ["unpaid", "partial", "paid", "refunded"] as const;

const weekDayLabels = [
  { label: "Monday", shortLabel: "Mon" },
  { label: "Tuesday", shortLabel: "Tue" },
  { label: "Wednesday", shortLabel: "Wed" },
  { label: "Thursday", shortLabel: "Thu" },
  { label: "Friday", shortLabel: "Fri" },
  { label: "Saturday", shortLabel: "Sat" },
  { label: "Sunday", shortLabel: "Sun" },
] as const;

export function buildAdminAnalytics(
  data: AdminDashboardData,
  now = new Date(),
): AdminAnalytics {
  const agentOrders = data.orders.filter((order) => getAnalyticsAgentId(order, data) !== null);
  const currentMonth = monthIdentifier(now);
  const currentDay = dayIdentifier(now);

  return {
    summary: {
      grossSales: roundCurrency(data.orders.reduce((total, order) => total + orderTotal(order, "final_quantity"), 0)),
      totalPaidAmount: roundCurrency(data.orders.reduce((total, order) => total + orderPaymentTotal(order), 0)),
      outstandingBalance: roundCurrency(data.orders
        .filter(isOutstandingBalanceOrder)
        .reduce((total, order) => total + orderBalance(order), 0)),
      pendingOrderPayments: roundCurrency(data.orders
        .filter(hasPendingPayment)
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
    weeklyProductOrders: buildWeeklyProductOrders(data, now),
    salesByAgent: buildAgentSales(data),
    pendingCustomerBalances: buildPendingCustomerBalances(data),
    recentOrders: buildRecentOrders(data),
    recentInquiries: byNewest(data.contactInquiries).slice(0, 5),
    recentResellerApplications: byNewest(data.resellerApplications).slice(0, 5),
    recentCustomers: byNewest(data.customers).slice(0, 5),
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
    const agentId = getAnalyticsAgentId(order, data);

    if (!agentId) continue;

    const label = getAnalyticsAgentLabel(order, data, agentId)
      ?? "Unassigned agent";
    const current = metrics.get(agentId) ?? {
      label,
      orderCount: 0,
      grossSales: 0,
      paidAmount: 0,
      earnedCommission: 0,
      expectedCommission: 0,
    };

    metrics.set(agentId, {
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

function buildWeeklyProductOrders(
  data: AdminDashboardData,
  now: Date,
): WeeklyProductOrdersMetric {
  const weekStart = startOfUtcWeek(now);
  const previousWeekStart = addUtcDays(weekStart, -7);
  const currentQuantities = buildWeeklyProductQuantityMap(data, weekStart);
  const previousQuantities = buildWeeklyProductQuantityMap(data, previousWeekStart);
  const productIds = Array.from(new Set([
    ...Array.from(currentQuantities.values()).flatMap((products) => Array.from(products.keys())),
    ...Array.from(previousQuantities.values()).flatMap((products) => Array.from(products.keys())),
  ])).sort((left, right) => productName(data, left).localeCompare(productName(data, right)));

  const days = weekDayLabels.map((dayLabel, dayIndex) => {
    const date = addUtcDays(weekStart, dayIndex);
    const previousDate = addUtcDays(previousWeekStart, dayIndex);
    const dateKey = dayIdentifier(date);
    const previousDateKey = dayIdentifier(previousDate);
    const currentProducts = currentQuantities.get(dateKey) ?? new Map<string, number>();
    const previousProducts = previousQuantities.get(previousDateKey) ?? new Map<string, number>();
    const products = productIds
      .map((productId) => {
        const currentQuantity = roundQuantity(currentProducts.get(productId) ?? 0);
        const previousQuantity = roundQuantity(previousProducts.get(productId) ?? 0);

        return {
          productId,
          label: productName(data, productId),
          currentQuantity,
          previousQuantity,
          quantityDifference: roundQuantity(currentQuantity - previousQuantity),
        };
      })
      .filter((product) => product.currentQuantity > 0 || product.previousQuantity > 0);
    const totalQuantity = roundQuantity(products.reduce((total, product) => total + product.currentQuantity, 0));
    const previousTotalQuantity = roundQuantity(products.reduce((total, product) => total + product.previousQuantity, 0));

    return {
      label: dayLabel.label,
      shortLabel: dayLabel.shortLabel,
      date: dateKey,
      previousDate: previousDateKey,
      totalQuantity,
      previousTotalQuantity,
      quantityDifference: roundQuantity(totalQuantity - previousTotalQuantity),
      products,
    };
  });
  const peakDay = days.reduce((peak, day) => (
    day.totalQuantity > peak.totalQuantity ? day : peak
  ), days[0]);

  return {
    days,
    peakDay: {
      label: peakDay.label,
      shortLabel: peakDay.shortLabel,
      date: peakDay.date,
      previousDate: peakDay.previousDate,
      totalQuantity: peakDay.totalQuantity,
      previousTotalQuantity: peakDay.previousTotalQuantity,
      quantityDifference: peakDay.quantityDifference,
    },
    productSeries: productIds.map((productId) => ({
      productId,
      label: productName(data, productId),
    })),
  };
}

function buildWeeklyProductQuantityMap(
  data: AdminDashboardData,
  weekStart: Date,
): Map<string, Map<string, number>> {
  const weekEnd = addUtcDays(weekStart, 7);
  const metrics = new Map<string, Map<string, number>>();

  for (const order of data.orders) {
    const orderDate = new Date(order.created_at);

    if (orderDate < weekStart || orderDate >= weekEnd) continue;

    const dateKey = dayIdentifier(orderDate);
    const currentDay = metrics.get(dateKey) ?? new Map<string, number>();

    for (const item of order.customer_order_item) {
      currentDay.set(
        item.product_id,
        roundQuantity((currentDay.get(item.product_id) ?? 0) + item.final_quantity),
      );
    }

    metrics.set(dateKey, currentDay);
  }

  return metrics;
}

function buildPendingCustomerBalances(data: AdminDashboardData): PendingCustomerBalanceMetric[] {
  const metrics = new Map<string, PendingCustomerBalanceMetric>();

  for (const order of data.orders) {
    const balance = roundCurrency(orderBalance(order));

    if (balance <= 0 || !hasPendingPayment(order)) continue;

    const customerId = order.customer_id;
    const customer = order.customer ?? data.customers.find((item) => item.id === customerId) ?? null;
    const current = metrics.get(customerId) ?? {
      customerId,
      customerName: fullName(customer),
      orderCount: 0,
      unpaidBalance: 0,
    };

    metrics.set(customerId, {
      customerId,
      customerName: current.customerName,
      orderCount: current.orderCount + 1,
      unpaidBalance: roundCurrency(current.unpaidBalance + balance),
    });
  }

  return Array.from(metrics.values()).sort((left, right) => (
    right.unpaidBalance - left.unpaidBalance ||
    left.customerName.localeCompare(right.customerName)
  ));
}

function buildRecentOrders(data: AdminDashboardData): RecentOrderMetric[] {
  return byNewest(data.orders).slice(0, 5).map((order) => ({
    id: order.id,
    customerName: fullName(order.customer ?? data.customers.find((customer) => customer.id === order.customer_id) ?? null),
    orderStatus: order.order_status,
    paymentStatus: order.payment_status,
    grossSales: roundCurrency(orderTotal(order, "final_quantity")),
    createdAt: order.created_at,
  }));
}

function getAnalyticsAgentId(order: AdminOrder, data: AdminDashboardData): string | null {
  return order.agent_id
    ?? order.agent?.id
    ?? order.customer?.assigned_agent_id
    ?? order.customer?.assigned_agent?.id
    ?? data.customers.find((customer) => customer.id === order.customer_id)?.assigned_agent_id
    ?? null;
}

function getAnalyticsAgentLabel(
  order: AdminOrder,
  data: AdminDashboardData,
  agentId: string,
): string | null {
  return order.agent?.display_name
    ?? order.customer?.assigned_agent?.display_name
    ?? data.agents.find((agent) => agent.id === agentId)?.display_name
    ?? null;
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

function hasPendingPayment(order: AdminOrder): boolean {
  return order.payment_status !== "paid" && orderBalance(order) > 0;
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

function startOfUtcWeek(value: Date): Date {
  const start = new Date(Date.UTC(
    value.getUTCFullYear(),
    value.getUTCMonth(),
    value.getUTCDate(),
  ));
  const dayOffset = (start.getUTCDay() + 6) % 7;

  start.setUTCDate(start.getUTCDate() - dayOffset);

  return start;
}

function addUtcDays(value: Date, days: number): Date {
  const result = new Date(value);

  result.setUTCDate(result.getUTCDate() + days);

  return result;
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

function byNewest<T extends { created_at: string }>(items: T[]): T[] {
  return [...items].sort((left, right) => (
    new Date(right.created_at).getTime() - new Date(left.created_at).getTime()
  ));
}
